import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const v0_18_5_beta = VersionInfo.of({
  version: '0.18.5-beta:0',
  releaseNotes: 'Revamped for StartOS 0.4.0',
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
