import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:3',
  releaseNotes: {
    en_US:
      'Restarting LND while it is still starting stops every process of the previous run.',
    es_ES:
      'Reiniciar LND mientras aún se está iniciando detiene todos los procesos de la ejecución anterior.',
    de_DE:
      'Ein Neustart von LND, während es noch startet, beendet alle Prozesse des vorherigen Laufs.',
    pl_PL:
      'Ponowne uruchomienie LND w trakcie uruchamiania zatrzymuje wszystkie procesy poprzedniego uruchomienia.',
    fr_FR:
      "Redémarrer LND pendant son démarrage arrête tous les processus de l'exécution précédente.",
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
