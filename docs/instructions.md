# Lightning Network Daemon (LND)

## Dependencies

LND on the Embassy requires a full archival Bitcoin node to function. Since your Embassy Bitcoin node is pruned by default, an additional service, Bitcoin Proxy, is also required.

## LND Config

Your LND node is highly configurable. Many settings are considered _advanced_ and should be used with caution. For the vast majority of users and use-cases, we recommend using the defaults. Once configured, you may start your node!

## Bitcoin Proxy Config

On the LND page, scroll down to find the Bitcoin Proxy dependency. Click `Configure`. This will automatically configure Bitcoin Proxy to satisfy LND.

## Using a Wallet

Enter your LND-Connect QR code (located in `properties`) into any wallet that supports connecting to a remote LND node over Tor. For a list of compatible wallets, see <a href="https://github.com/start9labs/lnd-wrapper/blob/master/docs/wallets.md" target="_blank">https://github.com/start9labs/lnd-wrapper/blob/master/docs/wallets.md</a>.

## Updates in the newest version (v0.11.1)

- If you have configured an external wallet to work with LND prior to v0.11.1, you will need to set it up again by scanning the LND Connect URL.
- There are two LND Connect URLs: gRPC and REST. Your wallet should specify which one it prefers. If it does not, try using gRPC first.
