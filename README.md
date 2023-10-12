# Wrapper for LND

This project wraps [LND](https://github.com/lightningnetwork/lnd) for StartOS. The Lightning Network Daemon (lnd) - is a complete implementation of a Lightning Network node.

## Build environment
Before building the LND package, your build environment must be setup for building StartOS services. Instructions for setting up the proper build environment can be found in the [Developer Docs](https://docs.start9.com/latest/developer-docs/packaging).

## Dependencies

- [docker](https://docs.docker.com/get-docker)
- [docker-buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [yq (version 4)](https://mikefarah.gitbook.io/yq)
- [start-sdk](https://github.com/Start9Labs/start-os/tree/sdk/backend)
- [make](https://www.gnu.org/software/make/)
- [deno](https://deno.land/)

## Cloning

Clone the project locally.

```
git clone git@github.com:Start9Labs/lnd-wrapper.git
cd lnd-wrapper
```

## Building

To build the project, run the following commands:

```
make
```

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

**Tip:** You can also install the lnd.s9pk using **Sideload Service** under the **StartOS > SETTINGS** section.

## Verify Install

Go to your StartOS Services page, select **LND**, configure and start the service.

**Done!** 