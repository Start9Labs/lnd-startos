import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.8-beta:0',
  releaseNotes: {
    en_US:
      'Updated LND to 0.21.8-beta. Fixes peer disconnects while channels await funding confirmation, recovery of forwarded payments after reconnects, and retries of failed on-chain sweeps. Full release notes: https://github.com/lightningnetwork/lnd/blob/v0.21.8-beta/docs/release-notes/release-notes-0.21.8.md',
    es_ES:
      'Actualiza LND a 0.21.8-beta. Corrige desconexiones de pares mientras los canales esperan la confirmación de financiación, la recuperación de pagos reenviados tras reconexiones y los reintentos de barridos en cadena fallidos. Notas completas: https://github.com/lightningnetwork/lnd/blob/v0.21.8-beta/docs/release-notes/release-notes-0.21.8.md',
    de_DE:
      'Aktualisiert LND auf 0.21.8-beta. Behebt Peer-Verbindungsabbrüche während Kanäle auf die Finanzierungsbestätigung warten, die Wiederherstellung weitergeleiteter Zahlungen nach erneuter Verbindung und Wiederholungsversuche fehlgeschlagener On-Chain-Sweeps. Vollständige Versionshinweise: https://github.com/lightningnetwork/lnd/blob/v0.21.8-beta/docs/release-notes/release-notes-0.21.8.md',
    pl_PL:
      'Aktualizuje LND do 0.21.8-beta. Naprawia rozłączanie peerów podczas oczekiwania kanałów na potwierdzenie finansowania, odzyskiwanie przekazywanych płatności po ponownym połączeniu i ponawianie nieudanych transakcji zbierających środki w łańcuchu. Pełne informacje o wydaniu: https://github.com/lightningnetwork/lnd/blob/v0.21.8-beta/docs/release-notes/release-notes-0.21.8.md',
    fr_FR:
      'Met à jour LND vers 0.21.8-beta. Corrige les déconnexions de pairs pendant que les canaux attendent la confirmation de leur financement, la récupération des paiements relayés après reconnexion et les nouvelles tentatives de balayage de fonds en chaîne après échec. Notes complètes : https://github.com/lightningnetwork/lnd/blob/v0.21.8-beta/docs/release-notes/release-notes-0.21.8.md',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
