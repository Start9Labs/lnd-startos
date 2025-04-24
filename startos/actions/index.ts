import { sdk } from '../sdk'
import { autopilotConfig } from './autopilot'
import { backendConfig } from './backend'
import { bitcoinConfig } from './bitcoin'
import { dbBoltConfig } from './dbBolt'
import { general } from './general'
import { protocolConfig } from './protocol'
import { sweeperConfig } from './sweeper'
import { wtClientConfig } from './watchtowerClient'
import { watchtowerServerConfig } from './watchtowerServer'

export const actions = sdk.Actions.of()
  .addAction(autopilotConfig)
  .addAction(backendConfig)
  .addAction(bitcoinConfig)
  .addAction(dbBoltConfig)
  .addAction(general)
  .addAction(protocolConfig)
  .addAction(sweeperConfig)
  .addAction(watchtowerServerConfig)
  .addAction(wtClientConfig)
