import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:4',
  releaseNotes: {
    en_US:
      "LND keeps responding when apps such as Balance of Satoshis' Telegram bot start watching its invoices. Google Drive continuous backups warn when Google will end the sign-in, explain how to sign in again when it does, and offer the sign-in link again. LND's actions are available shortly after a restart even while a backup target is failing.",
    es_ES:
      'LND sigue respondiendo cuando aplicaciones como el bot de Telegram de Balance of Satoshis empiezan a vigilar sus facturas. Las copias continuas en Google Drive avisan cuando Google vaya a poner fin al inicio de sesión, explican cómo volver a iniciar sesión cuando ocurra y vuelven a ofrecer el enlace de inicio de sesión. Las acciones de LND están disponibles poco después de un reinicio aunque falle un destino de copia.',
    de_DE:
      'LND reagiert weiterhin, wenn Apps wie der Telegram-Bot von Balance of Satoshis beginnen, seine Rechnungen zu beobachten. Kontinuierliche Backups auf Google Drive warnen, wenn Google die Anmeldung beenden wird, erklären dann, wie man sich erneut anmeldet, und bieten den Anmeldelink erneut an. Die Aktionen von LND sind kurz nach einem Neustart verfügbar, auch wenn ein Backup-Ziel fehlschlägt.',
    pl_PL:
      'LND nadal odpowiada, gdy aplikacje takie jak bot Telegrama w Balance of Satoshis zaczynają obserwować jego faktury. Kopie ciągłe na Google Drive ostrzegają, gdy Google zakończy logowanie, wyjaśniają wtedy, jak zalogować się ponownie, i ponownie podają link do logowania. Akcje LND są dostępne wkrótce po ponownym uruchomieniu, nawet gdy cel kopii zawodzi.',
    fr_FR:
      'LND continue de répondre lorsque des applications comme le bot Telegram de Balance of Satoshis commencent à surveiller ses factures. Les sauvegardes continues sur Google Drive préviennent lorsque Google mettra fin à la connexion, expliquent alors comment se reconnecter et proposent de nouveau le lien de connexion. Les actions de LND sont disponibles peu après un redémarrage, même quand une cible de sauvegarde échoue.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
