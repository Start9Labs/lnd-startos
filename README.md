# Wrapper for LND

This project wraps [LND](https://github.com/lightningnetwork/lnd) for StartOS. The Lightning Network Daemon (lnd) - is a complete implementation of a Lightning Network node.

## Build environment
Before building the LND package, your build environment must be setup for building StartOS services. Instructions for setting up the proper build environment can be found in the [Developer Docs](https://docs.start9.com/latest/developer-docs/packaging).

## Dependencies

- [deno](https://deno.land/)
- [docker](https://docs.docker.com/get-docker)
- [docker-buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [make](https://www.gnu.org/software/make/)
- [start-sdk](https://github.com/Start9Labs/start-os/blob/v0.3.5.1/core/install-sdk.sh)
- [yq (version 4)](https://mikefarah.gitbook.io/yq)

## Cloning

Clone the project locally.

```
git clone git@github.com:Start9Labs/lnd-startos.git
cd lnd-startos
```

## Building

To build the project run the command: `make`

Alternatively the package can be built for individual architectures by specifying the architecture as follows:

```
make x86
```

or

```
make arm
```

## Installing (on StartOS)

```
start-cli auth login
#Enter your StartOS password
start-cli --host https://server-name.local package install lnd.s9pk
```

If you already have your `start-cli` config file setup with a default `host`, you can install simply by running:

```
make install
```

**Tip:** You can also install the lnd.s9pk using **Sideload Service** under the **StartOS > SETTINGS** section.

## Verify Install

Go to your StartOS Services page, select **LND**, configure and start the service.

**Done!** 