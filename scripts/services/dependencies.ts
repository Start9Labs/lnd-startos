import { matches, types as T } from "../deps.ts";

const { shape, boolean } = matches;

const matchBitcoindConfig = shape({
  "zmq-enabled": boolean,
});

export const dependencies: T.ExpectedExports.dependencies = {
  bitcoind: {
    // deno-lint-ignore require-await
    async check(_effects, configInput) {
      const config = matchBitcoindConfig.unsafeCast(configInput);
      if (!config["zmq-enabled"]) {
        return { error: "Must have ZeroMQ enabled" };
      }
      return { result: null };
    },
    // deno-lint-ignore require-await
    async autoConfigure(_effects, configInput) {
      const config = matchBitcoindConfig.unsafeCast(configInput);
      config["zmq-enabled"] = true;
      return { result: config };
    },
  },
};
