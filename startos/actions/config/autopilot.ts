import { lndConfFile } from '../../file-models/lnd.conf'
import { sdk } from '../../sdk'
import { lndConfDefaults } from '../../utils'

const { InputSpec, Value, Variants } = sdk

const {
  'autopilot.active': autopilotActive,
  'autopilot.maxchannels': autopilotMaxchannels,
  'autopilot.allocation': autopilotAllocation,
  'autopilot.minchansize': autopilotMinchansize,
  'autopilot.maxchansize': autopilotMaxchansize,
  'autopilot.private': autopilotPrivate,
  'autopilot.minconfs': autopilotMinconfs,
  'autopilot.conftarget': autopilotConftarget,
} = lndConfDefaults

const autopilotSpec = InputSpec.of({
  autopilot: Value.union(
    {
      name: 'Enable Autopilot',
      description:
        'If the autopilot agent should be active or not. The autopilot agent will attempt to AUTOMATICALLY OPEN CHANNELS to put your node in an advantageous position within the network graph.',
      warning:
        'DO NOT ENABLE AUTOPILOT IF YOU WANT TO MANAGE CHANNELS MANUALLY OR IF YOU DO NOT UNDERSTAND THIS FEATURE.',
      default: !autopilotActive ? 'disabled' : 'enabled',
    },
    Variants.of({
      disabled: { name: 'Disabled', spec: InputSpec.of({}) },
      enabled: {
        name: 'Enabled',
        spec: InputSpec.of({
          private: Value.toggle({
            name: 'Private',
            default: autopilotPrivate,
            description:
              "Whether the channels created by the autopilot agent should be private or not. Private channels won't be announced to the network.",
          }),
          maxchannels: Value.number({
            name: 'Maximum Channels',
            description:
              'The maximum number of channels that should be created.',
            default: autopilotMaxchannels,
            required: true,
            min: 1,
            integer: true,
          }),
          allocation: Value.number({
            name: 'Allocation',
            description:
              'The fraction of total funds that should be committed to automatic channel establishment. For example 60% means that 60% of the total funds available within the wallet should be used to automatically establish channels. The total amount of attempted channels will still respect the "Maximum Channels" parameter. ',
            default: autopilotAllocation,
            required: true,
            min: 0,
            max: 100,
            integer: false,
            units: '%',
          }),
          'min-channel-size': Value.number({
            name: 'Minimum Channel Size',
            description:
              'The smallest channel that the autopilot agent should create.',
            default: autopilotMinchansize,
            required: true,
            min: 0,
            integer: true,
            units: 'satoshis',
          }),
          'max-channel-size': Value.number({
            name: 'Maximum Channel Size',
            description:
              'The largest channel that the autopilot agent should create.',
            default: autopilotMaxchansize,
            required: true,
            min: 0,
            integer: true,
            units: 'satoshis',
          }),
          'min-confirmations': Value.number({
            name: 'Minimum Confirmations',
            description:
              'The minimum number of confirmations each of your inputs in funding transactions created by the autopilot agent must have.',
            default: autopilotMinconfs,
            required: true,
            min: 0,
            integer: true,
            units: 'blocks',
          }),
          'confirmation-target': Value.number({
            name: 'Confirmation Target',
            description:
              'The confirmation target (in blocks) for channels opened by autopilot.',
            default: autopilotConftarget,
            required: true,
            min: 0,
            integer: true,
            units: 'blocks',
          }),
        }),
      },
    }),
  ),
})

export const autopilotConfig = sdk.Action.withInput(
  // id
  'autopilot-config',

  // metadata
  async ({ effects }) => ({
    name: 'Autopilot Settings',
    description: 'Edit the Autopilot settings in lnd.conf',
    warning: null,
    allowedStatuses: 'any',
    group: 'Configuration',
    visibility: 'enabled',
  }),

  // form input specification
  autopilotSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any): Promise<PartialAutopilotSpec> {
  const lndConf = (await lndConfFile.read().const(effects))!

  if (!lndConf['autopilot.active']) {
    return {
      autopilot: {
        selection: 'disabled',
      },
    }
  }

  const autopilotSettings: PartialAutopilotSpec = {
    autopilot: {
      selection: 'enabled',
      value: {
        maxchannels: lndConf['autopilot.maxchannels'],
        allocation: lndConf['autopilot.allocation'],
        'min-channel-size': lndConf['autopilot.minchansize'],
        'max-channel-size': lndConf['autopilot.maxchansize'],
        private: lndConf['autopilot.private'],
        'min-confirmations': lndConf['autopilot.minconfs'],
        'confirmation-target': lndConf['autopilot.conftarget'],
      },
    },
  }
  return autopilotSettings
}

async function write(effects: any, input: AutopilotSpec) {
  if (input.autopilot.selection === 'disabled') {
    await lndConfFile.merge(effects, { 'autopilot.active': false })
  } else {
    const {
      maxchannels,
      allocation,
      'min-channel-size': minChannelSize,
      'max-channel-size': maxChannelSize,
      private: autopilotPrivate,
      'min-confirmations': minConfirmations,
      'confirmation-target': confirmationTarget,
    } = input.autopilot.value

    const autopilotSettings = {
      'autopilot.active': true,
      'autopilot.maxchannels': maxchannels,
      'autopilot.allocation': allocation,
      'autopilot.minchansize': minChannelSize,
      'autopilot.maxchansize': maxChannelSize,
      'autopilot.private': autopilotPrivate,
      'autopilot.minconfs': minConfirmations,
      'autopilot.conftarget': confirmationTarget,
    }

    await lndConfFile.merge(effects, autopilotSettings)
  }
}

type AutopilotSpec = typeof autopilotSpec._TYPE
type PartialAutopilotSpec = typeof autopilotSpec._PARTIAL
