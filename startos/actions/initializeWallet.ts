import { T } from '@start9labs/start-sdk'
import {
  InputSpec,
  Value,
  Variants,
} from '@start9labs/start-sdk/base/lib/actions/input/builder'
import { SIGTERM } from '@start9labs/start-sdk/base/lib/types'
import { base64 } from 'rfc4648'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { restPort } from '../interfaces'
import { sdk } from '../sdk'
import { lndDataDir, mainMounts, sleep } from '../utils'

const initWalletSpec = InputSpec.of({
  method: Value.union({
    name: i18n('Initialization Method'),
    description: i18n(
      'Choose how to initialize your LND wallet. Start Fresh creates a new wallet. Migrate from Umbrel imports an existing wallet from Umbrel.',
    ),
    default: 'fresh',
    variants: Variants.of({
      fresh: {
        name: i18n('Start Fresh'),
        spec: InputSpec.of({}),
      },
      umbrel: {
        name: i18n('Migrate from Umbrel'),
        spec: InputSpec.of({
          'umbrel-host': Value.text({
            name: i18n('Umbrel IP Address'),
            description: i18n(
              'The IP Address for your Umbrel. You can find this by running the command `ping umbrel.local` while connected to your LAN.',
            ),
            default: null,
            required: true,
            placeholder: '192.168.1.9',
          }),
          'umbrel-password': Value.text({
            name: i18n('Umbrel Password'),
            description: i18n(
              'The password you use to log into your Umbrel dashboard or SSH',
            ),
            default: null,
            required: true,
            placeholder: 'password',
          }),
        }),
      },
    }),
  }),
})

export const initializeWallet = sdk.Action.withInput(
  // id
  'initialize-wallet',

  // metadata
  async ({ effects }) => ({
    name: i18n('Initialize Wallet'),
    description: i18n('Create a new LND wallet or migrate from Umbrel'),
    warning: null,
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: 'hidden',
  }),

  // form input specification
  initWalletSpec,

  // optionally pre-fill the input form
  async ({ effects }) => ({}),

  // execution function
  async ({ effects, input }) => {
    if (input.method.selection === 'fresh') {
      return await initFresh(effects)
    } else {
      return await importFromUmbrel(effects, input.method.value)
    }
  },
)

async function initFresh(
  effects: T.Effects,
): Promise<T.ActionResult & { version: '1' }> {
  const cipherSeed = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'initialize-lnd',
    async (subc) => {
      // Use neutrino to pass config validation — the wallet unlocker API
      // starts before any chain sync, so the backend doesn't matter here.
      const child = await subc.spawn([
        'lnd',
        '--bitcoin.active',
        '--bitcoin.mainnet',
        '--bitcoin.node=neutrino',
      ])

      let cipherSeed: string[] = []
      do {
        const res = await subc.exec([
          'curl',
          '--no-progress-meter',
          'GET',
          '--cacert',
          `${lndDataDir}/tls.cert`,
          '--fail-with-body',
          `https://lnd.startos:${restPort}/v1/genseed`,
        ])
        if (
          res.exitCode === 0 &&
          res.stdout !== '' &&
          typeof res.stdout === 'string'
        ) {
          cipherSeed = JSON.parse(res.stdout)['cipher_seed_mnemonic']
          break
        } else {
          console.log('Waiting for RPC to start...')
          await sleep(5_000)
        }
      } while (true)

      const walletPassword = (await storeJson.read().once())?.walletPassword
      if (!walletPassword) throw new Error('No wallet password found')

      const status = await subc.exec([
        'curl',
        '--no-progress-meter',
        '-X',
        'POST',
        '--cacert',
        `${lndDataDir}/tls.cert`,
        '--fail-with-body',
        `https://lnd.startos:${restPort}/v1/initwallet`,
        '-d',
        JSON.stringify({
          wallet_password: base64.stringify(Buffer.from(walletPassword)),
          cipher_seed_mnemonic: cipherSeed,
        }),
      ])

      if (status.stderr !== '' && typeof status.stderr === 'string') {
        console.log(`Error running initwallet: ${status.stderr}`)
      }

      await storeJson.merge(effects, { aezeedCipherSeed: cipherSeed })

      child.kill(SIGTERM)
      await new Promise<void>((resolve) => {
        child.on('exit', () => resolve())
        setTimeout(resolve, 60_000)
      })

      return cipherSeed
    },
  )

  return {
    version: '1' as const,
    title: i18n('Aezeed Cipher Seed'),
    message: i18n(
      'IMPORTANT: Write down these 24 words and store them in a safe place. This is the ONLY time they will be displayed. This seed can restore on-chain funds ONLY — it has no knowledge of channel state. This is NOT a BIP-39 seed and cannot be used with wallets other than LND.',
    ),
    result: {
      type: 'single' as const,
      value: cipherSeed.map((word, i) => `${i + 1}: ${word}`).join(' '),
      copyable: true,
      qr: false,
      masked: true,
    },
  }
}

async function importFromUmbrel(
  effects: T.Effects,
  input: { 'umbrel-host': string; 'umbrel-password': string },
): Promise<T.ActionResult & { version: '1' }> {
  const res = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    sdk.Mounts.of().mountAssets({ subpath: null, mountpoint: '/scripts' }),
    'import-umbrel',
    async (subc) => {
      return await subc.exec(['sh', '/scripts/import-umbrel.sh'], {
        env: {
          UMBREL_HOST: input['umbrel-host'],
          UMBREL_PASS: input['umbrel-password'],
        },
      })
    },
  )

  if (res.exitCode === 0) {
    await storeJson.merge(effects, {
      walletPassword: 'moneyprintergobrrr',
    })
    return {
      version: '1' as const,
      title: i18n('Success'),
      message: i18n(
        'Successfully Imported Umbrel Data. WARNING!!! With the Migration of LND complete, be sure to NEVER re-start your Umbrel using the same LND seed! You should never run two different lnd nodes with the same seed! This will lead to strange/unpredictable behavior or even loss of funds.',
      ),
      result: null,
    }
  }

  return {
    version: '1' as const,
    title: i18n('Failure'),
    message: `Failed to import LND from Umbrel: ${res}`,
    result: null,
  }
}
