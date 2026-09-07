import * as https from 'https'
import { URLSearchParams } from 'url'
import { channelBackupJson } from '../fileModels/channel-backup.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { backupFolderDefault } from '../utils'

const VALID_PROVIDERS = ['gdrive', 'dropbox', 'nextcloud', 'sftp'] as const

function rejectOnion(addr: string, label: string): void {
  if (addr.includes('.onion'))
    throw new Error(
      i18n(
        '${label}: Tor .onion targets are not supported yet. Use a clearnet address.',
        { label },
      ),
    )
}

// A backup that lives on this same server does not survive losing it, which is
// the case these backups exist for.
function rejectLoopback(addr: string, label: string): void {
  const a = addr.toLowerCase()
  if (
    a.includes('localhost') ||
    a.includes('127.0.0.1') ||
    a.includes('::1') ||
    a.includes('0.0.0.0')
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
    scope: 'https://www.googleapis.com/auth/drive',
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
  let code = (raw || '').trim()
  const m = code.match(/[?&]code=([^&\s]+)/) || code.match(/^code=([^&\s]+)/)
  if (m) code = m[1]
  try {
    code = decodeURIComponent(code)
  } catch {
    // not valid percent-encoding — keep the raw value
  }
  return code
}

function httpsPostJson(
  hostname: string,
  path: string,
  body: string,
  headers: Record<string, string>,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: { 'Content-Length': Buffer.byteLength(body), ...headers },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          if (res.statusCode !== 200)
            reject(
              new Error(`${hostname} responded ${res.statusCode}: ${data}`),
            )
          else
            try {
              resolve(JSON.parse(data))
            } catch {
              reject(
                new Error(`Could not parse response from ${hostname}: ${data}`),
              )
            }
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// Exchange a fresh authorization code for the rclone token JSON that holds the
// refresh token. Runs only while a target is being enabled with a new code.
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
  return `{"access_token":"${r.access_token}","token_type":"bearer","refresh_token":"${r.refresh_token}","expiry":"${new Date(Date.now() + r.expires_in * 1000).toISOString()}"}`
}

// rclone refreshes the expired access token on first use, so only the refresh
// token has to be real.
function tokenFromRefresh(refreshToken: string, google: boolean): string {
  return google
    ? JSON.stringify({
        access_token: 'DUMMY',
        token_type: 'Bearer',
        refresh_token: refreshToken,
        expiry: '2020-01-01T00:00:00Z',
      })
    : `{"access_token":"DUMMY","token_type":"bearer","refresh_token":"${refreshToken}","expiry":"2020-01-01T00:00:00Z"}`
}

// Normalize a pasted OpenSSH key into the single-line, `\n`-escaped form
// rclone.conf's key_pem wants; the agent writes it verbatim.
function normalizeKeyPem(keyInput: string): string {
  const begin = '-----BEGIN OPENSSH PRIVATE KEY-----'
  const end = '-----END OPENSSH PRIVATE KEY-----'
  const norm = keyInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!norm.includes(begin) || !norm.includes(end))
    throw new Error(i18n('SFTP: that is not a valid OpenSSH private key.'))
  const body = norm
    .substring(norm.indexOf(begin) + begin.length, norm.indexOf(end))
    .replace(/\s+/g, '')
  const out = [begin]
  for (let i = 0; i < body.length; i += 70) out.push(body.substring(i, i + 70))
  out.push(end)
  return out.join('\n').replace(/\n/g, '\\n')
}

function refreshOf(tok?: string | null): string {
  try {
    return JSON.parse(tok || '{}').refresh_token || ''
  } catch {
    return ''
  }
}

