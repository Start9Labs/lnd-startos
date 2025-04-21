import { matches, types as T } from "../deps.ts";

const { shape, boolean, string } = matches;

const matchOldBitcoindConfig = shape({
  "zmq-enabled": boolean,
  rpc: shape({
    advanced: shape({
      serialversion: matches.any
    }),
  }),
  advanced: shape({
    pruning: shape({
      mode: string,
    }),
  }),
})

export const dependencies: T.ExpectedExports.dependencies = {
  bitcoind: {
    // deno-lint-ignore require-await
    async check(_effects, configInput) {
      if (matchOldBitcoindConfig.test(configInput) && configInput.advanced.pruning.mode !== "disabled") {
        return { error: 'Pruning must be disabled to use CLN with <= 24.0.1 of Bitcoin Core. To use CLN with a pruned node, update Bitcoin Core to >= 25.0.0~2.' };
      } else if (matchOldBitcoindConfig.test(configInput) && !configInput['zmq-enabled']) {
        return { error: "Must have ZeroMQ enabled" };
      } else if (matchOldBitcoindConfig.test(configInput)) {
        return { result: null }
      }
      if (!configInput["zmq-enabled"]) {
        return { error: "Must have ZeroMQ enabled" };
      }
      return { result: null };
    },
    // deno-lint-ignore require-await
    async autoConfigure(_effects, configInput) {
      if (matchOldBitcoindConfig.test(configInput)) {
        configInput.advanced.pruning.mode = "disabled"
        configInput["zmq-enabled"] = true;
        return { result: configInput }
      } else {
        configInput["zmq-enabled"] = true;
        return { result: configInput };
      }
    },
  },
};
