import { compat, exists, matches, types as T, YAML } from "../deps.ts";
import { lazy } from "../models/lazy.ts";
const { shape, string, number, boolean } = matches;

const nodeInfoMatcher = shape({
  identity_pubkey: string,
  alias: string,
  block_height: number,
  synced_to_chain: boolean,
  synced_to_graph: boolean,
});

const noPropertiesFound: T.ResultType<T.Properties> = {
  result: {
    version: 2,
    data: {
      "Not Ready": {
        type: "string",
        value: "Could not find properties. The service might still be starting",
        qr: false,
        copyable: false,
        masked: false,
        description: "Fallback message for when properties cannot be found",
      },
    },
  },
} as const;

const wrongShape = (wrongValue: unknown): T.ResultType<T.Properties> =>
  ({
    result: {
      version: 2,
      data: {
        "Wrong shape": {
          type: "string",
          value:
            `Called out to getinfo but the shape was wrong. This gives us the error ${
              nodeInfoMatcher.errorMessage(wrongValue)
            }`,
          qr: false,
          copyable: false,
          masked: false,
          description: "Fallback message for when properties cannot be found",
        },
      },
    },
  }) as const;

export const properties: T.ExpectedExports.properties = async (
  effects: T.Effects,
) => {
  if (
    await exists(effects, {
      volumeId: "main",
      path: "start9/controlTorAddress",
    }) === false
  ) {
    return noPropertiesFound;
  }
  if (
    await exists(effects, {
      volumeId: "main",
      path: "start9/peerTorAddress",
    }) === false
  ) {
    return noPropertiesFound;
  }

  const controlTorAddress = await effects
    .readFile({
      volumeId: "main",
      path: "start9/controlTorAddress",
    })
    .then((x) => x.trim());

  const peerTorAddress = await effects
    .readFile({
      volumeId: "main",
      path: "start9/peerTorAddress",
    })
    .then((x) => x.trim());

  const macaroonHex = await effects.readFile({
    volumeId: "main",
    path: "start9/admin.macaroon.hex",
  });

  const macaroonBase64URL = await effects.readFile({
    volumeId: "main",
    path: "start9/admin.macaroon.base64url",
  });

  const cert = await effects.readFile({
    volumeId: "main",
    path: "start9/control.cert.pem.base64url",
  });

  try {
    const nodeInfo = await effects.fetch(
      "https://lnd.embassy:8080/v1/getinfo",
      {
        headers: {
          "Grpc-Metadata-macaroon": macaroonHex,
        },
      },
    );

    if (!nodeInfo.ok) {
      return await compat.properties(effects);
    }

    const nodeInfoJson = await nodeInfo.json();
    if (!nodeInfoMatcher.test(nodeInfoJson)) {
      return wrongShape(nodeInfoJson);
    }

    const stats: T.Properties = {
      version: 2,
      data: {
        "LND Sync Height": {
          type: "string",
          value: String(nodeInfoJson.block_height),
          description: "The latest block height that has been processed by LND",
          copyable: false,
          qr: false,
          masked: false,
        },
        "Synced To Chain": {
          type: "string",
          value: nodeInfoJson.synced_to_chain ? "✅" : "❌",
          description:
            "Until this value is ✅, you may not be able to see transactions sent to your on chain wallet.",
          copyable: false,
          qr: false,
          masked: false,
        },
        "Synced To Graph": {
          type: "string",
          value: nodeInfoJson.synced_to_graph ? "✅" : "❌",
          description:
            "Until this value is ✅, you will experience problems sending payments over lightning.",
          copyable: false,
          qr: false,
          masked: false,
        },
        "Node Alias": {
          type: "string",
          value: nodeInfoJson.alias,
          description: "The friendly identifier for your node",
          copyable: true,
          qr: false,
          masked: false,
        },
        "Node Id": {
          type: "string",
          value: nodeInfoJson.identity_pubkey,
          description: "The node identifier that other nodes can use to connect to this node",
          copyable: true,
          qr: false,
          masked: false,
        },
        "Node URI": {
          type: "string",
          value: `${nodeInfoJson.identity_pubkey}@${peerTorAddress}:9735`,
          description:
            "Give this to others to allow them to add your LND node as a peer",
          copyable: true,
          qr: true,
          masked: false,
        },
        "LND Connect gRPC URL": {
          type: "string",
          value:
            `lndconnect://${controlTorAddress}:10009?cert=${cert}&macaroon=${macaroonBase64URL}`,
          description:
            "Use this for other applications that require a gRPC connection",
          copyable: true,
          qr: true,
          masked: true,
        },
        "LND Connect REST URL": {
          type: "string",
          value:
            `lndconnect://${controlTorAddress}:8080?cert=${cert}&macaroon=${macaroonBase64URL}`,
          description:
            "Use this for other applications that require a REST connection",
          copyable: true,
          qr: true,
          masked: true,
        },
      },
    };
    await effects.writeFile({
        path: "start9/stats.yaml",
        volumeId: "main",
        toWrite: YAML.stringify(stats),
    });
    return { result: stats };
  } catch (e) {
    effects.error("Error updating ");
    return await compat.properties(effects);
  }
};
