<p align="center">
  <img src="icon.png" alt="Project Logo" width="21%">
</p>

# LND for StartOS

This repo packages [LND](https://github.com/lightningnetwork/lnd) for StartOS.

## Accomplishments in This Branch (HTML)

The following table summarizes the key issues addressed and improvements made in this branch for the LND package on StartOS:

<table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-family: Arial, sans-serif; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <thead>
    <tr style="background-color: #4CAF50; color: white; border-bottom: 2px solid #ddd;">
      <th style="padding: 12px; text-align: left;">Status</th>
      <th style="padding: 12px; text-align: left;">Task</th>
      <th style="padding: 12px; text-align: left;">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background-color: #f9f9f9;">
      <td style="padding: 12px; text-align: center;">✔️</td>
      <td style="padding: 12px;"><strong>Fixed wallet unlock with incorrect password after password change</strong></td>
      <td style="padding: 12px;">Added refresh of <code>walletPassword</code> from <code>store.json</code> after a successful password change in <code>main.ts</code> to ensure the <code>unlock-wallet</code> oneshot uses the new password (e.g., <code>bXlwYXNzd29yZDI=</code> instead of <code>bXlwYXNzd29yZA==</code>). Prevents <code>invalid passphrase for master public key</code> errors during wallet unlock.</td>
    </tr>
    <tr style="background-color: #ffffff;">
      <td style="padding: 12px; text-align: center;">✔️</td>
      <td style="padding: 12px;"><strong>Corrected SSL hostname verification issues</strong></td>
      <td style="padding: 12px;">Added <code>--insecure</code> flag to <code>curl</code> commands for <code>/v1/genseed</code>, <code>/v1/changepassword</code>, <code>/v1/unlockwallet</code>, and <code>/v1/initwallet</code> to bypass SSL hostname mismatches in the StartOS environment.</td>
    </tr>
    <tr style="background-color: #f9f9f9;">
      <td style="padding: 12px; text-align: center;">✔️</td>
      <td style="padding: 12px;"><strong>Fixed TypeScript error in <code>initializeLnd</code></strong></td>
      <td style="padding: 12px;">Removed incorrect <code>toString('base64')</code> call in <code>initializeLnd</code> to resolve <code>TS2554</code> error, ensuring proper handling of base64-encoded passwords.</td>
    </tr>
    <tr style="background-color: #ffffff;">
      <td style="padding: 12px; text-align: center;">✔️</td>
      <td style="padding: 12px;"><strong>Improved initial wallet password generation</strong></td>
      <td style="padding: 12px;">Replaced the original 22-character password (e.g., <code>43W7ZAMVH6C2UZW6HIYYUY</code>) with a randomly generated 22-character password (uppercase letters and numbers) that is base64-encoded in <code>store.json</code> (e.g., <code>REpZWUE1TlA0VjUzTE83NDFTUlU4Ng==</code> for <code>DJYYA5NP4V53LO741SRU86</code>). Ensures compatibility with <code>lncli unlock</code>, GUI password changes, and RPC calls (<code>/v1/initwallet</code>, <code>/v1/unlockwallet</code>).</td>
    </tr>
    <tr style="background-color: #f9f9f9;">
      <td style="padding: 12px; text-align: center;">✔️</td>
      <td style="padding: 12px;"><strong>Added decoding instructions for <code>lncli unlock</code></strong></td>
      <td style="padding: 12px;">Included log messages in <code>initializeLnd</code> with the plaintext password and instructions for decoding the base64 <code>walletPassword</code> (e.g., <code>echo REpZWUE1TlA0VjUzTE83NDFTUlU4Ng== | base64 -d</code>) for manual wallet unlocking via <code>lncli</code>.</td>
    </tr>
    <tr style="background-color: #ffffff;">
      <td style="padding: 12px; text-align: center;">✔️</td>
      <td style="padding: 12px;"><strong>Fixed wallet unlock after initialization</strong></td>
      <td style="padding: 12px;">Added refresh of <code>walletPassword</code> from <code>store.json</code> after <code>initializeLnd</code> to ensure the <code>unlock-wallet</code> oneshot uses the correct base64-encoded password, preventing errors like using <code>POLTZPMM7IPAP2VWT76L5E</code> instead of <code>REpZWUE1TlA0VjUzTE83NDFTUlU4Ng==</code>.</td>
    </tr>
    <tr style="background-color: #f9f9f9;">
      <td style="padding: 12px; text-align: center;">✔️</td>
      <td style="padding: 12px;"><strong>Enhanced debugging with additional logging</strong></td>
      <td style="padding: 12px;">Added logs for initial and refreshed <code>walletPassword</code> values in <code>main.ts</code> to track password usage at each step (e.g., <code>Initial walletPassword from store.json (base64)</code>, <code>Refreshed walletPassword after initialization (base64)</code>).</td>
    </tr>
  </tbody>
</table>