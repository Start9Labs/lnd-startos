# Updating the upstream version

## Determining the upstream version

- **LND** — [lightningnetwork/lnd](https://github.com/lightningnetwork/lnd)
  - Latest release:
    ```sh
    gh release view -R lightningnetwork/lnd --json tagName -q .tagName
    ```
  - Current pin: the **`Dockerfile`**, not the manifest. The manifest's `images.lnd.source` is `dockerBuild: {}` — this package builds its own image (LND + the `lndinit` binary), so there is no `dockerTag` to bump. The `Dockerfile` carries **two** pins that must move together:
    - `FROM lightninglabs/lnd:v<version>` — the LND runtime.
    - `COPY --from=lightninglabs/lndinit:v<lndinit>-lnd-v<version> /bin/lndinit /bin/lndinit` — the `lndinit` image tag **embeds the LND version**, so bumping LND without bumping this tag leaves it pointing at an image that doesn't exist.

  GitHub releases are the source of truth. The `lightninglabs/lnd` image on Docker Hub may lag the GitHub release by a few minutes to hours, and the combined `lightninglabs/lndinit` tag for the new LND version is published separately and lags further. **Confirm both tags are pullable before bumping:**

  ```sh
  curl -fsSL "https://hub.docker.com/v2/repositories/lightninglabs/lnd/tags/v<version>" | jq -r .name
  curl -fsSL "https://hub.docker.com/v2/repositories/lightninglabs/lndinit/tags/v<lndinit>-lnd-v<version>" | jq -r .name
  ```

  (A 404 from either means the image isn't published yet — wait, don't pin.) Browse the available `lndinit` tags to find the one built against the new LND version:

  ```sh
  curl -fsSL "https://hub.docker.com/v2/repositories/lightninglabs/lndinit/tags?page_size=20&ordering=last_updated" | jq -r '.results[].name'
  ```

## Applying the bump

- **`Dockerfile`** — bump `FROM lightninglabs/lnd:v<new version>` **and** the `COPY --from=lightninglabs/lndinit:v<lndinit>-lnd-v<new version>` tag.
- **`startos/manifest/index.ts`** — the comment above `images.lnd` names the pinned LND version; keep it accurate. There is no tag to change here.
