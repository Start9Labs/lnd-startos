import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:4',
  releaseNotes: {
    en_US:
      'Migrate from StartOS now accepts an origin running StartOS 0.3.5.x.',
    es_ES: 'Migrar desde StartOS ahora acepta un origen con StartOS 0.3.5.x.',
    de_DE:
      'Von StartOS migrieren akzeptiert jetzt einen Ursprung mit StartOS 0.3.5.x.',
    pl_PL:
      'Migruj z StartOS akceptuje teraz źródło z systemem StartOS 0.3.5.x.',
    fr_FR:
      'Migrer depuis StartOS accepte désormais une origine sous StartOS 0.3.5.x.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
