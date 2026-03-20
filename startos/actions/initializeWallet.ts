import { T } from '@start9labs/start-sdk'
import {
  InputSpec,
  Value,
  Variants,
} from '@start9labs/start-sdk/base/lib/actions/input/builder'
import { Pattern } from '@start9labs/start-sdk/base/lib/actions/input/inputSpecTypes'
import { SIGTERM } from '@start9labs/start-sdk/base/lib/types'
import {
  ComposableRegex,
  ipv4,
  localHostname,
} from '@start9labs/start-sdk/base/lib/util/regexes'
import { base64 } from 'rfc4648'
import { shape, storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { restPort } from '../interfaces'
import { sdk } from '../sdk'
import { lndDataDir, mainMounts, sleep } from '../utils'

const lanHost: Pattern = {
  regex: new ComposableRegex(
    `${ipv4.asExpr()}|${localHostname.asExpr()}`,
  ).matches(),
  description: 'Must be a valid IPv4 address or .local hostname',
}

const initWalletSpec = InputSpec.of({
  method: Value.union({
    name: i18n('Initialization Method'),
    description: i18n(
      'Choose how to initialize your LND wallet. Start Fresh creates a new wallet. Migrate from Umbrel or StartOS imports an existing wallet.',
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
            name: i18n('Umbrel Address'),
            description: i18n(
              'The IP address or hostname of your Umbrel (e.g. 192.168.1.9 or umbrel.local).',
            ),
            default: null,
            required: true,
            placeholder: 'umbrel.local',
            patterns: [lanHost],
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
      startos: {
        name: i18n('Migrate from StartOS'),
        spec: InputSpec.of({
          'startos-host': Value.text({
            name: i18n('Origin Server Address'),
            description: i18n(
              'The LAN IP address or hostname of your old StartOS server (e.g. 192.168.1.9 or adjective-noun.local).',
            ),
            default: null,
            required: true,
            placeholder: 'adjective-noun.local',
            patterns: [lanHost],
          }),
          'startos-password': Value.text({
            name: i18n('Master Password'),
            description: i18n(
              'The master password for your old StartOS server.',
            ),
            default: null,
            required: true,
            masked: true,
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
    description: i18n(
      'Create a new LND wallet or migrate from another device',
    ),
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
    // Check if a wallet already exists to prevent accidental re-initialization
    const walletExists = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'check-wallet',
      async (subc) => {
        const res = await subc.exec([
          'test',
          '-f',
          `${lndDataDir}/data/chain/bitcoin/mainnet/wallet.db`,
        ])
        return res.exitCode === 0
      },
    )

    if (walletExists) {
      throw new Error(
        'A wallet already exists. Re-initializing would overwrite your existing wallet and could lead to loss of funds.',
      )
    }

    if (input.method.selection === 'fresh') {
      return await initFresh(effects)
    } else if (input.method.selection === 'umbrel') {
      return await importFromUmbrel(effects, input.method.value)
    } else {
      return await importFromStartOS(effects, input.method.value)
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
  const mounts = sdk.Mounts.of()
    .mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: lndDataDir,
      readonly: false,
    })
    .mountAssets({ subpath: null, mountpoint: '/scripts' })

  const res = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mounts,
    'import-umbrel',
    async (subc) => {
      const scriptRes = await subc.exec(['sh', '/scripts/import-umbrel.sh'], {
        env: {
          UMBREL_HOST: input['umbrel-host'],
          UMBREL_PASS: input['umbrel-password'],
        },
      })
      if (scriptRes.exitCode !== 0) return scriptRes

      const catRes = await subc.exec(['cat', '/tmp/old-store.json'])
      if (catRes.exitCode !== 0 || typeof catRes.stdout !== 'string') {
        return { ...catRes, exitCode: 1 }
      }

      return { ...catRes, exitCode: 0 }
    },
  )

  if (res.exitCode === 0 && typeof res.stdout === 'string') {
    const oldStore = shape.safeParse(JSON.parse(res.stdout))
    if (!oldStore.success) {
      return {
        version: '1' as const,
        title: i18n('Failure'),
        message: i18n(
          'Failed to parse wallet password from origin StartOS server.',
        ),
        result: null,
      }
    }

    await storeJson.merge(effects, {
      walletPassword: oldStore.data.walletPassword,
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
    message: `Failed to import LND from Umbrel: ${typeof res.stderr === 'string' ? res.stderr : res}`,
    result: null,
  }
}

async function importFromStartOS(
  effects: T.Effects,
  input: { 'startos-host': string; 'startos-password': string },
): Promise<T.ActionResult & { version: '1' }> {
  const mounts = sdk.Mounts.of()
    .mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: lndDataDir,
      readonly: false,
    })
    .mountAssets({ subpath: null, mountpoint: '/scripts' })

  const res = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mounts,
    'import-startos',
    async (subc) => {
      // Run the import script: stops LND on origin, copies data + store.json
      const scriptRes = await subc.exec(
        ['sh', '/scripts/import-startos.sh'],
        {
          env: {
            STARTOS_HOST: input['startos-host'],
            STARTOS_PASS: input['startos-password'],
          },
        },
      )
      if (scriptRes.exitCode !== 0) return scriptRes

      // Extract wallet password from the old store.json
      const catRes = await subc.exec(['cat', '/tmp/old-store.json'])
      if (catRes.exitCode !== 0 || typeof catRes.stdout !== 'string') {
        return { ...catRes, exitCode: 1 }
      }

      return { ...catRes, exitCode: 0 }
    },
  )

  if (res.exitCode === 0 && typeof res.stdout === 'string') {
    const oldStore = shape.safeParse(JSON.parse(res.stdout))
    if (!oldStore.success) {
      return {
        version: '1' as const,
        title: i18n('Failure'),
        message: i18n(
          'Failed to parse wallet password from origin StartOS server.',
        ),
        result: null,
      }
    }

    await storeJson.merge(effects, {
      walletPassword: oldStore.data.walletPassword,
    })

    return {
      version: '1' as const,
      title: i18n('Success'),
      message: i18n(
        'Successfully imported LND data from StartOS. WARNING: Do NOT start LND on the old server again with the same wallet. Running two LND nodes with the same seed will lead to unpredictable behavior or loss of funds.',
      ),
      result: null,
    }
  }

  return {
    version: '1' as const,
    title: i18n('Failure'),
    message: `Failed to import LND from StartOS: ${typeof res.stderr === 'string' ? res.stderr : res}`,
    result: null,
  }
}
