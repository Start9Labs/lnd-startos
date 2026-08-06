import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:10',
  releaseNotes: {
    en_US: `Fixes the update to 0.21 failing on nodes that carry leftover Neutrino data.

The bolt → SQLite database conversion briefly starts LND to bring the database schema up to date. That run used the Neutrino light client, so it opened whatever Neutrino chain data was already on disk. On a node carrying an old or inconsistent copy — common after switching from Neutrino to a Bitcoin node — LND could not start at all, so the conversion never finished and the update eventually timed out and rolled back. The run now uses no chain backend, reaching neither your Bitcoin node nor any Neutrino data.

If your update failed this way, simply retry it — no other action is needed.`,
    es_ES: `Corrige el fallo de la actualización a 0.21 en nodos con datos de Neutrino sobrantes.

La conversión de la base de datos de bolt a SQLite arranca LND brevemente para poner al día el esquema de la base de datos. Esa ejecución usaba el cliente ligero Neutrino, por lo que abría los datos de cadena de Neutrino que hubiera en el disco. En un nodo con una copia antigua o inconsistente —algo habitual tras cambiar de Neutrino a un nodo Bitcoin— LND no podía arrancar, así que la conversión nunca terminaba y la actualización acababa expirando y revirtiéndose. Ahora esa ejecución no usa ningún backend de cadena, por lo que no accede ni a tu nodo Bitcoin ni a ningún dato de Neutrino.

Si tu actualización falló de esta forma, basta con reintentarla; no hace falta nada más.`,
    de_DE: `Behebt das Fehlschlagen des Updates auf 0.21 auf Knoten mit übrig gebliebenen Neutrino-Daten.

Die Datenbankkonvertierung von bolt zu SQLite startet LND kurz, um das Datenbankschema zu aktualisieren. Dieser Lauf nutzte den Neutrino-Light-Client und öffnete daher die auf der Festplatte vorhandenen Neutrino-Chain-Daten. Auf einem Knoten mit einer alten oder inkonsistenten Kopie — verbreitet nach dem Wechsel von Neutrino zu einem Bitcoin-Knoten — konnte LND überhaupt nicht starten, sodass die Konvertierung nie abschloss und das Update schließlich in einen Timeout lief und zurückgerollt wurde. Der Lauf verwendet jetzt gar kein Chain-Backend und greift weder auf deinen Bitcoin-Knoten noch auf Neutrino-Daten zu.

Wenn dein Update auf diese Weise fehlgeschlagen ist, wiederhole es einfach — weitere Schritte sind nicht nötig.`,
    pl_PL: `Naprawia niepowodzenie aktualizacji do 0.21 na węzłach z pozostałościami danych Neutrino.

Konwersja bazy danych z bolt na SQLite na krótko uruchamia LND, aby zaktualizować schemat bazy danych. To uruchomienie korzystało z lekkiego klienta Neutrino, więc otwierało dane łańcucha Neutrino znajdujące się na dysku. Na węźle ze starą lub niespójną kopią — co jest częste po przejściu z Neutrino na węzeł Bitcoin — LND w ogóle nie mógł się uruchomić, więc konwersja nigdy się nie kończyła, a aktualizacja ostatecznie wygasała i była wycofywana. To uruchomienie nie korzysta już z żadnego backendu łańcucha, więc nie sięga ani do twojego węzła Bitcoin, ani do danych Neutrino.

Jeśli twoja aktualizacja zakończyła się w ten sposób, po prostu ponów ją — nic więcej nie trzeba robić.`,
    fr_FR: `Corrige l'échec de la mise à jour vers 0.21 sur les nœuds conservant d'anciennes données Neutrino.

La conversion de la base de données de bolt vers SQLite démarre brièvement LND pour mettre à jour le schéma de la base. Cette exécution utilisait le client léger Neutrino et ouvrait donc les données de chaîne Neutrino présentes sur le disque. Sur un nœud portant une copie ancienne ou incohérente — courant après être passé de Neutrino à un nœud Bitcoin — LND ne pouvait pas démarrer du tout : la conversion n'aboutissait jamais et la mise à jour finissait par expirer et être annulée. Cette exécution n'utilise plus aucun backend de chaîne et n'accède ni à votre nœud Bitcoin ni à des données Neutrino.

Si votre mise à jour a échoué de cette manière, il suffit de la relancer — aucune autre action n'est nécessaire.`,
  },
  migrations: {},
})
