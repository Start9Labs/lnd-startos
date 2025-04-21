import { sdk } from '../sdk'
import { setDependencies } from '../dependencies/dependencies'
import { setInterfaces } from '../interfaces'
import { configSpec } from './spec'
import { lndConfFile } from '../file-models/lnd.conf'

export const save = sdk.setupConfigSave(
  configSpec,
  async ({ effects, input }) => {
    // const {
    //   alias,
    //   color,
    //   acceptkeysend,
    //   rejecthtlc,
    //   minchansize,
    //   maxchansize,
    //   tor: { usetoronly, streamisolation },
    //   // TODO use authcookie for rpc access
    //   autopilot,
    //   watchtowers: { wtclient, wtserver },
    //   advanced: {
    //     debuglevel,
    //     dbdboltnofreelistsync,
    //     dbboltautocompact,
    //     dbboltautocompactminage,
    //     dbboltdbtimeout,
    //     recoverywindow,
    //     paymentsexpirationgraceperiod,
    //     defaultremotemaxhtlcs,
    //     maxchannelfeeallocation,
    //     maxpendingchannels,
    //     maxcommitfeerateanchors,
    //     protocolwumbochannels,
    //     protocolzeroconf,
    //     protocoloptionscidalias,
    //     protocolnoanchors,
    //     protocoldisablescriptenforcedlease,
    //     protocolsimpletaprootchans,
    //     gccanceledinvoicesonstartup,
    //     allowcircularroute,
    //     bitcoin: {
    //       defaultchannelconfirmations,
    //       minhtlc,
    //       minhtlcout,
    //       basefee,
    //       feerate,
    //       timelockdelta,
    //     },
    //     sweeper: {
    //       sweepermaxfeerate,
    //       sweepernodeadlineconftarget,
    //       sweeperbudgettolocalratio,
    //       sweeperbudgetanchorcpfpratio,
    //       sweeperbudgetdeadlinehtlcratio,
    //       sweeperbudgetnodeadlinehtlcratio,
    //     }
    //   },
    // } = input
    let test = input['accept-keysend']

    await Promise.all([
      sdk.store.setOwn(
        effects,
        sdk.StorePath.recoveryWindow,
        recoverywindow,
      ),
    ])



    return {
      interfacesReceipt: await setInterfaces({ effects, input }), // Plumbing. DO NOT EDIT. This line causes setInterfaces() to run whenever config is saved.
      dependenciesReceipt: await setDependencies({ effects, input }), // Plumbing. DO NOT EDIT.
      restart: true, // optionally restart the service on config save.
    }
  },
)
