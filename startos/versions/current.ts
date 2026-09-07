import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:2',
  releaseNotes: {
    en_US: `Adds Configure Channel Backups, which keeps a copy of channel.backup on Google Drive, Dropbox, Nextcloud or an SFTP server and updates it whenever your channels change. A restore uses that copy when it is newer than the one inside your StartOS backup.`,
    es_ES: `Añade Configurar copias de canales, que mantiene una copia de channel.backup en Google Drive, Dropbox, Nextcloud o un servidor SFTP y la actualiza cada vez que cambian tus canales. Una restauración usa esa copia cuando es más reciente que la incluida en tu copia de StartOS.`,
    de_DE: `Fügt „Kanal-Backups einrichten“ hinzu: eine Kopie von channel.backup wird auf Google Drive, Dropbox, Nextcloud oder einem SFTP-Server gehalten und bei jeder Änderung deiner Kanäle aktualisiert. Eine Wiederherstellung verwendet diese Kopie, wenn sie neuer ist als die im StartOS-Backup.`,
    pl_PL: `Dodaje „Skonfiguruj kopie kanałów”, które utrzymuje kopię channel.backup na Google Drive, Dropbox, Nextcloud lub serwerze SFTP i aktualizuje ją przy każdej zmianie kanałów. Przywracanie używa tej kopii, gdy jest nowsza niż ta w kopii StartOS.`,
    fr_FR: `Ajoute « Configurer les sauvegardes de canaux », qui conserve une copie de channel.backup sur Google Drive, Dropbox, Nextcloud ou un serveur SFTP et la met à jour à chaque changement de vos canaux. Une restauration utilise cette copie lorsqu'elle est plus récente que celle contenue dans votre sauvegarde StartOS.`,
  },
  migrations: {
    up: async () => {},
  },
})
