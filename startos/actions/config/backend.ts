import { lndConfFile } from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'
import { sdk } from '../../sdk'
import { bitcoindHost, lndConfDefaults } from '../../utils'

const { InputSpec, Value } = sdk

const { 'fee.url': feeUrl, 'bitcoin.node': bitcoinNode } = lndConfDefaults

const backendSpec = InputSpec.of({
  bitcoind: Value.toggle({
    name: 'Use Bitcoin Node',
    description:
      'Use Bitcoin node for the LND backend; Note: If using a local node (Core or Knots) LND will require Bitcoin to be fully synced. If Bitcoin Core or Knots is not used LND will use Neutrino, the light bitcoin backend built into LND. As Neutrino involves reliance on third-party nodes it is advisable to use either Core or Knots instead. Once Core or Knots are selected it is not supported to switch to Neutrino.',
    default: bitcoinNode === 'bitcoind',
  }),
})

export const backendConfig = sdk.Action.withInput(
  // id
  'backend-config',

  // metadata
  async ({ effects }) => ({
    name: 'Bitcoin Backend',
    description: 'Confirm the Bitcoin node to be used as the backend for LND',
    warning: null,
    allowedStatuses: 'any',
    group: 'Configuration',
    visibility: (await storeJson.read().const(effects))?.bitcoindSelected
      ? 'hidden'
      : 'enabled',
  }),

  // form input specification
  backendSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any) {
  const lndConf = (await lndConfFile.read().const(effects))!

  const bitcoinSettings = {
    bitcoind: lndConf['bitcoin.node'] === 'bitcoind',
  }
  return bitcoinSettings
}

async function write(effects: any, input: BackendSpec) {
  const bitcoinSettings = {
    'bitcoin.node': input.bitcoind
      ? ('bitcoind' as const)
      : ('neutrino' as const),
    'bitcoind.rpchost': input.bitcoind ? `${bitcoindHost}:8332` : undefined,
    'bitcoind.rpccookie': input.bitcoind ? '/mnt/bitcoin/.cookie' : undefined,
    'bitcoind.zmqpubrawblock': input.bitcoind
      ? lndConfDefaults['bitcoind.zmqpubrawblock']
      : undefined,
    'bitcoind.zmqpubrawtx': input.bitcoind
      ? lndConfDefaults['bitcoind.zmqpubrawtx']
      : undefined,
    'fee.url': input.bitcoind
      ? feeUrl
      : 'https://nodes.lightning.computer/fees/v1/btc-fee-estimates.json',
  }

  await storeJson.merge(effects, { bitcoindSelected: input.bitcoind })
  await lndConfFile.merge(effects, bitcoinSettings)
}

type BackendSpec = typeof backendSpec._TYPE
