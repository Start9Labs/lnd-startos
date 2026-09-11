import { T } from '@start9labs/start-sdk'
import type { IncomingMessage } from 'http'
import * as https from 'https'
import { URLSearchParams } from 'url'
import { channelBackupProviderName } from '../channelBackupStatus'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  backupFolderDefault,
  literal,
  mainMounts,
  nextcloudDavUrl,
} from '../utils'

const VALID_PROVIDERS = ['gdrive', 'dropbox', 'nextcloud', 'sftp'] as const
const MAX_FIELD_LENGTH = 2_048
const MAX_SECRET_LENGTH = 16_384
const MAX_KEY_LENGTH = 32_768
const MAX_OAUTH_RESPONSE_BYTES = 64 * 1_024

// rclone.conf is line-based, so a line break in any value would start a new
// key or section.
const CONTROL = /[\u0000-\u001f\u007f]/

function checkedLength(value: string, label: string, max: number): string {
  if (value.length > max) {
    throw new Error(
      i18n('${label}: must be at most ${max} characters.', { label, max }),
    )
  }
  return value
}

function clean(value: unknown, label: string, max = MAX_FIELD_LENGTH): string {
  const s = typeof value === 'string' ? value.trim() : ''
  if (CONTROL.test(s)) {
    throw new Error(
      i18n('${label}: line breaks and control characters are not allowed.', {
        label,
      }),
    )
  }
  return checkedLength(s, label, max)
}

// Secrets keep every byte the user typed.
function secret(value: unknown, label: string): string {
  const s = typeof value === 'string' ? value : ''
  if (CONTROL.test(s)) {
    throw new Error(
      i18n('${label}: line breaks and control characters are not allowed.', {
        label,
      }),
    )
  }
  return checkedLength(s, label, MAX_SECRET_LENGTH)
}

// A folder under the target's root: never an absolute path, never a step up.
function folder(value: unknown, label: string, previous: string): string {
  const path = clean(value, label) || previous || backupFolderDefault
  if (
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.split(/[\\/]/).some((segment) => segment === '..')
  ) {
    throw new Error(
      i18n(
        '${label}: the folder path must be relative, without a leading slash or ".." segments.',
        { label },
      ),
    )
  }
  return path
}

function hostOf(addr: string): string {
  let host = addr.toLowerCase()
  try {
    host = new URL(host.includes('://') ? host : `sftp://${host}`).hostname
  } catch {}
  return host.replace(/^\[|\]$/g, '')
}

// A copy on this same server dies with it. Only a loopback address can be
// recognized as this server, so the user is asked to pick another machine and
// the check catches the plain mistake. A Tor target needs a proxy the agent has
// no route to.
function rejectLocalOrOnion(addr: string, label: string): void {
  const host = hostOf(addr)
  if (host.endsWith('.onion'))
    throw new Error(
      i18n(
        '${label}: Tor .onion targets are not supported yet. Use a clearnet address.',
        { label },
      ),
    )
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '::' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('::ffff:127.') ||
    /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(host)
  )
    throw new Error(
      i18n(
        '${label}: that address points at this server. Point it at a different machine.',
        { label },
      ),
    )
}

