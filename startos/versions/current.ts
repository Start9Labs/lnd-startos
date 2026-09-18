import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:6',
  releaseNotes: {
    en_US:
      'Updates continuous-backup transfers to rclone 1.75.1, including upstream security and reliability fixes. Turn On and Turn Off under Cold Storage are now a single action.',
    es_ES:
      'Actualiza las transferencias de copias continuas a rclone 1.75.1, incluidas correcciones de seguridad y fiabilidad de rclone. Activar y desactivar en Almacenamiento en frío son ahora una sola acción.',
    de_DE:
      'Aktualisiert kontinuierliche Backup-Übertragungen auf rclone 1.75.1, einschließlich Sicherheits- und Zuverlässigkeitskorrekturen von rclone. Einschalten und Ausschalten unter Cold Storage sind jetzt eine einzige Aktion.',
    pl_PL:
      'Aktualizuje transfery kopii ciągłych do rclone 1.75.1, wprowadzając poprawki bezpieczeństwa i niezawodności rclone. Włącz i Wyłącz w Zimnym przechowywaniu to teraz jedna akcja.',
    fr_FR:
      "Met à jour les transferts de sauvegarde continue vers rclone 1.75.1, avec des correctifs de sécurité et de fiabilité de rclone. Activer et Désactiver sous Stockage à froid ne forment plus qu'une seule action.",
  },
  migrations: {
    up: async () => {},
  },
})
