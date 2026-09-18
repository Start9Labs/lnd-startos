import { T } from '@start9labs/start-sdk'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { literal, mainMounts, selfGrpcHost } from '../utils'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  amount: Value.number({
    name: i18n('Amount'),
    description: i18n('Leave empty to let the payer choose the amount.'),
    required: false,
    default: null,
    min: 1,
    integer: true,
    units: 'sats',
    placeholder: null,
  }),
  description: Value.text({
    name: i18n('Description'),
    description: i18n('Shown to the payer in their wallet.'),
    required: false,
    default: null,
    placeholder: null,
  }),
  expiry: Value.number({
    name: i18n('Expires in'),
    description: null,
    required: true,
    default: 24,
    min: 1,
    integer: true,
    units: 'hours',
    placeholder: null,
  }),
})

export const receivePayment = sdk.Action.withInput(
  'receive-payment',
  async ({ effects }) => ({
    name: i18n('Receive Payment'),
    description: i18n('Create a Lightning invoice for this node to be paid.'),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Payments'),
    visibility: 'enabled',
  }),
  inputSpec,
  async ({ effects }) => ({}),
  async ({ effects, input }): Promise<T.ActionResult & { version: '1' }> => {
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'receive-payment',
      (subc) =>
        subc.exec([
          'lncli',
          `--rpcserver=${selfGrpcHost}`,
          'addinvoice',
          '--private',
          '--expiry',
          String(input.expiry * 3600),
          ...(input.amount ? ['--amt', String(input.amount)] : []),
          ...(input.description ? ['--memo', input.description] : []),
        ]),
    )
    if (res.exitCode !== 0 || typeof res.stdout !== 'string') {
      throw new Error(
        i18n('The invoice could not be created: ${error}', {
          error: literal(String(res.stderr).trim()),
        }),
      )
    }
    const created: { r_hash: string; payment_request: string } = JSON.parse(
      res.stdout,
    )
    return {
      version: '1' as const,
      title: i18n('Invoice created'),
      message: i18n('Payable for ${hours} hours.', {
        hours: String(input.expiry),
      }),
      result: {
        type: 'group' as const,
        value: [
          {
            name: i18n('Invoice'),
            description: null,
            copyable: true,
            qr: true,
            masked: false,
            type: 'single' as const,
            value: created.payment_request,
          },
          {
            name: i18n('Amount'),
            description: null,
            copyable: false,
            qr: false,
            masked: false,
            type: 'single' as const,
            value: input.amount ? `${input.amount} sats` : i18n('Any amount'),
          },
          {
            name: i18n('Description'),
            description: null,
            copyable: false,
            qr: false,
            masked: false,
            type: 'single' as const,
            value: input.description || '-',
          },
          {
            name: i18n('Payment hash'),
            description: null,
            copyable: true,
            qr: false,
            masked: false,
            type: 'single' as const,
            value: created.r_hash,
          },
        ],
      },
    }
  },
)
