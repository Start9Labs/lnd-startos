import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'
import type { Effects } from '@start9labs/start-sdk/base/lib/types'

const { InputSpec, Value } = sdk

type Input = {
  password: string
}

export const confirmPasswordBackup = sdk.Action.withInput(
  'confirm-password-backup',
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: 'Confirm Password Backup',
      description: 'Confirm you have backed up your wallet password.',
      warning: 'Ensure you have securely backed up your password before confirming.',
      allowedStatuses: 'any',
      group: 'Security',
      visibility: store?.passwordBackupConfirmed
        ? { disabled: 'Password backup already confirmed' }
        : store?.walletPassword
        ? 'enabled'
        : { disabled: 'Wallet password not set' },
    }
  },
  InputSpec.of({
    password: Value.text({
      name: 'Enter Wallet Password',
      description: 'Enter your wallet password to confirm backup.',
      required: true,
      masked: true,
      default: null,
    }),
  }),
  async () => ({}),
  async ({ effects, input }: { effects: Effects; input: Input }) => {
    const store = await storeJson.read().once()
    if (!store?.walletPassword) {
      throw new Error('Wallet password not set.')
    }
    if (store.passwordBackupConfirmed) {
      return {
        version: '1',
        title: 'Password Backup Status',
        message: 'Status: ✅ Confirmed',
        result: null,
      }
    }
    const { password } = input
    const decodedStorePassword = Buffer.from(store.walletPassword, 'base64').toString('utf8')
    if (password !== decodedStorePassword) {
      throw new Error('Password does not match.')
    }
    await storeJson.merge(effects, { passwordBackupConfirmed: true })
    console.log('Password backup confirmed')
    return {
      version: '1',
      title: 'Password Backup Confirmed',
      message: 'Status: ✅ Confirmed',
      result: null,
    }
  },
)

export const deleteWalletPassword = sdk.Action.withoutInput(
  'delete-wallet-password',
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: 'Delete Wallet Password',
      description: 'Delete the wallet password from store.json.',
      warning: 'Ensure you have securely backed up your password before deleting it. This action cannot be undone.',
      allowedStatuses: 'any',
      group: 'Security',
      visibility: !store?.walletInitialized
        ? { disabled: 'Wallet not initialized' }
        : !store?.walletPassword
        ? { disabled: 'Password already deleted' }
        : !store?.passwordBackupConfirmed
        ? { disabled: 'Password backup must be confirmed before deleting the password' }
        : 'enabled',
    }
  },
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    if (!store?.passwordBackupConfirmed) {
      throw new Error('Password backup must be confirmed before deleting the password.')
    }
    await storeJson.merge(effects, { walletPassword: null, passwordBackupConfirmed: false })
    console.log('Wallet password deleted from store.json')
    return {
      version: '1',
      title: 'Password Deleted',
      message: 'Wallet password has been deleted from store.json.',
      result: null,
    }
  },
)