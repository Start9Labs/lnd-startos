import { utils } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

export const seedFiles = sdk.setupOnInit(async (effects, kind) => {
  // Seed the one-time startup flags to their false defaults.
  await startupFlagsJson.merge(effects, {})

  if (kind === 'install') {
    // Seed the defaults that live only in the form spec. A default the shape
    // itself supplies (`.catch()` / `.transform()`) is applied by every merge,
    // install and update alike, so it does not belong here.
    await lndConfFile.merge(effects, {
      'accept-keysend': true,
    })
    await storeJson.merge(effects, {
      walletPassword: utils.getDefaultString({
        charset: 'A-Z,2-7',
        len: 22,
      }),
    })
  } else {
    await lndConfFile.merge(effects, {})
    await storeJson.merge(effects, {})
  }
})
