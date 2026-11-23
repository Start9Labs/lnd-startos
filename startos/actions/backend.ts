import { autoconfig } from 'bitcoin-core-startos/startos/actions/config/autoconfig'
import { apis } from 'rbitcoin-startos/startos/actions/apis'
import { storage } from 'rbitcoin-startos/startos/actions/storage'
import { fileToForm, fullConfigSpec, lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { getBitcoindBundle, getRbitcoinBundle, neutrinoBundle } from '../utils'

export const backendConfig = sdk.Action.withInput(
  // id
  'backend-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Bitcoin Backend'),
    description: i18n(
      'Confirm the Bitcoin node to be used as the backend for LND',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'hidden',
  }),

  // form input specification
  fullConfigSpec.filter({
    bitcoind: true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => fileToForm((await lndConfFile.read().const(effects))!),

  // the execution function
  async ({ effects, input }) => {
    const node = input.bitcoind

    const bitcoinSettings =
      node === 'bitcoind'
        ? await getBitcoindBundle(effects)
        : node === 'rbitcoin'
          ? await getRbitcoinBundle(effects)
          : neutrinoBundle

    if (node !== 'bitcoind') {
      await sdk.action.clearTask(
        effects,
        'enable-zmq',
        `bitcoind:${autoconfig.id}`,
      )
    }
    if (node !== 'rbitcoin') {
      await sdk.action.clearTask(
        effects,
        `rbitcoin:${apis.id}`,
        `rbitcoin:${storage.id}`,
      )
    }

    // The conf first: a store write restarts main, and a main that had read
    // the old conf would write the old backend back over this choice.
    await lndConfFile.merge(effects, bitcoinSettings)
    await storeJson.merge(effects, {
      bitcoinNode: node === 'rbitcoin' ? 'rbitcoin' : 'bitcoind',
    })
  },
)
