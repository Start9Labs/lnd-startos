import { sdk } from '../sdk'
import { lndDataDir, mainMounts } from '../utils'

const walletDb = `${lndDataDir}/data/chain/bitcoin/mainnet/wallet.db`

/**
 * Tech debt: On update, if the wallet already exists, clear the critical tasks
 * for wallet creation and backend selection — they were already completed in a
 * prior version but the task state doesn't survive the update.
 */
export const clearTasksOnUpdate = sdk.setupOnInit(async (effects, kind) => {
  if (kind !== 'update') return

  const walletExists = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'check-wallet',
    async (subc) => {
      const res = await subc.exec(['test', '-f', walletDb])
      return res.exitCode === 0
    },
  )

  if (walletExists) {
    await sdk.action.clearTask(effects, 'initialize-wallet')
    await sdk.action.clearTask(effects, 'backend-config')
  }
})
