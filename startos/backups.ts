import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { lndDataDir } from './utils'

export const { createBackup, restoreInit } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.volumes('main')
      .setBackupOptions({
        exclude: [`${lndDataDir}/graph/*`],
      })
      .setPreRestore(async (effects) => {
        await storeJson.merge(effects, { restore: false })
      }),
)

// @TODO Test backup exclusion and restore
