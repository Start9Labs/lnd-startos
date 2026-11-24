import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { rm } from 'fs/promises'

export const current = VersionInfo.of({
  version: '0.21.8-beta:6',
  releaseNotes: {
    en_US:
      'Pay Invoice reports a payment that is still in flight as pending, with its payment hash, instead of as failed. Running it again with the same invoice shows the final result. A server carried over from StartOS 0.3.5 no longer keeps a leftover copy of the wallet password, so Cold Storage Mode removes it completely and StartOS backups leave it out. If you use Cold Storage Mode on such a server, take a new StartOS backup to replace any made before this update.',
    es_ES:
      'Pagar factura informa como pendiente, con su hash de pago, un pago que sigue en curso, en lugar de como fallido. Volver a ejecutarla con la misma factura muestra el resultado final. Un servidor procedente de StartOS 0.3.5 ya no conserva una copia sobrante de la contraseña del monedero, por lo que el Modo de almacenamiento en frío la elimina por completo y las copias de seguridad de StartOS no la incluyen. Si usas el Modo de almacenamiento en frío en un servidor así, haz una nueva copia de seguridad de StartOS para reemplazar las hechas antes de esta actualización.',
    de_DE:
      'Rechnung bezahlen meldet eine noch laufende Zahlung als ausstehend, mit ihrem Zahlungs-Hash, statt als fehlgeschlagen. Ein erneuter Aufruf mit derselben Rechnung zeigt das endgültige Ergebnis. Ein von StartOS 0.3.5 übernommener Server behält keine übrig gebliebene Kopie des Wallet-Passworts mehr, sodass der Cold-Storage-Modus es vollständig entfernt und StartOS-Backups es nicht enthalten. Wenn du den Cold-Storage-Modus auf einem solchen Server nutzt, erstelle ein neues StartOS-Backup, um die vor diesem Update erstellten zu ersetzen.',
    pl_PL:
      'Zapłać fakturę zgłasza płatność, która wciąż jest w toku, jako oczekującą, z jej hashem płatności, zamiast jako nieudaną. Ponowne uruchomienie z tą samą fakturą pokazuje ostateczny wynik. Serwer przeniesiony ze StartOS 0.3.5 nie przechowuje już pozostałej kopii hasła portfela, więc tryb zimnego przechowywania usuwa je całkowicie, a kopie zapasowe StartOS go nie zawierają. Jeśli używasz trybu zimnego przechowywania na takim serwerze, wykonaj nową kopię zapasową StartOS, aby zastąpić te sprzed tej aktualizacji.',
    fr_FR:
      'Payer une facture signale un paiement encore en cours comme en attente, avec son hachage de paiement, au lieu de l’indiquer comme échoué. La relancer avec la même facture affiche le résultat final. Un serveur provenant de StartOS 0.3.5 ne conserve plus de copie résiduelle du mot de passe du portefeuille : le mode stockage à froid le supprime donc entièrement et les sauvegardes StartOS ne l’incluent pas. Si vous utilisez le mode stockage à froid sur un tel serveur, effectuez une nouvelle sauvegarde StartOS pour remplacer celles faites avant cette mise à jour.',
  },
  migrations: {
    up: async () => {
      await rm('/media/startos/volumes/main/pwd.dat', { force: true })
    },
    down: IMPOSSIBLE,
  },
})
