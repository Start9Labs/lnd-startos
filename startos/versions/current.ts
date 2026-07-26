import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.1-beta:8',
  releaseNotes: {
    en_US: `Corrects the Bitcoin version requirement this service displays.

LND declared its Bitcoin requirement in a form that rendered as "must be below 29", which was never true — LND works with every current major version of Bitcoin. The requirement now reads as intended: Bitcoin 28.4:17 or newer.

If your Bitcoin service is older than 28.4:17, update it before updating LND.`,
    es_ES: `Corrige el requisito de versión de Bitcoin que muestra este servicio.

LND declaraba su requisito de Bitcoin de una forma que se mostraba como «debe ser inferior a 29», algo que nunca fue cierto: LND funciona con todas las versiones principales actuales de Bitcoin. El requisito ahora se lee tal y como se pretendía: Bitcoin 28.4:17 o posterior.

Si tu servicio Bitcoin es anterior a 28.4:17, actualízalo antes de actualizar LND.`,
    de_DE: `Korrigiert die von diesem Dienst angezeigte Bitcoin-Versionsanforderung.

LND gab seine Bitcoin-Anforderung in einer Form an, die als „muss kleiner als 29 sein“ dargestellt wurde — was nie zutraf: LND funktioniert mit allen aktuellen Hauptversionen von Bitcoin. Die Anforderung lautet nun wie beabsichtigt: Bitcoin 28.4:17 oder neuer.

Wenn dein Bitcoin-Dienst älter als 28.4:17 ist, aktualisiere ihn, bevor du LND aktualisierst.`,
    pl_PL: `Poprawia wymóg wersji Bitcoina wyświetlany przez tę usługę.

LND deklarował swój wymóg dotyczący Bitcoina w formie, która wyświetlała się jako „musi być niższa niż 29”, co nigdy nie było prawdą — LND działa ze wszystkimi aktualnymi głównymi wersjami Bitcoina. Wymóg brzmi teraz zgodnie z zamierzeniem: Bitcoin 28.4:17 lub nowszy.

Jeśli twoja usługa Bitcoin jest starsza niż 28.4:17, zaktualizuj ją przed aktualizacją LND.`,
    fr_FR: `Corrige l'exigence de version de Bitcoin affichée par ce service.

LND déclarait son exigence Bitcoin sous une forme qui s'affichait comme « doit être inférieure à 29 », ce qui n'a jamais été vrai : LND fonctionne avec toutes les versions majeures actuelles de Bitcoin. L'exigence s'affiche désormais comme prévu : Bitcoin 28.4:17 ou plus récent.

Si votre service Bitcoin est antérieur à 28.4:17, mettez-le à jour avant de mettre à jour LND.`,
  },
  migrations: {},
})
