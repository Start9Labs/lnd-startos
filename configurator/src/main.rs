use bitcoincore_rpc::RpcApi;
use rand::Rng;
use serde_json::Value;
use std::fs::File;
use std::net::{Ipv4Addr, SocketAddr};
use std::path::Path;
use std::process::Command;
use std::str::FromStr;
use std::{
    io::{self, Read, Write},
    time::Duration,
};

use serde::{ser::SerializeMap, Deserialize, Serialize, Serializer};

fn parse_iface_ip(output: &str) -> Result<Option<&str>, anyhow::Error> {
    let output = output.trim();
    if output.is_empty() {
        return Ok(None);
    }
    if let Some(ip) = output.split_ascii_whitespace().nth(3) {
        Ok(Some(ip))
    } else {
        Err(anyhow::anyhow!("malformed output from `ip`"))
    }
}

pub fn get_iface_ipv4_addr(iface: &str) -> Result<Option<Ipv4Addr>, anyhow::Error> {
    Ok(parse_iface_ip(&String::from_utf8(
        Command::new("ip")
            .arg("-4")
            .arg("-o")
            .arg("addr")
            .arg("show")
            .arg(iface)
            .output()?
            .stdout,
    )?)?
    .map(|s| Ok::<_, anyhow::Error>(s.split("/").next().unwrap().parse()?))
    .transpose()?)
}

struct SkipNulls(Value);
impl Serialize for SkipNulls {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match &self.0 {
            serde_json::Value::Object(map) => {
                let mut map_serializer = serializer.serialize_map(Some(map.len()))?;
                for (k, v) in map.into_iter().filter(|(_, v)| v != &&Value::Null) {
                    map_serializer.serialize_entry(k, v)?;
                }
                map_serializer.end()
            }
            other => Value::serialize(other, serializer),
        }
    }
}
impl std::fmt::Display for SkipNulls {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", serde_json::to_string(self).unwrap())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct Config {
    control_tor_address: String,
    peer_tor_address: String,
    watchtower_tor_address: String,
    alias: Option<String>,
    color: String,
    accept_keysend: bool,
    accept_amp: bool,
    reject_htlc: bool,
    min_chan_size: Option<u64>,
    max_chan_size: Option<u64>,
    bitcoind: BitcoinCoreConfig,
    autopilot: AutoPilotConfig,
    watchtowers: WatchtowerConfig,
    advanced: AdvancedConfig,
    tor: TorConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct TorConfig {
    use_tor_only: bool,
    stream_isolation: bool,
}
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(tag = "enabled")]
#[serde(rename_all = "kebab-case")]
enum WtClient {
    #[serde(rename_all = "kebab-case")]
    Disabled,
    #[serde(rename_all = "kebab-case")]
    Enabled {
        add_watchtowers: Vec<String>
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "kebab-case")]
struct WatchtowerConfig {
    wt_server: bool,
    wt_client: WtClient,
}

