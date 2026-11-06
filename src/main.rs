use eframe::egui;
use std::path::PathBuf;

fn main() -> eframe::Result<()> {
    let initial_path = std::env::args_os().nth(1).map(PathBuf::from);
    let icon = image::load_from_memory(include_bytes!("../assets/icon.png"))
        .ok()
        .map(|image| {
            let rgba = image.into_rgba8();
            let (width, height) = (rgba.width(), rgba.height());
            egui::IconData {
                rgba: rgba.into_raw(),
                width,
                height,
            }
        });
    let viewport = egui::ViewportBuilder::default()
        .with_inner_size([1440.0, 900.0])
        .with_min_inner_size([1000.0, 640.0])
        .with_icon(icon.unwrap_or_else(|| egui::IconData {
            rgba: vec![0, 0, 0, 255],
            width: 1,
            height: 1,
        }));
    eframe::run_native(
        "WinCreate Studio",
        eframe::NativeOptions {
            viewport,
            ..Default::default()
        },
        Box::new(move |cc| Ok(Box::new(wincreate::ui::WinCreateApp::new(cc, initial_path)))),
    )
}
