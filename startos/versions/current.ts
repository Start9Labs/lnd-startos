import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:5',
  releaseNotes: {
    en_US:
      'A running LND that is slow or stops answering requests stays shown as running: LND Server reads LND is running but slow to respond, and the sync check reads LND is running but not responding.',
    es_ES:
      'Un LND en marcha que va lento o deja de responder a las solicitudes se sigue mostrando en marcha: LND Server indica LND está en marcha pero tarda en responder, y la comprobación de sincronización indica LND está en marcha pero no responde.',
    de_DE:
      'Ein laufendes LND, das langsam ist oder nicht mehr auf Anfragen antwortet, wird weiter als laufend angezeigt: LND Server zeigt LND läuft, antwortet aber langsam, und die Synchronisierungsprüfung zeigt LND läuft, antwortet aber nicht.',
    pl_PL:
      'Działający LND, który odpowiada wolno lub przestaje odpowiadać na żądania, nadal jest pokazywany jako działający: LND Server pokazuje LND działa, ale odpowiada powoli, a sprawdzenie synchronizacji pokazuje LND działa, ale nie odpowiada.',
    fr_FR:
      'Un LND en marche qui est lent ou cesse de répondre aux requêtes reste affiché comme en marche : LND Server affiche LND fonctionne mais répond lentement, et la vérification de synchronisation affiche LND fonctionne mais ne répond pas.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
