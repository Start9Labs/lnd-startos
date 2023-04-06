use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(serde::Deserialize, Debug)]
pub struct LndGetInfoRes {
    synced_to_chain: bool,
    synced_to_graph: bool,
}

pub enum HealthCheckResult {
    Success,
    Disabled,
    Starting,
    Loading { message: String },
    Failure { error: String },
}

fn main() {
    std::process::exit(match run_health_checks() {
        Ok(result) => {
            eprintln!("{}", result.message.unwrap_or_default());
            result.code
        }
        Err(err) => {
            eprintln!("{}", err);
            1
        }
    });
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HealthCheckRes {
    pub code: i32,
    pub message: Option<String>,
}

fn run_health_checks() -> Result<HealthCheckRes, anyhow::Error> {
    while !Path::new("/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon").exists() {
        return Ok(HealthCheckRes {
            code: 60,
            message: None,
        });
    }

    let mac = std::fs::read(Path::new(
        "/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon",
    ))?;

    let mac_encoded = hex::encode_upper(mac);
    let node_info: Result<LndGetInfoRes, anyhow::Error> = {
        serde_json::from_slice(
            &std::process::Command::new("curl")
                .arg("--no-progress-meter")
                .arg("--header")
                .arg(format!("Grpc-Metadata-macaroon: {}", mac_encoded))
                .arg("--cacert")
                .arg("/root/.lnd/tls.cert")
                .arg("https://lnd.embassy:8080/v1/getinfo")
                .output()?
                .stdout,
        )
        .map_err(|e| e.into())
    };

    match node_info {
        Ok(r) => match () {
            () if r.synced_to_graph && r.synced_to_chain => Ok(HealthCheckRes {
                code: 0,
                message: None,
            }),
            () if !r.synced_to_chain && r.synced_to_graph => Ok(HealthCheckRes {
                code: 61,
                message: Some("Syncing to chain".to_string()),
            }),
            () if !r.synced_to_graph && r.synced_to_chain => Ok(HealthCheckRes {
                code: 61,
                message: Some("Syncing to graph".to_string()),
            }),
            () => Ok(HealthCheckRes {
                code: 61,
                message: Some("Syncing to graph and chain".to_string()),
            }),
        },
        Err(e) => {
            // this will error if assets are unavailble while booting up, so use exit code for Starting
            Ok(HealthCheckRes {
                code: 60,
                message: Some(e.to_string()),
            })
        }
    }
}
