import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.6-beta:3',
  releaseNotes: {
    en_US:
      'Requires StartOS 0.4.1 or later. Services that depend on LND can now be given a credential limited to invoices and Lightning payments, or its admin macaroon, without access to its seed.',
    es_ES:
      'Requiere StartOS 0.4.1 o posterior. Los servicios que dependen de LND ahora pueden recibir una credencial limitada a facturas y pagos Lightning, o su macaroon de administrador, sin acceso a su semilla.',
    de_DE:
      'Erfordert StartOS 0.4.1 oder neuer. Dienste, die von LND abhängen, können jetzt eine auf Rechnungen und Lightning-Zahlungen beschränkte Berechtigung oder sein Admin-Macaroon erhalten, ohne Zugriff auf seinen Seed.',
    pl_PL:
      'Wymaga StartOS 0.4.1 lub nowszego. Usługi zależne od LND mogą teraz otrzymać poświadczenie ograniczone do faktur i płatności Lightning lub jego macaroon administratora, bez dostępu do jego seeda.',
    fr_FR:
      'Nécessite StartOS 0.4.1 ou une version ultérieure. Les services qui dépendent de LND peuvent désormais recevoir un identifiant limité aux factures et aux paiements Lightning, ou son macaroon administrateur, sans accès à sa graine.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
