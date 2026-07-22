import { SubContainer, T } from '@start9labs/start-sdk'
import { stat } from 'fs/promises'
import { base64 } from 'rfc4648'
import { lndConfFile } from './fileModels/lnd.conf'
import { startupFlagsJson } from './fileModels/startupFlags.json'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { restPort } from './interfaces'
import { manifest } from './manifest'
import { sdk } from './sdk'
import { lndDataDir, mainMounts, neutrinoBundle, sleep } from './utils'

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
const mainVolumeHost = '/media/startos/volumes/main'
const graphDir = `${mainVolumeHost}/data/graph/mainnet`
const boltChannelDb = `${graphDir}/channel.db`
const sqliteChannelDb = `${graphDir}/channel.sqlite`
// lndinit refuses to convert a wtclient.db that isn't at the latest schema; a
// pre-0.14 LND left an empty version-0 one on nodes that never used the client.
const boltWtclientDb = `${graphDir}/wtclient.db`

// lndinit's source/dest data dir — the LND data directory inside the container.
const lndinitDataDir = `${lndDataDir}/data`
const tlsCert = `${lndDataDir}/tls.cert`
const lndUrl = `https://127.0.0.1:${restPort}`

// LND reaches the wallet-unlocker (LOCKED) quickly, but applying the channeldb
// schema migrations during unlock can take several minutes on a large node.
const SCHEMA_TIMEOUT_MS = 30 * 60_000
// Copying every bucket to SQLite is bounded by db size — generous backstop.
const MIGRATE_TIMEOUT_MS = 30 * 60_000

type LndState =
  | 'NON_EXISTING'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'RPC_ACTIVE'
  | 'SERVER_ACTIVE'
  | 'WAITING_TO_START'

/**
 * Whether the bolt → SQLite conversion still needs to run. Checked by the
 * migrate init step (init/migrateSqlite.ts); when false, no conversion runs and
 * the service starts normally.
 *
 * Decided from startup-flags (read `.once`) and on-disk files only — never from
 * lnd.conf's db.backend, which is enforced to 'sqlite' (see lnd.conf.ts) and so
 * can't distinguish an un-migrated node:
 *   - migration already complete → no.
 *   - SQLite data present and we never finalized a conversion here → it was
 *     imported from an already-migrated node; LND uses it directly → no.
 *   - bolt channel.db present (incl. a tombstoned copy left by a resumable
 *     conversion) → yes.
 *   - otherwise (fresh, pre-wallet) → no.
 */
export async function needsSqliteMigration(): Promise<boolean> {
  const flags = await startupFlagsJson.read().once()
  if (flags?.dbMigrationComplete) return false
  if ((await fileExists(sqliteChannelDb)) && !flags?.dbSchemaFinalized) {
    return false
  }
  return fileExists(boltChannelDb)
}

/**
 * Convert bolt → SQLite, run from the migrate init step before the service
 * starts. Two temporary daemon chains (runUntilSuccess); writes only startup-
 * flags. Resumable, and throws on failure so init retries until a run succeeds.
 *
 *   1. finalizeBoltSchema — run LND once on bolt so it applies pending channeldb
 *      *schema* migrations. lndinit only transfers buckets and refuses a stale
 *      schema (0.21 adds a mandatory channeldb migration; a 0.20 node is
 *      behind). Skipped on resume via dbSchemaFinalized.
 *   2. migrateBoltToSqlite — `lndinit migrate-db` copies every bucket to SQLite,
 *      tombstoning the source. Idempotent/resumable, and runs only after LND is
 *      fully down.
 *
 * Each stage is reported to the init progress UI as a named phase. The backend
 * is already sqlite in lnd.conf (enforced — native SQL lives on the daemon CLI,
 * not the conf), so there is nothing to write there on completion.
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

  await startupFlagsJson.merge(effects, { dbMigrationComplete: true })
}

/**
 * Finalize the bolt channeldb schema by running LND on it once, as a temporary
 * runUntilSuccess daemon chain. LND runs on neutrino so it needs no external
 * chain backend (a bitcoind node's conf has no fee.url, so supply neutrino's —
 * the run never actually syncs), with the enforced sqlite backend overridden
 * back to bolt on the CLI so it opens the still-bolt data. A dependent oneshot
 * unlocks the wallet and waits for UNLOCKED; the SDK then tears LND down, fully
 * — the chain owns its own subcontainer — so lndinit later opens a closed db.
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
    '--bitcoin.node=neutrino',
    `--fee.url=${neutrinoBundle['fee.url']}`,
    // Native SQL is not in the conf (main strips it), so bolt loads cleanly;
    // passing --db.use-native-sql=false would fail (LND bools reject `=value`).
    '--db.backend=bolt',
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
 */
async function migrateBoltToSqlite(
  effects: T.Effects,
  watchtowerActive: boolean,
): Promise<void> {
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
    `${lndUrl}/v1/unlockwallet`,
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
    `${lndUrl}/v1/state`,
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
