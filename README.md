# Wrapper for LND

This project wraps [LND](https://github.com/lightningnetwork/lnd
) for EmbassyOS. The Lightning Network Daemon (lnd) - is a complete implementation of a Lightning Network node. 

## Dependencies

- [docker](https://docs.docker.com/get-docker)
- [docker-buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [yq (version 4)](https://mikefarah.gitbook.io/yq)
- [embassy-sdk](https://github.com/Start9Labs/embassy-os/blob/master/backend/install-sdk.sh)
- [make](https://www.gnu.org/software/make/)
- [deno](https://deno.land/)

## Cloning

Clone the project locally. Note the submodule link to the original project(s). 

```
git clone git@github.com:Start9Labs/lnd-wrapper.git
cd lnd-wrapper
git submodule update --init

```

## Building

To build the project, run the following commands:

```
make
```

## Installing (on Embassy)

```
# Copy S9PK to the external disk. Make sure to create the directory if it doesn't already exist
scp lnd.s9pk start9@embassy-<id>.local:/embassy-data/package-data/tmp 
ssh start9@embassy-<id>.local
embassy-cli auth login (enter password)
# Install the sideloaded package
embassy-cli package install /embassy-data/pacakge-data/tmp/lnd.s9pk
```

## Watchtowers

As of v0.7.0, LND supports the ability to run a private, altruist watchtower as a fully-integrated subsystem of lnd. Watchtowers act as a second line of defense in responding to malicious or accidental breach scenarios in the event that the client’s node is offline or unable to respond at the time of a breach, offering greater degree of safety to channel funds.

Your watchtower’s public key is *different* from lnd’s node public key. For now this acts as a soft whitelist as it requires clients to know the tower’s public key in order to use it for backups before more advanced whitelisting features are implemented. We recommend NOT disclosing this public key openly, unless you are prepared to open your tower up to the entire Internet.

You can add other watchtowers to your node by using `Add a watchtower to your LND Node` in actions or in the config options. This will back up your LND node state to the remote watchtower you entered. NOTE: For now, watchtowers will only backup the `to_local` and `to_remote` outputs from revoked commitments; backing up HTLC outputs is slated to be deployed in a future release, as the protocol can be extended to include the extra signature data in the encrypted blobs.
=======
```
# Copy S9PK to the external disk. Make sure to create the directory if it doesn't already exist
scp lnd.s9pk start9@embassy-<id>.local:/embassy-data/package-data/tmp 
ssh start9@embassy-<id>.local
embassy-cli auth login (enter password)
# Install the sideloaded package
embassy-cli package install /embassy-data/pacakge-data/tmp/lnd.s9pk
```

