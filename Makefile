PKG_ID := $(shell yq e ".id" manifest.yaml)
PKG_VERSION := $(shell yq e ".version" manifest.yaml)
TS_FILES := $(shell find ./ -name \*.ts)
CONFIGURATOR_SRC := $(shell find ./configurator/src) configurator/Cargo.toml configurator/Cargo.lock
HEALTH_CHECK_SRC := $(shell find ./health-check/src) health-check/Cargo.toml health-check/Cargo.lock

# delete the target of a rule if it has changed and its recipe exits with a nonzero exit status
.DELETE_ON_ERROR:

all: verify

verify: $(PKG_ID).s9pk
	embassy-sdk verify s9pk $(PKG_ID).s9pk

install: $(PKG_ID).s9pk
	embassy-cli package install $(PKG_ID).s9pk

clean:
	rm -rf docker-images
	rm -f image.tar
	rm -f $(PKG_ID).s9pk
	rm -f scripts/*.js

scripts/embassy.js: $(TS_FILES)
	deno bundle scripts/embassy.ts scripts/embassy.js

docker-images/x86_64.tar: Dockerfile docker_entrypoint.sh configurator/target/x86_64-unknown-linux-musl/release/configurator health-check/target/x86_64-unknown-linux-musl/release/health-check 
	mkdir -p docker-images
	docker buildx build --tag start9/$(PKG_ID)/main:$(PKG_VERSION) --platform=linux/amd64 --build-arg ARCH=x86_64 --build-arg PLATFORM=amd64 -o type=docker,dest=docker-images/x86_64.tar .

docker-images/aarch64.tar: Dockerfile docker_entrypoint.sh configurator/target/aarch64-unknown-linux-musl/release/configurator health-check/target/aarch64-unknown-linux-musl/release/health-check 
	mkdir -p docker-images
	docker buildx build --tag start9/$(PKG_ID)/main:$(PKG_VERSION) --platform=linux/arm64 --build-arg ARCH=aarch64 --build-arg PLATFORM=arm64 -o type=docker,dest=docker-images/aarch64.tar .

$(PKG_ID).s9pk: manifest.yaml instructions.md LICENSE icon.png scripts/embassy.js docker-images/aarch64.tar docker-images/x86_64.tar
	embassy-sdk pack

configurator/target/aarch64-unknown-linux-musl/release/configurator: $(CONFIGURATOR_SRC)
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:aarch64-musl cargo +beta build --release
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:aarch64-musl musl-strip target/aarch64-unknown-linux-musl/release/configurator

health-check/target/aarch64-unknown-linux-musl/release/health-check: $(HEALTH_CHECK_SRC)
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/health-check:/home/rust/src start9/rust-musl-cross:aarch64-musl cargo +beta build --release
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/health-check:/home/rust/src start9/rust-musl-cross:aarch64-musl musl-strip target/aarch64-unknown-linux-musl/release/health-check

configurator/target/x86_64-unknown-linux-musl/release/configurator: $(CONFIGURATOR_SRC)
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:x86_64-musl cargo build --release
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/configurator:/home/rust/src start9/rust-musl-cross:x86_64-musl musl-strip target/x86_64-unknown-linux-musl/release/configurator

health-check/target/x86_64-unknown-linux-musl/release/health-check: $(HEALTH_CHECK_SRC)
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/health-check:/home/rust/src start9/rust-musl-cross:x86_64-musl cargo build --release
	docker run --rm -it -v ~/.cargo/registry:/root/.cargo/registry -v "$(shell pwd)"/health-check:/home/rust/src start9/rust-musl-cross:x86_64-musl musl-strip target/x86_64-unknown-linux-musl/release/health-check
