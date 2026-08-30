import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

type Input = {
  password: string
}

export const confirmPasswordBackup = sdk.Action.withInput(
  'wallet-password-backup',
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: 'Wallet - Password Backup',
      description: 'Confirm you have backed up your wallet password.',
      warning:
        'Ensure you have securely backed up your password before confirming.',
      allowedStatuses: 'any',
      group: i18n('Security'),
      visibility: store?.pendingPasswordChange
        ? {
            disabled:
              'Password change in progress. Please wait for LND to (re)start and apply the new password.',
          }
        : store?.passwordBackupConfirmed
          ? { disabled: i18n('CONFIRMED') }
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
  async ({ effects, input }) => {
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
    if (password !== store.walletPassword) {
      throw new Error('Password does not match.')
    }
    await storeJson.merge(effects, { passwordBackupConfirmed: true })
    console.log('Password backup confirmed')
    return {
      version: '1',
      title: 'Wallet Password',
      message: `<hr><span class="g-card"><header>Status: BACKUP CONFIRMED <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHN0cm9rZT0iIzAwZmY4YSI+PHRpdGxlIHhtbG5zPSIiIHN0cm9rZT0iIzAwZmY4YSI+cGFzc3dvcmQtY2hlY2s8L3RpdGxlPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwZmY4YSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNSIgZD0iTTIxIDEzVjhhMiAyIDAgMCAwLTItMkg1YTIgMiAwIDAgMC0yIDJ2NmEyIDIgMCAwIDAgMiAyaDdtMi41IDIuNWwyIDJsNC00TTEyIDExLjAxbC4wMS0uMDExbTMuOTkuMDExbC4wMS0uMDExTTggMTEuMDFsLjAxLS4wMTEiLz48L3N2Zz4=" alt="password-check" width="48" height="48">  </header>
<h3 class="g-secondary"><br>Your password backup has been successfully confirmed.<br><br></h3></span>`,
      result: null,
    }
  },
)
