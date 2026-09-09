import { startupFlagsJson } from '../fileModels/startupFlags.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const revokeMacaroons = sdk.Action.withoutInput(
  // id
  'revoke-macaroons',

  // metadata
  async ({ effects }) => ({
    name: i18n('Revoke Macaroons'),
    description: i18n(
      'Revokes every macaroon this node has issued by rotating the root key they are signed with, then restarts LND to write fresh ones. Deleting macaroon files alone does not revoke them, so use this if one may have been copied or exposed.',
    ),
    warning: i18n(
      'This revokes every existing macaroon. Any service connected to LND loses access until it picks up the new macaroon, and may need to be restarted.',
    ),
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // execution function
  async ({ effects }) => {
    // Deleting the macaroon files revokes nothing: LND re-bakes them from the
    // surviving root key, so a macaroon copied beforehand still verifies. The
    // root key lives in the macaroon store — bolt's macaroons.db on an older
    // node, the macaroondb_kv table inside chain.sqlite once migrated — and
    // clearing it by hand leaves the files signed with a key LND no longer
    // has, which breaks even the node's own health check. LND rotates the key
    // and re-bakes the files together through the wallet unlocker, so the work
    // happens at unlock; this only asks for it.
    await startupFlagsJson.merge(effects, { rotateMacaroonRootKey: true })
    await sdk.restart(effects)

    return {
      version: '1',
      title: i18n('Success'),
      message: i18n(
        'LND is restarting to generate a new macaroon root key. Every macaroon issued before now becomes invalid, and fresh ones are written once the wallet unlocks.',
      ),
      result: null,
    }
  },
)
