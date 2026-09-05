import { T, utils } from '@start9labs/start-sdk'
import { base64 } from 'rfc4648'
import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { lndDataDir, mainMounts, selfRestUrl, sleep } from '../utils'

const { InputSpec, Value, Variants } = sdk

// The alternation must be grouped: `.matches()` anchors the expression as a
// whole, so a bare `A|B` becomes `^A|B$` — each alternative anchored on one
// side only, letting `192.168.1.9; anything` straight through.
const lanHost: T.inputSpecTypes.Pattern = {
  regex: new utils.regexes.ComposableRegex(
    `(?:${utils.regexes.ipv4.asExpr()}|${utils.regexes.localHostname.asExpr()})`,
  ).matches(),
  description: 'Must be a valid IPv4 address or .local hostname',
}

const initWalletSpec = InputSpec.of({
  method: Value.union({
    name: i18n('Initialization Method'),
    description: i18n(
      'Choose how to initialize your LND wallet. Start Fresh creates a new wallet. The migration options import an existing wallet from another node on your local network.',
    ),
    default: 'fresh',
    variants: Variants.of({
      fresh: {
        name: i18n('Start Fresh'),
        spec: InputSpec.of({}),
      },
      umbrel: {
        name: i18n('Migrate from ${source}', { source: 'Umbrel' }),
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
            masked: true,
            placeholder: 'password',
          }),
        }),
      },
      mynode: {
        name: i18n('Migrate from ${source}', { source: 'myNode' }),
        spec: InputSpec.of({
          'mynode-host': Value.text({
            name: i18n('myNode Address'),
            description: i18n(
              'The IP address or hostname of your myNode (e.g. 192.168.1.7 or mynode.local).',
            ),
            default: null,
            required: true,
            placeholder: 'mynode.local',
            patterns: [lanHost],
          }),
          'mynode-password': Value.text({
            name: i18n('myNode Password'),
            description: i18n(
              'The password for your myNode "admin" user — the one you use for SSH and for the myNode web interface.',
            ),
            default: null,
            required: true,
            masked: true,
            placeholder: 'password',
          }),
        }),
      },
      startos: {
        name: i18n('Migrate from ${source}', { source: 'StartOS' }),
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
    description: i18n('Create a new LND wallet or migrate from another device'),
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
    // A wallet on disk blocks re-initialization — overwriting it loses funds.
    // Two spellings: wallet.db is a bolt-era or imported wallet; chain.sqlite
    // holds the wallet on the SQLite backend (a fresh 0.21 install creates no
    // .db files at all, so testing wallet.db alone misses it).
    //
    // One exception: while an import is scheduled or has failed partway
    // (importPending set), any wallet material on the volume is an incomplete
    // copy of the origin's, so re-running a *migration* over it is the
    // recovery path. Start Fresh stays blocked even then — that partial data
    // could be the only copy of a migrated channel state (a StartOS origin is
    // left stopped, but its data may since be gone), so discarding it is a
    // decision for uninstall, not a side effect.
    const chainDir = `${lndDataDir}/data/chain/bitcoin/mainnet`
    const walletExists = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'check-wallet',
      async (subc) => {
        const res = await subc.exec([
          'sh',
          '-c',
          `test -f ${chainDir}/wallet.db -o -f ${chainDir}/chain.sqlite`,
        ])
        return res.exitCode === 0
      },
    )

    if (walletExists) {
      const importPending = (await startupFlagsJson.read().once())
        ?.importPending
      if (!importPending) {
        throw new Error(
          'A wallet already exists. Re-initializing would overwrite your existing wallet and could lead to loss of funds.',
        )
      }
      if (input.method.selection === 'fresh') {
        throw new Error(
          'An interrupted migration left imported data on this server. Re-run the migration to finish it — it picks up where it left off — or uninstall LND and reinstall to truly start fresh.',
        )
      }
    }

    switch (input.method.selection) {
      case 'fresh':
        return await initFresh(effects)
      case 'umbrel':
        return await scheduleImport(effects, {
          id: 'umbrel',
          label: 'Umbrel',
          user: 'umbrel',
          host: input.method.value['umbrel-host'],
          password: input.method.value['umbrel-password'],
          reached: i18n(
            'Your Umbrel was reached and its credentials verified.',
          ),
        })
      case 'mynode':
        return await scheduleImport(effects, {
          id: 'mynode',
          label: 'myNode',
          user: 'admin',
          host: input.method.value['mynode-host'],
          password: input.method.value['mynode-password'],
          reached: i18n(
            'Your myNode was reached and its credentials verified.',
          ),
        })
      case 'startos':
        return await scheduleImport(effects, {
          id: 'startos',
          label: 'StartOS',
          user: 'start9',
          host: input.method.value['startos-host'],
          password: input.method.value['startos-password'],
          reached: i18n(
            'Your old StartOS server was reached and its credentials verified.',
          ),
        })
    }
  },
)

