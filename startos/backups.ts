import { sdk } from './sdk'

export const { createBackup, restoreBackup } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.volumes('main')
      .setBackupOptions({
        exclude: ['/data/graph/mainnet/*'],
      })
      .setPreRestore(async (effects) => {
        await sdk.store.setOwn(effects, sdk.StorePath.restore, true)
      }),
)

// TODO Confirm backup exclusion and setting of restore flag