import { lndConfFile } from '../file-models/lnd.conf'
import { sdk } from '../sdk'
import { lndConfDefaults } from '../utils'

const { InputSpec, Value } = sdk

const {
  'protocol.wumbo-channels': protocolWumboChannels,
  'protocol.no-anchors': protocolNoAnchors,
  'protocol.no-script-enforced-lease': protocolNoScriptEnforcedLease,
  'protocol.option-scid-alias': protocolOptionScidAlias,
  'protocol.zero-conf': protocolZeroConf,
  'protocol.simple-taproot-chans': protocolSimpleTaprootChans,
} = lndConfDefaults

const protocolSpec = InputSpec.of({
  'protocol-wumbo-channels': Value.toggle({
    name: 'Enable Wumbo Channels',
    default: protocolWumboChannels,
    description:
      'If set, then lnd will create and accept requests for channels larger than 0.16 BTC ',
  }),
  'protocol-zero-conf': Value.toggle({
    name: 'Enable zero-conf Channels',
    default: protocolZeroConf,
    description:
      'Set to enable support for zero-conf channels. This requires the option-scid-alias flag to also be set. ',
    warning:
      'Zero-conf channels are channels that do not require confirmations to be used. Because of this, the fundee must trust the funder to not double-spend the channel and steal the balance of the channel.',
  }),
  'protocol-option-scid-alias': Value.toggle({
    name: 'Enable option-scid-alias Channels',
    default: protocolOptionScidAlias,
    description:
      'Set to enable support for option_scid_alias channels, which can be referred to by an alias instead of the confirmed ShortChannelID. Additionally, is needed to open zero-conf channels. ',
  }),
  'protocol-no-anchors': Value.toggle({
    name: 'Disable Anchor Channels',
    default: protocolNoAnchors,
    description:
      'Set to disable support for anchor commitments. Anchor channels allow you to determine your fees at close time by using a Child Pays For Parent transaction. ',
  }),
  'protocol-no-script-enforced-lease': Value.toggle({
    name: 'Disable Script Enforced Channel Leases',
    default: protocolNoScriptEnforcedLease,
    description:
      'Set to disable support for script enforced lease channel commitments. If not set, lnd will accept these channels by default if the remote channel party proposes them. Note that lnd will require 1 UTXO to be reserved for this channel type if it is enabled. Note: This may cause you to be unable to close a channel and your wallets may not understand why',
  }),
  'protocol-simple-taproot-chans': Value.toggle({
    name: 'Experimental Taproot Channels',
    default: protocolSimpleTaprootChans,
    description:
      'Taproot Channels improve both privacy and cost efficiency of on-chain transactions. Note: Taproot Channels are experimental and only available for unannounced (private) channels at this time.',
  }),
})

export const protocolConfig = sdk.Action.withInput(
  // id
  'protocol-config',

  // metadata
  async ({ effects }) => ({
    name: 'Protocol Settings',
    description: 'Edit the Protocol settings in lnd.conf',
    warning: null,
    allowedStatuses: 'any',
    group: 'conf',
    visibility: 'enabled',
  }),

  // form input specification
  protocolSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any): Promise<PartialProtocolSpec> {
  const lndConf = (await lndConfFile.read.const(effects))!

  const protocolSettings: PartialProtocolSpec = {
    'protocol-wumbo-channels': lndConf['protocol.wumbo-channels'],
    'protocol-no-anchors': lndConf['protocol.no-anchors'],
    'protocol-no-script-enforced-lease':
      lndConf['protocol.no-script-enforced-lease'],
    'protocol-option-scid-alias': lndConf['protocol.option-scid-alias'],
    'protocol-zero-conf': lndConf['protocol.zero-conf'],
    'protocol-simple-taproot-chans': lndConf['protocol.simple-taproot-chans'],
  }

  return protocolSettings
}

async function write(effects: any, input: ProtocolSpec) {
  const protocolSettings = {
    'protocol.wumbo-channels': input['protocol-wumbo-channels'],
    'protocol.no-anchors': input['protocol-no-anchors'],
    'protocol.no-script-enforced-lease':
      input['protocol-no-script-enforced-lease'],
    'protocol.option-scid-alias': input['protocol-option-scid-alias'],
    'protocol.zero-conf': input['protocol-zero-conf'],
    'protocol.simple-taproot-chans': input['protocol-simple-taproot-chans'],
  }

  await lndConfFile.merge(effects, protocolSettings)
}

type ProtocolSpec = typeof protocolSpec._TYPE
type PartialProtocolSpec = typeof protocolSpec._PARTIAL
