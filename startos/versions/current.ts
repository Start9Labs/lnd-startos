import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:6',
  releaseNotes: {
    en_US: `Updates continuous-backup transfers to rclone 1.75.1, including upstream security and reliability fixes.

The TunnelSats service can now route this node's clearnet traffic through its tunnel and announce the tunnel's address, by raising a prompt on LND.

New Payments actions: Pay Invoice pays a Lightning invoice from the node, and Receive Payment creates one for it to be paid.`,
    es_ES: `Actualiza las transferencias de copias continuas a rclone 1.75.1, incluidas correcciones de seguridad y fiabilidad de rclone.

El servicio TunnelSats ahora puede enrutar el tráfico clearnet de este nodo por su túnel y anunciar la dirección del túnel, mostrando un aviso en LND.

Nuevas acciones de Pagos: Pagar factura paga una factura Lightning desde el nodo, y Recibir pago crea una para que se le pague.`,
    de_DE: `Aktualisiert kontinuierliche Backup-Übertragungen auf rclone 1.75.1, einschließlich Sicherheits- und Zuverlässigkeitskorrekturen von rclone.

Der TunnelSats-Dienst kann den Clearnet-Verkehr dieses Knotens jetzt durch seinen Tunnel leiten und die Adresse des Tunnels ankündigen, indem er eine Aufforderung in LND auslöst.

Neue Aktionen unter Zahlungen: Rechnung bezahlen bezahlt eine Lightning-Rechnung vom Knoten aus, und Zahlung empfangen erstellt eine, mit der er bezahlt werden kann.`,
    pl_PL: `Aktualizuje transfery kopii ciągłych do rclone 1.75.1, wprowadzając poprawki bezpieczeństwa i niezawodności rclone.

Usługa TunnelSats może teraz kierować ruch clearnet tego węzła przez swój tunel i ogłaszać adres tunelu, wyświetlając monit w LND.

Nowe akcje w grupie Płatności: Zapłać fakturę opłaca fakturę Lightning z węzła, a Odbierz płatność tworzy fakturę do opłacenia.`,
    fr_FR: `Met à jour les transferts de sauvegarde continue vers rclone 1.75.1, avec des correctifs de sécurité et de fiabilité de rclone.

Le service TunnelSats peut désormais acheminer le trafic clearnet de ce nœud par son tunnel et annoncer l'adresse du tunnel, en affichant une invite dans LND.

Nouvelles actions Paiements : Payer une facture règle une facture Lightning depuis le nœud, et Recevoir un paiement en crée une pour qu'il soit payé.`,
  },
  migrations: {
    up: async () => {},
  },
})
