import {
  fullConfigSpec,
  fileToForm,
  formToFile,
  lndConfFile,
} from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'
import { i18n } from '../../i18n'

export const general = sdk.Action.withInput(
  // id
  'general',

  // metadata
  async ({ effects }) => ({
    name: i18n('General Settings'),
    description: i18n('General settings for your LND node'),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  }),

  // form input specification
  fullConfigSpec.filter({
    alias: true,
    color: true,
    'accept-keysend': true,
    'use-tor-only': true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => fileToForm((await lndConfFile.read().const(effects))!),

  // the execution function
  async ({ effects, input }) => lndConfFile.merge(effects, formToFile(input)),
)
