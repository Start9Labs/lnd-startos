import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:3',
  releaseNotes: {
    en_US: `Updates LND to **0.21.1-beta** and moves the database off the legacy bolt backend to **SQLite**, removing the slow startup compaction step.

**⚠️ One-time database conversion — back up first**
- Runs automatically the first time LND starts after updating, and **cannot be undone**.
- If it fails, LND won't start, so you can safely retry. This first start may take a while, as LND also converts to native SQL.

**External wallet connections fixed (REST & gRPC)**
- These ports now pass straight through, so LND's own TLS certificate is used end-to-end, and the REST connection URL now includes that certificate — wallets such as Zeus connect reliably over Tor and your local network.

**Onion messages (BOLT12) are now native**
- Supported directly by LND, so the separate enable-toggle is gone and old custom protocol entries are cleaned up automatically on update. Services like BOLT12 Pay (LNDK) work without extra configuration.

**Watchtower server**
- Disabling it now permanently deletes the backup data it stored for its clients.

**Upstream 0.21.1-beta fixes**
- Fresh Tor nodes now create v3 onion services correctly.
- A DNS-fallback crash is fixed.
- On-chain forward-interceptor settlement resolves after a force close.
- Stricter final-hop HTLC CLTV-expiry validation.

[Full release notes](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.1-beta)`,
    es_ES: `Actualiza LND a **0.21.1-beta** y cambia la base de datos del antiguo backend bolt a **SQLite**, eliminando el lento paso de compactación al iniciar.

**⚠️ Conversión única de la base de datos: haz una copia de seguridad primero**
- Se ejecuta automáticamente la primera vez que LND arranca tras la actualización y **no se puede deshacer**.
- Si falla, LND no arrancará, así que podrás reintentarlo con seguridad. Ese primer arranque puede tardar, ya que LND también convierte a SQL nativo.

**Conexiones de monederos externos corregidas (REST y gRPC)**
- Ahora estos puertos se redirigen directamente para que se use el propio certificado TLS de LND de extremo a extremo, y la URL de conexión REST incluye ahora ese certificado — monederos como Zeus se conectan de forma fiable a través de Tor y de la red local.

**Los mensajes onion (BOLT12) ahora son nativos**
- Compatibles directamente con LND, por lo que se ha eliminado el interruptor para habilitarlos y las antiguas entradas de protocolo personalizadas se limpian automáticamente al actualizar. Servicios como BOLT12 Pay (LNDK) funcionan sin configuración adicional.

**Servidor watchtower**
- Desactivarlo ahora elimina de forma permanente los datos de respaldo que almacenaba para sus clientes.

**Correcciones de upstream en 0.21.1-beta**
- Los nodos Tor nuevos ahora crean servicios onion v3 correctamente.
- Se corrige un fallo en el respaldo DNS.
- La liquidación del interceptor de reenvío on-chain se resuelve tras un cierre forzado.
- Validación más estricta del CLTV del último salto.

[Notas completas](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.1-beta)`,
    de_DE: `Aktualisiert LND auf **0.21.1-beta** und stellt die Datenbank vom alten bolt-Backend auf **SQLite** um, wodurch der langsame Komprimierungsschritt beim Start entfällt.

**⚠️ Einmalige Datenbankkonvertierung — vorher sichern**
- Läuft beim ersten Start von LND nach der Aktualisierung automatisch und **kann nicht rückgängig gemacht werden**.
- Schlägt sie fehl, startet LND nicht, sodass Sie es gefahrlos erneut versuchen können. Dieser erste Start kann eine Weile dauern, da LND auch auf natives SQL umstellt.

**Verbindungen externer Wallets korrigiert (REST & gRPC)**
- Diese Ports werden jetzt direkt durchgereicht, sodass LNDs eigenes TLS-Zertifikat durchgängig verwendet wird, und die REST-Verbindungs-URL enthält nun dieses Zertifikat — Wallets wie Zeus verbinden sich zuverlässig über Tor und das lokale Netzwerk.

**Onion-Nachrichten (BOLT12) sind jetzt nativ**
- Direkt von LND unterstützt, daher wurde der separate Aktivierungsschalter entfernt und alte benutzerdefinierte Protokolleinträge werden beim Update automatisch bereinigt. Dienste wie BOLT12 Pay (LNDK) funktionieren ohne zusätzliche Konfiguration.

**Watchtower-Server**
- Das Deaktivieren löscht jetzt dauerhaft die für seine Clients gespeicherten Sicherungsdaten.

**Upstream-Fehlerbehebungen in 0.21.1-beta**
- Neue Tor-Knoten erstellen jetzt korrekt v3-Onion-Dienste.
- Ein Absturz beim DNS-Fallback wurde behoben.
- Die On-Chain-Forward-Interceptor-Abwicklung wird nach einem Force-Close aufgelöst.
- Strengere CLTV-Prüfung am letzten Hop.

[Vollständige Hinweise](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.1-beta)`,
    pl_PL: `Aktualizuje LND do **0.21.1-beta** i przenosi bazę danych ze starego backendu bolt do **SQLite**, eliminując powolny etap kompaktowania przy starcie.

**⚠️ Jednorazowa konwersja bazy danych — najpierw kopia zapasowa**
- Uruchamia się automatycznie przy pierwszym starcie LND po aktualizacji i **nie można jej cofnąć**.
- Jeśli się nie powiedzie, LND się nie uruchomi, więc można bezpiecznie spróbować ponownie. Ten pierwszy start może chwilę potrwać, ponieważ LND konwertuje też do natywnego SQL.

**Naprawiono połączenia zewnętrznych portfeli (REST i gRPC)**
- Te porty są teraz przekazywane bezpośrednio, dzięki czemu używany jest własny certyfikat TLS LND od końca do końca, a adres URL połączenia REST zawiera teraz ten certyfikat — portfele takie jak Zeus łączą się niezawodnie przez Tor i sieć lokalną.

**Wiadomości onion (BOLT12) są teraz natywne**
- Obsługiwane bezpośrednio przez LND, więc osobny przełącznik włączający został usunięty, a stare niestandardowe wpisy protokołu są automatycznie czyszczone podczas aktualizacji. Usługi takie jak BOLT12 Pay (LNDK) działają bez dodatkowej konfiguracji.

**Serwer watchtower**
- Wyłączenie go trwale usuwa teraz dane kopii zapasowych przechowywane dla jego klientów.

**Poprawki z upstream w 0.21.1-beta**
- Nowe węzły Tor poprawnie tworzą usługi onion v3.
- Naprawiono awarię w mechanizmie awaryjnym DNS.
- Rozliczenie przechwytywacza przekazań on-chain jest realizowane po zamknięciu wymuszonym.
- Ściślejsza walidacja CLTV na ostatnim przeskoku.

[Pełne informacje](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.1-beta)`,
    fr_FR: `Met à jour LND vers **0.21.1-beta** et fait passer la base de données de l'ancien backend bolt à **SQLite**, supprimant la lente étape de compactage au démarrage.

**⚠️ Conversion unique de la base de données — sauvegardez d'abord**
- S'exécute automatiquement au premier démarrage de LND après la mise à jour et **est irréversible**.
- En cas d'échec, LND ne démarrera pas, ce qui vous permet de réessayer sans risque. Ce premier démarrage peut prendre un certain temps, car LND convertit aussi vers le SQL natif.

**Connexions des portefeuilles externes corrigées (REST et gRPC)**
- Ces ports sont désormais transmis directement afin que le propre certificat TLS de LND soit utilisé de bout en bout, et l'URL de connexion REST inclut maintenant ce certificat — des portefeuilles comme Zeus se connectent de manière fiable via Tor et le réseau local.

**Les messages onion (BOLT12) sont désormais natifs**
- Pris en charge directement par LND ; le commutateur d'activation distinct a donc été supprimé et les anciennes entrées de protocole personnalisées sont nettoyées automatiquement lors de la mise à jour. Des services comme BOLT12 Pay (LNDK) fonctionnent sans configuration supplémentaire.

**Serveur watchtower**
- Sa désactivation supprime désormais définitivement les données de sauvegarde qu'il conservait pour ses clients.

**Correctifs upstream de 0.21.1-beta**
- Les nouveaux nœuds Tor créent désormais correctement les services onion v3.
- Un plantage du repli DNS est corrigé.
- Le règlement de l'intercepteur de transfert on-chain se résout après une fermeture forcée.
- Validation plus stricte du CLTV au dernier saut.

[Notes complètes](https://github.com/lightningnetwork/lnd/releases/tag/v0.21.1-beta)`,
  },
  migrations: {},
})
