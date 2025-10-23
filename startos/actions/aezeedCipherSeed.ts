import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'
import type { Effects } from '@start9labs/start-sdk/base/lib/types'

const { InputSpec, Value } = sdk

type SeedBackupInput = {
  word1: string
  word2: string
  word3: string
}

// Static InputSpec
const seedBackupInputSpec = InputSpec.of({
  word1: Value.text({
    name: '\u{2460}',
    description: 'Enter the word at the requested position.',
    required: true,
    masked: false,
    default: null,
  }),
  word2: Value.text({
    name: '\u{2461}',
    description: 'Enter the word at the requested position.',
    required: true,
    masked: false,
    default: null,
  }),
  word3: Value.text({
    name: '\u{2462}',
    description: 'Enter the word at the requested position.',
    required: true,
    masked: false,
    default: null,
  }),
})

/** Display the full Aezeed Cipher Seed */
export const aezeedCipherSeed = sdk.Action.withoutInput(
  'aezeed-cipher-seed',
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: 'Aezeed Cipher Seed',
      description: 'Display your Aezeed Cipher Seed.',
      warning:
        'This seed restores on-chain ONLY funds. It has no knowledge of channel state and is NOT a BIP-39 seed. Do not use it to recover funds in any wallet other than LND.',
      allowedStatuses: 'any',
      group: 'Security',
      visibility: store?.walletInitialized
        ? 'enabled'
        : { disabled: 'Wallet not initialized' },
    }
  },
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    const aezeedCipherSeed = store?.aezeedCipherSeed

    return {
      version: '1',
      title: 'Aezeed Cipher Seed',
      message:
        'Seed for restoring on-chain ONLY funds. This seed has no knowledge of channel state. This is NOT a BIP-39 seed; As such it cannot be used to recover on-chain funds to any wallet other than LND.',
      result: {
        type: 'single',
        value: aezeedCipherSeed
          ? aezeedCipherSeed.map((word, i) => `${i + 1}: ${word}`).join(' ')
          : 'No Cipher Seed found. The Aezeed Cipher Seed is not available on StartOS for some nodes initialized on earlier versions of LND. It is not possible to retrieve the Seed from wallets created on these earlier versions.\nIf you would like to have a Cipher Seed backup, you will need to close your existing channels and move any on-chain funds to an intermediate wallet before creating a new LND wallet',
        copyable: true,
        qr: false,
        masked: !!aezeedCipherSeed,
      },
    }
  },
)

/** Confirm seed backup with pre-filled position hints */
export const confirmSeedBackup = sdk.Action.withInput(
  'confirm-seed-backup',
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    let desc = 'Confirm you have backed up your Aezeed Cipher Seed.'
   // if (store?.seedBackupIndices?.length === 3) {
   //   const positions = store.seedBackupIndices.map(i => i + 1).join(', ')
   //   desc += ` (You will be asked for words at positions: ${positions})`
   // }
    return {
      name: 'Confirm Aezeed Seed Backup',
      description: desc,
      warning: 'Ensure you have securely backed up your seed before confirming.',
      allowedStatuses: 'any',
      group: 'Security',
      visibility: store?.seedBackupConfirmed
        ? { disabled: 'Aezeed Seed backup already confirmed' }
        : store?.walletInitialized
        ? 'enabled'
        : { disabled: 'Wallet not initialized' },
    }
  },
  seedBackupInputSpec,
  // Prefill: fills input boxes + updates labels
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    if (!store?.aezeedCipherSeed) throw new Error('No seed available')

    let indices = store.seedBackupIndices
    if (!indices || indices.length !== 3) {
      const allIndices = Array.from({ length: 24 }, (_, i) => i)
      for (let i = allIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]]
      }
      indices = allIndices.slice(0, 3).sort((a, b) => a - b)
      await storeJson.merge(effects, { seedBackupIndices: indices })
    }

    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd']
      const v = n % 100
      return n + (s[(v - 20) % 10] || s[v] || s[0]) + ' Word'
    }

    const pos1 = indices[0] + 1
    const pos2 = indices[1] + 1
    const pos3 = indices[2] + 1

    return {
      word1: ordinal(pos1),
      word2: ordinal(pos2),
      word3: ordinal(pos3),
      '@prefill': {
        word1: { name: `Word ${pos1}`, description: `Enter word #${pos1}` },
        word2: { name: `Word ${pos2}`, description: `Enter word #${pos2}` },
        word3: { name: `Word ${pos3}`, description: `Enter word #${pos3}` },
      },
    }
  },
  // Submit handler
  async ({ effects, input }: { effects: Effects; input: SeedBackupInput }) => {
    const store = await storeJson.read().const(effects)
    if (!store?.aezeedCipherSeed) {
      throw new Error('No Aezeed Cipher Seed found.')
    }
    if (store.seedBackupConfirmed) {
      return {
        version: '1',
        title: 'Aezeed Seed Backup Status',
        message: 'Status: Confirmed',
        result: null,
      }
    }

    const indices = store.seedBackupIndices
    if (!indices || indices.length !== 3) {
      throw new Error('Backup indices not initialized. Please retry the action.')
    }

    const isValid = indices.every((index, i) => {
      const key = `word${i + 1}` as keyof SeedBackupInput
      const userInput = input[key]
      if (!userInput || userInput.toLowerCase().includes('word')) return false
      return userInput === store.aezeedCipherSeed![index]
    })

    if (!isValid) {
      throw new Error('Invalid seed words provided.')
    }

    await storeJson.merge(effects, {
      seedBackupConfirmed: true,
      seedBackupIndices: null,
    })

    console.log('Aezeed Cipher Seed backup confirmed')
    return {
      version: '1',
      title: 'Seed Backup Confirmed',
      message: 'Status: Confirmed',
      result: null,
    }
  }
)

/** Delete seed from server after backup confirmed */
export const deleteCipherSeed = sdk.Action.withoutInput(
  'delete-cipher-seed',
  async ({ effects }: { effects: Effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: 'Delete Aezeed Cipher Seed',
      description: 'Delete the Aezeed Cipher Seed from the server (store.json). If not deleted, anyone with physical access to the server can reflash Start9, set a new master password, convert the Aezeed seed to an HD key, and then import that key into an external wallet to steal your on-chain funds.',
      warning: 'Ensure you have securely backed up your seed before deleting it. This action cannot be undone.',
      allowedStatuses: 'any',
      group: 'Security',
      visibility: store?.aezeedCipherSeed
        ? store?.seedBackupConfirmed
          ? 'enabled'
          : { disabled: 'Seed backup not confirmed' }
        : { disabled: 'Cipher Seed already deleted' },
    }
  },
  async ({ effects }: { effects: Effects }) => {
    await storeJson.merge(effects, { aezeedCipherSeed: null })
    console.log('Aezeed Cipher Seed deleted from store.json')
    return {
      version: '1',
      title: 'Seed Deleted',
      message: 'Aezeed Cipher Seed has been deleted from store.json.',
      result: null,
    }
  },
)