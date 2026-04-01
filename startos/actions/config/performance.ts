import {
  fullConfigSpec,
  fileToForm,
  formToFile,
  lndConfFile,
} from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'
import { i18n } from '../../i18n'

export const performanceConfig = sdk.Action.withInput(
  // id
  'performance-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Performance'),
    description: i18n(
      'Performance and maintenance settings for database compaction, invoice cleanup, and network efficiency',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  }),

  // form input specification
  fullConfigSpec.filter({
    'auto-compact': true,
    'gc-canceled-invoices-startup': true,
    'gc-canceled-invoices-live': true,
    'stagger-initial-reconnect': true,
    'ignore-historical-gossip': true,
    'strict-graph-pruning': true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => fileToForm((await lndConfFile.read().const(effects))!),

  // the execution function
  async ({ effects, input }) => lndConfFile.merge(effects, formToFile(input)),
)
