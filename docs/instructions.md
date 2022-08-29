# Instructions for LND

## Initial Setup

Getting started with your LND node is very easy, but Lightning is not a game. There is real money involved, so please read the instructions carefully, and be sure to make frequent backups.

### Config

Your LND node is highly configurable. Many settings are considered _advanced_ and should be used with caution. For the vast majority of users and use-cases, we recommend using the defaults. Once configured, you may start your node!

### Dependencies

On Embassy, you have 3 options with regard to Bitcoin
1. Run an archival node. This is the default (recommended)
1. Run a pruned node. This will require installing Bitcoin Proxy from the Marketplace
1. Do not run a Bitcoin node. LND will use Neutrino instead (not recommended)

## Using Your Node

### Selecting a Wallet

For a list of compatible wallets and related instructions, see <a href="https://github.com/start9labs/lnd-wrapper/blob/master/docs/wallets.md" target="_blank" noreferrer>https://github.com/start9labs/lnd-wrapper/blob/master/docs/wallets.md</a>.

### Getting On-Chain Funds


Before you can open a channel and start transacting on the Lightning network, you need some Bitcoin stored on your LND node. Be advised, Bitcoin funds that you transfer to your LND node are "hot," meaning, they are stored directly on your Embassy. There is no way to use cold storage when using Lightning, which is why people call it "reckless." For this reason, it is usually unwise to move large amounts of Bitcoin to your LND node. That said, you don't want to move a tiny amount either, since that would limit your purchasing power on the Lightning network. We recommend moving about 500,000-5,000,000 satoshis, or .005-.05 Bitcoin, which at current (Summer 2022) prices is approximately $100-$1000 USD. This gives you a solid amount of purchasing power, but hopefully wouldn't ruin your life if something were to go terribly wrong. If you feel comfortable using more Bitcoin, then by all means, go for it.

### Opening a Channel and Getting Outbound Liquidity

Once your LND node is synced, it's time to open a channel. Opening a channel with a well-connected node is how you get connected to the rest of the network, and it immediately grants you outbound liquidity. Meaning, you will be able to send money to others. Unless you are planning to become a Lightning Service Provider, you do not want to open more than a couple of channels at most. Managing many channels is difficult, it can be quite expensive, and unless you plan to devote significant resources in the form of time and Bitcoin, there is no profit in it. If your goal is to use Lightning to benefit from instant and near-free transactions, you only need 2-3 good channels.

If you are looking for destinations for your first channel, we suggest you open a channel with the [Start9 HQ](025d28dc4c4f5ce4194c31c3109129cd741fafc1ff2f6ea53f97de2f58877b2295@64.225.19.231:9735) node, which is already very well connected.

It is not recommended to open a channel less than 100,000 satoshi, or .001 BTC. Anything less, and it's possible that the cost to open and close the channel might approach the size of the channel itself. The bigger the channel you open, the more outbound liquidity you will have, which means you have more spending power on the network. In this tutorial, we are going to open a channel of 2,000,000 satoshi. When opening a channel with Start9 HQ, we ask that you make it a private channel, meaning it will not display publicly on network graph. The reason for this is that unless you plan to be a very active Lightning Node Operator, having public channels decreases not only the reliability of your node but also hurts Start9's ability to route payments for you. If you do intend to be a serious node operator, we require that your channel be for a minimum of 5,000,000 sats. Please contact us in one of our [community channels](https://start9.com/latest/support/contact) for further details.

### Getting Inbound Liquidity

If you want to receive payments, you will need some inbound liquidity.

The first, easiest, and best way to get inbound liquidity is to use your outbound liquidity to buy something. Any Bitcoin you spend using your outbound liquidity is Bitcoin you can now receive back. So if there is something you want to buy, like a Start9 Embassy or a t-shirt from the [Start9 store](https://store.start9.com/), simply make the purchase by paying a Lightning invoice, and you will then have inbound liquidity equal to the amount of Satoshis you spend.  You may also sell some Bitcoin to a friend that already has established Lightning channels.

You can also use services like Lightning Pool to obtain inbound liquidity for a fee. This service is available inside of Lightning Terminal, which you can download from the Marketplace.

The only way to get inbound liquidity without spending or selling Bitcoin is to convince someone to open a channel with you, just as you opened a channel with Start9 HQ. This may be a difficult task, since there is not much incentive for someone to open a channel with you unless you are also very well connected. Also, you will need to make sure that they too, are well connected with plenty of inbound liquidity, or else your inbound liquidity with them will not really matter. In other words, they might be the only person capable of paying you.

## Backups

You Lightning node stores funds in two places: on-chain and in channels that you have opened. The only way to back up the funds in the channels is to back up the entire node. On Embassy, this is a simple matter of creating a backup in the `Embassy` menu and selecting LND. This backup _automatically_ includes your on-chain funds as well, so there is no reason to back those up separately. You do not need a seed phrase or other backup mechanism. Simply create a backup using the standard Embassy backup flow.

Be advised, if you evern need to recover from backup, _your channels will be closed_ and all channel funds will be moved to your on-chain balance. This is a necessary aspect of the way LND works and backups are created.

## Watchtowers

In LND, watchtowers act as a second line of defense in responding to malicious or accidental breach scenarios in the event that the client’s node is offline or unable to respond at the time of a breach, offering greater degree of safety to channel funds.

### Being a Watchtower for Others

You can make your LND node a watchtower for others by enabling in settings. There is immediate economic reason to do this, but you may want to do it for friends or family, or a second LND node of your own. Once enabled, you share your watchtower public key with whomever you want to use it.

Be advised, your watchtower’s public key is *different* from lnd’s node public key. It is not known the network. We recommend NOT disclosing this public key openly, unless you are prepared to open your tower up to the entire Internet.

### Using a Watchtower

You can enlist watchtowers to watch your node by using `Add a watchtower to your LND Node` in Actions or in Config options. This will back up your LND node state to the remote watchtower you entered. NOTE: For now, watchtowers will only backup the `to_local` and `to_remote` outputs from revoked commitments; backing up HTLC outputs is slated to be deployed in a future release, as the protocol can be extended to include the extra signature data in the encrypted blobs.
