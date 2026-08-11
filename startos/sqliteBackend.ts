import { SubContainer, T } from '@start9labs/start-sdk'
import { rm, stat } from 'fs/promises'
import { base64 } from 'rfc4648'
import { lndConfFile } from './fileModels/lnd.conf'
import { startupFlagsJson } from './fileModels/startupFlags.json'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { manifest } from './manifest'
import { sdk } from './sdk'
import {
  lndDataDir,
  mainMounts,
  mainVolumeHost,
  selfRestUrl,
  sleep,
  watchtowerServerDir,
} from './utils'

// The subcontainer type the migration chains run LND / lndinit in.
type Sub = SubContainer<typeof manifest>

// Minimal view of the init FullProgressTracker — just the phase controls the
// migration reports through. The real tracker (handed to the init handler)
// satisfies this structurally.
type MigrationProgress = {
  addPhase(name: string): { start(): void; complete(): void }
}

// Host-side path to the main volume (the container mounts it at lndDataDir).
// LND keeps the channel-state db under data/graph/<network>/, separate from the
// wallet/macaroons under data/chain/bitcoin/<network>/. After a migration the
// old bolt .db files remain on disk alongside the new .sqlite ones (lnd #9708),
// so the *presence of channel.sqlite* is what tells us a node is on SQLite — not
// the absence of channel.db.
const graphDir = `${mainVolumeHost}/data/graph/mainnet`
const boltChannelDb = `${graphDir}/channel.db`
const sqliteChannelDb = `${graphDir}/channel.sqlite`
// Backups exclude data/graph entirely, so a backup taken before a conversion
// completed restores a bolt wallet.db with no channel.db at all — the wallet
// pair is the discriminator that still catches it (see needsSqliteMigration).
// On the SQLite backend the wallet and macaroons live in chain.sqlite (there
// is no wallet.sqlite), so its presence is what says a wallet is already
// converted.
const chainDir = `${mainVolumeHost}/data/chain/bitcoin/mainnet`
const boltWalletDb = `${chainDir}/wallet.db`
const sqliteChainDb = `${chainDir}/chain.sqlite`
// lndinit refuses to convert a wtclient.db that isn't at the latest schema; a
// pre-0.14 LND left an empty version-0 one on nodes that never used the client.
const boltWtclientDb = `${graphDir}/wtclient.db`

// lndinit's source/dest data dir — the LND data directory inside the container.
const lndinitDataDir = `${lndDataDir}/data`
// The SQLite graph db lndinit produces, as seen inside the migration
// subcontainer (main volume mounted at lndDataDir).
const channelSqliteInner = `${lndinitDataDir}/graph/mainnet/channel.sqlite`
const tlsCert = `${lndDataDir}/tls.cert`

// Both are backstops: on success the chain resolves the instant it's ready, so
// neither cap slows a healthy migration. They differ because the work does. The
// schema run only opens the db and applies channeldb migrations, so it stays
// tight — runUntilSuccess waits out the full timeout even when the daemon is
// exiting non-zero on a loop, which makes this cap the ceiling on how long a
// hard failure takes to surface.
const SCHEMA_TIMEOUT_MS = 60 * 60_000
// Copying every bucket to SQLite is bounded by db size; a multi-GB channel.db
// on a busy routing node can take hours. Sized to outlast the largest nodes.
const MIGRATE_TIMEOUT_MS = 6 * 60 * 60_000

type LndState =
  | 'NON_EXISTING'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'RPC_ACTIVE'
  | 'SERVER_ACTIVE'
  | 'WAITING_TO_START'

/**
 * Whether the bolt → SQLite conversion still needs to run. Checked by the
 * update migration (versions/current.ts) and by main's conversion phase
 * ({@link migrateOnStart}); when false, no conversion runs and the service
 * starts normally.
 *
 * Decided from startup-flags (read `.once`) and on-disk files only — never from
 * lnd.conf's db.backend, which is enforced to 'sqlite' (see lnd.conf.ts) and so
 * can't distinguish an un-migrated node:
 *   - migration already complete → no.
 *   - SQLite data present and we never finalized a conversion here → it was
 *     imported from an already-migrated node; LND uses it directly → no.
 *   - bolt channel.db present (incl. a tombstoned copy left by a resumable
 *     conversion) → yes.
 *   - bolt wallet.db present with no chain.sqlite → yes. A backup taken
 *     before a conversion completed has this shape and nothing else to key
 *     on: backups exclude data/graph, so the restored volume has no channel
 *     db of either kind, and without this branch LND would come up on the
 *     enforced SQLite backend with no wallet at all. The finalize run
 *     creates a fresh (empty) channel.db as a side effect, which the copy
 *     then converts along with the wallet.
 *   - otherwise (fresh, pre-wallet) → no.
 */
