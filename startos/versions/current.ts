import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:9',
  releaseNotes: {
    en_US: `Fixes a new node never finding its first peer while Tor is enabled.

With Tor on and "Skip for clearnet peers" left at its default, LND looked up the Lightning DNS seeds by querying a public nameserver directly — traffic StartOS blocks, because services are expected to resolve through the OS. The lookup was dropped silently, so it timed out on every attempt. A node with no channels and no network graph yet has nothing else to find a peer from, so it sat at zero peers and never left "Syncing to graph". LND now sends that lookup to the StartOS resolver.

Established nodes were never affected: once the network graph is populated, LND finds peers from the graph itself. If your node has been stuck syncing, updating resolves it — no other action needed.`,
    es_ES: `Corrige que un nodo nuevo nunca encontrara su primer par con Tor activado.

Con Tor activado y «Omitir para pares de clearnet» en su valor predeterminado, LND consultaba las semillas DNS de Lightning directamente a un servidor de nombres público: tráfico que StartOS bloquea, porque se espera que los servicios resuelvan a través del sistema operativo. La consulta se descartaba en silencio, así que expiraba en cada intento. Un nodo sin canales y sin grafo de red todavía no tiene ninguna otra forma de encontrar un par, por lo que se quedaba con cero pares y nunca salía de «Sincronizando con el grafo». Ahora LND dirige esa consulta al resolutor de StartOS.

Los nodos ya establecidos nunca se vieron afectados: una vez poblado el grafo de red, LND encuentra pares a partir del propio grafo. Si tu nodo estaba atascado sincronizando, actualizar lo resuelve; no hace falta nada más.`,
    de_DE: `Behebt, dass ein neuer Knoten bei aktiviertem Tor nie seinen ersten Peer fand.

Mit aktiviertem Tor und „Für Clearnet-Peers überspringen“ in der Standardeinstellung fragte LND die Lightning-DNS-Seeds direkt bei einem öffentlichen Nameserver ab — Datenverkehr, den StartOS blockiert, da Dienste über das Betriebssystem auflösen sollen. Die Abfrage wurde stillschweigend verworfen und lief daher bei jedem Versuch in einen Timeout. Ein Knoten ohne Kanäle und noch ohne Netzwerkgraph hat keine andere Möglichkeit, einen Peer zu finden, blieb also bei null Peers und verließ „Synchronisiere Graph“ nie. LND richtet diese Abfrage jetzt an den StartOS-Resolver.

Etablierte Knoten waren nie betroffen: Sobald der Netzwerkgraph gefüllt ist, findet LND Peers über den Graphen selbst. Wenn dein Knoten beim Synchronisieren feststeckte, behebt das Update dies — weitere Schritte sind nicht nötig.`,
    pl_PL: `Naprawia sytuację, w której nowy węzeł nigdy nie znajdował swojego pierwszego peera przy włączonym Torze.

Przy włączonym Torze i domyślnym ustawieniu „Pomiń dla peerów clearnet” LND odpytywał seedy DNS sieci Lightning bezpośrednio z publicznego serwera nazw — ruch, który StartOS blokuje, ponieważ usługi mają rozwiązywać nazwy przez system operacyjny. Zapytanie było po cichu odrzucane, więc przy każdej próbie wygasało. Węzeł bez kanałów i bez grafu sieci nie ma żadnego innego sposobu na znalezienie peera, więc pozostawał z zerową liczbą peerów i nigdy nie opuszczał stanu „Synchronizacja z grafem”. LND kieruje teraz to zapytanie do resolvera StartOS.

Działające już węzły nigdy nie były dotknięte tym problemem: gdy graf sieci jest wypełniony, LND znajduje peerów na jego podstawie. Jeśli twój węzeł utknął na synchronizacji, aktualizacja to naprawi — nic więcej nie trzeba robić.`,
    fr_FR: `Corrige le fait qu'un nouveau nœud ne trouvait jamais son premier pair lorsque Tor est activé.

Avec Tor activé et « Ignorer pour les pairs clearnet » laissé à sa valeur par défaut, LND interrogeait les seeds DNS de Lightning directement auprès d'un serveur de noms public — un trafic que StartOS bloque, car les services doivent résoudre via le système d'exploitation. La requête était abandonnée silencieusement et expirait donc à chaque tentative. Un nœud sans canaux et sans graphe de réseau n'a aucun autre moyen de trouver un pair : il restait à zéro pair et ne quittait jamais « Synchronisation du graphe ». LND adresse désormais cette requête au résolveur de StartOS.

Les nœuds déjà établis n'ont jamais été concernés : une fois le graphe de réseau rempli, LND trouve ses pairs à partir du graphe lui-même. Si votre nœud était bloqué en synchronisation, la mise à jour le corrige — aucune autre action n'est nécessaire.`,
  },
  migrations: {},
})
