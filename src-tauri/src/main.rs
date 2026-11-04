// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Force NVIDIA Optimus and AMD PowerXpress / SmartShift drivers on Windows/Linux
// to select the dedicated high-performance discrete GPU for this Rust executable.
#[cfg(any(target_os = "windows", target_os = "linux"))]
#[no_mangle]
pub static NvOptimusEnablement: u32 = 0x00000001;

#[cfg(any(target_os = "windows", target_os = "linux"))]
#[no_mangle]
pub static AmdPowerXpressRequestHighPerformance: i32 = 1;

fn main() {
    wincreate_studio_lib::run();
}
