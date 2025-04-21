import { sdk } from '../sdk'
import { LndConf, lndConfFile } from '../file-models/lnd.conf'
import { configSpec } from './spec'

export const read = sdk.setupConfigRead(configSpec, async ({ effects }) => {
  const config = (await lndConfFile.read(effects))!

  // Return the expected config spec to display to the user
  return {
    alias: config.alias,
    color: config.color,
    'accept-keysend': config['accept-keysend'],
    'accept-amp': config['accept-amp'],
    rejecthtlc: config.rejecthtlc,
    minchansize: config.minchansize,
    maxchansize: config.maxchansize,
    tor: {
      usetoronly: config['tor.skipproxyforclearnettarget']
    }
  }
})
