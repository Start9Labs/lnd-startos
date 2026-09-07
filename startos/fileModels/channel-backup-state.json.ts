import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Written by backup-agent.sh, read by the channel-backup health check. Excluded
// from the StartOS backup so it never travels stale into a restore.
// lastSuccess is epoch seconds.
export const channelBackupStateShape = z.object({
  lastSuccess: z.number().nullable().catch(null),
  lastError: z.string().nullable().catch(null),
})

export type ChannelBackupStateJson = z.infer<typeof channelBackupStateShape>

export const channelBackupStateJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/.channel-backup-state.json' },
  channelBackupStateShape,
)
