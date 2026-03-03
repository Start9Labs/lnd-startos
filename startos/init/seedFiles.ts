import { utils } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

export const seedFiles = sdk.setupOnInit(async (effects, kind) => {
  if (kind !== 'install') return

  await lndConfFile.merge(effects, {})

  await storeJson.merge(effects, {
    walletPassword: utils.getDefaultString({
      charset: 'A-Z,2-7',
      len: 22,
    }),
  })
})
