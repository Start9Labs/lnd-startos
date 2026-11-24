import { T } from '@start9labs/start-sdk'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  DecodedPayReq,
  decodePayReq,
  literal,
  mainMounts,
  selfGrpcHost,
} from '../utils'

const { InputSpec, Value, Variants } = sdk

const defaultFeePercent = 1

type ReviewedInvoice = { invoice: string; decoded: DecodedPayReq }
const reviewedInvoices = new Map<string, ReviewedInvoice>()

const inputSpec = async ({
  effects,
  prefill,
}: {
  effects: T.Effects
  prefill: unknown | null
}) => {
  // The UI merges a task's prefill over the form, so a task may set these only to their defaults.
  const preset = prefill as {
    invoice?: unknown
    amount?: { selection?: unknown; value?: object }
    'max-fee-percent'?: unknown
    confirmed?: unknown
  } | null
  if (
    (preset?.amount !== undefined &&
      (preset.amount?.selection !== 'invoice' ||
        Object.keys(preset.amount.value ?? {}).length)) ||
    (preset?.['max-fee-percent'] ?? defaultFeePercent) !== defaultFeePercent ||
    (preset?.confirmed ?? false) !== false
  ) {
    throw new Error(
      i18n(
        'This request presets the amount, fee or confirmation, which only you may set. Run Pay Invoice yourself with its invoice instead.',
      ),
    )
  }
  const invoice =
    typeof preset?.invoice === 'string' ? preset.invoice.trim() : null
  const decoded = invoice ? await decodePayReq(effects, invoice) : null
  if (invoice && decoded && effects.eventId) {
    reviewedInvoices.set(effects.eventId, { invoice, decoded })
  }
  const description = decoded
    ? decoded.num_satoshis === '0'
      ? i18n('Amountless invoice to ${destination}; enter the amount below.', {
          destination: decoded.destination,
        })
      : i18n('Invoice details: ${amount} sats to ${destination}.', {
          amount: decoded.num_satoshis,
          destination: decoded.destination,
        })
    : i18n('A Lightning invoice.')

  return InputSpec.of({
    invoice: Value.text({
      name: i18n('Invoice'),
      description,
      required: true,
      default: null,
      placeholder: 'lnbc…',
      immutable: true,
    }),
    amount: Value.union({
      name: i18n('Amount'),
      description: i18n(
        '- As stated in the invoice: pay the amount the invoice states. Most invoices state one.\n- Enter an amount: only for an invoice that leaves the amount open.',
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
      default: defaultFeePercent,
      min: 0,
      max: 100,
      step: 0.1,
      integer: false,
      units: '%',
      placeholder: null,
    }),
    confirmed: Value.toggle({
      name: i18n('I verified the amount and destination'),
      description: i18n(
        'Check them first with Decode Invoice. Lightning payments cannot be reversed.',
      ),
      default: false,
    }),
  })
}

type PaymentUpdate = {
  status?: 'UNKNOWN' | 'IN_FLIGHT' | 'SUCCEEDED' | 'FAILED' | 'INITIATED'
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
    if (!input.confirmed) {
      throw new Error(
        i18n(
          'Confirm these details before sending. Lightning payments cannot be reversed.',
        ),
      )
    }
    const invoice = input.invoice.trim()
    const reviewed = effects.eventId
      ? reviewedInvoices.get(effects.eventId)
      : undefined
    if (effects.eventId) reviewedInvoices.delete(effects.eventId)
    if (reviewed && reviewed.invoice !== invoice) {
      throw new Error(
        i18n(
          'The invoice changed after review. Reopen the action and verify its details.',
        ),
      )
    }
    const decoded = reviewed?.decoded ?? (await decodePayReq(effects, invoice))
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
    const lncli = ['lncli', `--rpcserver=${selfGrpcHost}`]
    return sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'pay-invoice',
      async (subc) => {
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
            invoice,
          ],
          { timeout: 90_000 },
        )
        const lastUpdate = (stdout: unknown) =>
          (jsonObjects(String(stdout)) as PaymentUpdate[]).at(-1)
        let final = lastUpdate(payRes.stdout)
        if (payRes.exitCode !== 0 || final?.status !== 'SUCCEEDED') {
          // A timed-out or failed attempt can leave an HTLC in flight that still settles.
          const tracked = lastUpdate(
            (
              await subc.exec(
                [...lncli, 'trackpayment', '--json', decoded.payment_hash],
                { timeout: 15_000 },
              )
            ).stdout,
          )
          if (tracked?.status === 'SUCCEEDED') {
            final = tracked
          } else if (
            tracked?.status === 'FAILED' ||
            (tracked === undefined && payRes.exitCode !== null)
          ) {
            throw new Error(
              i18n('Payment failed: ${reason}', {
                reason: literal(
                  (tracked ?? final)?.failure_reason?.replace(
                    /^FAILURE_REASON_/,
                    '',
                  ) ||
                    String(payRes.stderr).trim() ||
                    'unknown',
                ),
              }),
            )
          } else {
            return {
              version: '1' as const,
              title: i18n('Payment pending'),
              message: i18n(
                'LND is still trying to deliver ${amount} sats to ${destination}, and the payment can still complete. Do not pay a replacement invoice. Run Pay Invoice again with the same invoice to see its final result.',
                {
                  amount: String(amountSats),
                  destination: decoded.destination,
                },
              ),
              result: {
                type: 'single' as const,
                name: i18n('Payment hash'),
                description: null,
                copyable: true,
                qr: false,
                masked: false,
                value: decoded.payment_hash,
                launchable: false,
              },
            }
          }
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
                launchable: false,
              },
              {
                name: i18n('Fee'),
                description: null,
                copyable: false,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: `${final.fee_sat ?? '0'} sats`,
                launchable: false,
              },
              {
                name: i18n('Description'),
                description: null,
                copyable: false,
                qr: false,
                masked: false,
                type: 'multiline' as const,
                value: decoded.description || '-',
                filename: null,
              },
              {
                name: i18n('Destination'),
                description: null,
                copyable: true,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: decoded.destination,
                launchable: false,
              },
              {
                name: i18n('Preimage'),
                description: null,
                copyable: true,
                qr: false,
                masked: false,
                type: 'single' as const,
                value: final.payment_preimage ?? '',
                launchable: false,
              },
            ],
          },
        }
      },
    )
  },
)
