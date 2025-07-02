import { utils, VersionGraph } from '@start9labs/start-sdk'
import { current, other } from './versions'
import { storeJson } from '../fileModels/store.json'
import { lndConfFile } from '../fileModels/lnd.conf'
import { lndConfDefaults, randomPassword } from '../utils'
import { access } from 'fs/promises'

export const versionGraph = VersionGraph.of({
  current,
  other,
  preInstall: async (effects) => {
    try {
      await access('/media/startos/volumes/main/lnd.conf')
      console.log('Found existing lnd.conf')
    } catch {
      console.log("Couldn't find existing lnd.conf. Using defaults")
      await lndConfFile.write(effects, lndConfDefaults)
    }
    try {
      await access('/media/startos/volumes/main/store.json')
      console.log('Found existing store.json')
    } catch {
      console.log("Couldn't find existing store.json. Using defaults")
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
    }
  },
})
