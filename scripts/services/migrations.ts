import { types as T, YAML, matches } from "../deps.ts"

const { shape, string, boolean } = matches

const matchWatch = shape({
    "watchtower-enabled": boolean,
    "watchtower-client-enabled": boolean
})

const matchBitcoin = shape({ bitcoind: shape({
    type: string
})})

const matchTor = shape({ tor: shape({
    "use-tor-only": boolean,
    "stream-isolation": boolean,
})})

// version here is where you are coming from ie. the version the service is currently on
export const migration: T.ExpectedExports.migration = async (effects, version) => {
    await effects.createDir({
        volumeId: "main",
        path: "start9"
    })
    const config = await effects.readFile({
        volumeId: "main",
        path: "start9/config.yaml"
    })
    const parsed = YAML.parse(config)

    if (!matchBitcoin.test(parsed)) {
        return { error: `Could not find bitcond key in config: ${matchBitcoin.errorMessage(parsed)}` }
    }

    // TODO Fix version checking when proper Emver range parsing/comparisons implemented

    if (version <= '0.14.2.1') {
        // ie. if neutrino
        if (parsed.bitcoind.type === 'none') {
            parsed.bitcoind.type = 'internal-proxy'
        }
        // handle downgrading to versions when variant names were only internal/external (ie. 0.13.3.1 and 0.13.3.2)
        if (version <= '0.13.3.2') {
            if (parsed.bitcoind.type === 'internal-proxy') {
                parsed.bitcoind.type = 'internal'
            }
        }
    }


    // handle cases prior to 0.14.2.1 when external was still an option 
    if (parsed.bitcoind.type === 'external') {
        parsed.bitcoind.type = 'internal-proxy'
    }

    await effects.writeFile({
        volumeId: "main",
        path: "start9/config.yaml",
        toWrite: YAML.stringify(parsed)
    })


    // tor was added in 0.14.2 - first case is for upgrades, second for downgrades
    if (version < '0.14.2' || version >= '0.14.2.1') {
        if (!matchTor.test(parsed)) {
            return { result: { configured: false } }
        }
    }

    // watchtower options were removed in 0.14.2
    if (version < '0.14.2') {
        if (!matchWatch.test(parsed)) {
            return { result: { configured: false } }
        }
    }

    return { result: { configured: true } }
}