import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.8-beta:4',
  releaseNotes: {
    en_US:
      'Continuous Backup health updates within seconds of saving Continuous Backups or of a backup finishing.',
    es_ES:
      'El estado de Copia continua se actualiza en segundos tras guardar Copias continuas o al terminar una copia.',
    de_DE:
      'Der Status von Kontinuierliches Backup aktualisiert sich innerhalb von Sekunden, nachdem Kontinuierliche Backups gespeichert wurde oder ein Backup abgeschlossen ist.',
    pl_PL:
      'Stan Kopia ciągła aktualizuje się w ciągu kilku sekund po zapisaniu Kopie ciągłe lub po zakończeniu kopii.',
    fr_FR:
      'L’état de Sauvegarde continue se met à jour en quelques secondes après l’enregistrement de Sauvegardes continues ou la fin d’une sauvegarde.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
