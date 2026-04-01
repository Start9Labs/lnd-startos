import { readdir, rm } from 'fs/promises'
import { join } from 'path'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const recreateMacaroons = sdk.Action.withoutInput(
  // id
  'recreate-macaroons',

  // metadata
  async ({ effects }) => ({
    name: i18n('Recreate Macaroons'),
    description: i18n(
      'Deletes current macaroons, and restarts LND to recreate all macaroons.',
    ),
    warning: i18n(
      'This will delete and recreate all existing macaroon files, so you may need to restart other services using LND.',
    ),
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // execution function
  async ({ effects }) => {
    const dir = '/media/startos/volumes/main/data/chain/bitcoin/mainnet'
    const files = await readdir(dir)
    for (const file of files) {
      if (file.endsWith('.macaroon')) {
        await rm(join(dir, file))
      }
    }
    await sdk.restart(effects)
    return {
      version: '1',
      title: i18n('Success'),
      message: i18n(
        'Existing macaroons have been deleted and fresh macaroons will be created on next startup. If LND is already running, it will be restarted now',
      ),
      result: null,
    }
  },
)
