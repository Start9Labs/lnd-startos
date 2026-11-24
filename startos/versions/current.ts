import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.8-beta:5',
  releaseNotes: {
    en_US:
      "New Decode Invoice action under Payments: it shows an invoice's amount, destination, description, creation and expiry times, network and payment hash, and pays nothing. A payment prompt from another service shows only the invoice's amount and destination; the description appears in the result after paying.",
    es_ES:
      'Nueva acción Decodificar factura en Pagos: muestra el importe, el destino, la descripción, las fechas de creación y caducidad, la red y el hash de pago de una factura, sin pagar nada. Una solicitud de pago de otro servicio muestra solo el importe y el destino de la factura; la descripción aparece en el resultado tras pagar.',
    de_DE:
      'Neue Aktion Rechnung dekodieren unter Zahlungen: Sie zeigt Betrag, Ziel, Beschreibung, Erstellungs- und Ablaufzeit, Netzwerk und Zahlungs-Hash einer Rechnung und bezahlt nichts. Eine Zahlungsaufforderung eines anderen Dienstes zeigt nur Betrag und Ziel der Rechnung; die Beschreibung erscheint nach der Zahlung im Ergebnis.',
    pl_PL:
      'Nowa akcja Dekoduj fakturę w grupie Płatności: pokazuje kwotę, miejsce docelowe, opis, czas utworzenia i wygaśnięcia, sieć oraz hash płatności faktury i niczego nie płaci. Prośba o płatność od innej usługi pokazuje tylko kwotę i miejsce docelowe faktury; opis pojawia się w wyniku po zapłacie.',
    fr_FR:
      'Nouvelle action Décoder une facture dans Paiements : elle affiche le montant, la destination, la description, les dates de création et d’expiration, le réseau et le hachage de paiement d’une facture, sans rien payer. Une demande de paiement d’un autre service n’affiche que le montant et la destination de la facture ; la description apparaît dans le résultat après le paiement.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
