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
  advanced?: {
    'protocol-simple-taproot-chans'?: boolean
  }
}

export const current = VersionInfo.of({
  version: '0.20.1-beta:10',
  releaseNotes: {
    en_US:
      'Adds a **Custom External Host** action to advertise an additional public address — such as a Tunnelsats or VPN tunnel endpoint — alongside your Tor and StartOS-managed addresses.',
    es_ES:
      'Añade una acción **Host externo personalizado** para anunciar una dirección pública adicional —como un endpoint de túnel Tunnelsats o VPN— junto con tus direcciones Tor y las gestionadas por StartOS.',
    de_DE:
      'Fügt eine Aktion **Benutzerdefinierter externer Host** hinzu, um eine zusätzliche öffentliche Adresse — etwa einen Tunnelsats- oder VPN-Tunnel-Endpunkt — zusammen mit Ihren Tor- und von StartOS verwalteten Adressen bekannt zu geben.',
    pl_PL:
      'Dodaje akcję **Niestandardowy host zewnętrzny**, aby rozgłaszać dodatkowy adres publiczny — taki jak punkt końcowy tunelu Tunnelsats lub VPN — obok adresów Tor i zarządzanych przez StartOS.',
    fr_FR:
      "Ajoute une action **Hôte externe personnalisé** pour annoncer une adresse publique supplémentaire — telle qu'un point de terminaison de tunnel Tunnelsats ou VPN — en plus de vos adresses Tor et gérées par StartOS.",
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

        // Enforce backend bundle based on old config; carry over any
        // experimental-taproot-channels setting from the 0.3.5.x GUI.
        await lndConfFile.merge(effects, {
          externalhosts: undefined,
          ...(configYaml.bitcoind.type === 'internal'
            ? bitcoindBundle
            : neutrinoBundle),
          'protocol.simple-taproot-chans':
            configYaml.advanced?.['protocol-simple-taproot-chans'] || undefined,
        })
      }
    },
    down: IMPOSSIBLE,
  },
})
