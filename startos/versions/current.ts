import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '0.21.4-beta:4',
  releaseNotes: {
    en_US:
      "LND keeps responding when apps such as Balance of Satoshis' Telegram bot start watching its invoices.",
    es_ES:
      'LND sigue respondiendo cuando aplicaciones como el bot de Telegram de Balance of Satoshis empiezan a vigilar sus facturas.',
    de_DE:
      'LND reagiert weiterhin, wenn Apps wie der Telegram-Bot von Balance of Satoshis beginnen, seine Rechnungen zu beobachten.',
    pl_PL:
      'LND nadal odpowiada, gdy aplikacje takie jak bot Telegrama w Balance of Satoshis zaczynają obserwować jego faktury.',
    fr_FR:
      'LND continue de répondre lorsque des applications comme le bot Telegram de Balance of Satoshis commencent à surveiller ses factures.',
  },
  migrations: {
    up: async () => {},
    down: IMPOSSIBLE,
  },
})
