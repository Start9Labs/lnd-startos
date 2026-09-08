import { describeFailures } from '../channelBackupStatus'
import { channelBackupStateJson } from '../fileModels/channel-backup-state.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { backupAgentScript, literal, mainMounts } from '../utils'

export const backupChannelsNow = sdk.Action.withoutInput(
  'backup-channels-now',

  async ({ effects }) => ({
    name: i18n('Back Up Channels Now'),
    description: i18n(
      'Copy channel.backup to every enabled target right now, and report what each one said.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Backups'),
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    // StartOS caps an action at 120 s; the agent bounds its own rclone calls
    // to fit.
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'backup-channels-now',
      async (sub) => sub.exec(['sh', backupAgentScript, '--once'], {}, 110_000),
    )
    const done = (message: string) => ({
      version: '1' as const,
      title: i18n('Channel Backups'),
      message,
      result: null,
    })

    switch (res.exitCode) {
      case 0:
        return done(i18n('channel.backup was copied to every enabled target.'))
      case 2:
        throw new Error(
          i18n(
            'A restore is in progress. channel.backup is not sent until it completes.',
          ),
        )
      case 3:
        return done(
          i18n(
            'There is no channel.backup to copy yet. LND writes it when your first channel opens.',
          ),
        )
      case 4:
        throw new Error(
          i18n(
            'No backup target is enabled. Run Configure Channel Backups first.',
          ),
        )
      case 5:
        throw new Error(
          i18n('A backup is already running. Try again in a moment.'),
        )
    }

    // The agent leaves each target's outcome in the state file, so the action
    // fails with the same detail the health check shows.
    const failures = (await channelBackupStateJson.read().once())?.failures
    const reason = failures?.length
      ? describeFailures(failures)
      : String(res.stderr).trim().split('\n').slice(-2).join(' ')
    throw new Error(
      i18n('Backup failed: ${reason}', {
        reason: literal(reason) || i18n('The target gave no reason'),
      }),
    )
  },
)
