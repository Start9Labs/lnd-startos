import { sdk } from '../sdk'
import { autopilotConfig } from './config/autopilot'
import { backendConfig } from './config/backend'
import { bitcoinConfig } from './config/bitcoin'
import { dbBoltConfig } from './config/dbBolt'
import { general } from './config/general'
import { protocolConfig } from './config/protocol'
import { sweeperConfig } from './config/sweeper'
import { wtClientConfig } from './config/watchtowerClient'
import { watchtowerServerConfig } from './config/watchtowerServer'
import { resetWalletTransactions } from './resetTxns'

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
  .addAction(resetWalletTransactions)
  .addAction()