export async function needsSqliteMigration(): Promise<boolean> {
  const flags = await startupFlagsJson.read().once()
  if (flags?.dbMigrationComplete) return false
  if ((await fileExists(sqliteChannelDb)) && !flags?.dbSchemaFinalized) {
    return false
  }
  if (await fileExists(boltChannelDb)) return true
  return (await fileExists(boltWalletDb)) && !(await fileExists(sqliteChainDb))
}

/**
 * The same conversion, driven from `main` — the path for every bolt arrival
 * except an update (whose version migration converts inside the update, where
 * the progress UI is): an Initialize Wallet import, a conversion interrupted
 * and resumed across boot or rebuild, a restored pre-conversion backup. A
 * migration runs on updates only, so boot and rebuild never stall behind an
 * hours-long conversion — it lands here, after a fast boot, instead.
 *
 * Runs as the oneshot of main's conversion phase (main.ts), not as a blocking
 * step ahead of the daemon chain — so the service reaches `started` and can be
 * stopped while a multi-hour conversion is in progress. Reports through the
 * `db-migration` health check, since main has no init progress tracker; the
 * phase names are the same two the init path shows. Writing the completion flag
 * at the end is what swaps the conversion phase out for LND.
 */
export async function migrateOnStart(effects: T.Effects): Promise<void> {
  if (!(await needsSqliteMigration())) return

  const name = i18n('Database Conversion')
  const report = (message: string) =>
    sdk
      .setHealth(effects, {
        id: 'db-migration',
        name,
        result: 'loading',
        message,
      })
      .catch((e) => console.error('failed to report conversion progress', e))

  await runSqliteMigration(effects, {
    addPhase: (phase) => ({
      start: () => void report(phase),
      complete: () => {},
    }),
  })

  await sdk.setHealth(effects, {
    id: 'db-migration',
    name,
    result: 'success',
    message: i18n('Converted to the SQLite database backend.'),
  })
}

/**
 * Convert bolt → SQLite, run before the service starts — from the migrate init
 * step, or from main via {@link migrateOnStart}. Two temporary daemon chains
 * (runUntilSuccess); writes only startup-flags. Resumable, and throws on failure
 * so the caller retries until a run succeeds.
 *
 *   1. finalizeBoltSchema — run LND once on bolt so it applies pending channeldb
 *      *schema* migrations. lndinit only transfers buckets and refuses a stale
 *      schema (0.21 adds a mandatory channeldb migration; a 0.20 node is
 *      behind). Skipped on resume via dbSchemaFinalized.
 *   2. migrateBoltToSqlite — `lndinit migrate-db` copies every bucket to SQLite,
 *      tombstoning the source. Idempotent/resumable, and runs only after LND is
 *      fully down.
 *
 * Each stage is reported as a named phase — to the update progress UI, or to
 * the health check main reports through. The backend is already sqlite in lnd.conf
 * (enforced — native SQL lives on the daemon CLI, not the conf), so there is
 * nothing to write there on completion.
 */
export async function runSqliteMigration(
  effects: T.Effects,
  progress: MigrationProgress,
): Promise<void> {
  const store = await storeJson.read().once()
  if (!store?.walletPassword) {
    throw new Error(
      'Cannot migrate the LND database to SQLite: no wallet password is stored. ' +
        'Restore from a backup and retry.',
    )
  }

  const schemaPhase = progress.addPhase(i18n('Finalizing database schema'))
  const copyPhase = progress.addPhase(i18n('Copying database to SQLite'))

  const flags = await startupFlagsJson.read().once()
  if (!flags?.dbSchemaFinalized) {
    schemaPhase.start()
    await finalizeBoltSchema(effects, store.walletPassword)
    await startupFlagsJson.merge(effects, { dbSchemaFinalized: true })
  }
  // Complete even on resume (schema was finalized on an earlier attempt).
  schemaPhase.complete()

  copyPhase.start()
  const conf = await lndConfFile.read().once()
  await migrateBoltToSqlite(effects, conf?.['watchtower.active'] === true)
  copyPhase.complete()

  await scrubZombieIndex(effects)

  await startupFlagsJson.merge(effects, { dbMigrationComplete: true })
}