function generateGoogleAuthUrl(clientId: string): string {
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'http://localhost',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
  }).toString()}`
}

// Dropbox displays the code on screen rather than redirecting, so no
// redirect_uri is sent here or in the exchange below. token_access_type=offline
// is what makes Dropbox return a refresh token.
function generateDropboxAuthUrl(clientId: string): string {
  return `https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    token_access_type: 'offline',
  }).toString()}`
}

// Accept a full redirect URL, a bare `code=…` fragment, or the raw code. Codes
// copied out of a redirect arrive percent-encoded.
function extractAuthCode(raw: string): string {
  const code = (raw || '').trim()
  const m = code.match(/[?&]code=([^&\s]+)/) || code.match(/^code=([^&\s]+)/)
  if (!m) return code
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function httpsPostJson(
  hostname: string,
  path: string,
  body: string,
  headers: Record<string, string>,
): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false
    let response: IncomingMessage | undefined
    let req: ReturnType<typeof https.request>
    const finish = (error: Error | null, value?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      if (error) reject(error)
      else resolve(value)
    }
    const deadline = setTimeout(() => {
      const error = new Error(`${hostname} did not answer within 30 s`)
      response?.destroy(error)
      req.destroy(error)
      finish(error)
    }, 30_000)
    req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
      },
      (res) => {
        response = res
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_OAUTH_RESPONSE_BYTES) {
            const error = new Error(`${hostname} returned too much data`)
            res.destroy(error)
            req.destroy(error)
            finish(error)
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          if (settled) return
          const data = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode !== 200) {
            finish(
              new Error(`${hostname} responded ${res.statusCode}: ${data}`),
            )
            return
          }
          try {
            finish(null, JSON.parse(data))
          } catch {
            finish(
              new Error(`Could not parse response from ${hostname}: ${data}`),
            )
          }
        })
        res.on('error', (error) => finish(error))
      },
    )
    req.on('error', (error) => finish(error))
    req.write(body)
    req.end()
  })
}

// Exchange a fresh authorization code for the rclone token JSON that holds the
// refresh token.
async function exchangeGoogleCode(
  clientId: string,
  clientSecret: string,
  authCodeRaw: string,
): Promise<string> {
  const r = await httpsPostJson(
    'oauth2.googleapis.com',
    '/token',
    new URLSearchParams({
      code: extractAuthCode(authCodeRaw),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'http://localhost',
      grant_type: 'authorization_code',
    }).toString(),
    { 'Content-Type': 'application/x-www-form-urlencoded' },
  )
  if (!r.access_token || !r.refresh_token)
    throw new Error(
      i18n(
        'Google did not return valid tokens. Re-copy the full authorization code.',
      ),
    )
  return JSON.stringify({
    access_token: r.access_token,
    token_type: r.token_type || 'Bearer',
    refresh_token: r.refresh_token,
    expiry: new Date(Date.now() + r.expires_in * 1000).toISOString(),
  })
}

async function exchangeDropboxCode(
  clientId: string,
  clientSecret: string,
  authCodeRaw: string,
): Promise<string> {
  const r = await httpsPostJson(
    'api.dropboxapi.com',
    '/oauth2/token',
    new URLSearchParams({
      code: extractAuthCode(authCodeRaw),
      grant_type: 'authorization_code',
    }).toString(),
    {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  )
  if (!r.refresh_token)
    throw new Error(
      i18n(
        'Dropbox did not return a refresh token. The code may have expired or already been used. Approve the app again and paste the fresh code it shows.',
      ),
    )
  return JSON.stringify({
    access_token: r.access_token,
    token_type: 'bearer',
    refresh_token: r.refresh_token,
    expiry: new Date(Date.now() + r.expires_in * 1000).toISOString(),
  })
}

// rclone refreshes the expired access token on first use, so only the refresh
// token has to be real.
function tokenFromRefresh(refreshToken: string, google: boolean): string {
  return JSON.stringify({
    access_token: 'DUMMY',
    token_type: google ? 'Bearer' : 'bearer',
    refresh_token: refreshToken,
    expiry: '2020-01-01T00:00:00Z',
  })
}

function opensshKeyIsEncrypted(body: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 !== 0)
    throw new Error('not base64')
  const raw = Buffer.from(body, 'base64')
  const magic = Buffer.from('openssh-key-v1\0', 'latin1')
  if (
    raw.length < magic.length + 4 ||
    !raw.subarray(0, magic.length).equals(magic)
  )
    throw new Error('not openssh-key-v1')
  const length = raw.readUInt32BE(magic.length)
  const start = magic.length + 4
  if (length === 0 || start + length > raw.length)
    throw new Error('truncated cipher name')
  return raw.subarray(start, start + length).toString() !== 'none'
}

async function normalizeKeyPem(
  effects: T.Effects,
  keyInput: string,
): Promise<string> {
  checkedLength(keyInput, 'SFTP', MAX_KEY_LENGTH)
  const begin = '-----BEGIN OPENSSH PRIVATE KEY-----'
  const end = '-----END OPENSSH PRIVATE KEY-----'
  const norm = keyInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const match = norm.match(
    /^-----BEGIN OPENSSH PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)\n-----END OPENSSH PRIVATE KEY-----$/,
  )
  if (!match)
    throw new Error(i18n('SFTP: that is not a valid OpenSSH private key.'))
  const body = match[1].replace(/\n/g, '')
  let encrypted: boolean
  try {
    encrypted = opensshKeyIsEncrypted(body)
  } catch {
    throw new Error(i18n('SFTP: that is not a valid OpenSSH private key.'))
  }
  if (encrypted)
    throw new Error(
      i18n(
        'SFTP: that key is protected by a passphrase, which rclone cannot enter. Export an unencrypted key for this purpose.',
      ),
    )
  const out = [begin]
  for (let i = 0; i < body.length; i += 70) out.push(body.substring(i, i + 70))
  out.push(end)
  const normalized = out.join('\n')
  const stored = checkedLength(
    normalized.replace(/\n/g, '\\n'),
    'SFTP',
    MAX_KEY_LENGTH,
  )
  const valid = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'sftp-key-validate',
    async (sub) =>
      sub.exec(
        [
          'sh',
          '-c',
          'umask 077; key=$(mktemp); trap \'rm -f "$key"\' EXIT; cat > "$key"; ssh-keygen -y -f "$key" >/dev/null',
        ],
        { input: `${normalized}\n` },
        10_000,
      ),
  )
  if (valid.exitCode !== 0)
    throw new Error(i18n('SFTP: that is not a valid OpenSSH private key.'))
  return stored
}

// Record the server's host keys. They are used only once the user has
// confirmed the fingerprints returned here.
async function scanHostKeys(
  effects: T.Effects,
  host: string,
  port: string,
): Promise<{ knownHosts: string; fingerprints: string }> {
  return sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'sftp-keyscan',
    async (sub) => {
      const scan = await sub.exec(
        ['ssh-keyscan', '-T', '10', '-p', port, host],
        {},
        40_000,
      )
      // Only whole key lines from a scan that finished: a cut-off run leaves
      // partial lines that ssh-keygen and rclone reject, or none at all.
      const lines = String(scan.stdout)
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
      const unreachable = i18n(
        'SFTP: ${host} did not answer with a host key. Check the address and port, and that the server is reachable from here.',
        { host: literal(`${host}:${port}`) },
      )
      if (!lines.length) throw new Error(unreachable)
      if (
        scan.exitCode !== 0 ||
        !lines.every((l) =>
          /^\S+ (ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)|sk-\S+) [A-Za-z0-9+/]+={0,2}$/.test(
            l,
          ),
        )
      )
        throw new Error(
          i18n(
            'SFTP: the host key ${host} presented could not be read. Try saving again.',
            { host: literal(`${host}:${port}`) },
          ),
        )
      const knownHosts = lines.join('\n')
      const fp = await sub.exec(['ssh-keygen', '-lf', '-'], {
        input: knownHosts + '\n',
      })
      const fingerprints = String(fp.stdout)
        .split('\n')
        .filter((l) => l.trim())
      if (fp.exitCode !== 0 || fingerprints.length !== lines.length)
        throw new Error(
          i18n(
            'SFTP: the host key ${host} presented could not be read. Try saving again.',
            { host: literal(`${host}:${port}`) },
          ),
        )
      return { knownHosts, fingerprints: fingerprints.join('\n') }
    },
  )
}

const enabledToggle = () =>
  sdk.Value.toggle({
    name: i18n('Enabled'),
    description: i18n('Keep a continuous backup on this target.'),
    default: false,
  })

const forgetToggle = () =>
  sdk.Value.toggle({
    name: i18n('Forget saved credentials'),
    description: i18n(
      'Remove this target and all of its saved settings. Turn off Enabled before selecting this.',
    ),
    default: false,
  })

const gdriveFields = {
  'gdrive-client-id': sdk.Value.text({
    name: i18n('OAuth Client ID'),
    description: i18n('From Google Cloud Console (Drive API, Desktop app).'),
    default: '',
    required: false,
  }),
  'gdrive-client-secret': sdk.Value.text({
    name: i18n('OAuth Client Secret'),
    description: i18n(
      'From Google Cloud Console. Leave blank to keep the stored one.',
    ),
    default: '',
    masked: true,
    required: false,
  }),
  'gdrive-auth-code': sdk.Value.text({
    name: i18n('Authorization Code'),
    description: i18n(
      'From the OAuth redirect: the code= value, or the whole URL.',
    ),
    default: '',
    masked: true,
    required: false,
  }),
  'gdrive-refresh-token': sdk.Value.text({
    name: i18n('Refresh Token'),
    description: i18n(
      'Optional. Paste a refresh token you already have; a new authorization code takes precedence. Leave blank to keep the stored one.',
    ),
    default: '',
    masked: true,
    required: false,
  }),
  'gdrive-path': sdk.Value.text({
    name: i18n('Folder Path'),
    description: i18n('Folder name in your Drive root.'),
    default: backupFolderDefault,
    required: false,
  }),
}

const dropboxFields = {
  'dropbox-client-id': sdk.Value.text({
    name: i18n('App Key'),
    description: i18n('From the Dropbox App Console.'),
    default: '',
    required: false,
  }),
  'dropbox-client-secret': sdk.Value.text({
    name: i18n('App Secret'),
    description: i18n(
      'From the Dropbox App Console. Leave blank to keep the stored one.',
    ),
    default: '',
    masked: true,
    required: false,
  }),
  'dropbox-auth-code': sdk.Value.text({
    name: i18n('Authorization Code'),
    description: i18n('The code Dropbox displays after you approve the app.'),
    default: '',
    masked: true,
    required: false,
  }),
  'dropbox-refresh-token': sdk.Value.text({
    name: i18n('Refresh Token'),
    description: i18n(
      'Optional. Paste a refresh token you already have; a new authorization code takes precedence. Leave blank to keep the stored one.',
    ),
    default: '',
    masked: true,
    required: false,
  }),
  'dropbox-path': sdk.Value.text({
    name: i18n('Folder Path'),
    description: i18n('Folder inside your App Folder.'),
    default: backupFolderDefault,
    required: false,
  }),
}

const nextcloudFields = {
  'nextcloud-url': sdk.Value.text({
    name: i18n('Address'),
    description: i18n(
      'The address you open Nextcloud at, such as https://cloud.example.com. Its WebDAV address works too.',
    ),
    default: '',
    required: false,
  }),
  'nextcloud-user': sdk.Value.text({
    name: i18n('Username'),
    description: i18n('Your Nextcloud login.'),
    default: '',
    required: false,
  }),
  'nextcloud-pass': sdk.Value.text({
    name: i18n('Password'),
    description: i18n(
      'An app password (Settings, then Security). Leave blank to keep the stored one.',
    ),
    default: '',
    masked: true,
    required: false,
  }),
  'nextcloud-insecure-tls': sdk.Value.toggle({
    name: i18n('Trust self-signed certificate'),
    description: i18n(
      'Skip certificate verification for this server. Only for a Nextcloud on your own network with a self-signed certificate: anyone between this server and it could then read the app password, though channel.backup itself stays encrypted.',
    ),
    default: false,
  }),
  'nextcloud-path': sdk.Value.text({
    name: i18n('Folder Path'),
    description: i18n('Created if missing.'),
    default: backupFolderDefault,
    required: false,
  }),
}

const sftpCommon = {
  'sftp-host': sdk.Value.text({
    name: i18n('Host'),
    description: i18n('Hostname or IP of the SFTP server.'),
    default: '',
    required: false,
  }),
  'sftp-user': sdk.Value.text({
    name: i18n('Username'),
    description: i18n('Login username.'),
    default: '',
    required: false,
  }),
  'sftp-port': sdk.Value.text({
    name: i18n('Port'),
    description: i18n('Default 22.'),
    default: '22',
    required: false,
  }),
  'sftp-path': sdk.Value.text({
    name: i18n('Folder Path'),
    description: i18n(
      'Relative to the login home directory, with no leading slash.',
    ),
    default: backupFolderDefault,
    required: false,
  }),
  'sftp-host-key-verified': sdk.Value.toggle({
    name: i18n('Host key verified'),
    description: i18n(
      'Turn on once the fingerprint shown after saving matches the one your server reports. Nothing is sent to the server until then.',
    ),
    default: false,
  }),
  'sftp-trust-new-host-key': sdk.Value.toggle({
    name: i18n('Record a new host key'),
    description: i18n(
      'Turn on after the server was reinstalled and its host key changed. The key it presents now replaces the recorded one.',
    ),
    default: false,
  }),
}

const sftpFields = {
  auth: sdk.Value.union({
    name: i18n('Authentication'),
    description: i18n('Password or SSH key.'),
    default: 'password',
    variants: sdk.Variants.of({
      password: {
        name: i18n('Password'),
        spec: sdk.InputSpec.of({
          ...sftpCommon,
          'sftp-pass': sdk.Value.text({
            name: i18n('Password'),
            description: i18n(
              'Login password. Leave blank to keep the stored one.',
            ),
            default: '',
            masked: true,
            required: false,
          }),
        }),
      },
      key: {
        name: i18n('SSH Key'),
        spec: sdk.InputSpec.of({
          ...sftpCommon,
          'sftp-key': sdk.Value.text({
            name: i18n('Private Key'),
            description: i18n(
              'The whole OpenSSH private key without a passphrase, including its BEGIN and END lines. Leave blank to keep the stored one.',
            ),
            default: '',
            required: false,
            masked: true,
            patterns: [
              {
                regex:
                  '^\\s*(-----BEGIN OPENSSH PRIVATE KEY-----[\\s\\S]*-----END OPENSSH PRIVATE KEY-----\\s*)?$',
                description: i18n('Must be an OpenSSH private key'),
              },
            ],
          }),
        }),
      },
    }),
  }),
}

// A target is an object with its own enable toggle, so turning one off keeps
// its saved credentials.
function storageTarget(
  name: string,
  description: string,
  fields: Record<string, any>,
) {
  return sdk.Value.object(
    { name, description },
    sdk.InputSpec.of({
      enabled: enabledToggle(),
      forget: forgetToggle(),
      ...fields,
    }),
  )
}

export const configureChannelBackup = sdk.Action.withInput(
  'configure-channel-backup',

  async ({ effects }) => ({
    name: i18n('Configure Continuous Backups'),
    description: i18n(
      'Keep a current copy of channel.backup on a storage provider. A StartOS restore uses it to recover channels opened after the backup was taken; it does not replace StartOS backups. Each node gets its own folder inside the one you name, so several nodes can share a target.',
    ),
    warning: i18n(
      'channel.backup is encrypted by LND under a key derived from your wallet seed. The storage provider can still see when it is updated. Use a target on a different machine, and prefer two independent targets. Tor .onion targets are not supported yet.',
    ),
    allowedStatuses: 'any',
    group: i18n('Continuous Backups'),
    visibility: 'enabled',
  }),

  sdk.InputSpec.of({
    gdrive: storageTarget(
      i18n('Google Drive'),
      i18n('Back up to Google Drive. Free personal accounts work.'),
      gdriveFields,
    ),
    dropbox: storageTarget(
      i18n('Dropbox'),
      i18n('Back up to Dropbox.'),
      dropboxFields,
    ),
    nextcloud: storageTarget(
      i18n('Nextcloud'),
      i18n('Back up to a Nextcloud instance over WebDAV.'),
      nextcloudFields,
    ),
    sftp: storageTarget(
      i18n('SFTP'),
      i18n('Back up to any always-on SSH server, such as a NAS.'),
      sftpFields,
    ),
  }),

  // Prefill from the saved config. Secrets come back blank and are kept when
  // left blank, so a round-trip never has to retype them.
  async ({ effects }) => {
    const cfg = await channelBackupJson.read().once()
    const g = cfg?.gdrive
    const d = cfg?.dropbox
    const n = cfg?.nextcloud
    const s = cfg?.sftp
    return {
      gdrive: {
        enabled: !!g?.enabled,
        forget: false,
        'gdrive-client-id': g?.clientId || '',
        'gdrive-client-secret': '',
        'gdrive-auth-code': '',
        'gdrive-refresh-token': '',
        'gdrive-path': g?.path || backupFolderDefault,
      },
      dropbox: {
        enabled: !!d?.enabled,
        forget: false,
        'dropbox-client-id': d?.clientId || '',
        'dropbox-client-secret': '',
        'dropbox-auth-code': '',
        'dropbox-refresh-token': '',
        'dropbox-path': d?.path || backupFolderDefault,
      },
      nextcloud: {
        enabled: !!n?.enabled,
        forget: false,
        'nextcloud-url': n?.url || '',
        'nextcloud-user': n?.user || '',
        'nextcloud-pass': '',
        'nextcloud-insecure-tls': !!n?.insecureTls,
        'nextcloud-path': n?.path || backupFolderDefault,
      },
      sftp: {
        enabled: !!s?.enabled,
        forget: false,
        auth: {
          selection: s?.authType === 'key' ? 'key' : 'password',
          value: {
            'sftp-host': s?.host || '',
            'sftp-user': s?.user || '',
            'sftp-port': s?.port || '22',
            'sftp-path': s?.path || backupFolderDefault,
            'sftp-host-key-verified': !!s?.hostKeyVerified,
            'sftp-trust-new-host-key': false,
            ...(s?.authType === 'key'
              ? { 'sftp-key': '' }
              : { 'sftp-pass': '' }),
          },
        },
      },
    } as any
  },

  async ({ effects, input }) => {
    const cfg = await channelBackupJson.read().once()
    const patch: any = {}
    const oauthCodes: Array<{
      provider: 'gdrive' | 'dropbox'
      google: boolean
      clientId: string
      clientSecret: string
      authCodeRaw: string
    }> = []
    const forgotten: string[] = []
    let hostKeyNote = ''

    for (const provider of VALID_PROVIDERS) {
      const o = (input as any)[provider] || {}
      const enabled = !!o.enabled
      const prev = (cfg as any)?.[provider] || {}
      if (o.forget) {
        if (enabled)
          throw new Error(
            i18n('${target}: turn off Enabled before forgetting this target.', {
              target: channelBackupProviderName(provider),
            }),
          )
        patch[provider] = null
        forgotten.push(channelBackupProviderName(provider))
        continue
      }

      if (provider === 'gdrive' || provider === 'dropbox') {
        const google = provider === 'gdrive'
        const label = google ? 'Google Drive' : 'Dropbox'
        const clientId =
          clean(o[`${provider}-client-id`], label) || prev.clientId || ''
        const clientSecret =
          secret(o[`${provider}-client-secret`], label) ||
          prev.clientSecret ||
          ''
        const authCodeRaw = clean(o[`${provider}-auth-code`], label)
        const refreshToken = clean(o[`${provider}-refresh-token`], label)
        const path = folder(o[`${provider}-path`], label, prev.path)
        if ((enabled || authCodeRaw) && (!clientId || !clientSecret))
          throw new Error(
            google
              ? i18n('Google Drive: Client ID and Client Secret are required.')
              : i18n('Dropbox: App Key and App Secret are required.'),
          )
        // A token belongs to the client that issued it, and a fresh
        // authorization is what the user meant when they pasted a code.
        const clientChanged =
          clientId !== (prev.clientId || '') ||
          clientSecret !== (prev.clientSecret || '')
        let token: string | null = clientChanged ? null : prev.token || null
        if (authCodeRaw) {
          oauthCodes.push({
            provider,
            google,
            clientId,
            clientSecret,
            authCodeRaw,
          })
        } else if (refreshToken) {
          token = tokenFromRefresh(refreshToken, google)
        }
        patch[provider] = { enabled, clientId, clientSecret, token, path }
      } else if (provider === 'nextcloud') {
        let url = clean(o['nextcloud-url'], 'Nextcloud') || prev.url || ''
        const user = clean(o['nextcloud-user'], 'Nextcloud') || prev.user || ''
        const pass =
          secret(o['nextcloud-pass'], 'Nextcloud') || prev.pass || null
        const path = folder(o['nextcloud-path'], 'Nextcloud', prev.path)
        if (enabled && (!url || !user || !pass))
          throw new Error(
            i18n('Nextcloud: address, username, and password are required.'),
          )
        // Saved credentials must not permit plaintext transmission, even while disabled.
        if (url) {
          if (!/^https:\/\//i.test(url))
            throw new Error(
              i18n(
                'Nextcloud: the address must start with https://, or the app password would travel in clear text.',
              ),
            )
          url = nextcloudDavUrl(url, user)
          rejectLocalOrOnion(url, 'Nextcloud')
        }
        patch.nextcloud = {
          enabled,
          url,
          user,
          pass,
          insecureTls: !!o['nextcloud-insecure-tls'],
          path,
        }
      } else {
        const auth = o.auth || { selection: 'password', value: {} }
        const v = auth.value || {}
        const host = clean(v['sftp-host'], 'SFTP') || prev.host || ''
        const user = clean(v['sftp-user'], 'SFTP') || prev.user || ''
        const port = clean(v['sftp-port'], 'SFTP') || prev.port || '22'
        const path = folder(v['sftp-path'], 'SFTP', prev.path)
        const authType = auth.selection === 'key' ? 'key' : 'password'
        if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
          throw new Error(
            i18n('SFTP: the port must be a number between 1 and 65535.'),
          )
        if (host.startsWith('-'))
          throw new Error(i18n('SFTP: the host must not begin with "-".'))
        if (enabled && (!host || !user))
          throw new Error(i18n('SFTP: host and username are required.'))
        if (host) rejectLocalOrOnion(host, 'SFTP')
        let pass: string | null = null
        let keyPem: string | null = null
        if (authType === 'password') {
          pass = secret(v['sftp-pass'], 'SFTP') || prev.pass || null
          if (enabled && !pass)
            throw new Error(i18n('SFTP: a password is required.'))
        } else {
          const pasted = typeof v['sftp-key'] === 'string' ? v['sftp-key'] : ''
          keyPem = pasted.trim()
            ? await normalizeKeyPem(effects, pasted)
            : prev.keyPem || null
          if (enabled && !keyPem)
            throw new Error(i18n('SFTP: a private key is required.'))
        }
        // The pin belongs to one host and port. A pin is trusted only after
        // the user has seen its fingerprints in an earlier save and confirms
        // them now, so a scan made in this save never activates in it.
        let knownHosts: string | null = prev.knownHosts || null
        let fingerprints: string = prev.hostKeyFingerprints || ''
        if (
          host !== (prev.host || '') ||
          port !== (prev.port || '22') ||
          !!v['sftp-trust-new-host-key']
        ) {
          knownHosts = null
          fingerprints = ''
        }
        let scanned = false
        if (enabled && !knownHosts) {
          const scan = await scanHostKeys(effects, host, port)
          knownHosts = scan.knownHosts
          fingerprints = scan.fingerprints
          scanned = true
        }
        const hostKeyVerified =
          !scanned && !!knownHosts && !!v['sftp-host-key-verified']
        if (enabled && !hostKeyVerified)
          hostKeyNote = i18n(
            'The SFTP server identified itself as ${fingerprint}. Compare it with your server, then save again with Host key verified turned on; nothing is sent to it until then.',
            { fingerprint: literal(fingerprints) },
          )
        patch.sftp = {
          enabled,
          host,
          user,
          port,
          authType,
          pass,
          keyPem,
          knownHosts,
          hostKeyFingerprints: fingerprints,
          hostKeyVerified,
          path,
        }
      }
    }

    const exchanged = new Set<string>()
    for (const pending of oauthCodes) {
      const token = pending.google
        ? await exchangeGoogleCode(
            pending.clientId,
            pending.clientSecret,
            pending.authCodeRaw,
          )
        : await exchangeDropboxCode(
            pending.clientId,
            pending.clientSecret,
            pending.authCodeRaw,
          )
      patch[pending.provider].token = token
      await channelBackupJson.merge(effects, {
        [pending.provider]: patch[pending.provider],
      })
      exchanged.add(pending.provider)
    }
    await channelBackupJson.merge(
      effects,
      Object.fromEntries(
        Object.entries(patch).filter(([provider]) => !exchanged.has(provider)),
      ),
    )

    const operational = VALID_PROVIDERS.filter((provider) => {
      const target = patch[provider]
      if (!target?.enabled) return false
      if (provider === 'gdrive' || provider === 'dropbox') return !!target.token
      if (provider === 'sftp') return !!target.hostKeyVerified
      return true
    })
    const notReady = VALID_PROVIDERS.filter(
      (provider) => patch[provider]?.enabled && !operational.includes(provider),
    )
    const authorization = (['gdrive', 'dropbox'] as const)
      .filter((provider) => patch[provider]?.enabled && !patch[provider].token)
      .map((provider) => ({
        provider,
        url:
          provider === 'gdrive'
            ? generateGoogleAuthUrl(patch[provider].clientId)
            : generateDropboxAuthUrl(patch[provider].clientId),
      }))
    const operationalNote = operational.length
      ? i18n(
          'channel.backup will be copied to ${targets} whenever your channels change. Run Back Up Channels Now to check that it works.',
          {
            targets: operational.map(channelBackupProviderName).join(', '),
          },
        )
      : ''
    const notReadyNote = notReady.length
      ? i18n(
          'Enabled but not ready: ${targets}. Complete the required authorization or host-key verification.',
          { targets: notReady.map(channelBackupProviderName).join(', ') },
        )
      : ''
    const disabledNote =
      operational.length || notReady.length
        ? ''
        : forgotten.length
          ? i18n(
              'No target is enabled, so channel.backup travels only inside StartOS backups you take yourself.',
            )
          : i18n(
              'No target is enabled, so channel.backup travels only inside StartOS backups you take yourself. Saved target settings were kept.',
            )
    const forgottenNote = forgotten.length
      ? i18n('Saved settings for ${targets} were forgotten.', {
          targets: forgotten.join(', '),
        })
      : ''
    return {
      version: '1' as const,
      title: i18n('Continuous Backups'),
      message: [
        operationalNote,
        notReadyNote,
        disabledNote,
        forgottenNote,
        hostKeyNote,
      ]
        .filter(Boolean)
        .join(' '),
      result: authorization.length
        ? {
            type: 'group' as const,
            value: authorization.map(({ provider, url }) => ({
              name: channelBackupProviderName(provider),
              description: i18n('Authorization URL'),
              type: 'single' as const,
              value: url,
              copyable: true,
              qr: false,
              masked: false,
            })),
          }
        : null,
    }
  },
)
