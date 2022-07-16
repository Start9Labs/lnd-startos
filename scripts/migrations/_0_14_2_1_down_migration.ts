import { types as T, YAML, matches } from "../deps.ts"

const { shape, boolean } = matches

const matchTor = shape({
    tor: shape({
        "use-tor-only": boolean,
        "stream-isolation": boolean,
    })
})

export const migration_down_0_14_2_1: T.ExpectedExports.migration = async (effects, _version) => {
    await effects.createDir({
        volumeId: "main",
        path: "start9"
    })
    const config = await effects.readFile({
        volumeId: "main",
        path: "start9/config.yaml"
    })
    const parsed = YAML.parse(config)

    // tor was added in 0.14.2 
    if (!matchTor.test(parsed)) {
        return { result: { configured: false } }
    }

    return { result: { configured: true } }

}
