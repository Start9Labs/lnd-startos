import { randomBytes, scryptSync } from 'node:crypto'
import { coldStorageJson } from '../fileModels/cold-storage.json'
import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { storeJson } from '../fileModels/store.json'
import { unlockStatusJson } from '../fileModels/unlock-status.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { needsSqliteMigration } from '../sqliteBackend'
import { literal, mainMounts } from '../utils'
import {
  getLndState,
  isPastUnlock,
  unlockWallet as requestUnlock,
} from '../walletUnlocker'
import { unlockWalletTaskId } from './unlockWallet'

// scrypt, not a digest: the hash sits on the disk the mode exists to protect.
const hashPassword = (password: string, salt: string) =>
  scryptSync(password, salt, 32).toString('hex')

export const prepareColdStorage = sdk.Action.withoutInput(
  'cold-storage-prepare',

  async ({ effects }) => {
    const walletPassword = await storeJson
      .read((s) => s.walletPassword)
      .const(effects)
    return {
      name: i18n('Cold Storage: Show Credentials'),
      description: i18n(
        'Display the wallet password, and the seed if this server still holds one, so you can record them. They are shown here because turning the mode on deletes them from this server.',
      ),
      warning: i18n(
        'Write them down and store them offline before continuing. Once Cold Storage Mode is on, this server no longer holds them, and nobody can recover them for you.',
      ),
      allowedStatuses: 'any',
      group: i18n('Cold Storage'),
      visibility: !walletPassword
        ? { disabled: i18n('Cold Storage Mode is already on') }
        : 'enabled',
    }
  },

  async ({ effects }) => {
    const store = await storeJson.read().once()
    if (!store?.walletPassword) {
      throw new Error(i18n('Cold Storage Mode is already on'))
    }
    const seed = store.aezeedCipherSeed?.length ? store.aezeedCipherSeed : null
    // Chosen now rather than at Enable so the words asked for are fixed while
    // the user is writing them down. A wallet with no seed here is asked for
    // the password alone: the seed is the half that has already left.
    let challenge: number[] | null = null
    if (seed) {
      const indices = Array.from({ length: seed.length }, (_, i) => i)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[indices[i], indices[j]] = [indices[j], indices[i]]
      }
      challenge = indices.slice(0, 3).sort((a, b) => a - b)
    }
    await coldStorageJson.merge(effects, {
      prepared: true,
      seedChallenge: challenge,
    })

    return {
      version: '1' as const,
      title: i18n('Record These Now'),
      message: challenge
        ? i18n(
            'Turning Cold Storage Mode on will ask you for the password and for seed words ${first}, ${second} and ${third}.',
            {
              first: challenge[0] + 1,
              second: challenge[1] + 1,
              third: challenge[2] + 1,
            },
          )
        : i18n(
            'No seed is stored on this server, so turning Cold Storage Mode on will ask you for the password only.',
          ),
      result: {
        type: 'group' as const,
        value: [
          {
            name: i18n('Wallet Password'),
            description: i18n('Needed at every start once the mode is on.'),
            type: 'single' as const,
            value: store.walletPassword,
            copyable: true,
            qr: false,
            masked: true,
          },
          ...(seed
            ? [
                {
                  name: i18n('Aezeed Cipher Seed'),
                  description: i18n(
                    'Recovers on-chain funds only. Channel funds come from the channel backup.',
                  ),
                  type: 'single' as const,
                  value: seed.map((w, i) => `${i + 1}: ${w}`).join(' '),
                  copyable: true,
                  qr: false,
                  masked: true,
                },
              ]
            : []),
        ],
      },
    }
  },
)

