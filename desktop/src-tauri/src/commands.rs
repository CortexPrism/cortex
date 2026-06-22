use crate::AppState;
use serde::{Deserialize, Serialize};
use std::process::{Child, Command};
use std::sync::MutexGuard;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemInfo {
    pub os: String,
    pub hostname: String,
    pub cpu_count: usize,
    pub memory_total: u64,
    pub memory_used: u64,
    pub app_version: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub pid: Option<u32>,
}

fn check_port(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

fn find_cortex_command() -> Option<String> {
    for cmd in &["cortex", "deno"] {
        if Command::new(if cfg!(windows) { "where" } else { "which" })
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(cmd.to_string());
        }
    }
    None
}

fn spawn_server(port: u16) -> Result<Child, String> {
    let cortex = find_cortex_command().ok_or_else(|| {
        "Cortex CLI not found in PATH. Install CortexPrism first.".to_string()
    })?;

    let child = if cortex == "deno" {
        Command::new("deno")
            .args([
                "run",
                "--allow-all",
                "src/main.ts",
                "server",
                "start",
                "--port",
                &port.to_string(),
            ])
            .spawn()
            .map_err(|e| format!("Failed to start server via deno: {}", e))?
    } else {
        Command::new("cortex")
            .args([
                "server",
                "start",
                "--port",
                &port.to_string(),
            ])
            .spawn()
            .map_err(|e| format!("Failed to start server via cortex: {}", e))?
    };

    Ok(child)
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    let memory_total = sys.total_memory();
    let memory_used = sys.used_memory();

    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let os = format!(
        "{} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );

    Ok(SystemInfo {
        os,
        hostname,
        cpu_count: sys.cpus().len(),
        memory_total,
        memory_used,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let server = state.server.lock().map_err(|e| e.to_string())?;
    let running = check_port(server.port);

    let pid = server.child.as_ref().map(|c| c.id());

    Ok(ServerStatus {
        running,
        port: server.port,
        pid,
    })
}

#[tauri::command]
pub async fn start_server(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let mut server: MutexGuard<'_, crate::ServerProcess> = state.server.lock().map_err(|e| e.to_string())?;

    if check_port(server.port) {
        return Ok(ServerStatus {
            running: true,
            port: server.port,
            pid: None,
        });
    }

    let child = spawn_server(server.port)?;
    let pid = child.id();
    server.child = Some(child);

    std::thread::sleep(std::time::Duration::from_millis(1500));

    let running = check_port(server.port);

    Ok(ServerStatus {
        running,
        port: server.port,
        pid: if running { Some(pid) } else { None },
    })
}

#[tauri::command]
pub async fn stop_server(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let mut server: MutexGuard<'_, crate::ServerProcess> = state.server.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = server.child {
        let _ = child.kill();
        let _ = child.wait();
        server.child = None;
    }

    if !check_port(server.port) {
        Ok(ServerStatus {
            running: false,
            port: server.port,
            pid: None,
        })
    } else {
        let cortex = find_cortex_command().ok_or_else(|| {
            "Cortex CLI not found in PATH.".to_string()
        })?;

        let status = Command::new(&cortex)
            .args(["daemon", "stop"])
            .status()
            .map_err(|e| format!("Failed to stop server: {}", e))?;

        if status.success() {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        Ok(ServerStatus {
            running: check_port(server.port),
            port: server.port,
            pid: None,
        })
    }
}

#[tauri::command]
pub async fn get_clipboard() -> Result<String, String> {
    use arboard::Clipboard;

    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard.get_text().map_err(|e| format!("Clipboard read error: {}", e))
}

#[tauri::command]
pub async fn set_clipboard(text: String) -> Result<(), String> {
    use arboard::Clipboard;

    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard
        .set_text(text)
        .map_err(|e| format!("Clipboard write error: {}", e))
}

#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open URL: {}", e))
}
