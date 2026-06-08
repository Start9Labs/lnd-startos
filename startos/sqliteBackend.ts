import { SubContainer, T } from '@start9labs/start-sdk'
import { SIGTERM } from '@start9labs/start-sdk/base/lib/types'
import { stat } from 'fs/promises'
import { base64 } from 'rfc4648'
import { lndConfFile } from './fileModels/lnd.conf'
import { startupFlagsJson } from './fileModels/startupFlags.json'
import { storeJson } from './fileModels/store.json'
import { restPort } from './interfaces'
import { manifest } from './manifest'
import { lndDataDir, sleep } from './utils'

// The subcontainer the migrate-sqlite oneshot runs in — main's shared lndSub.
type Sub = SubContainer<typeof manifest>

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

// lndinit's source/dest data dir — the LND data directory inside the container.
const lndinitDataDir = `${lndDataDir}/data`
const tlsCert = `${lndDataDir}/tls.cert`
const lndUrl = `https://lnd.startos:${restPort}`

type LndState =
  | 'NON_EXISTING'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'RPC_ACTIVE'
  | 'SERVER_ACTIVE'
  | 'WAITING_TO_START'

/**
 * Whether the bolt → SQLite conversion still needs to run. Decided in `main`
 * before the daemon chain is built; when false, main omits the migrate-sqlite
 * oneshot and its health check entirely (they never appear in the UI).
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

/** Has the running conversion finished? Drives the db-migration health check. */
export async function sqliteMigrationComplete(): Promise<boolean> {
  return (await startupFlagsJson.read().once())?.dbMigrationComplete === true
}

/**
 * Convert bolt → SQLite. Run as the migrate-sqlite oneshot (in lndSub, ahead of
 * the lnd daemon, which requires it). Writes only startup-flags (read `.once`) —
 * never store.json or lnd.conf — so it changes nothing main watches with
 * `.const`, and the service does not restart when it completes. Resumable;
 * throws on failure so the oneshot fails and `lnd` never starts until a retry
 * succeeds.
 *
 * The official two-stage flow, automated:
 *   1. Run LND once on bolt so it applies pending DB *schema* migrations —
 *      lndinit refuses a stale schema and only transfers buckets, it doesn't
 *      migrate them (0.21 adds mandatory channeldb migration 35; a 0.20 node is
 *      behind). Skipped on resume via dbSchemaFinalized. db.backend /
 *      db.use-native-sql are enforced to sqlite in lnd.conf, so this run
 *      overrides them back to bolt on the CLI.
 *   2. `lndinit migrate-db` transfers every bucket to SQLite, tombstoning the
 *      source. Resumable.
 *   3. Record completion. The backend is already sqlite in lnd.conf (enforced),
 *      so there is nothing to write there.
 */
export async function runSqliteMigration(
  effects: T.Effects,
  sub: Sub,
  abort: AbortSignal,
): Promise<void> {
  const store = await storeJson.read().once()
  if (!store?.walletPassword) {
    throw new Error(
      'Cannot migrate the LND database to SQLite: no wallet password is stored. ' +
        'Restore from a backup and retry.',
    )
  }
  const flags = await startupFlagsJson.read().once()

  if (!flags?.dbSchemaFinalized) {
    await finalizeBoltSchema(sub, store.walletPassword, abort)
    await startupFlagsJson.merge(effects, { dbSchemaFinalized: true })
  }

  const conf = await lndConfFile.read().once()
  await runLndinit(sub, conf?.['watchtower.active'] === true, abort)

  await startupFlagsJson.merge(effects, { dbMigrationComplete: true })
}

/**
 * Start LND on the existing (bolt) data just long enough to apply pending DB
 * schema migrations, then shut it down cleanly. Uses neutrino so it doesn't
 * depend on an external chain backend being up, and overrides the enforced
 * sqlite backend back to bolt so it operates on the still-bolt data.
 *
 * TODO(verify): confirm an existing bitcoind-backed node starts cleanly under
 * the --bitcoin.node=neutrino flag override.
 */
async function finalizeBoltSchema(
  sub: Sub,
  walletPassword: string,
  abort: AbortSignal,
): Promise<void> {
  const child = await sub.spawn([
    'lnd',
    '--bitcoin.active',
    '--bitcoin.mainnet',
    '--bitcoin.node=neutrino',
    // Override the enforced sqlite backend — the data is still bolt here.
    '--db.backend=bolt',
    '--db.use-native-sql=false',
  ])

  try {
    // Wait for the wallet unlocker to come up, then unlock.
    await waitForState(
      sub,
      (s) => s === 'LOCKED' || isPastUnlock(s),
      10 * 60_000,
      abort,
    )
    if (!isPastUnlock(await getState(sub))) {
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
          wallet_password: base64.stringify(
            Buffer.from(walletPassword, 'latin1'),
          ),
        }),
      ])
      const stdout = res.stdout.toString().trim()
      if (stdout !== '{}' && !stdout.includes('wallet already unlocked')) {
        throw new Error(
          `Failed to unlock wallet for schema migration: ${stdout}`,
        )
      }
    }

    // lnd applies the channel.db schema migrations in BuildDatabase, which runs
    // *before* the wallet is unlocked (SetWalletUnlocked) — and well before the
    // RPC server is active or any chain sync. So once we observe UNLOCKED, the
    // migrations lndinit checks for are guaranteed applied; we don't need to
    // wait for RPC_ACTIVE/SERVER_ACTIVE or for the node to sync.
    await waitForState(sub, isPastUnlock, 30 * 60_000, abort)
  } finally {
    child.kill(SIGTERM)
    await new Promise<void>((resolve) => {
      child.on('exit', () => resolve())
      // Don't hang forever if exit never fires; lndinit's tombstone check is the
      // backstop against migrating a half-open DB.
      setTimeout(resolve, 2 * 60_000)
    })
  }
}

/**
 * Run `lndinit migrate-db` to transfer all buckets from bolt to SQLite.
 * Resumable; treats an already-completed (tombstoned) source as success so a
 * retry that lost the completion flag can still finish.
 */
async function runLndinit(
  sub: Sub,
  watchtowerActive: boolean,
  abort: AbortSignal,
): Promise<void> {
  const args = [
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
  // chain namespace and is covered by the main transfer above.
  if (watchtowerActive) {
    const towerDir = `${lndinitDataDir}/watchtower`
    args.push(
      '--source.bolt.tower-dir',
      towerDir,
      '--dest.sqlite.tower-dir',
      towerDir,
    )
  }

  const res = await sub.exec(args, undefined, undefined, {
    abort: abort.reason,
    signal: abort,
  })
  if (res.exitCode === 0) return

  // TODO(verify): confirm the exact message/exit code lndinit emits when the
  // source is already tombstoned / the migration already completed, and match
  // on that here rather than this best-effort substring.
  const out = `${res.stdout?.toString() ?? ''}${res.stderr?.toString() ?? ''}`
  if (/tombstone|already migrated|already been migrated/i.test(out)) return

  throw new Error(`lndinit migrate-db failed (exit ${res.exitCode}): ${out}`)
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
  timeoutMs: number,
  abort: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (abort.aborted) throw new Error('Migration aborted before LND was ready')
    if (predicate(await getState(sub))) return
    await sleep(2_000)
  }
  throw new Error('Timed out waiting for LND to reach the expected state')
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}
