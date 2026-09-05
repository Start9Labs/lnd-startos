import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'
import { v_0_21_1_beta_0 } from './v0.21.1-beta_0'
import { v_0_21_2_beta_5 } from './v0.21.2-beta_5'

export const versionGraph = VersionGraph.of({
  current,
  other: [v_0_21_1_beta_0, v_0_21_2_beta_5],
})
