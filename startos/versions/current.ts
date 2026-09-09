import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:2',
  releaseNotes: {
    en_US: `Adds Configure Channel Backups, which keeps the current channel.backup on Google Drive, Dropbox, Nextcloud or an SFTP server and updates it whenever your channels change.`,
    es_ES: `Añade Configurar copias de canales, que mantiene el channel.backup actual en Google Drive, Dropbox, Nextcloud o un servidor SFTP y lo actualiza cada vez que cambian tus canales.`,
    de_DE: `Fügt „Kanal-Backups einrichten“ hinzu: Das aktuelle channel.backup wird auf Google Drive, Dropbox, Nextcloud oder einem SFTP-Server gespeichert und bei jeder Änderung deiner Kanäle aktualisiert.`,
    pl_PL: `Dodaje „Skonfiguruj kopie kanałów”, które przechowuje aktualny plik channel.backup na Google Drive, Dropbox, Nextcloud lub serwerze SFTP i aktualizuje go przy każdej zmianie kanałów.`,
    fr_FR: `Ajoute « Configurer les sauvegardes de canaux », qui conserve le channel.backup actuel sur Google Drive, Dropbox, Nextcloud ou un serveur SFTP et le met à jour à chaque changement de vos canaux.`,
  },
  migrations: {
    up: async () => {},
  },
})
