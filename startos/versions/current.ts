import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:10',
  releaseNotes: {
    en_US: `Fixes LND never starting after restoring a backup taken on StartOS 0.3.5.x.

Those backups hold a wallet in LND's previous database format. The one-time conversion to the current format only ran when a channel database was present — and backups deliberately leave channel data out, because restoring stale channel state is dangerous. On a restored node there was nothing to trigger the conversion, so LND started on the current format, could not read the restored wallet, and waited forever for a wallet it never found. The service looked healthy but sat on "waiting on unlock-wallet" indefinitely.

The conversion now also runs for a restored wallet, and still skips on nodes already converted. If your LND has been stuck this way, updating converts the wallet on the next start; it happens automatically and may take a few minutes. Nothing was lost while it was stuck — the wallet was on disk the whole time, just unread.`,
    es_ES: `Corrige que LND nunca arrancara tras restaurar una copia de seguridad hecha en StartOS 0.3.5.x.

Esas copias guardan el monedero en el formato de base de datos anterior de LND. La conversión única al formato actual solo se ejecutaba si había una base de datos de canales presente, y las copias de seguridad omiten deliberadamente los datos de canales, porque restaurar un estado de canal obsoleto es peligroso. En un nodo restaurado no había nada que activara la conversión, así que LND arrancaba con el formato actual, no podía leer el monedero restaurado y esperaba indefinidamente un monedero que nunca encontraba. El servicio parecía correcto, pero se quedaba en «waiting on unlock-wallet» sin avanzar.

La conversión ahora también se ejecuta para un monedero restaurado, y sigue omitiéndose en nodos ya convertidos. Si tu LND estaba atascado así, al actualizar se convertirá el monedero en el siguiente arranque; ocurre automáticamente y puede tardar unos minutos. No se perdió nada mientras estuvo atascado: el monedero estuvo siempre en el disco, solo que sin leerse.`,
    de_DE: `Behebt, dass LND nach dem Wiederherstellen einer unter StartOS 0.3.5.x erstellten Sicherung nie startete.

Diese Sicherungen enthalten eine Wallet im früheren Datenbankformat von LND. Die einmalige Umwandlung in das aktuelle Format lief nur, wenn eine Kanaldatenbank vorhanden war — und Sicherungen lassen Kanaldaten bewusst weg, weil das Wiederherstellen veralteten Kanalzustands gefährlich ist. Auf einem wiederhergestellten Knoten gab es nichts, was die Umwandlung auslöste: LND startete im aktuellen Format, konnte die wiederhergestellte Wallet nicht lesen und wartete endlos auf eine Wallet, die es nie fand. Der Dienst wirkte gesund, blieb aber dauerhaft bei „waiting on unlock-wallet“ stehen.

Die Umwandlung läuft nun auch für eine wiederhergestellte Wallet und wird auf bereits umgewandelten Knoten weiterhin übersprungen. Wenn dein LND so feststeckte, wandelt das Update die Wallet beim nächsten Start um; das geschieht automatisch und kann einige Minuten dauern. Während des Stillstands ging nichts verloren — die Wallet lag die ganze Zeit auf der Festplatte, nur ungelesen.`,
    pl_PL: `Naprawia sytuację, w której LND nigdy nie uruchamiał się po przywróceniu kopii zapasowej wykonanej w StartOS 0.3.5.x.

Takie kopie zawierają portfel w poprzednim formacie bazy danych LND. Jednorazowa konwersja do obecnego formatu uruchamiała się tylko wtedy, gdy obecna była baza danych kanałów — a kopie zapasowe celowo pomijają dane kanałów, ponieważ przywracanie nieaktualnego stanu kanału jest niebezpieczne. Na przywróconym węźle nic nie wyzwalało konwersji, więc LND startował w obecnym formacie, nie mógł odczytać przywróconego portfela i w nieskończoność czekał na portfel, którego nigdy nie znalazł. Usługa wyglądała na sprawną, ale bez końca stała na „waiting on unlock-wallet”.

Konwersja uruchamia się teraz również dla przywróconego portfela i nadal jest pomijana na węzłach już przekonwertowanych. Jeśli twój LND utknął w ten sposób, aktualizacja przekonwertuje portfel przy następnym starcie; dzieje się to automatycznie i może potrwać kilka minut. Nic nie zostało utracone podczas tego zastoju — portfel przez cały czas był na dysku, tylko nieodczytany.`,
    fr_FR: `Corrige le fait que LND ne démarrait jamais après la restauration d'une sauvegarde effectuée sous StartOS 0.3.5.x.

Ces sauvegardes contiennent un portefeuille dans l'ancien format de base de données de LND. La conversion unique vers le format actuel ne s'exécutait que si une base de données de canaux était présente — or les sauvegardes excluent délibérément les données de canaux, car restaurer un état de canal obsolète est dangereux. Sur un nœud restauré, rien ne déclenchait la conversion : LND démarrait au format actuel, ne pouvait pas lire le portefeuille restauré et attendait indéfiniment un portefeuille qu'il ne trouvait jamais. Le service semblait sain mais restait bloqué sur « waiting on unlock-wallet ».

La conversion s'exécute désormais aussi pour un portefeuille restauré, et continue d'être ignorée sur les nœuds déjà convertis. Si votre LND était bloqué ainsi, la mise à jour convertira le portefeuille au prochain démarrage ; cela se fait automatiquement et peut prendre quelques minutes. Rien n'a été perdu pendant ce blocage — le portefeuille est resté sur le disque tout du long, simplement non lu.`,
  },
  migrations: {},
})
