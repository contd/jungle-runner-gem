//! Shared Tauri v2 native entry point for desktop and mobile.
//!
//! The native layer creates the configured WebView and runs Tauri's event loop.
//! Real-time physics/presentation live in TypeScript; world planning belongs to
//! [`game`], while profiles/progression belong to [`data`], accessed through typed IPC.
//!
//! See the [application and test reference](../../index.html) for the frontend API.

pub mod data;
pub mod game;

use std::sync::{Arc, Mutex};
use tauri::Manager;

/// Start the Tauri application using the generated build-time context.
///
/// Desktop [`jungle_run`](../jungle_run/index.html) delegates here; mobile builds
/// expose this function through Tauri's platform entry-point attribute.
/// Window definitions, capabilities, and assets are supplied by the Tauri config
/// and build script, rather than duplicated in this function.
///
/// # Panics
///
/// Panics with an application-specific message if Tauri cannot run the event loop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("player-profile-v1.json");
            app.manage(data::DataBackend(Arc::new(Mutex::new(
                data::NativeRepository::new(path),
            ))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data::native_data,
            game::native_world
        ])
        .run(tauri::generate_context!())
        .expect("error while running Jungle Run application");
}
