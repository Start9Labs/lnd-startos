import { compat, types as T } from "../deps.ts";
import { matchRoot, Root } from "../models/setConfig.ts";

type Check = {
  currentError(config: Root): string | void;
};
const configRules: Array<Check> = [
  {
    currentError(config) {
      if (
        !(!config["max-chan-size"] || !config["min-chan-size"] ||
          config["max-chan-size"] > config["min-chan-size"])
      ) {
        return "Maximum Channel Size must exceed Minimum Channel Size";
      }
    },
  },
  {
    currentError(config) {
      if (!(!config.tor["stream-isolation"] || !!config.tor["use-tor-only"])) {
        return "'Tor Config > Use Tor Only' must be enabled to enable 'Tor Config > Stream Isolation'";
      }
    },
  },
];

function checkConfigRules(config: Root): T.KnownError | void {
  for (const checker of configRules) {
    const error = checker.currentError(config);
    if (error) {
      return { error: error };
    }
  }
}

export const setConfig: T.ExpectedExports.setConfig = async (
  effects: T.Effects,
  input: T.Config,
) => {
  const config = matchRoot.unsafeCast(input);
  const error = checkConfigRules(config);
  if (error) return error;
  const dependsOn: { [key: string]: string[] } =
    config.bitcoind.type === "internal"
      ? { "bitcoind": [] }
      : {};
  return await compat.setConfig(effects, input, dependsOn);
};
