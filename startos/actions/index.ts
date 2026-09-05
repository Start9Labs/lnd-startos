import { sdk } from '../sdk'
import { autoconfig } from './config/autoconfig'
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
import { towerInfo } from './towerInfo'
import { addBackupTarget } from './addBackupTarget'
import {
  aezeedCipherSeed,
  confirmSeedBackup,
  deleteCipherSeed,
} from './aezeedCipherSeed'
import {
  confirmPasswordBackup,
} from './confirmPasswordBackup'
import { disableAutoUnlock } from './disableAutoUnlock'
import { initializeWallet } from './initializeWallet'
import { manualBackup } from './manualBackup'
import { nodeInfo } from './nodeInfo'
import { revokeMacaroons } from './revoke-macaroons'
import { resetWalletTransactions } from './resetTxns'
import { manualWalletUnlock, walletPassword } from './walletPassword'

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
  .addAction(towerInfo)
  .addAction(wtClientConfig)
  .addAction(resetWalletTransactions)
  .addAction(nodeInfo)
  .addAction(initializeWallet)
  .addAction(revokeMacaroons)
  .addAction(autoconfig)
  .addAction(aezeedCipherSeed)
  .addAction(confirmSeedBackup)
  .addAction(deleteCipherSeed)
  .addAction(addBackupTarget)
  .addAction(manualBackup)
  .addAction(disableAutoUnlock)
  .addAction(manualWalletUnlock)
  .addAction(walletPassword)
  .addAction(confirmPasswordBackup)
