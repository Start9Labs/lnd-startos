import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:8',
  releaseNotes: {
    en_US:
      'Restore Channels from File, under Continuous Backups, recovers the channels in a channel.backup you supply, such as an emailed copy, including those opened after the StartOS backup a node was restored from. Each channel it recovers is force-closed by its peer.',
    es_ES:
      'Restaurar canales desde archivo, en Copias continuas, recupera los canales de un channel.backup que aportes, como una copia recibida por correo, incluidos los abiertos después de la copia de seguridad de StartOS desde la que se restauró el nodo. Su par fuerza el cierre de cada canal que recupera.',
    de_DE:
      'Kanäle aus Datei wiederherstellen unter Kontinuierliche Backups stellt die Kanäle aus einem channel.backup wieder her, das du bereitstellst, etwa aus einer per E-Mail erhaltenen Kopie, auch solche, die nach dem StartOS-Backup geöffnet wurden, aus dem der Knoten wiederhergestellt wurde. Jeden so wiederhergestellten Kanal schließt sein Peer erzwungen.',
    pl_PL:
      'Przywróć kanały z pliku, w sekcji Kopie ciągłe, odzyskuje kanały z dostarczonego pliku channel.backup, na przykład z kopii otrzymanej e-mailem, także te otwarte po kopii zapasowej StartOS, z której przywrócono węzeł. Partner każdego odzyskanego kanału wymusza jego zamknięcie.',
    fr_FR:
      "Restaurer les canaux depuis un fichier, dans Sauvegardes continues, récupère les canaux d'un channel.backup que vous fournissez, comme une copie reçue par e-mail, y compris ceux ouverts après la sauvegarde StartOS à partir de laquelle le nœud a été restauré. Le pair de chaque canal récupéré force sa fermeture.",
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
