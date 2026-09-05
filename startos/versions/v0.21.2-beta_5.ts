import { VersionInfo } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { writeCerts } from '../init/setupCerts'
import { sdk } from '../sdk'
import { needsSqliteMigration, runSqliteMigration } from '../sqliteBackend'

export const v_0_21_2_beta_5 = VersionInfo.of({
  version: '0.21.2-beta:5',
  releaseNotes: {
    en_US: `Restores the "Reject Routing Requests" toggle, which was dropped when this package's configuration was rewritten for StartOS 0.4.0.

The setting itself never went away — only the control did. If you had switched it on, your node has been refusing to forward payments ever since, with no way to turn it back off, and its log shows \`node configured to disallow forwards\` each time it turns one away. This is most likely to affect nodes carried over from StartOS 0.3.5.x, where the toggle was a standard configuration option. Open Channel Settings to see its current value and change it.

Nodes that never enabled it are unaffected — the setting stays off by default.`,
    es_ES: `Se restaura la opción "Rechazar solicitudes de enrutamiento", que se perdió cuando se reescribió la configuración de este paquete para StartOS 0.4.0.

La opción nunca desapareció, solo el control. Si la habías activado, tu nodo ha estado rechazando el reenvío de pagos desde entonces, sin forma de desactivarla, y su registro muestra \`node configured to disallow forwards\` cada vez que rechaza uno. Esto afecta sobre todo a los nodos migrados desde StartOS 0.3.5.x, donde la opción era una configuración habitual. Abre Configuración de Canales para ver su valor actual y cambiarlo.

Los nodos que nunca la activaron no se ven afectados: la opción sigue desactivada de forma predeterminada.`,
    de_DE: `Stellt den Schalter „Routing-Anfragen ablehnen“ wieder her, der beim Umschreiben der Konfiguration dieses Pakets für StartOS 0.4.0 entfernt wurde.

Die Einstellung selbst verschwand nie – nur das Bedienelement. Wenn Sie sie aktiviert hatten, verweigert Ihr Knoten seitdem die Weiterleitung von Zahlungen, ohne Möglichkeit, sie wieder abzuschalten, und sein Protokoll zeigt bei jeder abgewiesenen Zahlung \`node configured to disallow forwards\`. Betroffen sind vor allem Knoten, die von StartOS 0.3.5.x übernommen wurden, wo der Schalter eine übliche Konfigurationsoption war. Öffnen Sie „Kanaleinstellungen“, um den aktuellen Wert zu sehen und zu ändern.

Knoten, die ihn nie aktiviert haben, sind nicht betroffen – die Einstellung bleibt standardmäßig deaktiviert.`,
    pl_PL: `Przywraca przełącznik „Odrzuć żądania routingu”, który został usunięty podczas przepisywania konfiguracji tego pakietu dla StartOS 0.4.0.

Samo ustawienie nigdy nie zniknęło — zniknął tylko przełącznik. Jeśli był włączony, twój węzeł od tego czasu odmawia przekazywania płatności i nie było sposobu, aby to wyłączyć, a w dzienniku przy każdej odrzuconej płatności pojawia się \`node configured to disallow forwards\`. Dotyczy to przede wszystkim węzłów przeniesionych ze StartOS 0.3.5.x, gdzie przełącznik był standardową opcją konfiguracji. Otwórz Ustawienia kanałów, aby zobaczyć bieżącą wartość i ją zmienić.

Węzły, które nigdy go nie włączyły, nie są objęte zmianą — ustawienie domyślnie pozostaje wyłączone.`,
    fr_FR: `Restaure l'option « Rejeter les demandes de routage », supprimée lors de la réécriture de la configuration de ce paquet pour StartOS 0.4.0.

Le paramètre lui-même n'a jamais disparu, seule la commande l'a été. Si vous l'aviez activé, votre nœud refuse depuis lors de transmettre les paiements, sans moyen de le désactiver, et son journal affiche \`node configured to disallow forwards\` à chaque paiement refusé. Sont surtout concernés les nœuds repris de StartOS 0.3.5.x, où l'option faisait partie de la configuration courante. Ouvrez Paramètres des canaux pour voir sa valeur actuelle et la modifier.

Les nœuds qui ne l'ont jamais activée ne sont pas concernés : le paramètre reste désactivé par défaut.`,
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
