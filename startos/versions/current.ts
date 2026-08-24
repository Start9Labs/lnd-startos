import { VersionInfo } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { writeCerts } from '../init/setupCerts'
import { sdk } from '../sdk'
import { needsSqliteMigration, runSqliteMigration } from '../sqliteBackend'

export const current = VersionInfo.of({
  version: '0.21.2-beta:2',
  releaseNotes: {
    en_US: `Updated LND to 0.21.2-beta, a bug-fix release.

- Two startup failures during database upgrades are fixed: a node whose payment history held an incomplete blinded route could fail to start, and a database missing its version key could skip a required upgrade.
- Memory used while syncing the channel graph is now bounded, so a misbehaving peer can no longer make LND buffer an unpredictable amount of data.
- Fixes a race condition in cooperative channel closes and several onion message decoding errors.
- Adds \`lncli wallet submitpackage\`, which submits a zero-fee transaction together with a fee-paying child through Bitcoin.

The Network and Graph Sync health check now reports how many peers are connected and how long the graph sync has been pending, so a sync that is merely slow can be told apart from one stalled on an unresponsive peer.

Performance settings gain **Graph Cache Duration**, which caches the answer to a full network graph query so that repeated dashboard refreshes no longer stall gossip and payments. **Stagger Initial Reconnect** is now on by default.

Full notes: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta`,
    es_ES: `Se actualizó LND a 0.21.2-beta, una versión de corrección de errores.

- Se corrigen dos fallos de arranque durante las actualizaciones de la base de datos: un nodo cuyo historial de pagos contenía una ruta ciega incompleta podía no arrancar, y una base de datos sin su clave de versión podía omitir una actualización obligatoria.
- La memoria utilizada al sincronizar el grafo de canales ahora está limitada, de modo que un par que se comporte mal ya no puede hacer que LND almacene una cantidad impredecible de datos.
- Se corrige una condición de carrera en el cierre cooperativo de canales y varios errores de decodificación de mensajes onion.
- Se añade \`lncli wallet submitpackage\`, que envía una transacción sin comisión junto con una transacción hija que sí la paga, a través de Bitcoin.

La comprobación de estado Progreso de sincronización de red y grafo ahora indica cuántos pares están conectados y cuánto tiempo lleva pendiente la sincronización del grafo, de modo que una sincronización simplemente lenta puede distinguirse de una detenida por un par que no responde.

Los ajustes de Rendimiento incorporan **Duración de la caché del grafo**, que almacena en caché la respuesta a una consulta del grafo completo de la red para que las actualizaciones repetidas de los paneles ya no detengan el gossip ni los pagos. **Escalonar Reconexión Inicial** ahora está activado de forma predeterminada.

Notas completas: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta`,
    de_DE: `LND wurde auf 0.21.2-beta aktualisiert, eine Fehlerbehebungsversion.

- Zwei Startfehler bei Datenbank-Aktualisierungen sind behoben: Ein Node, dessen Zahlungsverlauf eine unvollständige blinde Route enthielt, konnte nicht starten, und eine Datenbank ohne Versionsschlüssel konnte eine erforderliche Aktualisierung überspringen.
- Der beim Synchronisieren des Kanalgraphen verwendete Speicher ist jetzt begrenzt, sodass ein sich fehlverhaltender Peer LND nicht mehr dazu bringen kann, eine unvorhersehbare Datenmenge zu puffern.
- Behebt eine Race Condition beim kooperativen Kanalschluss sowie mehrere Fehler beim Dekodieren von Onion-Nachrichten.
- Ergänzt \`lncli wallet submitpackage\`, das eine gebührenfreie Transaktion zusammen mit einer gebührenzahlenden Folgetransaktion über Bitcoin einreicht.

Die Zustandsprüfung „Netzwerk- und Graph-Synchronisierungsfortschritt“ meldet jetzt, wie viele Peers verbunden sind und wie lange die Graph-Synchronisierung bereits aussteht, sodass eine lediglich langsame Synchronisierung von einer unterscheidbar ist, die an einem nicht antwortenden Peer hängt.

Die Leistungseinstellungen erhalten **Graph-Cache-Dauer**, die die Antwort auf eine vollständige Netzwerkgraph-Abfrage zwischenspeichert, sodass wiederholte Dashboard-Aktualisierungen Gossip und Zahlungen nicht mehr ausbremsen. **Anfängliche Wiederverbindung staffeln** ist jetzt standardmäßig aktiv.

Vollständige Hinweise: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta`,
    pl_PL: `Zaktualizowano LND do 0.21.2-beta — wydanie z poprawkami błędów.

- Naprawiono dwie awarie uruchamiania podczas aktualizacji bazy danych: węzeł, którego historia płatności zawierała niekompletną ślepą trasę, mógł się nie uruchomić, a baza danych bez klucza wersji mogła pominąć wymaganą aktualizację.
- Pamięć używana podczas synchronizacji grafu kanałów jest teraz ograniczona, więc niepoprawnie działający peer nie może już zmusić LND do buforowania nieprzewidywalnej ilości danych.
- Naprawiono sytuację wyścigu przy kooperacyjnym zamykaniu kanału oraz kilka błędów dekodowania wiadomości onion.
- Dodano \`lncli wallet submitpackage\`, które przesyła transakcję bez opłaty wraz z transakcją potomną pokrywającą opłatę, za pośrednictwem Bitcoina.

Kontrola stanu „Postęp synchronizacji sieci i grafu” pokazuje teraz, ilu peerów jest połączonych i jak długo trwa oczekiwanie na synchronizację grafu, dzięki czemu synchronizację jedynie powolną można odróżnić od zatrzymanej na peerze, który nie odpowiada.

Ustawienia wydajności zyskują **Czas pamięci podręcznej grafu**, który zapisuje w pamięci podręcznej odpowiedź na zapytanie o pełny graf sieci, dzięki czemu powtarzane odświeżenia paneli nie wstrzymują już gossipu ani płatności. **Rozłóż początkowe ponowne połączenia** jest teraz domyślnie włączone.

Pełne informacje: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta`,
    fr_FR: `LND a été mis à jour vers 0.21.2-beta, une version corrective.

- Deux échecs de démarrage lors des mises à niveau de la base de données sont corrigés : un nœud dont l'historique de paiements contenait une route aveugle incomplète pouvait ne pas démarrer, et une base de données dépourvue de sa clé de version pouvait ignorer une mise à niveau obligatoire.
- La mémoire utilisée lors de la synchronisation du graphe des canaux est désormais bornée, de sorte qu'un pair malveillant ne peut plus amener LND à mettre en mémoire tampon une quantité de données imprévisible.
- Corrige une situation de compétition lors de la fermeture coopérative d'un canal ainsi que plusieurs erreurs de décodage des messages onion.
- Ajoute \`lncli wallet submitpackage\`, qui soumet une transaction sans frais accompagnée d'une transaction enfant payant les frais, via Bitcoin.

La vérification d'état « Progression de la synchronisation du réseau et du graphe » indique désormais combien de pairs sont connectés et depuis combien de temps la synchronisation du graphe est en attente, ce qui permet de distinguer une synchronisation simplement lente d'une synchronisation bloquée sur un pair qui ne répond pas.

Les paramètres de Performance gagnent **Durée du cache du graphe**, qui met en cache la réponse à une requête du graphe complet du réseau afin que des actualisations répétées des tableaux de bord ne bloquent plus le gossip ni les paiements. **Échelonner la reconnexion initiale** est désormais activé par défaut.

Notes complètes : https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta`,
  },
  migrations: {
    up: async ({ effects, progress }) => {
      // Replay keys abandoned when bitcoind renamed its config action. Nothing
      // reaps them, and they keep demanding whatever they last asked for.
      await sdk.action.clearTask(
        effects,
        'bitcoind:config',
        'bitcoind:other-config',
      )
      // The bolt → SQLite conversion, for nodes updating from a pre-0.21
      // release — as a migration so it runs on updates only, reporting its two
      // phases to the update progress UI. Gated on data state, not version: an
      // already-converted node no-ops, and bolt data that arrives outside an
      // update (an Initialize Wallet import, a restored pre-conversion backup)
      // is converted by main's conversion phase instead (sqliteBackend.ts).
      if (await needsSqliteMigration()) {
        // Migrations run before the seedFiles and setupCerts init steps, and
        // the conversion's finalize stage runs LND against both on-disk
        // artifacts — so bring each current first. The conf re-render strips
        // what the schema retires (the pre-0.21 onion-message keys crash 0.21
        // with "feature bit: 39 already set"); the cert reissue covers curls
        // pinned to 127.0.0.1, a SAN pre-0.21 certs lack, without which the
        // schema run wedges until its timeout.
        await lndConfFile.merge(effects, {})
        await writeCerts(effects)
        await runSqliteMigration(effects, progress)
      }
    },
  },
})
