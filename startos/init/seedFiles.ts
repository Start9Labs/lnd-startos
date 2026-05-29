import { utils } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

export const seedFiles = sdk.setupOnInit(async (effects, kind) => {
  if (kind === 'install') {
    // Seed every non-upstream default so a fresh install matches the form
    // defaults in fullConfigSpec (and "reset defaults"). Any field whose form
    // default overrides the upstream LND default must be listed here; fields
    // left at the upstream default stay unset.
    await lndConfFile.merge(effects, {
      'accept-keysend': true,
      'tor.skip-proxy-for-clearnet-targets': true,
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
