import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:1',
  releaseNotes: {
    en_US: `Updated LND to 0.21.3-beta.

Fixes native SQLite migration for AMP invoices, peer-triggered resource exhaustion, a wallet-wide channel-funding deadlock, stuck forwarded HTLCs, cooperative-close failures, and REST WebSocket and transaction-pagination panics.

[Full upstream release notes](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.3-beta)

Adds a Wallet Unlock health check that reports errors from LND's normal wallet unlock request while the wallet remains locked.`,
    es_ES: `LND se ha actualizado a 0.21.3-beta.

Corrige la migración nativa a SQLite de facturas AMP, el agotamiento de recursos provocado por pares, un bloqueo de la financiación de canales que afectaba a todo el monedero, HTLC reenviados atascados, fallos en cierres cooperativos y errores críticos en WebSocket REST y en la paginación de transacciones.

[Notas completas de la versión upstream](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.3-beta)

Añade una comprobación de estado «Desbloqueo del monedero» que informa de los errores de la solicitud normal de desbloqueo mientras el monedero permanece bloqueado.`,
    de_DE: `LND wurde auf 0.21.3-beta aktualisiert.

Behebt die native SQLite-Migration für AMP-Rechnungen, durch Peers ausgelöste Ressourcenerschöpfung, eine walletweite Blockade der Kanalfinanzierung, festhängende weitergeleitete HTLCs, Fehler beim kooperativen Schließen sowie Abstürze bei REST-WebSockets und der Transaktionspaginierung.

[Vollständige Upstream-Versionshinweise](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.3-beta)

Fügt eine Zustandsprüfung „Wallet-Entsperrung“ hinzu, die Fehler von LNDs normaler Entsperranfrage meldet, solange die Wallet gesperrt bleibt.`,
    pl_PL: `Zaktualizowano LND do wersji 0.21.3-beta.

Naprawiono natywną migrację SQLite dla faktur AMP, wyczerpywanie zasobów wywoływane przez peery, blokadę finansowania kanałów obejmującą cały portfel, zablokowane przekazywane HTLC, błędy przy kooperacyjnym zamykaniu kanałów oraz awarie WebSocket REST i stronicowania transakcji.

[Pełne informacje o wydaniu upstream](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.3-beta)

Dodaje kontrolę stanu „Odblokowanie portfela”, która zgłasza błędy zwykłego żądania odblokowania LND, gdy portfel pozostaje zablokowany.`,
    fr_FR: `LND a été mis à jour vers la version 0.21.3-beta.

Corrige la migration SQLite native des factures AMP, l'épuisement des ressources provoqué par des pairs, un blocage du financement des canaux affectant tout le portefeuille, des HTLC transférés bloqués, des échecs de fermeture coopérative ainsi que des plantages liés aux WebSockets REST et à la pagination des transactions.

[Notes de version upstream complètes](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.3-beta)

Ajoute une vérification d'état « Déverrouillage du portefeuille » qui signale les erreurs de la requête normale de déverrouillage de LND tant que le portefeuille reste verrouillé.`,
  },
  migrations: {
    up: async () => {},
  },
})
