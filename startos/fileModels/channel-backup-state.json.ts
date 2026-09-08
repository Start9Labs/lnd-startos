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
  // The generation this node last wrote to each destination.
  shipped: z.record(z.string(), z.number()).catch({}),
  // The newest generation restorechanbackup accepted, or the backup's own
  // watermark when it used the backup's copy.
  incorporated: z.number().catch(0),
  // Candidates LND refused, as destination:generation:node.
  restoreRejected: z.array(z.string()).catch([]),
})

export type ChannelBackupStateJson = z.infer<typeof channelBackupStateShape>

export const channelBackupStateJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/.channel-backup-state.json' },
  channelBackupStateShape,
)
