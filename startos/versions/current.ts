import { VersionInfo } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { writeCerts } from '../init/setupCerts'
import { sdk } from '../sdk'
import { needsSqliteMigration, runSqliteMigration } from '../sqliteBackend'

export const current = VersionInfo.of({
  version: '0.21.2-beta:4',
  releaseNotes: {
    en_US: `Updated LND to 0.21.2-beta — bug fixes and performance improvements. Full notes: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta

- Fixes LND restarting continuously after Revoke Macaroons is run. If your node was affected, re-pair everything connected to it.
- gRPC LND Connect now works with wallets that pair over gRPC, and its QR code renders. Re-pair any wallet already connected over gRPC.
- Network and Graph Sync Progress reports how many peers are connected and how long a pending sync has been waiting.
- Performance settings add Graph Cache Duration; Stagger Initial Reconnect is now on by default.`,
    es_ES: `Se actualizó LND a 0.21.2-beta: correcciones de errores y mejoras de rendimiento. Notas completas: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta

- Corrige que LND se reiniciara continuamente después de ejecutar Revocar macaroons. Si tu nodo se vio afectado, vuelve a emparejar todo lo que esté conectado a él.
- gRPC LND Connect ya funciona con las carteras que se emparejan por gRPC, y su código QR se muestra. Vuelve a emparejar cualquier cartera ya conectada por gRPC.
- Progreso de sincronización de red y grafo indica cuántos pares están conectados y cuánto tiempo lleva esperando una sincronización pendiente.
- Los ajustes de Rendimiento añaden Duración de la caché del grafo; Escalonar Reconexión Inicial ahora está activado de forma predeterminada.`,
    de_DE: `LND wurde auf 0.21.2-beta aktualisiert — Fehlerbehebungen und Leistungsverbesserungen. Vollständige Hinweise: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta

- Behebt, dass LND nach dem Ausführen von „Macaroons widerrufen“ fortlaufend neu startete. War Ihr Knoten betroffen, koppeln Sie alles neu, was mit ihm verbunden ist.
- gRPC LND Connect funktioniert jetzt mit Wallets, die sich über gRPC koppeln, und sein QR-Code wird angezeigt. Koppeln Sie jede bereits über gRPC verbundene Wallet neu.
- „Netzwerk- und Graph-Synchronisierungsfortschritt“ meldet, wie viele Peers verbunden sind und wie lange eine ausstehende Synchronisierung bereits wartet.
- Die Leistungseinstellungen erhalten „Graph-Cache-Dauer“; „Anfängliche Wiederverbindung staffeln“ ist jetzt standardmäßig aktiv.`,
    pl_PL: `Zaktualizowano LND do 0.21.2-beta — poprawki błędów i usprawnienia wydajności. Pełne informacje: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta

- Naprawiono ciągłe restartowanie się LND po uruchomieniu „Unieważnij macaroons”. Jeśli dotyczyło to Twojego węzła, połącz ponownie wszystko, co jest z nim połączone.
- gRPC LND Connect działa teraz z portfelami łączącymi się przez gRPC, a jego kod QR jest wyświetlany. Połącz ponownie każdy portfel już podłączony przez gRPC.
- „Postęp synchronizacji sieci i grafu” pokazuje, ilu peerów jest połączonych i jak długo oczekuje trwająca synchronizacja.
- Ustawienia wydajności zyskują „Czas pamięci podręcznej grafu”; „Rozłóż początkowe ponowne połączenia” jest teraz domyślnie włączone.`,
    fr_FR: `LND a été mis à jour vers 0.21.2-beta — corrections de bogues et améliorations des performances. Notes complètes : https://github.com/lightningnetwork/lnd/releases/tag/v0.21.2-beta

- Corrige le redémarrage continu de LND après l'exécution de « Révoquer les macaroons ». Si votre nœud a été touché, ré-appairez tout ce qui y est connecté.
- gRPC LND Connect fonctionne désormais avec les portefeuilles qui s'appairent en gRPC, et son QR code s'affiche. Ré-appairez tout portefeuille déjà connecté en gRPC.
- « Progression de la synchronisation du réseau et du graphe » indique combien de pairs sont connectés et depuis combien de temps une synchronisation est en attente.
- Les paramètres de Performance ajoutent « Durée du cache du graphe » ; « Échelonner la reconnexion initiale » est désormais activé par défaut.`,
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
