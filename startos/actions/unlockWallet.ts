import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { storeJson } from '../fileModels/store.json'
import { unlockStatusJson } from '../fileModels/unlock-status.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { literal, mainMounts } from '../utils'
import {
  getLndState,
  isPastUnlock,
  unlockWallet as requestUnlock,
} from '../walletUnlocker'

// Replay id of the task main raises at each lock, so Turn Off can clear it.
export const unlockWalletTaskId = 'unlock-wallet'

export const unlockWallet = sdk.Action.withInput(
  'unlock-wallet',

  async ({ effects }) => {
    const walletPassword = await storeJson
      .read((s) => s.walletPassword)
      .const(effects)
    const refused = await unlockStatusJson
      .read((u) => u.storedPasswordRefused)
      .const(effects)
    return {
      name: i18n('Unlock Wallet'),
      description: i18n(
        'Enter the wallet password to bring the node online: after every restart while Cold Storage Mode is on, or when LND refuses the stored password, which the one you enter then replaces.',
      ),
      warning: null,
      allowedStatuses: 'only-running',
      group: i18n('Cold Storage'),
      // Reactive on what main writes, never on a sampled LND state, which the
      // handler checks for itself.
      visibility:
        !walletPassword || refused
          ? 'enabled'
          : {
              disabled: i18n('Cold Storage Mode is off, so LND unlocks itself'),
            },
    }
  },

  sdk.InputSpec.of({
    password: sdk.Value.text({
      name: i18n('Wallet Password'),
      description: i18n('Your wallet password.'),
      required: true,
      masked: true,
      default: null,
    }),
  }),

  async () => ({}),

  async ({ effects, input }) => {
    const done = (message: string) => ({
      version: '1' as const,
      title: i18n('Wallet Unlocked'),
      message,
      result: null,
    })
    if (isPastUnlock(await getLndState())) {
      return done(i18n('The wallet is already unlocked'))
    }
    const stored =
      (await storeJson.read((s) => s.walletPassword).once()) ?? null
    const flags = await startupFlagsJson.read().once()
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'unlock-wallet',
      (sub) =>
        requestUnlock(
          (command, body) => sub.exec(command, { input: body }),
          input.password,
          flags?.restore ? 2_500 : null,
        ),
    )
    if (!res.ok) {
      const error = literal(res.message)
      throw new Error(
        res.kind === 'passphrase'
          ? i18n('LND refused that password: ${error}', { error })
          : res.kind === 'lnd'
            ? i18n('LND could not unlock the wallet: ${error}', { error })
            : `${i18n('LND did not answer')}: ${res.message}`,
      )
    }
    if (res.already) return done(i18n('The wallet is already unlocked'))
    // With the mode off this is the way back from a stored password LND
    // refuses: the one that just opened the wallet becomes the stored one.
    if (stored !== null) {
      await storeJson.merge(effects, { walletPassword: input.password })
      return done(
        i18n(
          'The node is coming online, and the password you entered is now the stored one, so LND unlocks itself from the next start.',
        ),
      )
    }
    return done(
      i18n(
        'The node is coming online. The health checks catch up within about 30 seconds.',
      ),
    )
  },
)
