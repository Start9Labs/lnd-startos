import { VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.3-beta:1',
  releaseNotes: {
    en_US: `Adds a Wallet Unlock health check that reports when LND refuses the stored wallet password.`,
    es_ES: `Añade una comprobación de estado «Desbloqueo del monedero» que avisa cuando LND rechaza la contraseña del monedero almacenada.`,
    de_DE: `Fügt eine Zustandsprüfung „Wallet-Entsperrung“ hinzu, die meldet, wenn LND das gespeicherte Wallet-Passwort ablehnt.`,
    pl_PL: `Dodaje kontrolę stanu „Odblokowanie portfela”, która sygnalizuje odrzucenie zapisanego hasła portfela przez LND.`,
    fr_FR: `Ajoute une vérification d'état « Déverrouillage du portefeuille » qui signale lorsque LND refuse le mot de passe du portefeuille enregistré.`,
  },
  migrations: {
    up: async () => {},
  },
})
