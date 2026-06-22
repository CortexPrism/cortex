use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn build_tray(
    app: &tauri::App,
) -> Result<tauri::tray::TrayIcon, tauri::Error> {
    let open = MenuItemBuilder::with_id("open", "Open Cortex").build(app)?;
    let quick_ask = MenuItemBuilder::with_id("quick_ask", "Quick Ask").build(app)?;
    let status_item = MenuItemBuilder::with_id("status", "Server: checking\u{2026}").build(app)?;
    let start_server = MenuItemBuilder::with_id("start_server", "Start Server").build(app)?;
    let stop_server = MenuItemBuilder::with_id("stop_server", "Stop Server").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit Cortex").build(app)?;

    let server_submenu = SubmenuBuilder::new(app, "Server")
        .item(&status_item)
        .separator()
        .item(&start_server)
        .item(&stop_server)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&open)
        .item(&quick_ask)
        .separator()
        .item(&server_submenu)
        .separator()
        .item(&quit)
        .build()?;

    let tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Cortex \u{2014} AI Agent Operating System")
        .on_menu_event(move |app, event| {
            handle_menu_event(app, event.id().as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(tray)
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "open" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quick_ask" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("quick-ask", "open");
        }
        "start_server" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<crate::AppState>();
                let _ = crate::commands::start_server(state).await;
                let _ = app_handle.emit("server-status-changed", ());
            });
        }
        "stop_server" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<crate::AppState>();
                let _ = crate::commands::stop_server(state).await;
                let _ = app_handle.emit("server-status-changed", ());
            });
        }
        "quit" => {
            std::process::exit(0);
        }
        _ => {}
    }
}
