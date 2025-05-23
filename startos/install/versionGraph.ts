import { utils, VersionGraph } from '@start9labs/start-sdk'
import { current, other } from './versions'
import { storeJson } from '../fileModels/store.json'
import { lndConfFile } from '../fileModels/lnd.conf'
import { lndConfDefaults, randomPassword } from '../utils'

export const versionGraph = VersionGraph.of({
  current,
  other,
  preInstall: async (effects) => {
    await lndConfFile.write(effects, lndConfDefaults)
    await storeJson.write(effects, {
      aezeedCipherSeed: null,
      walletPassword: utils.getDefaultString(randomPassword),
      recoveryWindow: 2_500,
      bitcoindSelected: false,
      restore: false,
      resetWalletTransactions: false,
      watchtowers: [],
      walletInitialized: false,
    })
  },
})
