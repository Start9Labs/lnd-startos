import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:2',
  releaseNotes: {
    en_US: `Adds Configure Channel Backups, which keeps a copy of channel.backup on Google Drive, Dropbox, Nextcloud or an SFTP server and updates it whenever your channels change. A restore recovers channels from every copy it finds there as well as from the one inside your StartOS backup.`,
    es_ES: `Añade Configurar copias de canales, que mantiene una copia de channel.backup en Google Drive, Dropbox, Nextcloud o un servidor SFTP y la actualiza cada vez que cambian tus canales. Una restauración recupera los canales de todas las copias que encuentra allí, además de la incluida en tu copia de StartOS.`,
    de_DE: `Fügt „Kanal-Backups einrichten“ hinzu: eine Kopie von channel.backup wird auf Google Drive, Dropbox, Nextcloud oder einem SFTP-Server gehalten und bei jeder Änderung deiner Kanäle aktualisiert. Eine Wiederherstellung stellt Kanäle aus jeder dort gefundenen Kopie wieder her, zusätzlich zu der im StartOS-Backup.`,
    pl_PL: `Dodaje „Skonfiguruj kopie kanałów”, które utrzymuje kopię channel.backup na Google Drive, Dropbox, Nextcloud lub serwerze SFTP i aktualizuje ją przy każdej zmianie kanałów. Przywracanie odzyskuje kanały z każdej znalezionej tam kopii, a także z tej zawartej w kopii StartOS.`,
    fr_FR: `Ajoute « Configurer les sauvegardes de canaux », qui conserve une copie de channel.backup sur Google Drive, Dropbox, Nextcloud ou un serveur SFTP et la met à jour à chaque changement de vos canaux. Une restauration récupère les canaux depuis chaque copie qu'elle y trouve, en plus de celle contenue dans votre sauvegarde StartOS.`,
  },
  migrations: {
    up: async () => {},
  },
})
