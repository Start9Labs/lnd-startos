import {
  fullConfigSpec,
  fileToForm,
  formToFile,
  lndConfFile,
} from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'
import { i18n } from '../../i18n'

export const routingFeesConfig = sdk.Action.withInput(
  // id
  'routing-fees-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Routing Fees'),
    description: i18n(
      'Configure the default fees and timelock delta applied to forwarded payments on your channels',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  }),

  // form input specification
  fullConfigSpec.filter({
    'base-fee': true,
    'fee-rate': true,
    'timelock-delta': true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => fileToForm((await lndConfFile.read().const(effects))!),

  // the execution function
  async ({ effects, input }) => lndConfFile.merge(effects, formToFile(input)),
)
