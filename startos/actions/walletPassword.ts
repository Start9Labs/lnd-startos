import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'
import type { Effects } from '@start9labs/start-sdk/base/lib/types'
import { lndDataDir, mainMounts } from '../utils'
import { lndConfFile } from '../fileModels/lnd.conf'

const { InputSpec, Value } = sdk

// --- manualWalletUnlock Action ---

type ManualUnlockInput = {
  password: string
}

export const manualWalletUnlock = sdk.Action.withInput(
  'manual-wallet-unlock',
  // --- Metadata Function ---
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: 'Unlock Wallet Manually',
      description: 'Enter your wallet password to unlock LND manually.',
      warning: 'Enter the correct password to unlock your wallet.',
      allowedStatuses: 'any',
      group: 'Security',
      visibility: store?.autoUnlockEnabled === false ? 'enabled' : { disabled: 'Auto-unlock is enabled or wallet not initialized for manual unlock' },
    }
  },
  // --- Input Specification ---
  InputSpec.of({
    password: Value.text({
      name: 'Wallet Password',
      description: 'Enter your wallet password to unlock LND.',
      required: true,
      masked: true,
      default: null,
    }),
  }),
  // --- Pre-fill Function ---
  async () => ({}),
  // --- Run Function ---
  async ({ effects, input }: { effects: Effects; input: ManualUnlockInput }) => {
    const { password } = input
    const store = await storeJson.read().const(effects)
    if (!store?.walletInitialized) {
      throw new Error('Wallet not initialized')
    }

    // Encode password to base64
    const walletPasswordBase64 = Buffer.from(password, 'utf8').toString('base64')
    console.log('Unlocking wallet with provided password (base64):************************')//, walletPasswordBase64)

    try {
      // Execute curl command to unlock wallet using a temporary subcontainer
      const res = await sdk.SubContainer.withTemp(
        effects,
        { imageId: 'lnd' },
        mainMounts,
        'manual-unlock-temp',
        async (lndSub) => {
          // Read 'restore' and 'recoveryWindow' from the 'store' object within this scope
          const storeForUnlock = (await storeJson.read().const(effects))!
          const currentRestore = storeForUnlock?.restore ?? false
          const currentRecoveryWindow = storeForUnlock?.recoveryWindow ?? 2500

          return await lndSub.exec([
            'curl',
            '--no-progress-meter',
            '-X',
            'POST',
            '--insecure',
            '--cacert',
            `${lndDataDir}/tls.cert`,
            'https://lnd.startos:8080/v1/unlockwallet',
            '-d',
            currentRestore
              ? JSON.stringify({
                  wallet_password: walletPasswordBase64,
                  recovery_window: currentRecoveryWindow,
                })
              : JSON.stringify({
                  wallet_password: walletPasswordBase64,
                }),
          ])
        }
      )

      console.log('wallet-unlock response', res)
      if (res.stdout === '{}' && res.exitCode === 0) {
        console.log('Wallet unlocked successfully via manual action.')
        return {
          version: '1',
          title: 'Wallet Unlocked',
          message: 'Wallet has been successfully unlocked with the provided password.',
          result: null,
        }
      } else {
        let errorMessage = 'Unlock failed: Unexpected response from LND.'
        if (res.stderr) {
          console.error('wallet-unlock error:', res.stderr.toString())
          errorMessage = `Unlock failed: ${(res.stderr?.toString() || '').substring(0, 200)}...`
        }
        throw new Error(errorMessage)
      }
    } catch (err) {
      console.error('Error during manual wallet unlock:', err)
      throw err
    }
  },
)

// --- walletPassword Action (For setting/changing password) ---

