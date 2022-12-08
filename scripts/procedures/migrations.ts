import { compat, matches, types as T } from "../deps.ts";

export const migration: T.ExpectedExports.migration = compat.migrations
  .fromMapping(
    {
      "0.13.3.2": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches.shape({
                bitcoind: matches.shape({ type: matches.any }),
              }).test(config)
            ) {
              if ( config.bitcoind.type == "internal"){ config.bitcoind.type = "internal-proxy" }
            }
            return config;
          },
          false,
          { version: "0.13.3.2", type: "up" },
        ),
        down: compat.migrations.updateConfig(
          (config) => {
            if (
              matches.shape({
                bitcoind: matches.shape({ type: matches.any }, ["type"]),
              }).test(config)
            ) {
              config.bitcoind.type = "internal";
            }
            return config;
          },
          false,
          { version: "0.13.3.2", type: "down" },
        ),
      },
      "0.14.2": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches.shape({
                bitcoind: matches.shape({ type: matches.any }, ["type"]),
              }).test(config)
            ) {
              if ( config.bitcoind.type == "external"){ config.bitcoind.type = "internal-proxy" }
            }
            if (
              matches.shape({
                tor: matches.shape({
                  "use-tor-only": matches.any,
                  "stream-isolation": matches.any,
                }),
              }).test(config)
            ) {
              delete config.tor["use-tor-only"];
              delete config.tor["stream-isolation"];
            }
            return config;
          },
          false,
          { version: "0.14.2", type: "up" },
        ),
        down: compat.migrations.updateConfig(
          (config) => {
            if (
              matches.shape({
                tor: matches.shape({
                  "use-tor-only": matches.any,
                  "stream-isolation": matches.any,
                }),
              }).test(config)
            ) {
              delete config.tor["use-tor-only"];
              delete config.tor["stream-isolation"];
            }
            return config;
          },
          false,
          { version: "0.14.2", type: "down" },
          ),
      },
      "0.14.2.1": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches.shape({
                bitcoind: matches.shape({ type: matches.any }, ["type"]),
              }).test(config)
            ) {
              if ( config.bitcoind.type == "none"){ config.bitcoind.type = "internal-proxy" }
            }
            if (
              matches.shape({
                "watchtower-enabled": matches.any,
                "watchtower-client-enabled": matches.any,
              }).test(config)
            ) {
              delete config["watchtower-enabled"];
              delete config["watchtower-client-enabled"];
            }
            return config;
          },
          false,
          { version: "0.14.2.1", type: "up" },
        ),
        down: compat.migrations.updateConfig(
          (config) => {
            return config;
          },
          false,
          { version: "0.14.2.1", type: "down" },
        ),
      },
      "0.15.0": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches.shape({
                watchtowers: matches.shape({
                  "wt-server": matches.any,
                  "wt-client": matches.any,
                  "add-watchtowers": matches.any
                })
              }).test(config)
            ) {
              delete config.watchtowers["wt-server"];
              delete config.watchtowers["wt-client"];
              delete config.watchtowers["add-watchtowers"];
            }
            return config;
          },
          false,
          { version: "0.15.0", type: "up" },
        ),
        down: () => { throw new Error('Cannot downgrade') },
      },
    },
    "0.15.4.1",
  );
