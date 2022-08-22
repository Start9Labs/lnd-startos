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