import { utils } from '@start9labs/start-sdk'
import { access, readFile, writeFile } from 'fs/promises'
import { lndConfFile } from '../fileModels/lnd.conf'
import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

const WALLET_DB_PATH =
  '/media/startos/volumes/main/data/chain/bitcoin/mainnet/wallet.db'
const CHAIN_SQLITE_PATH =
  '/media/startos/volumes/main/data/chain/bitcoin/mainnet/chain.sqlite'

const CUSTOM_CONFIG_PATH = '/media/startos/volumes/main/custom-config.json'

const CUSTOM_CONFIG_DEFAULTS = {
  rcloneConfig: null,
  selectedRcloneRemotes: null,
  enabledRemotes: null,
  channelAutoBackupEnabled: false,
  backupStartupGracePeriod: false,
  emailBackup: null,
  emailEnabled: false,
}

export const seedFiles = sdk.setupOnInit(async (effects, kind) => {
  const raw = await readFile(CUSTOM_CONFIG_PATH, 'utf8').catch(() => null)
  const needsWrite =
    raw === null ||
    (() => {
      try {
        JSON.parse(raw)
        return false
      } catch {
        return true
      }
    })()
  if (needsWrite) {
    await writeFile(
      CUSTOM_CONFIG_PATH,
      JSON.stringify(CUSTOM_CONFIG_DEFAULTS, null, 2),
    )
  }

  // Seed the one-time startup flags to their false defaults.
  await startupFlagsJson.merge(effects, {})

  await storeJson.merge(effects, {
    pendingPasswordChange: null,
    passwordChangeError: null,
  })

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
    await storeJson.merge(effects, {
      walletInitialized: await access(WALLET_DB_PATH)
        .then(() => true)
        .catch(() =>
          access(CHAIN_SQLITE_PATH)
            .then(() => true)
            .catch(() => false),
        ),
    })
  }
})
