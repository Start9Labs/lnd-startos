import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Written by the Cold Storage actions only. Whether the mode is on is not
// recorded here: it is the absence of the wallet password from store.json.
// Deliberately not in store.json, whose watch restarts LND on any change.
//
// The password hash lets Turn Off reject a mistyped password while the wallet
// cannot be asked; Turn Off drops it once the password is back.
export const coldStorageShape = z.object({
  // Set when the credentials have been displayed for the user to record;
  // every further display reshuffles the challenge.
  prepared: z.boolean().catch(false),
  passwordHash: z.string().nullable().catch(null),
  passwordSalt: z.string().nullable().catch(null),
  // Which seed words Enable will ask for, chosen when the credentials are shown.
  seedChallenge: z.array(z.number()).nullable().catch(null),
})

export const coldStorageJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/cold-storage.json' },
  coldStorageShape,
)
