import { i18n } from '../../i18n'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'
import { sdk } from '../../sdk'
import { T } from '@start9labs/start-sdk'

const { InputSpec, Value } = sdk

export const setExternalGateway = sdk.Action.withInput(
  // id
  'set-external-gateway',

  // metadata
  async ({ effects }) => ({
    name: i18n('Set External IP'),
    description: i18n('Optionally advertise your IP address to the network'),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  }),

  // form input specification
  InputSpec.of({
    externalGateway: Value.dynamicSelect(async ({ effects }) => {
      const peerInterface = await sdk.serviceInterface
        .getOwn(effects, 'peer')
        .const()

      let privateHostnameInfos = (peerInterface?.addressInfo?.public
        .filter({
          kind: 'ip',
        })
        .format('hostname-info') || []) as (T.HostnameInfo & { kind: 'ip' })[]

      return {
        name: i18n('Select Gateway'),
        default: 'none',
        values: privateHostnameInfos.reduce(
          (obj, curr) => {
            return {
              ...obj,
              [curr.gateway.id]:
                `${curr.gateway.name} (${curr.hostname.value})`,
            }
          },
          { none: i18n('None') } as Record<string, string>,
        ),
      }
    }),
  }),

  // optionally pre-fill the input form
  async ({ effects }) => ({
    externalGateway:
      (await storeJson.read((s) => s.externalGateway).once()) || 'none',
  }),

  // the execution function
  async ({ effects, input }) => {
    if (input.externalGateway === 'none') {
      await lndConfFile.merge(effects, { externalip: undefined })
    }

    await storeJson.merge(effects, {
      externalGateway:
        input.externalGateway === 'none' ? null : input.externalGateway,
    })
  },
)
