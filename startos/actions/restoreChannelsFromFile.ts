import { base64 } from 'rfc4648'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  literal,
  mainMounts,
  selfGrpcHost,
  undialableScbPeer,
  unopenableChannelBackup,
} from '../utils'
import { serverActiveWithin } from '../walletUnlocker'

const { InputSpec, Value } = sdk

type Channel = { channel_point: string }
type Pending = { channel: Channel }[]

const backupPath = '/tmp/channel.backup'

const sameSeed = i18n(
  'Run this only on a node that lost its channel data. If LND with this seed is running anywhere else, stop it first, or its channels get force-closed.',
)

const failure = (res: {
  timedOutAfter: number | null
  stderr: string | Buffer
}) => (res.timedOutAfter ? i18n('timed out') : String(res.stderr).trim())

export const restoreChannelsFromFile = sdk.Action.withInput(
  'restore-channels-from-file',

  async ({ effects }) => ({
    name: i18n('Restore Channels from File'),
    description: i18n(
      'Recover the channels in a channel.backup you hold, such as an emailed copy.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Continuous Backups'),
    visibility: 'enabled',
  }),

  InputSpec.of({
    backup: Value.textarea({
      name: i18n('Channel Backup (base64)'),
      description: i18n(
        'On macOS or Linux, base64 < channel.backup prints it. On Windows, certutil -encode channel.backup channel.txt writes it to channel.txt; paste the whole of that file.',
      ),
      required: true,
      default: null,
    }),
    restore: Value.toggle({
      name: i18n('Restore the channels'),
      description: null,
      footnote: i18n(
        'Leave this off to preview: the action lists the channels in this file that this node does not know, and changes nothing. Turn it on to restore them; the peer of each force-closes it.',
      ),
      warning: `${sameSeed} ${i18n(
        'Lightning Labs strongly recommends against continuing to use a LND node after running restorechanbackup. Please recover and sweep any remaining funds to another wallet. Afterwards LND should be uninstalled. LND can then be re-installed fresh if you would like to continue using LND.',
      )}`,
      default: false,
    }),
  }),

  async () => ({}),

  async ({ effects, input }) => {
    let file: Uint8Array
    try {
      file = base64.parse(
        input.backup.replace(/-----(BEGIN|END) [^-]*-----|\s/g, ''),
      )
    } catch {
      throw new Error(
        i18n(
          'That is not base64. Paste all of what base64 or certutil printed.',
        ),
      )
    }
    if (!(await serverActiveWithin(20_000))) {
      throw new Error(
        i18n(
          'LND has not finished starting: it restores channels only once it has caught up with the chain. Try again later.',
        ),
      )
    }
    const done = (message: string, channelPoints: string[] = []) => ({
      version: '1' as const,
      title: i18n('Restore Channels from File'),
      message,
      result: channelPoints.length
        ? {
            type: 'multiline' as const,
            value: channelPoints.join('\n'),
            copyable: true,
            qr: false,
            masked: false,
            filename: null,
          }
        : null,
    })

    return sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'restore-channels-from-file',
      async (subc) => {
        const lncli = (args: string[], timeout: number) =>
          subc.exec(['lncli', `--rpcserver=${selfGrpcHost}`, ...args], {
            timeout,
          })
        const preview = async <T>(
          args: string[],
          timeout: number,
        ): Promise<T> => {
          const res = await lncli(args, timeout)
          if (res.exitCode !== 0) {
            throw new Error(
              unopenableChannelBackup.test(String(res.stderr))
                ? i18n(
                    'LND could not open this channel.backup: it was made under another seed, or it is damaged. Nothing was restored.',
                  )
                : i18n('LND reported an error during the preview: ${error}', {
                    error: literal(failure(res)),
                  }),
            )
          }
          return JSON.parse(String(res.stdout))
        }

        await subc.writeFile(backupPath, file)
        const { chan_points } = await preview<{ chan_points: string[] }>(
          ['verifychanbackup', '--multi_file', backupPath],
          10_000,
        )
        const [open, pending, closed] = await Promise.all([
          preview<{ channels: Channel[] }>(['listchannels'], 15_000),
          preview<{
            pending_open_channels: Pending
            pending_closing_channels: Pending
            pending_force_closing_channels: Pending
            waiting_close_channels: Pending
          }>(['pendingchannels'], 15_000),
          preview<{ channels: Channel[] }>(['closedchannels'], 15_000),
        ])
        const known = new Set(
          [
            ...open.channels,
            ...closed.channels,
            ...[
              ...pending.pending_open_channels,
              ...pending.pending_closing_channels,
              ...pending.pending_force_closing_channels,
              ...pending.waiting_close_channels,
            ].map((p) => p.channel),
          ].map((c) => c.channel_point),
        )
        const unknown = chan_points.filter((p) => !known.has(p))

        if (!unknown.length) {
          return done(
            i18n(
              'LND already knows every channel in this file, so restoring it changes nothing.',
            ),
          )
        }
        if (!input.restore) {
          return done(
            `${i18n(
              'Channels in this file that this node does not know: ${count}, listed below. Restoring asks the peer of each to force-close it. Nothing has changed yet: to restore them, run this action again with Restore the channels turned on.',
              { count: unknown.length },
            )} ${sameSeed}`,
            unknown,
          )
        }

        const res = await lncli(
          ['restorechanbackup', '--multi_file', backupPath],
          45_000,
        )
        if (res.exitCode !== 0) {
          const peer = String(res.stderr).match(undialableScbPeer)?.[1]
          throw new Error(
            peer
              ? i18n(
                  'LND stopped after recording the channel with ${peer}: the backup holds no address LND can dial for that peer. It is asked to force-close once the two nodes connect, which LND tries at each start with the addresses the network announces for it. Run this action again to restore the rest of the file.',
                  { peer },
                )
              : i18n('LND reported an error during the restore: ${error}', {
                  error: literal(failure(res)),
                }),
          )
        }
        const { num_restored }: { num_restored: number } = JSON.parse(
          String(res.stdout),
        )
        return done(
          num_restored
            ? i18n(
                'Channels recovered: ${count}. LND asks the peer of each to force-close it, and keeps trying any peer that is offline.\n\nNext:\n1. Watch these channels under pending channels, in a wallet or node manager connected to LND, until the closes confirm.\n2. Sweep the funds to another wallet.\n3. Uninstall LND, then install it again if you want to keep using it.',
                { count: num_restored },
              )
            : i18n(
                'LND already knows every channel in this file, so restoring it changes nothing.',
              ),
        )
      },
    )
  },
)
