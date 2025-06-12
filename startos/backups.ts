import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { lndDataDir } from './utils'

export const { createBackup, restoreInit } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.volumes('main')
      .setBackupOptions({
        exclude: [`${lndDataDir}/data/graph/*`],
      })
      .setPostRestore(async (effects) => {
        await storeJson.merge(effects, { restore: true })
      }),
)

// @TODO Test backup exclusion and restore
