import { T } from '@start9labs/start-sdk'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { literal, mainMounts, selfGrpcHost } from '../utils'

const { InputSpec, Value, Variants } = sdk

const inputSpec = InputSpec.of({
  invoice: Value.text({
    name: i18n('Invoice'),
    description: i18n('A Lightning invoice.'),
    required: true,
    default: null,
    placeholder: 'lnbc…',
  }),
  amount: Value.union({
    name: i18n('Amount'),
    description: i18n(
      'Most invoices state their amount; enter one only when the invoice leaves it open.',
    ),
    default: 'invoice',
    variants: Variants.of({
      invoice: {
        name: i18n('As stated in the invoice'),
        spec: InputSpec.of({}),
      },
      custom: {
        name: i18n('Enter an amount'),
        spec: InputSpec.of({
          sats: Value.number({
            name: i18n('Amount to pay'),
            description: null,
            required: true,
            default: null,
            min: 1,
            integer: true,
            units: 'sats',
            placeholder: null,
          }),
        }),
      },
    }),
  }),
  'max-fee-percent': Value.number({
    name: i18n('Maximum fee'),
    description: i18n(
      'The most this node may pay in routing fees, as a percentage of the amount.',
    ),
    required: true,
    default: 1,
    min: 0,
    max: 100,
    step: 0.1,
    integer: false,
    units: '%',
    placeholder: null,
  }),
})

type DecodedPayReq = {
  destination: string
  num_satoshis: string
  description: string
}

type PaymentUpdate = {
  status?: 'IN_FLIGHT' | 'SUCCEEDED' | 'FAILED'
  failure_reason?: string
  payment_preimage?: string
  value_sat?: string
  fee_sat?: string
}

// `payinvoice --json` prints each update as its own pretty-printed object, back to back, then a `[lncli] …` line.
function jsonObjects(text: string): unknown[] {
  const out: unknown[] = []
  let depth = 0
  let start = -1
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') {
      if (depth++ === 0) start = i
    } else if (c === '}' && --depth === 0) {
      out.push(JSON.parse(text.slice(start, i + 1)))
    }
  }
  return out
}

export const payInvoice = sdk.Action.withInput(
  'pay-invoice',
  async ({ effects }) => ({
    name: i18n('Pay Invoice'),
    description: i18n('Pay a Lightning invoice from this node.'),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Payments'),
    visibility: 'enabled',
  }),
  inputSpec,
  async ({ effects }) => ({}),
  async ({ effects, input }): Promise<T.ActionResult & { version: '1' }> => {
    const lncli = ['lncli', `--rpcserver=${selfGrpcHost}`]
    return sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'pay-invoice',
      async (subc) => {
        const decodeRes = await subc.exec([
          ...lncli,
          'decodepayreq',
          input.invoice.trim(),
        ])
        if (decodeRes.exitCode !== 0 || typeof decodeRes.stdout !== 'string') {
          throw new Error(
            i18n('The invoice could not be decoded: ${error}', {
              error: literal(String(decodeRes.stderr).trim()),
            }),
          )
        }
        const decoded: DecodedPayReq = JSON.parse(decodeRes.stdout)
        const entered =
          input.amount.selection === 'custom' ? input.amount.value.sats : null
        if (decoded.num_satoshis === '0' && entered === null) {
          throw new Error(
            i18n('This invoice carries no amount; select "Enter an amount".'),
          )
        }
        if (decoded.num_satoshis !== '0' && entered !== null) {
          throw new Error(
            i18n(
              'This invoice already carries an amount of ${amount} sats; select "As stated in the invoice".',
              { amount: decoded.num_satoshis },
            ),
          )
        }
        const amountSats = entered ?? Number(decoded.num_satoshis)
        const payRes = await subc.exec(
          [
            ...lncli,
            'payinvoice',
            '--force',
            '--json',
            '--timeout',
            '60s',
            '--fee_limit',
            String(Math.ceil((amountSats * input['max-fee-percent']) / 100)),
            ...(entered === null ? [] : ['--amt', String(entered)]),
            '--pay_req',
            input.invoice.trim(),
          ],
          {},
          90_000,
        )
        const updates = jsonObjects(String(payRes.stdout)) as PaymentUpdate[]
        const final = updates[updates.length - 1]
        if (payRes.exitCode !== 0 || final?.status !== 'SUCCEEDED') {
          throw new Error(
            i18n('Payment failed: ${reason}', {
              reason: literal(
                final?.failure_reason?.replace(/^FAILURE_REASON_/, '') ||
                  String(payRes.stderr).trim() ||
                  'unknown',
              ),
            }),
          )
        }
        return {
          version: '1' as const,
          title: i18n('Payment sent'),
          message: i18n('Paid ${amount} sats to ${destination}.', {
            amount: final.value_sat ?? String(entered ?? decoded.num_satoshis),
            destination: decoded.destination,
          }),
          result: {
            type: 'group' as const,
            value: [
              {
                name: i18n('Amount'),
                description: null,
                copyable: false,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: `${final.value_sat ?? ''} sats`,
              },
              {
                name: i18n('Fee'),
                description: null,
                copyable: false,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: `${final.fee_sat ?? '0'} sats`,
              },
              {
                name: i18n('Description'),
                description: null,
                copyable: false,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: decoded.description || '-',
              },
              {
                name: i18n('Destination'),
                description: null,
                copyable: true,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: decoded.destination,
              },
              {
                name: i18n('Preimage'),
                description: null,
                copyable: true,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: final.payment_preimage ?? '',
              },
            ],
          },
        }
      },
    )
  },
)
