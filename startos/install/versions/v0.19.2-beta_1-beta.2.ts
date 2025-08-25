import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const v0_19_2_beta_1_beta_2 = VersionInfo.of({
  version: '0.19.2-beta:1-beta.2',
  releaseNotes: 'Revamped for StartOS 0.4.0',
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
