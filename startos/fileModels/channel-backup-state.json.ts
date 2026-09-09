import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Written by backup-agent.sh, read by the channel-backup health check and Back
// Up Channels Now. Excluded from the StartOS backup: it is about this machine's
// targets, and a restored node has written nothing to them yet.
const backupFailureShape = z.object({
  target: z.string(),
  code: z.string(),
  detail: z.string().catch(''),
})

export type BackupFailure = z.infer<typeof backupFailureShape>

const channelBackupStateShape = z.object({
  // Actual epoch seconds when every enabled target last succeeded.
  lastSuccess: z.number().nullable().catch(null),
  failures: z.array(backupFailureShape).catch([]),
  // Minted once; a restored node starts without one and so never mistakes the
  // copies of the node it came from for its own.
  node: z.string().nullable().catch(null),
  // Per node id, the newest generation restorechanbackup accepted here.
  incorporated: z.record(z.string(), z.number()).catch({}),
  // The candidates of the restore in progress, by the hash of their bytes.
  restoreAccepted: z
    .array(
      z.object({
        dest: z.string(),
        file: z.string(),
        hash: z.string(),
        node: z.string().nullable(),
        gen: z.number().nullable(),
      }),
    )
    .catch([]),
  restoreRejected: z.array(z.object({ hash: z.string() })).catch([]),
})

export const channelBackupStateJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/.channel-backup-state.json' },
  channelBackupStateShape,
)