export const enableColdStorage = sdk.Action.withInput(
  'cold-storage-enable',

  async ({ effects }) => {
    const walletPassword = await storeJson
      .read((s) => s.walletPassword)
      .const(effects)
    const prepared = await coldStorageJson
      .read((c) => c.prepared)
      .const(effects)
    return {
      name: i18n('Cold Storage: Turn On'),
      description: i18n(
        'Delete the wallet password, and the seed if it is still here, from this server. LND then starts locked and waits for you after every restart. A StartOS backup taken while the mode is on carries neither, and restores to a node that needs your password.',
      ),
      warning: i18n(
        'While this is on, LND is offline from every restart until you unlock it by hand, including restarts caused by Bitcoin or a StartOS update. An offline node cannot route or respond to a channel closing, and peers may force-close. Do not turn this on for a node you cannot check regularly.',
      ),
      allowedStatuses: 'only-running',
      group: i18n('Cold Storage'),
      visibility: !walletPassword
        ? { disabled: i18n('Cold Storage Mode is already on') }
        : !prepared
          ? { disabled: i18n('Run Show Credentials first') }
          : 'enabled',
    }
  },

  sdk.InputSpec.of({
    password: sdk.Value.text({
      name: i18n('Wallet Password'),
      description: i18n('Type the password you recorded.'),
      required: true,
      masked: true,
      default: null,
    }),
    seedWords: sdk.Value.dynamicText(async () => {
      const challenge = await coldStorageJson
        .read((c) => c.seedChallenge)
        .once()
      return challenge?.length === 3
        ? {
            name: i18n('Seed words ${first}, ${second} and ${third}', {
              first: challenge[0] + 1,
              second: challenge[1] + 1,
              third: challenge[2] + 1,
            }),
            description: i18n(
              'Type those three words from the seed shown by Show Credentials, in that order, separated by spaces.',
            ),
            required: true,
            default: null,
          }
        : {
            name: i18n('Seed words'),
            description: i18n(
              'Not needed: no seed is stored on this server. Leave this blank.',
            ),
            required: false,
            default: null,
          }
    }),
  }),

  async () => ({}),

  async ({ effects, input }) => {
    const store = await storeJson.read().once()
    const cold = await coldStorageJson.read().once()
    if (!store?.walletPassword) {
      throw new Error(i18n('Cold Storage Mode is already on'))
    }
    if (!cold?.prepared) {
      throw new Error(i18n('Run Show Credentials first'))
    }
    // The password may only leave once it has proven itself: LND's own chain
    // running unlocked (not the conversion's temporary one), opened by main's
    // oneshot with this stored password in this lifecycle.
    const flags = await startupFlagsJson.read().once()
    if (
      flags?.importPending ||
      (await needsSqliteMigration()) ||
      !isPastUnlock(await getLndState())
    ) {
      throw new Error(
        i18n(
          'LND must be running with its wallet unlocked before the mode can be turned on.',
        ),
      )
    }
    if (
      !(await unlockStatusJson.read((u) => u.storedPasswordVerified).once())
    ) {
      throw new Error(
        i18n(
          'The stored password has not opened the wallet in this run, so it cannot be deleted yet. Restart LND and try again once it is unlocked.',
        ),
      )
    }
    if (input.password !== store.walletPassword) {
      throw new Error(i18n('That is not the wallet password'))
    }
    const seed = store.aezeedCipherSeed?.length ? store.aezeedCipherSeed : null
    if (seed) {
      const challenge = cold.seedChallenge
      if (challenge?.length !== 3) {
        throw new Error(i18n('Run Show Credentials first'))
      }
      const given = (input.seedWords ?? '')
        .trim()
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean)
      const wanted = challenge.map((i) => seed[i]?.trim().toLowerCase())
      if (
        given.length !== wanted.length ||
        given.some((w, i) => w !== wanted[i])
      ) {
        throw new Error(i18n('Those seed words do not match'))
      }
    }

    // Hash first, so Turn Off can check a typed password while the wallet
    // cannot be asked. The store write is the mode: the password leaving is
    // what turns it on, in one write.
    const passwordSalt = randomBytes(16).toString('hex')
    await coldStorageJson.merge(effects, {
      passwordSalt,
      passwordHash: hashPassword(store.walletPassword, passwordSalt),
      seedChallenge: null,
    })
    await storeJson.merge(effects, {
      walletPassword: null,
      aezeedCipherSeed: null,
    })

    return {
      version: '1' as const,
      title: i18n('Cold Storage Mode Is On'),
      message: seed
        ? i18n(
            'The password and seed are no longer on this server. LND is restarting and will wait locked until you run Unlock Wallet.',
          )
        : i18n(
            'The password is no longer on this server. LND is restarting and will wait locked until you run Unlock Wallet.',
          ),
      result: null,
    }
  },
)

export const disableColdStorage = sdk.Action.withInput(
  'cold-storage-disable',

  async ({ effects }) => {
    const walletPassword = await storeJson
      .read((s) => s.walletPassword)
      .const(effects)
    return {
      name: i18n('Cold Storage: Turn Off'),
      description: i18n(
        'Store the wallet password on this server again so LND unlocks itself at every start.',
      ),
      warning: i18n(
        'The seed stays off this server: it cannot be put back. Only the password returns.',
      ),
      allowedStatuses: 'any',
      group: i18n('Cold Storage'),
      visibility: !walletPassword
        ? 'enabled'
        : { disabled: i18n('Cold Storage Mode is off') },
    }
  },

  sdk.InputSpec.of({
    password: sdk.Value.text({
      name: i18n('Wallet Password'),
      description: i18n('Type the password you recorded.'),
      required: true,
      masked: true,
      default: null,
    }),
  }),

  async () => ({}),

  async ({ effects, input }) => {
    if (await storeJson.read((s) => s.walletPassword).once()) {
      throw new Error(i18n('Cold Storage Mode is off'))
    }
    const cold = await coldStorageJson.read().once()
    const hashed = !!cold?.passwordHash && !!cold.passwordSalt
    if (
      hashed &&
      hashPassword(input.password, cold.passwordSalt!) !== cold.passwordHash
    ) {
      throw new Error(i18n('That is not the wallet password'))
    }
    // The wallet is the authority while it is locked: the unlocker is reachable
    // without a macaroon, so a changepassword made elsewhere leaves the hash
    // describing a password LND no longer takes.
    if ((await getLndState()) === 'LOCKED') {
      const flags = await startupFlagsJson.read().once()
      const res = await sdk.SubContainer.withTemp(
        effects,
        { imageId: 'lnd' },
        mainMounts,
        'cold-storage-off',
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
            ? i18n('That is not the wallet password')
            : res.kind === 'lnd'
              ? i18n('LND could not unlock the wallet: ${error}', { error })
              : `${i18n('LND did not answer')}: ${res.message}`,
        )
      }
    } else if (!hashed) {
      throw new Error(
        i18n(
          'The stored password check is missing and LND is not locked, so the password cannot be verified. Restart LND and run Turn Off while it is waiting for the password.',
        ),
      )
    }
    // Task first, while nothing has changed and a failure can simply be
    // retried; then the password, which is what turns the mode off; the hash
    // last, once nothing needs it.
    await sdk.action.clearTask(effects, unlockWalletTaskId)
    await storeJson.merge(effects, { walletPassword: input.password })
    await coldStorageJson.merge(effects, {
      passwordHash: null,
      passwordSalt: null,
    })

    return {
      version: '1' as const,
      title: i18n('Cold Storage Mode Is Off'),
      message: i18n(
        'The password is stored on this server again. LND is restarting and will unlock itself from now on.',
      ),
      result: null,
    }
  },
)