type Input = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export const walletPassword = sdk.Action.withInput(
  'wallet-password',
  async ({ effects }: { effects: Effects }) => ({
    name: 'Wallet Password',
    description: 'Display / Change the password used to unlock your LND wallet.',
    warning: null,
    allowedStatuses: 'any',
    group: 'Security',
    visibility: 'enabled',
  }),
  InputSpec.of({
    currentPassword: Value.text({
      name: 'Current Password',
      description: 'Your current wallet password.',
      required: true,
      masked: true,
      default: '',
    }),
    newPassword: Value.text({
      name: 'New Password',
      description: 'Enter your new wallet password (minimum 8 characters).',
      required: true,
      masked: true,
      default: null,
    }),
    confirmPassword: Value.text({
      name: 'Confirm New Password',
      description: 'Re-enter your new wallet password.',
      required: true,
      masked: true,
      default: null,
    }),
  }),
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    const autoUnlockEnabled = store?.autoUnlockEnabled ?? false
    let currentPasswordDefault = ''
    let currentPasswordDescription = 'Your current wallet password.'

    if (autoUnlockEnabled && store?.walletPassword) {
      try {
        const decodedPassword = Buffer.from(store.walletPassword, 'base64').toString('utf8')
        currentPasswordDefault = decodedPassword
        currentPasswordDescription = 'Your current wallet password (loaded from store).'
        console.log('Pre-filling current password field (plaintext) for user convenience (auto-unlock enabled).')
      } catch (decodeError) {
        console.error('Failed to decode wallet password for pre-fill:', decodeError)
        currentPasswordDefault = ''
        currentPasswordDescription = 'Your current wallet password (failed to load from store).'
      }
    } else {
      console.log('Auto-unlock disabled or no password in store. Leaving current password field empty.')
      currentPasswordDescription = 'Your current wallet password (enter manually as auto-unlock is disabled or no password is stored).'
    }

    return {
      currentPassword: currentPasswordDefault,
      newPassword: '',
      confirmPassword: '',
    }
  },
  async ({ effects, input }: { effects: Effects; input: Input }) => {
    const { currentPassword, newPassword, confirmPassword } = input
    const store = await storeJson.read().const(effects)

    if (!store) {
      throw new Error('Store not initialized.')
    }

    const walletInitialized = store.walletInitialized ?? false
    const autoUnlockEnabled = store.autoUnlockEnabled ?? false

    if (!walletInitialized) {
      console.log('Wallet not initialized. Setting initial password.')
      if (newPassword !== confirmPassword) {
        throw new Error('New passwords do not match.')
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters.')
      }
      const encodedNewPassword = Buffer.from(newPassword, 'utf8').toString('base64')
      console.log('Setting initial wallet password (base64):************************')//, encodedNewPassword)

      await storeJson.merge(effects, {
        walletPassword: encodedNewPassword,
        pendingPasswordChange: null,
        passwordChangeError: null,
      })

      console.log('Initial wallet password set successfully.')
      return {
        version: '1',
        title: 'Initial Password Set',
        message: 'Initial wallet password has been set. It will be used when the wallet is initialized.',
        result: null,
      }
    }

    console.log('Wallet is initialized. Performing password change.')
    if (newPassword !== confirmPassword) {
      throw new Error('New passwords do not match.')
    }
    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters.')
    }

    // Validate current password if auto-unlock is enabled and password is stored
    if (autoUnlockEnabled && store.walletPassword) {
      const decodedStorePassword = Buffer.from(store.walletPassword, 'base64').toString('utf8')
      if (currentPassword !== decodedStorePassword) {
        throw new Error('Current password is incorrect (does not match stored password).')
      }
    }

    const encodedNewPassword = Buffer.from(newPassword, 'utf8').toString('base64')
    const encodedCurrentPassword = Buffer.from(currentPassword, 'utf8').toString('base64')
    console.log('Encoded new password (base64):************************')//, encodedNewPassword)
    console.log('Encoded current password (base64):************************')//, encodedCurrentPassword)

    try {
      // Temporarily enable auto-unlock if disabled to use the REST API workflow
      const wasAutoUnlockDisabled = !autoUnlockEnabled
      await storeJson.merge(effects, {
        walletPassword: encodedCurrentPassword,
        pendingPasswordChange: encodedNewPassword,
        autoUnlockEnabled: true, // Temporarily enable for password change
        passwordChangeError: null,
        passwordBackupConfirmed: false,
      })
      console.log('Stored new password in pendingPasswordChange (base64):************************')//, encodedNewPassword)
      console.log('Stored current password in walletPassword (base64):************************')//, encodedCurrentPassword)
      console.log('Temporarily set autoUnlockEnabled to true for password change.')

      // Restart the service to apply the password change (handled by main.ts)
      console.log('Initiating service restart to apply password change...')
      await sdk.restart(effects)
      console.log('Service restart initiated successfully.')

      // Prepare response message
      let message = 'The password change process has been initiated. The service is restarting to apply the change. Please check the service logs or health checks for completion status.'
      if (wasAutoUnlockDisabled) {
        message += ' Auto-unlock has been temporarily enabled to process this change. After confirming the new password works, please go to "Disable Auto-Unlock" to disable it again.'
      }

      return {
        version: '1',
        title: 'Password Change Initiated',
        message,
        result: null,
      }
    } catch (err) {
      console.error('Error initiating password change:', err)
      await storeJson.merge(effects, {
        pendingPasswordChange: null,
        walletPassword: autoUnlockEnabled ? store.walletPassword : null, // Restore original state
        autoUnlockEnabled, // Restore original auto-unlock state
        passwordChangeError: (err as Error).message || String(err),
      })
      throw new Error(`Failed to initiate password change: ${(err as Error).message}`)
    }
  },
)