const enabledToggle = () =>
  sdk.Value.toggle({
    name: i18n('Enabled'),
    description: i18n('Send channel backups to this target.'),
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
    description: i18n('From Google Cloud Console.'),
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
      'Paste an existing token, or leave blank to generate one from the authorization code.',
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
    description: i18n('From the Dropbox App Console.'),
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
      'Paste an existing token, or leave blank to generate one from the authorization code.',
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
    name: i18n('WebDAV URL'),
    description: i18n('e.g. https://your.host/remote.php/dav/files/USERNAME/'),
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
    description: i18n('An app password (Settings, then Security).'),
    default: '',
    masked: true,
    required: false,
  }),
  'nextcloud-insecure-tls': sdk.Value.toggle({
    name: i18n('Trust self-signed certificate'),
    description: i18n(
      'Skip certificate verification for this server. Turn this on only for a Nextcloud on your own network using a self-signed certificate. channel.backup is encrypted by LND before it leaves this server either way.',
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
            description: i18n('Login password.'),
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
              'The whole OpenSSH private key, including its BEGIN and END lines.',
            ),
            default: '',
            required: false,
            masked: true,
            patterns: [
              {
                regex:
                  '^-----BEGIN OPENSSH PRIVATE KEY-----[\\s\\S]*-----END OPENSSH PRIVATE KEY-----\\s*$',
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
    sdk.InputSpec.of({ enabled: enabledToggle(), ...fields }),
  )
}

export const configureChannelBackup = sdk.Action.withInput(
  'configure-channel-backup',

  async ({ effects }) => ({
    name: i18n('Configure Channel Backups'),
    description: i18n(
      'Send a copy of channel.backup off this server whenever your channels change.',
    ),
    warning: i18n(
      'channel.backup is encrypted by LND under a key derived from your wallet seed, so a storage provider only ever holds ciphertext. Use a target on a different machine, and prefer two independent targets. Tor .onion targets are not supported yet.',
    ),
    allowedStatuses: 'any',
    group: i18n('Backups'),
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
    const cfg = await channelBackupJson
      .read()
      .once()
      .catch(() => null)
    const g = cfg?.gdrive
    const d = cfg?.dropbox
    const n = cfg?.nextcloud
    const s = cfg?.sftp
    return {
      gdrive: {
        enabled: !!g?.enabled,
        'gdrive-client-id': g?.clientId || '',
        'gdrive-client-secret': g?.clientSecret || '',
        'gdrive-auth-code': '',
        'gdrive-refresh-token': refreshOf(g?.token),
        'gdrive-path': g?.path || backupFolderDefault,
      },
      dropbox: {
        enabled: !!d?.enabled,
        'dropbox-client-id': d?.clientId || '',
        'dropbox-client-secret': d?.clientSecret || '',
        'dropbox-auth-code': '',
        'dropbox-refresh-token': refreshOf(d?.token),
        'dropbox-path': d?.path || backupFolderDefault,
      },
      nextcloud: {
        enabled: !!n?.enabled,
        'nextcloud-url': n?.url || '',
        'nextcloud-user': n?.user || '',
        'nextcloud-pass': '',
        'nextcloud-insecure-tls': !!n?.insecureTls,
        'nextcloud-path': n?.path || backupFolderDefault,
      },
      sftp: {
        enabled: !!s?.enabled,
        auth: {
          selection: s?.authType === 'key' ? 'key' : 'password',
          value: {
            'sftp-host': s?.host || '',
            'sftp-user': s?.user || '',
            'sftp-port': s?.port || '22',
            'sftp-path': s?.path || backupFolderDefault,
            ...(s?.authType === 'key'
              ? { 'sftp-key': '' }
              : { 'sftp-pass': '' }),
          },
        },
      },
    } as any
  },

  async ({ effects, input }) => {
    const cfg = await channelBackupJson
      .read()
      .once()
      .catch(() => null)
    const patch: any = {}

    for (const provider of VALID_PROVIDERS) {
      const o = (input as any)[provider] || {}
      const enabled = !!o.enabled
      const prev = (cfg as any)?.[provider] || {}

      if (provider === 'gdrive' || provider === 'dropbox') {
        const google = provider === 'gdrive'
        const clientId =
          o[`${provider}-client-id`]?.trim() || prev.clientId || ''
        const clientSecret =
          o[`${provider}-client-secret`]?.trim() || prev.clientSecret || ''
        const authCodeRaw = o[`${provider}-auth-code`]?.trim()
        const refreshToken = o[`${provider}-refresh-token`]?.trim()
        const path =
          o[`${provider}-path`]?.trim() || prev.path || backupFolderDefault
        if (enabled && (!clientId || !clientSecret))
          throw new Error(
            google
              ? i18n('Google Drive: Client ID and Client Secret are required.')
              : i18n('Dropbox: App Key and App Secret are required.'),
          )
        let token: string | null = prev.token || null
        if (refreshToken) token = tokenFromRefresh(refreshToken, google)
        else if (enabled && authCodeRaw)
          token = google
            ? await exchangeGoogleCode(clientId, clientSecret, authCodeRaw)
            : await exchangeDropboxCode(clientId, clientSecret, authCodeRaw)
        if (enabled && !token)
          throw new Error(
            google
              ? i18n(
                  'Google Drive needs authorizing. Open this link, approve it, then paste the code back here and submit again:\n${url}',
                  { url: generateGoogleAuthUrl(clientId) },
                )
              : i18n(
                  'Dropbox needs authorizing. Open this link, approve it, then paste the code it shows back here and submit again:\n${url}',
                  { url: generateDropboxAuthUrl(clientId) },
                ),
          )
        patch[provider] = { enabled, clientId, clientSecret, token, path }
      } else if (provider === 'nextcloud') {
        const url = o['nextcloud-url']?.trim() || prev.url || ''
        const user = o['nextcloud-user']?.trim() || prev.user || ''
        const pass = o['nextcloud-pass']?.trim() || prev.pass || null
        const path =
          o['nextcloud-path']?.trim() || prev.path || backupFolderDefault
        if (enabled) {
          rejectOnion(url, 'Nextcloud')
          rejectLoopback(url, 'Nextcloud')
          if (!url || !user || !pass)
            throw new Error(
              i18n('Nextcloud: URL, username, and password are required.'),
            )
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
        const host = v['sftp-host']?.trim() || prev.host || ''
        const user = v['sftp-user']?.trim() || prev.user || ''
        const port = v['sftp-port']?.trim() || prev.port || '22'
        const path = v['sftp-path']?.trim() || prev.path || backupFolderDefault
        const authType = auth.selection === 'key' ? 'key' : 'password'
        if (enabled) {
          rejectOnion(host, 'SFTP')
          rejectLoopback(host, 'SFTP')
          if (!host || !user)
            throw new Error(i18n('SFTP: host and username are required.'))
        }
        let pass: string | null = null
        let keyPem: string | null = null
        if (authType === 'password') {
          pass = v['sftp-pass']?.trim() || prev.pass || null
          if (enabled && !pass)
            throw new Error(i18n('SFTP: a password is required.'))
        } else {
          keyPem = v['sftp-key']?.trim()
            ? normalizeKeyPem(v['sftp-key'])
            : prev.keyPem || null
          if (enabled && !keyPem)
            throw new Error(i18n('SFTP: a private key is required.'))
        }
        patch.sftp = { enabled, host, user, port, authType, pass, keyPem, path }
      }
    }

    await channelBackupJson.merge(effects, patch)

    const on = VALID_PROVIDERS.filter((p) => patch[p]?.enabled)
    return {
      version: '1' as const,
      title: i18n('Channel Backups'),
      message: on.length
        ? i18n(
            'channel.backup will be copied to ${targets} whenever your channels change. Run Back Up Channels Now to check that it works.',
            { targets: on.join(', ') },
          )
        : i18n(
            'No target is enabled, so channel.backup travels only inside StartOS backups you take yourself. Saved target settings were kept.',
          ),
      result: null,
    }
  },
)
