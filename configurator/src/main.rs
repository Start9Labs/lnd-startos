use rand::Rng;
use serde_json::{json, Value};
use std::env;
use std::fs::File;
use std::net::SocketAddr;
use std::path::Path;
use std::{
    io::{Read, Write},
    time::Duration,
};

use anyhow::anyhow;
use http::Uri;
use serde::{
    de::{Deserializer, Error as DeserializeError, Unexpected},
    ser::SerializeMap,
    Deserialize, Serialize, Serializer,
};
use x509_parser::pem;

fn deserialize_parse<'de, D: Deserializer<'de>, T: std::str::FromStr>(
    deserializer: D,
) -> Result<T, D::Error> {
    let s: String = Deserialize::deserialize(deserializer)?;
    s.parse()
        .map_err(|_| DeserializeError::invalid_value(Unexpected::Str(&s), &"a valid URI"))
}

fn parse_quick_connect_url(url: Uri) -> Result<(String, String, String, u16), anyhow::Error> {
    let auth = url
        .authority()
        .ok_or_else(|| anyhow::anyhow!("invalid Quick Connect URL"))?;
    let mut auth_split = auth.as_str().split(|c| c == ':' || c == '@');
    let user = auth_split
        .next()
        .ok_or_else(|| anyhow::anyhow!("missing user"))?;
    let pass = auth_split
        .next()
        .ok_or_else(|| anyhow::anyhow!("missing pass"))?;
    let host = url.host().unwrap();
    let port = url.port_u16().unwrap_or(8332);
    Ok((user.to_owned(), pass.to_owned(), host.to_owned(), port))
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
    watchtower_enabled: bool,
    watchtower_client_enabled: bool,
    advanced: AdvancedConfig,
    tor: TorConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct TorConfig {
    use_tor_only: bool,
    stream_isolation: bool,
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

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "kebab-case")]
enum BitcoinCoreConfig {
    #[serde(rename_all = "kebab-case")]
    Internal { user: String, password: String },
    #[serde(rename_all = "kebab-case")]
    InternalProxy { user: String, password: String },
    #[serde(rename_all = "kebab-case")]
    External {
        connection_settings: ExternalBitcoinCoreConfig,
    },
}

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "kebab-case")]
enum ExternalBitcoinCoreConfig {
    #[serde(rename_all = "kebab-case")]
    Manual {
        #[serde(deserialize_with = "deserialize_parse")]
        host: Uri,
        rpc_user: String,
        rpc_password: String,
        rpc_port: u16,
        zmq_block_port: u16,
        zmq_tx_port: u16,
    },
    #[serde(rename_all = "kebab-case")]
    QuickConnect {
        #[serde(deserialize_with = "deserialize_parse")]
        quick_connect_url: Uri,
        zmq_block_port: u16,
        zmq_tx_port: u16,
    },
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
        #[serde(rename = "NODE URI")]
        node_uri: Property<String>,
        #[serde(rename = "Alias")]
        alias: Property<String>,
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

#[derive(serde::Deserialize)]
pub struct CipherSeedMnemonic {
    cipher_seed_mnemonic: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct RestoreInfo {
    _app_version: emver::Version,
    _os_version: emver::Version,
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

fn restore_info(base_path: &Path) -> Result<Option<RestoreInfo>, anyhow::Error> {
    let path = base_path.join("start9/restore.yaml");
    if path.exists() {
        Ok(serde_yaml::from_reader(File::open(path)?)?)
    } else {
        Ok(None)
    }
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

fn main() -> Result<(), anyhow::Error> {
    while !Path::new("/root/.lnd/start9/config.yaml").exists() {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    let config: Config = serde_yaml::from_reader(File::open("/root/.lnd/start9/config.yaml")?)?;
    let alias = get_alias(&config)?;
    let control_tor_address = config.control_tor_address;
    let watchtower_tor_address = config.watchtower_tor_address;
    let peer_tor_address = config.peer_tor_address;
    if let Some(cmd) = env::args().skip(1).next() {
        if cmd == "properties" {
            properties(control_tor_address, peer_tor_address, alias);
            return Ok(());
        }
    }
    println!(
        "config fetched. alias = {:?}",
        config.alias.clone().unwrap_or("No alias found".to_owned())
    );
    println!("alias = {:?}", alias);
    {
        let mut outfile = File::create("/root/.lnd/lnd.conf")?;

        let (
            bitcoind_rpc_user,
            bitcoind_rpc_pass,
            bitcoind_rpc_host,
            bitcoind_rpc_port,
            bitcoind_zmq_host,
            bitcoind_zmq_block_port,
            bitcoind_zmq_tx_port,
        ) = match config.bitcoind {
            BitcoinCoreConfig::Internal { user, password } => (
                user,
                password,
                format!("bitcoind.embassy"),
                8332,
                format!("bitcoind.embassy"),
                28332,
                28333,
            ),
            BitcoinCoreConfig::InternalProxy { user, password } => (
                user,
                password,
                format!("btc-rpc-proxy.embassy"),
                8332,
                format!("bitcoind.embassy"),
                28332,
                28333,
            ),
            BitcoinCoreConfig::External {
                connection_settings:
                    ExternalBitcoinCoreConfig::Manual {
                        host,
                        rpc_user,
                        rpc_password,
                        rpc_port,
                        zmq_block_port,
                        zmq_tx_port,
                    },
            } => (
                rpc_user,
                rpc_password,
                format!("{}", host.host().unwrap()),
                rpc_port,
                format!("{}", host.host().unwrap()),
                zmq_block_port,
                zmq_tx_port,
            ),
            BitcoinCoreConfig::External {
                connection_settings:
                    ExternalBitcoinCoreConfig::QuickConnect {
                        quick_connect_url,
                        zmq_block_port,
                        zmq_tx_port,
                    },
            } => {
                let (bitcoin_rpc_user, bitcoin_rpc_pass, bitcoin_rpc_host, bitcoin_rpc_port) =
                    parse_quick_connect_url(quick_connect_url)?;
                (
                    bitcoin_rpc_user,
                    bitcoin_rpc_pass,
                    bitcoin_rpc_host.clone(),
                    bitcoin_rpc_port,
                    bitcoin_rpc_host,
                    zmq_block_port,
                    zmq_tx_port,
                )
            }
        };

        loop {
            if bitcoin_rpc_is_ready(&BitcoindRpcInfo {
                host: &bitcoind_rpc_host,
                port: bitcoind_rpc_port,
                user: &bitcoind_rpc_user,
                pass: &bitcoind_rpc_pass,
            }) {
                break;
            }
            println!("Waiting for bitcoin RPC...");
            std::thread::sleep(std::time::Duration::from_secs(1));
        }

        write!(
            outfile,
            include_str!("lnd.conf.template"),
            control_tor_address = control_tor_address,
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
            alias = alias,
            color = config.color,
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
            watchtower_enabled = config.watchtower_enabled,
            watchtower_client_enabled = config.watchtower_client_enabled,
            protocol_wumbo_channels = config.advanced.protocol_wumbo_channels,
            protocol_no_anchors = config.advanced.protocol_no_anchors,
            protocol_disable_script_enforced_lease =
                config.advanced.protocol_disable_script_enforced_lease,
            db_bolt_no_freelist_sync = config.advanced.db_bolt_no_freelist_sync,
            db_bolt_auto_compact = config.advanced.db_bolt_auto_compact,
            db_bolt_auto_compact_min_age = config.advanced.db_bolt_auto_compact_min_age,
            db_bolt_db_timeout = config.advanced.db_bolt_db_timeout,
            tor_enable_clearnet = !config.tor.use_tor_only,
            tor_stream_isolation = config.tor.stream_isolation
        )?;
    }

    // TLS Certificate migration from 0.11.0 -> 0.11.1 release (to include tor address)
    let cert_path = Path::new("/root/.lnd/tls.cert");
    if cert_path.exists() {
        let bs = std::fs::read(cert_path)?;
        let (_, pem) = pem::parse_x509_pem(&bs)?;
        let cert = pem.parse_x509()?;
        let subj_alt_name_oid = "2.5.29.17".parse().unwrap();
        let ext = cert
            .extensions()
            .get(&subj_alt_name_oid)
            .ok_or(anyhow!("No Alternative Names"))?
            .parsed_extension(); // oid for subject alternative names
        match ext {
            x509_parser::extensions::ParsedExtension::SubjectAlternativeName(names) => {
                if !(&names.general_names).into_iter().any(|a| match *a {
                    x509_parser::extensions::GeneralName::DNSName(host) => {
                        host == control_tor_address
                    }
                    _ => false,
                }) {
                    println!("Replacing Certificates");
                    // Delete the tls.key
                    std::fs::remove_file(Path::new("/root/.lnd/tls.key"))?;
                    // Delete the tls.cert
                    std::fs::remove_file(Path::new("/root/.lnd/tls.cert"))?;
                } else {
                    println!("Certificate check complete. No changes required.");
                }
            }
            _ => panic!("Type does not correspond with OID"),
        }
    } // if it doesn't exist, LND will correctly create it this time.

    let public_path = Path::new("/root/.lnd/public");
    // Create public directory to make accessible to dependents through the bindmounts interface
    println!("creating public directory... ");
    std::fs::create_dir_all(public_path)?;

    let cert_link = public_path.join("tls.cert");
    if cert_link.exists() {
        std::fs::remove_file(&cert_link)?;
    }

    // write backup ignore to the root of the mounted volume
    std::fs::write(
        Path::new("/root/.lnd/.backupignore.tmp"),
        include_str!(".backupignore.template"),
    )?;
    std::fs::rename("/root/.lnd/.backupignore.tmp", "/root/.lnd/.backupignore")?;

    // background configurator so lnd can start
    #[cfg(target_os = "linux")]
    nix::unistd::daemon(true, true)?;
    loop {
        if let Ok(_) = std::net::TcpStream::connect(SocketAddr::from(([127, 0, 0, 1], 10009))) {
            break;
        } else {
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    }

    while !cert_path.exists() {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    std::fs::hard_link(cert_path, &cert_link)?;

    let use_channel_backup_data = match restore_info(Path::new("/root/.lnd"))? {
        None => Ok(None::<serde_json::Value>),
        Some(_) => {
            println!(
                "Detected Embassy Restore. Conducting precautionary channel backup restoration."
            );
            let channel_backup_path =
                Path::new("/root/.lnd/data/chain/bitcoin/mainnet/channel.backup");
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
        }
    }?;

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
                    .arg("https://127.0.0.1:8080/v1/unlockwallet")
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
                    Some(o) => match o.get("error") {
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
                        std::thread::sleep(Duration::from_secs(10))
                    }
                    let mac = std::fs::read(Path::new(
                        "/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon",
                    ))?;
                    let mac_encoded = hex::encode_upper(mac);
                    let status = std::process::Command::new("curl")
                        .arg("--no-progress-meter")
                        .arg("-X")
                        .arg("POST")
                        .arg("--cacert")
                        .arg("/root/.lnd/tls.cert")
                        .arg("--header")
                        .arg(format!("Grpc-Metadata-macaroon: {}", mac_encoded))
                        .arg("https://127.0.0.1:8080/v1/channels/backup/restore")
                        .arg("-d")
                        .arg(serde_json::to_string(&backups)?)
                        .status()?;
                    if !status.success() {
                        return Err(anyhow::anyhow!("Error restoring wallet. Exiting."));
                    } else {
                        reset_restore(Path::new("/root/.lnd"))?;
                    }
                }
            },
        }
    } else {
        println!("creating password data");
        let mut password_bytes = [0; 16];
        let mut dev_random = File::open("/dev/random")?;
        dev_random.read_exact(&mut password_bytes)?;
        let output = std::process::Command::new("curl")
            .arg("--no-progress-meter")
            .arg("-X")
            .arg("POST")
            .arg("--cacert")
            .arg("/root/.lnd/tls.cert")
            .arg("https://127.0.0.1:8080/v1/genseed")
            .arg("-d")
            .arg(format!("{}", serde_json::json!({})))
            .output()?;
        eprint!("{}", std::str::from_utf8(&output.stderr)?);
        let CipherSeedMnemonic {
            cipher_seed_mnemonic,
        } = serde_json::from_slice(&output.stdout)?;
        let status = std::process::Command::new("curl")
            .arg("--no-progress-meter")
            .arg("-X")
            .arg("POST")
            .arg("--cacert")
            .arg("/root/.lnd/tls.cert")
            .arg("https://127.0.0.1:8080/v1/initwallet")
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
    }
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
    Ok(())
}

fn get_stats(
    control_tor_address: String,
    peer_tor_address: String,
    alias: String,
) -> Result<Properties, anyhow::Error> {
    let mut macaroon_file = File::open("/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon")?;
    let mut macaroon_vec = Vec::with_capacity(macaroon_file.metadata()?.len() as usize);
    let tls_cert = std::fs::read_to_string("/root/.lnd/tls.cert")?;
    macaroon_file.read_to_end(&mut macaroon_vec)?;
    let mac_encoded = hex::encode_upper(&macaroon_vec);
    let node_info: Option<LndGetInfoRes> = serde_json::from_slice(
        &std::process::Command::new("curl")
            .arg("--no-progress-meter")
            .arg("--cacert")
            .arg("/root/.lnd/tls.cert")
            .arg("--header")
            .arg(format!("Grpc-Metadata-macaroon: {}", mac_encoded))
            .arg("https://lnd.embassy:8080/v1/getinfo")
            .output()?
            .stdout,
    )
    .or::<anyhow::Error>(Ok(None))?;
    let stats: Properties = match node_info {
        Some(ni) => {
            let lnd_connect_grpc = Property {
                value_type: "string".to_owned(),
                value: format!(
                    "lndconnect://{control_tor_address}:10009?cert={cert}&macaroon={macaroon}",
                    control_tor_address = control_tor_address,
                    cert = base64::encode_config(
                        base64::decode(
                            tls_cert
                                .lines()
                                .filter(|l| !l.is_empty())
                                .filter(|l| *l != "-----BEGIN CERTIFICATE-----")
                                .filter(|l| *l != "-----END CERTIFICATE-----")
                                .collect::<String>()
                        )?,
                        base64::Config::new(base64::CharacterSet::UrlSafe, false)
                    ),
                    macaroon = base64::encode_config(
                        &macaroon_vec,
                        base64::Config::new(base64::CharacterSet::UrlSafe, false)
                    ),
                ),
                description: Some(
                    "Use this for other applications that require a gRPC connection".to_owned(),
                ),
                copyable: true,
                qr: true,
                masked: true,
            };
            let lnd_connect_rest = Property {
                value_type: "string".to_owned(),
                value: format!(
                    "lndconnect://{control_tor_address}:8080?cert={cert}&macaroon={macaroon}",
                    control_tor_address = control_tor_address,
                    cert = base64::encode_config(
                        base64::decode(
                            tls_cert
                                .lines()
                                .filter(|l| !l.is_empty())
                                .filter(|l| *l != "-----BEGIN CERTIFICATE-----")
                                .filter(|l| *l != "-----END CERTIFICATE-----")
                                .collect::<String>()
                        )?,
                        base64::Config::new(base64::CharacterSet::UrlSafe, false)
                    ),
                    macaroon = base64::encode_config(
                        &macaroon_vec,
                        base64::Config::new(base64::CharacterSet::UrlSafe, false)
                    ),
                ),
                description: Some(
                    "Use this for other applications that require a REST connection".to_owned(),
                ),
                copyable: true,
                qr: true,
                masked: true,
            };
            let node_uri = Property {
                value_type: "string".to_owned(),
                value: format!(
                    "{pubkey}@{peer_tor_address}:9735",
                    pubkey = ni.identity_pubkey,
                    peer_tor_address = peer_tor_address
                ),
                description: Some(
                    "Give this to others to allow them to add your LND node as a peer".to_owned(),
                ),
                copyable: true,
                qr: true,
                masked: false,
            };
            let stats = Properties {
                version: 2,
                data: Data::LND{
                    sync_height: Property {
                        value_type: "string".to_owned(),
                        value: format!("{}", ni.block_height),
                        description: Some(
                            "The latest block height that has been processed by LND".to_owned(),
                        ),
                        copyable: false,
                        qr: false,
                        masked: false,
                    },
                    synced_to_chain: Property {
                        value_type: "string".to_owned(),
                        value: if ni.synced_to_chain {
                            "✅".to_owned()
                        } else {
                            "❌".to_owned()
                        },
                        description: Some("Until this value is ✅, you may not be able to see transactions sent to your on chain wallet.".to_owned()),
                        copyable: false,
                        qr: false,
                        masked: false,
                    },
                    synced_to_graph: Property {
                        value_type: "string".to_owned(),
                        value: if ni.synced_to_graph {
                            "✅".to_owned()
                        } else {
                            "❌".to_owned()
                        },
                        description: Some("Until this value is ✅, you will experience problems sending payments over lightning.".to_owned()),
                        copyable: false,
                        qr: false,
                        masked: false,
                    },
                    lnd_connect_grpc,
                    lnd_connect_rest,
                    node_uri,
                    alias: Property {
                        value_type: "string".to_owned(),
                        value: alias,
                        description: Some("The human readable name your node can identify as on the Lightning Network".to_owned()),
                        copyable: false,
                        qr: false,
                        masked: false,
                    }
                },
            };
            serde_yaml::to_writer(File::create("/root/.lnd/start9/stats.yaml")?, &stats)?;
            stats
        }
        None => {
            const PROPERTIES_FALLBACK_MESSAGE: &str =
                "Could not find properties. The service might still be starting";
            let stats_path = Path::new("/root/.lnd").join("start9/stats.yaml");
            if stats_path.exists() {
                let stats: Properties =
                    serde_yaml::from_reader(File::open(stats_path).unwrap()).unwrap();
                stats
            } else {
                let stats = Properties {
                    version: 2,
                    data: Data::NotReady {
                        not_ready: Property {
                            value_type: "string".to_owned(),
                            value: PROPERTIES_FALLBACK_MESSAGE.to_owned(),
                            description: Some(
                                "Fallback Message When Properties could not be found".to_owned(),
                            ),
                            copyable: false,
                            qr: false,
                            masked: false,
                        },
                    },
                };
                stats
            }
        }
    };
    Ok(stats)
}

fn properties(control_tor_address: String, peer_tor_address: String, alias: String) -> () {
    let stats = match get_stats(control_tor_address, peer_tor_address, alias) {
        Err(e) => {
            println!("Warn: {:?}", e);
            return;
        }
        Ok(v) => v,
    };

    use std::io::stdout;
    if let Err(e) = serde_yaml::to_writer(stdout(), &stats) {
        println!("Warn: {:?}", e);
    }
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
struct BitcoindRpcInfo<'a> {
    host: &'a str,
    port: u16,
    user: &'a str,
    pass: &'a str,
}
fn bitcoin_rpc_is_ready(rpc_info: &BitcoindRpcInfo) -> bool {
    let body = json!({"jsonrpc": "1.0", "id": null, "method": "getblockchaininfo", "params": []});
    let client = reqwest::blocking::Client::new();
    let res = client
        .post(format!("http://{}:{}/", rpc_info.host, rpc_info.port))
        .basic_auth(rpc_info.user, Some(rpc_info.pass))
        .json(&body)
        .send();
    match res {
        Err(e) => {
            println!("{:?}", e);
            return false;
        }
        Ok(o) => {
            if o.status().as_u16() == 401 {
                panic!("Invalid credentials for bitcoind");
            } else {
                match o.json() {
                    Ok(JsonRpc1Res {
                        result: _,
                        error,
                        id: _,
                    }) => {
                        if let Some(e) = error {
                            println!("{}", e.message);
                            false
                        } else {
                            true
                        }
                    }
                    Err(e) => {
                        println!("{:?}", e);
                        false
                    }
                }
            }
        }
    }
}

#[test]
fn test() {
    assert!(bitcoin_rpc_is_ready(&BitcoindRpcInfo {
        host: "localhost",
        port: 8332,
        user: "bitcoin",
        pass: "testhere"
    }))
}
