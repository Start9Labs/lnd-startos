# LND - Fully Noded

Sovereign, secure, powerful, and easy-to-use wallet that utilizes your own LND node as a backend.

Available For:

- iOS
- macOS

1. Download Fully Noded from the Apple App Store.
1. Log into your StartOS server UI and select Services -> LND and find the Interfaces section, then select the gear icon on the right-hand side of the screen for `REST LND Connect`.
1. Click the QR code icon next to the REST LND Connect interface you wish to use to display the QR code, then scan/copy this with your iPhone/mac.

    [Scanning QR] From the App, you have to go > Node manager > Add a node + > hit Scan QR (not LND)

    [Pasting credentials] From the App, you have to go > Node manager > Add a node (+) > select LND (not Scan QR). 

    If pasting, there are 4 fields where we'll paste the LND Connect URL we copied earlier:

    - Label (pick a name for your LND node)
    - Address (paste the address without the word "lndconnect")
    - Macaroon (paste the macaroon without the word "macaroon")
    - SSL Cert (optional field - leave it blank)

1. Press "SAVE"

You can now use Fully Noded with your LND node to send/receive bitcoin over the lightning network, open/close channels, connect to peers, etc!
