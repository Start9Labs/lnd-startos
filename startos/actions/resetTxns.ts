import { sdk } from '../sdk'

export const resetWalletTransactions = sdk.Action.withoutInput(
  // id
  'reset-wallet-transactions',

  // metadata
  async ({ effects }) => ({
    name: 'Reset Wallet Transactions',
    description:
      "Resets the best synced height of the wallet back to its birthday, or genesis if the birthday isn't known. This is useful for picking up on-chain transactions that may have been missed by LND",
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // execution function
  async ({ effects }) => {
    await sdk.store.setOwn(effects, sdk.StorePath.resetWalletTransactions, true)
    return {
      version: '1',
      title: 'Success',
      message:
        'Resetting wallet transactions on next startup. If LND is already running, it will be automatically reset now.',
      result: null,
    }
  },
)
