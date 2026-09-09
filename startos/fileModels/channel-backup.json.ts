import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { backupFolderDefault } from '../utils'

// Included in StartOS backups so off-server copying resumes after a restore.
//
// rclone's reversible obscuring adds no protection beyond encrypted storage.
const CONTROL = /[\u0000-\u001f\u007f]/
const LINE_LENGTH = 2_048
const SECRET_LENGTH = 16_384

const line = (fallback = '', max = LINE_LENGTH) =>
  z
    .string()
    .max(max)
    .refine((value) => !CONTROL.test(value))
    .catch(fallback)

const nullableLine = (max = SECRET_LENGTH) =>
  z
    .string()
    .max(max)
    .refine((value) => !CONTROL.test(value))
    .nullable()
    .catch(null)

const relativePath = z
  .string()
  .max(LINE_LENGTH)
  .refine(
    (value) =>
      !CONTROL.test(value) &&
      !value.startsWith('/') &&
      !value.startsWith('\\') &&
      !value.split(/[\\/]/).includes('..'),
  )
  .catch(backupFolderDefault)

const oauthToken = nullableLine(64 * 1_024)
  .refine((value) => {
    if (value === null) return true
    try {
      const parsed = JSON.parse(value)
      return (
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      )
    } catch {
      return false
    }
  })
  .catch(null)

const oauthTarget = z.object({
  enabled: z.boolean().catch(false),
  clientId: line(),
  clientSecret: line('', SECRET_LENGTH),
  token: oauthToken,
  path: relativePath,
})

const nextcloudTarget = z.object({
  enabled: z.boolean().catch(false),
  url: line(),
  user: line(),
  pass: nullableLine(),
  insecureTls: z.boolean().catch(false),
  path: relativePath,
})

const keyPem = nullableLine(32_768)
  .refine(
    (value) =>
      value === null ||
      /^-----BEGIN OPENSSH PRIVATE KEY-----\\n(?:[A-Za-z0-9+/=]{1,70}\\n)+-----END OPENSSH PRIVATE KEY-----$/.test(
        value,
      ),
  )
  .catch(null)

const knownHosts = z
  .string()
  .max(64 * 1_024)
  .refine((value) =>
    value
      .split('\n')
      .every((entry) =>
        /^\S+ (ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)|sk-\S+) [A-Za-z0-9+/]+={0,2}$/.test(
          entry,
        ),
      ),
  )
  .nullable()
  .catch(null)

const fingerprints = z
  .string()
  .max(16 * 1_024)
  .refine(
    (value) =>
      !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value) &&
      value.split('\n').every((entry) => entry.length <= LINE_LENGTH),
  )
  .catch('')

const sftpTarget = z.object({
  enabled: z.boolean().catch(false),
  host: line(),
  user: line(),
  port: z
    .string()
    .regex(/^\d{1,5}$/)
    .refine((value) => Number(value) >= 1 && Number(value) <= 65_535)
    .catch('22'),
  authType: z.enum(['password', 'key']).catch('password'),
  pass: nullableLine(),
  keyPem,
  // ssh-keyscan output recorded when the target was saved; rclone verifies the
  // server against it on every connection, once the user has confirmed the
  // fingerprints it was shown.
  knownHosts,
  hostKeyFingerprints: fingerprints,
  hostKeyVerified: z.boolean().catch(false),
  path: relativePath,
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
