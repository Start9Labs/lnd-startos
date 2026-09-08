import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Written by backup-agent.sh, read by the channel-backup health check and Back
// Up Channels Now. Excluded from the StartOS backup: it is about this machine's
// targets, and a restored node has written nothing to them yet.
export const backupFailureShape = z.object({
  target: z.string(),
  code: z.string(),
  detail: z.string().catch(''),
})

export type BackupFailure = z.infer<typeof backupFailureShape>

export const channelBackupStateShape = z.object({
  // Epoch seconds of the last cycle in which every target succeeded.
  lastSuccess: z.number().nullable().catch(null),
  failures: z.array(backupFailureShape).catch([]),
  // Minted once; a restored node starts without one and so never mistakes the
  // copies of the node it came from for its own.
  node: z.string().nullable().catch(null),
  // Per node (its 8-character prefix), the newest generation of its records
  // restorechanbackup has accepted here; that node's copies at or below it
  // may be replaced.
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

export type ChannelBackupStateJson = z.infer<typeof channelBackupStateShape>

export const channelBackupStateJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/.channel-backup-state.json' },
  channelBackupStateShape,
)
