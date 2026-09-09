import { configureChannelBackup } from '../actions/configureChannelBackup'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const taskConfigureChannelBackup = sdk.setupOnInit(
  async (effects, kind) => {
    if (kind !== 'install' && kind !== 'restore') return
    await sdk.action.createOwnTask(
      effects,
      configureChannelBackup,
      'important',
      {
        reason:
          kind === 'restore'
            ? i18n(
                'Off-server targets were disabled to protect any newer channel.backup they hold. Retrieve the newest copy you need before enabling them again.',
              )
            : i18n(
                'A StartOS backup only holds the channels you had when you took it. An off-server copy stays current.',
              ),
      },
    )
  },
)
