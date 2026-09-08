import { FileHelper, T, z } from '@start9labs/start-sdk'
import { mkdir, rmdir, stat } from 'node:fs/promises'
import { sdk } from '../sdk'
import { mainVolumeHost, sleep } from '../utils'

// A migration scheduled by the Initialize Wallet action: set once the action has
// verified it can reach the origin, consumed by main's import phase, and cleared
// when the import completes. It carries the origin's credentials until then,
// because nothing else persists them.
const importPending = z
  .union([
    z.object({
      source: z.enum(['umbrel', 'mynode', 'startos']),
      host: z.string(),
      password: z.string(),
    }),
    z.literal(false),
  ])
  .catch(false)

/** A scheduled import, as main's import phase receives it. */
export type ImportPending = Exclude<z.infer<typeof importPending>, false>

// A one-time request an action arms and one lifecycle of main consumes. The
// string is the request's id, so the lifecycle that consumed it clears only
// that request and never one armed after it started; `true` is a request from
// before ids existed.
const request = z.union([z.string(), z.boolean()]).catch(false)

// One-time startup flags: flipped by an action (or the restore hook), consumed
// by main at startup, then flipped back once the corresponding startup work is
// done. Kept OUT of store.json on purpose — store.json is read in main with a
// `.const` watch that restarts main on any change, so clearing a flag there
// would loop / force a needless restart (this is exactly the bug that made the
// Reset Wallet Transactions action re-run on every restart). No read of this
// file can restart main: the consumable flags are read `.once` in main's body,
// and the two the daemon-chain reconciler watches with `.const` (importPending,
// dbMigrationComplete) re-run only the chain builder. Any restart is driven
// explicitly by the action via sdk.restart.
const shape = z.object({
  resetWalletTransactions: request,
  restore: z.boolean().catch(false),
  notified: z.boolean().catch(false),
  // Armed by the Revoke Macaroons action. Consumed by the unlock-wallet
  // oneshot, which unlocks via /v1/changepassword with new_macaroon_root_key
  // instead of /v1/unlockwallet — the only supported way to rotate the root
  // key, which is what actually revokes (see the action).
  rotateMacaroonRootKey: request,
  // bolt → SQLite migration progress (persistent, like `notified`).
  //   dbSchemaFinalized — LND has been run on bolt to apply pending schema
  //     migrations, so a resumed conversion skips that step.
  //   dbMigrationComplete — the full conversion finished; once set, the
  //     update migration no longer runs a conversion, and main's reconciler
  //     swaps the conversion phase out for LND.
  // Kept here so writing them never trips main's store/lnd.conf `.const`
  // watches — the conversion completes with no restart.
  dbSchemaFinalized: z.boolean().catch(false),
  dbMigrationComplete: z.boolean().catch(false),
  importPending,
})

export type StartupFlags = z.infer<typeof shape>

export const startupFlagsJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/startup-flags.json',
  },
  shape,
)

const lockDir = `${mainVolumeHost}/.startup-flags.lock`

/**
 * The one way to write this file. FileHelper.merge is a read-modify-write, so
 * two writers racing would lose one update; main and the actions all
 * serialize here. `change` sees the current flags and returns the patch to
 * apply, or null to leave them alone.
 */
export async function updateStartupFlags(
  effects: T.Effects,
  change: (current: StartupFlags) => Partial<StartupFlags> | null,
): Promise<void> {
  const deadline = Date.now() + 10_000
  while (true) {
    try {
      await mkdir(lockDir)
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      // A holder that died left the directory behind; no write takes 5 s.
      const held = await stat(lockDir).then(
        (s) => Date.now() - s.mtimeMs,
        () => 0,
      )
      if (held > 5_000) {
        await rmdir(lockDir).catch(() => {})
        continue
      }
      if (Date.now() > deadline) {
        throw new Error('startup-flags.json stayed locked')
      }
      await sleep(25)
    }
  }
  try {
    const current = await startupFlagsJson.read().once()
    const patch = change(current ?? shape.parse({}))
    if (patch) await startupFlagsJson.merge(effects, patch)
  } finally {
    await rmdir(lockDir).catch(() => {})
  }
}
