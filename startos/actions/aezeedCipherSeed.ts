import { i18n } from '../i18n'
import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

type SeedBackupInput = {
  word1: string
  word2: string
  word3: string
}

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

export const aezeedCipherSeed = sdk.Action.withoutInput(
  'aezeed-cipher-seed',
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: i18n('Aezeed Cipher Seed'),
      description: i18n('Display your Aezeed Cipher Seed.'),
      warning:
        'This seed restores on-chain ONLY funds. It has no knowledge of channel state and is NOT a BIP-39 seed. Do not use it to recover funds in any wallet other than LND.',
      allowedStatuses: 'any',
      group: i18n('Security'),
      visibility: store?.aezeedCipherSeed
        ? store?.walletInitialized
          ? 'enabled'
          : { disabled: i18n('Wallet not initialized') }
        : { disabled: i18n('DELETED') },
    }
  },
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    const aezeedCipherSeed = store?.aezeedCipherSeed

    return {
      version: '1',
      title: i18n('Aezeed Cipher Seed'),
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

export const confirmSeedBackup = sdk.Action.withInput(
  'aezeed-cipher-seed-backup',
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: i18n('Aezeed Cipher Seed - Backup'),
      description: i18n('Confirm you have backed up your Aezeed Cipher Seed.'),
      warning:
        'Ensure you have securely backed up your seed before confirming.',
      allowedStatuses: 'any',
      group: i18n('Security'),
      visibility: store?.seedBackupConfirmed
        ? { disabled: i18n('CONFIRMED') }
        : store?.walletInitialized
          ? 'enabled'
          : { disabled: i18n('Wallet not initialized') },
    }
  },
  seedBackupInputSpec,
  async ({ effects }) => {
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
  async ({ effects, input }) => {
    const store = await storeJson.read().const(effects)
    if (!store?.aezeedCipherSeed) {
      throw new Error('No Aezeed Cipher Seed found.')
    }
    if (store.seedBackupConfirmed) {
      return {
        version: '1',
        title: i18n('Aezeed Seed Backup Status'),
        message: i18n('Status: Confirmed'),
        result: null,
      }
    }

    const indices = store.seedBackupIndices
    if (!indices || indices.length !== 3) {
      throw new Error(
        'Backup indices not initialized. Please retry the action.',
      )
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
      title: i18n('Aezeed Cipher Seed'),
      message: `<hr><span class="g-card"><header>Status: BACKUP CONFIRMED <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiMwMGZmOGUiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjMDBmZjhlIj5saXN0LWFsdC1jaGVjazwvdGl0bGU+PHBhdGggZmlsbD0iIzAwZmY4ZSIgZD0iTTUgMjFxLS44MjUgMC0xLjQxMi0uNTg3VDMgMTlWNXEwLS44MjUuNTg4LTEuNDEyVDUgM2gxNHEuODI1IDAgMS40MTMuNTg4VDIxIDV2Ny43bC0zLjY1IDMuNjVsLTIuMTI1LTIuMTI1bC00LjI1IDQuMjI1bDIuNTUgMi41NXptNi04aDZ2LTJoLTZ6bTAtNGg2VjdoLTZ6bTYuMzUgMTNsLTMuNTUtMy41NWwxLjQyNS0xLjRsMi4xMjUgMi4xMjVsNC4yNS00LjI1TDIzIDE2LjM1em0tOC42MzgtOS4yODdROSAxMi40MjUgOSAxMnQtLjI4OC0uNzEyVDggMTF0LS43MTIuMjg4VDcgMTJ0LjI4OC43MTNUOCAxM3QuNzEzLS4yODhtMC00UTkgOC40MjYgOSA4dC0uMjg4LS43MTJUOCA3dC0uNzEyLjI4OFQ3IDh0LjI4OC43MTNUOCA5dC43MTMtLjI4OCIvPjwvc3ZnPg==" alt="list-alt-check" width="48" height="48">  </header>
<h3 class="g-secondary"><br>&nbsp;&nbsp;Your "Aezeed Cipher Seed" backup has been successfully confirmed.<br><br></h3></span>`,
      result: null,
    }
  },
)

export const deleteCipherSeed = sdk.Action.withoutInput(
  'aezeed-cipher-seed-delete',
  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    return {
      name: i18n('Aezeed Cipher Seed - Delete'),
      description:
        'Delete the Aezeed Cipher Seed from the server (store.json). If not deleted, anyone with physical access to the server can reflash StartOS, set a new master password, convert the Aezeed seed to a BIP32 HD root key, and then import that key into an external wallet to steal your on-chain funds.',
      warning:
        'Ensure you have securely backed up your seed before deleting it. This action cannot be undone.',
      allowedStatuses: 'any',
      group: i18n('Security'),
      visibility: store?.aezeedCipherSeed
        ? store?.seedBackupConfirmed
          ? 'enabled'
          : { disabled: i18n('Seed backup not confirmed') }
        : { disabled: i18n('DELETED') },
    }
  },
  async ({ effects }) => {
    await storeJson.merge(effects, { aezeedCipherSeed: null })
    console.log('Aezeed Cipher Seed deleted from store.json')
    return {
      version: '1',
      title: i18n('Aezeed Cipher Seed'),
      message: `<hr><span class="g-card"><header>Status: DELETED<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIHN0cm9rZT0iI2ZmMDA1NyI+PHRpdGxlIHhtbG5zPSIiIHN0cm9rZT0iI2ZmMDA1NyI+bGlzdC1jcm9zcy1taW5pbWFsaXN0aWMtbGluZS1kdW90b25lPC90aXRsZT48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNmZjAwNTciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLXdpZHRoPSIxLjUiPjxwYXRoIGQ9Ik0yMCA2SDNtOCA1SDNtOCA1SDMiIG9wYWNpdHk9Ii41IiBzdHJva2U9IiNmZjAwNTciLz48cGF0aCBzdHJva2UtbGluZWpvaW49InJvdW5kIiBkPSJtMTUgMTZsNS01bTAgNWwtNS01IiBzdHJva2U9IiNmZjAwNTciLz48L2c+PC9zdmc+" alt="list-cross-minimalistic-line-duotone" width="48" height="48">  </header>
<h3 class="g-secondary"><br>&nbsp;&nbsp;Your "Aezeed Cipher Seed" has been deleted from the server. By removing the seed from the server and setting <strong>Wallet Auto-Unlock: DISABLED</strong>, your Bitcoin funds will be protected from being extracted if the server is compromised remotely or stolen.<br><br></h3></span>`,
      result: null,
    }
  },
)
