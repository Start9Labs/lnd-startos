import {
  fullConfigSpec,
  fileToForm,
  formToFile,
  lndConfFile,
} from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'
import { i18n } from '../../i18n'

export const bitcoinConfig = sdk.Action.withInput(
  // id
  'bitcoin-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Bitcoin Channel Configuration Settings'),
    description: i18n(
      'Configuration options for lightning network channel management operating over the Bitcoin network',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  }),

  // form input specification
  fullConfigSpec.filter({
    'default-channel-confirmations': true,
    'base-fee': true,
    'fee-rate': true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => fileToForm((await lndConfFile.read().const(effects))!),

  // the execution function
  async ({ effects, input }) => lndConfFile.merge(effects, formToFile(input)),
)
