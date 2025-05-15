import { storeJson } from './file-models/store.json'
import { sdk } from './sdk'
import { lndDataDir } from './utils'

export const { createBackup, restoreBackup } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.volumes('main')
      .setBackupOptions({
        exclude: [`${lndDataDir}/graph/*`],
      })
      .setPreRestore(async (effects) => {
        await storeJson.merge(effects, { restore: false })
      }),
)

// TODO Test backup exclusion and restore