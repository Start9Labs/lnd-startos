import { lndConfFile } from '../file-models/lnd.conf'
import { sdk } from '../sdk'
import { bitcoindHost, lndConfDefaults } from '../utils'

const { InputSpec, Value } = sdk

const {
  'fee.url': feeUrl,
  'bitcoin.node': bitcoinNode,
} = lndConfDefaults

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
    description:
      "Confirm the Bitcoin node to be used as the backend for LND",
    warning: null,
    allowedStatuses: 'any',
    group: 'conf',
    visibility: (await sdk.store.getOwn(effects, sdk.StorePath).const())
      .bitcoindSelected
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

async function read(effects: any){
  const lndConf = (await lndConfFile.read.const(effects))!

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
  }

  if (input.bitcoind) {
    Object.assign({
      bitcoinSettings,
      'bitcoind.rpchost': `${bitcoindHost}:8332`,
      'bitcoind.rpccookie': '/mnt/bitcoin/.cookie',
      'bitcoind.zmqpubrawblock': `${bitcoindHost}:28332`,
      'bitcoind.zmqpubrawtx': `${bitcoindHost}:28333`,
      'fee.url': feeUrl,
    })
  } else {
    Object.assign({
      bitcoinSettings,
      'fee.url':
        'https://nodes.lightning.computer/fees/v1/btc-fee-estimates.json',
    })
  }

  await sdk.store.setOwn(
    effects,
    sdk.StorePath.bitcoindSelected,
    input.bitcoind,
  )
  await lndConfFile.merge(effects, bitcoinSettings)
}

type BackendSpec = typeof backendSpec._TYPE
