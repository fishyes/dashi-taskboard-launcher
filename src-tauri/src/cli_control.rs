use serde::{Deserialize, Serialize};
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

use crate::process_manager::{codex_integration_info, CodexIntegrationInfo, ProcessInfo};
use crate::{config, install_skill_impl, run_inject_all, run_start_all, run_stop_all, AppState};

/// 只監聽回環地址；CLI 還必須攜帶本機 config 中的 instance secret。
pub const CONTROL_ADDR: &str = "127.0.0.1:47824";
const MAX_REQUEST_BYTES: u64 = 64 * 1024;

#[derive(Debug, Deserialize)]
struct ControlRequest {
    secret: String,
    command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlResponse {
    ok: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    processes: Option<Vec<ProcessInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    integration: Option<CodexIntegrationInfo>,
}

impl ControlResponse {
    fn success(message: impl Into<String>) -> Self {
        Self {
            ok: true,
            message: message.into(),
            processes: None,
            integration: None,
        }
    }

    fn error(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            message: message.into(),
            processes: None,
            integration: None,
        }
    }
}

async fn execute(app: &tauri::AppHandle, request: ControlRequest) -> ControlResponse {
    let mut config = match config::load_config() {
        Ok(config) => config,
        Err(error) => return ControlResponse::error(error),
    };
    let (_, expected_secret) = match config::ensure_instance_credentials(&mut config) {
        Ok(credentials) => credentials,
        Err(error) => return ControlResponse::error(error),
    };
    if request.secret != expected_secret {
        return ControlResponse::error("unauthorized");
    }

    let pm = app.state::<AppState>().pm.clone();
    match request.command.as_str() {
        "ping" => ControlResponse::success("Launcher control service is ready"),
        "status" => ControlResponse {
            ok: true,
            message: "Launcher status".to_string(),
            processes: Some(pm.get_all_status().await),
            integration: Some(codex_integration_info(config.cdp_port)),
        },
        "start" => match run_start_all(&pm, app, &config).await {
            Ok(()) => ControlResponse::success("Taskboard and injector started"),
            Err(error) => ControlResponse::error(error),
        },
        "inject" => match run_inject_all(&pm, app, &config).await {
            Ok(()) => ControlResponse::success("Taskboard injected into Codex"),
            Err(error) => ControlResponse::error(error),
        },
        "stop" => match run_stop_all(&pm, app).await {
            Ok(()) => ControlResponse::success("Taskboard and injector stopped"),
            Err(error) => ControlResponse::error(error),
        },
        "restart" => {
            if let Err(error) = run_stop_all(&pm, app).await {
                return ControlResponse::error(error);
            }
            match run_start_all(&pm, app, &config).await {
                Ok(()) => ControlResponse::success("Taskboard and injector restarted"),
                Err(error) => ControlResponse::error(error),
            }
        }
        "skill-reinstall" => match install_skill_impl(config.taskboard_path, true).await {
            Ok(message) => ControlResponse::success(message),
            Err(error) => ControlResponse::error(error),
        },
        _ => ControlResponse::error(format!("Unknown command: {}", request.command)),
    }
}

async fn handle_connection(app: tauri::AppHandle, stream: TcpStream) -> Result<(), String> {
    let (read_half, mut write_half) = stream.into_split();
    let mut line = String::new();
    BufReader::new(read_half)
        .take(MAX_REQUEST_BYTES)
        .read_line(&mut line)
        .await
        .map_err(|error| error.to_string())?;

    let response = match serde_json::from_str::<ControlRequest>(&line) {
        Ok(request) => execute(&app, request).await,
        Err(error) => ControlResponse::error(format!("Invalid request: {error}")),
    };
    let mut encoded = serde_json::to_vec(&response).map_err(|error| error.to_string())?;
    encoded.push(b'\n');
    write_half
        .write_all(&encoded)
        .await
        .map_err(|error| error.to_string())
}

pub fn start(app: tauri::AppHandle) {
    // 新安裝可能尚無 instance secret；在監聽前先建立，讓 CLI 能讀取同一憑據。
    let mut launcher_config = match config::load_config() {
        Ok(config) => config,
        Err(error) => {
            log::error!("CLI 控制憑據讀取失敗: {}", error);
            return;
        }
    };
    if let Err(error) = config::ensure_instance_credentials(&mut launcher_config) {
        log::error!("CLI 控制憑據建立失敗: {}", error);
        return;
    }

    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind(CONTROL_ADDR).await {
            Ok(listener) => listener,
            Err(error) => {
                log::error!("CLI 控制服務綁定 {} 失敗: {}", CONTROL_ADDR, error);
                return;
            }
        };
        log::info!("CLI 控制服務監聽 {}", CONTROL_ADDR);

        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = handle_connection(app, stream).await {
                            log::warn!("CLI 控制請求失敗: {}", error);
                        }
                    });
                }
                Err(error) => log::warn!("CLI 控制連線接收失敗: {}", error),
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_omits_processes_when_not_requested() {
        let encoded = serde_json::to_value(ControlResponse::success("ok")).unwrap();
        assert_eq!(encoded["ok"], true);
        assert!(encoded.get("processes").is_none());
        assert!(encoded.get("integration").is_none());
    }

    #[test]
    fn request_rejects_missing_secret() {
        let result = serde_json::from_str::<ControlRequest>(r#"{"command":"status"}"#);
        assert!(result.is_err());
    }
}
