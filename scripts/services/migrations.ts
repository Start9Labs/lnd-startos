import { compat, matches, types as T } from "../deps.ts";

export const migration: T.ExpectedExports.migration =
  compat.migrations.fromMapping(
    {
      "0.13.3.2": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  bitcoind: matches.shape({ type: matches.any }),
                })
                .test(config)
            ) {
              if (config.bitcoind.type == "internal") {
                config.bitcoind.type = "internal-proxy";
              }
            }
            return config;
          },
          false,
          { version: "0.13.3.2", type: "up" }
        ),
        down: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  bitcoind: matches.shape({ type: matches.any }, ["type"]),
                })
                .test(config)
            ) {
              config.bitcoind.type = "internal";
            }
            return config;
          },
          false,
          { version: "0.13.3.2", type: "down" }
        ),
      },
      "0.14.2": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  bitcoind: matches.shape({ type: matches.any }, ["type"]),
                })
                .test(config)
            ) {
              if (config.bitcoind.type == "external") {
                config.bitcoind.type = "internal-proxy";
              }
            }
            if (
              matches
                .shape({
                  tor: matches.shape({
                    "use-tor-only": matches.any,
                    "stream-isolation": matches.any,
                  }),
                })
                .test(config)
            ) {
              delete config.tor["use-tor-only"];
              delete config.tor["stream-isolation"];
            }
            return config;
          },
          false,
          { version: "0.14.2", type: "up" }
        ),
        down: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  tor: matches.shape({
                    "use-tor-only": matches.any,
                    "stream-isolation": matches.any,
                  }),
                })
                .test(config)
            ) {
              delete config.tor["use-tor-only"];
              delete config.tor["stream-isolation"];
            }
            return config;
          },
          false,
          { version: "0.14.2", type: "down" }
        ),
      },
      "0.14.2.1": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  bitcoind: matches.shape({ type: matches.any }, ["type"]),
                })
                .test(config)
            ) {
              if (config.bitcoind.type == "none") {
                config.bitcoind.type = "internal-proxy";
              }
            }
            if (
              matches
                .shape({
                  "watchtower-enabled": matches.any,
                  "watchtower-client-enabled": matches.any,
                })
                .test(config)
            ) {
              delete config["watchtower-enabled"];
              delete config["watchtower-client-enabled"];
            }
            return config;
          },
          false,
          { version: "0.14.2.1", type: "up" }
        ),
        down: compat.migrations.updateConfig(
          (config) => {
            return config;
          },
          false,
          { version: "0.14.2.1", type: "down" }
        ),
      },
      "0.15.0": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  watchtowers: matches.shape({
                    "wt-server": matches.any,
                    "wt-client": matches.any,
                    "add-watchtowers": matches.any,
                  }),
                })
                .test(config)
            ) {
              delete config.watchtowers["wt-server"];
              delete config.watchtowers["wt-client"];
              delete config.watchtowers["add-watchtowers"];
            }
            return config;
          },
          false,
          { version: "0.15.0", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.16.4": {
        up: compat.migrations.updateConfig(
          (config: any) => {
            if (config.bitcoind.type === "internal-proxy")
              config.bitcoind.type = "internal";
            return config;
          },
          true,
          { version: "0.16.4", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.17.0": {
        up: compat.migrations.updateConfig(
          (config) => {
            return config;
          },
          true,
          { version: "0.17.0", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.17.0.2": {
        up: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  watchtowers: matches.shape({
                    "wt-server": matches.any,
                    "wt-client": matches.any,
                    "add-watchtowers": matches.any,
                  }),
                })
                .test(config)
            ) {
              let existing_watchtowers = config.watchtowers["add-watchtowers"];
              let server_enabled = config.watchtowers["wt-server"];

              delete config.watchtowers["add-watchtowers"];

              if (existing_watchtowers.length >= 1) {
                config.watchtowers["wt-server"] = server_enabled;
                config.watchtowers["wt-client"] = {
                  enabled: "enabled",
                  "add-watchtowers": existing_watchtowers,
                };
              } else {
                config.watchtowers["wt-server"] = server_enabled;
                config.watchtowers["wt-client"] = {
                  enabled: "disabled",
                };
              }
            }
            return config;
          },
          true,
          { version: "0.17.0.2", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.17.3": {
        up: compat.migrations.updateConfig(
          (config: any) => {
            if (config.advanced["max-commit-fee-rate-anchors"] == 10) {
              config.advanced["max-commit-fee-rate-anchors"] = 100;
            }
            config.advanced["max-pending-channels"] = 5;
            return config;
          },
          true,
          { version: "0.17.3", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.18.0.1": {
        up: compat.migrations.updateConfig(
          (config: any) => {
            config.advanced["protocol-zero-conf"] = false;
            config.advanced["protocol-option-scid-alias"] = false;
            config.advanced["protocol-simple-taproot-chans"] = false;
            config.advanced.sweeper = {
              "sweeper-maxfeerate": 1000,
              "sweeper-nodeadlineconftarget": 1008,
              "sweeper-budget-tolocalratio": 0.5,
              "sweeper-budget-anchorcpfpratio": 0.5,
              "sweeper-budget-deadlinehtlcratio": 0.5,
              "sweeper-budget-nodeadlinehtlcratio": 0.5,
            };
            return config;
          },
          true,
          { version: "0.18.0.1", type: "up" }
        ),
        down: compat.migrations.updateConfig(
          (config) => {
            if (
              matches
                .shape({
                  advanced: matches.shape({
                    "protocol-zero-conf": matches.any,
                    "protocol-option-scid-alias": matches.any,
                    "protocol-simple-taproot-chans": matches.any,
                    sweeper: matches.any,
                  }),
                })
                .test(config)
            ) {
              delete config.advanced["protocol-zero-conf"];
              delete config.advanced["protocol-option-scid-alias"];
              delete config.advanced["protocol-simple-taproot-chans"];
              delete config.advanced.sweeper;
            }
            return config;
          },
          true,
          { version: "0.18.0.1", type: "down" }
        ),
      },
      "0.19.0": {
        up: compat.migrations.updateConfig(
          (config) => {
            return config;
          },
          true,
          { version: "0.19.0", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.19.1": {
        up: compat.migrations.updateConfig(
          (config) => {
            return config;
          },
          true,
          { version: "0.19.1", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.19.2": {
        up: compat.migrations.updateConfig(
          (config) => {
            return config;
          },
          true,
          { version: "0.19.2", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
      "0.19.3": {
        up: compat.migrations.updateConfig(
          (config) => {
            return config;
          },
          true,
          { version: "0.19.3", type: "up" }
        ),
        down: () => {
          throw new Error("Cannot downgrade");
        },
      },
    },
    "0.20.1"
  );
