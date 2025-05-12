import { lndConfFile } from '../../file-models/lnd.conf'
import { sdk } from '../../sdk'
import { bitcoindHost, lndConfDefaults } from '../../utils'

const { InputSpec, Value } = sdk

const {
  'bitcoin.defaultchanconfs': bitcoinDefaultchanconfs,
  'bitcoin.minhtlc': bitcoinMinhtlc,
  'bitcoin.minhtlcout': bitcoinMinhtlcout,
  'bitcoin.basefee': bitcoinBasefee,
  'bitcoin.feerate': bitcoinFeerate,
  'bitcoin.timelockdelta': bitcoinTimelockdelta,
} = lndConfDefaults

const bitcoinSpec = InputSpec.of({
  'default-channel-confirmations': Value.number({
    name: 'Default Channel Confirmations',
    description:
      "The default number of confirmations a channel must have before it's considered open. LND will require any incoming channel requests to wait this many confirmations before it considers the channel active. ",
    default: bitcoinDefaultchanconfs,
    required: true,
    min: 1,
    max: 6,
    integer: true,
    units: 'blocks',
  }),
  'min-htlc': Value.number({
    name: 'Minimum Incoming HTLC Size',
    description:
      'The smallest HTLC LND will to accept on your channels, in millisatoshis. ',
    default: bitcoinMinhtlc,
    required: true,
    min: 1,
    integer: true,
    units: 'millisatoshis',
  }),
  'min-htlc-out': Value.number({
    name: 'Minimum Outgoing HTLC Size',
    description:
      'The smallest HTLC LND will send out on your channels, in millisatoshis. ',
    default: bitcoinMinhtlcout,
    required: true,
    min: 1,
    integer: true,
    units: 'millisatoshis',
  }),
  'base-fee': Value.number({
    name: 'Routing Base Fee',
    description:
      'The base fee in millisatoshi you will charge for forwarding payments on your channels. ',
    default: bitcoinBasefee,
    required: true,
    min: 0,
    integer: true,
    units: 'millisatoshi',
  }),
  'fee-rate': Value.number({
    name: 'Routing Fee Rate',
    description:
      'The fee rate used when forwarding payments on your channels. The total fee charged is the Base Fee + (amount * Fee Rate / 1000000), where amount is the forwarded amount. Measured in sats per million ',
    default: bitcoinFeerate,
    required: true,
    min: 0,
    max: 1000000,
    integer: true,
    units: 'sats per million',
  }),
  'time-lock-delta': Value.number({
    name: 'Time Lock Delta',
    description:
      "The CLTV delta we will subtract from a forwarded HTLC's timelock value.",
    default: bitcoinTimelockdelta,
    required: true,
    min: 6,
    max: 144,
    integer: true,
    units: 'blocks',
  }),
})

export const bitcoinConfig = sdk.Action.withInput(
  // id
  'bitcoin-config',

  // metadata
  async ({ effects }) => ({
    name: 'Bitcoin Channel Configuration Settings',
    description:
      'Configuration options for lightning network channel management operating over the Bitcoin network',
    warning: null,
    allowedStatuses: 'any',
    group: 'conf',
    visibility: 'enabled',
  }),

  // form input specification
  bitcoinSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any): Promise<PartialBitcoinSpec> {
  const lndConf = (await lndConfFile.read().const(effects))!

  const bitcoinSettings: PartialBitcoinSpec = {
    'default-channel-confirmations': lndConf['bitcoin.defaultchanconfs'],
    'min-htlc': lndConf['bitcoin.minhtlc'],
    'min-htlc-out': lndConf['bitcoin.minhtlcout'],
    'base-fee': lndConf['bitcoin.basefee'],
    'fee-rate': lndConf['bitcoin.feerate'],
    'time-lock-delta': lndConf['bitcoin.timelockdelta'],
  }
  return bitcoinSettings
}

async function write(effects: any, input: BitcoinSpec) {
  const bitcoinSettings = {
    'bitcoin.defaultchanconfs': input['default-channel-confirmations'],
    'bitcoin.minhtlc': input['min-htlc'],
    'bitcoin.minhtlcout': input['min-htlc-out'],
    'bitcoin.basefee': input['base-fee'],
    'bitcoin.feerate': input['fee-rate'],
    'bitcoin.timelockdelta': input['time-lock-delta'],
  }

  await lndConfFile.merge(effects, bitcoinSettings)
}

type BitcoinSpec = typeof bitcoinSpec._TYPE
type PartialBitcoinSpec = typeof bitcoinSpec._PARTIAL
