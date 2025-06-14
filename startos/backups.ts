import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'

export const { createBackup, restoreInit } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.ofVolumes('main')
      .setOptions({ exclude: [`data/graph`] })
      .setPostRestore(async (effects) => {
        await storeJson.merge(effects, { restore: true })
      }),
)