/**
 * Finalize the bolt channeldb schema by running LND on it once, as a temporary
 * runUntilSuccess daemon chain. LND runs with no chain backend at all, so the
 * run reaches neither bitcoind nor the node's own neutrino store — the latter
 * matters because a stale or inconsistent one would otherwise fail the run for
 * a node that has nothing to do with neutrino any more — and needs no fee
 * source. The enforced sqlite backend is overridden back to bolt on the CLI so
 * it opens the still-bolt data. A dependent oneshot unlocks the wallet and
 * waits for UNLOCKED; the SDK then tears LND down, fully — the chain owns its
 * own subcontainer — so lndinit later opens a closed db.
 *
 * When a stale wtclient.db is present, the watchtower client is also activated
 * so LND migrates it to the latest schema in this same run (it runs in
 * BuildDatabase, before unlock, so the UNLOCKED gate already covers it) —
 * otherwise lndinit's migrate-db refuses an out-of-date wtclient.db.
 */
async function finalizeBoltSchema(
  effects: T.Effects,
  walletPassword: string,
): Promise<void> {
  const schemaSub = sdk.SubContainer.of(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'lnd-schema',
  )

  const command: [string, ...string[]] = [
    'lnd',
    '--bitcoin.active',
    '--bitcoin.mainnet',
    '--bitcoin.node=nochainbackend',
    // Native SQL is not in the conf (main strips it), so bolt loads cleanly;
    // passing --db.use-native-sql=false would fail (LND bools reject `=value`).
    '--db.backend=bolt',
    // The unlock starts the server, which dials peers under nochainbackend's
    // height-1 chain view and warns on every gossip message it takes in. This
    // run needs no peers — though a node with channels still reconnects to
    // those, so this trims the noise rather than removing it.
    '--nobootstrap',
    // Migrate a stale wtclient.db up losslessly: an empty (v0) db is just
    // initialized; one from prior use keeps its session data.
    ...((await fileExists(boltWtclientDb)) ? ['--wtclient.active'] : []),
  ]

  await sdk.Daemons.of(effects)
    .addDaemon('lnd-schema', {
      subcontainer: schemaSub,
      exec: { command },
      ready: {
        display: null,
        // Ready once the wallet unlocker is serving (LOCKED) or the wallet is
        // already unlocked — the gate for the finalize oneshot to run.
        fn: async () => {
          const state = await getState(schemaSub)
          return state === 'LOCKED' || isPastUnlock(state)
            ? { result: 'success', message: null }
            : { result: 'starting', message: null }
        },
      },
      requires: [],
    })
    .addOneshot('finalize-schema', {
      subcontainer: schemaSub,
      exec: {
        fn: async (sub, abort) => {
          if (!isPastUnlock(await getState(sub))) {
            await unlockWallet(sub, walletPassword)
          }
          // Schema migrations run in BuildDatabase, before SetWalletUnlocked, so
          // observing UNLOCKED guarantees they are applied — no need to wait for
          // RPC_ACTIVE/SERVER_ACTIVE or for the node to sync.
          await waitForState(sub, isPastUnlock, abort)
          return null
        },
      },
      requires: ['lnd-schema'],
    })
    .runUntilSuccess(SCHEMA_TIMEOUT_MS)
}

/**
 * Copy every bucket from bolt to SQLite with `lndinit migrate-db`, as a
 * runUntilSuccess oneshot. LND is fully stopped by now, so lndinit opens a
 * closed db. Idempotent: lndinit tombstones each migrated db and exits 0 on a
 * re-run (skipping already-migrated parts), so a retry — or a resume that lost
 * the completion flag — re-checks and finishes cleanly; a non-zero exit is a
 * real failure and the oneshot retries.
 *
 * When the watchtower server is disabled, its bolt db is deleted first so
 * lndinit finds no tower source and skips it — otherwise lndinit copies the
 * (often huge) tower db by default, regardless of the tower-dir flag.
 */
