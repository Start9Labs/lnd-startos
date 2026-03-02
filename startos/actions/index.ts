import { sdk } from '../sdk'
import { backendConfig } from './backend'
import { autopilotConfig } from './config/autopilot'
import { bitcoinConfig } from './config/bitcoin'
import { general } from './config/general'
import { wtClientConfig } from './config/watchtowerClient'
import { watchtowerServerConfig } from './config/watchtowerServer'
import { initializeWallet } from './initializeWallet'
import { nodeInfo } from './nodeInfo'
import { recreateMacaroons } from './recreate-macaroons'
import { resetWalletTransactions } from './resetTxns'
import { towerInfo } from './towerInfo'

export const actions = sdk.Actions.of()
  .addAction(general)
  .addAction(autopilotConfig)
  .addAction(backendConfig)
  .addAction(bitcoinConfig)
  .addAction(watchtowerServerConfig)
  .addAction(wtClientConfig)
  .addAction(resetWalletTransactions)
  .addAction(towerInfo)
  .addAction(nodeInfo)
  .addAction(initializeWallet)
  .addAction(recreateMacaroons)
