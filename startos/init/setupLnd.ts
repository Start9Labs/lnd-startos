import { backendConfig } from '../actions/config/backend'
import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { peerInterfaceId } from '../interfaces'
import { sdk } from '../sdk'
export const setupLnd = sdk.setupOnInit(async (effects, kind) => {
  if (kind !== 'install') return
  const peerOnionUrl = await sdk.serviceInterface
    .getOwn(effects, peerInterfaceId)
    .once()

  await lndConfFile.merge(effects, {
    externalhosts: peerOnionUrl?.addressInfo?.publicUrls || [],
  })

  const backendSelected = (await storeJson.read().once())?.bitcoindSelected

  if (!backendSelected) {
    await sdk.action.createOwnTask(effects, backendConfig, 'critical', {
      reason: 'LND needs to know what Bitcoin backend should be used',
    })
  }
})
