import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:8',
  releaseNotes: {
    en_US: `On a pruned Bitcoin node, LND now takes channel announcements on trust, as it already does on Neutrino, so a channel graph built from scratch finishes syncing instead of stalling.

Network and Graph Sync Progress now says when Bitcoin is not serving blocks to LND, and sends a notification if that lasts.`,
    es_ES: `Con un nodo Bitcoin podado, LND ahora acepta los anuncios de canales sin verificarlos, como ya hace con Neutrino, así que un grafo de canales construido desde cero termina de sincronizarse en lugar de quedarse atascado.

Progreso de sincronización de red y grafo ahora indica cuándo Bitcoin no está sirviendo bloques a LND, y envía una notificación si la situación persiste.`,
    de_DE: `Läuft Bitcoin im Pruning-Modus, übernimmt LND Kanalankündigungen jetzt ungeprüft, wie schon mit Neutrino, sodass ein von Grund auf neu aufgebauter Kanalgraph fertig synchronisiert, statt hängen zu bleiben.

Netzwerk- und Graph-Synchronisierungsfortschritt zeigt jetzt an, wenn Bitcoin LND keine Blöcke liefert, und sendet eine Benachrichtigung, wenn das anhält.`,
    pl_PL: `Gdy Bitcoin działa w trybie przycinania (pruning), LND przyjmuje teraz ogłoszenia kanałów bez weryfikacji, tak jak już robi to z Neutrino, więc graf kanałów budowany od zera kończy synchronizację zamiast się zawieszać.

Postęp synchronizacji sieci i grafu pokazuje teraz, kiedy Bitcoin nie dostarcza bloków do LND, i wysyła powiadomienie, jeśli ten stan się utrzymuje.`,
    fr_FR: `Lorsque Bitcoin est élagué (pruned), LND accepte désormais les annonces de canaux sans les vérifier, comme il le fait déjà avec Neutrino : un graphe de canaux construit de zéro termine donc sa synchronisation au lieu de rester bloqué.

Progression de la synchronisation du réseau et du graphe indique désormais quand Bitcoin ne fournit pas de blocs à LND, et envoie une notification si cela persiste.`,
  },
  migrations: {
    up: async () => {},
  },
})
