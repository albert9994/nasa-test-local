// Desktop entry point, used only by `tauri dev` on a computer; phones start from `run()` (mobile_entry_point).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fieldshift_mobile_lib::run()
}
