import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:7',
  releaseNotes: {
    en_US: `Updates continuous-backup transfers to rclone 1.75.1, including upstream security and reliability fixes.

The SFTP continuous-backup target explains which directory its folder path is relative to, and how to find it.

Turn On and Turn Off under Cold Storage are now a single action.

The TunnelSats service can now route this node's clearnet traffic through its tunnel and announce the tunnel's address, by raising a prompt on LND.

New Payments actions: Pay Invoice pays a Lightning invoice from the node, and Receive Payment creates one for it to be paid.`,
    es_ES: `Actualiza las transferencias de copias continuas a rclone 1.75.1, incluidas correcciones de seguridad y fiabilidad de rclone.

El destino SFTP de copias continuas explica respecto a qué directorio es relativa la ruta de su carpeta, y cómo averiguarlo.

Activar y desactivar en Almacenamiento en frío son ahora una sola acción.

El servicio TunnelSats ahora puede enrutar el tráfico clearnet de este nodo por su túnel y anunciar la dirección del túnel, mostrando un aviso en LND.

Nuevas acciones de Pagos: Pagar factura paga una factura Lightning desde el nodo, y Recibir pago crea una para que se le pague.`,
    de_DE: `Aktualisiert kontinuierliche Backup-Übertragungen auf rclone 1.75.1, einschließlich Sicherheits- und Zuverlässigkeitskorrekturen von rclone.

Das SFTP-Ziel für kontinuierliche Backups erklärt, auf welches Verzeichnis sich der Ordnerpfad bezieht und wie man es findet.

Einschalten und Ausschalten unter Cold Storage sind jetzt eine einzige Aktion.

Der TunnelSats-Dienst kann den Clearnet-Verkehr dieses Knotens jetzt durch seinen Tunnel leiten und die Adresse des Tunnels ankündigen, indem er eine Aufforderung in LND auslöst.

Neue Aktionen unter Zahlungen: Rechnung bezahlen bezahlt eine Lightning-Rechnung vom Knoten aus, und Zahlung empfangen erstellt eine, mit der er bezahlt werden kann.`,
    pl_PL: `Aktualizuje transfery kopii ciągłych do rclone 1.75.1, wprowadzając poprawki bezpieczeństwa i niezawodności rclone.

Cel SFTP kopii ciągłych wyjaśnia, względem którego katalogu jest ścieżka folderu i jak go znaleźć.

Włącz i Wyłącz w Zimnym przechowywaniu to teraz jedna akcja.

Usługa TunnelSats może teraz kierować ruch clearnet tego węzła przez swój tunel i ogłaszać adres tunelu, wyświetlając monit w LND.

Nowe akcje w grupie Płatności: Zapłać fakturę opłaca fakturę Lightning z węzła, a Odbierz płatność tworzy fakturę do opłacenia.`,
    fr_FR: `Met à jour les transferts de sauvegarde continue vers rclone 1.75.1, avec des correctifs de sécurité et de fiabilité de rclone.

La cible SFTP de sauvegarde continue explique par rapport à quel répertoire le chemin de son dossier est relatif, et comment le trouver.

Activer et Désactiver sous Stockage à froid ne forment plus qu'une seule action.

Le service TunnelSats peut désormais acheminer le trafic clearnet de ce nœud par son tunnel et annoncer l'adresse du tunnel, en affichant une invite dans LND.

Nouvelles actions Paiements : Payer une facture règle une facture Lightning depuis le nœud, et Recevoir un paiement en crée une pour qu'il soit payé.`,
  },
  migrations: {
    up: async () => {},
  },
})
