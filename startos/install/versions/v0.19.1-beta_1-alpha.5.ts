import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const v0_19_1_beta_1_alpha5 = VersionInfo.of({
  version: '0.19.1-beta:1-alpha.5',
  releaseNotes: 'Revamped for StartOS 0.4.0',
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})

