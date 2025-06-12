import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'

export const v0_19_1_beta_1 = VersionInfo.of({
  version: '0.19.1-beta:1',
  releaseNotes: 'Revamped for StartOS 0.4.0',
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})

// @TODO case for non-typeable wallet password and convert to a base32 encoded password for jsonStore
