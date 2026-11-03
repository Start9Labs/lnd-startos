import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.6-beta:0',
  releaseNotes: {
    en_US:
      'Updated LND to 0.21.6-beta. Disables Multipath TCP (MPTCP) listeners by default, mitigating the demonstrated CVE-2026-98432 exploit path through LND. This does not fix the Linux kernel vulnerability or protect other services. Follow the linked host-level mitigation guidance and install a StartOS update containing a patched kernel when available. Do not re-enable MPTCP before the kernel is patched. Full release notes: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    es_ES:
      'Actualiza LND a 0.21.6-beta. Desactiva de forma predeterminada las escuchas Multipath TCP (MPTCP), mitigando la vía de explotación demostrada de CVE-2026-98432 a través de LND. Esto no corrige la vulnerabilidad del kernel de Linux ni protege otros servicios. Sigue las indicaciones de mitigación del sistema anfitrión en el enlace e instala una actualización de StartOS con un kernel corregido cuando esté disponible. No reactives MPTCP antes de corregir el kernel. Notas completas: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    de_DE:
      'Aktualisiert LND auf 0.21.6-beta. Deaktiviert standardmäßig Multipath-TCP-Listener (MPTCP) und entschärft damit den demonstrierten Angriffsweg von CVE-2026-98432 über LND. Dies behebt weder die Linux-Kernel-Schwachstelle noch schützt es andere Dienste. Beachte die verlinkten Schutzmaßnahmen für das Hostsystem und installiere ein StartOS-Update mit korrigiertem Kernel, sobald verfügbar. Aktiviere MPTCP erst nach der Kernel-Korrektur wieder. Vollständige Versionshinweise: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    pl_PL:
      'Aktualizuje LND do 0.21.6-beta. Domyślnie wyłącza nasłuchiwanie Multipath TCP (MPTCP), ograniczając zademonstrowaną drogę wykorzystania CVE-2026-98432 przez LND. Nie naprawia to luki w jądrze Linuksa ani nie chroni innych usług. Zastosuj opisane pod linkiem środki ochrony hosta i zainstaluj aktualizację StartOS z poprawionym jądrem, gdy będzie dostępna. Nie włączaj ponownie MPTCP przed poprawieniem jądra. Pełne informacje o wydaniu: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
    fr_FR:
      'Met à jour LND vers 0.21.6-beta. Désactive par défaut les écoutes Multipath TCP (MPTCP), atténuant la voie d’exploitation démontrée de CVE-2026-98432 via LND. Cela ne corrige pas la vulnérabilité du noyau Linux et ne protège pas les autres services. Suivez les mesures d’atténuation pour l’hôte indiquées dans le lien et installez une mise à jour de StartOS contenant un noyau corrigé dès sa disponibilité. Ne réactivez pas MPTCP avant la correction du noyau. Notes complètes : https://github.com/lightningnetwork/lnd/releases/tag/v0.21.6-beta',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
