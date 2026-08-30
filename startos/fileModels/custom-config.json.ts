import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

/**
 * The channel-autobackup configuration, out of band from lnd.conf. It holds the
 * rclone config (base64), the selected/enabled remotes, the email settings, and
 * the master on/off switch. Read by the `channel-backup-watcher` daemon on every
 * channel.backup change.
 */
export const customConfigShape = z.object({
  rcloneConfig: z.string().nullable().catch(null),
  selectedRcloneRemotes: z.array(z.string()).nullable().catch(null),
  enabledRemotes: z.array(z.string()).nullable().catch(null),
  channelAutoBackupEnabled: z.boolean().catch(false),
  backupStartupGracePeriod: z.boolean().catch(false),
  emailBackup: z
    .object({
      from: z.string(),
      to: z.string(),
      smtp_server: z.string(),
      smtp_port: z.number(),
      smtp_user: z.string(),
      smtp_pass: z.string(),
      body: z.string().optional().catch(''),
    })
    .nullable()
    .catch(null),
  emailEnabled: z.boolean().catch(false),
  // Runtime wallet state backing the Wallet - Manual Unlock action's
  // enabled/disabled. Set true after a manual unlock, reset false whenever the
  // unlock-wallet oneshot runs under auto-unlock-off (i.e. every LND start).
  // Kept here, not store.json (a store write restarts LND), because nothing
  // watches custom-config.json with `.const` — except this action's metadata.
  walletUnlocked: z.boolean().catch(false),
})

export type CustomConfigJson = z.infer<typeof customConfigShape>

export const customConfigJson = FileHelper.json<CustomConfigJson>(
  {
    base: sdk.volumes.main,
    subpath: '/custom-config.json',
  },
  customConfigShape,
)
