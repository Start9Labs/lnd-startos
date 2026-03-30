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

export const v_0_20_1_beta_1_b9 = VersionInfo.of({
  version: '0.20.1-beta:1-beta.9',
  releaseNotes: {
    en_US:
      'Expanded configuration options: new Channel Settings action (min/max channel size, wumbo, zero-conf, SCID alias, pending channels, circular route, reject push, coop close target), new Performance action (DB auto-compact, invoice cleanup, reconnect stagger, gossip filters, graph pruning), new Routing Fees action with timelock delta, and Accept AMP toggle in General Settings. Renamed "Bitcoin Channel Configuration" to "Routing Fees" for clarity.',
    es_ES:
      'Opciones de configuración ampliadas: nueva acción Configuración de Canales (tamaño mín/máx de canal, wumbo, zero-conf, alias SCID, canales pendientes, ruta circular, rechazo de push, cierre cooperativo), nueva acción Rendimiento (auto-compactación de BD, limpieza de facturas, reconexión escalonada, filtros gossip, poda del grafo), nueva acción Comisiones de Enrutamiento con delta de timelock, y opción Aceptar AMP en Configuración General.',
    de_DE:
      'Erweiterte Konfigurationsoptionen: neue Aktion Kanaleinstellungen (min/max Kanalgröße, Wumbo, Zero-conf, SCID-Alias, ausstehende Kanäle, zirkuläre Route, Push ablehnen, kooperatives Schließungsziel), neue Aktion Leistung (DB-Auto-Komprimierung, Rechnungsbereinigung, gestaffelte Wiederverbindung, Gossip-Filter, Graph-Bereinigung), neue Aktion Routing-Gebühren mit Timelock-Delta und AMP-Akzeptanz in den allgemeinen Einstellungen.',
    pl_PL:
      'Rozszerzone opcje konfiguracji: nowa akcja Ustawienia kanałów (min/maks rozmiar kanału, wumbo, zero-conf, alias SCID, oczekujące kanały, trasa kołowa, odrzucenie push, cel kooperacyjnego zamknięcia), nowa akcja Wydajność (auto-kompaktacja BD, czyszczenie faktur, rozłożone ponowne połączenia, filtry gossip, przycinanie grafu), nowa akcja Opłaty routingowe z deltą timelocka i opcja Akceptuj AMP w ustawieniach ogólnych.',
    fr_FR:
      "Options de configuration étendues : nouvelle action Paramètres des canaux (taille min/max, wumbo, zero-conf, alias SCID, canaux en attente, route circulaire, rejet push, cible de fermeture coopérative), nouvelle action Performance (compactage auto de la BD, nettoyage des factures, reconnexion échelonnée, filtres gossip, élagage du graphe), nouvelle action Frais de routage avec delta de timelock et option Accepter AMP dans les paramètres généraux.",
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
