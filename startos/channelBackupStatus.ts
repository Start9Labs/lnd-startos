import { BackupFailure } from './fileModels/channel-backup-state.json'
import { i18n } from './i18n'
import { literal } from './utils'

const targetName = (target: string) =>
  ({
    gdrive: i18n('Google Drive'),
    dropbox: i18n('Dropbox'),
    nextcloud: i18n('Nextcloud'),
    sftp: i18n('SFTP'),
  })[target] ?? target

/** One sentence per failure record backup-agent.sh leaves in the state file. */
function describeFailure(f: BackupFailure): string {
  const target = targetName(f.target)
  const detail = literal(f.detail)
  switch (f.code) {
    case 'upload':
      return i18n('${target}: upload failed: ${detail}', { target, detail })
    case 'check':
      return i18n('${target}: could not be checked: ${detail}', {
        target,
        detail,
      })
    case 'marker':
      return i18n(
        '${target}: its freshness marker is unreadable, so it was left untouched.',
        { target },
      )
    case 'newer':
      return i18n(
        '${target}: holds a channel.backup newer than any this node has seen, so it was left untouched. Retrieve it and run restorechanbackup with it, or run Back Up Channels Now to keep it on the target as an archived copy and continue.',
        { target },
      )
    case 'archive':
      return i18n(
        '${target}: the existing copy could not be archived before replacing it: ${detail}',
        { target, detail },
      )
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
    case 'rolled-back':
      return i18n(
        '${target}: its newest channel.backup is older than the one this node last shipped, so the restore used the copy from the StartOS backup.',
        { target },
      )
    default:
      return `${target}: ${f.code} ${f.detail}`.trim()
  }
}

export const describeFailures = (failures: BackupFailure[]) =>
  failures.map(describeFailure).join(' ')
