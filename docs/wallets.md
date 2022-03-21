# Compatible Wallets

## Ride the Lightning (RTL)

### Available on the Embassy

### Instructions
1. Install RTL on the Embassy
2. Copy/paste your RTL Tor Address into any Tor-enabled browser
3. Copy/paste your password (located in `Properties`) into your RTL website

## [Zap](https://github.com/LN-Zap/)

Zap is designed to work with a remote LND node but has issues when connecting over Tor. If you experience these issues, please reach out to the [Zap team](https://join.slack.com/t/zaphq/shared_invite/enQtMzgyNDA2NDI2Nzg0LTQwZWQ2ZWEzOWFhMjRiNWZkZWMwYTA4MzA5NzhjMDNhNTM5YzliNDA4MmZkZWZkZTFmODM4ODJkYzU3YmI3ZmI) for support or report it in the GitHub repositories linked below.

### Available for
- [iOS](https://github.com/LN-Zap/zap-iOS)
- [Android](https://github.com/LN-Zap/zap-android)
- [Desktop]
    - MacOS
    - Windows
    - Linux

### Instructions
View the [tutorial](/docs/integrations/zap) for mobile app integrations.

## [Alby](https://getalby.com)

### Available for
Most desktop web browsers.

### Instructions
1. Visit [getalby.com](https://getalby.com) and install the browser extenstion
2. Install the native companion [app](https://github.com/getAlby/alby-companion-rs) (for connecting over tor)
3. Launch Alby from your browser and follow the onboarding steps
4. Select Start9 from the node connection options
5. Enter your `LND Connect REST URL` from the Properties tab of your Lightning Network Daemon service on your Embassy (currently c-lightning is not yet supported on Alby)
6. Finish the onboarding steps and your Embassy lightning node is now connected to the Alby wallet!
7. For a list of some sites you can interact with visit [makers.bolt.fun](https://makers.bolt.fun)
