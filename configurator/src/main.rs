use rand::Rng;
use std::fs::File;
use std::io::{Read, Write};
use std::net::{IpAddr, SocketAddr};
use std::path::Path;

use anyhow::anyhow;
use http::Uri;
use serde::{
    de::{Deserializer, Error as DeserializeError, Unexpected},
    Deserialize,
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

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct Config {
    alias: Option<String>,
    color: String,
    bitcoind: BitcoinCoreConfig,
    autopilot: AutoPilotConfig,
    watchtower_enabled: bool,
    watchtower_client_enabled: bool,
    advanced: AdvancedConfig,
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
    Internal {
        rpc_address: IpAddr,
        zmq_address: IpAddr,
        user: String,
        password: String,
    },
    #[serde(rename_all = "kebab-case")]
    External {
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
    payments_expiration_grace_period: usize,
    bitcoin: BitcoinChannelConfig,
}

#[derive(serde::Serialize)]
pub struct Properties {
    version: u8,
    data: Data,
}

#[derive(serde::Serialize)]
pub struct Data {
    #[serde(rename = "LND Connect gRPC URL")]
    lnd_connect_grpc: Property<String>,
    #[serde(rename = "LND Connect REST URL")]
    lnd_connect_rest: Property<String>,
}

#[derive(serde::Serialize)]
pub struct Property<T> {
    #[serde(rename = "type")]
    value_type: &'static str,
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

fn main() -> Result<(), anyhow::Error> {
    let config: Config = serde_yaml::from_reader(File::open("/root/.lnd/start9/config.yaml")?)?;
    let alias = match config.alias {
        None => {
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
        Some(a) => a,
    };
    let tor_address = std::env::var("TOR_ADDRESS")?;
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
            BitcoinCoreConfig::Internal {
                rpc_address,
                zmq_address,
                user,
                password,
            } => (
                user,
                password,
                format!("{}", rpc_address),
                8332,
                format!("{}", zmq_address),
                28332,
                28333,
            ),
            BitcoinCoreConfig::External {
                host,
                rpc_user,
                rpc_password,
                rpc_port,
                zmq_block_port,
                zmq_tx_port,
            } => (
                rpc_user,
                rpc_password,
                format!("{}", host.host().unwrap()),
                rpc_port,
                format!("{}", host.host().unwrap()),
                zmq_block_port,
                zmq_tx_port,
            ),
            BitcoinCoreConfig::QuickConnect {
                quick_connect_url,
                zmq_block_port,
                zmq_tx_port,
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
        let tor_proxy: SocketAddr = (std::env::var("HOST_IP")?.parse::<IpAddr>()?, 9050).into();

        write!(
            outfile,
            include_str!("lnd.conf.template"),
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
            tor_address = tor_address,
            tor_proxy = tor_proxy,
            payments_expiration_grace_period = config.advanced.payments_expiration_grace_period,
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
        )?;
    }

    // TLS Certificate migration from 0.11.0 -> 0.11.1 release (to include tor address)
    let bs = std::fs::read(Path::new("/root/.lnd/tls.cert"))?;
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
                x509_parser::extensions::GeneralName::DNSName(host) => host == tor_address,
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
    // write backup ignore to the root of the mounted volume
    std::fs::write(
        Path::new("/root/.lnd/.backupignore"),
        include_str!(".backupignore.template"),
    )?;

    #[cfg(target_os = "linux")]
    nix::unistd::daemon(true, true)?;
    loop {
        if let Ok(_) = std::net::TcpStream::connect(SocketAddr::from(([127, 0, 0, 1], 10009))) {
            break;
        } else {
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    }
    let mut password_bytes = [0; 16];
    if Path::new("/root/.lnd/pwd.dat").exists() {
        let mut pass_file = File::open("/root/.lnd/pwd.dat")?;
        pass_file.read_exact(&mut password_bytes)?;
        let status = std::process::Command::new("curl")
            .arg("-X")
            .arg("POST")
            .arg("--cacert")
            .arg("/root/.lnd/tls.cert")
            .arg("https://localhost:8080/v1/unlockwallet")
            .arg("-d")
            .arg(format!(
                "{}",
                serde_json::json!({
                    "wallet_password": base64::encode(&password_bytes),
                })
            ))
            .status()?;
        if !status.success() {
            return Err(anyhow::anyhow!("Error unlocking wallet. Exiting."));
        }
    } else {
        let mut dev_random = File::open("/dev/random")?;
        dev_random.read_exact(&mut password_bytes)?;
        let output = std::process::Command::new("curl")
            .arg("-X")
            .arg("POST")
            .arg("--cacert")
            .arg("/root/.lnd/tls.cert")
            .arg("https://localhost:8080/v1/genseed")
            .arg("-d")
            .arg(format!("{}", serde_json::json!({})))
            .output()?;
        eprint!("{}", std::str::from_utf8(&output.stderr)?);
        let CipherSeedMnemonic {
            cipher_seed_mnemonic,
        } = serde_json::from_slice(&output.stdout)?;
        let status = std::process::Command::new("curl")
            .arg("-X")
            .arg("POST")
            .arg("--cacert")
            .arg("/root/.lnd/tls.cert")
            .arg("https://localhost:8080/v1/initwallet")
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
    let mut macaroon_file = File::open("/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon")?;
    let mut macaroon_vec = Vec::with_capacity(macaroon_file.metadata()?.len() as usize);
    let tls_cert = std::fs::read_to_string("/root/.lnd/tls.cert")?;
    macaroon_file.read_to_end(&mut macaroon_vec)?;
    serde_yaml::to_writer(
        File::create("/root/.lnd/start9/stats.yaml")?,
        &Properties {
            version: 2,
            data: Data {
                lnd_connect_grpc: Property {
                    value_type: "string",
                    value: format!(
                        "lndconnect://{tor_address}:10009?cert={cert}&macaroon={macaroon}",
                        tor_address = tor_address,
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
                    description: None,
                    copyable: true,
                    qr: true,
                    masked: true,
                },
                lnd_connect_rest: Property {
                    value_type: "string",
                    value: format!(
                        "lndconnect://{tor_address}:8080?cert={cert}&macaroon={macaroon}",
                        tor_address = tor_address,
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
                    description: None,
                    copyable: true,
                    qr: true,
                    masked: true,
                },
            },
        },
    )?;
    std::fs::create_dir_all("/root/.lnd/public")?;
    for macaroon in std::fs::read_dir("/root/.lnd/data/chain/bitcoin/mainnet")? {
        let macaroon = macaroon?;
        if macaroon.path().extension().and_then(|s| s.to_str()) == Some("macaroon") {
            std::fs::copy(
                macaroon.path(),
                Path::new("/root/.lnd/public").join(macaroon.path().file_name().unwrap()),
            )?;
        }
    }
    File::create("/root/.lnd/public/tls.cert")?.write_all(tls_cert.as_bytes())?;
    Ok(())
}
