import { T } from '@start9labs/start-sdk'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { decodePayReq } from '../utils'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  invoice: Value.text({
    name: i18n('Invoice'),
    description: i18n('A Lightning invoice.'),
    required: true,
    default: null,
    placeholder: 'lnbc…',
  }),
})

const networks: Record<string, string> = {
  bc: 'mainnet',
  tb: 'testnet',
  tbs: 'signet',
  bcrt: 'regtest',
}

// Valid BOLT11 expiries can exceed JavaScript's calendar range.
const utc = (unix: number) => {
  const date = new Date(unix * 1000)
  return Number.isNaN(date.getTime())
    ? i18n('Beyond the supported calendar range')
    : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}

const row = (name: string, value: string, copyable = false) => ({
  name,
  description: null,
  copyable,
  qr: false,
  masked: false,
  type: 'single' as const,
  value,
  launchable: false,
})

export const decodeInvoice = sdk.Action.withInput(
  'decode-invoice',
  async ({ effects }) => ({
    name: i18n('Decode Invoice'),
    description: i18n(
      'Show what a Lightning invoice asks for before you pay it. Nothing is paid.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Payments'),
    visibility: 'enabled',
  }),
  inputSpec,
  async ({ effects }) => ({}),
  async ({ effects, input }): Promise<T.ActionResult & { version: '1' }> => {
    const invoice = input.invoice.trim()
    const decoded = await decodePayReq(effects, invoice)
    const prefix = invoice.toLowerCase().match(/^ln(bcrt|tbs|tb|bc)/)?.[1]
    const created = Number(decoded.timestamp)
    const expires = created + Number(decoded.expiry)
    const amount =
      decoded.num_msat === '0'
        ? i18n('Amountless: you enter the amount when you pay')
        : `${Number(decoded.num_msat) / 1000} sats`
    return {
      version: '1' as const,
      title: i18n('Invoice decoded'),
      message:
        expires * 1000 < Date.now()
          ? i18n('This invoice expired on ${date}. It can no longer be paid.', {
              date: utc(expires),
            })
          : i18n('Nothing has been paid. Check these details before you pay.'),
      result: {
        type: 'group' as const,
        value: [
          row(i18n('Amount'), amount),
          row(i18n('Destination'), decoded.destination, true),
          decoded.description || !decoded.description_hash
            ? {
                name: i18n('Description'),
                description: null,
                copyable: false,
                qr: false,
                masked: false,
                type: 'multiline' as const,
                value: decoded.description || '-',
                filename: null,
              }
            : row(i18n('Description hash'), decoded.description_hash, true),
          row(i18n('Created'), utc(created)),
          row(i18n('Expires'), utc(expires)),
          row(i18n('Network'), (prefix && networks[prefix]) ?? '-'),
          row(i18n('Payment hash'), decoded.payment_hash, true),
        ],
      },
    }
  },
)
