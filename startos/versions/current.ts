import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:6',
  releaseNotes: {
    en_US: `Updates continuous-backup transfers to rclone 1.75.1, including upstream security and reliability fixes.

The SFTP continuous-backup target explains which directory its folder path is relative to, and how to find it.`,
    es_ES: `Actualiza las transferencias de copias continuas a rclone 1.75.1, incluidas correcciones de seguridad y fiabilidad de rclone.

El destino SFTP de copias continuas explica respecto a qué directorio es relativa la ruta de su carpeta, y cómo averiguarlo.`,
    de_DE: `Aktualisiert kontinuierliche Backup-Übertragungen auf rclone 1.75.1, einschließlich Sicherheits- und Zuverlässigkeitskorrekturen von rclone.

Das SFTP-Ziel für kontinuierliche Backups erklärt, auf welches Verzeichnis sich der Ordnerpfad bezieht und wie man es findet.`,
    pl_PL: `Aktualizuje transfery kopii ciągłych do rclone 1.75.1, wprowadzając poprawki bezpieczeństwa i niezawodności rclone.

Cel SFTP kopii ciągłych wyjaśnia, względem którego katalogu jest ścieżka folderu i jak go znaleźć.`,
    fr_FR: `Met à jour les transferts de sauvegarde continue vers rclone 1.75.1, avec des correctifs de sécurité et de fiabilité de rclone.

La cible SFTP de sauvegarde continue explique par rapport à quel répertoire le chemin de son dossier est relatif, et comment le trouver.`,
  },
  migrations: {
    up: async () => {},
  },
})