#[derive(Deserialize, Serialize)]
struct TowerInfo {
    pubkey: String,
    listeners: Vec<String>,
    uris: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
struct BitcoinChannelConfig {
    default_channel_confirmations: usize,
    min_htlc: u64,
    min_htlc_out: u64,
    base_fee: u64,
    fee_rate: u64,
    time_lock_delta: usize,
}

#[derive(serde::Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
#[serde(rename_all = "kebab-case")]
enum BitcoinCoreConfig {
    #[serde(rename_all = "kebab-case")]
    None,
    #[serde(rename_all = "kebab-case")]
    Internal { user: String, password: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct AutoPilotConfig {
    enabled: bool,
    private: bool,
    maxchannels: usize,
    allocation: f64,       // %
    min_channel_size: u64, // sats
    max_channel_size: u64, // sats
    advanced: AutoPilotAdvancedConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct AutoPilotAdvancedConfig {
    min_confirmations: usize,
    confirmation_target: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct AdvancedConfig {
    debug_level: String,
    db_bolt_no_freelist_sync: bool,
    db_bolt_auto_compact: bool,
    db_bolt_auto_compact_min_age: u64,
    db_bolt_db_timeout: u64,
    recovery_window: Option<usize>,
    payments_expiration_grace_period: usize,
    default_remote_max_htlcs: usize,
    max_channel_fee_allocation: f64,
    max_commit_fee_rate_anchors: usize,
    protocol_wumbo_channels: bool,
    protocol_no_anchors: bool,
    protocol_disable_script_enforced_lease: bool,
    gc_canceled_invoices_on_startup: bool,
    allow_circular_route: bool,
    bitcoin: BitcoinChannelConfig,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Properties {
    version: u8,
    data: Data,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum Data {
    LND {
        #[serde(rename = "LND Sync Height")]
        sync_height: Property<String>,
        #[serde(rename = "Synced To Chain")]
        synced_to_chain: Property<String>,
        #[serde(rename = "Synced To Graph")]
        synced_to_graph: Property<String>,
        #[serde(rename = "LND Connect gRPC URL")]
        lnd_connect_grpc: Property<String>,
        #[serde(rename = "LND Connect REST URL")]
        lnd_connect_rest: Property<String>,
        #[serde(rename = "Node URI")]
        node_uri: Property<String>,
        #[serde(rename = "Node Alias")]
        node_alias: Property<String>,
        #[serde(rename = "Node Id")]
        node_id: Property<String>,
    },
    NotReady {
        #[serde(rename = "Not Ready")]
        not_ready: Property<String>,
    },
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Property<T> {
    #[serde(rename = "type")]
    value_type: String,
    value: T,
    description: Option<String>,
    copyable: bool,
    qr: bool,
    masked: bool,
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct CipherSeedMnemonic {
    cipher_seed_mnemonic: Vec<String>,
}

#[derive(serde::Deserialize, Debug)]
pub struct LndGetInfoRes {
    identity_pubkey: String,
    block_height: u32,
    synced_to_chain: bool,
    synced_to_graph: bool,
}

fn get_alias(config: &Config) -> Result<String, anyhow::Error> {
    Ok(match &config.alias {
        // if it isn't defined in the config
        None => {
            // generate it and write it to a file
            let alias_path = Path::new("/root/.lnd/default_alias.txt");
            if alias_path.exists() {
                std::fs::read_to_string(alias_path)?
            } else {
                let mut rng = rand::thread_rng();
                let default_alias = format!("start9-{:#010x}", rng.gen::<u64>());
                std::fs::write(alias_path, &default_alias)?;
                default_alias
            }
        }
        Some(a) => a.clone(),
    })
}

fn is_restore(base_path: &Path) -> bool {
    let path = base_path.join("start9/restore.yaml");
    path.exists()
}

fn reset_restore(base_path: &Path) -> Result<(), anyhow::Error> {
    let path = base_path.join("start9/restore.yaml");
    std::fs::remove_file(path).map_err(From::from)
}

pub fn local_port_available(port: u16) -> Result<bool, anyhow::Error> {
    match std::net::TcpListener::bind(("127.0.0.1", port)) {
        Ok(_) => Ok(true),
        Err(e) => {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                Ok(false)
            } else {
                Err(anyhow::anyhow!("Couldn't determine port use for {}", port))
            }
        }
    }
}
                
fn save_to_file(cipher_seed_mnemonic: &[String], file_path: &str) -> io::Result<()> {
    let mut file = File::create(file_path)?;
    for (i, word) in cipher_seed_mnemonic.iter().enumerate() {
        writeln!(file, "{} {}", i + 1, word)?;
    }
    Ok(())
}

struct WatchtowerUri {
    pubkey: String,
    address: String,
}
impl FromStr for WatchtowerUri {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut split_input = s.split("@");
        let pubkey = match split_input.next() {
            Some(x) => x.to_string(),
            None => anyhow::bail!("Couldn't parse the pubkey from watchtower URI"),
        };
        let address = match split_input.next() {
            Some(x) => x.to_string(),
            None => anyhow::bail!("Couldn't parse the address from watchtower URI"),
        };
        Ok(WatchtowerUri { pubkey, address })
    }
}

fn main() -> Result<(), anyhow::Error> {
    while !Path::new("/root/.lnd/start9/config.yaml").exists() {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    let config: Config = serde_yaml::from_reader(File::open("/root/.lnd/start9/config.yaml")?)?;
    let alias = get_alias(&config)?;
    let control_tor_address = config.control_tor_address;
    let watchtower_tor_address = config.watchtower_tor_address;
    let peer_tor_address = config.peer_tor_address;

    println!(
        "config fetched. alias = {:?}",
        config.alias.clone().unwrap_or("No alias found".to_owned())
    );
    println!("alias = {:?}", alias);
    let mut outfile = File::create("/root/.lnd/lnd.conf")?;

    let bitcoind_selected = match &config.bitcoind {
        BitcoinCoreConfig::None => false,
        _ => true,
    };

    println!("bitcoind_selected = {}", bitcoind_selected);

    let (
        bitcoind_rpc_user,
        bitcoind_rpc_pass,
        bitcoind_rpc_host,
        bitcoind_rpc_port,
        bitcoind_zmq_host,
        bitcoind_zmq_block_port,
        bitcoind_zmq_tx_port,
    ) = match config.bitcoind {
        BitcoinCoreConfig::None => (String::new(), String::new(), "", 0, "", 0, 0),
        BitcoinCoreConfig::Internal { user, password } => (
            user,
            password,
            "bitcoind.embassy",
            8332,
            "bitcoind.embassy",
            28332,
            28333,
        ),
    };

    let rpc_info = &BitcoindRpcInfo {
        host: &bitcoind_rpc_host,
        port: bitcoind_rpc_port,
        user: &bitcoind_rpc_user,
        pass: &bitcoind_rpc_pass,
    };

    let mut bitcoin_synced = false;

    if bitcoind_selected {
        loop {
            if bitcoin_rpc_is_ready(rpc_info)? {
                break;
            }
            println!("Waiting for bitcoin RPC...");
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
        bitcoin_synced = bitcoin_is_synced(rpc_info)?;
        println!("bitcoin_synced = {}", bitcoin_synced);
    }

    let use_neutrino = !(bitcoind_selected && bitcoin_synced);
    println!("use_neutrino = {}", use_neutrino);

    let container_ip = get_iface_ipv4_addr("eth0").unwrap_or_else(|e| {
        eprintln!("{e}");
        None
    });

    write!(
        outfile,
        include_str!("lnd.conf.template"),
        container_ip = container_ip.unwrap_or_else(|| [0, 0, 0, 0].into()),
        peer_tor_address = peer_tor_address,
        watchtower_tor_address = watchtower_tor_address,
        payments_expiration_grace_period = config.advanced.payments_expiration_grace_period,
        debug_level = config.advanced.debug_level,
        min_chan_size_row = match config.min_chan_size {
            None => String::new(),
            Some(u) => format!("minchansize={}", u),
        },
        max_chan_size_row = match config.max_chan_size {
            None => String::new(),
            Some(u) => format!("maxchansize={}", u),
        },
        default_remote_max_htlcs = config.advanced.default_remote_max_htlcs,
        reject_htlc = config.reject_htlc,
        max_channel_fee_allocation = config.advanced.max_channel_fee_allocation,
        max_commit_fee_rate_anchors = config.advanced.max_commit_fee_rate_anchors,
        accept_keysend = config.accept_keysend,
        accept_amp = config.accept_amp,
        gc_canceled_invoices_on_startup = config.advanced.gc_canceled_invoices_on_startup,
        allow_circular_route = config.advanced.allow_circular_route,
        alias = alias,
        color = config.color,
        feeurl_row = if use_neutrino {
            "feeurl=https://nodes.lightning.computer/fees/v1/btc-fee-estimates.json"
        } else {
            ""
        },
        bitcoin_node = if use_neutrino { "neutrino" } else { "bitcoind" },
        bitcoin_default_chan_confs = config.advanced.bitcoin.default_channel_confirmations,
        bitcoin_min_htlc = config.advanced.bitcoin.min_htlc,
        bitcoin_min_htlc_out = config.advanced.bitcoin.min_htlc_out,
        bitcoin_base_fee = config.advanced.bitcoin.base_fee,
        bitcoin_fee_rate = config.advanced.bitcoin.fee_rate,
        bitcoin_time_lock_delta = config.advanced.bitcoin.time_lock_delta,
        bitcoind_rpc_user = bitcoind_rpc_user,
        bitcoind_rpc_pass = bitcoind_rpc_pass,
        bitcoind_rpc_host = bitcoind_rpc_host,
        bitcoind_rpc_port = bitcoind_rpc_port,
        bitcoind_zmq_host = bitcoind_zmq_host,
        bitcoind_zmq_block_port = bitcoind_zmq_block_port,
        bitcoind_zmq_tx_port = bitcoind_zmq_tx_port,
        autopilot_enabled = config.autopilot.enabled,
        autopilot_maxchannels = config.autopilot.maxchannels,
        autopilot_allocation = config.autopilot.allocation / 100.0,
        autopilot_min_channel_size = config.autopilot.min_channel_size,
        autopilot_max_channel_size = config.autopilot.max_channel_size,
        autopilot_private = config.autopilot.private,
        autopilot_min_confirmations = config.autopilot.advanced.min_confirmations,
        autopilot_confirmation_target = config.autopilot.advanced.confirmation_target,
        protocol_wumbo_channels = config.advanced.protocol_wumbo_channels,
        protocol_no_anchors = config.advanced.protocol_no_anchors,
        protocol_disable_script_enforced_lease =
            config.advanced.protocol_disable_script_enforced_lease,
        db_bolt_no_freelist_sync = config.advanced.db_bolt_no_freelist_sync,
        db_bolt_auto_compact = config.advanced.db_bolt_auto_compact,
        db_bolt_auto_compact_min_age = config.advanced.db_bolt_auto_compact_min_age,
        db_bolt_db_timeout = config.advanced.db_bolt_db_timeout,
        tor_enable_clearnet = !config.tor.use_tor_only,
        tor_stream_isolation = config.tor.stream_isolation,
        wt_server = config.watchtowers.wt_server,
        wt_client = match config.watchtowers.wt_client {
            WtClient::Disabled => false,
            _ => true
        }
    )?;
    let public_path = Path::new("/root/.lnd/public");
    // Create public directory to make accessible to dependents through the bindmounts interface
    println!("creating public directory...");
    std::fs::create_dir_all(public_path)?;

    // write backup ignore to the root of the mounted volume
    println!("writing .backupignore...");
    std::fs::write(
        Path::new("/root/.lnd/.backupignore.tmp"),
        include_str!(".backupignore.template"),
    )?;
    std::fs::rename("/root/.lnd/.backupignore.tmp", "/root/.lnd/.backupignore")?;

    // background configurator so lnd can start
    #[cfg(target_os = "linux")]
    nix::unistd::daemon(true, true)?;
    let container_ip = container_ip.unwrap_or_else(|| [127, 0, 0, 1].into());
    println!("checking port 10009 on {container_ip} (gRPC control port)...");
    loop {
        if let Ok(_) = std::net::TcpStream::connect(SocketAddr::from((container_ip, 10009))) {
            break;
        } else {
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    }

    println!("checking if we need to restore from channel backup...");
    let use_channel_backup_data = if is_restore(Path::new("/root/.lnd")) {
        println!("Detected Embassy Restore. Conducting precautionary channel backup restoration.");
        let channel_backup_path = Path::new("/root/.lnd/data/chain/bitcoin/mainnet/channel.backup");
        if channel_backup_path.exists() {
            let bs = std::fs::read(channel_backup_path)?;
            // backup all except graph db
            // also delete graph db always
            // happen in backup action not in entrypoint
            std::fs::remove_dir_all("/root/.lnd/data/graph")?;
            let encoded = base64::encode(bs);
            Ok::<Option<Value>, std::io::Error>(Some(serde_json::json!({
                "multi_chan_backup": encoded
            })))
        } else {
            println!("No channel restoration required. No channel backup exists.");
            Ok(None)
        }
    } else {
        Ok(None)
    }?;

    println!("unlocking wallet...");
    if Path::new("/root/.lnd/pwd.dat").exists() {
        let pass_file = File::open("/root/.lnd/pwd.dat")?;
        let pass_size = pass_file.metadata().unwrap().len();
        let mut password_bytes = Vec::with_capacity(pass_size as usize);
        pass_file.take(pass_size).read_to_end(&mut password_bytes)?;
        let status = {
            use std::process;
            let mut res;
            let stat;
            loop {
                std::thread::sleep(Duration::from_secs(5));
                let cmd = process::Command::new("curl")
                    .arg("--no-progress-meter")
                    .arg("-X")
                    .arg("POST")
                    .arg("--cacert")
                    .arg("/root/.lnd/tls.cert")
                    .arg("https://lnd.embassy:8080/v1/unlockwallet")
                    .arg("-d")
                    .arg(serde_json::to_string(&SkipNulls(serde_json::json!({
                        "wallet_password": base64::encode(&password_bytes),
                        "recovery_window": config.advanced.recovery_window,
                    })))?)
                    .stdin(process::Stdio::piped())
                    .stdout(process::Stdio::piped())
                    .stderr(process::Stdio::piped())
                    .spawn()?;
                res = cmd.wait_with_output()?;
                let output = String::from_utf8(res.stdout)?.parse::<Value>()?;
                match output.as_object() {
                    None => {
                        stat = Err(anyhow::anyhow!(
                            "Invalid output from wallet unlock attempt: {:?}",
                            output
                        ));
                        break;
                    }
                    Some(o) => match o.get("message") {
                        None => {
                            stat = Ok(output);
                            break;
                        }
                        Some(v) => match v.as_str() {
                            None => {
                                stat = Err(anyhow::anyhow!(
                                    "Invalid error output from wallet unlock attempt: {:?}",
                                    v
                                ));
                                break;
                            }
                            Some(s) => {
                                if s.contains("waiting to start") {
                                    continue;
                                } else {
                                    stat = Err(anyhow::anyhow!("{}", s));
                                    break;
                                }
                            }
                        },
                    },
                }
            }
            stat
        };
        match status {
            Err(e) => {
                println!("{}", e);
                return Err(anyhow::anyhow!("Error unlocking wallet. Exiting."));
            }
            // wallet unlocking has to happen while LND running (encrypted on disk) creds are stored in separate place on disk (pwd.dat in our case - in data volume)
            Ok(_) => match use_channel_backup_data {
                None => (),
                Some(backups) => {
                    while local_port_available(8080)? {
                        std::thread::sleep(Duration::from_secs(20))
                    }
                    let mac = std::fs::read(Path::new(
                        "/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon",
                    ))?;
                    let mac_encoded = hex::encode_upper(mac);
                    let stat;
                    loop {
                        std::thread::sleep(Duration::from_secs(5));
                        let output = std::process::Command::new("curl")
                            .arg("--no-progress-meter")
                            .arg("-X")
                            .arg("POST")
                            .arg("--header")
                            .arg(format!("Grpc-Metadata-macaroon: {}", mac_encoded))
                            .arg("--cacert")
                            .arg("/root/.lnd/tls.cert")
                            .arg("https://lnd.embassy:8080/v1/channels/backup/restore")
                            .arg("-d")
                            .arg(serde_json::to_string(&backups)?)
                            .output()?;
                        let output = String::from_utf8(output.stdout)?.parse::<Value>()?;
                        println!("{}", output);
                        match output.as_object() {
                            None => {
                                stat = Err(anyhow::anyhow!(
                                    "Invalid output from backup restoration attempt: {:?}",
                                    output
                                ));
                                break;
                            }
                            Some(o) => match o.get("message") {
                                None => {
                                    stat = Ok(output);
                                    break;
                                }
                                Some(v) => match v.as_str() {
                                    None => {
                                        stat = Err(anyhow::anyhow!(
                                            "Invalid error output from backup restoration attempt: {:?}",
                                            v
                                        ));
                                        break;
                                    }
                                    Some(s) => {
                                        if s.contains("server is still in the process of starting")
                                        {
                                            continue;
                                        } else {
                                            stat = Err(anyhow::anyhow!("{}", s));
                                            break;
                                        }
                                    }
                                },
                            },
                        }
                    }
                    match stat {
                        Err(e) => {
                            eprintln!("Error restoring wallet. Exiting.");
                            return Err(e);
                        }
                        Ok(_) => {
                            println!("Successfully restored wallet.");
                            reset_restore(Path::new("/root/.lnd"))?;
                        }
                    }
                }
            },
        }
    } else {

        let mut cipher_seed_created = false;
        let mut password_bytes = [0; 16];
        let mut dev_random = File::open("/dev/random")?;
        let file_path = "/root/.lnd/start9/cipherSeedMnemonic.txt";

        while !cipher_seed_created {
            println!("creating password data");
            dev_random.read_exact(&mut password_bytes)?;
            let output = std::process::Command::new("curl")
                .arg("--no-progress-meter")
                .arg("-X")
                .arg("GET")
                .arg("--cacert")
                .arg("/root/.lnd/tls.cert")
                .arg("https://lnd.embassy:8080/v1/genseed")
                .arg("-d")
                .arg(format!("{}", serde_json::json!({})))
                .output()?;
            if !output.status.success() {
                eprintln!("{}", std::str::from_utf8(&output.stderr)?);
                return Err(anyhow::anyhow!("Error generating seed. Exiting."));
            }
            
            if let Ok(CipherSeedMnemonic {
                cipher_seed_mnemonic,
            }) = serde_json::from_slice(&output.stdout) {
                println!("CipherSeed successfully generated");

                if let Err(err) = save_to_file(&cipher_seed_mnemonic, file_path) {
                    eprintln!("Failed to save the CipherSeedMnemonic: {}", err);
                } else {
                    println!("CipherSeedMnemonic saved to '{}'", file_path);
                }
        
                let status = std::process::Command::new("curl")
                    .arg("--no-progress-meter")
                    .arg("-X")
                    .arg("POST")
                    .arg("--cacert")
                    .arg("/root/.lnd/tls.cert")
                    .arg("https://lnd.embassy:8080/v1/initwallet")
                    .arg("-d")
                    .arg(format!(
                        "{}",
                        serde_json::json!({
                            "wallet_password": base64::encode(&password_bytes),
                            "cipher_seed_mnemonic": cipher_seed_mnemonic,
                        })
                    ))
                    .status()?;
                if status.success() {
                    let mut pass_file = File::create("/root/.lnd/pwd.dat")?;
                    pass_file.write_all(&password_bytes)?;
                } else {
                    return Err(anyhow::anyhow!("Error creating wallet. Exiting."));
                }
                cipher_seed_created = true
            } else {
                println!("Waiting for RPC to start...");
                std::thread::sleep(Duration::from_secs(5));
            }
        }
    }
    
    println!("copying macaroon to public dir...");
    while !Path::new("/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon").exists() {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    for macaroon in std::fs::read_dir("/root/.lnd/data/chain/bitcoin/mainnet")? {
        let macaroon = macaroon?;
        if macaroon.path().extension().and_then(|s| s.to_str()) == Some("macaroon") {
            std::fs::copy(
                macaroon.path(),
                public_path.join(macaroon.path().file_name().unwrap()),
            )?;
        }
    }

    match config.watchtowers.wt_server {
        false => {
            println!("Watchtower Server disabled");
            if let Err(_) = std::fs::remove_file("/root/.lnd/start9/towerServerUrl") {
                println!("The towerServerUrl file does not exist or cannot be deleted.");
            } else {
                println!("The towerServerUrl file has been deleted successfully.");
            }
        }
        true => {
            loop {
                let output =Command::new("lncli")
                    .arg("--rpcserver=lnd.embassy")
                    .arg("tower")
                    .arg("info")
                    .output();
                match output {
                    Ok(output) if output.status.success() => {
                        println!("Tower server {:?} started", &output);
                        let tower_info_response = String::from_utf8_lossy(&output.stdout);
                        let tower_server: TowerInfo = serde_json::from_str(&tower_info_response).expect("Failed to parse Tower Info JSON response");
                        let result = std::fs::write("/root/.lnd/start9/towerServerUrl", &tower_server.uris[0]);
                        match result {
                            Ok(_) => {println!("Tower {} written towerServerUrl", &tower_server.uris[0]);}
                            Err(err) => {println!("Error writing Tower server to Properties: {}", err);}
                        }
                        break;
                    }
                    Ok(output) => {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        println!("Failed to retreive tower info with error: {}", stderr);
                        std::thread::sleep(Duration::from_secs(10));
                    }
                    Err(_) => {
                        println!("Error running the command: lncli --rpcserver=lnd.embassy tower info");
                        std::thread::sleep(Duration::from_secs(10));
                    }
                }
            }
        }
    }

    if true {
        match config.watchtowers.wt_client {
            WtClient::Disabled => {
                println!("Watchtower Client Disabled");
            }
            WtClient::Enabled {add_watchtowers} => {
                for watchtower_uri in add_watchtowers.iter() {
                    let parsed_watchtower_uri: WatchtowerUri = watchtower_uri.parse()?;
                    loop {
                        println!("Configuring Watchtower for {}... ", alias);
                        println!(
                            "pubkey: {} || host: {}",
                            &parsed_watchtower_uri.pubkey, &parsed_watchtower_uri.address
                        );
                        let output = Command::new("lncli")
                            .arg("--rpcserver=lnd.embassy")
                            .arg("wtclient")
                            .arg("add")
                            .arg(&watchtower_uri)
                            .output();
                        println!("The lncli command ran for {}", &watchtower_uri);
                        match output {
                            Ok(output) if output.status.success() => {
                                println!("Added watchtower {}.", &watchtower_uri);
                                break;
                            }
                            Ok(output) => {
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                println!("Failed to add watchtower {} with error: {}", &watchtower_uri, stderr);
                                std::thread::sleep(Duration::from_secs(10));
                            }
                            Err(_) => {
                                println!("Error running the command: lncli --rpcserver=lnd.embassy wtclient add {}.", &watchtower_uri);
                                std::thread::sleep(Duration::from_secs(10));
                            }
                        }
                    };
                }
            }
        }
    };

    if bitcoind_selected {
        println!("looping forever to see if we need to switch backends...");
        loop {
            let bitcoin_synced = match bitcoin_is_synced(rpc_info) {
                Ok(bs) => bs,
                Err(e) => {
                    println!("Error checking whether bitcoin is synced: {:?}", e);
                    std::thread::sleep(std::time::Duration::from_secs(60));
                    continue;
                }
            };
            if use_neutrino == bitcoin_synced {
                if bitcoin_synced {
                    println!("Detected bitcoind end of IBD. Restarting to turn off Neutrino.");
                } else {
                    println!("Detected bitcoind in IBD. Restarting to turn on Neutrino.");
                }
                let parent_process_id = nix::unistd::getppid();
                nix::sys::signal::kill(parent_process_id, nix::sys::signal::Signal::SIGTERM)?;
            }
            std::thread::sleep(std::time::Duration::from_secs(60));
        }
    };

    println!("configurator exiting...");

    Ok(())
}


#[derive(Serialize, Deserialize)]
struct JsonRpc1Res {
    result: serde_json::Value,
    error: Option<BitcoindError>,
    id: serde_json::Value,
}
#[derive(Debug, Serialize, Deserialize)]
struct BitcoindError {
    code: i32,
    message: String,
}

#[derive(Debug)]
struct BitcoindRpcInfo<'a> {
    host: &'a str,
    port: u16,
    user: &'a str,
    pass: &'a str,
}

fn bitcoin_rpc_is_ready(rpc_info: &BitcoindRpcInfo) -> Result<bool, anyhow::Error> {
    let rpc_client = bitcoincore_rpc::Client::new(
        &*format!("http://{}:{}", rpc_info.host, rpc_info.port),
        bitcoincore_rpc::Auth::UserPass(rpc_info.user.to_owned(), rpc_info.pass.to_owned()),
    )?;
    Ok(rpc_client.get_best_block_hash().is_ok())
}

fn bitcoin_is_synced(rpc_info: &BitcoindRpcInfo) -> Result<bool, anyhow::Error> {
    let rpc_client = bitcoincore_rpc::Client::new(
        &*format!("http://{}:{}", rpc_info.host, rpc_info.port),
        bitcoincore_rpc::Auth::UserPass(rpc_info.user.to_owned(), rpc_info.pass.to_owned()),
    )?;
    match rpc_client.get_blockchain_info() {
        Ok(bir) => Ok(!bir.initial_block_download),
        Err(e) => Err(anyhow::anyhow!("Bitcoin RPC Error {:?}", e)),
    }
}
