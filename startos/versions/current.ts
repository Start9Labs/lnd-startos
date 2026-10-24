import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:7',
  releaseNotes: {
    en_US:
      'LND can be installed or updated over data kept from StartOS 0.3.5.1. Its one-time database conversion then runs the first time LND starts, shown as Database Conversion.',
    es_ES:
      'LND se puede instalar o actualizar sobre datos conservados de StartOS 0.3.5.1. Su conversión única de la base de datos se ejecuta entonces la primera vez que LND arranca, y se muestra como Conversión de la base de datos.',
    de_DE:
      'LND lässt sich über aus StartOS 0.3.5.1 übernommene Daten installieren oder aktualisieren. Die einmalige Datenbankkonvertierung läuft dann beim ersten Start von LND und wird als Datenbankkonvertierung angezeigt.',
    pl_PL:
      'LND można zainstalować lub zaktualizować na danych zachowanych ze StartOS 0.3.5.1. Jednorazowa konwersja bazy danych uruchamia się wtedy przy pierwszym starcie LND i jest widoczna jako Konwersja bazy danych.',
    fr_FR: `LND peut être installé ou mis à jour sur des données conservées de StartOS 0.3.5.1. Sa conversion unique de la base de données s'exécute alors au premier démarrage de LND et s'affiche comme Conversion de la base de données.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
