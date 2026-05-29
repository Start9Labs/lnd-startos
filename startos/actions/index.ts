import { sdk } from '../sdk'
import { backendConfig } from './backend'
import { autopilotConfig } from './config/autopilot'
import { channelsConfig } from './config/channels'
import { customExternalHostConfig } from './config/customExternalHost'
import { general } from './config/general'
import { performanceConfig } from './config/performance'
import { routingFeesConfig } from './config/routing-fees'
import { torConfig } from './config/tor'
import { wtClientConfig } from './config/watchtowerClient'
import { watchtowerServerConfig } from './config/watchtowerServer'
import { initializeWallet } from './initializeWallet'
import { nodeInfo } from './nodeInfo'
import { recreateMacaroons } from './recreate-macaroons'
import { resetWalletTransactions } from './resetTxns'
import { towerInfo } from './towerInfo'

export const actions = sdk.Actions.of()
  .addAction(general)
  .addAction(routingFeesConfig)
  .addAction(channelsConfig)
  .addAction(autopilotConfig)
  .addAction(torConfig)
  .addAction(customExternalHostConfig)
  .addAction(backendConfig)
  .addAction(performanceConfig)
  .addAction(watchtowerServerConfig)
  .addAction(wtClientConfig)
  .addAction(resetWalletTransactions)
  .addAction(towerInfo)
  .addAction(nodeInfo)
  .addAction(initializeWallet)
  .addAction(recreateMacaroons)
