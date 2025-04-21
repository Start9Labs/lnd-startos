import { compat, matches, types as T, util, YAML } from "../deps.ts";
const { shape, string, number, boolean } = matches;

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
  const paths = ["start9/controlTorAddress", "start9/peerTorAddress", "start9/admin.macaroon.hex", "start9/admin.macaroon.base64url", "start9/control.cert.pem.base64url"];
  const exists = async (path: string): Promise<boolean> =>
    await util.exists(effects, { volumeId: "main", path });
  if (!(await Promise.all(paths.map(exists))).every((v) => v))
    return noPropertiesFound;

  const [
    controlTorAddress,
    peerTorAddress,
    macaroonHex,
    macaroonBase64URL,
    cert,
    towerServerUrl,
    cipherSeedMnemonic,
  ] = await Promise.all([
    ...paths.map(async (path) =>
      (await effects.readFile({ volumeId: "main", path })).trim()
    ),
    effects.readFile({
      volumeId: "main",
      path: "start9/towerServerUrl",
    }).catch(() => "no Tower Server found"),
    effects.readFile({
      volumeId: "main",
      path: "start9/cipherSeedMnemonic.txt",
    }).catch(() => "no cipherSeed found"),
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
          masked: true,
        },
        "Node URI": {
          type: "string",
          value: `${nodeInfoJson.identity_pubkey}@${peerTorAddress}:9735`,
          description:
            "Give this to others to allow them to add your LND node as a peer",
          copyable: true,
          qr: true,
          masked: true,
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
          value: `lndconnect://${controlTorAddress}:8080?macaroon=${macaroonBase64URL}`,
          description:
            "Use this for other applications that require a REST connection",
          copyable: true,
          qr: true,
          masked: true,
        },
        "LND Aezeed Cipher Seed": {
          type: "string",
          value: `${cipherSeedMnemonic !== "no cipherSeed found"? cipherSeedMnemonic : "The Aezeed Cipher Seed is only available on StartOS for LND wallets created with >= 16.4. It is not possible to retreive the Seed from wallets created on < 16.4.\nIf you are using a LND wallet created pre 16.4 but would like to have a Cipher Seed backup, you will need to close your existing channels and move any on-chain funds to an intermediate wallet before creating a new LND wallet with >= 16.4."}`,
          description: "Seed for restoring on-chain ONLY funds. This seed has no knowledge of channel state. This is NOT a BIP-39 seed; As such it cannot be used to recover on-chain funds to any wallet other than LND.",
          copyable: true,
          qr: false,
          masked: true,
        },
        ...(towerServerUrl !== "no Tower Server found")
        ? {
          "Tower Server": {
            type: "string",
            value: towerServerUrl,
            description: "Sharing this URL with other LND nodes will allow them to use your server as a watchtower.",
            copyable: true,
            qr: true,
            masked: true,
          }
        } : {}
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
