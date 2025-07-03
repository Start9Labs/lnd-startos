import { rm } from 'fs/promises'
import { sdk } from '../sdk'
import { glob } from 'fs/promises'

export const recreateMacaroons = sdk.Action.withoutInput(
  // id
  'recreate-macaroons',

  // metadata
  async ({ effects }) => ({
    name: 'Recreate Macaroons',
    description:
      'Deletes current macaroons, and restarts LND to recreate all macaroons.',
    warning:
      'This will delete and recreate all existing macaroon files, so you may need to restart other services using LND.',
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // execution function
  async ({ effects }) => {
    for await (const macaroonFile of glob('/media/startos/volumes/main/data/chain/bitcoin/mainnet/*.macaroon')) {
      await rm(macaroonFile)
    }
    await sdk.restart(effects)
    return {
      version: '1',
      title: 'Success',
      message:
        'Existing macaroons have been deleted and fresh macaroons will be created on next startup. If LND is already running, it will be restarted now',
      result: null,
    }
  },
)
