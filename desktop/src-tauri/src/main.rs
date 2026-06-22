#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Child;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

mod commands;
mod tray;

use commands::{
    get_clipboard, get_server_status, get_system_info, open_external, set_clipboard, start_server,
    stop_server,
};

pub struct ServerProcess {
    pub child: Option<Child>,
    pub port: u16,
}

pub struct AppState {
    pub server: Mutex<ServerProcess>,
}

impl AppState {
    pub fn new(port: u16) -> Self {
        Self {
            server: Mutex::new(ServerProcess {
                child: None,
                port,
            }),
        }
    }
}

const DEFAULT_PORT: u16 = 18181;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            }

            let _ = window.eval("document.title = 'Cortex Desktop';");

            let _tray = tray::build_tray(app);

            let app_handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                let _ = start_server(state).await;
                let _ = app_handle.emit("server-status-changed", ());
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .manage(AppState::new(DEFAULT_PORT))
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_server_status,
            start_server,
            stop_server,
            get_clipboard,
            set_clipboard,
            open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cortex Desktop");
}
