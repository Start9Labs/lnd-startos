import { matches } from "../deps.ts";

const { shape, number, string, boolean } = matches;

export const matchTor = shape({
  "use-tor-only": boolean,
  "stream-isolation": boolean,
});

export const matchBitcoind = shape({
  type: string,
  user: string,
  password: string,
}, ["user", "password"]);

export const matchAdvanced = shape({
  "min-confirmations": number,
  "confirmation-target": number,
});
export const matchAutopilot = shape({
  enabled: boolean,
  private: boolean,
  maxchannels: number,
  allocation: number,
  "min-channel-size": number,
  "max-channel-size": number,
  advanced: matchAdvanced,
});

export const matchBitcoin = shape({
  "default-channel-confirmations": number,
  "min-htlc": number,
  "min-htlc-out": number,
  "base-fee": number,
  "fee-rate": number,
  "time-lock-delta": number,
});

export const matchAdvanced2 = shape({
  "debug-level": string,
  "db-bolt-no-freelist-sync": boolean,
  "db-bolt-auto-compact": boolean,
  "db-bolt-auto-compact-min-age": number,
  "db-bolt-db-timeout": number,
  "recovery-window": number,
  "payments-expiration-grace-period": number,
  "default-remote-max-htlcs": number,
  "max-channel-fee-allocation": number,
  "max-pending-channels": number,
  "max-commit-fee-rate-anchors": number,
  "protocol-wumbo-channels": boolean,
  "protocol-no-anchors": boolean,
  "protocol-disable-script-enforced-lease": boolean,
  "gc-canceled-invoices-on-startup": boolean,
  bitcoin: matchBitcoin,
}, ["recovery-window"]);

export const matchRoot = shape({
  alias: string,
  color: string,
  "accept-keysend": boolean,
  "accept-amp": boolean,
  "reject-htlc": boolean,
  "min-chan-size": number,
  "max-chan-size": number,
  tor: matchTor,
  bitcoind: matchBitcoind,
  autopilot: matchAutopilot,
  advanced: matchAdvanced2,
  "control-tor-address": string,
  "peer-tor-address": string,
  "watchtower-tor-address": string,
}, [
  "alias",
  "min-chan-size",
  "max-chan-size",
  "watchtower-tor-address",
  "peer-tor-address",
  "control-tor-address",
]);

export type Root = typeof matchRoot._TYPE;
export type Tor = typeof matchTor._TYPE;
export type Bitcoind = typeof matchBitcoind._TYPE;
export type Autopilot = typeof matchAutopilot._TYPE;
export type Advanced = typeof matchAdvanced._TYPE;
export type Advanced2 = typeof matchAdvanced2._TYPE;
export type Bitcoin = typeof matchBitcoin._TYPE;
