import { compat, matches, types as T, util, YAML } from "../deps.ts";
const { shape, string, number, boolean } = matches;
// import * as fs from "fs";
const fs = require("fs");

const file_path = "/root/.lnd/CipherSeedMnemonic.txt";
const cipherSeedMnemonic: string = fs.readFileSync(file_path, 'utf-8')
const nodeInfoMatcher = shape({
  identity_pubkey: string,
  alias: string,
  block_height: number,
  synced_to_chain: boolean,
  synced_to_graph: boolean,
});
const noPropertiesFound = {
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
          value: `Called out to getinfo but the shape was wrong. This gives us the error ${nodeInfoMatcher.errorMessage(
            wrongValue
          )}`,
          qr: false,
          copyable: false,
          masked: false,
          description: "Fallback message for when properties cannot be found",
        },
      },
    },
  } as const);

export const properties: T.ExpectedExports.properties = async (
  effects: T.Effects
) => {
  const paths = ["start9/controlTorAddress", "start9/peerTorAddress"];
  // const paths = ["start9/controlTorAddress", "start9/peerTorAddress", "start9/"];
  const exists = async (path: string): Promise<boolean> =>
    await util.exists(effects, { volumeId: "main", path });
  if (!(await Promise.all(paths.map(exists))).every((v) => v))
    return noPropertiesFound;

  const [
    controlTorAddress,
    peerTorAddress,
    // cipherSeedMnemonic,
    macaroonHex,
    macaroonBase64URL,
    cert,
  ] = await Promise.all([
    ...paths.map(async (path) =>
      (await effects.readFile({ volumeId: "main", path })).trim()
    ),
    effects.readFile({ volumeId: "main", path: "start9/admin.macaroon.hex" }),
    effects.readFile({
      volumeId: "main",
      path: "start9/admin.macaroon.base64url",
    }),
    effects.readFile({
      volumeId: "main",
      path: "start9/control.cert.pem.base64url",
    }),
    // effects.readFile({
    //   volumeId: "main",
    //   path: "start9/CipherSeedMnemonic.txt",
    // }),
  ]);

  try {
    const nodeInfo = await effects.fetch(
      "https://lnd.embassy:8080/v1/getinfo",
      { headers: { "Grpc-Metadata-macaroon": macaroonHex } }
    );
    if (!nodeInfo.ok) return await compat.properties(effects);
    const nodeInfoJson = await nodeInfo.json();
    if (!nodeInfoMatcher.test(nodeInfoJson)) return wrongShape(nodeInfoJson);

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
          description:
            "The node identifier that other nodes can use to connect to this node",
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
          value: `lndconnect://${controlTorAddress}:10009?cert=${cert}&macaroon=${macaroonBase64URL}`,
          description:
            "Use this for other applications that require a gRPC connection",
          copyable: true,
          qr: true,
          masked: true,
        },
        "LND Connect REST URL": {
          type: "string",
          value: `lndconnect://${controlTorAddress}:8080?cert=${cert}&macaroon=${macaroonBase64URL}`,
          description:
            "Use this for other applications that require a REST connection",
          copyable: true,
          qr: true,
          masked: true,
        },
        "LND Azeed Cypherseed": {
          type: "string",
          value: `${cipherSeedMnemonic? cipherSeedMnemonic : "The Azeed Cipher Seed is only available on StartOS for LND wallets created with >= 16.3. It is not possible to retreive the Seed from wallets created on < 16.3.\nIf you are using an LND wallet created pre 16.3 but would like to have a Cipher Seed, you will need to close your channels and move any on-chain funds to an intermediate wallet before creating a new LND wallet with >= 16.3."}`,
          // value: "insert CipherSeed here",
          description: "Seed for restoring on-chain ONLY funds. This seed has no knowledge of channel state. This is NOT a BIP-39 seed; this is an Azeed Cypherseed and as such it cannot be used to recover on-chain funds to any wallet other than LND",
          copyable: false,
          qr: false,
          masked: true,
        },
      },
    }; // Include the original stats object here

    await effects.writeFile({
      path: "start9/stats.yaml",
      volumeId: "main",
      toWrite: YAML.stringify(stats),
    });
    return { result: stats };
  } catch (e) {
    effects.error(`Error updating: ${e}`);
    return await compat.properties(effects);
  }
};
