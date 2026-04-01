import {
  fullConfigSpec,
  fileToForm,
  formToFile,
  lndConfFile,
} from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'
import { i18n } from '../../i18n'

export const channelsConfig = sdk.Action.withInput(
  // id
  'channels-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Channel Settings'),
    description: i18n(
      'Configure channel acceptance policies including size limits, pending channel limits, and close behavior',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  }),

  // form input specification
  fullConfigSpec.filter({
    'default-channel-confirmations': true,
    'min-channel-size': true,
    'max-channel-size': true,
    'wumbo-channels': true,
    'option-scid-alias': true,
    'zero-conf': true,
    'max-pending-channels': true,
    'allow-circular-route': true,
    'reject-push': true,
    'coop-close-target': true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => fileToForm((await lndConfFile.read().const(effects))!),

  // the execution function
  async ({ effects, input }) => lndConfFile.merge(effects, formToFile(input)),
)