async function migrateBoltToSqlite(
  effects: T.Effects,
  watchtowerActive: boolean,
): Promise<void> {
  if (!watchtowerActive) {
    await rm(watchtowerServerDir, { recursive: true, force: true })
  }

  const migrateSub = sdk.SubContainer.of(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'lnd-lndinit',
  )

  await sdk.Daemons.of(effects)
    .addOneshot('lndinit-migrate', {
      subcontainer: migrateSub,
      exec: { command: lndinitArgs(watchtowerActive) },
      requires: [],
    })
    .runUntilSuccess(MIGRATE_TIMEOUT_MS)
}

/**
 * Drop malformed zombie-index rows (anything not a valid 8-byte-key /
 * 66-byte-value zombie) from the freshly-copied SQLite graph, so LND's frozen
 * native-SQL graph migration — which main runs next and panics on an empty
 * zombie value on SQLite — completes. Rebuildable gossip cache; valid rows stay.
 */
async function scrubZombieIndex(effects: T.Effects): Promise<void> {
  const sql = `DELETE FROM channeldb_kv WHERE parent_id=(
      SELECT z.id FROM channeldb_kv z WHERE z.key=CAST('zombie-index' AS BLOB)
        AND z.parent_id=(SELECT e.id FROM channeldb_kv e
          WHERE e.key=CAST('graph-edge' AS BLOB) AND e.parent_id IS NULL))
      AND (length(key)<>8 OR value IS NULL OR length(value)<>66);`
  await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'zombie-scrub',
    async (sub) => {
      const res = await sub.exec(['sqlite3', channelSqliteInner, sql])
      if (res.exitCode !== 0) {
        throw new Error(
          `zombie-index scrub failed (exit ${res.exitCode}): ${res.stderr.toString()}`,
        )
      }
    },
  )
}

function lndinitArgs(watchtowerActive: boolean): [string, ...string[]] {
  const args: [string, ...string[]] = [
    'lndinit',
    '--debuglevel',
    'info',
    'migrate-db',
    '--source.backend',
    'bolt',
    '--source.bolt.data-dir',
    lndinitDataDir,
    '--dest.backend',
    'sqlite',
    '--dest.sqlite.data-dir',
    lndinitDataDir,
    '--network',
    'mainnet',
  ]
  // The watchtower *server* keeps a separate db; the wtclient db lives in the
  // chain namespace and rides along with the main transfer above.
  if (watchtowerActive) {
    const towerDir = `${lndinitDataDir}/watchtower`
    args.push(
      '--source.bolt.tower-dir',
      towerDir,
      '--dest.sqlite.tower-dir',
      towerDir,
    )
  }
  return args
}

async function unlockWallet(sub: Sub, walletPassword: string): Promise<void> {
  const res = await sub.exec([
    'curl',
    '--no-progress-meter',
    '-X',
    'POST',
    '--cacert',
    tlsCert,
    `${selfRestUrl}/v1/unlockwallet`,
    '-d',
    JSON.stringify({
      wallet_password: base64.stringify(Buffer.from(walletPassword, 'latin1')),
    }),
  ])
  const stdout = res.stdout.toString().trim()
  if (stdout !== '{}' && !stdout.includes('wallet already unlocked')) {
    throw new Error(`Failed to unlock wallet for schema migration: ${stdout}`)
  }
}

function isPastUnlock(s: LndState | null): boolean {
  return s === 'UNLOCKED' || s === 'RPC_ACTIVE' || s === 'SERVER_ACTIVE'
}

async function getState(sub: Sub): Promise<LndState | null> {
  const res = await sub.exec([
    'curl',
    '--no-progress-meter',
    '-s',
    '--cacert',
    tlsCert,
    `${selfRestUrl}/v1/state`,
  ])
  if (res.exitCode !== 0 || typeof res.stdout !== 'string') return null
  try {
    return (JSON.parse(res.stdout) as { state: LndState }).state
  } catch {
    return null
  }
}

async function waitForState(
  sub: Sub,
  predicate: (s: LndState | null) => boolean,
  abort: AbortSignal,
): Promise<void> {
  while (!abort.aborted) {
    if (predicate(await getState(sub))) return
    await sleep(2_000)
  }
  throw new Error('Migration aborted before LND reached the expected state')
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}
