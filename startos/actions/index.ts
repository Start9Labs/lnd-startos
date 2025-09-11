import { sdk } from '../sdk'
import { aezeedCipherSeed } from './aezeedCipherSeed'
import { autopilotConfig } from './config/autopilot'
import { backendConfig } from './config/backend'
import { bitcoinConfig } from './config/bitcoin'
import { dbBoltConfig } from './config/dbBolt'
import { general } from './config/general'
import { setExternalGateway } from './config/externalGateway'
import { protocolConfig } from './config/protocol'
import { sweeperConfig } from './config/sweeper'
import { wtClientConfig } from './config/watchtowerClient'
import { watchtowerServerConfig } from './config/watchtowerServer'
import { importUmbrel } from './importUmbrel'
import { nodeInfo } from './nodeInfo'
import { recreateMacaroons } from './recreate-macaroons'
import { resetWalletTransactions } from './resetTxns'
import { towerInfo } from './towerInfo'

export const actions = sdk.Actions.of()
  .addAction(general)
  .addAction(autopilotConfig)
  .addAction(backendConfig)
  .addAction(bitcoinConfig)
  .addAction(dbBoltConfig)
  .addAction(protocolConfig)
  .addAction(sweeperConfig)
  .addAction(watchtowerServerConfig)
  .addAction(wtClientConfig)
  .addAction(resetWalletTransactions)
  .addAction(towerInfo)
  .addAction(nodeInfo)
  .addAction(aezeedCipherSeed)
  .addAction(recreateMacaroons)
  .addAction(importUmbrel)
  .addAction(setExternalGateway)

// TODO pay invoice action
