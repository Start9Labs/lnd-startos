import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:4',
  releaseNotes: {
    en_US:
      'Fixes importing LND from StartOS 0.3.5.x, preserving the wallet password bytes and waiting for the origin node to report that LND has stopped before copying channel data.',
    es_ES:
      'Corrige la importación de LND desde StartOS 0.3.5.x, conservando los bytes de la contraseña de la billetera y esperando a que el nodo de origen confirme que LND se ha detenido antes de copiar los datos de los canales.',
    de_DE:
      'Behebt den Import von LND aus StartOS 0.3.5.x, bewahrt die Bytes des Wallet-Passworts und wartet vor dem Kopieren der Kanaldaten auf die Bestätigung des Ursprungsknotens, dass LND gestoppt ist.',
    pl_PL:
      'Naprawia import LND z StartOS 0.3.5.x, zachowując bajty hasła portfela i czekając na potwierdzenie przez węzeł źródłowy zatrzymania LND przed skopiowaniem danych kanałów.',
    fr_FR:
      "Corrige l'importation de LND depuis StartOS 0.3.5.x, en préservant les octets du mot de passe du portefeuille et en attendant que le nœud source confirme l'arrêt de LND avant de copier les données des canaux.",
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
