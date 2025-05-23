import { lndConfFile } from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'
import { lndConfDefaults } from '../../utils'

const { InputSpec, Value } = sdk

const {
  'db.bolt.nofreelistsync': dbBoltNofreelistsync,
  'db.bolt.auto-compact': dbBoltAutoCompact,
  'db.bolt.auto-compact-min-age': dbBoltAutoCompactMinAge,
  'db.bolt.dbtimeout': dbBoltDbtimeout,
} = lndConfDefaults

const dbBoltSpec = InputSpec.of({
  'db-bolt-nofreelistsync': Value.toggle({
    name: 'Disallow Bolt DB Freelist Sync',
    default: dbBoltNofreelistsync,
    description:
      'If true, prevents the database from syncing its freelist to disk. ',
  }),
  'db-bolt-auto-compact': Value.toggle({
    name: 'Compact Database on Startup',
    default: dbBoltAutoCompact,
    description:
      'Performs database compaction on startup. This is necessary to keep disk usage down over time at the cost of having longer startup times. ',
  }),
  'db-bolt-auto-compact-min-age': Value.number({
    name: 'Minimum Autocompaction Age for Bolt DB',
    description:
      'How long ago (in hours) the last compaction of a database file must be for it to be considered for auto compaction again. Can be set to 0 to compact on every startup. ',
    default: parseInt(dbBoltAutoCompactMinAge.split('h')[0]),
    required: true,
    min: 0,
    integer: true,
    units: 'hours',
  }),
  'db-bolt-dbtimeout': Value.number({
    name: 'Bolt DB Timeout',
    description:
      'How long should LND try to open the database before giving up?',
    default: parseInt(dbBoltDbtimeout.split('s')[0]),
    required: true,
    min: 0,
    max: 86400,
    integer: true,
    units: 'seconds',
  }),
})

export const dbBoltConfig = sdk.Action.withInput(
  // id
  'db-bolt-config',

  // metadata
  async ({ effects }) => ({
    name: 'DB Bolt Settings',
    description: 'Edit the DB Bolt settings in lnd.conf',
    warning: null,
    allowedStatuses: 'any',
    group: 'Configuration',
    visibility: 'enabled',
  }),

  // form input specification
  dbBoltSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any) {
  const lndConf = (await lndConfFile.read().const(effects))!

  const dbBoltSettings: PartialDbBoltSpec = {
    'db-bolt-nofreelistsync': lndConf['db.bolt.nofreelistsync'],
    'db-bolt-auto-compact': lndConf['db.bolt.auto-compact'],
    'db-bolt-auto-compact-min-age': lndConf[
      'db.bolt.auto-compact-min-age'
    ]?.split('h')[0]
      ? parseInt(lndConf['db.bolt.auto-compact-min-age']?.split('h')[0])
      : parseInt(lndConfDefaults['db.bolt.auto-compact-min-age'].split('h')[0]),
    'db-bolt-dbtimeout': lndConf['db.bolt.dbtimeout']?.split('s')[0]
      ? parseInt(lndConf['db.bolt.dbtimeout']?.split('s')[0])
      : parseInt(lndConfDefaults['db.bolt.dbtimeout'].split('s')[0]),
  }
  return dbBoltSettings
}

async function write(effects: any, input: DbBoltSpec) {
  const dbBoltSettings = {
    'db.bolt.nofreelistsync': input['db-bolt-nofreelistsync'],
    'db.bolt.auto-compact': input['db-bolt-auto-compact'],
    'db.bolt.auto-compact-min-age': `${input['db-bolt-auto-compact-min-age']}h`,
    'db.bolt.dbtimeout': `${input['db-bolt-dbtimeout']}s`,
  }

  await lndConfFile.merge(effects, dbBoltSettings)
}

type DbBoltSpec = typeof dbBoltSpec._TYPE
type PartialDbBoltSpec = typeof dbBoltSpec._PARTIAL