// --- disableAutoUnlock Action ---

type DisableAutoUnlockInput = {
  autoUnlockEnabled: boolean
  walletPasswordInput?: string | null
}

export const disableAutoUnlock = sdk.Action.withInput(
  'disable-auto-unlock',
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    const currentState = store?.autoUnlockEnabled ?? true
    const walletPasswordExists = !!store?.walletPassword

    let actionName = ''
    let actionDescription = ''
    let actionWarning = ''

    if (currentState) {
      actionName = 'Disable Auto-Unlock Wallet'
      actionDescription = 'Status: ENABLED | Disable auto-unlocking of the LND wallet on startup.'
      actionWarning = 'Disabling auto-unlock will delete your password from store.json and require manual unlocking via lncli when starting LND.'
    } else {
      actionName = 'Enable Auto-Unlock Wallet'
      actionDescription = 'Status: DISABLED | Enable auto-unlocking of the LND wallet on startup.'
      if (walletPasswordExists) {
        actionWarning = 'Enabling auto-unlock. The wallet password is already present on the server.'
      } else {
        actionWarning = 'Enabling auto-unlock requires the wallet password to be present on the server. Please enter it below if needed.'
      }
    }

    return {
      name: actionName,
      description: actionDescription,
      warning: actionWarning,
      allowedStatuses: 'any',
      group: 'Security',
      visibility: 'enabled',
    }
  },
  InputSpec.of({
    autoUnlockEnabled: Value.toggle({
      name: 'Auto-Unlock Wallet',
      description: 'Enable or disable auto-unlocking of the wallet on startup.',
      default: true,
    }),
    walletPasswordInput: Value.text({
      name: 'Wallet Password (if enabling)',
      description: 'Enter your wallet password if enabling auto-unlock and it\'s not already stored.',
      required: false,
      masked: true,
      default: null,
    }),
  }),
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      autoUnlockEnabled: store?.autoUnlockEnabled ?? true,
      walletPasswordInput: null,
    }
  },
  async ({ effects, input }: { effects: Effects; input: DisableAutoUnlockInput }) => {
    const store = await storeJson.read().const(effects)
    const currentState = store?.autoUnlockEnabled ?? true
    const walletPasswordExists = !!store?.walletPassword

    if (!input.autoUnlockEnabled && !store?.passwordBackupConfirmed) {
      throw new Error('Password backup must be confirmed before disabling auto-unlock.')
    }

    if (!input.autoUnlockEnabled) {
      await storeJson.merge(effects, {
        autoUnlockEnabled: false,
        walletPassword: null,
        passwordBackupConfirmed: false,
      })
      console.log('Auto-unlock disabled. Password cleared from store.json.')
      return {
        version: '1',
        title: 'Auto-Unlock Disabled',
        message: 'Auto-unlock has been disabled. Password has been deleted from store.json. You will need to manually unlock the wallet on startup.',
        result: null,
      }
    } else {
      let passwordToUse = store?.walletPassword

      if (input.walletPasswordInput != null && input.walletPasswordInput.trim() !== '') {
        console.log('Password provided in input. Encoding and storing.')
        const encodedInputPassword = Buffer.from(input.walletPasswordInput.trim(), 'utf8').toString('base64')
        await storeJson.merge(effects, {
          walletPassword: encodedInputPassword,
        })
        passwordToUse = encodedInputPassword
      }

      if (!passwordToUse) {
        throw new Error('Cannot enable auto-unlock: No wallet password found in store.json and none provided. Please enter the password.')
      }

      // Clear task
      try {
        await sdk.action.clearTask(effects, 'lnd', 'manual-wallet-unlock')
        console.log('Manual unlock task cleared when enabling auto-unlock.')
      } catch (err) {
        console.warn('Could not clear manual unlock task (likely already gone).')
      }

      await storeJson.merge(effects, { autoUnlockEnabled: true })
      console.log('Auto-unlock enabled in store.json.')

      // Restart to apply
      await sdk.restart(effects)

      const msgSuffix = (input.walletPasswordInput != null && input.walletPasswordInput.trim() !== '') ? ' The provided password has been stored.' : ''
      return {
        version: '1',
        title: 'Auto-Unlock Enabled',
        message: `Auto-unlock has been enabled. The wallet will unlock automatically on startup using the stored password. The service is restarting to apply changes.${msgSuffix}`,
        result: null,
      }
    }
  },
)