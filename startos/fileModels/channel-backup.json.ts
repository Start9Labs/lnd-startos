import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { backupFolderDefault } from '../utils'

// Where the continuous channel backup ships, and the credentials to get there.
// Included in the StartOS backup on purpose: it is what the restore needs to
// find the current channel.backup again.
//
// Credentials are stored verbatim. backup-agent.sh obscures them with
// `rclone obscure` at the moment it writes rclone.conf, so nothing here has to
// reproduce that format. Obscuring uses a fixed, public key and protects
// nothing on its own; what protects these is the encrypted volume and the
// encrypted backup.
//
// channel.backup is itself encrypted by LND under a key derived from the wallet
// seed, so a target only ever holds ciphertext, and no client-side encryption
// layer is added here.
const oauthTarget = z.object({
  enabled: z.boolean().catch(false),
  clientId: z.string().catch(''),
  clientSecret: z.string().catch(''),
  token: z.string().nullable().catch(null),
  path: z.string().catch(backupFolderDefault),
})

const nextcloudTarget = z.object({
  enabled: z.boolean().catch(false),
  url: z.string().catch(''),
  user: z.string().catch(''),
  pass: z.string().nullable().catch(null),
  insecureTls: z.boolean().catch(false),
  path: z.string().catch(backupFolderDefault),
})

const sftpTarget = z.object({
  enabled: z.boolean().catch(false),
  host: z.string().catch(''),
  user: z.string().catch(''),
  port: z.string().catch('22'),
  authType: z.enum(['password', 'key']).catch('password'),
  pass: z.string().nullable().catch(null),
  keyPem: z.string().nullable().catch(null),
  // ssh-keyscan output recorded when the target was saved; rclone verifies the
  // server against it on every connection.
  knownHosts: z.string().nullable().catch(null),
  path: z.string().catch(backupFolderDefault),
})

export const channelBackupShape = z.object({
  gdrive: oauthTarget.nullable().catch(null),
  dropbox: oauthTarget.nullable().catch(null),
  nextcloud: nextcloudTarget.nullable().catch(null),
  sftp: sftpTarget.nullable().catch(null),
})

export type ChannelBackupJson = z.infer<typeof channelBackupShape>

export const channelBackupJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/channel-backup.json' },
  channelBackupShape,
)
