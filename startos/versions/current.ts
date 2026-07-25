import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:7',
  releaseNotes: {
    en_US: `Fixes LND being force-stopped every time Bitcoin Core restarts.

**LND now waits for Bitcoin Core to come back before reloading**
- LND reloads whenever Bitcoin Core issues new RPC credentials, which it does on every restart. That reload used to be triggered the moment Bitcoin Core *began* shutting down — while its RPC was already unreachable — so LND could not finish its own shutdown and was force-stopped after 60 seconds.
- LND now ignores the credentials disappearing and reloads only once Bitcoin Core is back up and has published new ones, so it stops cleanly and restarts against a working connection.

Channels and funds were never at risk: LND's databases are built to survive an abrupt stop. A clean shutdown simply avoids the recovery work an abrupt one leaves behind.`,
    es_ES: `Corrige que LND se detuviera a la fuerza cada vez que Bitcoin Core se reiniciaba.

**LND ahora espera a que Bitcoin Core vuelva antes de recargarse**
- LND se recarga cuando Bitcoin Core emite nuevas credenciales RPC, algo que hace en cada reinicio. Esa recarga se activaba en el momento en que Bitcoin Core *empezaba* a apagarse — cuando su RPC ya era inalcanzable —, así que LND no podía completar su propio apagado y se detenía a la fuerza a los 60 segundos.
- Ahora LND ignora la desaparición de las credenciales y se recarga solo cuando Bitcoin Core ha vuelto y ha publicado unas nuevas, de modo que se detiene limpiamente y arranca con una conexión operativa.

Los canales y los fondos nunca estuvieron en riesgo: las bases de datos de LND están hechas para sobrevivir a una parada abrupta. Un apagado limpio simplemente evita el trabajo de recuperación que deja una parada abrupta.`,
    de_DE: `Behebt, dass LND bei jedem Neustart von Bitcoin Core zwangsweise beendet wurde.

**LND wartet jetzt auf die Rückkehr von Bitcoin Core, bevor es neu lädt**
- LND lädt neu, sobald Bitcoin Core neue RPC-Zugangsdaten ausgibt — was bei jedem Neustart geschieht. Dieses Neuladen wurde bisher in dem Moment ausgelöst, in dem Bitcoin Core mit dem Herunterfahren *begann* — während dessen RPC bereits nicht mehr erreichbar war. LND konnte sein eigenes Herunterfahren daher nicht abschließen und wurde nach 60 Sekunden zwangsweise beendet.
- LND ignoriert nun das Verschwinden der Zugangsdaten und lädt erst neu, wenn Bitcoin Core wieder läuft und neue veröffentlicht hat. So fährt es sauber herunter und startet mit einer funktionierenden Verbindung.

Kanäle und Guthaben waren nie gefährdet: Die Datenbanken von LND sind darauf ausgelegt, einen abrupten Stopp zu überstehen. Ein sauberes Herunterfahren erspart lediglich die Wiederherstellungsarbeit, die ein abrupter Stopp hinterlässt.`,
    pl_PL: `Naprawia wymuszone zatrzymywanie LND przy każdym restarcie Bitcoin Core.

**LND czeka teraz na powrót Bitcoin Core, zanim się przeładuje**
- LND przeładowuje się, gdy Bitcoin Core wydaje nowe dane uwierzytelniające RPC, co robi przy każdym restarcie. Dotąd to przeładowanie uruchamiało się w chwili, gdy Bitcoin Core *zaczynał* się wyłączać — a jego RPC było już nieosiągalne — więc LND nie mogło dokończyć własnego wyłączania i po 60 sekundach było zatrzymywane siłą.
- Teraz LND ignoruje zniknięcie danych uwierzytelniających i przeładowuje się dopiero wtedy, gdy Bitcoin Core wróci i opublikuje nowe. Dzięki temu zatrzymuje się czysto i startuje z działającym połączeniem.

Kanały i środki nigdy nie były zagrożone: bazy danych LND są zaprojektowane tak, by przetrwać nagłe zatrzymanie. Czyste wyłączenie po prostu oszczędza pracy naprawczej, którą zostawia po sobie nagłe.`,
    fr_FR: `Corrige l'arrêt forcé de LND à chaque redémarrage de Bitcoin Core.

**LND attend désormais le retour de Bitcoin Core avant de se recharger**
- LND se recharge lorsque Bitcoin Core émet de nouveaux identifiants RPC, ce qu'il fait à chaque redémarrage. Ce rechargement était jusqu'ici déclenché au moment où Bitcoin Core *commençait* à s'arrêter — alors que son RPC était déjà injoignable —, si bien que LND ne pouvait pas terminer son propre arrêt et était arrêté de force au bout de 60 secondes.
- LND ignore maintenant la disparition des identifiants et ne se recharge qu'une fois Bitcoin Core revenu et de nouveaux identifiants publiés. Il s'arrête donc proprement et redémarre sur une connexion fonctionnelle.

Les canaux et les fonds n'ont jamais été en danger : les bases de données de LND sont conçues pour survivre à un arrêt brutal. Un arrêt propre évite simplement le travail de récupération qu'un arrêt brutal laisse derrière lui.`,
  },
  migrations: {},
})
