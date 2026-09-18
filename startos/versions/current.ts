import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:6',
  releaseNotes: {
    en_US: `Maintenance update to the continuous-backup tooling; nothing changes in how the service works.`,
    es_ES: `Actualización de mantenimiento de las herramientas de copias continuas; nada cambia en el funcionamiento del servicio.`,
    de_DE: `Wartungsupdate der Werkzeuge für kontinuierliche Backups; am Verhalten des Dienstes ändert sich nichts.`,
    pl_PL: `Aktualizacja serwisowa narzędzi kopii ciągłych; działanie usługi nie zmienia się.`,
    fr_FR: `Mise à jour de maintenance des outils de sauvegarde continue ; rien ne change dans le fonctionnement du service.`,
  },
  migrations: {
    up: async () => {},
  },
})
