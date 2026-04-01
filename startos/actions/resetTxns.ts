import { i18n } from '../i18n'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

export const resetWalletTransactions = sdk.Action.withoutInput(
  // id
  'reset-wallet-transactions',

  // metadata
  async ({ effects }) => ({
    name: i18n('Reset Wallet Transactions'),
    description: i18n(
      "Resets the best synced height of the wallet back to its birthday, or genesis if the birthday isn't known. This is useful for picking up on-chain transactions that may have been missed by LND",
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // execution function
  async ({ effects }) => {
    await storeJson.merge(effects, { resetWalletTransactions: true })
    return {
      version: '1',
      title: i18n('Success'),
      message: i18n(
        'Resetting wallet transactions on next startup. If LND is already running, it will be automatically reset now.',
      ),
      result: null,
    }
  },
)
