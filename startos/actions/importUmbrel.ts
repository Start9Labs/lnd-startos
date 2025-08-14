import { sdk } from '../sdk'
import { storeJson } from '../fileModels/store.json'
import {
  InputSpec,
  Value,
} from '@start9labs/start-sdk/base/lib/actions/input/builder'

const importUmbrelSpec = InputSpec.of({
  'umbrel-host': Value.text({
    name: 'Umbrel IP Address',
    description:
      'The IP Address for your Umbrel. You can find this by running the command `ping umbrel.local` while connected to your LAN.',
    default: null,
    required: true,
    placeholder: '192.168.1.9',
  }),
  'umbrel-password': Value.text({
    name: 'Umbrel Password',
    description:
      'The password you use to log into your Umbrel dashboard or SSH',
    default: null,
    required: true,
    placeholder: 'password',
  }),
})

export const importUmbrel = sdk.Action.withInput(
  // id
  'import-umbrel',

  // metadata
  async ({ effects }) => ({
    name: 'Import from Umbrel (1.x)',
    description: 'Imports wallet and channel data from Umbrel 1.x',
    warning:
      'Warning!!! After running this action, be sure to NEVER re-start your Umbrel with the same LND seed! You should never run two different lnd nodes with the same seed! This will lead to strange/unpredictable behavior or even loss of funds.',
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: (await storeJson
      .read((e) => e.walletInitialized)
      .const(effects))
      ? { disabled: 'Cannot import over an existing LND wallet' }
      : 'enabled',
  }),

  importUmbrelSpec,

  // optionally pre-fill the input form
  async ({ effects }) => {},

  // execution function
  async ({ effects, input }) => {
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      sdk.Mounts.of().mountAssets({ subpath: null, mountpoint: '/scripts' }),
      'import-umbrel',
      async (subc) => {
        return await subc.exec(['sh', '/scripts/import-umbrel.sh'], {
          env: {
            UMBREL_HOST: input['umbrel-host'],
            UMBREL_PASS: input['umbrel-password'],
          },
        })
      },
    )
    if (res.exitCode === 0) {
      await storeJson.merge(effects, {
        walletInitialized: true,
        walletPassword: 'moneyprintergobrrr',
      })
      return {
        version: '1',
        title: 'Success',
        message:
          'Successfully Imported Umbrel Data. WARNING!!! With the Migration of LND complete, be sure to NEVER re-start your Umbrel using the same LND seed! You should never run two different lnd nodes with the same seed! This will lead to strange/unpredictable behavior or even loss of funds.',
        result: null,
      }
    }

    return {
      version: '1',
      title: 'Failure',
      message: `Failed to import LND from Umbrel: ${res}`,
      result: null,
    }
  },
)
