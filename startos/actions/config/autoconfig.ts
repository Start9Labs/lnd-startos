import {
  fileToForm,
  formToFile,
  fullConfigSpec,
  lndConfFile,
} from '../../fileModels/lnd.conf'
import { i18n } from '../../i18n'
import { sdk } from '../../sdk'

// Hidden action driven by dependent services via `sdk.action.createTask`. A
// dependent posts a partial (e.g. { 'onion-messages': true }); the form is
// narrowed to those fields and locked, the user approves, and the values are
// merged into lnd.conf. Mirrors bitcoin-core's `autoconfig`, adapted to LND's
// form↔file split.
export const autoconfig = sdk.Action.withInput(
  // id
  'autoconfig',

  // metadata
  async ({ effects }) => ({
    name: i18n('Auto-Configure'),
    description: i18n(
      'Automatically configure lnd.conf for the needs of another service',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'hidden',
  }),

  // input spec
  async ({ effects, prefill }) => {
    if (!prefill) return fullConfigSpec

    return fullConfigSpec
      .filterFromPartial(prefill as typeof fullConfigSpec._PARTIAL)
      .disableFromPartial(
        prefill as typeof fullConfigSpec._PARTIAL,
        i18n('These fields were provided by a task and cannot be edited'),
      )
  },

  // optionally pre-fill the input form
  async ({ effects }) => fileToForm((await lndConfFile.read().const(effects))!),

  // the execution function
  async ({ effects, input }) => lndConfFile.merge(effects, formToFile(input)),
)
