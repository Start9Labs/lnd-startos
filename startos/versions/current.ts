import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.8-beta:5',
  releaseNotes: {
    en_US:
      'Adds rbitcoin as an optional Bitcoin backend, polled over RPC. Bitcoin Core stays the default.',
    es_ES:
      'Añade rbitcoin como backend de Bitcoin opcional, consultado por RPC. Bitcoin Core sigue siendo la opción predeterminada.',
    de_DE:
      'Fügt rbitcoin als optionales Bitcoin-Backend hinzu, abgefragt per RPC. Bitcoin Core bleibt die Standardeinstellung.',
    pl_PL:
      'Dodaje rbitcoin jako opcjonalny backend Bitcoin odpytywany przez RPC. Bitcoin Core pozostaje domyślny.',
    fr_FR:
      'Ajoute rbitcoin comme backend Bitcoin optionnel, interrogé par RPC. Bitcoin Core reste le choix par défaut.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
