import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.6-beta:2',
  releaseNotes: {
    en_US:
      'Requires StartOS 0.4.1 or later. Services that depend on LND can now be given a credential that only creates invoices and makes Lightning payments, instead of full control of the node.',
    es_ES:
      'Requiere StartOS 0.4.1 o posterior. Los servicios que dependen de LND ahora pueden recibir una credencial que solo crea facturas y realiza pagos Lightning, en lugar del control total del nodo.',
    de_DE:
      'Erfordert StartOS 0.4.1 oder neuer. Dienste, die von LND abhängen, können jetzt eine Berechtigung erhalten, die nur Rechnungen erstellt und Lightning-Zahlungen ausführt, statt die volle Kontrolle über den Knoten.',
    pl_PL:
      'Wymaga StartOS 0.4.1 lub nowszego. Usługi zależne od LND mogą teraz otrzymać poświadczenie, które tylko tworzy faktury i wykonuje płatności Lightning, zamiast pełnej kontroli nad węzłem.',
    fr_FR:
      'Nécessite StartOS 0.4.1 ou une version ultérieure. Les services qui dépendent de LND peuvent désormais recevoir un identifiant qui ne fait que créer des factures et effectuer des paiements Lightning, au lieu du contrôle total du nœud.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
