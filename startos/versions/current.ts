import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.8-beta:3',
  releaseNotes: {
    en_US:
      'Security update for off-box channel backups: they no longer trust certificates issued through a compromised certificate authority, and a Nextcloud server that redirects from HTTPS to plain HTTP is now reported as a failed target instead of being followed unencrypted. [rclone 1.76.0 release notes](https://rclone.org/changelog/#v1-76-0-2026-11-06)',
    es_ES:
      'Actualización de seguridad para las copias de seguridad de canales fuera del servidor: ya no confían en certificados emitidos a través de una autoridad de certificación comprometida, y un servidor Nextcloud que redirige de HTTPS a HTTP sin cifrar ahora se indica como destino fallido en lugar de seguir la redirección sin cifrado. [Notas de la versión de rclone 1.76.0](https://rclone.org/changelog/#v1-76-0-2026-11-06)',
    de_DE:
      'Sicherheitsupdate für externe Kanal-Backups: Sie vertrauen keinen Zertifikaten mehr, die über eine kompromittierte Zertifizierungsstelle ausgestellt wurden, und ein Nextcloud-Server, der von HTTPS auf unverschlüsseltes HTTP umleitet, wird jetzt als fehlgeschlagenes Ziel gemeldet, statt der Umleitung unverschlüsselt zu folgen. [Versionshinweise zu rclone 1.76.0](https://rclone.org/changelog/#v1-76-0-2026-11-06)',
    pl_PL:
      'Aktualizacja bezpieczeństwa zewnętrznych kopii zapasowych kanałów: nie ufają już certyfikatom wystawionym przez skompromitowany urząd certyfikacji, a serwer Nextcloud przekierowujący z HTTPS na nieszyfrowany HTTP jest teraz zgłaszany jako nieudany cel, zamiast podążać za przekierowaniem bez szyfrowania. [Informacje o wydaniu rclone 1.76.0](https://rclone.org/changelog/#v1-76-0-2026-11-06)',
    fr_FR:
      'Mise à jour de sécurité des sauvegardes de canaux hors serveur : elles ne font plus confiance aux certificats émis par une autorité de certification compromise, et un serveur Nextcloud qui redirige de HTTPS vers HTTP non chiffré est désormais signalé comme une cible en échec au lieu de suivre la redirection en clair. [Notes de version de rclone 1.76.0](https://rclone.org/changelog/#v1-76-0-2026-11-06)',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
