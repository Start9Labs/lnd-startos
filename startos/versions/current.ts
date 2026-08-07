import { VersionInfo } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:11',
  releaseNotes: {
    en_US: `**Revoke Macaroons (previously “Recreate Macaroons”) now actually revokes them.**

Deleting a macaroon file never revoked it: LND verifies a macaroon against the root key in its macaroon store, then simply re-bakes any file you removed from that same key — so a macaroon copied beforehand kept working. The action now rotates the root key itself, through LND's own wallet-unlocker, which regenerates the key and rewrites every macaroon file together.

Run it if a macaroon may have been copied or exposed — in particular if you run BTCPay Server, which reads LND's admin macaroon and shipped an actively exploited vulnerability in versions before 2.4.2. Every service connected to LND loses access until it picks up the new macaroon, and may need to be restarted.`,
    es_ES: `**«Revocar macaroons» (antes «Recrear Macaroons») ahora los revoca de verdad.**

Borrar un archivo de macaroon nunca lo revocaba: LND valida cada macaroon con la clave raíz de su almacén y vuelve a generar a partir de esa misma clave cualquier archivo que elimines, así que un macaroon copiado previamente seguía funcionando. Ahora la acción rota la propia clave raíz, mediante el desbloqueador de monedero de LND, que regenera la clave y reescribe todos los archivos de macaroons a la vez.

Ejecútala si algún macaroon pudo ser copiado o quedar expuesto, sobre todo si usas BTCPay Server, que lee el macaroon de administrador de LND y tuvo una vulnerabilidad explotada activamente en las versiones anteriores a la 2.4.2. Todos los servicios conectados a LND perderán el acceso hasta que tomen el nuevo macaroon, y puede que necesiten reiniciarse.`,
    de_DE: `**„Macaroons widerrufen“ (vormals „Macaroons neu erstellen“) widerruft sie jetzt wirklich.**

Das Löschen einer Macaroon-Datei hat nie etwas widerrufen: LND prüft ein Macaroon gegen den Root-Schlüssel in seinem Macaroon-Speicher und erzeugt jede gelöschte Datei einfach aus genau diesem Schlüssel neu — ein zuvor kopiertes Macaroon funktionierte also weiter. Die Aktion rotiert jetzt den Root-Schlüssel selbst, über LNDs eigenen Wallet-Unlocker, der den Schlüssel neu erzeugt und alle Macaroon-Dateien in einem Schritt neu schreibt.

Führen Sie sie aus, wenn ein Macaroon kopiert oder offengelegt worden sein könnte — insbesondere wenn Sie BTCPay Server betreiben, das das Admin-Macaroon von LND liest und in Versionen vor 2.4.2 eine aktiv ausgenutzte Sicherheitslücke hatte. Jeder mit LND verbundene Dienst verliert den Zugriff, bis er das neue Macaroon übernimmt, und muss möglicherweise neu gestartet werden.`,
    pl_PL: `**„Unieważnij macaroons” (dawniej „Odtwórz Macaroons”) teraz naprawdę je unieważnia.**

Usunięcie pliku macaroona nigdy go nie unieważniało: LND weryfikuje macaroona względem klucza głównego w swoim magazynie, a usunięty plik po prostu odtwarza z tego samego klucza — więc wcześniej skopiowany macaroon nadal działał. Akcja rotuje teraz sam klucz główny, przez wbudowany mechanizm odblokowania portfela LND, który generuje nowy klucz i przepisuje wszystkie pliki macaroonów za jednym razem.

Uruchom ją, jeśli któryś macaroon mógł zostać skopiowany lub ujawniony — zwłaszcza jeśli korzystasz z BTCPay Server, który odczytuje macaroon administratora LND i w wersjach starszych niż 2.4.2 zawierał aktywnie wykorzystywaną lukę. Każda usługa połączona z LND utraci dostęp, dopóki nie pobierze nowego macaroona, i może wymagać restartu.`,
    fr_FR: `**« Révoquer les macaroons » (anciennement « Recréer les Macaroons ») les révoque désormais réellement.**

Supprimer un fichier de macaroon ne révoquait rien : LND vérifie un macaroon avec la clé racine de son magasin, puis régénère à partir de cette même clé tout fichier que vous avez supprimé — un macaroon copié auparavant continuait donc de fonctionner. L'action fait désormais tourner la clé racine elle-même, via le déverrouilleur de portefeuille de LND, qui régénère la clé et réécrit tous les fichiers de macaroons en une seule opération.

Exécutez-la si un macaroon a pu être copié ou exposé — en particulier si vous utilisez BTCPay Server, qui lit le macaroon administrateur de LND et présentait une vulnérabilité activement exploitée dans les versions antérieures à 2.4.2. Tout service connecté à LND perd l'accès jusqu'à ce qu'il récupère le nouveau macaroon, et devra peut-être être redémarré.`,
  },
  migrations: {
    up: async ({ effects }) => {
      // Replay keys abandoned when bitcoind renamed its config action. Nothing
      // reaps them, and they keep demanding whatever they last asked for.
      await sdk.action.clearTask(
        effects,
        'bitcoind:config',
        'bitcoind:other-config',
      )
    },
  },
})
