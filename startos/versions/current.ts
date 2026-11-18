import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.8-beta:1',
  releaseNotes: {
    en_US: `**Security**

- Nodes migrated from Umbrel get a new wallet password at their next start; record it with Show Credentials.
- Migrating from Umbrel, myNode or StartOS now shows the origin's SSH host key fingerprint and sends your password only after you confirm it. A migration scheduled before this update has to be set up again in Initialize Wallet.
- A Pay Invoice request from another service can no longer preset the amount, the fee limit or the confirmation.

**Fixes**

- Start Fresh reports an error when LND fails to create the wallet, instead of showing a seed.
- Turning off the Clearnet VPN restores the Tor setting for clearnet peers that it changed when it was turned on.
- An invalid WireGuard configuration is reported by line number, without repeating the line.`,
    es_ES: `**Seguridad**

- Los nodos migrados desde Umbrel reciben una nueva contraseña de monedero en su siguiente arranque; anótala con Mostrar credenciales.
- La migración desde Umbrel, myNode o StartOS ahora muestra la huella de la clave de host SSH del origen y solo envía tu contraseña después de que la confirmes. Una migración programada antes de esta actualización debe configurarse de nuevo en Inicializar billetera.
- Una solicitud de Pagar factura de otro servicio ya no puede predefinir el importe, el límite de comisión ni la confirmación.

**Correcciones**

- Empezar de cero informa de un error cuando LND no logra crear el monedero, en lugar de mostrar una semilla.
- Desactivar la VPN de clearnet restaura el ajuste de Tor para pares de clearnet que cambió al activarla.
- Una configuración de WireGuard no válida se indica por número de línea, sin repetir la línea.`,
    de_DE: `**Sicherheit**

- Von Umbrel migrierte Knoten erhalten beim nächsten Start ein neues Wallet-Passwort; notiere es mit Zugangsdaten anzeigen.
- Die Migration von Umbrel, myNode oder StartOS zeigt jetzt den Fingerabdruck des SSH-Host-Schlüssels des Ursprungs und sendet dein Passwort erst, nachdem du ihn bestätigt hast. Eine vor diesem Update geplante Migration muss in Wallet initialisieren neu eingerichtet werden.
- Eine Rechnung-bezahlen-Anfrage eines anderen Dienstes kann Betrag, Gebührenlimit und Bestätigung nicht mehr vorgeben.

**Fehlerbehebungen**

- Neu starten meldet einen Fehler, wenn LND die Wallet nicht erstellen kann, statt einen Seed anzuzeigen.
- Das Ausschalten des Clearnet-VPN stellt die Tor-Einstellung für Clearnet-Peers wieder her, die beim Einschalten geändert wurde.
- Eine ungültige WireGuard-Konfiguration wird mit der Zeilennummer gemeldet, ohne die Zeile zu wiederholen.`,
    pl_PL: `**Bezpieczeństwo**

- Węzły zmigrowane z Umbrel otrzymują przy następnym uruchomieniu nowe hasło portfela; zapisz je za pomocą Pokaż dane dostępowe.
- Migracja z Umbrel, myNode lub StartOS pokazuje teraz odcisk klucza hosta SSH węzła źródłowego i wysyła hasło dopiero po jego potwierdzeniu. Migrację zaplanowaną przed tą aktualizacją trzeba skonfigurować ponownie w Zainicjalizuj portfel.
- Żądanie Zapłać fakturę od innej usługi nie może już z góry ustawić kwoty, limitu opłaty ani potwierdzenia.

**Poprawki**

- Zacznij od nowa zgłasza błąd, gdy LND nie zdoła utworzyć portfela, zamiast pokazywać ziarno.
- Wyłączenie VPN clearnet przywraca ustawienie Tor dla partnerów clearnet, które zmieniło jego włączenie.
- Nieprawidłowa konfiguracja WireGuard jest zgłaszana numerem linii, bez powtarzania jej treści.`,
    fr_FR: `**Sécurité**

- Les nœuds migrés depuis Umbrel reçoivent un nouveau mot de passe de portefeuille à leur prochain démarrage ; notez-le avec Afficher les identifiants.
- La migration depuis Umbrel, myNode ou StartOS affiche désormais l'empreinte de la clé d'hôte SSH de l'origine et n'envoie votre mot de passe qu'après votre confirmation. Une migration programmée avant cette mise à jour doit être reconfigurée dans Initialiser le portefeuille.
- Une demande Payer une facture provenant d'un autre service ne peut plus préremplir le montant, la limite de frais ni la confirmation.

**Correctifs**

- Démarrer à neuf signale une erreur lorsque LND ne parvient pas à créer le portefeuille, au lieu d'afficher une graine.
- Désactiver le VPN clearnet rétablit le réglage Tor pour les pairs clearnet qu'il avait modifié à son activation.
- Une configuration WireGuard invalide est signalée par son numéro de ligne, sans reprendre la ligne.`,
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
