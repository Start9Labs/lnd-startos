import { storeJson } from './file-models/store.json'
import { sdk } from './sdk'
import { lndDataDir } from './utils'

export const { createBackup, restoreBackup } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.volumes('main')
      .setBackupOptions({
        exclude: [`${lndDataDir}/graph/mainnet/*`],
      })
      .setPreRestore(async (effects) => {
        await storeJson.merge(effects, { restore: false })
      }),
)

// TODO Confirm backup exclusion and setting of restore flag