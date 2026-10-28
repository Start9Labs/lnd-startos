import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.5-beta:0',
  releaseNotes: {
    en_US: `Updated LND to 0.21.5-beta. Fixes the invoice-subscription SQLite deadlock, graph conversion with empty policy signatures, low commitment-fee handling, and wallet synchronization across block reorganizations. Improves SQL startup cleanup and wallet query performance. The SQLite pool override is removed, restoring LND's default of 2 connections per database. Updated rclone to 1.75.2 with security and backup-transfer fixes.

Taproot overlay channels: keep tapd's auxiliary signer running. Commitments with missing auxiliary HTLC signatures are now rejected and force-close the channel. Existing inconsistent wallet history is not repaired by this update.

[Full LND release notes](https://github.com/lightningnetwork/lnd/blob/v0.21.5-beta/docs/release-notes/release-notes-0.21.5.md) · [rclone release notes](https://rclone.org/changelog/#v1-75-2-2026-10-09)`,
    es_ES: `LND actualizado a 0.21.5-beta. Corrige el bloqueo de SQLite por suscripciones a facturas, la conversión del grafo con firmas de políticas vacías, el manejo de comisiones de compromiso bajas y la sincronización de la billetera durante reorganizaciones de bloques. Mejora la limpieza de SQL al iniciar y el rendimiento de las consultas de la billetera. Se elimina la configuración del grupo de conexiones SQLite y se restaura el valor predeterminado de LND de 2 conexiones por base de datos. rclone actualizado a 1.75.2 con correcciones de seguridad y de transferencia de copias de seguridad.

Canales taproot overlay: mantén en ejecución el firmante auxiliar de tapd. Los compromisos sin firmas HTLC auxiliares ahora se rechazan y provocan el cierre forzado del canal. Esta actualización no repara un historial de billetera ya inconsistente.

[Notas completas de LND](https://github.com/lightningnetwork/lnd/blob/v0.21.5-beta/docs/release-notes/release-notes-0.21.5.md) · [Notas de rclone](https://rclone.org/changelog/#v1-75-2-2026-10-09)`,
    de_DE: `LND auf 0.21.5-beta aktualisiert. Behebt den SQLite-Deadlock bei Rechnungsabonnements, die Graphkonvertierung bei leeren Richtliniensignaturen, den Umgang mit niedrigen Commitment-Gebühren und die Wallet-Synchronisierung bei Blockreorganisationen. Verbessert die SQL-Bereinigung beim Start und die Leistung von Wallet-Abfragen. Die SQLite-Pool-Vorgabe wird entfernt; es gilt wieder LNDs Standard von 2 Verbindungen pro Datenbank. rclone auf 1.75.2 mit Sicherheits- und Backup-Übertragungskorrekturen aktualisiert.

Taproot-Overlay-Kanäle: Den Hilfssignierer von tapd weiter betreiben. Commitments ohne zusätzliche HTLC-Signaturen werden nun abgewiesen und der Kanal wird zwangsweise geschlossen. Ein bereits inkonsistenter Wallet-Verlauf wird durch dieses Update nicht repariert.

[Vollständige LND-Versionshinweise](https://github.com/lightningnetwork/lnd/blob/v0.21.5-beta/docs/release-notes/release-notes-0.21.5.md) · [rclone-Versionshinweise](https://rclone.org/changelog/#v1-75-2-2026-10-09)`,
    pl_PL: `Zaktualizowano LND do 0.21.5-beta. Naprawiono zakleszczenie SQLite przy subskrypcjach faktur, konwersję grafu z pustymi podpisami polityk, obsługę niskich opłat transakcji zobowiązania oraz synchronizację portfela podczas reorganizacji bloków. Usprawniono czyszczenie SQL przy uruchamianiu i wydajność zapytań portfela. Usunięto nadpisanie puli SQLite, przywracając domyślne 2 połączenia na bazę danych w LND. Zaktualizowano rclone do 1.75.2 z poprawkami bezpieczeństwa i przesyłania kopii zapasowych.

Kanały taproot overlay: pozostaw uruchomiony pomocniczy moduł podpisujący tapd. Zobowiązania bez pomocniczych podpisów HTLC są teraz odrzucane i powodują wymuszone zamknięcie kanału. Aktualizacja nie naprawia już niespójnej historii portfela.

[Pełne informacje o wydaniu LND](https://github.com/lightningnetwork/lnd/blob/v0.21.5-beta/docs/release-notes/release-notes-0.21.5.md) · [Informacje o wydaniu rclone](https://rclone.org/changelog/#v1-75-2-2026-10-09)`,
    fr_FR: `LND mis à jour vers 0.21.5-beta. Corrige le blocage SQLite des abonnements aux factures, la conversion du graphe avec des signatures de politique vides, la gestion des frais d'engagement trop bas et la synchronisation du portefeuille lors des réorganisations de blocs. Améliore le nettoyage SQL au démarrage et les performances des requêtes du portefeuille. La surcharge du pool SQLite est supprimée, rétablissant la valeur par défaut de LND de 2 connexions par base de données. rclone mis à jour vers 1.75.2 avec des correctifs de sécurité et de transfert des sauvegardes.

Canaux taproot overlay : laissez fonctionner le signataire auxiliaire de tapd. Les engagements sans signatures HTLC auxiliaires sont désormais rejetés et provoquent la fermeture forcée du canal. Cette mise à jour ne répare pas un historique de portefeuille déjà incohérent.

[Notes complètes de LND](https://github.com/lightningnetwork/lnd/blob/v0.21.5-beta/docs/release-notes/release-notes-0.21.5.md) · [Notes de rclone](https://rclone.org/changelog/#v1-75-2-2026-10-09)`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
