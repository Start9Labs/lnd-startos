import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'
import type { Effects } from '@start9labs/start-sdk/base/lib/types'

const { InputSpec, Value } = sdk

type Input = {
  autoUnlockEnabled: boolean
  walletPasswordInput?: string | null
}

export const disableAutoUnlock = sdk.Action.withInput(
  'disable-auto-unlock',
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    const currentState = store?.autoUnlockEnabled ?? false // Default to false to avoid stuck ENABLED state
    const walletInitState = store?.walletInitialized ?? false
    const walletPasswordExists = !!store?.walletPassword

    let actionName = ''
    let actionDescription = ''
    let actionWarning = ''

    if (currentState) {
      actionName = `Auto-Unlock Wallet: ENABLED \u{1F513}`
      actionDescription = `Enable / Disable auto-unlocking of the LND wallet on startup. The disabled state protects your on-chain and off-chain Bitcoin in case of server theft. If enabled, anyone with physical access to the server can reflash StartOS, set a new master password, and use apps (RTL, ThunderHub, etc.) or other methods to steal funds, since the LND wallet.db is automatically unlocked with the password from the store.json file.
      <div>⚠️IMPORTANT: Confirm password backup to disable auto-unlocking because password will be deleted from the server.</div>`
      actionWarning = 'Disabling auto-unlock will delete your password from the server and require manual unlocking via the "Unlock Wallet" action below or in the Dashboard / Tasks when starting LND.'
    } else {
      actionName = `Auto-Unlock Wallet: DISABLED \u{1F512}`
      actionDescription = `Enable / Disable auto-unlocking of the LND wallet on startup. The disabled state protects your on-chain and off-chain Bitcoin in case of server theft. If enabled, anyone with physical access to the server can reflash StartOS, set a new master password, and use apps (RTL, ThunderHub, etc.) or other methods to steal funds, since the LND wallet.db is automatically unlocked with the password from the store.json file.
      <div>⚠️IMPORTANT: Enabling auto-unlock stores password on server, risking fund theft if server is stolen.</div>`
      if (walletPasswordExists) {
        actionWarning = 'Enabling auto-unlock. The wallet password is already present on the server.'
      } else {
        actionWarning = 'Enabling auto-unlock requires the wallet password to be present on the server. Please enter a valid password (minimum 8 characters) below. ⚠️ Ensure the password is correct and at least 8 characters long. If incorrect, the wallet will remain locked, showing the health check error.'
      }
    }

    return {
      name: actionName,
      description: actionDescription,
      warning: actionWarning,
      allowedStatuses: 'any',
      group: 'Security',
      visibility: walletInitState
        ? 'enabled'
        : { disabled: 'Wallet not initialized' },
    }
  },
  InputSpec.of({
    autoUnlockEnabled: Value.toggle({
      name: 'Auto-Unlock Wallet',
      description: 'Enable or disable auto-unlocking of the wallet on startup.',
      default: false, // Changed to false to align with initial state
    }),
    walletPasswordInput: Value.text({
      name: 'Wallet Password (if enabling)',
      description: 'Enter your wallet password if enabling auto-unlock and it\'s not already stored (minimum 8 characters).',
      required: false,
      masked: true,
      default: null,
    }),
  }),
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      autoUnlockEnabled: store?.autoUnlockEnabled ?? false,
      walletPasswordInput: null,
    }
  },
  async ({ effects, input }: { effects: Effects; input: Input }) => {
    const store = await storeJson.read().const(effects)
    const currentState = store?.autoUnlockEnabled ?? false
    const walletPasswordExists = !!store?.walletPassword

    if (!input.autoUnlockEnabled && !store?.passwordBackupConfirmed) {
      throw new Error('Password backup must be confirmed before disabling auto-unlock.')
    }

    if (!input.autoUnlockEnabled) {
      // Disabling auto-unlock
      try {
        await storeJson.merge(effects, {
          autoUnlockEnabled: false,
          walletPassword: null,
          // passwordBackupConfirmed: false, // Keep as is to avoid unintended changes
        })
        console.log('Auto-unlock disabled. Password cleared from store.json.')
        // Restart service to ensure UI updates
        try {
          console.log('Initiating service restart to apply auto-unlock disable and update UI.')
          await sdk.restart(effects)
          console.log('Service restart initiated successfully.')
        } catch (restartErr) {
          console.error('Failed to restart service after disabling auto-unlock:', (restartErr as Error).message || String(restartErr))
          // Revert store changes on restart failure
          await storeJson.merge(effects, {
            autoUnlockEnabled: currentState,
            walletPassword: store?.walletPassword || null,
          })
          throw new Error(`Failed to restart service: ${(restartErr as Error).message}`)
        }
        return {
          version: '1',
          title: 'Auto-Unlock Disabled',
          message: `<div>ℹ️ Wallet is now locked as auto-unlock is disabled.</div>
                    <div>The service is restarting to apply changes.</div>
                    <table class="g-table"><thead><tr><th>⚠️ IMPORTANT: Every time LND restart you need to:</th></tr></thead><tbody>
                    <tr class="ng-star-inserted"><td>1️⃣ Go to "Dashboard ⇢ Tasks" or "Actions ⇢ Security ⇢ Unlock Wallet Manually".</td></tr>
                    <tr class="ng-star-inserted"><td>2️⃣ Enter password to manually unlock the wallet</td></tr></tbody></table>`,
          result: null,
        }
      } catch (err) {
        console.error('Error disabling auto-unlock:', err)
        throw new Error(`Failed to disable auto-unlock: ${(err as Error).message}`)
      }
    } else {
      // Enabling auto-unlock
      let passwordToUse = store?.walletPassword

      if (input.walletPasswordInput != null && input.walletPasswordInput.trim() !== '') {
        const password = input.walletPasswordInput.trim()
        // Validate password length
        if (password.length < 8) {
          console.error('Password validation failed: Password is less than 8 characters.')
          throw new Error('Password must be at least 8 characters long to meet LND requirements.')
        }
        console.log('Password provided in input. Encoding and storing.')
        const encodedInputPassword = Buffer.from(password, 'utf8').toString('base64')
        await storeJson.merge(effects, {
          walletPassword: encodedInputPassword,
        })
        passwordToUse = encodedInputPassword
      }

      if (!passwordToUse) {
        throw new Error('Cannot enable auto-unlock: No wallet password found in store.json and none provided. Please enter a valid password (minimum 8 characters).')
      }

      // Clear manual-wallet-unlock task
      let taskCleared = false
      const maxAttempts = 3
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`Attempting to clear manual-wallet-unlock task (attempt ${attempt}/${maxAttempts})...`)
          await sdk.action.clearTask(effects, 'lnd', 'manual-wallet-unlock')
          console.log(`Successfully cleared manual-wallet-unlock task (attempt ${attempt}).`)
          taskCleared = true
          break
        } catch (clearTaskErr) {
          console.error(`Failed to clear manual-wallet-unlock task (attempt ${attempt}):`, (clearTaskErr as Error).message || String(clearTaskErr))
          if (attempt < maxAttempts) {
            console.log(`Waiting 2 seconds before retrying clearTask (attempt ${attempt + 1})...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }

      if (!taskCleared) {
        console.error('All attempts to clear manual-wallet-unlock task failed. Dashboard may show stale task.')
      }

      // Update store to enable auto-unlock
      try {
        await storeJson.merge(effects, {
          autoUnlockEnabled: true,
        })
        console.log('Auto-unlock enabled in store.json.')
      } catch (err) {
        console.error('Error enabling auto-unlock:', err)
        throw new Error(`Failed to enable auto-unlock: ${(err as Error).message}`)
      }

      // Wait for 5 seconds to ensure clean shutdown before restarting
      console.log('Waiting 5 seconds before initiating service restart...')
      await new Promise(resolve => setTimeout(resolve, 5000))

      // Restart service to apply changes and update UI
      try {
        console.log('Initiating service restart to apply auto-unlock and update UI.')
        await sdk.restart(effects)
        console.log('Service restart initiated successfully.')
        const msgSuffix = input.walletPasswordInput != null && input.walletPasswordInput.trim() !== '' ? ' The provided password has been stored.' : ''
        return {
          version: '1',
          title: 'Auto-Unlock Enabled',
          message: `<div>ℹ️ The wallet will unlock automatically on startup using the stored password.</div>
                    <div>The service is restarting to apply changes and update the UI.</div>
                    <table class="g-table"><thead><tr><th>⚠️ IMPORTANT: If the wallet remains locked (health check shows an error), the password may be incorrect:</th></tr></thead><tbody>
                    <tr class="ng-star-inserted"><td>1️⃣ Return to "Actions ⇢ Security ⇢ Auto-Unlock Wallet".</td></tr>
                    <tr class="ng-star-inserted"><td>2️⃣ Enter correct password and hit "Submit" button.</td></tr>
                    <tr class="ng-star-inserted"><td>3️⃣ Go to "Dashboard ⇢ Health Checks". Wallet Status	must be "Success: Wallet is unlocked".</td></tr></tbody></table>`,
          result: null,
        }
      } catch (restartErr) {
        console.error('Failed to restart service after enabling auto-unlock:', (restartErr as Error).message || String(restartErr))
        // Revert store changes on restart failure
        await storeJson.merge(effects, {
          autoUnlockEnabled: currentState,
          walletPassword: store?.walletPassword || null,
        })
        throw new Error(`Failed to restart service: ${(restartErr as Error).message}`)
      }
    }
  },
)