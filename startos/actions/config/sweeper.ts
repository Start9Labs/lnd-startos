import { lndConfFile } from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'
import { lndConfDefaults } from '../../utils'

const { InputSpec, Value } = sdk

const {
  'sweeper.maxfeerate': sweeperMaxfeerate,
  'sweeper.nodeadlineconftarget': sweeperNodeadlineconftarget,
  'sweeper.budget.tolocalratio': sweeperBudgetTolocalration,
  'sweeper.budget.anchorcpfpratio': sweeperBudgetAnchorcpfpratio,
  'sweeper.budget.deadlinehtlcratio': sweeperBudgetDeadlinehtlcratio,
  'sweeper.budget.nodeadlinehtlcratio': sweeperBudgetNodeadlinehtlcratio,
} = lndConfDefaults

const sweeperSpec = InputSpec.of({
  'sweeper-maxfeerate': Value.number({
    name: 'Max Fee Rate',
    description:
      'The max fee rate in sat/vb which can be used when sweeping funds. Setting this value too low can result in transactions not being confirmed in time, causing HTLCs to expire hence potentially losing funds.',
    default: sweeperMaxfeerate,
    required: true,
    min: 1,
    integer: true,
    units: 'Sats/vb',
  }),
  'sweeper-nodeadlineconftarget': Value.number({
    name: 'Non-time-sensitive Sweep Confirmation Target',
    description:
      'The conf target to use when sweeping non-time-sensitive outputs. This is useful for sweeping outputs that are not time-sensitive, and can be swept at a lower fee rate.',
    default: sweeperNodeadlineconftarget,
    required: true,
    min: 1,
    integer: true,
    units: 'Confirmations',
  }),
  'sweeper-budget-tolocalratio': Value.number({
    name: 'Budget to Local Ratio',
    description:
      'The ratio (expressed as a decimal) of the value in to_local output to allocate as the budget to pay fees when sweeping it.',
    default: sweeperBudgetTolocalration,
    required: true,
    min: 0,
    max: 1,
    integer: false,
  }),
  'sweeper-budget-anchorcpfpratio': Value.number({
    name: 'Anchor CPFP Ratio',
    description:
      'The ratio of a special value to allocate as the budget to pay fees when CPFPing a force close tx using the anchor output. The special value is the sum of all time-sensitive HTLCs on this commitment subtracted by their budgets.',
    default: sweeperBudgetAnchorcpfpratio,
    required: true,
    min: 0,
    max: 1,
    integer: false,
  }),
  'sweeper-budget-deadlinehtlcratio': Value.number({
    name: 'Time-Sensitive HTLC Budget Ratio',
    description:
      'The ratio of the value in a time-sensitive (first-level) HTLC to allocate as the budget to pay fees when sweeping it.',
    default: sweeperBudgetDeadlinehtlcratio,
    required: true,
    min: 0,
    max: 1,
    integer: false,
  }),
  'sweeper-budget-nodeadlinehtlcratio': Value.number({
    name: 'Non-Time-Sensitive HTLC Budget Ratio',
    description:
      'The ratio of the value in a non-time-sensitive (second-level) HTLC to allocate as the budget to pay fees when sweeping it.',
    default: sweeperBudgetNodeadlinehtlcratio,
    required: true,
    min: 0,
    max: 1,
    integer: false,
  }),
})

export const sweeperConfig = sdk.Action.withInput(
  // id
  'sweeper-config',

  // metadata
  async ({ effects }) => ({
    name: 'Sweeper Settings',
    description:
      "'Sweep' is a LND subservice that handles funds sent from dispute resolution contracts to the internal wallet. These config values help inform the sweeper to make decisions regarding how much it burns in on-chain fees in order to recover possibly contested outputs (HTLCs and Breach outputs).",
    warning:
      'These settings can result in loss of funds if poorly congifured. Refer to the LND documentation for more information: https://docs.lightning.engineering/lightning-network-tools/lnd/sweeper',
    allowedStatuses: 'any',
    group: 'Configuration',
    visibility: 'enabled',
  }),

  // form input specification
  sweeperSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any): Promise<PartialSweeperSpec> {
  const lndConf = (await lndConfFile.read().const(effects))!

  const sweeperSettings: PartialSweeperSpec = {
    'sweeper-maxfeerate': lndConf['sweeper.maxfeerate'],
    'sweeper-nodeadlineconftarget': lndConf['sweeper.nodeadlineconftarget'],
    'sweeper-budget-tolocalratio': lndConf['sweeper.budget.tolocalratio'],
    'sweeper-budget-anchorcpfpratio': lndConf['sweeper.budget.anchorcpfpratio'],
    'sweeper-budget-deadlinehtlcratio':
      lndConf['sweeper.budget.deadlinehtlcratio'],
    'sweeper-budget-nodeadlinehtlcratio':
      lndConf['sweeper.budget.nodeadlinehtlcratio'],
  }
  return sweeperSettings
}

async function write(effects: any, input: SweeperSpec) {
  const sweeperSettings = {
    'sweeper.maxfeerate': input['sweeper-maxfeerate'],
    'sweeper.nodeadlineconftarget': input['sweeper-nodeadlineconftarget'],
    'sweeper.budget.tolocalratio': input['sweeper-budget-tolocalratio'],
    'sweeper.budget.anchorcpfpratio': input['sweeper-budget-anchorcpfpratio'],
    'sweeper.budget.deadlinehtlcratio':
      input['sweeper-budget-deadlinehtlcratio'],
    'sweeper.budget.nodeadlinehtlcratio':
      input['sweeper-budget-nodeadlinehtlcratio'],
  }

  await lndConfFile.merge(effects, sweeperSettings)
}

type SweeperSpec = typeof sweeperSpec._TYPE
type PartialSweeperSpec = typeof sweeperSpec._PARTIAL
