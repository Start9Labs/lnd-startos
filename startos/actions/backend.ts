import { fileToForm, fullConfigSpec, lndConfFile } from '../fileModels/lnd.conf'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { bitcoindBundle, neutrinoBundle } from '../utils'

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
    const isBitcoind = input.bitcoind === 'bitcoind'

    const bitcoinSettings = isBitcoind ? bitcoindBundle : neutrinoBundle

    if (!isBitcoind) {
      await sdk.action.clearTask(effects, 'enable-zmq')
    }

    await lndConfFile.merge(effects, bitcoinSettings)
  },
)
