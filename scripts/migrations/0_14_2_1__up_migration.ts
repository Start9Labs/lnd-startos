import { types as T, YAML, matches } from "../deps.ts"

const { shape, string, boolean } = matches

const matchWatch = shape({
    "watchtower-enabled": boolean,
    "watchtower-client-enabled": boolean
})

const matchTor = shape({
    tor: shape({
        "use-tor-only": boolean,
        "stream-isolation": boolean,
    })
})

const matchBitcoin = shape({
    bitcoind: shape({
        type: string
    })
})

export const migration_up_0_14_2_1: T.ExpectedExports.migration = async (effects, version) => {
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
    
    // ie. if neutrino
    if (parsed.bitcoind.type === 'none') {
        parsed.bitcoind.type = 'internal-proxy'
    }

    // if bitcoin is configured to internal (ie. pointer to proxy), upgrade should ensure it remains proxy. As of 0.14.2, internal means bitcoin core. 
    if (version <= '0.13.3.2') {
        if (parsed.bitcoind.type === 'internal') {
            parsed.bitcoind.type = 'internal-proxy'
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

    // tor was added in 0.14.2
    if (version < '0.14.2') {
        if (!matchTor.test(parsed)) {
            return { result: { configured: false } }
        }
        // watchtower options were removed in 0.14.2
        if (!matchWatch.test(parsed)) {
            return { result: { configured: false } }
        }
    }

    return { result: { configured: true } }

}
