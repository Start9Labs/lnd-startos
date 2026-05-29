import { startupFlagsJson } from './fileModels/startupFlags.json'
import { sdk } from './sdk'

export const { createBackup, restoreInit } = sdk.setupBackups(
  async ({ effects }) =>
    sdk.Backups.ofVolumes('main')
      .setOptions({
        exclude: [
          'data/graph',
          'data/chain/bitcoin/mainnet/channel.db',
          'data/chain/bitcoin/mainnet/sphinxreplay.db',
          'data/chain/bitcoin/mainnet/neutrino.db',
          'data/chain/bitcoin/mainnet/block_headers.bin',
          'data/chain/bitcoin/mainnet/reg_filter_headers.bin',
          'logs',
        ],
      })
      .setPostRestore(async (effects) => {
        await startupFlagsJson.merge(effects, { restore: true })
      }),
)
