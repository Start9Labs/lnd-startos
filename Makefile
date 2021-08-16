ASSETS := $(shell yq e '.assets.[].src' manifest.yaml)
ASSET_PATHS := $(addprefix assets/,$(ASSETS))
VERSION_TAG := $(shell git --git-dir=lnd/.git describe --abbrev=0)
VERSION := $(VERSION_TAG:v%=%)
VERSION_SIMPLE := $(shell echo $(VERSION) | sed -E 's/([0-9]+\.[0-9]+\.[0-9]+).*/\1/g')
LND_GIT_REF := $(shell cat .git/modules/lnd/HEAD)
LND_GIT_FILE := $(addprefix .git/modules/lnd/,$(if $(filter ref:%,$(LND_GIT_REF)),$(lastword $(LND_GIT_REF)),HEAD))
CONFIGURATOR_SRC := $(shell find ./configurator/src) configurator/Cargo.toml configurator/Cargo.lock
S9PK_PATH=$(shell find . -name lnd.s9pk -print)

.DELETE_ON_ERROR:

all: verify

verify: lnd.s9pk $(S9PK_PATH)
	embassy-sdk verify $(S9PK_PATH)

install: lnd.s9pk 
	embassy-cli package install lnd

lnd.s9pk: manifest.yaml assets/compat/config_spec.yaml config_rules.yaml image.tar instructions.md $(ASSET_PATHS)
	embassy-sdk pack

image.tar: Dockerfile docker_entrypoint.sh configurator/target/aarch64-unknown-linux-musl/release/configurator $(LND_GIT_FILE)
	DOCKER_CLI_EXPERIMENTAL=enabled docker buildx build --tag start9/lnd --platform=linux/arm64 -o type=docker,dest=image.tar .

configurator/target/aarch64-unknown-linux-musl/release/configurator: $(CONFIGURATOR_SRC)
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:aarch64-musl cargo +beta build --release
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:aarch64-musl musl-strip target/aarch64-unknown-linux-musl/release/configurator
