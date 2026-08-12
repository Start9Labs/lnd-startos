import { VersionInfo } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { writeCerts } from '../init/setupCerts'
import { sdk } from '../sdk'
import { needsSqliteMigration, runSqliteMigration } from '../sqliteBackend'

export const current = VersionInfo.of({
  version: '0.21.1-beta:12',
  releaseNotes: {
    en_US: `**Migrate an existing LND node from myNode.**

**Initialize Wallet** now offers **Migrate from myNode** alongside Umbrel and StartOS. It verifies the connection to your old node and schedules the migration; starting LND then stops the old node, copies LND's data directory across your local network, converts the database, and brings LND online — so your channels come with you. On a large node this takes hours, with progress shown under Health Checks.

The Umbrel and StartOS migrations are repaired in the same release; neither could previously complete.

After any migration, never start LND on the old device again. Two nodes running from one seed leads to unpredictable behavior or loss of funds.`,
    es_ES: `**Migre un nodo LND existente desde myNode.**

**Inicializar billetera** ahora ofrece **Migrar desde myNode**, junto a Umbrel y StartOS. Verifica la conexión con su nodo antiguo y programa la migración; al iniciar LND, este detiene el nodo antiguo, copia el directorio de datos de LND a través de su red local, convierte la base de datos y pone LND en línea, de modo que sus canales le acompañan. En un nodo grande esto tarda horas, y su progreso aparece en Comprobaciones de estado.

Las migraciones desde Umbrel y StartOS se reparan en esta misma versión; ninguna de las dos podía completarse antes.

Después de cualquier migración, nunca vuelva a iniciar LND en el dispositivo antiguo. Dos nodos que funcionan con la misma semilla provocan un comportamiento impredecible o la pérdida de fondos.`,
    de_DE: `**Migrieren Sie einen bestehenden LND-Node von myNode.**

**Wallet initialisieren** bietet jetzt **Von myNode migrieren** neben Umbrel und StartOS. Die Aktion prüft die Verbindung zu Ihrem alten Node und plant die Migration; beim Start von LND wird dann der alte Node gestoppt, das Datenverzeichnis von LND über Ihr lokales Netzwerk kopiert, die Datenbank konvertiert und LND online gebracht — Ihre Kanäle ziehen also mit um. Bei einem großen Node dauert das Stunden; den Fortschritt sehen Sie unter Zustandsprüfungen.

Die Migrationen von Umbrel und StartOS werden in derselben Version repariert; keine der beiden konnte bisher abgeschlossen werden.

Starten Sie LND nach einer Migration nie wieder auf dem alten Gerät. Zwei Nodes mit demselben Seed führen zu unvorhersehbarem Verhalten oder zum Verlust von Geldmitteln.`,
    pl_PL: `**Migruj istniejący węzeł LND z myNode.**

**Zainicjalizuj portfel** oferuje teraz **Migrację z myNode** obok Umbrel i StartOS. Sprawdza połączenie ze starym węzłem i planuje migrację; po uruchomieniu LND zatrzymuje stary węzeł, kopiuje katalog danych LND przez sieć lokalną, konwertuje bazę danych i uruchamia LND — dzięki czemu Twoje kanały przenoszą się razem z Tobą. Na dużym węźle trwa to wiele godzin; postęp śledź w sekcji Kontrole stanu.

W tym samym wydaniu naprawiono migracje z Umbrel i StartOS; żadna z nich nie mogła się wcześniej zakończyć.

Po każdej migracji nigdy nie uruchamiaj ponownie LND na starym urządzeniu. Dwa węzły działające na tym samym ziarnie prowadzą do nieprzewidywalnego zachowania lub utraty środków.`,
    fr_FR: `**Migrez un nœud LND existant depuis myNode.**

**Initialiser le portefeuille** propose désormais **Migrer depuis myNode**, aux côtés d'Umbrel et de StartOS. L'action vérifie la connexion à votre ancien nœud et planifie la migration ; au démarrage de LND, celui-ci arrête l'ancien nœud, copie le répertoire de données de LND sur votre réseau local, convertit la base de données puis se met en ligne — vos canaux vous suivent donc. Sur un gros nœud, cela prend des heures ; suivez la progression sous Vérifications d'état.

Les migrations depuis Umbrel et StartOS sont réparées dans la même version ; aucune des deux ne pouvait aboutir auparavant.

Après toute migration, ne redémarrez jamais LND sur l'ancien appareil. Deux nœuds partageant une même graine entraînent un comportement imprévisible ou une perte de fonds.`,
  },
  migrations: {
    up: async ({ effects, progress }) => {
      // Replay keys abandoned when bitcoind renamed its config action. Nothing
      // reaps them, and they keep demanding whatever they last asked for.
      await sdk.action.clearTask(
        effects,
        'bitcoind:config',
        'bitcoind:other-config',
      )
      // The bolt → SQLite conversion, for nodes updating from a pre-0.21
      // release — as a migration so it runs on updates only, reporting its two
      // phases to the update progress UI. Gated on data state, not version: an
      // already-converted node no-ops, and bolt data that arrives outside an
      // update (an Initialize Wallet import, a restored pre-conversion backup)
      // is converted by main's conversion phase instead (sqliteBackend.ts).
      if (await needsSqliteMigration()) {
        // Migrations run before the seedFiles and setupCerts init steps, and
        // the conversion's finalize stage runs LND against both on-disk
        // artifacts — so bring each current first. The conf re-render strips
        // what the schema retires (the pre-0.21 onion-message keys crash 0.21
        // with "feature bit: 39 already set"); the cert reissue covers curls
        // pinned to 127.0.0.1, a SAN pre-0.21 certs lack, without which the
        // schema run wedges until its timeout.
        await lndConfFile.merge(effects, {})
        await writeCerts(effects)
        await runSqliteMigration(effects, progress)
      }
    },
  },
})
