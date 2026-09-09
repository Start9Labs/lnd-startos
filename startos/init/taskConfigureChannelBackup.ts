import { configureChannelBackup } from '../actions/configureChannelBackup'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const taskConfigureChannelBackup = sdk.setupOnInit(
  async (effects, kind) => {
    if (kind !== 'install') return
    await sdk.action.createOwnTask(
      effects,
      configureChannelBackup,
      'important',
      {
        reason: i18n(
          'A StartOS backup only holds the channels you had when you took it. An off-server copy stays current.',
        ),
      },
    )
  },
)
