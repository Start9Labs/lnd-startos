import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:0',
  releaseNotes: {
    en_US: `Updated LND to 0.21.4-beta.

- Fixes pending HTLCs during channel transitions, graph sync with unusable peer responses, and SQL graph conversion of older channel records.
- Peer-to-peer channel opens must specify a channel type and cannot use legacy commitments. RPC callers can still let LND choose a supported default (static remote key or newer). Existing legacy channels continue working.
- Macaroon revocation no longer treats a failed connection or empty response as success during startup.

[Full upstream release notes](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)`,
    es_ES: `LND actualizado a 0.21.4-beta.

- Corrige HTLC pendientes durante transiciones de canales, la sincronización del grafo con respuestas de pares inutilizables y la conversión SQL del grafo de registros de canales antiguos.
- Las aperturas de canales entre pares deben especificar un tipo de canal y no pueden usar compromisos heredados. Los clientes RPC pueden seguir dejando que LND elija un tipo predeterminado compatible (static remote key o posterior). Los canales heredados existentes siguen funcionando.
- La revocación de macaroons ya no considera una conexión fallida o una respuesta vacía como un éxito durante el arranque.

[Notas completas de la versión original](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)`,
    de_DE: `LND auf 0.21.4-beta aktualisiert.

- Behebt hängende HTLCs bei Kanalübergängen, die Graphensynchronisierung bei unbrauchbaren Peer-Antworten und die SQL-Graphenkonvertierung älterer Kanaldatensätze.
- Bei Kanaleröffnungen zwischen Peers muss ein Kanaltyp angegeben werden; Legacy-Commitments sind nicht mehr zulässig. RPC-Clients können LND weiterhin einen unterstützten Standardtyp wählen lassen (Static Remote Key oder neuer). Bestehende Legacy-Kanäle funktionieren weiterhin.
- Der Widerruf von Macaroons wertet beim Start eine fehlgeschlagene Verbindung oder eine leere Antwort nicht mehr als Erfolg.

[Vollständige Upstream-Versionshinweise](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)`,
    pl_PL: `Zaktualizowano LND do 0.21.4-beta.

- Naprawia oczekujące HTLC podczas zmian stanu kanałów, synchronizację grafu przy bezużytecznych odpowiedziach węzłów oraz konwersję grafu do SQL dla starszych rekordów kanałów.
- Otwarcia kanałów między węzłami muszą określać typ kanału i nie mogą używać starszego typu zobowiązań. Klienci RPC nadal mogą pozwolić LND wybrać obsługiwany typ domyślny (static remote key lub nowszy). Istniejące kanały starszego typu nadal działają.
- Unieważnianie macaroons nie traktuje już nieudanego połączenia ani pustej odpowiedzi jako sukcesu podczas uruchamiania.

[Pełne informacje o wydaniu upstream](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)`,
    fr_FR: `LND mis à jour vers 0.21.4-beta.

- Corrige les HTLC bloqués lors des transitions de canaux, la synchronisation du graphe face aux réponses de pairs inutilisables et la conversion SQL du graphe pour les anciens enregistrements de canaux.
- Les ouvertures de canaux entre pairs doivent préciser un type de canal et ne peuvent plus utiliser les engagements hérités. Les clients RPC peuvent toujours laisser LND choisir un type par défaut pris en charge (static remote key ou plus récent). Les canaux hérités existants continuent de fonctionner.
- La révocation des macaroons ne considère plus une connexion échouée ou une réponse vide comme un succès au démarrage.

[Notes de version complètes du projet](https://github.com/lightningnetwork/lnd/blob/v0.21.4-beta/docs/release-notes/release-notes-0.21.4.md)`,
  },
  migrations: {
    up: async () => {},
  },
})
