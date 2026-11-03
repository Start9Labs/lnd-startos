import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.6-beta:0',
  releaseNotes: {
    en_US:
      'Updated LND to 0.21.6-beta. LND no longer accepts Multipath TCP (MPTCP) connections, closing the demonstrated path for exploiting the Linux kernel vulnerability CVE-2026-98432 through LND. This does not fix the kernel vulnerability itself. Full release notes: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    es_ES:
      'Actualiza LND a 0.21.6-beta. LND ya no acepta conexiones Multipath TCP (MPTCP), lo que cierra la vía demostrada para explotar a través de LND la vulnerabilidad del kernel de Linux CVE-2026-98432. Esto no corrige la vulnerabilidad del kernel en sí. Notas completas: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    de_DE:
      'Aktualisiert LND auf 0.21.6-beta. LND nimmt keine Multipath-TCP-Verbindungen (MPTCP) mehr an und schließt damit den demonstrierten Weg, die Linux-Kernel-Schwachstelle CVE-2026-98432 über LND auszunutzen. Die Kernel-Schwachstelle selbst wird dadurch nicht behoben. Vollständige Versionshinweise: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    pl_PL:
      'Aktualizuje LND do 0.21.6-beta. LND nie przyjmuje już połączeń Multipath TCP (MPTCP), co zamyka zademonstrowaną drogę wykorzystania przez LND luki w jądrze Linuksa CVE-2026-98432. Nie naprawia to samej luki w jądrze. Pełne informacje o wydaniu: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    fr_FR:
      'Met à jour LND vers 0.21.6-beta. LND n’accepte plus les connexions Multipath TCP (MPTCP), ce qui ferme la voie d’exploitation démontrée de la vulnérabilité du noyau Linux CVE-2026-98432 via LND. Cela ne corrige pas la vulnérabilité du noyau elle-même. Notes complètes : https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
