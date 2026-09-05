import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

type Input = {
  autoUnlockEnabled: boolean
  walletPasswordInput?: string | null
}

export const disableAutoUnlock = sdk.Action.withInput(
  'wallet-auto-unlock',
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    const currentState = store?.autoUnlockEnabled ?? false
    const walletInitState = store?.walletInitialized ?? false
    const walletPasswordExists = !!store?.walletPassword

    let actionName = ''
    let actionDescription = ''
    let actionWarning = ''

    if (currentState) {
      actionName = `Wallet - Auto-Unlock: ENABLED \u{1F513}`
      actionDescription = `Enable / Disable auto-unlocking of the LND wallet on startup. Disabling auto-unlock protects your on-chain and off-chain Bitcoin if the server is stolen. When enabled, anyone with physical access can reflash StartOS, set a new master password, and steal funds because the wallet auto-unlocks using the password stored in store.json.
      <div>⚠️IMPORTANT: Password backup must be CONFIRMED before auto-unlock can be disabled. This deletes the password from the server, requiring manual unlock every time LND restarts.</div>`
      actionWarning = `Disabling auto-unlock will delete your password from the server and require manual unlocking using the "Wallet - Manual Unlock" action below, or from the "Dashboard ⇢ Tasks" when starting LND.<br>\u{1F4A1} If you want to switch back to the official StartOS LND package (same version), you must re-enable auto-unlock first.`
    } else {
      actionName = `Wallet - Auto-Unlock: DISABLED \u{1F512}`
      actionDescription = `Enable / Disable auto-unlocking of the LND wallet on startup. Disabling auto-unlock protects your on-chain and off-chain Bitcoin if the server is stolen. When enabled, anyone with physical access can reflash StartOS, set a new master password, and steal funds because the wallet auto-unlocks using the password stored in store.json.
      <div>⚠️IMPORTANT: Lost your password? Restore from a StartOS backup, or use your Aezeed Seed and channel.backup in an external LND wallet.</div>`
      if (walletPasswordExists) {
        actionWarning =
          'Enabling auto-unlock. The wallet password is already present on the server.'
      } else {
        actionWarning =
          'Enabling auto-unlock requires the wallet password to be present on the server. Please enter a valid password (minimum 8 characters) below. ⚠️ Ensure the password is correct and at least 8 characters long. If incorrect, the wallet will remain locked, showing the health check error.'
      }
    }

    return {
      name: actionName,
      description: actionDescription,
      warning: actionWarning,
      allowedStatuses: 'any',
      group: i18n('Security'),
      visibility: walletInitState
        ? 'enabled'
        : { disabled: 'Wallet not initialized' },
    }
  },
  InputSpec.of({
    autoUnlockEnabled: Value.toggle({
      name: 'Auto-Unlock Wallet',
      description: 'Enable or disable auto-unlocking of the wallet on startup.',
      default: false,
    }),
    walletPasswordInput: Value.text({
      name: 'Wallet Password (if enabling)',
      description:
        "Enter your wallet password if enabling auto-unlock and it's not already stored (minimum 8 characters).",
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
  async ({ effects, input }) => {
    const store = await storeJson.read().const(effects)
    const currentState = store?.autoUnlockEnabled ?? false
    const walletPasswordExists = !!store?.walletPassword

    if (!input.autoUnlockEnabled && !store?.passwordBackupConfirmed) {
      throw new Error(
        'Password backup must be confirmed before disabling auto-unlock.',
      )
    }

    if (!input.autoUnlockEnabled) {
      await storeJson.merge(effects, {
        autoUnlockEnabled: false,
        walletPassword: null,
      })
      await sdk.restart(effects)
      console.log('Auto-unlock disabled. Password cleared from store.json.')
      return {
        version: '1',
        title:
          '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmZmZmYiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZmZmZmIj5zaGllbGQtbG9jay1vdXRsaW5lLXJvdW5kZWQ8L3RpdGxlPjxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0xMCAxNmg0cS40MjUgMCAuNzEzLS4yODhUMTUgMTV2LTNxMC0uNDI1LS4yODgtLjcxMlQxNCAxMXYtMXEwLS44MjUtLjU4Ny0xLjQxMlQxMiA4dC0xLjQxMi41ODhUMTAgMTB2MXEtLjQyNSAwLS43MTIuMjg4VDkgMTJ2M3EwIC40MjUuMjg4LjcxM1QxMCAxNm0xLTV2LTFxMC0uNDI1LjI4OC0uNzEyVDEyIDl0LjcxMy4yODhUMTMgMTB2MXptLjY3NSAxMC44NzVxLS4xNS0uMDI1LS4zLS4wNzVROCAyMC42NzUgNiAxNy42MzdUNCAxMS4xVjYuMzc1cTAtLjYyNS4zNjMtMS4xMjV0LjkzNy0uNzI1bDYtMi4yNXEuMzUtLjEyNS43LS4xMjV0LjcuMTI1bDYgMi4yNXEuNTc1LjIyNS45MzguNzI1VDIwIDYuMzc1VjExLjFxMCAzLjUtMiA2LjUzOFQxMi42MjUgMjEuOHEtLjE1LjA1LS4zLjA3NVQxMiAyMS45dC0uMzI1LS4wMjVNMTIgMTkuOXEyLjYtLjgyNSA0LjMtMy4zdDEuNy01LjVWNi4zNzVsLTYtMi4yNWwtNiAyLjI1VjExLjFxMCAzLjAyNSAxLjcgNS41dDQuMyAzLjNtMC03LjkiLz48L3N2Zz4=" alt="shield-lock-outline-rounded" height="48" width="48"> Auto-Unlock Disabled',
        message: `<hr><div><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmZmZmYiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZmZmZmIj5pbmZvLXNoaWVsZDwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0ibTIwLjQyIDYuMTFsLTcuOTctNGMtLjI4LS4xNC0uNjItLjE0LS45IDBsLTcuOTcgNGMtLjMxLjE1LS41MS40NS0uNTUuNzljLS4wMS4xMS0uOTYgMTAuNzYgOC41NSAxNS4wMWEuOTguOTggMCAwIDAgLjgyIDBDMjEuOTEgMTcuNjYgMjAuOTcgNyAyMC45NSA2LjlhLjk4Ljk4IDAgMCAwLS41NS0uNzlaTTEyIDE5LjlDNS4yNiAxNi42MyA0Ljk0IDkuNjQgNSA3LjY0bDctMy41MWw3IDMuNTFjLjA0IDEuOTktLjMzIDkuMDItNyAxMi4yNiIvPjxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0xMSAxMWgydjZoLTJ6bTAtNGgydjJoLTJ6Ii8+PC9zdmc+" alt="info-shield" height="32" width="32"> Wallet is now locked as auto-unlock is disabled. The service is restarting to apply changes.</div>
        <table class="g-table tui-space_top-2">          
        <tbody>
          <tr><td><div class="g-title g-warning"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9IiNmZmRmMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZkZjAwIj53YXJuaW5nLWxvY2stb3Blbi0yMC1yZWd1bGFyPC90aXRsZT48cGF0aCBmaWxsPSIjZmZkZjAwIiBkPSJNOC41NiAyLjI2MmEuNS41IDAgMCAxIC44OCAwTDE0LjcxNSAxMkgxNWMwLS40MDguMDgxLS43OTYuMjI5LTEuMTVsLTQuOTEtOS4wNjRjLS41NjctMS4wNDgtMi4wNy0xLjA0OC0yLjYzOCAwbC02LjUwMiAxMmExLjUgMS41IDAgMCAwIDEuMzIgMi4yMTVIMTF2LTFIMi40OThhLjUuNSAwIDAgMS0uNDQtLjczOHpNOS41IDYuNWEuNS41IDAgMCAwLTEgMHY0YS41LjUgMCAxIDAgMSAwem0uMjUgNi4yNWEuNzUuNzUgMCAxIDEtMS41IDBhLjc1Ljc1IDAgMCAxIDEuNSAwTTE2IDEydjFoLTNhMSAxIDAgMCAwLTEgMXY0YTEgMSAwIDAgMCAxIDFoNWExIDEgMCAwIDAgMS0xdi00YTEgMSAwIDAgMC0xLTFoLTF2LTFhMSAxIDAgMSAxIDIgMGEuNS41IDAgMCAwIDEgMGEyIDIgMCAxIDAtNCAwbS0uNSA0Ljc1YS43NS43NSAwIDEgMSAwLTEuNWEuNzUuNzUgMCAwIDEgMCAxLjUiLz48L3N2Zz4=" alt="warning-lock-open-20-regular" width="32" height="32"> <span class="g-primary">Every time LND restart you need to:
</span></div></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmMxMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZjMTAwIj5iYXNlbGluZS1maWx0ZXItMTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmYzEwMCIgZD0iTTMgNUgxdjE2YzAgMS4xLjkgMiAyIDJoMTZ2LTJIM3ptMTEgMTBoMlY1aC00djJoMnptNy0xNEg3Yy0xLjEgMC0yIC45LTIgMnYxNGMwIDEuMS45IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0yVjNjMC0xLjEtLjktMi0yLTJtMCAxNkg3VjNoMTR6Ii8+PC9zdmc+" alt="baseline-filter-1" width="24" height="24">&nbsp;&nbsp;Go to "Dashboard ⇢ Tasks" or "Actions ⇢ Security ⇢ Wallet - Manual Unlock".</span></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmQwMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZkMDAwIj5udW1iZXItMi1ib3gtbXVsdGlwbGUtb3V0bGluZTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmZDAwMCIgZD0iTTE3IDEzaC00di0yaDJhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJoLTR2Mmg0djJoLTJhMiAyIDAgMCAwLTIgMnY0aDZtNCAySDdWM2gxNG0wLTJIN2EyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlYzYTIgMiAwIDAgMC0yLTJNMyA1SDF2MTZhMiAyIDAgMCAwIDIgMmgxNnYtMkgzeiIvPjwvc3ZnPg==" alt="number-2-box-multiple-outline" width="24" height="24">&nbsp;&nbsp;Enter password to manually unlock the wallet.</span></td></tr>
        </tbody>
      </table>`,
        result: null,
      }
    } else {
      let passwordToUse = store?.walletPassword
      if (
        input.walletPasswordInput != null &&
        input.walletPasswordInput.trim() !== ''
      ) {
        const password = input.walletPasswordInput.trim()
        if (password.length < 8) {
          console.error(
            'Password validation failed: Password is less than 8 characters.',
          )
          throw new Error(
            'Password must be at least 8 characters long to meet LND requirements.',
          )
        }
        passwordToUse = password
      }
      if (!passwordToUse) {
        throw new Error(
          'Cannot enable auto-unlock: No wallet password found in store.json and none provided. Please enter a valid password (minimum 8 characters).',
        )
      }
      await storeJson.merge(effects, {
        autoUnlockEnabled: true,
        walletPassword: passwordToUse,
      })
      await sdk.restart(effects)
      console.log('Auto-unlock enabled in store.json.')

      return {
        version: '1',
        title:
          '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmZmZmYiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZmZmZmIj5zaGllbGQtdW5sb2NrZWQtb3V0bGluZTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTIxIDExYzAgNS41LTMuOCAxMC43LTkgMTJjLTUuMi0xLjMtOS02LjUtOS0xMlY1bDktNGw5IDR6bS05IDEwYzMuOC0xIDctNS41IDctOS44VjYuM2wtNy0zLjFsLTcgMy4xdjQuOWMwIDQuMyAzLjIgOC44IDcgOS44bTIuOC0xMGgtNC4zVjguNWMwLS44LjctMS4zIDEuNS0xLjNzMS41LjUgMS41IDEuM1Y5aDEuM3YtLjVDMTQuOCA3LjEgMTMuNCA2IDEyIDZTOS4yIDcuMSA5LjIgOC41VjExYy0uNiAwLTEuMi42LTEuMiAxLjJ2My41YzAgLjcuNiAxLjMgMS4yIDEuM2g1LjVjLjcgMCAxLjMtLjYgMS4zLTEuMnYtMy41YzAtLjctLjYtMS4zLTEuMi0xLjMiLz48L3N2Zz4=" alt="Wallet Unlocked" height="48px" width="48px"> Auto-Unlock Enabled',
        message: `<hr><br><div><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmZmZmYiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZmZmZmIj5pbmZvLXNoaWVsZDwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0ibTIwLjQyIDYuMTFsLTcuOTctNGMtLjI4LS4xNC0uNjItLjE0LS45IDBsLTcuOTcgNGMtLjMxLjE1LS41MS40NS0uNTUuNzljLS4wMS4xMS0uOTYgMTAuNzYgOC41NSAxNS4wMWEuOTguOTggMCAwIDAgLjgyIDBDMjEuOTEgMTcuNjYgMjAuOTcgNyAyMC45NSA2LjlhLjk4Ljk4IDAgMCAwLS41NS0uNzlaTTEyIDE5LjlDNS4yNiAxNi42MyA0Ljk0IDkuNjQgNSA3LjY0bDctMy41MWw3IDMuNTFjLjA0IDEuOTktLjMzIDkuMDItNyAxMi4yNiIvPjxwYXRoIGZpbGw9IiNmZmZmZmYiIGQ9Ik0xMSAxMWgydjZoLTJ6bTAtNGgydjJoLTJ6Ii8+PC9zdmc+" alt="info-shield" width="24" height="24"> The wallet will unlock automatically on startup using the stored password.</div><br>
          <table class="g-table tui-space_top-2">
          <tbody>
          <tr><td><div class="g-title g-warning"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjAgMjAiIGZpbGw9IiNmZmRmMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZkZjAwIj53YXJuaW5nLWxvY2stb3Blbi0yMC1yZWd1bGFyPC90aXRsZT48cGF0aCBmaWxsPSIjZmZkZjAwIiBkPSJNOC41NiAyLjI2MmEuNS41IDAgMCAxIC44OCAwTDE0LjcxNSAxMkgxNWMwLS40MDguMDgxLS43OTYuMjI5LTEuMTVsLTQuOTEtOS4wNjRjLS41NjctMS4wNDgtMi4wNy0xLjA0OC0yLjYzOCAwbC02LjUwMiAxMmExLjUgMS41IDAgMCAwIDEuMzIgMi4yMTVIMTF2LTFIMi40OThhLjUuNSAwIDAgMS0uNDQtLjczOHpNOS41IDYuNWEuNS41IDAgMCAwLTEgMHY0YS41LjUgMCAxIDAgMSAwem0uMjUgNi4yNWEuNzUuNzUgMCAxIDEtMS41IDBhLjc1Ljc1IDAgMCAxIDEuNSAwTTE2IDEydjFoLTNhMSAxIDAgMCAwLTEgMXY0YTEgMSAwIDAgMCAxIDFoNWExIDEgMCAwIDAgMS0xdi00YTEgMSAwIDAgMC0xLTFoLTF2LTFhMSAxIDAgMSAxIDIgMGEuNS41IDAgMCAwIDEgMGEyIDIgMCAxIDAtNCAwbS0uNSA0Ljc1YS43NS43NSAwIDEgMSAwLTEuNWEuNzUuNzUgMCAwIDEgMCAxLjUiLz48L3N2Zz4=" alt="warning-lock-open-20-regular" width="32" height="32"> <span class="g-primary">Steps to follow if the wallet remains locked (health check error) because the password is incorrect:</span></div></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmMxMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZjMTAwIj5iYXNlbGluZS1maWx0ZXItMTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmYzEwMCIgZD0iTTMgNUgxdjE2YzAgMS4xLjkgMiAyIDJoMTZ2LTJIM3ptMTEgMTBoMlY1aC00djJoMnptNy0xNEg3Yy0xLjEgMC0yIC45LTIgMnYxNGMwIDEuMS45IDIgMiAyaDE0YzEuMSAwIDItLjkgMi0yVjNjMC0xLjEtLjktMi0yLTJtMCAxNkg3VjNoMTR6Ii8+PC9zdmc+" alt="baseline-filter-1" width="24" height="24">&nbsp;&nbsp;Return to "Actions ⇢ Security ⇢ Auto-Unlock Wallet".</span></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmQwMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZkMDAwIj5udW1iZXItMi1ib3gtbXVsdGlwbGUtb3V0bGluZTwvdGl0bGU+PHBhdGggZmlsbD0iI2ZmZDAwMCIgZD0iTTE3IDEzaC00di0yaDJhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJoLTR2Mmg0djJoLTJhMiAyIDAgMCAwLTIgMnY0aDZtNCAySDdWM2gxNG0wLTJIN2EyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlYzYTIgMiAwIDAgMC0yLTJNMyA1SDF2MTZhMiAyIDAgMCAwIDIgMmgxNnYtMkgzeiIvPjwvc3ZnPg==" alt="number-2-box-multiple-outline" width="24" height="24">&nbsp;&nbsp;Enter correct password and hit "Submit" button.</span></td></tr><tr><td><span class="g-secondary"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmZmMxMDAiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjZmZjMTAwIj5udW1lcmljLXRocmVlLWJveC1tdWx0aXBsZS1vdXRsaW5lPC90aXRsZT48cGF0aCBmaWxsPSIjZmZjMTAwIiBkPSJNMTcgMTN2LTEuNWExLjUgMS41IDAgMCAwLTEuNS0xLjVBMS41IDEuNSAwIDAgMCAxNyA4LjVWN2EyIDIgMCAwIDAtMi0yaC00djJoNHYyaC0ydjJoMnYyaC00djJoNGEyIDIgMCAwIDAgMi0yTTMgNUgxdjE2YTIgMiAwIDAgMCAyIDJoMTZ2LTJIM20xOC00SDdWM2gxNG0wLTJIN2EyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlYzYTIgMiAwIDAgMC0yLTIiLz48L3N2Zz4=" alt="numeric-three-box-multiple-outline" width="24" height="24">&nbsp;&nbsp;Go to "Dashboard ⇢ Health Checks". Wallet Status must be "Wallet is unlocked".</span></td></tr>
        </tbody>
      </table>`,
        result: null,
      }
    }
  },
)
