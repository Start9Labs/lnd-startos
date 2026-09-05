import { sdk } from '../sdk'
import { customConfigJson } from '../fileModels/custom-config.json'
import { i18n } from '../i18n'
import * as crypto from 'crypto'
import * as https from 'https'
import { URLSearchParams } from 'url'

const VALID_PROVIDERS = [
  'gdrive',
  'dropbox',
  'nextcloud',
  'sftp',
  'email',
] as const

function parseRcloneConf(conf: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {}
  let currentSection = ''
  conf.split('\n').forEach((line) => {
    line = line.trim()
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1)
      sections[currentSection] = {}
    } else if (line.includes('=') && currentSection) {
      const eqIndex = line.indexOf('=')
      const k = line.substring(0, eqIndex).trim()
      const v = line.substring(eqIndex + 1).trim()
      sections[currentSection][k] = v
    }
  })
  return sections
}

function removeSection(conf: string, sectionName: string): string {
  const lines = conf.split('\n')
  let inSection = false
  const newLines = lines.filter((line) => {
    const trimmed = line.trim()
    if (trimmed === `[${sectionName}]`) {
      inSection = true
      return false
    }
    if (inSection && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inSection = false
      return true
    }
    return !inSection
  })
  return newLines.join('\n').trim()
}

function obscure(plain: string): string {
  const key = Buffer.from(
    '9c935b48730a554d6bfd7c63c886a92bd390198eb8128afbf4de162b8b95f638',
    'hex',
  )
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-ctr', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ])
  let base64 = Buffer.concat([iv, encrypted]).toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function isObscured(value: string): boolean {
  if (!value) return false
  try {
    const padded = value + '==='.slice(value.length % 4)
    const bs = Buffer.from(padded, 'base64')
    return bs.length >= 16
  } catch {
    return false
  }
}

function generateGoogleAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'http://localhost',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive',
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export const addBackupTarget = sdk.Action.withInput(
  'channels-backup',
  async ({ effects }) => ({
    name: 'Channels - Auto-Backup',
    description:
      'Add and configure backup providers for your channel.backup file. You can select multiple providers (Nextcloud, Dropbox, Google Drive, Email, SFTP) and multiple email recipients.',
    warning: `CHANNEL.BACKUP file is encrypted with your AEZEED Cipher Seed so it can be stored on third-party servers without any risk. Email is the most recommended backup method but for maximum security use it with at least one additional backup provider.
<hr> <span class="g-title"><a target="_blank" href="/services/lnd/instructions#channels-auto-backup-setup-examples" class="g-warning"><u>setup examples 🔗</u></a></span>`,
    allowedStatuses: 'only-running',
    group: i18n('Security'),
    visibility: 'enabled',
  }),
  sdk.InputSpec.of({
    providers: sdk.Value.multiselect({
      name: 'Enabled Backup Providers 🞃',
      description:
        'Enable or disable backup providers. Unchecking a provider deletes its settings from the config on submit. Settings for disabled providers are discarded on submit.',
      default: [],
      values: {
        email: 'Email',
        sftp: 'SFTP',
        dropbox: 'Dropbox',
        nextcloud: 'Nextcloud',
        gdrive: 'Google Drive',
      },
    }),
    email: sdk.Value.object(
      {
        name: 'Email Settings',
        description: `<div>Here you can configure settings for Email backup. Your <code>channel.backup</code> file will be <b>automatically attached and emailed</b> every time it changes — that means whenever you <b>open a new channel</b>,
  <b>close a channel</b>, or Lightning updates the backup for any other reason.</div>
<div><b>You'll receive an email within seconds</b> of every channel state change.</div><br> (Check Email setup example in "IMPORTANT" section above for more info).`,
      },
      sdk.InputSpec.of({
        'email-from': sdk.Value.text({
          name: 'Email Sender Address',
          description:
            'Your sender email (e.g., yourusername@gmail.com), which will be used as the From address. If you need an SMTP server, use the same email address with whichever provider you decide to open an account with.',
          default: '',
          required: false,
          patterns: [
            {
              regex: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
              description: 'Must be a valid email address',
            },
          ],
        }),
        'email-to': sdk.Value.text({
          name: 'Email Recipient Address',
          description: `Recipient email can be the same as sender, but try to add at least 2 email recipients addresses and try to mix email providers. Example: <code>youremail@protonmail.com, youremail@gmail.com, youremail@tutanota.com, famillymemberemail@gmail.com, friendemail@gmail.com</code></div>`,
          default: '',
          required: false,
          patterns: [
            {
              regex:
                '^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})(\\s*,\\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})*$',
              description:
                'Must be one or more valid email addresses separated by commas',
            },
          ],
        }),
        'email-smtp-server': sdk.Value.text({
          name: 'Email SMTP Server',
          description: `<table><thead><tr><th>✅ Recommended SMTP Providers</th></tr></thead>
                        <tbody>
                        <tr><td><b>MailerSend</b> ⇢ <a href="https://www.mailersend.com/" target="_blank">mailersend.com 🔗</a><br/>– Free tier: 500 emails/month, no domain required.<br/>– Use your <b>verified email</b> as "From" address.</td></tr>
                        <tr><td><b>SMTP2Go</b> ⇢ <a href="https://www.smtp2go.com/" target="_blank">smtp2go.com 🔗</a><br/>– Free tier: 1,000 emails/month, no domain required.<br/>– SMTP server: <code>mail.smtp2go.com</code>, port 465 or 587.</td></tr>
                        <tr><td><b>Gmail</b> ⇢ <a href="https://mail.google.com/" target="_blank">mail.google.com 🔗</a><br/>– Free tier: 500 emails/day, requires App Password (2FA must be ON).<br/>⚠️ Emails can <b>only be sent to @gmail.com addresses</b> unless you verify a custom "From" address.</td></tr>
                        <tr><td><b>Proton Mail</b> ⇢ <a href="https://mail.proton.me/" target="_blank">mail.proton.me 🔗</a><br/>– Free tier: NONE, smtp access requires <b>paid plan</b>.<br/>– SMTP server: <code>smtp.proton.me</code>, port 465 or 587.</td></tr>
                        </tbody>
                        </table>`,
          default: 'smtp.gmail.com',
          required: false,
          patterns: [
            {
              regex:
                '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$',
              description: 'Must be a valid hostname',
            },
          ],
        }),
        'email-smtp-port': sdk.Value.text({
          name: 'Email SMTP Port',
          description: '465 for SSL, 587 for TLS.',
          default: '465',
          required: false,
          patterns: [
            {
              regex:
                '^([1-9]|[1-9]\\d{1,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
              description:
                'Must be between 1 and 65535. E.g., use 587 (TLS) or 465 (SSL).',
            },
          ],
        }),
        'email-smtp-user': sdk.Value.text({
          name: 'Email SMTP Username',
          description: 'Usually the sender email.',
          default: '',
          required: false,
          patterns: [
            {
              regex: '^[a-zA-Z0-9._%+-@/:]+$',
              description: 'Often your full email address or an API key',
            },
          ],
        }),
        'email-smtp-pass': sdk.Value.text({
          name: 'Email SMTP Password',
          description:
            'Enter your (Sender) email account password. Gmail users: use an App Password (required if 2FA is on).',
          default: '',
          masked: true,
          required: false,
        }),
        'email-body': sdk.Value.textarea({
          name: 'Email Custom Message',
          description: `Customize the text inside the backup email. Leave blank for a generic default message. It is recommended to not include sensitive node identifiers (like your Node Pubkey) here, as you risk linking your LND node to your email address, which can be tied to your real identity.<br><br><b>Example of a safe custom message:</b><br><i>"Here is the latest channel backup from my StartOS LND node. Keep it safe! Remember, this file is encrypted and can only be used with my AEZEED seed to restore."</i>`,
          default: '',
          required: false,
        }),
      }),
    ),
    sftp: sdk.Value.object(
      {
        name: 'SFTP Settings',
        description: `Configure SFTP backups to your remote or local server using a password or SSH key. Although you can use a LAN computer (desktop or laptop), keep in mind that it needs to stay powered on 24/7. For better reliability, consider options like a Raspberry Pi or NAS.<br> (Check SFTP setup example in "IMPORTANT" section above for more info).`,
      },
      sdk.InputSpec.of({
        auth: sdk.Value.union({
          name: 'Select Authentication Type',
          description: 'Choose password or SSH key.',
          default: 'password',
          variants: sdk.Variants.of({
            password: {
              name: 'Password',
              spec: sdk.InputSpec.of({
                'sftp-host': sdk.Value.text({
                  name: 'SFTP Host',
                  description:
                    'Hostname or IP of the SFTP server / LAN device (desktop, laptop, Raspberry Pi, NAS ...).',
                  default: '',
                  required: false,
                  patterns: [
                    {
                      regex:
                        '^((([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\\-]*[a-zA-Z0-9])\\.)+([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\\-]*[A-Za-z0-9])|(\\d{1,3}\\.){3}\\d{1,3})$',
                      description: 'Must be a valid domain or IP address.',
                    },
                  ],
                }),
                'sftp-user': sdk.Value.text({
                  name: 'SFTP Username',
                  description: 'Login username.',
                  default: '',
                  required: false,
                  patterns: [
                    {
                      regex:
                        '^([a-zA-Z0-9._-]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})$',
                      description:
                        'Can contain letters, numbers, @, underscores, and hyphens.',
                    },
                  ],
                }),
                'sftp-pass': sdk.Value.text({
                  name: 'SFTP Password',
                  description: 'Login password.',
                  default: '',
                  masked: true,
                  required: false,
                }),
                'sftp-port': sdk.Value.text({
                  name: 'SFTP Port',
                  description:
                    'Default port is 22. If you use shared hosting some providers use a different port (e.g., 2222) so check with your provider.',
                  default: '22',
                  required: false,
                  patterns: [
                    {
                      regex:
                        '^([1-9]|[1-9]\\d{1,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
                      description: 'Must be between 1 and 65535.',
                    },
                  ],
                }),
                'sftp-path': sdk.Value.text({
                  name: 'SFTP Folder Path',
                  description:
                    'Path to the backup folder (e.g., <code>lnd-backups</code> or <code>subfolder/lnd-backups</code>). Use relative paths without a leading /.',
                  default: 'lnd-backups',
                  required: false,
                  patterns: [
                    {
                      regex: '^/?([a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]*$',
                      description:
                        'Optional leading /, valid characters (alphanum, _, -).',
                    },
                  ],
                }),
              }),
            },
            key: {
              name: 'SSH Key',
              spec: sdk.InputSpec.of({
                'sftp-host': sdk.Value.text({
                  name: 'SFTP Host',
                  description: 'Hostname or IP of the SFTP server.',
                  default: '',
                  required: false,
                  patterns: [
                    {
                      regex:
                        '^((([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\\-]*[a-zA-Z0-9])\\.)+([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\\-]*[A-Za-z0-9])|(\\d{1,3}\\.){3}\\d{1,3})$',
                      description: 'Must be a valid domain or IP address.',
                    },
                  ],
                }),
                'sftp-user': sdk.Value.text({
                  name: 'SFTP Username',
                  description: 'Login username.',
                  default: '',
                  required: false,
                  patterns: [
                    {
                      regex:
                        '^([a-zA-Z0-9._-]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})$',
                      description:
                        'Can contain letters, numbers, @, underscores, and hyphens.',
                    },
                  ],
                }),
                'sftp-key': sdk.Value.text({
                  name: 'SFTP Private Key',
                  description:
                    'Paste your full SSH private key (starts with -----BEGIN OPENSSH PRIVATE KEY-----).',
                  default: '',
                  required: false,
                  masked: false,
                  patterns: [
                    {
                      regex:
                        '^-----BEGIN OPENSSH PRIVATE KEY-----[\\s\\S]*-----END OPENSSH PRIVATE KEY-----\\s*$',
                      description:
                        'Must be a valid OpenSSH private key PEM format.',
                    },
                  ],
                }),
                'sftp-port': sdk.Value.text({
                  name: 'SFTP Port',
                  description:
                    'Default port is 22. If you use shared hosting some providers use a different port (e.g., 2222) so check with your provider.',
                  default: '22',
                  required: false,
                  patterns: [
                    {
                      regex:
                        '^([1-9]|[1-9]\\d{1,3}|[1-5]\\d{4}|6[0-4]\\d{3}|65[0-4]\\d{2}|655[0-2]\\d|6553[0-5])$',
                      description: 'Must be between 1 and 65535.',
                    },
                  ],
                }),
                'sftp-path': sdk.Value.text({
                  name: 'SFTP Folder Path',
                  description:
                    'Path to the backup folder (e.g., <code>lnd-backups</code> or <code>subfolder/lnd-backups</code>). Use relative paths without a leading /.',
                  default: 'lnd-backups',
                  required: false,
                  patterns: [
                    {
                      regex: '^/?([a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]*$',
                      description:
                        'Optional leading /, valid characters (alphanum, _, -).',
                    },
                  ],
                }),
              }),
            },
          }),
        }),
      }),
    ),
    dropbox: sdk.Value.object(
      {
        name: 'Dropbox Settings',
        description: `Provide either App Key + App Secret + Authorization Code to auto-generate Refresh Token or App Key + App Secret + Refresh Token.<br> (Check Dropbox setup example in "IMPORTANT" section above for more info)`,
      },
      sdk.InputSpec.of({
        'dropbox-client-id': sdk.Value.text({
          name: 'Dropbox App Key',
          description:
            'From your Dropbox App Console → "App key". Required for long-lived refresh tokens. (Check Dropbox setup example in "IMPORTANT" section above for more info)',
          default: '',
          required: false,
        }),
        'dropbox-client-secret': sdk.Value.text({
          name: 'Dropbox App Secret',
          description:
            'From your Dropbox App Console → "App secret". Required for long-lived refresh tokens. (Check Dropbox setup example in "IMPORTANT" section above for more info)',
          default: '',
          masked: true,
          required: false,
        }),
        'dropbox-auth-code': sdk.Value.text({
          name: 'Dropbox Authorization Code (if no Refresh Token)',
          description: `Open https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&response_type=code&token_access_type=offline in your browser, replacing APP_KEY with your App key. Log in to Dropbox, allow the app, and then copy the Dropbox Authorization Code from the URL (after ?code=) or from the page if displayed.`,
          default: '',
          masked: true,
          required: false,
        }),
        'dropbox-refresh-token': sdk.Value.text({
          name: `Dropbox Refresh Token (paste / generate using Auth Code)`,
          description: `If you already have a long-lived refresh token, paste it here. Otherwise, enter your App Key, App Secret, and Authorization Code in the fields above. After submission, a new Refresh Token will be generated. You can then copy it along with your App Key and App Secret for safekeeping.`,
          default: '',
          masked: true,
          required: false,
        }),
        'dropbox-path': sdk.Value.text({
          name: 'Dropbox Folder Path',
          description:
            'Folder inside your App Folder (e.g., lnd-backups). Will be created automatically.',
          default: 'lnd-backups',
          required: false,
          patterns: [
            {
              regex: '^[a-zA-Z0-9_\\-/ ]+$',
              description:
                'Valid folder path (alphanumeric, spaces, hyphens, underscores, forward slashes)',
            },
          ],
        }),
      }),
    ),
    nextcloud: sdk.Value.object(
      {
        name: 'Nextcloud Settings',
        description: `Configure settings for Nextcloud backup.<br> (Check Nextcloud setup example in "IMPORTANT" section above for more info).`,
      },
      sdk.InputSpec.of({
        'nextcloud-url': sdk.Value.text({
          name: 'Nextcloud WebDAV URL',
          description: `Replace <b>your.nextcloud.com</b> with your domain and <b>yourusername</b> with your Nextcloud username. Base URL, e.g., https://your.nextcloud.com/remote.php/dav/files/yourusername/, https://youronionaddress.onion/remote.php/dav/files/yourusername/`,
          default: '',
          required: false,
        }),
        'nextcloud-user': sdk.Value.text({
          name: 'Nextcloud Username',
          description: 'Your login username. Default is admin.',
          default: '',
          required: false,
        }),
        'nextcloud-pass': sdk.Value.text({
          name: 'Nextcloud Password',
          description: `1️⃣	Log in to your Nextcloud instance.<br>
        2️⃣	Go to Settings → Security → Devices & sessions.<br>
        3️⃣	Under “App passwords”, create a new app password (e.g., “LND Backup”).<br>
        4️⃣	Copy the generated password — also save it as you won’t see it again!`,
          default: '',
          masked: true,
          required: false,
        }),
        'nextcloud-path': sdk.Value.text({
          name: 'Nextcloud Folder Path',
          description:
            'Folder will be created if it doesn’t exist. Example: lnd-backups',
          default: 'lnd-backups',
          required: false,
        }),
      }),
    ),
    google: sdk.Value.object(
      {
        name: 'Google Drive Settings',
        description: `<div><b>Google Drive - Personal Accounts (Free)</b></div>
<div>Google Drive requires OAuth authorization. Provide either:<br>
• <b>Client ID + Client Secret + Authorization Code</b> → auto-generate Refresh Token<br>
• <b>Client ID + Client Secret + Refresh Token</b> → skip OAuth</div>`,
      },
      sdk.InputSpec.of({
        'gdrive-client-id': sdk.Value.text({
          name: 'Google OAuth Client ID',
          description:
            'From Google Cloud Console → OAuth credentials. Example: ...-....apps.googleusercontent.com.<br> Follow the Google Drive setup example in the "IMPORTANT" section above to get OAuth Client ID.',
          default: '',
          required: false,
        }),
        'gdrive-client-secret': sdk.Value.text({
          name: 'Google OAuth Client Secret',
          description:
            'From Google Cloud Console → OAuth credentials.<br> Follow the Google Drive setup example in the "IMPORTANT" section above to get OAuth Client Secret.',
          default: '',
          masked: true,
          required: false,
        }),
        'gdrive-auth-code': sdk.Value.text({
          name: 'Authorization Code (if no Refresh Token)',
          description: `<div>💡 To get the authorization code, replace <b>CLIENT_ID</b> with your Client ID and then open following URL in your browser:</div><br>
<code>https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent</code>
<div>After visiting the authorization URL and clicking "Allow", paste the code from your browser's redirect URL here. You can paste either:<br>
        • The full URL: <code>http://localhost/?code=4/0A...</code><br>
        • OR just the code: <code>4/0A...</code><br>
        <br>Leave empty if you already have a refresh token.</div>`,
          default: '',
          masked: true,
          required: false,
        }),
        'gdrive-refresh-token': sdk.Value.text({
          name: 'Refresh Token (paste / generate using Authorization Code)',
          description: `If you already have a refresh token, paste it here. After successful OAuth, this field will show the generated token for backup.`,
          default: '',
          masked: true,
          required: false,
        }),
        'gdrive-path': sdk.Value.text({
          name: 'Google Drive Folder Path',
          description:
            'Folder name in your Google Drive root (e.g., lnd-backups).',
          default: 'lnd-backups',
          required: false,
        }),
      }),
    ),
    'backup-startup-grace': sdk.Value.toggle({
      name: 'Suppress Backup on Startup',
      description: `Enabling this toggle has <b>zero impact</b> on the receiving real-time backups for all actual channel opens and closes. <br><br><b>Why enable this?</b> Every time LND restarts and the wallet unlocks, it automatically rewrites the <code>channel.backup</code> file as part of its normal startup routine. This triggers a backup, which often causes a confusion and some users mistakenly believe a channel was opened or closed while they were offline. Turn this ON to filter out these false-positive notifications.<br><br><b>Trade-off:</b> If a peer <i>did</i> actually close a channel while your node was offline, your remote backup won't update to reflect that specific closure until your next local channel event. (Restoring from a backup that lists an already-closed channel is perfectly safe and will not result in lost funds).`,
      default: false,
    }),
  }),
  async ({ effects }) => {
    const config = (await customConfigJson
      .read()
      .once()
      .catch(() => ({}))) as any
    const existingConf = config.rcloneConfig
      ? Buffer.from(config.rcloneConfig, 'base64').toString('utf8')
      : ''
    const sections = parseRcloneConf(existingConf)
    const getPath = (provider: string) =>
      config.selectedRcloneRemotes
        ?.find((r: string) => r.startsWith(provider + ':'))
        ?.split(':')[1] || 'lnd-backups'
    const selectedProviders = VALID_PROVIDERS.filter((p) => {
      if (p === 'email') return !!config.emailBackup
      return config.selectedRcloneRemotes?.some((r: string) =>
        r.startsWith(p + ':'),
      )
    }) as (typeof VALID_PROVIDERS)[number][]

    const gdriveSection = sections['gdrive'] || {}
    const existingClientId = gdriveSection.client_id || ''
    const authUrl = existingClientId
      ? generateGoogleAuthUrl(existingClientId)
      : ''

    return {
      providers: selectedProviders,
      'backup-startup-grace': config.backupStartupGracePeriod ?? false,
      email: {
        'email-from': config.emailBackup?.from || '',
        'email-to': config.emailBackup?.to || '',
        'email-smtp-server':
          config.emailBackup?.smtp_server || 'smtp.gmail.com',
        'email-smtp-port': config.emailBackup?.smtp_port?.toString() || '465',
        'email-smtp-user': config.emailBackup?.smtp_user || '',
        'email-smtp-pass': '',
        'email-body': config.emailBackup?.body || '',
      },
      sftp: (() => {
        const sftpSection = sections['sftp'] || {}
        const selection: 'password' | 'key' = sftpSection.key_pem
          ? 'key'
          : 'password'
        const value: any = {
          'sftp-host': sftpSection.host || '',
          'sftp-user': sftpSection.user || '',
          'sftp-port': sftpSection.port || '22',
          'sftp-path': getPath('sftp'),
        }
        value[selection === 'key' ? 'sftp-key' : 'sftp-pass'] = ''
        return { auth: { selection, value } }
      })(),
      google: {
        'gdrive-client-id': existingClientId,
        'gdrive-client-secret': gdriveSection.client_secret || '',
        'gdrive-auth-code': '', // Never pre-fill auth code
        'gdrive-refresh-token': (() => {
          try {
            const tokenObj = JSON.parse(gdriveSection.token || '{}')
            return tokenObj.refresh_token || ''
          } catch (e) {
            return ''
          }
        })(),
        'gdrive-path': getPath('gdrive'),
      },
      dropbox: (() => {
        const dropboxSection = sections['dropbox'] || {}
        let refreshToken = ''
        try {
          const tokenObj = JSON.parse(dropboxSection.token || '{}')
          refreshToken = tokenObj.refresh_token || ''
        } catch (e) {
          /* ignore */
        }
        return {
          'dropbox-client-id': dropboxSection.client_id || '',
          'dropbox-client-secret': dropboxSection.client_secret || '',
          'dropbox-refresh-token': refreshToken,
          'dropbox-path': getPath('dropbox'),
        }
      })(),
      nextcloud: {
        'nextcloud-url': sections['nextcloud']?.url || '',
        'nextcloud-user': sections['nextcloud']?.user || '',
        'nextcloud-pass': '',
        'nextcloud-path': getPath('nextcloud'),
      },
    }
  },
  async ({ effects, input }) => {
    try {
      const rawProviders = input.providers || []
      const providers = rawProviders.filter((p) =>
        VALID_PROVIDERS.includes(p as any),
      ) as (typeof VALID_PROVIDERS)[number][]
      const config = (await customConfigJson
        .read()
        .once()
        .catch(() => ({}))) as any

      if (providers.length === 0) {
        await customConfigJson.write(effects, {
          channelAutoBackupEnabled: false,
          backupStartupGracePeriod: false,
          selectedRcloneRemotes: [],
          enabledRemotes: [],
          emailBackup: null,
          emailEnabled: false,
          rcloneConfig: null,
          walletUnlocked: config?.walletUnlocked ?? false,
        })
        return {
          version: '1',
          title: '⚠️ Channels - Auto-Backup: Disabled',
          message: `Channel auto-backup has been disabled. Please use built-in StartOS backup or download <b>channel.backup</b> manually (e.g. via RTL or ThunderHub) whenever you open/close channels.`,
          result: null,
        }
      }

      let updates: any = {
        channelAutoBackupEnabled: true,
        backupStartupGracePeriod: input['backup-startup-grace'] ?? false,
      }
      let existingConf = config.rcloneConfig
        ? Buffer.from(config.rcloneConfig, 'base64').toString('utf8')
        : ''
      let sections = parseRcloneConf(existingConf)
      let newSections = ''
      let newRemotes: string[] = []
      let newEnabled: string[] = []

      const previousCloudProviders = VALID_PROVIDERS.filter(
        (p) => p !== 'email' && !!sections[p],
      ) as Exclude<(typeof VALID_PROVIDERS)[number], 'email'>[]
      let filteredSelected = config.selectedRcloneRemotes || []
      let filteredEnabled = config.enabledRemotes || []

      for (const prevProvider of previousCloudProviders) {
        if (!providers.includes(prevProvider)) {
          existingConf = removeSection(existingConf, prevProvider)
          filteredSelected = filteredSelected.filter(
            (r: unknown) =>
              typeof r === 'string' && !r.startsWith(prevProvider + ':'),
          )
          filteredEnabled = filteredEnabled.filter(
            (r: unknown) =>
              typeof r === 'string' && !r.startsWith(prevProvider + ':'),
          )
          delete sections[prevProvider]
        }
      }

      updates.selectedRcloneRemotes = filteredSelected
      updates.enabledRemotes = filteredEnabled

      if (!providers.includes('email') && config.emailBackup) {
        updates.emailBackup = null
        updates.emailEnabled = false
      }

      for (const provider of providers) {
        if (provider !== 'email') {
          const remoteName = provider
          const existingSection = sections[remoteName] || {}
          let path: string = ''
          let newSectionLines: string[] = [`[${remoteName}]`]

          switch (provider) {
            case 'gdrive': {
              path =
                input.google['gdrive-path']?.trim() ??
                config.selectedRcloneRemotes
                  ?.find((r: string) => r.startsWith(remoteName + ':'))
                  ?.split(':')[1] ??
                'lnd-backups'
              const clientId = input.google['gdrive-client-id']?.trim()
              const clientSecret = input.google['gdrive-client-secret']?.trim()
              const authCodeInput = input.google['gdrive-auth-code']?.trim()
              const refreshTokenInput =
                input.google['gdrive-refresh-token']?.trim()
              const existingClientId = existingSection.client_id || ''
              const existingClientSecret = existingSection.client_secret || ''
              const existingToken = existingSection.token || ''
              const finalClientId = clientId || existingClientId
              const finalClientSecret = clientSecret || existingClientSecret
              let finalToken = existingToken

              if (refreshTokenInput && finalClientId && finalClientSecret) {
                const dummyExpiry = '2020-01-01T00:00:00Z'
                finalToken = JSON.stringify({
                  access_token: 'DUMMY',
                  token_type: 'Bearer',
                  refresh_token: refreshTokenInput,
                  expiry: dummyExpiry,
                })
              } else if (authCodeInput && finalClientId && finalClientSecret) {
                console.log(
                  'Exchanging authorization code for Google Drive tokens...',
                )
                let authCode = authCodeInput
                if (authCodeInput.includes('code=')) {
                  const match = authCodeInput.match(/code=([^&]+)/)
                  if (match) {
                    authCode = match[1]
                  }
                }
                try {
                  const tokenResponse = await new Promise<any>(
                    (resolve, reject) => {
                      const postData = new URLSearchParams({
                        code: authCode,
                        client_id: finalClientId,
                        client_secret: finalClientSecret,
                        redirect_uri: 'http://localhost',
                        grant_type: 'authorization_code',
                      }).toString()
                      const options = {
                        hostname: 'oauth2.googleapis.com',
                        path: '/token',
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/x-www-form-urlencoded',
                          'Content-Length': postData.length,
                        },
                      }
                      const req = https.request(options, (res) => {
                        let data = ''
                        res.on('data', (chunk) => {
                          data += chunk
                        })
                        res.on('end', () => {
                          if (res.statusCode !== 200) {
                            reject(
                              new Error(
                                `Google OAuth failed (${res.statusCode}): ${data}`,
                              ),
                            )
                          } else {
                            try {
                              resolve(JSON.parse(data))
                            } catch (e) {
                              reject(
                                new Error(
                                  `Failed to parse Google response: ${data}`,
                                ),
                              )
                            }
                          }
                        })
                      })
                      req.on('error', reject)
                      req.write(postData)
                      req.end()
                    },
                  )
                  if (
                    !tokenResponse.access_token ||
                    !tokenResponse.refresh_token
                  ) {
                    throw new Error(
                      'Google did not return valid tokens. Make sure you copied the complete authorization code.',
                    )
                  }
                  const expiry = new Date(
                    Date.now() + tokenResponse.expires_in * 1000,
                  ).toISOString()
                  finalToken = JSON.stringify({
                    access_token: tokenResponse.access_token,
                    token_type: tokenResponse.token_type || 'Bearer',
                    refresh_token: tokenResponse.refresh_token,
                    expiry: expiry,
                  })
                  console.log('✅ Successfully obtained Google Drive tokens')
                } catch (err) {
                  console.error('Failed to exchange authorization code:', err)
                  throw new Error(
                    `Failed to authorize with Google: ${(err as Error).message}. Please try again and make sure you copied the complete authorization code from the redirect URL.`,
                  )
                }
              }

              if (!finalClientId || !finalClientSecret) {
                throw new Error(
                  'Google Drive requires Client ID and Client Secret.',
                )
              }
              if (!finalToken) {
                const authUrl = generateGoogleAuthUrl(finalClientId)
                throw new Error(`Google Drive authorization required. Please visit this URL to authorize:
${authUrl}
Then paste the authorization code or refresh token in the fields above and submit again.`)
              }
              newSectionLines.push('type = drive')
              newSectionLines.push('scope = drive')
              newSectionLines.push(`client_id = ${finalClientId}`)
              newSectionLines.push(`client_secret = ${finalClientSecret}`)
              newSectionLines.push(`token = ${finalToken}`)
              updates.selectedRcloneRemotes =
                updates.selectedRcloneRemotes.filter(
                  (r: unknown) =>
                    typeof r === 'string' && !r.startsWith('gdrive:'),
                )
              updates.enabledRemotes = updates.enabledRemotes.filter(
                (r: unknown) =>
                  typeof r === 'string' && !r.startsWith('gdrive:'),
              )
              break
            }

            case 'dropbox': {
              path =
                input.dropbox['dropbox-path']?.trim() ??
                config.selectedRcloneRemotes
                  ?.find((r: string) => r.startsWith(remoteName + ':'))
                  ?.split(':')[1] ??
                'lnd-backups'

              const clientId = input.dropbox['dropbox-client-id']?.trim()
              const clientSecret =
                input.dropbox['dropbox-client-secret']?.trim()
              const authCode = input.dropbox['dropbox-auth-code']?.trim()
              const refreshToken =
                input.dropbox['dropbox-refresh-token']?.trim()

              const existingToken = existingSection.token
              const hasValidExistingConfig =
                !!existingToken &&
                (existingToken.includes('"refresh_token"') ||
                  (existingToken.includes('"access_token"') &&
                    !existingToken.includes('"access_token":""')))
              const existingClientId = existingSection.client_id || ''
              const existingClientSecret = existingSection.client_secret || ''

              const exchangeCode = async (
                clientId: string,
                clientSecret: string,
                authCode: string,
              ): Promise<any> => {
                return new Promise((resolve, reject) => {
                  const postData = new URLSearchParams({
                    code: authCode,
                    grant_type: 'authorization_code',
                  }).toString()

                  const options = {
                    hostname: 'api.dropboxapi.com',
                    path: '/oauth2/token',
                    method: 'POST',
                    headers: {
                      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'Content-Length': postData.length,
                    },
                  }

                  const req = https.request(options, (res) => {
                    let data = ''
                    res.on('data', (chunk) => {
                      data += chunk
                    })
                    res.on('end', () => {
                      if (res.statusCode !== 200) {
                        reject(
                          new Error(
                            `Dropbox token exchange failed: ${res.statusCode} - ${data}`,
                          ),
                        )
                      } else {
                        try {
                          const json = JSON.parse(data)
                          resolve(json)
                        } catch (e) {
                          reject(e)
                        }
                      }
                    })
                  })

                  req.on('error', reject)
                  req.write(postData)
                  req.end()
                })
              }

              if (clientId && clientSecret && authCode) {
                const tokens = await exchangeCode(
                  clientId,
                  clientSecret,
                  authCode,
                )
                const { access_token, refresh_token, expires_in } = tokens
                if (!refresh_token) {
                  throw new Error(
                    'Failed to obtain refresh token from Dropbox.',
                  )
                }
                const expiry = new Date(
                  Date.now() + expires_in * 1000,
                ).toISOString()
                newSectionLines.push('type = dropbox')
                newSectionLines.push(`client_id = ${clientId}`)
                newSectionLines.push(`client_secret = ${clientSecret}`)
                newSectionLines.push(
                  `token = {"access_token":"${access_token}","token_type":"bearer","refresh_token":"${refresh_token}","expiry":"${expiry}"}`,
                )
              } else if (clientId && clientSecret && refreshToken) {
                newSectionLines.push('type = dropbox')
                newSectionLines.push(`client_id = ${clientId}`)
                newSectionLines.push(`client_secret = ${clientSecret}`)
                newSectionLines.push(
                  `token = {"access_token":"DUMMY","token_type":"bearer","refresh_token":"${refreshToken}","expiry":"2020-01-01T00:00:00Z"}`,
                )
              } else if (
                hasValidExistingConfig &&
                existingClientId &&
                existingClientSecret
              ) {
                newSectionLines.push('type = dropbox')
                newSectionLines.push(`client_id = ${existingClientId}`)
                newSectionLines.push(`client_secret = ${existingClientSecret}`)
                newSectionLines.push(`token = ${existingToken}`)
              } else {
                throw new Error(
                  'Dropbox: Provide either (App Key + App Secret + Authorization Code) or (App Key + App Secret + Refresh Token).',
                )
              }

              updates.selectedRcloneRemotes =
                updates.selectedRcloneRemotes.filter(
                  (r: unknown) =>
                    typeof r === 'string' && !r.startsWith('dropbox:'),
                )
              updates.enabledRemotes = updates.enabledRemotes.filter(
                (r: unknown) =>
                  typeof r === 'string' && !r.startsWith('dropbox:'),
              )
              break
            }

            case 'nextcloud': {
              path =
                input.nextcloud['nextcloud-path']?.trim() ??
                config.selectedRcloneRemotes
                  ?.find((r: string) => r.startsWith(remoteName + ':'))
                  ?.split(':')[1] ??
                'lnd-backups'
              const url =
                input.nextcloud['nextcloud-url']?.trim() ||
                existingSection.url ||
                ''
              const user =
                input.nextcloud['nextcloud-user']?.trim() ||
                existingSection.user ||
                ''
              let passValue = existingSection.pass || ''
              const passInput = input.nextcloud['nextcloud-pass']?.trim()
              if (passInput) {
                passValue = obscure(passInput)
              } else if (passValue && !isObscured(passValue)) {
                passValue = obscure(passValue)
              }
              if (!url.trim() || !user.trim() || !passValue.trim())
                throw new Error(
                  'Nextcloud URL, username, and password are required.',
                )

              newSectionLines.push('type = webdav')
              newSectionLines.push(`url = ${url}`)
              newSectionLines.push('vendor = nextcloud')
              newSectionLines.push(`user = ${user}`)
              newSectionLines.push(`pass = ${passValue}`)

              if (url.includes('.onion')) {
                newSectionLines.push('http_proxy = socks5://10.0.3.1:9050')
                newSectionLines.push('https_proxy = socks5://10.0.3.1:9050')
                newSectionLines.push('no_check_certificate = true')
              }

              updates.selectedRcloneRemotes =
                updates.selectedRcloneRemotes.filter(
                  (r: unknown) =>
                    typeof r === 'string' && !r.startsWith('nextcloud:'),
                )
              updates.enabledRemotes = updates.enabledRemotes.filter(
                (r: unknown) =>
                  typeof r === 'string' && !r.startsWith('nextcloud:'),
              )
              break
            }

            case 'sftp': {
              const sftpInput = input.sftp.auth
              const authInput = sftpInput.value
              const host =
                (authInput as any)['sftp-host']?.trim() ||
                existingSection.host ||
                ''
              const user =
                (authInput as any)['sftp-user']?.trim() ||
                existingSection.user ||
                ''
              const port =
                (authInput as any)['sftp-port']?.trim() ||
                existingSection.port ||
                '22'
              path =
                (authInput as any)['sftp-path']?.trim() ||
                config.selectedRcloneRemotes
                  ?.find((r: string) => r.startsWith('sftp:'))
                  ?.split(':')[1] ||
                'lnd-backups'

              if (!host || !user) {
                throw new Error('SFTP host and username are required.')
              }

              newSectionLines.push('type = sftp')
              newSectionLines.push(`host = ${host}`)
              newSectionLines.push(`user = ${user}`)
              newSectionLines.push('key_use_agent = false')

              if (host.endsWith('.onion')) {
                newSectionLines.push('socks_proxy = 10.0.3.1:9050')
                newSectionLines.push('shell_type = unix')
                newSectionLines.push('md5sum_command = md5sum')
                newSectionLines.push('sha1sum_command = sha1sum')
              }

              newSectionLines.push(`port = ${port}`)

              if (sftpInput.selection === 'password') {
                const passInput = (authInput as any)['sftp-pass']?.trim()
                let passValue = existingSection.pass || ''
                if (passInput) {
                  passValue = obscure(passInput)
                } else if (passValue && !isObscured(passValue)) {
                  passValue = obscure(passValue)
                }
                if (passValue) {
                  newSectionLines.push(`pass = ${passValue}`)
                }
              } else if (sftpInput.selection === 'key') {
                const keyInput = (authInput as any)['sftp-key']
                let keyValue = ''

                if (keyInput && keyInput.trim()) {
                  const begin = '-----BEGIN OPENSSH PRIVATE KEY-----'
                  const end = '-----END OPENSSH PRIVATE KEY-----'
                  const normalizedKey = keyInput
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .trim()

                  if (
                    !normalizedKey.includes(begin) ||
                    !normalizedKey.includes(end)
                  ) {
                    throw new Error(
                      'Invalid SSH key: missing BEGIN/END markers.',
                    )
                  }

                  const beginIdx = normalizedKey.indexOf(begin)
                  const endIdx = normalizedKey.indexOf(end)

                  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
                    throw new Error('Invalid SSH key: malformed structure.')
                  }

                  const header = begin
                  const footer = end
                  const bodyStart = beginIdx + begin.length
                  const bodyEnd = endIdx
                  const body = normalizedKey
                    .substring(bodyStart, bodyEnd)
                    .replace(/\s+/g, '')

                  const lines = [header]
                  for (let i = 0; i < body.length; i += 70) {
                    lines.push(body.substring(i, i + 70))
                  }
                  lines.push(footer)

                  const reformattedKey = lines.join('\n')
                  keyValue = reformattedKey.replace(/\n/g, '\\n')
                } else if (existingSection.key_pem) {
                  keyValue = existingSection.key_pem
                }

                if (!keyValue) {
                  throw new Error('SFTP private key is required.')
                }

                newSectionLines.push(`key_pem = ${keyValue}`)
              } else {
                throw new Error('Invalid SFTP auth selection.')
              }

              updates.selectedRcloneRemotes = (
                updates.selectedRcloneRemotes || []
              ).filter(
                (r: unknown) => typeof r === 'string' && !r.startsWith('sftp:'),
              )
              updates.enabledRemotes = (updates.enabledRemotes || []).filter(
                (r: unknown) => typeof r === 'string' && !r.startsWith('sftp:'),
              )
              break
            }
          }

          newSections += newSectionLines.join('\n') + '\n'
          existingConf = removeSection(existingConf, remoteName)
          const remotePath = `${remoteName}:${path}`
          newRemotes.push(remotePath)
          newEnabled.push(remotePath)
        } else {
          const from =
            input.email['email-from']?.trim() || config.emailBackup?.from || ''
          const to =
            input.email['email-to']?.trim() || config.emailBackup?.to || ''
          const server =
            input.email['email-smtp-server']?.trim() ||
            config.emailBackup?.smtp_server ||
            'smtp.gmail.com'
          const port =
            input.email['email-smtp-port']?.trim() ||
            config.emailBackup?.smtp_port?.toString() ||
            '465'
          const user =
            input.email['email-smtp-user']?.trim() ||
            config.emailBackup?.smtp_user ||
            ''
          const pass =
            input.email['email-smtp-pass']?.trim() ||
            config.emailBackup?.smtp_pass ||
            ''
          if (!from.trim() || !to.trim() || !user.trim() || !pass.trim())
            throw new Error(
              'Email from, to, SMTP user, and password are required.',
            )
          updates.emailBackup = {
            from,
            to,
            smtp_server: server,
            smtp_port: parseInt(port),
            smtp_user: user,
            smtp_pass: pass,
            body: input.email['email-body'] || '',
          }
          updates.emailEnabled = true
        }
      }

      const finalConf = (existingConf.trim() + '\n' + newSections.trim()).trim()
      if (finalConf) {
        updates.rcloneConfig = Buffer.from(finalConf, 'utf8').toString('base64')
      } else {
        updates.rcloneConfig = null
      }

      if (newRemotes.length) {
        updates.selectedRcloneRemotes = [
          ...updates.selectedRcloneRemotes,
          ...newRemotes,
        ]
      }
      if (newEnabled.length) {
        updates.enabledRemotes = [...updates.enabledRemotes, ...newEnabled]
      }

      await customConfigJson.write(effects, { ...config, ...updates })

      return {
        version: '1',
        title: 'Channels - Auto-Backup',
        message: `<span class="g-card"><header>Status: ENABLED 
                  <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiMwMGZmOGEiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjMDBmZjhhIj5iYWNrdXAtb3V0bGluZTwvdGl0bGU+PHBhdGggZmlsbD0iIzAwZmY4YSIgZD0iTTYuNSAyMHEtMi4yOCAwLTMuODktMS41N1ExIDE2Ljg1IDEgMTQuNThxMC0xLjk1IDEuMTctMy40OHExLjE4LTEuNTMgMy4wOC0xLjk1cS42My0yLjMgMi41LTMuNzJROS42MyA0IDEyIDRxMi45MyAwIDQuOTYgMi4wNFExOSA4LjA3IDE5IDExcTEuNzMuMiAyLjg2IDEuNXExLjE0IDEuMjggMS4xNCAzcTAgMS44OC0xLjMxIDMuMTlUMTguNSAyMEgxM3EtLjgyIDAtMS40MS0uNTlRMTEgMTguODMgMTEgMTh2LTUuMTVMOS40IDE0LjRMOCAxM2w0LTRsNCA0bC0xLjQgMS40bC0xLjYtMS41NVYxOGg1LjVxMS4wNSAwIDEuNzctLjczcS43My0uNzIuNzMtMS43N3QtLjczLTEuNzdRMTkuNTUgMTMgMTguNSAxM0gxN3YtMnEwLTIuMDctMS40Ni0zLjU0UTE0LjA4IDYgMTIgNlE5LjkzIDYgOC40NiA3LjQ2UTcgOC45MyA3IDExaC0uNXEtMS40NSAwLTIuNDcgMS4wM1EzIDEzLjA1IDMgMTQuNVQ0LjAzIDE3cTEuMDIgMSAyLjQ3IDFIOXYybTMtNyIvPjwvc3ZnPg==" alt="backup" width="48" height="48"></header>
                  <span class="g-secondary">Your <b><span class="g-primary">channel.backup</span></b> will be synced to the selected provider(s) whenever a channel is opened or closed.</span></span>
                  <hr>
                  <table class="g-table tui-space_top-2"><tbody><tr><td><div class="g-title"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmNjMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZjYzAwIj5vdXRsaW5lLXByaXZhY3ktdGlwPC90aXRsZT48cGF0aCBmaWxsPSIjZmZjYzAwIiBkPSJtMTIgMy4xOWw3IDMuMTFWMTFjMCA0LjUyLTIuOTggOC42OS03IDkuOTNjLTQuMDItMS4yNC03LTUuNDEtNy05LjkzVjYuM3pNMTIgMUwzIDV2NmMwIDUuNTUgMy44NCAxMC43NCA5IDEyYzUuMTYtMS4yNiA5LTYuNDUgOS0xMlY1em0tMSA2aDJ2MmgtMnptMCA0aDJ2NmgtMnoiLz48L3N2Zz4=" alt="tip" width="32" height="32"> <span class="g-primary">To verify that automatic channel backups are working, follow these steps:</span></div></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmMxMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZjMTAwIj5iYXNlbGluZS1maWx0ZXItMTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmYzEwMCIgZD0iTTMgNUgxdjE2YzAgMS4xLjkgMiAyIDJoMTZ2LTJIM3ptMTEgMTBoMlY1aC00djJoMnptNy0xNEg3Yy0xLjEgMC0yIC45LTIgMnYxNGMwIDEuMS45IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0yVjNjMC0xLjEtLjktMi0yLTJtMCAxNkg3VjNoMTR6Ii8+PC9zdmc+" alt="baseline-filter-1" width="24" height="24">&nbsp;&nbsp;Test backup provider(s) by running "Actions ⇢ Security ⇢ Channels - Test Auto-Backup".</span></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmQwMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZkMDAwIj5udW1iZXItMi1ib3gtbXVsdGlwbGUtb3V0bGluZTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmZDAwMCIgZD0iTTE3IDEzaC00di0yaDJhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJoLTR2Mmg0djJoLTJhMiAyIDAgMCAwLTIgMnY0aDZtNCAySDdWM2gxNG0wLTJIN2EyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlYzYTIgMiAwIDAgMC0yLTJNMyA1SDF2MTZhMiAyIDAgMCAwIDIgMmgxNnYtMkgzeiIvPjwvc3ZnPg==" alt="number-2-box-multiple-outline" width="24" height="24">&nbsp;&nbsp;Check the LND logs to confirm success or failure for every enabled provider.</span></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmMxMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZjMTAwIj5udW1lcmljLXRocmVlLWJveC1tdWx0aXBsZS1vdXRsaW5lPC90aXRsZT48cGF0aCBmaWxsPSIjZmZjMTAwIiBkPSJNMTcgMTN2LTEuNWExLjUgMS41IDAgMCAwLTEuNS0xLjVBMS41IDEuNSAwIDAgMCAxNyA4LjVWN2EyIDIgMCAwIDAtMi0yaC00djJoNHYyaC0ydjJoMnYyaC00djJoNGEyIDIgMCAwIDAgMi0yTTMgNUgxdjE2YTIgMiAwIDAgMCAyIDJoMTZ2LTJIM20xOC00SDdWM2gxNG0wLTJIN2EyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlYzYTIgMiAwIDAgMC0yLTIiLz48L3N2Zz4=" alt="numeric-three-box-multiple-outline" width="24" height="24">&nbsp;&nbsp;Verify that the backup destination(s) and/or email contain the channel.backup file.</span></td></tr>
                  </tbody></table>`,
        result: null,
      }
    } catch (e) {
      console.error('addBackupTarget submit error:', e)
      return {
        version: '1',
        title: 'Error',
        message:
          (e as Error).message ||
          'An unexpected error occurred. Please try again.',
        result: null,
      }
    }
  },
)
