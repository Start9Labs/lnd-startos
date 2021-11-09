use std::{path::Path, time::Duration};

#[derive(serde::Deserialize, Debug)]
pub struct LndGetInfoRes {
    identity_pubkey: String,
    block_height: u32,
    synced_to_chain: bool,
    synced_to_graph: bool,
}

// preform health check as normal, when deciding on health check status to return compare it to the time

fn main() -> Result<(), anyhow::Error> {
    while !Path::new("/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon").exists() {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }

    let mac = std::fs::read(Path::new(
        "/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon",
    ))?;

    let mac_encoded = hex::encode_upper(mac);
    let node_info: LndGetInfoRes = retry::<_, _, anyhow::Error>(
        || {
            serde_json::from_slice(
                &std::process::Command::new("curl")
                    .arg("--cacert")
                    .arg("/root/.lnd/tls.cert")
                    .arg("--header")
                    .arg(format!("Grpc-Metadata-macaroon: {}", mac_encoded))
                    .arg("https://127.0.0.1:8080/v1/getinfo")
                    .output()?
                    .stdout,
            )
            .map_err(|e| e.into())
        },
        5,
        Duration::from_secs(1),
    )?;
    match () {
        () if !node_info.synced_to_graph && !node_info.synced_to_chain => Ok(()),
        () if !node_info.synced_to_chain => Err(anyhow::anyhow!("node not synced to chain")),
        () if !node_info.synced_to_graph => Err(anyhow::anyhow!("node not synced to graph")),
        () => Err(anyhow::anyhow!("node not synced to chain and graph")),
    }
}

fn retry<F: FnMut() -> Result<A, E>, A, E>(
    mut action: F,
    retries: usize,
    duration: Duration,
) -> Result<A, E> {
    action().or_else(|e| {
        if retries == 0 {
            Err(e)
        } else {
            std::thread::sleep(duration);
            retry(action, retries - 1, duration)
        }
    })
}
