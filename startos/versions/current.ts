import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:3',
  releaseNotes: {
    en_US: `Adds Configure Channel Backups, which keeps the current channel.backup on Google Drive, Dropbox, Nextcloud or an SFTP server and updates it whenever your channels change. A StartOS restore recovers channels from every copy it finds there as well as from the one inside your StartOS backup.

Adds Cold Storage Mode, an opt-in setting that removes the wallet password and the seed from the server. While it is on, LND starts locked and you unlock it yourself after every restart, including restarts caused by Bitcoin.`,
    es_ES: `Añade Configurar copias de canales, que mantiene el channel.backup actual en Google Drive, Dropbox, Nextcloud o un servidor SFTP y lo actualiza cada vez que cambian tus canales. Una restauración de StartOS recupera los canales de todas las copias que encuentra allí, además de la incluida en tu copia de StartOS.

Añade el modo de almacenamiento en frío, una opción opcional que elimina del servidor la contraseña del monedero y la semilla. Mientras está activo, LND arranca bloqueado y tú lo desbloqueas después de cada reinicio, incluidos los provocados por Bitcoin.`,
    de_DE: `Fügt „Kanal-Backups einrichten“ hinzu: Das aktuelle channel.backup wird auf Google Drive, Dropbox, Nextcloud oder einem SFTP-Server gespeichert und bei jeder Änderung deiner Kanäle aktualisiert. Eine StartOS-Wiederherstellung stellt Kanäle aus jeder dort gefundenen Kopie wieder her, zusätzlich zu der im StartOS-Backup.

Fügt den Cold-Storage-Modus hinzu, eine optionale Einstellung, die das Wallet-Passwort und den Seed vom Server entfernt. Solange er aktiv ist, startet LND gesperrt und du entsperrst es nach jedem Neustart selbst, auch nach Neustarts durch Bitcoin.`,
    pl_PL: `Dodaje „Skonfiguruj kopie kanałów”, które przechowuje aktualny plik channel.backup na Google Drive, Dropbox, Nextcloud lub serwerze SFTP i aktualizuje go przy każdej zmianie kanałów. Przywracanie StartOS odzyskuje kanały z każdej znalezionej tam kopii, a także z tej zawartej w kopii StartOS.

Dodaje tryb zimnego przechowywania — opcjonalne ustawienie, które usuwa z serwera hasło portfela i ziarno. Gdy jest włączony, LND uruchamia się zablokowany i odblokowujesz go samodzielnie po każdym restarcie, w tym po restartach wywołanych przez Bitcoin.`,
    fr_FR: `Ajoute « Configurer les sauvegardes de canaux », qui conserve le channel.backup actuel sur Google Drive, Dropbox, Nextcloud ou un serveur SFTP et le met à jour à chaque changement de vos canaux. Une restauration StartOS récupère les canaux depuis chaque copie qu'elle y trouve, en plus de celle contenue dans votre sauvegarde StartOS.

Ajoute le mode stockage à froid, un réglage optionnel qui retire du serveur le mot de passe du portefeuille et la graine. Tant qu'il est actif, LND démarre verrouillé et vous le déverrouillez vous-même après chaque redémarrage, y compris ceux provoqués par Bitcoin.`,
  },
  migrations: {
    up: async () => {},
  },
})
