import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

export const aezeedCipherSeed = sdk.Action.withoutInput(
  // id
  'aezeed-cipher-seed',

  // metadata
  async ({ effects }) => ({
    name: 'Aezeed Cipher Seed',
    description: 'Display your Aezeed Cipher Seed.',
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  // the execution function
  async ({ effects }) => {
    const aezeedCipherSeed = (await storeJson.read().const(effects))
      ?.aezeedCipherSeed

    return {
      version: '1',
      title: 'Aezeed Cipher Seed',
      message:
        'Seed for restoring on-chain ONLY funds. This seed has no knowledge of channel state. This is NOT a BIP-39 seed; As such it cannot be used to recover on-chain funds to any wallet other than LND.',
      result: {
        type: 'single',
        value: aezeedCipherSeed
          ? aezeedCipherSeed.map((word, i) => `${i + 1}: ${word}`).join(' ')
          : 'No Cipher Seed found. The Aezeed Cipher Seed is not available on StartOS for some nodes initialized on earlier versions of LND. It is not possible to retreive the Seed from wallets created on these earlier versions.\nIf you would like to have a Cipher Seed backup, you will need to close your existing channels and move any on-chain funds to an intermediate wallet before creating a new LND wallet',
        copyable: true,
        // @TODO why does this still show a QR code?
        // Also, can we wrap the value (CipherSeed)?
        qr: false,
        masked: !!aezeedCipherSeed,
      },
    }
  },
)
