#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, CustomMenuItem};

fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("open", "Open Cortex"))
        .add_item(CustomMenuItem::new("quick_ask", "Quick Ask"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("status", "Agent: idle"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let tray = SystemTray::new()
        .with_menu(tray_menu)
        .with_tooltip("Cortex — Agentic Harness");

    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "open" => {
                    if let Some(window) = app.get_window("main") {
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
                "quick_ask" => {
                    let _ = app.emit_all("quick-ask", "open");
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        window.hide().ok();
                    } else {
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
            }
            _ => {}
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                event.window().hide().ok();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let window = app.get_window("main").unwrap();

            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                app.set_activation_policy(ActivationPolicy::Accessory);
            }

            let _ = window.eval(
                "document.title = 'Cortex Dashboard';"
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Cortex Desktop");
}
