import type { BackupFailure } from './fileModels/channel-backup-state.json'
import { i18n } from './i18n'
import { literal } from './utils'

export const channelBackupProviderName = (target: string) =>
  ({
    gdrive: i18n('Google Drive'),
    dropbox: i18n('Dropbox'),
    nextcloud: i18n('Nextcloud'),
    sftp: i18n('SFTP'),
    agent: i18n('Continuous Backup'),
  })[target] ?? target

/** One sentence per failure record backup-agent.sh leaves in the state file. */
function describeFailure(f: BackupFailure): string {
  const target = channelBackupProviderName(f.target)
  const detail = literal(f.detail)
  switch (f.code) {
    case 'upload':
    case 'publish':
    case 'local':
      return i18n('${target}: upload failed: ${detail}', { target, detail })
    case 'check':
      return i18n('${target}: could not be checked: ${detail}', {
        target,
        detail,
      })
    case 'hostkey':
      return i18n(
        '${target}: no host key is recorded for this server. Save the SFTP target again to record it.',
        { target },
      )
    case 'hostkey-unverified':
      return i18n(
        '${target}: its host key has not been confirmed. Compare the fingerprint shown when the target was saved, then save it again with Host key verified turned on.',
        { target },
      )
    case 'timeout':
      return i18n(
        '${target}: not reached before the run ran out of time. The watcher retries on its own.',
        { target },
      )
    default:
      return `${target}: ${f.code} ${f.detail}`.trim()
  }
}

export const describeFailures = (failures: BackupFailure[]) =>
  failures.map(describeFailure).join(' ')
