import { Effects, Config, YAML, matches, KnownError, ExpectedExports, SetResult } from "../deps.ts";
import { matchRoot, Root } from "../models/setConfig.ts";

const { string, boolean, shape, number } = matches;

const regexUrl = /^(\w+:\/\/)?(.*?)(:\d{0,4})?$/m;
type Check = {
  currentError(config: Root): string | void;
};
const configRules: Array<Check> = [
  {
    currentError(config) {
      if (!(!config["max-chan-size"] || !config['min-chan-size'] || config['max-chan-size'] > config['min-chan-size'])) {
        return 'Maximum Channel Size must exceed Minimum Channel Size'
      }
    },
  },
  {
    currentError(config) {
      if (!(!config.tor["stream-isolation"] || !!config.tor["use-tor-only"])) {
        return "'Tor Config > Use Tor Only' must be enabled to enable 'Tor Config > Stream Isolation'"
      }
    },
  },
];

function checkConfigRules(config: Root): KnownError | void {
  for (const checker of configRules) {
    const error = checker.currentError(config);
    if (error) {
      return { error: error };
    }
  }
}

export const setConfig: ExpectedExports.setConfig = async (effects: Effects, input: Config) => {
  const config = matchRoot.unsafeCast(input);
  const error = checkConfigRules(config);
  if (error) return error;
  await effects.createDir({
    path: "start9",
    volumeId: "main",
  });
  await effects.writeFile({
    path: "start9/config.yaml",
    toWrite: YAML.stringify(input),
    volumeId: "main",
  });

  const dependsOn: { [key: string]: string[] } = config.bitcoind.type === 'internal' || config.bitcoind.type === 'internal-proxy' ? { 'bitcoind': [] } : {}

  const result: SetResult = {
    signal: "SIGTERM",
    "depends-on": {
      ...dependsOn
    },
  }
  return { result };
}
