import { VersionInfo } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { writeCerts } from '../init/setupCerts'
import { sdk } from '../sdk'
import { needsSqliteMigration, runSqliteMigration } from '../sqliteBackend'

export const current = VersionInfo.of({
  version: '0.21.2-beta:6',
  releaseNotes: {
    en_US: `Restores the "Reject Routing Requests" toggle in Channel Settings, which was dropped when this package's configuration was rewritten for StartOS 0.4.0. Nodes that never enabled it are unaffected — the setting stays off by default.

New Security group and automatic channel-backup feature:

- Channels - Auto-Backup: back up channel.backup to SFTP, Dropbox, Nextcloud, Google Drive, and/or by email whenever a channel opens or closes.
- Channels - Test Auto-Backup: manually trigger a backup to confirm your providers work.
- Wallet - Auto-Unlock: toggle whether LND unlocks automatically with a password stored on the server (an unlocked wallet is at risk if the server is stolen).
- Wallet - Manual Unlock: unlock a wallet whose auto-unlock is disabled.
- Wallet - Password: view / change the wallet password.
- Wallet - Password Backup: confirm you have the password saved.
- Aezeed Cipher Seed: display, confirm backup of, and delete the on-chain seed.
- Watchtower - Server / Client: configure watchtower under Actions > Security.
- A Security Status health check summarizes channels backup, wallet unlocking, seed, and watchtower status.`,
    es_ES: `Se restaura la opción "Rechazar solicitudes de enrutamiento" en Configuración de Canales, que se perdió cuando se reescribió la configuración de este paquete para StartOS 0.4.0. Los nodos que nunca la activaron no se ven afectados — la opción sigue desactivada de forma predeterminada.

Nuevo grupo Seguridad y la función de respaldo automático de canales:

- Canales - Respaldo automático: respalda channel.backup en SFTP, Dropbox, Nextcloud, Google Drive y/o por correo cuando un canal se abre o cierra.
- Canales - Probar respaldo automático: activa manualmente un respaldo para comprobar tus proveedores.
- Cartera - Desbloqueo automático: decide si LND se desbloquea automáticamente con una contraseña almacenada en el servidor.
- Cartera - Desbloqueo manual: desbloquea una cartera cuyo desbloqueo automático está desactivado.
- Cartera - Contraseña: consulta / cambia la contraseña de la cartera.
- Cartera - Respaldo de contraseña: confirma que has guardado la contraseña.
- Semilla Aezeed Cipher: muestra, confirma el respaldo y elimina la semilla on-chain.
- Watchtower - Server / Client: configura el watchtower en Acciones > Seguridad.
- El estado de Seguridad resume el respaldo de canales, el desbloqueo de la cartera, la semilla y el estado del watchtower.`,
    de_DE: `Stellt den Schalter „Routing-Anfragen ablehnen" in den Kanaleinstellungen wieder her, der beim Umschreiben der Konfiguration dieses Pakets für StartOS 0.4.0 entfernt wurde. Knoten, die ihn nie aktiviert haben, sind nicht betroffen — die Einstellung bleibt standardmäßig deaktiviert.

Neue Sicherheits-Gruppe und automatische Kanal-Sicherung:

- Kanäle - Auto-Backup: Sichert channel.backup per SFTP, Dropbox, Nextcloud, Google Drive und/oder E-Mail, sobald ein Kanal geöffnet oder geschlossen wird.
- Kanäle - Auto-Backup testen: Sicherung manuell auslösen, um die Anbieter zu prüfen.
- Wallet - Auto-Unlock: bestimmt, ob LND automatisch mit einem auf dem Server gespeicherten Passwort entsperrt wird.
- Wallet - Manual Unlock: entsperrt ein Wallet mit deaktiviertem Auto-Unlock.
- Wallet - Passwort: zeigt / ändert das Wallet-Passwort.
- Wallet - Passwort-Sicherung: bestätige, dass du das Passwort gesichert hast.
- Aezeed-Cipher-Seed: zeigt, bestätigt und löscht den On-Chain-Seed.
- Watchtower - Server / Client: konfiguriert den Watchtower unter Aktionen > Sicherheit.
- Der Sicherheitsstatus fasst Kanal-Sicherung, Wallet-Entsperrung, Seed- und Watchtower-Status zusammen.`,
    pl_PL: `Przywraca przełącznik „Odrzuć żądania routingu" w ustawieniach kanałów, który został usunięty podczas przepisywania konfiguracji tego pakietu dla StartOS 0.4.0. Węzły, które nigdy go nie włączyły, nie są objęte zmianą — ustawienie domyślnie pozostaje wyłączone.

Nowa grupa Bezpieczeństwo oraz automatyczne tworzenie kopii zapasowych kanałów:

- Kanały - Auto-Backup: kopiuje channel.backup do SFTP, Dropbox, Nextcloud, Google Drive i/lub e-mailem za każdym razem, gdy kanał zostaje otwarty lub zamknięty.
- Kanały - Test auto backupu: ręczne wywołanie kopii, aby sprawdzić dostawców.
- Portfel - Automatyczne odblokowywanie: decyduje, czy LND automatycznie odblokowuje portfel zapisanym hasłem.
- Portfel - Ręczne odblokowywanie: odblokowuje portfel z wyłączonym auto-odblokiem.
- Portfel - Hasło: wyświetla / zmienia hasło portfela.
- Portfel - Kopia zapasowa hasła: potwierdź zapis hasła.
- Ziarno Aezeed Cipher: wyświetla, potwierdza kopię i usuwa ziarno on-chain.
- Watchtower - Server / Client: skonfiguruj watchtower w Działania > Bezpieczeństwo.
- Stan Bezpieczeństwa podsumowuje kopię kanałów, odblokowanie portfela, ziarno i stan watchtowera.`,
    fr_FR: `Restaure l'option « Rejeter les demandes de routage » dans les paramètres des canaux, supprimée lors de la réécriture de la configuration de ce paquet pour StartOS 0.4.0. Les nœuds qui ne l'ont jamais activée ne sont pas concernés : le paramètre reste désactivé par défaut.

Nouveau groupe Sécurité et la fonction de sauvegarde automatique des canaux :

- Canaux - Sauvegarde auto : sauvegarde channel.backup vers SFTP, Dropbox, Nextcloud, Google Drive et/ou par e-mail à chaque ouverture/fermeture de canal.
- Canaux - Tester la sauvegarde auto : déclenche manuellement une sauvegarde pour vérifier vos fournisseurs.
- Portefeuille - Auto-déverrouillage : détermine si LND se déverrouille automatiquement avec un mot de passe stocké sur le serveur.
- Portefeuille - Déverrouillage manuel : déverrouille un portefeuille dont l'auto-déverrouillage est désactivé.
- Portefeuille - Mot de passe : visualise / change le mot de passe du portefeuille.
- Portefeuille - Sauvegarde du mot de passe : confirmez la sauvegarde du mot de passe.
- Graine Aezeed Cipher : affiche, confirme la sauvegarde et supprime la graine on-chain.
- Watchtower - Server / Client : configurez le watchtower sous Actions > Sécurité.
- Le Statut de sécurité résume la sauvegarde des canaux, le déverrouillage du portefeuille, la graine et l'état du watchtower.`,
  },
  migrations: {
    up: async ({ effects, progress }) => {
      // Replay keys abandoned when bitcoind renamed its config action. Nothing
      // reaps them, and they keep demanding whatever they last asked for.
      await sdk.action.clearTask(
        effects,
        'bitcoind:config',
        'bitcoind:other-config',
      )
      // The bolt → SQLite conversion, for nodes updating from a pre-0.21
      // release — as a migration so it runs on updates only, reporting its two
      // phases to the update progress UI. Gated on data state, not version: an
      // already-converted node no-ops, and bolt data that arrives outside an
      // update (an Initialize Wallet import, a restored pre-conversion backup)
      // is converted by main's conversion phase instead (sqliteBackend.ts).
      if (await needsSqliteMigration()) {
        // Migrations run before the seedFiles and setupCerts init steps, and
        // the conversion's finalize stage runs LND against both on-disk
        // artifacts — so bring each current first. The conf re-render strips
        // what the schema retires (the pre-0.21 onion-message keys crash 0.21
        // with "feature bit: 39 already set"); the cert reissue covers curls
        // pinned to 127.0.0.1, a SAN pre-0.21 certs lack, without which the
        // schema run wedges until its timeout.
        await lndConfFile.merge(effects, {})
        await writeCerts(effects)
        await runSqliteMigration(effects, progress)
      }
    },
  },
})