async function initFresh(
  effects: T.Effects,
): Promise<T.ActionResult & { version: '1' }> {
  // Drop a migration the user scheduled and then thought better of — otherwise
  // main would import over the wallet this creates on the next start.
  await startupFlagsJson.merge(effects, { importPending: false })

  const cipherSeed = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'initialize-lnd',
    async (subc) => {
      // No chain backend: genseed and initwallet are served before any chain
      // init, and the wallet this creates is empty, so there is nothing for one
      // to do. --nobootstrap keeps the server initwallet starts from dialing
      // peers it has no use for.
      const child = await subc.spawn([
        'lnd',
        '--bitcoin.active',
        '--bitcoin.mainnet',
        '--bitcoin.node=nochainbackend',
        '--nobootstrap',
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
          `${selfRestUrl}/v1/genseed`,
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
        `${selfRestUrl}/v1/initwallet`,
        '-d',
        JSON.stringify({
          wallet_password: base64.stringify(
            Buffer.from(walletPassword, 'latin1'),
          ),
          cipher_seed_mnemonic: cipherSeed,
        }),
      ])

      if (status.stderr !== '' && typeof status.stderr === 'string') {
        console.log(`Error running initwallet: ${status.stderr}`)
      }

      await storeJson.merge(effects, {
        aezeedCipherSeed: cipherSeed,
        walletInitialized: true,
      })

      child.kill(T.SIGTERM)
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
      "IMPORTANT: Write down these 24 words and store them in a safe place — this is the ONLY time they will be displayed. The seed alone is NOT enough to recover your node: it restores ON-CHAIN funds only and has no knowledge of your channels. To recover funds locked in Lightning channels, you must ALSO keep StartOS backups, which include LND's Static Channel Backup. This is NOT a BIP-39 seed and cannot be used with wallets other than LND.",
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

/**
 * Verify we can log in to the origin node, then record the migration in
 * startup-flags for main to run. The copy itself cannot happen here: StartOS
 * caps an action run at 120 seconds, while handing over a routing node's channel
 * database takes minutes to hours. So the action does the part that has to be
 * interactive — telling the user, now, whether the address and password work —
 * and main's import phase does the part that has to be long.
 *
 * The SSH login is the whole preflight: every import script authenticates with
 * this same user and password (myNode and StartOS feed it to `sudo -S` as well),
 * so a login that succeeds is the strongest check available without touching the
 * origin's data.
 */
async function scheduleImport(
  effects: T.Effects,
  source: {
    id: 'umbrel' | 'mynode' | 'startos'
    label: string
    user: string
    host: string
    password: string
    reached: string
  },
): Promise<T.ActionResult & { version: '1' }> {
  const res = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    null,
    `preflight-${source.id}`,
    (subc) =>
      subc.exec(
        [
          'sshpass',
          '-e',
          'ssh',
          '-o',
          'StrictHostKeyChecking=no',
          '-o',
          'ConnectTimeout=10',
          '-T',
          `${source.user}@${source.host}`,
          'true',
        ],
        { env: { SSHPASS: source.password } },
        30_000,
      ),
  )

  if (res.exitCode !== 0) {
    // sshpass exits 5 when the password is rejected; everything else means we
    // never got that far (wrong address, host down, SSH disabled, firewall).
    throw new Error(
      res.exitCode === 5
        ? `The password for ${source.user}@${source.host} was rejected. Check your ${source.label} password and try again.`
        : `Could not reach ${source.label} at ${source.user}@${source.host} over SSH: ${String(res.stderr).trim()}`,
    )
  }

  await startupFlagsJson.merge(effects, {
    importPending: {
      source: source.id,
      host: source.host,
      password: source.password,
    },
  })

  return {
    version: '1' as const,
    title: i18n('Success'),
    message: `${source.reached} ${i18n(
      'Start LND to run the migration — LND stops the origin node, copies its data, and converts the database before coming online. On a large node this can take hours; watch its progress under Health Checks. Once the migration is complete, never run LND on the origin server again: two nodes sharing one seed leads to unpredictable behavior or loss of funds.',
    )}`,
    result: null,
  }
}
