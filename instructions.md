# LND

## Documentation

- [Start9 Bitcoin Guides](https://docs.start9.com/bitcoin-guides/) — connecting wallets and dashboards to a Lightning node on StartOS, and migrating an existing LND node onto one.
- [LND operator documentation](https://docs.lightning.engineering/lightning-network-tools/lnd) — the upstream guide to running and configuring LND.

## What you get on StartOS

A full **LND** node on Bitcoin mainnet, with **REST** and **gRPC** LND Connect interfaces, a **Peer** interface for inbound Lightning connections, and an optional **Watchtower** server. StartOS manages the wallet lifecycle — creation, password storage, and auto-unlock on every start — so you never run `lncli create` or `lncli unlock`. It runs on the **SQLite** database backend, Lightning Labs' recommended modern backend. It also includes **channel auto-backup** to external providers (SFTP, Dropbox, Nextcloud, Google Drive, email), **wallet hardening** (auto-unlock can be disabled, password and seed can be deleted from the server), and a **Security Status** health check that summarizes your security posture at a glance.

## Getting set up

LND posts two critical tasks on install; you can't start it until both are done:

1. **Initialize Wallet** — **Start Fresh** for a new wallet, or **Migrate from Umbrel** / **Migrate from myNode** / **Migrate from StartOS** to import one from a node on your local network. Start Fresh shows your 24-word seed **once** — write it down. **The seed alone is not enough:** it recovers _on-chain_ funds only; funds in channels can be recovered only from the **Static Channel Backup** in your StartOS backups, so keep backups (see [Backups](#backups)). Choosing a migration option checks that your address and password reach the origin node and schedules the migration; the migration itself runs **when you start LND** — it shuts the origin down, copies its data, and converts the database before LND comes online, which can take hours on a large node. Watch it under **Health Checks**. If the migration fails repeatedly, LND stops itself and re-posts the **Initialize Wallet** task — run it again to correct the address or password and retry. Once the migration has finished, **never start LND on the origin device again** — two nodes sharing one seed loses funds. The full walkthrough is in the [LND migration guide](https://docs.start9.com/bitcoin-guides/lnd-migration).
2. **Bitcoin Backend** — **Bitcoin** (recommended if you run it on this server) or **Neutrino** (built-in light client). Choosing Bitcoin posts a task on it to enable ZMQ.

Then start LND.

On every start, **Network and Graph Sync** goes through _Syncing to graph_ before it reaches _Synced_ — usually well under three minutes. If it reads _Waiting for peers_, LND has not connected to any yet. LND depends on a single peer it picks at startup to hand over the channel graph, and if that peer stops responding the sync waits on it; the check then tells you how long it has been pending. LND retries with a different peer within the hour on its own, so this normally clears itself. If you would rather not wait, restart LND — it picks a different peer. A node with no channels sees this most often, because it has no regular peers to reconnect to.

### Securing your node

After starting LND for the first time, consider these optional security steps under **Actions & Config > Security**:

1. **Set up Channels Auto-Backup** — configure at least one backup provider (SFTP, Dropbox, Nextcloud, Google Drive, or email) to protect your channel funds. (<a href="/services/lnd/instructions#channels-auto-backup-setup-examples" class="g-info"><b><u>setup examples 🔗</u></b></a>)
2. **Confirm Wallet Password Backup** — type your wallet password to confirm you have it saved.
3. **Disable Wallet Auto Unlock** — this deletes the password from the server so a stolen machine cannot auto-unlock the wallet. You will need to manually unlock via the Dashboard task each time LND restarts.
4. **Confirm Aezeed Cipher Seed Backup** — type three seed words to confirm you have written them down.
5. **Delete Aezeed Cipher Seed** — removes the seed from the server.

The **Security Status** health check turns green when all five are in their secure state.

## Using LND

### Connecting wallets and apps

Open the **REST** or **gRPC LND Connect** interface and copy the `lndconnect://` URI (or scan the QR) into your wallet. It embeds your admin macaroon — treat it like a password. These interfaces appear only after the wallet is initialized.

For **REST**, StartOS serves the connection with your server's own certificate, so leave certificate validation **on** in your wallet. Wallets such as Zeus verify it the same way your browser does — over your local network that means having the [StartOS Root CA](https://docs.start9.com/start-os/trust-ca) installed on the device, exactly as for the StartOS dashboard. If you have set up a custom domain with an ACME certificate, wallets trust it with no extra step.

For **gRPC**, LND serves the certificate your server issued it, and the `lndconnect://` URI carries your server's Root CA so your wallet can verify it — nothing to install on the device. The gRPC QR is denser than the REST one; copy the URI instead if your camera can't read it.

### Reachability and networking

Other nodes connect to you over the **Peer** interface; run **Node Info** for your shareable peer URI. Whether others can reach you depends on the addresses your node advertises:

- **Tor** — Tor is a separate marketplace service, not built in. Install and start **Tor**, and LND will route outbound connections through it (on by default; change in **Tor Settings**). To be reachable _inbound_ over Tor, also add an onion service to the **Peer** interface (the interface's **Tor** table, or the Tor service's **Manage Onion Services** action).
- **Clearnet** — set a **Custom External Host** (e.g. a Tunnelsats or VPN endpoint) to advertise a clearnet address alongside any onion. A public domain on the Peer interface also works, but only with **Skip for clearnet peers** enabled in **Tor Settings**.
- If no address is advertised, the **Node Reachability** health check shows _disabled_: you can still open channels outbound, but others can't open channels to you.

### Configuration

Configure LND through its settings actions — General, Routing Fees, Channel Settings, Autopilot, Performance, Bitcoin Backend, Tor, and Custom External Host. You can also edit `lnd.conf` directly: your settings are preserved across restarts, except for a few keys StartOS manages for you (`externalip`/`externalhosts`, `tor.socks`, and the Bitcoin backend connection settings).

**Not routing any payments?** Check **Reject Routing Requests** under **Channel Settings**. With it on, LND still sends and receives payments but refuses to be used as a hop, and the log shows `node configured to disallow forwards` each time it turns one away.

Two advanced actions worth knowing: **Reset Wallet Transactions** rescans the chain for on-chain transactions LND may have missed; **Revoke Macaroons** revokes every existing macaroon and mints fresh ones, after which you must reconnect wallets with the new `lndconnect://` URI.
Run **Revoke Macaroons** if a macaroon may have been copied or exposed — for example if you run BTCPay Server, which reads LND's admin macaroon and shipped an actively exploited vulnerability in versions before 2.4.2. Every other service connected to LND also loses access until it picks up the new macaroon, so expect to restart them.

## Security 

### Channels auto-backup

**Channels - Auto-Backup** feature uploads `channel.backup` file to one or more services — SFTP, Dropbox, Nextcloud, Google Drive, or by email — whenever a channel is opened, closed, or updated. This is a **redundancy for, not a replacement of**, StartOS backups: both serve the same Static Channel Backup file. Set it up under **Actions → Security → Channels - Auto-Backup** (it steps you through each provider), then verify it with **Channels - Test Auto-Backup**. The **Security Status** health check summarises its current state.

#### Channels auto-backup setup examples

  <details>
  <summary><b>EMAIL</b></summary>
  <br>
  <div>In the example below, SMTP2GO is used as SMTP provider because the setup is straightforward and the service is free.</div>
  <br><table class="g-table tui-space_top-4">
    <thead><tr><th>Step</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td>1️⃣</td><td><b>Sign up</b> at <u><a href="https://www.smtp2go.com/" target="_blank">smtp2go.com</a></u> (Free: 1k emails/mo)</td></tr>
      <tr><td>2️⃣</td><td>Verify email → Log in at <u><a href="https://app.smtp2go.com/" target="_blank">app.smtp2go.com</a></u></td></tr>
      <tr><td>3️⃣</td><td><b>Sending → Verified Senders</b>: Add & verify your "From" email</td></tr>
      <tr><td>4️⃣</td><td><b>Sending → SMTP Users → Add SMTP User</b>: Create & save username & password</td></tr>
      <tr><td>5️⃣</td><td>Return to Channels - Auto-Backup: Enable Email as backup provider & enter config:<br>
        <b>Sender Address:</b> Use your SMTP2GO "Single sender emails" address. See step 3.<br>
        <b>Recipient Address:</b> Add at least two addresses and try to mix email providers. Example: <code>youremail@proton.me, youremail@gmail.com, familymemberemail@gmail.com, friendemail@gmail.com</code><br>
        <b>SMTP Server:</b> <code>mail.smtp2go.com</code><br>
        <b>SMTP Port:</b> <code>465</code> (SSL) or <code>587</code> (TLS)<br>
        <b>SMTP Username:</b> See step 4.<br>
        <b>SMTP Password:</b> See step 4.</td></tr>
      <tr><td>6️⃣</td><td>Click <b>Submit</b> → Run <b>Channels: Test Auto-Backup</b></td></tr>
    </tbody>
  </table>
  <br>
    <div>💡 Any SMTP provider works! We recommend SMTP2GO, MailerSend, or Gmail (all free).</div>
    <br><table class="g-table tui-space_top-4">
    <thead>
      <tr><th>✅ Recommended SMTP Providers</th></tr>
    </thead>
    <tbody>
      <tr><td><b>SMTP2Go</b> ⇢ <u><a href="https://www.smtp2go.com/" target="_blank">smtp2go.com 🔗</a></u><br/>– Free tier: 1,000 emails/month, no domain required.<br/>– SMTP server: <code>mail.smtp2go.com</code>, port 465 or 587.</td></tr>
      <tr><td><b>MailerSend</b> ⇢ <u><a href="https://www.mailersend.com/" target="_blank">mailersend.com 🔗</a></u><br/>– Free tier: 500 emails/month, no domain required.<br/>– Use your <b>verified email</b> as "From" address.</td></tr>
      <tr><td><b>Gmail</b> ⇢ <u><a href="https://mail.google.com/" target="_blank">mail.google.com 🔗</a></u><br/>– Free tier: 500 emails/day, requires App Password (2FA must be ON).<br/>⚠️ Emails can <b>only be sent to @gmail.com addresses</b> unless you verify a custom "From" address.</td></tr>
      <tr><td><b>Proton Mail</b> ⇢ <u><a href="https://mail.proton.me/" target="_blank">mail.proton.me 🔗</a></u><br/>– Free tier: NONE, smtp access requires <b>paid plan</b>.<br/>– SMTP server: <code>smtp.proton.me</code>, port 465 or 587.</td></tr>
     </tbody>
  </table>
</details>
<hr>
<details>
  <summary><b>SFTP</b></summary>
    <br><table class="g-table tui-space_top-4">
    <thead><tr><th>Step</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td>1️⃣</td><td><b>Choose a remote server / LAN computer</b> (desktop, laptop, Raspberry Pi, or NAS) that stays powered on.</td></tr>
      <tr><td>2️⃣</td><td><b>Check & install SSH/SFTP server (if missing)</b>:<br>
        – <b>Linux (Ubuntu/Debian)</b>:<br>
          &nbsp;&nbsp;• Check: <code>sudo systemctl is-active ssh</code><br>
          &nbsp;&nbsp;• If <code>inactive</code>, run:<br>
          &nbsp;&nbsp;&nbsp;&nbsp;<code>sudo apt update && sudo apt install openssh-server</code><br>
          &nbsp;&nbsp;&nbsp;&nbsp;<code>sudo systemctl enable --now ssh</code><br>
        – <b>macOS</b>:<br>
          &nbsp;&nbsp;• Go to <b>System Settings → Sharing</b> → enable <b>Remote Login</b><br>
        – <b>Windows</b>:<br>
          &nbsp;&nbsp;• Check: Open <b>Services</b> → look for "OpenSSH SSH Server" (should be "Running")<br>
          &nbsp;&nbsp;• If missing: <b>Settings → Apps → Optional Features → Add → OpenSSH Server</b><br>
          &nbsp;&nbsp;• Then in **PowerShell as Admin**:<br>
          &nbsp;&nbsp;&nbsp;&nbsp;<code>Start-Service sshd; Set-Service -Name sshd -StartupType 'Automatic'</code>
      </td></tr>
      <tr><td>3️⃣</td><td><b>Find the IP address</b>:<br>
        – Linux/macOS: run <code>ip a</code> (look for <code>inet</code> under <code>wlan0</code> or <code>eth0</code>)<br>
        – Windows: run <code>ipconfig</code> in Command Prompt (look for "IPv4 Address")
      </td></tr>
      <tr><td>4️⃣</td><td><b>Choose authentication</b>:<br>
        – ✅ <b>Password (recommended for beginners)</b>:<br>
          &nbsp;&nbsp;• Leave <b>"SFTP Private Key"</b> blank<br>
          &nbsp;&nbsp;• Enter your login password in <b>"SFTP Password"</b><br>
        – 🔑 <b>SSH Key (advanced)</b>:<br>
          &nbsp;&nbsp;• <b>How to generate a key (if you don't have one):</b><br>
          &nbsp;&nbsp;&nbsp;&nbsp;– <b>Linux / macOS</b>:<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>ssh-keygen -t ed25519 -C "lnd-backup" -f ~/.ssh/lnd_backup</code><br>
          &nbsp;&nbsp;&nbsp;&nbsp;– <b>Windows (PowerShell)</b>:<br>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<code>ssh-keygen -t ed25519 -C "lnd-backup" -f "$env:USERPROFILE\\.ssh\\lnd_backup"</code><br>
          &nbsp;&nbsp;• Your private key is at:<br>
          &nbsp;&nbsp;&nbsp;&nbsp;– Linux/macOS: <code>~/.ssh/lnd_backup</code><br>
          &nbsp;&nbsp;&nbsp;&nbsp;– Windows: <code>%USERPROFILE%\\.ssh\\lnd_backup</code><br>
          &nbsp;&nbsp;• <b>Paste the entire private key</b> (starts with <code>-----BEGIN OPENSSH PRIVATE KEY-----</code> and ends with <code>-----END ...</code>) into <b>"SFTP Private Key"</b><br>
          ⚠️ <b>Include every line</b> and <b>do not add extra spaces or line breaks at the end</b>.
      </td></tr>
      <tr><td>5️⃣</td><td><b>In LND SFTP Settings</b>:<br>
        <b>SFTP Host</b>: IP from Step 3 (e.g., <code>192.168.1.20</code>)<br>
        <b>SFTP Username</b>: Your login username (e.g., <code>user</code>, <code>admin</code>)<br>
        <b>SFTP Port</b>: <code>22</code> (default)<br>
        <b>SFTP Folder Path</b>: Path to the backup folder (e.g., <code>lnd-backups</code> or <code>subfolder/lnd-backups</code>). Use relative paths without a leading '/' to place it in your home directory.<br>
        → <b>Create this folder first</b> if it doesn't exist.
      </td></tr>
      <tr><td>6️⃣</td><td>Click <b>Submit</b>, then test with <b>"Test Channels Auto-Backup"</b>.</td></tr>
    </tbody>
  </table>
  💡 <b>Tip</b>: If backup fails, check: IP correctness, SSH running, firewall blocking port 22, folder permissions, or special characters in password.<br>
  💡 If your private key is **not fully saved**, try copying it again **without trailing newlines**—only the full key block.
</details>
<hr>
<details>
  <summary><b>Dropbox</b></summary>
    <br><table class="g-table tui-space_top-4">
    <thead><tr><th>Step</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td>1️⃣</td><td>Go to <u><a href="https://www.dropbox.com/developers/apps" target="_blank">Dropbox App Console 🔗</a></u> → Create app (or use existing)</td></tr>
      <tr><td>2️⃣</td><td>Choose <b>Scoped access</b> → <b>App folder</b></td></tr>
      <tr><td>3️⃣</td><td>Give it a name → Create app</td></tr>
      <tr><td>4️⃣</td><td>Permissions → enable <code>files.content.write</code> and <code>files.content.read</code></td></tr>
      <tr><td>5️⃣</td><td>Copy <b>App key</b> (client_id) and <b>App secret</b> (client_secret)</td></tr>
      <tr><td>6️⃣</td><td>💡 If you already have Refresh Token just proceed to step 7.<br>
        <hr>Open your browser and paste this Dropbox OAuth 2 URL, replacing <b><i>APP_KEY</i></b> with your App key:<br><br>
        <i>https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&response_type=code&token_access_type=offline</i><br><br>
        <span>Log in to Dropbox → Allow the app: Copy the <b>Dropbox Authorization Code</b> from the URL (after ?code=) or from the page if displayed.</span><br></td></tr>
      <tr><td>7️⃣</td><td>In LND → Channels - Auto-Backup → Dropbox settings, paste:<ul><li><b>Dropbox App Key</b>: Your App key</li><li><b>Dropbox App Secret</b>: Your App secret</li><li><b>Dropbox Authorization Code</b>: The code from step 6 (fill only if you do NOT already have a Refresh Token)</li><li><b>Dropbox Refresh Token</b>: Paste your existing refresh token here if you have one OR leave empty → a new one will be generated automatically (Authorization Code is then required)</li></ul></td></tr>
      <tr><td>8️⃣</td><td>Folder path: enter new path or leave default <code>lnd-backups</code></td></tr>
      <tr><td>9️⃣</td><td>Click <b>Submit</b> → Provided settings will be exchanged for Dropbox Refresh Token automatically. Run <b>Channels - Test Auto-Backup</b>.</td></tr>
    </tbody>
  </table>
  </details>
<hr>
<details>
  <summary><b>Nextcloud</b></summary>
    <br><table class="g-table tui-space_top-4">
    <thead><tr><th>Step</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td>1️⃣</td><td><b>Log in</b> to your Nextcloud instance.</td></tr>
      <tr><td>2️⃣</td><td>Go to <b>Settings → Security → Devices & sessions</b>.</td></tr>
      <tr><td>3️⃣</td><td>Under "App passwords", <b>create a new app password</b> (e.g., "LND Backup").</td></tr>
      <tr><td>4️⃣</td><td>Copy the generated password — you won't see it again!</td></tr>
      <tr><td>5️⃣</td><td>In LND Auto-Backup config, fill in:<br>
        <b>Nextcloud WebDAV URL:</b> <code>https://your-nextcloud.com/remote.php/dav/files/yourusername/</code> or <code>https://youronionaddress.onion/remote.php/dav/files/yourusername/</code><br>
        <b>Username:</b> Your Nextcloud login<br>
        <b>Password:</b> The app password from Step 3<br>
        <b>Folder Path:</b> <code>lnd-backups</code> (will be created automatically)</td></tr>
      <tr><td>6️⃣</td><td>Click <b>Submit</b> → Run <b>Channels - Test Auto-Backup</b>.</td></tr>
    </tbody>
  </table>
  💡 Ensure your Nextcloud server allows WebDAV access and isn't behind aggressive firewalls.
</details>
<hr>
<details>
  <summary><b>Google Drive</b></summary>
  <div><br><b>Works with FREE personal Google accounts!</b></div>
  <br>
  <div>Google Drive requires OAuth authorization. This is a 3-step process that takes about 2 minutes.</div>
    <br><table class="g-table tui-space_top-4">
    <thead><tr><th>Step</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td colspan="2"><h4>Part 1: Create OAuth Credentials (One-time setup)</h4></td></tr>
      <tr><td>1️⃣</td><td>Go to <u><a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console 🔗</a></u> → Create a <b>new project</b> (e.g., "lnd-backup").</td></tr>
      <tr><td>2️⃣</td><td>Enable the <b>Google Drive API</b>:<br>
        • Go to "APIs & Services → Library"<br>
        • Search "Google Drive API"<br>
        • Click "Enable"</td></tr>
      <tr><td>3️⃣</td><td>Configure OAuth consent screen:<br>
        • Go to "APIs & Services → OAuth consent screen"<br>
        • User Type: <b>External</b> → Create<br>
        • App name: <code>LND Backup</code><br>
        • User support email: Your email<br>
        • Developer contact: Your email<br>
        • Save and Continue through all screens<br>
        • On "Test users" screen: <b>Add your email as a test user</b><br>
        • Save and Continue</td></tr>
      <tr><td>4️⃣</td><td>Create OAuth credentials:<br>
        • Go to "APIs & Services → Credentials"<br>
        • Click <b>"Create Credentials" → "OAuth client ID"</b><br>
        • Application type: <b>Desktop app</b><br>
        • Name: <code>LND Backup Client</code><br>
        • Click <b>Create</b></td></tr>
      <tr><td>5️⃣</td><td>Copy the <b>Client ID</b> and <b>Client Secret</b> shown in the popup. Paste them in the fields below.</td></tr>
      <tr><td colspan="2"><h4>Part 2: Get Authorization Code</h4></td></tr>
      <tr><td>1️⃣</td><td>To get the authorization code, edit this URL, replacing <b>CLIENT_ID</b> with your Client ID:<br>
      <i>https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent</i><br>     
        </td></tr>
      <tr><td>2️⃣</td><td>After visiting the authorization URL and clicking "Allow" your browser will redirect to <code>http://localhost/?code=...</code> (this will fail to load, that's OK!). Copy the code from your browser's redirect URL. You can copy either:<br>
        • The full URL: <code>http://localhost/?code=4/0A...</code><br>
        • OR just the code: <code>4/0A...</code><br></td></tr>
      <tr><td>3️⃣</td><td>Paste the code (or full URL) into the <b>"Authorization Code"</b> field in the Google Drive settings below.</td></tr>
      <tr><td colspan="2"><h4>Part 3: Complete Setup</h4></td></tr>
      <tr><td>1️⃣</td><td>Click <b>Submit</b>. Your authorization code is automatically exchanged for permanent token. You only need to do this once! </td></tr>
      <tr><td>2️⃣</td><td>Run <b>Channels - Test Auto-Backup</b> </td></tr>
      <tr><td>3️⃣</td><td>Visit <u><a href="https://drive.google.com/" target="_blank">Google Drive 🔗</a></u> to confirm that channel.backup is there. If not, check the LND logs for error messages. </td></tr>
    </tbody>
  </table>
  <br>
  <div>💡 <b>Troubleshooting:</b></div>
  <ul>
    <li>If you see "access_blocked", make sure you added your email as a Test User in step 3 of part 1. </li>
    <li>If authorization fails, double-check you copied the complete authorization code</li>
    <li>The token lasts indefinitely with automatic refresh - you only authorize once</li>
  </ul>
</details>


### Aezeed cipher seed

Your 24-word Aezeed seed recovers **on-chain funds only**. It is **not** a BIP-39 seed and does not know about channels. Three actions manage it:

1. **Aezeed Cipher Seed** — displays the 24 words. Write them down and store them safely.
2. **Aezeed Cipher Seed - Backup** — confirm you wrote them down by typing three randomly asked words.
3. **Aezeed Cipher Seed - Delete** — removes the seed from the server. After deleting both, seed and password, an attacker who steals the server cannot sweep your on-chain funds.

You must confirm the backup before you can delete.

### Wallet password

**Wallet - Password** lets you view or change the password used to unlock the LND wallet. Enter your current password, then a new one (minimum 8 characters). After changing, confirm the new password via **Wallet - Password Backup** — type it once to prove you saved it.

### Wallet auto-unlock

**Wallet - Auto-Unlock** controls whether StartOS stores the wallet password on the server.

- **Enabled** (default) — LND unlocks itself on every start. Convenient, but if someone steals the server and reflashes StartOS, they can set a new master password and access your wallet.
- **Disabled** — the password is deleted from the server. You must unlock the wallet manually every time LND restarts, via **Dashboard → Tasks** or **Actions → Security → Wallet - Manual Unlock**.

⚠️ **Tip:** If you enable auto-unlock and enter the wrong password, the wallet will stay locked and the **Wallet Status** health check will show an error. Fix it by returning to **Wallet - Auto-Unlock**, making sure the toggle is on, and entering the correct password (minimum 8 characters).

With auto-unlock off, a node **does not** come back online by itself after a reboot — you must manually unlock it.

### Watchtower server

**Watchtower - Server** lets other LND nodes use your server as a watchtower. When enabled, peers can back up their channel state to you, and you can penalize a cheating counterparty if they go offline.

- Set an **External Address** (your public onion or clearnet address) to enable it.
- Setting the address to **none** disables the server and **permanently deletes** the backup data it holds for client nodes.

**Watchtower - Server Info** shows your tower URL — share it with peers who want to use your tower.

### Watchtower client

**Watchtower - Client** lets your node back up channel state to another LND watchtower. If you go offline, the tower can penalize a cheating counterparty on your behalf.

Add a tower by pasting its URI (format: `<pubkey>@<host>:<port>`). You can add multiple towers.

A node that has auto-unlock off, its on-chain seed deleted, a channels backup configured, and a watchtower client attached is the "all green" case of the **Security Status** health check.

## Backups

StartOS backs up LND with its system backup. **For a Lightning node this is essential:** your seed recovers on-chain funds only, while channel funds can be recovered only by force-closing from LND's **Static Channel Backup**, which is included in StartOS backups. Back up regularly. For additional protection, configure **Channels - Auto-Backup** under Actions > Security to upload your `channel.backup` file to external providers whenever channels open or close. This is a redundancy for StartOS backups, not a replacement — both serve the same file.

### Restoring from backup

Restoring force-closes every channel from the Static Channel Backup and shows a persistent warning. **Lightning Labs strongly recommends against continued use of a restored node:** once funds are back on-chain, sweep them to another wallet, then uninstall and reinstall LND fresh.

StartOS restores the wallet database and `channel.backup` directly from the backup — the seed is not used. Deleting the seed from the server does not weaken your StartOS backups.

**With auto-unlock off:** If you restored a backup where auto-unlock was disabled, the wallet password is not stored on the server. After the volume restore, you must manually unlock the wallet via the **Wallet - Manual Unlock** task on the Dashboard. The channel backup restore retries automatically until the wallet is unlocked, then cooperatively closes every channel.

## Limitations

- **Mainnet only** — no testnet, signet, or regtest.
- **Wallet is managed by StartOS** — `lncli create` and `lncli unlock` are not used.
