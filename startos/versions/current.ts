import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:2',
  releaseNotes: {
    en_US: `Channel backups can now also be delivered by email: choose Email in Configure Continuous Backups, give the SMTP server, port and credentials, and every backup arrives as an attachment. SMTP must use TLS — implicit TLS on port 465, STARTTLS on any other port — and the From address must be one the SMTP login may send as. A restore still fetches the copies held by Google Drive, Dropbox, Nextcloud and SFTP, but not by email: email only ever sends.`,
    es_ES: `Las copias de canales ahora también pueden entregarse por correo: elige Email en Configurar copias continuas, indica el servidor SMTP, el puerto y las credenciales, y cada copia llega como adjunto. SMTP debe usar TLS — TLS implícito en el puerto 465 y STARTTLS en cualquier otro puerto — y la dirección De debe ser una que el inicio de sesión SMTP pueda usar para enviar. Una restauración sigue recuperando las copias que guardan Google Drive, Dropbox, Nextcloud y SFTP, pero no las de correo: el correo solo envía.`,
    de_DE: `Kanal-Backups lassen sich jetzt auch per E-Mail zustellen: Wähle in Kontinuierliche Backups einrichten E-Mail, gib SMTP-Server, Port und Zugangsdaten an, und jedes Backup kommt als Anhang an. SMTP muss TLS verwenden — implizites TLS auf Port 465, STARTTLS auf jedem anderen Port — und die Absenderadresse muss eine sein, für die der SMTP-Login senden darf. Eine Wiederherstellung holt weiterhin die Kopien von Google Drive, Dropbox, Nextcloud und SFTP, aber nicht die von E-Mail: E-Mail sendet nur.`,
    pl_PL: `Kopie zapasowe kanałów można teraz też dostarczać pocztą: wybierz Email w Skonfiguruj kopie ciągłe, podaj serwer SMTP, port i dane logowania, a każda kopia przychodzi jako załącznik. SMTP musi używać TLS — TLS domyślne na porcie 465, STARTTLS na każdym innym porcie — a adres Nadawca musi być taki, na jaki pozwala logowanie SMTP. Przywracanie nadal pobiera kopie trzymane przez Google Drive, Dropbox, Nextcloud i SFTP, ale nie te z poczty: poczta tylko wysyła.`,
    fr_FR: `Les sauvegardes de canaux peuvent désormais aussi être livrées par e-mail : choisissez Email dans Configurer les sauvegardes continues, renseignez le serveur SMTP, le port et les identifiants, et chaque sauvegarde arrive en pièce jointe. SMTP doit utiliser le TLS — TLS implicite sur le port 465, STARTTLS sur tout autre port — et l'adresse Doit être une que l'identifiant SMTP a le droit d'utiliser. Une restauration récupère toujours les copies détenues par Google Drive, Dropbox, Nextcloud et SFTP, mais pas celles de l'e-mail : l'e-mail n'envoie que.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
