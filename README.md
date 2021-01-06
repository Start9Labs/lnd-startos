# Wrapper for LND

This project wraps [LND](https://github.com/lightningnetwork/lnd
) for EmbassyOS. The Lightning Network Daemon (lnd) - is a complete implementation of a Lightning Network node. 

## Dependencies

- [docker](https://docs.docker.com/get-docker)
- [docker-buildx](https://docs.docker.com/buildx/working-with-buildx/)
- [yq (version 4)](https://mikefarah.gitbook.io/yq)
- [appmgr](https://github.com/Start9Labs/embassy-os/tree/master/appmgr)
- [make](https://www.gnu.org/software/make/)

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

SSH into an Embassy device.
`scp` the `.s9pk` to any directory from your local machine.
Run the following command to determine successful install:

```
appmgr install lnd.s9pk
```
