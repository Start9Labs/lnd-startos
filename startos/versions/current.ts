import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:2',
  releaseNotes: {
    en_US:
      'Raise the database migration timeout so large nodes can finish the SQLite conversion.',
    es_ES:
      'Aumenta el tiempo de espera de la migración de la base de datos para que los nodos grandes puedan completar la conversión a SQLite.',
    de_DE:
      'Erhöht das Zeitlimit der Datenbankmigration, damit große Nodes die SQLite-Konvertierung abschließen können.',
    pl_PL:
      'Zwiększa limit czasu migracji bazy danych, aby duże węzły mogły ukończyć konwersję do SQLite.',
    fr_FR:
      'Augmente le délai d’expiration de la migration de la base de données afin que les grands nœuds puissent terminer la conversion vers SQLite.',
  },
  migrations: {},
})
