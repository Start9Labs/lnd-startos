import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:6',
  releaseNotes: {
    en_US:
      'Updates continuous-backup transfers to rclone 1.75.1, including upstream security and reliability fixes.',
    es_ES:
      'Actualiza las transferencias de copias continuas a rclone 1.75.1, incluidas correcciones de seguridad y fiabilidad de rclone.',
    de_DE:
      'Aktualisiert kontinuierliche Backup-Übertragungen auf rclone 1.75.1, einschließlich Sicherheits- und Zuverlässigkeitskorrekturen von rclone.',
    pl_PL:
      'Aktualizuje transfery kopii ciągłych do rclone 1.75.1, wprowadzając poprawki bezpieczeństwa i niezawodności rclone.',
    fr_FR:
      'Met à jour les transferts de sauvegarde continue vers rclone 1.75.1, avec des correctifs de sécurité et de fiabilité de rclone.',
  },
  migrations: {
    up: async () => {},
  },
})
