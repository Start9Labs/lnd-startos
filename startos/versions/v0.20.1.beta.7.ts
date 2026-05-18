import { IMPOSSIBLE, VersionInfo, YAML } from '@start9labs/start-sdk'
import { readFile, rm } from 'fs/promises'
import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { bitcoindBundle, neutrinoBundle } from '../utils'

type OldConfig = {
  bitcoind: { type: 'none' } | { type: 'internal' }
  watchtowers: {
    'wt-client':
      | { enabled: 'disabled' }
      | { enabled: 'enabled'; 'add-watchtowers': string[] }
  }
}

export const v_0_20_1_beta_7 = VersionInfo.of({
  version: '0.20.1-beta:7',
  releaseNotes: {
    en_US: `**Fixes**

- Watchtower interface now advertises clearnet addresses, not only Tor onions.

**Internal**

- start-sdk → 1.5.2`,
    es_ES: `**Correcciones**

- La interfaz Watchtower ahora anuncia direcciones de red abierta, no solo onions de Tor.

**Interno**

- start-sdk → 1.5.2`,
    de_DE: `**Korrekturen**

- Die Watchtower-Schnittstelle bietet jetzt Klarnetz-Adressen an, nicht nur Tor-Onions.

**Intern**

- start-sdk → 1.5.2`,
    pl_PL: `**Poprawki**

- Interfejs Watchtower udostępnia teraz adresy w sieci jawnej, a nie tylko adresy Tor onion.

**Wewnętrzne**

- start-sdk → 1.5.2`,
    fr_FR: `**Corrections**

- L'interface Watchtower expose désormais des adresses en clair, pas uniquement des onions Tor.

**Interne**

- start-sdk → 1.5.2`,
  },
  migrations: {
    up: async ({ effects }) => {
      // Try to read the old 0.3.5.x config. If it exists, we're migrating
      // from 0.3.5.x and need to carry over settings to the new store format.
      const configYaml: OldConfig | undefined = await readFile(
        '/media/startos/volumes/main/start9/config.yaml',
        'utf-8',
      ).then(YAML.parse, () => undefined)

      const prev = await storeJson
        .read()
        .once()
        .catch(() => null)
      if (configYaml) {
        const wtClient = configYaml.watchtowers?.['wt-client']

        await storeJson.merge(effects, {
          // The seed file uses "N word" format, one per line. Not all
          // installations have one, so fall back to null.
          aezeedCipherSeed:
            prev?.aezeedCipherSeed ||
            (await readFile(
              '/media/startos/volumes/main/start9/cipherSeedMnemonic.txt',
              'utf8',
            ).then(
              (contents) => {
                const words = contents
                  .trimEnd()
                  .split('\n')
                  .map((line) => line.split(' ')[1])
                return words.length === 24 ? words : null
              },
              () => null,
            )),
          walletPassword:
            prev?.walletPassword ||
            (await readFile('/media/startos/volumes/main/pwd.dat').then((buf) =>
              buf.toString('latin1'),
            )),
          watchtowerClients:
            wtClient?.enabled === 'enabled' ? wtClient['add-watchtowers'] : [],
        })

        await rm('/media/startos/volumes/main/start9', {
          recursive: true,
        }).catch(console.error)

        // Enforce backend bundle based on old config
        await lndConfFile.merge(effects, {
          externalhosts: undefined,
          ...(configYaml.bitcoind.type === 'internal'
            ? bitcoindBundle
            : neutrinoBundle),
        })
      }
    },
    down: IMPOSSIBLE,
  },
})
