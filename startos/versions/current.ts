import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { controlHostId, gRPCPort } from '../interfaces'
import { sdk } from '../sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:1',
  releaseNotes: {
    en_US: `Updated LND to 0.21.4-beta.

- Fixes pending HTLCs during channel transitions, graph sync with unusable peer responses, and SQL graph conversion of older channel records.
- Peer-to-peer channel opens must specify a channel type and cannot use legacy commitments. RPC callers can still let LND choose a supported default (static remote key or newer). Existing legacy channels continue working.
- Macaroon revocation no longer treats a failed connection or empty response as success during startup.

[Full upstream release notes](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)

- The wallet seed is shown as a numbered grid, hidden until revealed, in Initialize Wallet and in Cold Storage's Show Credentials, and the warning shown with a new seed is laid out as a list.
- Show Credentials no longer fails before displaying the credentials, and Turn On becomes available only once they have been displayed.
- Reset Wallet Transactions and Back Up Channels Now ask for confirmation before running.
- The descriptions of Debug Level, Enable Tor, Enable Autopilot, Select Bitcoin Node, Enable Watchtower Client, Initialize Wallet's method, Pay Invoice's amount and SFTP authentication explain each option.
- When Node Info or Watchtower Server Info fails, the error is shown as readable text you can copy.
- A network port left reserved by the StartOS 0.3.5 version of this package is freed.`,
    es_ES: `LND actualizado a 0.21.4-beta.

- Corrige HTLC pendientes durante transiciones de canales, la sincronización del grafo con respuestas de pares inutilizables y la conversión SQL del grafo de registros de canales antiguos.
- Las aperturas de canales entre pares deben especificar un tipo de canal y no pueden usar compromisos heredados. Los clientes RPC pueden seguir dejando que LND elija un tipo predeterminado compatible (static remote key o posterior). Los canales heredados existentes siguen funcionando.
- La revocación de macaroons ya no considera una conexión fallida o una respuesta vacía como un éxito durante el arranque.

[Notas completas de la versión original](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)

- La semilla de la billetera se muestra como una cuadrícula numerada, oculta hasta que la reveles, en Inicializar billetera y en Mostrar credenciales del almacenamiento en frío, y la advertencia que acompaña a una semilla nueva se presenta como una lista.
- Mostrar credenciales ya no falla antes de mostrar las credenciales, y Activar solo está disponible una vez que se han mostrado.
- Restablecer transacciones de billetera y Copiar canales ahora piden confirmación antes de ejecutarse.
- Las descripciones de Nivel de depuración, Habilitar Tor, Habilitar Autopilot, Seleccionar nodo Bitcoin, Habilitar cliente Watchtower, el método de Inicializar billetera, el importe de Pagar factura y la autenticación SFTP explican cada opción.
- Cuando Información del nodo o Información del servidor Watchtower falla, el error se muestra como texto legible que puedes copiar.
- Se libera un puerto de red que la versión de este paquete para StartOS 0.3.5 dejó reservado.`,
    de_DE: `LND auf 0.21.4-beta aktualisiert.

- Behebt hängende HTLCs bei Kanalübergängen, die Graphensynchronisierung bei unbrauchbaren Peer-Antworten und die SQL-Graphenkonvertierung älterer Kanaldatensätze.
- Bei Kanaleröffnungen zwischen Peers muss ein Kanaltyp angegeben werden; Legacy-Commitments sind nicht mehr zulässig. RPC-Clients können LND weiterhin einen unterstützten Standardtyp wählen lassen (Static Remote Key oder neuer). Bestehende Legacy-Kanäle funktionieren weiterhin.
- Der Widerruf von Macaroons wertet beim Start eine fehlgeschlagene Verbindung oder eine leere Antwort nicht mehr als Erfolg.

[Vollständige Upstream-Versionshinweise](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)

- Der Wallet-Seed wird in „Wallet initialisieren“ und in „Zugangsdaten anzeigen“ des Cold Storage als nummeriertes Raster angezeigt, verborgen bis zum Aufdecken, und der Warnhinweis zu einem neuen Seed ist als Liste gegliedert.
- „Zugangsdaten anzeigen“ schlägt nicht mehr fehl, bevor die Zugangsdaten angezeigt werden, und „Einschalten“ wird erst verfügbar, nachdem sie angezeigt wurden.
- „Wallet-Transaktionen zurücksetzen“ und „Kanäle jetzt sichern“ fragen vor der Ausführung nach einer Bestätigung.
- Die Beschreibungen von Debug-Level, Tor aktivieren, Autopilot aktivieren, Bitcoin-Knoten auswählen, Watchtower-Client aktivieren, der Methode von „Wallet initialisieren“, dem Betrag von „Rechnung bezahlen“ und der SFTP-Authentifizierung erklären jede Option.
- Schlägt „Knoten-Info“ oder „Watchtower-Server-Info“ fehl, wird der Fehler als lesbarer Text angezeigt, den Sie kopieren können.
- Ein Netzwerkport, den die StartOS-0.3.5-Version dieses Pakets belegt gelassen hatte, wird freigegeben.`,
    pl_PL: `Zaktualizowano LND do 0.21.4-beta.

- Naprawia oczekujące HTLC podczas zmian stanu kanałów, synchronizację grafu przy bezużytecznych odpowiedziach węzłów oraz konwersję grafu do SQL dla starszych rekordów kanałów.
- Otwarcia kanałów między węzłami muszą określać typ kanału i nie mogą używać starszego typu zobowiązań. Klienci RPC nadal mogą pozwolić LND wybrać obsługiwany typ domyślny (static remote key lub nowszy). Istniejące kanały starszego typu nadal działają.
- Unieważnianie macaroons nie traktuje już nieudanego połączenia ani pustej odpowiedzi jako sukcesu podczas uruchamiania.

[Pełne informacje o wydaniu upstream](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)

- Seed portfela jest wyświetlany jako ponumerowana siatka, ukryta do momentu odsłonięcia, w Zainicjalizuj portfel oraz w Pokaż dane dostępowe zimnego przechowywania, a ostrzeżenie towarzyszące nowemu seedowi ma postać listy.
- Pokaż dane dostępowe nie kończy się już błędem przed wyświetleniem danych, a Włącz staje się dostępne dopiero po ich wyświetleniu.
- Zresetuj transakcje portfela i Utwórz kopię kanałów teraz proszą o potwierdzenie przed uruchomieniem.
- Opisy Poziomu debugowania, Włącz Tor, Włącz Autopilot, Wybierz węzeł Bitcoin, Włącz klienta Watchtower, metody Zainicjalizuj portfel, kwoty Zapłać fakturę i uwierzytelniania SFTP wyjaśniają każdą opcję.
- Gdy Informacje o węźle lub Informacje o serwerze Watchtower kończą się błędem, błąd jest wyświetlany jako czytelny tekst, który można skopiować.
- Zwolniony zostaje port sieciowy, który wersja tego pakietu dla StartOS 0.3.5 pozostawiła zajęty.`,
    fr_FR: `LND mis à jour vers 0.21.4-beta.

- Corrige les HTLC bloqués lors des transitions de canaux, la synchronisation du graphe face aux réponses de pairs inutilisables et la conversion SQL du graphe pour les anciens enregistrements de canaux.
- Les ouvertures de canaux entre pairs doivent préciser un type de canal et ne peuvent plus utiliser les engagements hérités. Les clients RPC peuvent toujours laisser LND choisir un type par défaut pris en charge (static remote key ou plus récent). Les canaux hérités existants continuent de fonctionner.
- La révocation des macaroons ne considère plus une connexion échouée ou une réponse vide comme un succès au démarrage.

[Notes de version complètes du projet](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)

- La graine du portefeuille s'affiche sous forme de grille numérotée, masquée jusqu'à ce que vous la révéliez, dans Initialiser le portefeuille et dans Afficher les identifiants du stockage à froid, et l'avertissement qui accompagne une nouvelle graine est présenté sous forme de liste.
- Afficher les identifiants n'échoue plus avant d'afficher les identifiants, et Activer ne devient disponible qu'une fois ceux-ci affichés.
- Réinitialiser les transactions du portefeuille et Sauvegarder les canaux maintenant demandent une confirmation avant de s'exécuter.
- Les descriptions de Niveau de débogage, Activer Tor, Activer l'Autopilot, Sélectionner le nœud Bitcoin, Activer le client Watchtower, de la méthode d'Initialiser le portefeuille, du montant de Payer une facture et de l'authentification SFTP expliquent chaque option.
- Lorsque Info du nœud ou Info du serveur Watchtower échoue, l'erreur s'affiche sous forme de texte lisible que vous pouvez copier.
- Un port réseau que la version de ce paquet pour StartOS 0.3.5 avait laissé réservé est libéré.`,
  },
  migrations: {
    up: async ({ effects }) => {
      // The 0.3.5 package served gRPC on the control host; it now has its own.
      await sdk.MultiHost.of(effects, controlHostId).retirePort(gRPCPort)
    },
    down: IMPOSSIBLE,
  },
})
