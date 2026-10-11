//! Desktop executable delegating to the shared Tauri library.
//!
//! Release builds use the Windows GUI subsystem to avoid an extra console window.
//! Mobile startup is provided by the shared library's platform entry point.
//!
//! See the [application and test reference](../../index.html) for the frontend API.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Enter the shared native event loop without creating a second application builder.
///
/// Initialization failure propagates as the panic documented on [`jungle_run_lib::run`].
fn main() {
    jungle_run_lib::run();
}
