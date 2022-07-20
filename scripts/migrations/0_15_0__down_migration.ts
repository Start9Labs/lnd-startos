import { types as T, YAML, matches } from "../deps.ts"

const { shape, boolean } = matches

const matchAdvanced = shape({
  advanced: shape({
    "allow-circular-route": boolean,
  })
})

const matchTor = shape({
  tor: shape({
    "use-tor-only": boolean,
    "stream-isolation": boolean,
  })
})

export const migration_down_0_15_0: T.ExpectedExports.migration = async (effects, _version) => {
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

  // allow_circular_route was added in 0.15.0
  if (!matchAdvanced.test(parsed)) {
    return { result: { configured: false } }
  }
  
  return { result: { configured: true } }

}
