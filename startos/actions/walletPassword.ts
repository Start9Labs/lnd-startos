import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { customConfigJson } from '../fileModels/custom-config.json'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { base64 } from 'rfc4648'
import { lndDataDir, mainMounts, selfRestUrl } from '../utils'

const { InputSpec, Value } = sdk

type ManualUnlockInput = {
  password: string
}

export const manualWalletUnlock = sdk.Action.withInput(
  'wallet-manual-unlock',
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    const autoUnlockEnabled = store?.autoUnlockEnabled ?? true
    // With auto-unlock off the action applies only while the wallet is still
    // locked. The `.const` read below re-exports this metadata whenever
    // `walletUnlocked` flips — set by this action's run fn on a successful
    // unlock and reset by main's unlock-wallet oneshot on the next start.
    const config = await customConfigJson.read().const(effects)
    const unlocked = config?.walletUnlocked ?? false
    return {
      name: 'Wallet - Manual Unlock',
      description: 'Enter your wallet password to unlock LND manually.',
      warning: 'Enter the correct password to unlock your wallet.',
      allowedStatuses: 'any',
      group: i18n('Security'),
      visibility: autoUnlockEnabled
        ? {
            disabled:
              'Auto-unlock is enabled or wallet not initialized for manual unlock',
          }
        : unlocked
          ? { disabled: i18n('UNLOCKED') }
          : 'enabled',
    }
  },
  InputSpec.of({
    password: Value.text({
      name: 'Wallet - Password',
      description: 'Enter your wallet password to unlock LND.',
      required: true,
      masked: true,
      default: null,
    }),
  }),
  async () => ({}),
  async ({ effects, input }) => {
    const { password } = input
    const store = await storeJson.read().const(effects)
    if (!store?.walletInitialized) {
      throw new Error('Wallet not initialized')
    }

    const walletPasswordBase64 = base64.stringify(
      Buffer.from(password, 'latin1'),
    )
    console.log('Unlocking wallet (base64):************************')

    try {
      const res = await sdk.SubContainer.withTemp(
        effects,
        { imageId: 'lnd' },
        mainMounts,
        'manual-unlock-temp',
        async (lndSub) => {
          const startupFlags = await startupFlagsJson.read().once()
          const currentRestore = startupFlags?.restore ?? false

          return await lndSub.exec([
            'curl',
            '--no-progress-meter',
            '-X',
            'POST',
            '--cacert',
            `${lndDataDir}/tls.cert`,
            `${selfRestUrl}/v1/unlockwallet`,
            '-d',
            currentRestore
              ? JSON.stringify({
                  wallet_password: walletPasswordBase64,
                  recovery_window: 2_500,
                })
              : JSON.stringify({
                  wallet_password: walletPasswordBase64,
                }),
          ])
        },
      )

      console.log('wallet-unlock response', {
        exitCode: res.exitCode,
        stderr: String(res.stderr).trim(),
      })
      if (res.stdout?.toString().trim() === '{}' && res.exitCode === 0) {
        console.log('Wallet unlocked successfully via manual action.')
        // Flip the flag that drives this action's enabled/disabled state: the
        // metadata `.const` read re-exports with "UNLOCKED" immediately, no
        // curl -v/state round-trip needed.
        await customConfigJson.merge(
          effects,
          { walletUnlocked: true },
          { allowWriteAfterConst: true },
        )
        return {
          version: '1',
          title: `LND Wallet`,
          message: `<hr><span class="g-card"><header>Status: UNLOCKED <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiMwMGZmOGUiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjMDBmZjhlIj5zaGllbGQtdW5sb2NrZWQtb3V0bGluZTwvdGl0bGU+PHBhdGggZmlsbD0iIzAwZmY4ZSIgZD0iTTIxIDExYzAgNS41LTMuOCAxMC43LTkgMTJjLTUuMi0xLjMtOS02LjUtOS0xMlY1bDktNGw5IDR6bS05IDEwYzMuOC0xIDctNS41IDctOS44VjYuM2wtNy0zLjFsLTcgMy4xdjQuOWMwIDQuMyAzLjIgOC44IDcgOS44bTIuOC0xMGgtNC4zVjguNWMwLS44LjctMS4zIDEuNS0xLjNzMS41LjUgMS41IDEuM1Y5aDEuM3YtLjVDMTQuOCA3LjEgMTMuNCA2IDEyIDZTOS4yIDcuMSA5LjIgOC41VjExYy0uNiAwLTEuMi42LTEuMiAxLjJ2My41YzAgLjcuNiAxLjMgMS4yIDEuM2g1LjVjLjcgMCAxLjMtLjYgMS4zLTEuMnYtMy41YzAtLjctLjYtMS4zLTEuMi0xLjMiLz48L3N2Zz4=" alt="shield-unlocked-outline" width="32" height="32"></header>
        <h3 class="g-secondary"><br><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmIxMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZiMTAwIj5zdG9wd2F0Y2gtZHVvdG9uZTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmYjEwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNOS43NSAyLjVhLjc1Ljc1IDAgMCAxIC43NS0uNzVoM2EuNzUuNzUgMCAwIDEgMCAxLjVoLS43NXYxLjUzMmE4LjcgOC43IDAgMCAxIDQuODg0IDIuMDIzbC44MzYtLjgzNWEuNzUuNzUgMCAxIDEgMS4wNiAxLjA2bC0uODM1LjgzNmE4Ljc1IDguNzUgMCAxIDEtNy40NDUtMy4wODRWMy4yNWgtLjc1YS43NS43NSAwIDAgMS0uNzUtLjc1TTEyIDYuMjVhNy4yNSA3LjI1IDAgMSAwIDAgMTQuNWE3LjI1IDcuMjUgMCAwIDAgMC0xNC41IiBjbGlwLXJ1bGU9ImV2ZW5vZGQiLz48cGF0aCBmaWxsPSIjZmZiMTAwIiBkPSJNMTIgNy43NWE1Ljc1IDUuNzUgMCAxIDAgNC45OCA4LjYyNUwxMiAxMy41eiIgb3BhY2l0eT0iLjUiLz48L3N2Zz4=" alt="stopwatch-duotone" height="32" width="32">&nbsp;&nbsp;Your wallet is ready to use. Health checks will update "Wallet Status" within 30 seconds.<br><br></h3></span>`,
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

type Input = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export const walletPassword = sdk.Action.withInput(
  'wallet-password',
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: 'Wallet - Password',
      description:
        'Display / Change the password used to unlock your LND wallet.',
      warning: null,
      allowedStatuses: 'any',
      group: i18n('Security'),
      // The pending change lives in store.json (not startup-flags.json), so the
      // actions read it from the same place main applies it — the enabled and
      // disabled states here and on Wallet - Password Backup stay in sync with
      // a change in progress, and with the store write that restarts main.
      visibility: store?.pendingPasswordChange
        ? {
            disabled:
              'Password change in progress. Please wait for LND to (re)start and apply the new password.',
          }
        : 'enabled',
    }
  },
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

    // store.walletPassword is stored plaintext (see fileModels/store.json.ts),
    // so when auto-unlock is on and a password is present we can offer it as
    // the prefilled "Current Password" — exactly like the secure fork.
    const currentPasswordDefault =
      autoUnlockEnabled && store?.walletPassword ? store.walletPassword : ''
    const currentPasswordDescription =
      autoUnlockEnabled && store?.walletPassword
        ? 'Your current wallet password (loaded from store).'
        : 'Your current wallet password (enter manually).'
    console.log(
      autoUnlockEnabled && store?.walletPassword
        ? 'Pre-filling current password field for user convenience.'
        : 'Auto-unlock disabled or no password in store. Leaving current password field empty.',
    )

    return {
      currentPassword: currentPasswordDefault,
      newPassword: '',
      confirmPassword: '',
    }
  },
  async ({ effects, input }) => {
    const { currentPassword, newPassword, confirmPassword } = input
    const store = await storeJson.read().const(effects)

    if (!store) throw new Error('Store not initialized.')

    const autoUnlockEnabled = store.autoUnlockEnabled ?? false
    // Auto-unlock off ⇒ the wallet password is intentionally absent from the
    // store (the disable action deletes it). main applies the change with the
    // current password while the wallet is LOCKED, so stage it and turn
    // auto-unlock on — exactly like the secure fork. It stays on so the new
    // password can be re-confirmed via Wallet - Password Backup, and the user
    // turns it back off afterwards.
    const needsCurrentPassword = !autoUnlockEnabled || !store.walletPassword

    if (newPassword !== confirmPassword)
      throw new Error('New passwords do not match.')
    if (!newPassword || newPassword.length < 8)
      throw new Error('New password must be at least 8 characters.')
    if (needsCurrentPassword && !currentPassword)
      throw new Error(
        'Current password is required to change the password while auto-unlock is disabled.',
      )

    if (autoUnlockEnabled && store.walletPassword) {
      if (currentPassword !== store.walletPassword) {
        throw new Error('Current password is incorrect.')
      }
    }

    try {
      // Apply the change in main's lnd chain rather than here: an action is
      // capped at 120 s and the endpoint needs a live LND that must still be
      // LOCKED. The new password travels base64 so it is never logged
      // plaintext. Writing store.json also drives the restart — main reads it
      // under a `.const` watch — so allowWriteAfterConst only suppresses the
      // write's own guard, not the restart; sdk.restart below carries it right
      // away regardless.
      await storeJson.merge(
        effects,
        {
          walletPassword: currentPassword,
          pendingPasswordChange: base64.stringify(
            Buffer.from(newPassword, 'utf8'),
          ),
          autoUnlockEnabled: true,
          passwordChangeError: null,
          // A password change makes the previously backed-up password stale,
          // so the backup must be confirmed again: this re-enables Wallet -
          // Password Backup (with the NEW password) until it is.
          passwordBackupConfirmed: false,
        },
        { allowWriteAfterConst: true },
      )

      await sdk.restart(effects)

      const passwordChangingMessage = needsCurrentPassword
        ? `<hr><span class="g-card"><header>Status: CHANGED <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHN0cm9rZT0iIzAwZmY4YSI+PHRpdGxlIHhtbG5zPSIiIHN0cm9rZT0iIzAwZmY4YSI+cGFzc3dvcmQtY2hlY2s8L3RpdGxlPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwZmY4YSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSIgZD0iTTIxIDEzVjhhMiAyIDAgMCAwLTItMkg1YTIgMiAwIDAgMC0yIDJ2NmEyIDIgMCAwIDAgMiAyaDdtMi41IDIuNWwyIDJsNC00TTEyIDExLjAxbC4wMS0uMDExbTMuOTkuMDExbC4wMS0uMDExTTggMTEuMDFsLjAxLS4wMTEiLz48L3N2Zz4=" alt="password-check" width="48" height="48"></header>
        <h3><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9IiNmZmRmMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZkZjAwIj53YXJuaW5nLWxvY2stb3Blbi0yMC1yZWd1bGFyPC90aXRsZT48cGF0aCBmaWxsPSIjZmZkZjAwIiBkPSJNOC41NiAyLjI2MmEuNS41IDAgMCAxIC44OCAwTDE0LjcxNSAxMkgxNWMwLS40MDguMDgxLS43OTYuMjI5LTEuMTVsLTQuOTEtOS4wNjRjLS41NjctMS4wNDgtMi4wNy0xLjA0OC0yLjYzOCAwbC02LjUwMiAxMmExLjUgMS41IDAgMCAwIDEuMzIgMi4yMTVIMTF2LTFIMi40OThhLjUuNSAwIDAgMS0uNDQtLjczOHpNOS41IDYuNWEuNS41IDAgMCAwLTEgMHY0YS41LjUgMCAxIDAgMSAwem0uMjUgNi4yNWEuNzUuNzUgMCAxIDEtMS41IDBhLjc1Ljc1IDAgMCAxIDEuNSAwTTE2IDEydjFoLTNhMSAxIDAgMCAwLTEgMXY0YTEgMSAwIDAgMCAxIDFoNWExIDEgMCAwIDAgMS0xdi00YTEgMSAwIDAgMC0xLTFoLTF2LTFhMSAxIDAgMSAxIDIgMGEuNS41IDAgMCAwIDEgMGEyIDIgMCAxIDAtNCAwbS0uNSA0Ljc1YS43NS43NSAwIDEgMSAwLTEuNWEuNzUuNzUgMCAwIDEgMCAxLjUiLz48L3N2Zz4=" alt="warning-lock-open-20-regular" width="32" height="32"> <span class="g-secondary">Auto-unlock was temporarily enabled so the new password could be applied. After the restart, confirm the new password in <b>Wallet - Password Backup</b>, then turn <b>Wallet - Auto-Unlock</b> back off.</span></h3></span>`
        : `<hr><span class="g-card"><header>Status: CHANGED <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHN0cm9rZT0iIzAwZmY4YSI+PHRpdGxlIHhtbG5zPSIiIHN0cm9rZT0iIzAwZmY4YSI+cGFzc3dvcmQtY2hlY2s8L3RpdGxlPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwZmY4YSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSIgZD0iTTIxIDEzVjhhMiAyIDAgMCAwLTItMkg1YTIgMiAwIDAgMC0yIDJ2NmEyIDIgMCAwIDAgMiAyaDdtMi41IDIuNWwyIDJsNC00TTEyIDExLjAxbC4wMS0uMDExbTMuOTkuMDExbC4wMS0uMDExTTggMTEuMDFsLjAxLS4wMTEiLz48L3N2Zz4=" alt="password-check" width="48" height="48"></header>
        <h3><span class="g-secondary">&nbsp;&nbsp;New wallet password will be set after LND (re)start.</span></h3></span>`

      return {
        version: '1',
        title: 'Wallet Password',
        message: passwordChangingMessage,
        result: null,
      }
    } catch (err) {
      console.error('Error initiating password change:', err)
      // Best-effort undo: if scheduling failed partway, restore the exact
      // prior state so we do not leave the node auto-unlocking with a password
      // the user never validated.
      await storeJson
        .merge(
          effects,
          {
            walletPassword: store.walletPassword,
            autoUnlockEnabled,
            pendingPasswordChange: null,
            passwordChangeError: (err as Error).message || String(err),
            passwordBackupConfirmed: store.passwordBackupConfirmed,
          },
          { allowWriteAfterConst: true },
        )
        .catch(() => {})
      throw new Error(
        `Failed to initiate password change: ${(err as Error).message}`,
      )
    }
  },
)
