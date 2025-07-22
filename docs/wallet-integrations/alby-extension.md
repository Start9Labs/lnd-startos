# LND - Alby Browser Extension

WARNING: This is NOT the guide for setting up **Alby Hub** this is for a direct connection to LND. If you'd like to connect via Alby Hub instead (recommended) install Alby Hub from the StartOS marketplace.

Alby is a browser extension that can be connected to your lightning node a number of ways. This guide will go over direct connections between Alby and your **LND** node.


1. Download the Alby extension by visiting the [Alby Github](https://github.com/getAlby/lightning-browser-extension#installation), selecting your browser, and installing.

1. On the Alby welcome screen, select **Get Started**.

1. Create a strong password and store it somewhere safe, like your Vaultwarden password manager.

1. On the next screen, select **Bring Your Own Wallet** and click **Connect**.

   ![Connect Alby](../assets/connect-alby-connect-start9-1.png)

1. Click **Start9** first...

   ![Connect Alby](../assets/connect-alby-connect-start9-2.png)

1. ... and only then **LND**.

   ![Connect Alby](../assets/connect-alby-connect-start9-3.png)

1. Copy the REST LND Connect URL from your LND service page’s Interfaces section and paste it into Alby:

   - If you are using the Tor URL, Alby will pick up that you are connecting over Tor and suggest using their Companion App (only needed if your browser isn’t setup to use Tor) or using Tor natively which you will be able to do. Select **TOR (native)** and click **Continue**. (If this does not work, please ensure that Tor is running on your system and that Firefox is configured to use it. If you can’t get this to work it’s OK to use the Companion App - but you will have a better experience with your Start9 server elsewhere if you take the time to get Tor running on your devices.)

   – If you are using clearnet, make sure you make the interface Public

1. Once connection is completed you will see a success page that displays the balance of your LND node in Sats..


Alby is now connected to your LND node over Tor!
