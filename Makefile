ASSET_PATHS := $(shell find ./assets/*)
VERSION_TAG := $(shell git --git-dir=lnd/.git describe --abbrev=0)
VERSION := $(VERSION_TAG:v%=%)
VERSION_SIMPLE := $(shell echo $(VERSION) | sed -E 's/([0-9]+\.[0-9]+\.[0-9]+).*/\1/g')
EMVER := $(shell yq e ".version" manifest.yaml)
LND_GIT_REF := $(shell cat .git/modules/lnd/HEAD)
LND_GIT_FILE := $(addprefix .git/modules/lnd/,$(if $(filter ref:%,$(LND_GIT_REF)),$(lastword $(LND_GIT_REF)),HEAD))
CONFIGURATOR_SRC := $(shell find ./configurator/src) configurator/Cargo.toml configurator/Cargo.lock
HEALTH_CHECK_SRC := $(shell find ./health-check/src) health-check/Cargo.toml health-check/Cargo.lock
S9PK_PATH=$(shell find . -name lnd.s9pk -print)

.DELETE_ON_ERROR:

all: verify

clean:
	rm lnd.s9pk
	rm image.tar

verify: lnd.s9pk $(S9PK_PATH)
	embassy-sdk verify s9pk $(S9PK_PATH)

install: lnd.s9pk 
	embassy-cli package install lnd

lnd.s9pk: manifest.yaml image.tar instructions.md LICENSE icon.png $(ASSET_PATHS)
	embassy-sdk pack

image.tar: Dockerfile docker_entrypoint.sh configurator/target/aarch64-unknown-linux-musl/release/configurator health-check/target/aarch64-unknown-linux-musl/release/health-check $(LND_GIT_FILE)
	DOCKER_CLI_EXPERIMENTAL=enabled docker buildx build --tag start9/lnd/main:${EMVER} --platform=linux/arm64/v8 -o type=docker,dest=image.tar .

configurator/target/aarch64-unknown-linux-musl/release/configurator: $(CONFIGURATOR_SRC)
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:aarch64-musl cargo +beta build --release
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:aarch64-musl musl-strip target/aarch64-unknown-linux-musl/release/configurator

health-check/target/aarch64-unknown-linux-musl/release/health-check: $(HEALTH_CHECK_SRC)
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/health-check:/home/rust/src start9/rust-musl-cross:aarch64-musl cargo +beta build --release
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/health-check:/home/rust/src start9/rust-musl-cross:aarch64-musl musl-strip target/aarch64-unknown-linux-musl/release/health-check
