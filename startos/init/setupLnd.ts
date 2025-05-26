import { backendConfig } from '../actions/config/backend'
import { lndConfFile } from '../fileModels/lnd.conf'
import { peerInterfaceId } from '../interfaces'
import { sdk } from '../sdk'
// TODO even after uninstalling and re-installing a package setupOnInstall doesn't seem to request the task
export const setupLnd = sdk.setupOnInstall(async (effects) => {
  const peerOnionUrl = await sdk.serviceInterface
    .getOwn(effects, peerInterfaceId)
    .once()

  await lndConfFile.merge(effects, {
    externalhosts: peerOnionUrl?.addressInfo?.publicUrls || [],
  })

  await sdk.action.createOwnTask(effects, backendConfig, 'critical', {
    reason: 'LND needs to know what Bitcoin backend should be used',
  })
})
