mod canvas;

use crate::adjust::{self, Filter};
use crate::brush::{self, InputPoint, Stroke, StrokeMode, StrokeParams, Symmetry};
use crate::color::{self, BlendMode};
use crate::document::Document;
use crate::history::History;
use crate::project::{self, BrushHistoryEntry, MAX_EDGE};
use crate::smudge::{SmudgeSettings, SmudgeStroke};
use crate::storage::{self, GalleryEntry};
use crate::tiled::{IRect, Tiled};
use canvas::CanvasView;
use eframe::egui::{self, Color32, Sense, Vec2};
use std::path::PathBuf;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tool {
    Brush,
    Eraser,
    Smudge,
    Fill,
    Eyedropper,
    Shape,
    Move,
    Hand,
}

impl Tool {
    fn label(self) -> &'static str {
        match self {
            Self::Brush => "Brush",
            Self::Eraser => "Eraser",
            Self::Smudge => "Smudge",
            Self::Fill => "Fill",
            Self::Eyedropper => "Picker",
            Self::Shape => "Shape",
            Self::Move => "Move",
            Self::Hand => "Hand",
        }
    }
}

#[derive(PartialEq, Eq)]
enum Screen {
    Home,
    Studio,
}

pub struct WinCreateApp {
    screen: Screen,
    doc: Option<Document>,
    history: History,
    canvas: CanvasView,
    stroke: Option<Stroke>,
    smudge: Option<SmudgeStroke>,
    tool: Tool,
    color: [u8; 3],
    hex: String,
    secondary: [u8; 3],
    size: f32,
    opacity: f32,
    brush_id: String,
    brush_category: String,
    panel: String,
    preset_title: String,
    width: usize,
    height: usize,
    transparent: bool,
    animation: bool,
    gallery_id: Option<String>,
    gallery: Vec<GalleryEntry>,
    recovery: Option<GalleryEntry>,
    toast: String,
    toast_until: Instant,
    dirty: bool,
    last_autosave: Instant,
    filter: Filter,
    filter_values: Vec<f32>,
    symmetry: Symmetry,
}

impl WinCreateApp {
    pub fn new(cc: &eframe::CreationContext<'_>, initial_path: Option<PathBuf>) -> Self {
        let mut visuals = egui::Visuals::dark();
        visuals.panel_fill = Color32::from_rgb(24, 25, 32);
        visuals.window_fill = Color32::from_rgb(29, 30, 38);
        visuals.widgets.noninteractive.bg_fill = Color32::from_rgb(35, 36, 45);
        visuals.widgets.inactive.bg_fill = Color32::from_rgb(42, 43, 53);
        visuals.widgets.hovered.bg_fill = Color32::from_rgb(58, 59, 72);
        visuals.selection.bg_fill = Color32::from_rgb(99, 102, 241);
        cc.egui_ctx.set_visuals(visuals);

        let mut app = Self {
            screen: Screen::Home,
            doc: None,
            history: History::default(),
            canvas: CanvasView::default(),
            stroke: None,
            smudge: None,
            tool: Tool::Brush,
            color: [86, 190, 255],
            hex: "#56beff".to_string(),
            secondary: [255, 255, 255],
            size: 24.0,
            opacity: 1.0,
            brush_id: "studio".to_string(),
            brush_category: "Inking".to_string(),
            panel: "Brushes".to_string(),
            preset_title: "Untitled Artwork".to_string(),
            width: 1280,
            height: 720,
            transparent: false,
            animation: false,
            gallery_id: None,
            gallery: storage::list_gallery(),
            recovery: storage::recovery(),
            toast: String::new(),
            toast_until: Instant::now(),
            dirty: false,
            last_autosave: Instant::now(),
            filter: Filter::Hsb,
            filter_values: Filter::Hsb.defaults(),
            symmetry: Symmetry::Off,
        };

        if let Some(path) = initial_path {
            match app.load_path(&path) {
                Ok(()) => {}
                Err(error) => app.notify(format!("Open failed: {error:#}")),
            }
        }
        if let Some(saved) = cc
            .storage
            .and_then(|storage| storage.get_string("ui_preferences"))
        {
            if let Ok(prefs) = serde_json::from_str::<serde_json::Value>(&saved) {
                if let Some(value) = prefs.get("brush_id").and_then(|v| v.as_str()) {
                    if brush::presets().iter().any(|preset| preset.id == value) {
                        app.brush_id = value.to_string();
                    }
                }
                if let Some(value) = prefs.get("brush_category").and_then(|v| v.as_str()) {
                    if brush::CATEGORIES.contains(&value) {
                        app.brush_category = value.to_string();
                    }
                }
                if let Some(values) = prefs.get("color").and_then(|v| v.as_array()) {
                    if values.len() == 3 {
                        if let (Some(r), Some(g), Some(b)) =
                            (values[0].as_u64(), values[1].as_u64(), values[2].as_u64())
                        {
                            app.color = [r.min(255) as u8, g.min(255) as u8, b.min(255) as u8];
                            app.hex = color::to_hex(app.color);
                        }
                    }
                }
                app.size = prefs
                    .get("size")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(app.size as f64) as f32;
                app.opacity = prefs
                    .get("opacity")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(app.opacity as f64) as f32;
                if let Some(value) = prefs.get("panel").and_then(|v| v.as_str()) {
                    if ["Brushes", "Colour", "Layers", "Adjust"].contains(&value) {
                        app.panel = value.to_string();
                    }
                }
            }
        }
        app
    }

    fn notify(&mut self, message: impl Into<String>) {
        self.toast = message.into();
        self.toast_until = Instant::now() + Duration::from_secs(4);
    }

    fn begin_document(&mut self, doc: Document) {
        self.doc = Some(doc);
        self.screen = Screen::Studio;
        self.gallery_id = None;
        self.history.clear();
        self.stroke = None;
        self.canvas.invalidate();
        self.canvas.zoom = 0.0;
        self.dirty = true;
    }

    fn create_document(
        &mut self,
        width: usize,
        height: usize,
        title: String,
        transparent: bool,
        animation: bool,
    ) {
        let mut doc = Document::new(
            title,
            width.clamp(64, MAX_EDGE),
            height.clamp(64, MAX_EDGE),
            [255, 255, 255],
        );
        doc.bg_visible = !transparent;
        if animation {
            doc.enable_animation();
        }
        self.begin_document(doc);
    }

    fn load_path(&mut self, path: &std::path::Path) -> anyhow::Result<()> {
        let extension = path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let doc = if extension == "winc" {
            project::load_file(path)?
        } else if extension == "ora" {
            crate::export::import_ora(path)?
        } else {
            let bytes = std::fs::read(path)?;
            project::document_from_image(
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Imported Image"),
                &bytes,
            )?
        };
        self.begin_document(doc);
        self.dirty = false;
        self.notify(format!("Opened {}", path.display()));
        Ok(())
    }

    fn open_dialog(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter(
                "WinCreate, OpenRaster, and images",
                &["winc", "ora", "png", "jpg", "jpeg", "webp", "bmp", "gif"],
            )
            .pick_file()
        {
            if let Err(error) = self.load_path(&path) {
                self.notify(format!("Open failed: {error:#}"));
            }
        }
    }

    fn save_gallery(&mut self) {
        let Some(doc) = self.doc.as_mut() else { return };
        let id = self.gallery_id.get_or_insert_with(storage::new_id).clone();
        match storage::save_to_gallery(&id, doc) {
            Ok(_) => {
                storage::clear_recovery();
                self.gallery = storage::list_gallery();
                self.recovery = storage::recovery();
                self.dirty = false;
                self.notify("Saved to gallery");
            }
            Err(error) => self.notify(format!("Save failed: {error:#}")),
        }
    }

    fn save_as(&mut self) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("WinCreate project", &["winc"])
            .set_file_name("Artwork.winc")
            .save_file()
        else {
            return;
        };
        if let Some(doc) = self.doc.as_mut() {
            match project::save_file(doc, &path) {
                Ok(()) => {
                    storage::clear_recovery();
                    self.dirty = false;
                    self.notify(format!("Saved {}", path.display()));
                }
                Err(error) => self.notify(format!("Save failed: {error:#}")),
            }
        }
    }

    fn export_dialog(&mut self) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter(
                "Images, OpenRaster, or Photoshop",
                &["png", "jpg", "jpeg", "webp", "bmp", "ora", "psd"],
            )
            .set_file_name("Artwork.png")
            .save_file()
        else {
            return;
        };
        let Some(doc) = self.doc.as_mut() else { return };
        let result = match path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "ora" => crate::export::export_ora(doc, &path),
            "psd" => crate::export::export_psd(doc, &path),
            _ => crate::export::export_flat(doc, &path, true),
        };
        match result {
            Ok(()) => self.notify(format!("Exported {}", path.display())),
            Err(error) => self.notify(format!("Export failed: {error:#}")),
        }
    }

    fn undo(&mut self) {
        if let Some(doc) = self.doc.as_mut() {
            if let Some(label) = self.history.undo(doc) {
                self.canvas.invalidate();
                self.dirty = true;
                self.notify(format!("Undo {label}"));
            }
        }
    }

    fn redo(&mut self) {
        if let Some(doc) = self.doc.as_mut() {
            if let Some(label) = self.history.redo(doc) {
                self.canvas.invalidate();
                self.dirty = true;
                self.notify(format!("Redo {label}"));
            }
        }
    }

    fn handle_shortcuts(&mut self, ctx: &egui::Context) {
        if ctx.wants_keyboard_input() {
            return;
        }
        let modifiers = ctx.input(|i| i.modifiers);
        let pressed = |key| ctx.input(|i| i.key_pressed(key));
        if modifiers.command && pressed(egui::Key::Z) {
            if modifiers.shift {
                self.redo();
            } else {
                self.undo();
            }
            return;
        }
        if modifiers.command && pressed(egui::Key::Y) {
            self.redo();
        } else if modifiers.command && pressed(egui::Key::J) {
            self.mutate_layer("Duplicate layer", |doc| doc.duplicate_layer(doc.active));
        } else if modifiers.command && modifiers.shift && pressed(egui::Key::N) {
            self.mutate_layer("Add layer", |doc| {
                doc.add_layer();
            });
        } else if modifiers.command && pressed(egui::Key::Num0) {
            self.canvas.zoom = 0.0;
        } else if modifiers.command && pressed(egui::Key::Num1) {
            self.canvas.zoom = 1.0;
        } else if pressed(egui::Key::Delete) {
            self.mutate_layer("Clear layer", |doc| {
                let (width, height) = (doc.w, doc.h);
                if let Some(layer) = doc.active_layer_mut() {
                    layer.pixels = Tiled::new(width, height);
                    layer.touch();
                }
            });
        } else if modifiers.command && pressed(egui::Key::S) {
            if modifiers.shift {
                self.save_as();
            } else {
                self.save_gallery();
            }
        } else if modifiers.command && pressed(egui::Key::O) {
            self.open_dialog();
        } else if modifiers.command && pressed(egui::Key::E) {
            self.export_dialog();
        } else if pressed(egui::Key::B) {
            self.tool = Tool::Brush;
        } else if pressed(egui::Key::E) {
            self.tool = Tool::Eraser;
        } else if pressed(egui::Key::S) {
            self.tool = Tool::Smudge;
        } else if pressed(egui::Key::G) {
            self.tool = Tool::Fill;
        } else if pressed(egui::Key::I) {
            self.tool = Tool::Eyedropper;
        } else if pressed(egui::Key::U) {
            self.tool = Tool::Shape;
        } else if pressed(egui::Key::V) {
            self.tool = Tool::Move;
        } else if pressed(egui::Key::H) {
            self.tool = Tool::Hand;
        } else if pressed(egui::Key::OpenBracket) {
            self.size = (self.size / 1.12).max(brush::MIN_SIZE);
        } else if pressed(egui::Key::CloseBracket) {
            self.size = (self.size * 1.12).min(brush::MAX_SIZE);
        }
    }

    fn show_home(&mut self, ctx: &egui::Context) {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.add_space(20.0);
            ui.horizontal(|ui| {
                ui.heading("WinCreate Studio");
                ui.label(
                    egui::RichText::new("NATIVE PAINT WORKSPACE")
                        .small()
                        .color(Color32::from_rgb(140, 150, 180)),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("Open file…").clicked() {
                        self.open_dialog();
                    }
                });
            });
            ui.add_space(18.0);
            ui.columns(2, |columns| {
                let ui = &mut columns[0];
                ui.group(|ui| {
                    ui.heading("Start a canvas");
                    ui.horizontal(|ui| {
                        ui.label("Title");
                        ui.text_edit_singleline(&mut self.preset_title);
                    });
                    ui.horizontal(|ui| {
                        ui.label("Width");
                        ui.add(egui::DragValue::new(&mut self.width).range(64..=MAX_EDGE));
                        ui.label("Height");
                        ui.add(egui::DragValue::new(&mut self.height).range(64..=MAX_EDGE));
                    });
                    ui.checkbox(&mut self.transparent, "Transparent background");
                    ui.checkbox(&mut self.animation, "Animation");
                    ui.add_space(8.0);
                    ui.label("Canvas presets");
                    for (name, w, h) in [
                        ("HD 16:9", 1920, 1080),
                        ("Square", 2048, 2048),
                        ("Portrait", 1080, 1350),
                        ("4K UHD", 3840, 2160),
                        ("A4 @ 300 dpi", 2480, 3508),
                        ("Social story", 1080, 1920),
                    ] {
                        if ui.button(format!("{name}  ·  {w} × {h}")).clicked() {
                            self.width = w;
                            self.height = h;
                        }
                    }
                    ui.add_space(8.0);
                    if ui
                        .button(egui::RichText::new("Create canvas").strong())
                        .clicked()
                    {
                        self.create_document(
                            self.width,
                            self.height,
                            self.preset_title.clone(),
                            self.transparent,
                            self.animation,
                        );
                    }
                });
                let ui = &mut columns[1];
                ui.group(|ui| {
                    ui.heading("Recent artwork");
                    if let Some(entry) = self.recovery.clone() {
                        ui.horizontal(|ui| {
                            ui.label(format!("Recovery available: {}", entry.title));
                            if ui.button("Restore").clicked() {
                                if let Err(error) = self.load_path(&entry.project_path) {
                                    self.notify(format!("Restore failed: {error:#}"));
                                }
                            }
                            if ui.button("Discard").clicked() {
                                storage::clear_recovery();
                                self.recovery = None;
                            }
                        });
                    }
                    self.gallery = storage::list_gallery();
                    if self.gallery.is_empty() {
                        ui.label("Your saved projects will appear here.");
                    }
                    for entry in self.gallery.iter().take(8).cloned().collect::<Vec<_>>() {
                        ui.horizontal(|ui| {
                            ui.label(format!(
                                "{}   {} × {}",
                                entry.title, entry.width, entry.height
                            ));
                            if ui.button("Open").clicked() {
                                if let Err(error) = self.load_path(&entry.project_path) {
                                    self.notify(format!("Open failed: {error:#}"));
                                } else {
                                    self.gallery_id = Some(entry.id.clone());
                                }
                            }
                            if ui.button("Delete").clicked() {
                                if let Err(error) = storage::delete_entry(&entry) {
                                    self.notify(format!("Delete failed: {error:#}"));
                                }
                                self.gallery = storage::list_gallery();
                            }
                        });
                    }
                    ui.add_space(8.0);
                    if ui.button("Import image as canvas…").clicked() {
                        if let Some(path) = rfd::FileDialog::new()
                            .add_filter("Image", &["png", "jpg", "jpeg", "webp", "bmp", "gif"])
                            .pick_file()
                        {
                            if let Err(error) = self.load_path(&path) {
                                self.notify(format!("Import failed: {error:#}"));
                            }
                        }
                    }
                });
            });
            ui.add_space(20.0);
            ui.label(
                egui::RichText::new(
                    "Brush • layers • animation • .winc / ORA / PSD / image export",
                )
                .color(Color32::GRAY),
            );
        });
    }

    fn show_top_bar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("topbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                if ui.button("‹ Gallery").clicked() {
                    self.screen = Screen::Home;
                    self.gallery = storage::list_gallery();
                }
                ui.separator();
                let title = self
                    .doc
                    .as_ref()
                    .map(|d| d.title.as_str())
                    .unwrap_or("Untitled");
                ui.strong(title);
                ui.label(format!(
                    "{} × {}",
                    self.doc.as_ref().map(|d| d.w).unwrap_or(0),
                    self.doc.as_ref().map(|d| d.h).unwrap_or(0)
                ));
                ui.separator();
                if ui
                    .add_enabled(self.history.can_undo(), egui::Button::new("↶ Undo"))
                    .clicked()
                {
                    self.undo();
                }
                if ui
                    .add_enabled(self.history.can_redo(), egui::Button::new("↷ Redo"))
                    .clicked()
                {
                    self.redo();
                }
                ui.menu_button("File", |ui| {
                    if ui.button("Open…  Ctrl+O").clicked() {
                        ui.close_menu();
                        self.open_dialog();
                    }
                    if ui.button("Save to gallery  Ctrl+S").clicked() {
                        ui.close_menu();
                        self.save_gallery();
                    }
                    if ui.button("Save as .winc…  Ctrl+Shift+S").clicked() {
                        ui.close_menu();
                        self.save_as();
                    }
                    if ui.button("Export…  Ctrl+E").clicked() {
                        ui.close_menu();
                        self.export_dialog();
                    }
                    if ui.button("Import image as layer…").clicked() {
                        ui.close_menu();
                        self.import_layer();
                    }
                });
                ui.menu_button("Edit", |ui| {
                    if ui.button("Undo").clicked() {
                        ui.close_menu();
                        self.undo();
                    }
                    if ui.button("Redo").clicked() {
                        ui.close_menu();
                        self.redo();
                    }
                    if ui.button("Duplicate layer  Ctrl+J").clicked() {
                        ui.close_menu();
                        self.mutate_layer("Duplicate", |doc| doc.duplicate_layer(doc.active));
                    }
                });
                ui.menu_button("Canvas", |ui| {
                    if ui.button("Enable animation").clicked() {
                        ui.close_menu();
                        if let Some(doc) = self.doc.as_mut() {
                            doc.enable_animation();
                            self.dirty = true;
                        }
                    }
                    if ui.button("Fit to screen  Ctrl+0").clicked() {
                        self.canvas.zoom = 0.0;
                    }
                    if ui.button("100%  Ctrl+1").clicked() {
                        self.canvas.zoom = 1.0;
                    }
                });
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(if self.dirty {
                        "● Unsaved"
                    } else {
                        "✓ Saved"
                    });
                });
            });
        });
    }

    fn show_tools(&mut self, ctx: &egui::Context) {
        egui::SidePanel::left("tools")
            .resizable(false)
            .default_width(140.0)
            .show(ctx, |ui| {
                ui.heading("Tools");
                for tool in [
                    Tool::Brush,
                    Tool::Eraser,
                    Tool::Smudge,
                    Tool::Fill,
                    Tool::Eyedropper,
                    Tool::Shape,
                    Tool::Move,
                    Tool::Hand,
                ] {
                    if ui
                        .selectable_label(self.tool == tool, tool.label())
                        .clicked()
                    {
                        self.tool = tool;
                    }
                }
                ui.separator();
                ui.label(format!("Size · {:.1}px", self.size));
                let mut slider = brush::size_to_slider(self.size);
                if ui
                    .add(egui::Slider::new(&mut slider, 0.0..=1.0).show_value(false))
                    .changed()
                {
                    self.size = brush::slider_to_size(slider);
                }
                ui.add(egui::Slider::new(&mut self.opacity, 0.01..=1.0).text("Opacity"));
                if self.canvas.zoom <= 0.0 {
                    ui.label("Zoom · fit");
                } else {
                    ui.add(egui::Slider::new(&mut self.canvas.zoom, 0.02..=8.0).text("Zoom"));
                }
                egui::ComboBox::from_label("Symmetry")
                    .selected_text(self.symmetry.label())
                    .show_ui(ui, |ui| {
                        for value in Symmetry::ALL {
                            ui.selectable_value(&mut self.symmetry, value, value.label());
                        }
                    });
                ui.separator();
                ui.label("Primary colour");
                let mut color = Color32::from_rgb(self.color[0], self.color[1], self.color[2]);
                if ui.color_edit_button_srgba(&mut color).changed() {
                    self.color = [color.r(), color.g(), color.b()];
                    self.hex = color::to_hex(self.color);
                }
                if ui.text_edit_singleline(&mut self.hex).lost_focus() {
                    if let Some(parsed) = color::parse_hex(&self.hex) {
                        self.color = parsed;
                    }
                }
            });
    }

    fn show_right_panel(&mut self, ctx: &egui::Context) {
        egui::SidePanel::right("inspector")
            .resizable(true)
            .default_width(275.0)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    for tab in ["Brushes", "Colour", "Layers", "Adjust"] {
                        if ui.selectable_label(self.panel == tab, tab).clicked() {
                            self.panel = tab.to_string();
                        }
                    }
                });
                ui.separator();
                match self.panel.as_str() {
                    "Brushes" => self.brush_panel(ui),
                    "Colour" => self.colour_panel(ui),
                    "Layers" => self.layers_panel(ui),
                    _ => self.adjust_panel(ui),
                }
            });
    }

    fn brush_panel(&mut self, ui: &mut egui::Ui) {
        egui::ComboBox::from_label("Category")
            .selected_text(self.brush_category.clone())
            .show_ui(ui, |ui| {
                for category in brush::CATEGORIES {
                    ui.selectable_value(&mut self.brush_category, category.to_string(), category);
                }
            });
        egui::ScrollArea::vertical()
            .max_height(230.0)
            .show(ui, |ui| {
                for preset in brush::presets()
                    .iter()
                    .filter(|p| p.category == self.brush_category)
                {
                    if ui
                        .selectable_label(self.brush_id == preset.id, preset.name)
                        .clicked()
                    {
                        self.brush_id = preset.id.to_string();
                    }
                }
            });
        ui.separator();
        ui.label(format!("Selected · {}", brush::preset(&self.brush_id).name));
        ui.add(egui::Slider::new(&mut self.size, 0.25..=250.0).text("Size"));
        ui.add(egui::Slider::new(&mut self.opacity, 0.01..=1.0).text("Opacity"));
        if let Some(doc) = self.doc.as_mut() {
            ui.label(format!(
                "Recent brush history · {}",
                doc.brush_history.len()
            ));
        }
    }

    fn colour_panel(&mut self, ui: &mut egui::Ui) {
        ui.heading("Colour studio");
        let mut color = Color32::from_rgb(self.color[0], self.color[1], self.color[2]);
        if ui.color_edit_button_srgba(&mut color).changed() {
            self.color = [color.r(), color.g(), color.b()];
            self.hex = color::to_hex(self.color);
        }
        ui.horizontal(|ui| {
            ui.label("Hex");
            if ui.text_edit_singleline(&mut self.hex).lost_focus() {
                if let Some(value) = color::parse_hex(&self.hex) {
                    self.color = value;
                }
            }
        });
        let mut rgb_changed = false;
        for channel in 0..3 {
            rgb_changed |= ui
                .add(
                    egui::Slider::new(&mut self.color[channel], 0..=255)
                        .text(["Red", "Green", "Blue"][channel]),
                )
                .changed();
        }
        if rgb_changed {
            self.hex = color::to_hex(self.color);
        }
        ui.horizontal(|ui| {
            ui.label("Primary");
            ui.colored_label(
                Color32::from_rgb(self.color[0], self.color[1], self.color[2]),
                "██████",
            );
            if ui.button("Swap").clicked() {
                std::mem::swap(&mut self.color, &mut self.secondary);
                self.hex = color::to_hex(self.color);
            }
            ui.label("Secondary");
            ui.colored_label(
                Color32::from_rgb(self.secondary[0], self.secondary[1], self.secondary[2]),
                "██████",
            );
        });
        ui.label("Palette");
        ui.horizontal_wrapped(|ui| {
            for swatch in [
                [30, 34, 48],
                [237, 91, 99],
                [255, 186, 73],
                [116, 211, 156],
                [86, 190, 255],
                [164, 120, 255],
            ] {
                let button = egui::Button::new("  ")
                    .fill(Color32::from_rgb(swatch[0], swatch[1], swatch[2]));
                if ui.add(button).clicked() {
                    self.color = swatch;
                    self.hex = color::to_hex(self.color);
                }
            }
        });
    }

    fn layers_panel(&mut self, ui: &mut egui::Ui) {
        let Some(doc) = self.doc.as_ref() else { return };
        let original = doc.clone();
        let active = doc.active;
        let rows = doc
            .layers
            .iter()
            .enumerate()
            .rev()
            .map(|(index, layer)| (index, layer.name.clone(), layer.visible, layer.locked))
            .collect::<Vec<_>>();
        let mut selected = None;
        let mut visibility = Vec::new();
        let mut locks = Vec::new();
        egui::ScrollArea::vertical()
            .max_height(280.0)
            .show(ui, |ui| {
                for (index, name, is_visible, is_locked) in &rows {
                    ui.horizontal(|ui| {
                        if ui.selectable_label(active == *index, name).clicked() {
                            selected = Some(*index);
                        }
                        let mut visible = *is_visible;
                        if ui.checkbox(&mut visible, "◉").changed() {
                            visibility.push((*index, visible));
                        }
                        let mut locked = *is_locked;
                        if ui.checkbox(&mut locked, "🔒").changed() {
                            locks.push((*index, locked));
                        }
                    });
                }
            });
        if let Some(index) = selected {
            if let Some(doc) = self.doc.as_mut() {
                doc.active = index;
            }
        }
        if !visibility.is_empty() || !locks.is_empty() {
            self.history.push(&original, "Layer properties");
            if let Some(doc) = self.doc.as_mut() {
                for (index, value) in visibility {
                    doc.layers[index].visible = value;
                }
                for (index, value) in locks {
                    doc.layers[index].locked = value;
                }
                doc.sync_frame();
            }
            self.canvas.invalidate();
            self.dirty = true;
        }
        let mut opacity = self
            .doc
            .as_ref()
            .and_then(|doc| doc.active_layer())
            .map(|layer| layer.opacity)
            .unwrap_or(1.0);
        let mut blend = self
            .doc
            .as_ref()
            .and_then(|doc| doc.active_layer())
            .map(|layer| layer.blend)
            .unwrap_or_default();
        let mut add = false;
        let mut duplicate = false;
        let mut delete = false;
        ui.horizontal(|ui| {
            add = ui.button("+ Layer").clicked();
            duplicate = ui.button("Duplicate").clicked();
            delete = ui.button("Delete").clicked();
        });
        ui.add(egui::Slider::new(&mut opacity, 0.0..=1.0).text("Layer opacity"));
        egui::ComboBox::from_label("Blend mode")
            .selected_text(blend.label())
            .show_ui(ui, |ui| {
                for value in BlendMode::ALL {
                    ui.selectable_value(&mut blend, value, value.label());
                }
            });
        let merge = ui.button("Merge down").clicked();
        if self
            .doc
            .as_ref()
            .and_then(|doc| doc.active_layer())
            .is_some_and(|layer| layer.opacity != opacity || layer.blend != blend)
        {
            self.history.push(&original, "Layer properties");
            if let Some(layer) = self.doc.as_mut().and_then(|doc| doc.active_layer_mut()) {
                layer.opacity = opacity;
                layer.blend = blend;
                layer.touch();
            }
            if let Some(doc) = self.doc.as_mut() {
                doc.sync_frame();
            }
            self.canvas.invalidate();
            self.dirty = true;
        }
        if add {
            self.mutate_layer("Add layer", |doc| {
                doc.add_layer();
            });
        }
        if duplicate {
            self.mutate_layer("Duplicate layer", |doc| doc.duplicate_layer(doc.active));
        }
        if delete {
            self.mutate_layer("Delete layer", |doc| doc.delete_layer(doc.active));
        }
        if merge {
            self.mutate_layer("Merge down", |doc| {
                doc.merge_down(doc.active);
            });
        }
    }

    fn adjust_panel(&mut self, ui: &mut egui::Ui) {
        egui::ComboBox::from_label("Filter")
            .selected_text(self.filter.label())
            .show_ui(ui, |ui| {
                for filter in Filter::ALL {
                    if ui
                        .selectable_value(&mut self.filter, filter, filter.label())
                        .changed()
                    {
                        self.filter_values = self.filter.defaults();
                    }
                }
            });
        for (index, (name, min, max, _)) in self.filter.params().iter().enumerate() {
            if let Some(value) = self.filter_values.get_mut(index) {
                ui.add(egui::Slider::new(value, *min..=*max).text(*name));
            }
        }
        if ui.button("Apply filter").clicked() {
            let filter = self.filter;
            let values = self.filter_values.clone();
            self.mutate_layer("Adjust", |doc| {
                let (width, height) = (doc.w, doc.h);
                if let Some(layer) = doc.active_layer_mut() {
                    let mut flat = layer.pixels.to_flat();
                    adjust::apply(filter, &mut flat, width, height, &values);
                    layer.pixels.write_flat(&flat);
                    layer.touch();
                }
            });
        }
    }

    fn show_timeline(&mut self, ctx: &egui::Context) {
        let Some(doc) = self.doc.as_mut() else { return };
        if doc.anim.is_none() {
            return;
        }
        egui::TopBottomPanel::bottom("timeline")
            .resizable(false)
            .default_height(82.0)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.strong("Timeline");
                    if let Some(anim) = doc.anim.as_mut() {
                        ui.add(egui::Slider::new(&mut anim.fps, 1..=60).text("FPS"));
                        ui.checkbox(&mut anim.looping, "Loop");
                    }
                    if ui.button("+ Blank").clicked() {
                        doc.add_frame(false);
                        self.canvas.invalidate();
                        self.dirty = true;
                    }
                    if ui.button("Duplicate").clicked() {
                        doc.add_frame(true);
                        self.canvas.invalidate();
                        self.dirty = true;
                    }
                    if ui.button("Delete").clicked() {
                        doc.delete_frame();
                        self.canvas.invalidate();
                        self.dirty = true;
                    }
                });
                if let Some(anim) = doc.anim.as_ref() {
                    let frame_count = anim.frames.len();
                    let current = anim.current;
                    ui.horizontal_wrapped(|ui| {
                        for index in 0..frame_count {
                            if ui
                                .selectable_label(current == index, format!("Frame {}", index + 1))
                                .clicked()
                            {
                                doc.goto_frame(index);
                                self.canvas.invalidate();
                            }
                        }
                        if ui.button("←").clicked() {
                            doc.move_frame(-1);
                        }
                        if ui.button("→").clicked() {
                            doc.move_frame(1);
                        }
                    });
                }
            });
    }

    fn show_canvas(&mut self, ctx: &egui::Context) {
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ctx, |ui| {
                let size = ui.available_size().max(Vec2::splat(100.0));
                let (viewport, response) = ui.allocate_exact_size(size, Sense::click_and_drag());
                let Some(doc) = self.doc.as_ref() else { return };
                if self.canvas.zoom <= 0.0 {
                    self.canvas.fit(viewport, doc.w, doc.h);
                }
                self.canvas.draw(ui, ctx, doc, viewport);
                self.canvas_input(ctx, response);
            });
    }

    fn canvas_input(&mut self, ctx: &egui::Context, response: egui::Response) {
        let Some(doc) = self.doc.as_ref() else { return };
        let canvas_rect = self.canvas.canvas_rect(response.rect, doc.w, doc.h);
        let hovered = response.hovered();
        let pointer = ctx.input(|i| i.pointer.interact_pos());
        let modifiers = ctx.input(|i| i.modifiers);
        if hovered {
            let scroll = ctx.input(|i| i.raw_scroll_delta);
            if modifiers.ctrl && scroll.y != 0.0 {
                let old_zoom = self.canvas.zoom;
                let point = pointer.unwrap_or(response.rect.center());
                let canvas_point = self
                    .canvas
                    .screen_to_canvas(point, response.rect, doc.w, doc.h);
                let factor = (scroll.y * 0.002).exp();
                self.canvas.zoom = (old_zoom * factor).clamp(0.02, 8.0);
                let canvas_offset = Vec2::new(
                    (canvas_point.0 - doc.w as f32 * 0.5) * self.canvas.zoom,
                    (canvas_point.1 - doc.h as f32 * 0.5) * self.canvas.zoom,
                );
                self.canvas.pan = point - response.rect.center() - canvas_offset;
            } else if scroll != Vec2::ZERO {
                self.canvas.pan += scroll;
            }
        }
        let pressed = ctx.input(|i| i.pointer.button_pressed(egui::PointerButton::Primary));
        let down = ctx.input(|i| i.pointer.button_down(egui::PointerButton::Primary));
        let released = ctx.input(|i| i.pointer.button_released(egui::PointerButton::Primary));
        let middle_down = ctx.input(|i| i.pointer.button_down(egui::PointerButton::Middle));
        let Some(point) = pointer else { return };
        let inside_canvas = canvas_rect.contains(point);

        if down && hovered && (self.tool == Tool::Hand || middle_down) {
            self.canvas.pan += ctx.input(|i| i.pointer.delta());
            return;
        }

        if pressed && hovered && inside_canvas {
            let (x, y) = self
                .canvas
                .screen_to_canvas(point, response.rect, doc.w, doc.h);
            if modifiers.alt || self.tool == Tool::Eyedropper {
                let sample = doc.sample(x.round() as i32, y.round() as i32, true);
                self.color = [sample[0], sample[1], sample[2]];
                self.hex = color::to_hex(self.color);
                return;
            }
            if self.tool == Tool::Fill {
                self.fill_at(x.round() as i32, y.round() as i32);
                return;
            }
            let Some(doc) = self.doc.as_mut() else { return };
            let Some(layer) = doc.active_layer() else {
                return;
            };
            if layer.locked || !layer.visible {
                self.notify("The selected layer is hidden or locked");
                return;
            }
            if matches!(self.tool, Tool::Brush | Tool::Eraser | Tool::Shape) {
                self.history.push(
                    doc,
                    if self.tool == Tool::Eraser {
                        "Erase"
                    } else {
                        "Paint"
                    },
                );
                let preset = brush::preset(&self.brush_id);
                let params = StrokeParams {
                    tip: preset.tip,
                    size: self.size,
                    opacity: self.opacity,
                    flow: 1.0,
                    spacing: preset.spacing,
                    stream: preset.stream,
                    taper_start: 0.0,
                    taper_end: preset.taper / 100.0,
                    color: self.color,
                    mode: if self.tool == Tool::Eraser {
                        StrokeMode::Erase
                    } else {
                        StrokeMode::Paint
                    },
                    pressure_size: 0.0,
                    pressure_opacity: 0.0,
                    pressure_gamma: 1.0,
                    symmetry: self.symmetry,
                    alpha_lock: layer.alpha_lock,
                    jitter: 0.0,
                };
                let seed = storage::now_secs() as u32;
                let mut stroke = Stroke::new(params, layer.pixels.clone(), seed);
                let dirty = stroke.add_point(InputPoint {
                    x,
                    y,
                    pressure: 1.0,
                });
                stroke.apply(&mut doc.layers[doc.active].pixels, dirty);
                doc.layers[doc.active].touch();
                doc.sync_frame();
                self.canvas.invalidate_rect(dirty);
                self.stroke = Some(stroke);
                self.dirty = true;
                Self::push_brush_history(doc, &self.brush_id, self.color, self.size, self.opacity);
            } else if self.tool == Tool::Smudge {
                self.history.push(doc, "Smudge");
                let settings = SmudgeSettings::default();
                let mut smudge = SmudgeStroke::new(settings, self.size);
                let dirty = smudge.move_to(&mut doc.layers[doc.active].pixels, x, y, 1.0);
                self.canvas.invalidate_rect(dirty);
                self.smudge = Some(smudge);
                self.dirty = true;
            }
        } else if down && hovered {
            if let Some(stroke) = self.stroke.as_mut() {
                if let Some(doc) = self.doc.as_mut() {
                    let (x, y) = self
                        .canvas
                        .screen_to_canvas(point, response.rect, doc.w, doc.h);
                    let dirty = stroke.add_point(InputPoint {
                        x,
                        y,
                        pressure: 1.0,
                    });
                    if !dirty.is_empty() {
                        stroke.apply(&mut doc.layers[doc.active].pixels, dirty);
                        doc.layers[doc.active].touch();
                        doc.sync_frame();
                        self.canvas.invalidate_rect(dirty);
                    }
                    self.dirty = true;
                }
            }
            if let Some(smudge) = self.smudge.as_mut() {
                if let Some(doc) = self.doc.as_mut() {
                    let (x, y) = self
                        .canvas
                        .screen_to_canvas(point, response.rect, doc.w, doc.h);
                    let dirty = smudge.move_to(&mut doc.layers[doc.active].pixels, x, y, 1.0);
                    if !dirty.is_empty() {
                        doc.layers[doc.active].touch();
                        doc.sync_frame();
                        self.canvas.invalidate_rect(dirty);
                    }
                }
            }
        }
        if released {
            if let (Some(mut stroke), Some(doc)) = (self.stroke.take(), self.doc.as_mut()) {
                let dirty = if self.tool == Tool::Shape {
                    match (
                        stroke.points.first().copied(),
                        stroke.points.last().copied(),
                    ) {
                        (Some(start), Some(end)) => stroke.set_exact_points(vec![start, end]),
                        _ => stroke.rerender(true),
                    }
                } else {
                    stroke.rerender(true)
                };
                if !dirty.is_empty() {
                    stroke.apply(&mut doc.layers[doc.active].pixels, dirty);
                    doc.layers[doc.active].touch();
                    doc.sync_frame();
                    self.canvas.invalidate_rect(dirty);
                }
            }
            self.smudge = None;
        }
        if hovered {
            let radius = self.size * self.canvas.zoom * 0.5;
            let painter = ctx.layer_painter(egui::LayerId::new(
                egui::Order::Foreground,
                egui::Id::new("brush-cursor"),
            ));
            painter.circle_stroke(
                point,
                radius.min(150.0),
                egui::Stroke::new(1.0_f32, Color32::WHITE),
            );
        }
    }

    fn push_brush_history(
        doc: &mut Document,
        brush_id: &str,
        color_value: [u8; 3],
        size: f32,
        opacity: f32,
    ) {
        let entry = BrushHistoryEntry {
            brush_id: brush_id.to_string(),
            brush_name: brush::preset(brush_id).name.to_string(),
            color: color::to_hex(color_value),
            size,
            opacity,
            stream: brush::preset(brush_id).stream,
            taper: brush::preset(brush_id).taper,
        };
        if doc.brush_history.first() != Some(&entry) {
            doc.brush_history.insert(0, entry);
            doc.brush_history.truncate(12);
        }
    }

    fn fill_at(&mut self, x: i32, y: i32) {
        let Some(doc) = self.doc.as_mut() else { return };
        if x < 0 || y < 0 || x as usize >= doc.w || y as usize >= doc.h {
            return;
        }
        let Some(layer) = doc.active_layer() else {
            return;
        };
        if layer.locked || !layer.visible {
            self.notify("The selected layer is hidden or locked");
            return;
        }
        let flat = layer.pixels.to_flat();
        let Some(coverage) = crate::fill::flood_fill(
            &flat,
            doc.w,
            doc.h,
            x,
            y,
            crate::fill::FillOptions::default(),
        ) else {
            return;
        };
        self.history.push(doc, "Fill");
        let color = [self.color[0], self.color[1], self.color[2], 255];
        let active = doc.active;
        let layer = &mut doc.layers[active];
        for (index, amount) in coverage.iter().enumerate() {
            let strength = *amount as f32 / 255.0 * self.opacity;
            if strength > 0.0 {
                let offset = index * 4;
                let mut pixel = layer
                    .pixels
                    .get((index % doc.w) as i32, (index / doc.w) as i32);
                color::over_u8(&mut pixel, color, strength);
                layer
                    .pixels
                    .put((index % doc.w) as i32, (index / doc.w) as i32, pixel);
                let _ = offset;
            }
        }
        layer.touch();
        doc.sync_frame();
        self.canvas.invalidate();
        self.dirty = true;
    }

    fn import_layer(&mut self) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Image", &["png", "jpg", "jpeg", "webp", "bmp", "gif"])
            .pick_file()
        else {
            return;
        };
        let result = (|| -> anyhow::Result<()> {
            let bytes = std::fs::read(&path)?;
            let (flat, iw, ih) = project::decode_image_bytes(&bytes)?;
            let doc = self
                .doc
                .as_mut()
                .ok_or_else(|| anyhow::anyhow!("no open document"))?;
            self.history.push(doc, "Import image");
            let scale = (doc.w as f32 / iw as f32)
                .min(doc.h as f32 / ih as f32)
                .min(1.0);
            let (nw, nh) = (
                (iw as f32 * scale).round().max(1.0) as usize,
                (ih as f32 * scale).round().max(1.0) as usize,
            );
            let resized = if (nw, nh) == (iw, ih) {
                flat
            } else {
                adjust::resample(&flat, iw, ih, nw, nh)
            };
            let pixels = Tiled::from_flat(nw, nh, &resized);
            let mut centered = Tiled::new(doc.w, doc.h);
            let ox = (doc.w as i32 - nw as i32) / 2;
            let oy = (doc.h as i32 - nh as i32) / 2;
            centered.for_each_mut(
                IRect::new(ox, oy, ox + nw as i32, oy + nh as i32),
                |x, y, p| {
                    p.copy_from_slice(&pixels.get(x - ox, y - oy));
                },
            );
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Imported image");
            doc.add_layer_with(name, centered);
            doc.sync_frame();
            self.canvas.invalidate();
            self.dirty = true;
            Ok(())
        })();
        if let Err(error) = result {
            self.notify(format!("Import failed: {error:#}"));
        }
    }

    fn mutate_layer(&mut self, label: &str, action: impl FnOnce(&mut Document)) {
        let Some(doc) = self.doc.as_mut() else { return };
        self.history.push(doc, label);
        action(doc);
        doc.sync_frame();
        self.canvas.invalidate();
        self.dirty = true;
    }

    fn autosave_if_needed(&mut self) {
        if self.dirty && self.last_autosave.elapsed() > Duration::from_secs(60) {
            if let Some(doc) = self.doc.as_mut() {
                if let Err(error) = storage::autosave(doc) {
                    self.toast = format!("Autosave failed: {error:#}");
                }
            }
            self.last_autosave = Instant::now();
        }
    }
}

impl eframe::App for WinCreateApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.handle_shortcuts(ctx);
        self.autosave_if_needed();
        match self.screen {
            Screen::Home => self.show_home(ctx),
            Screen::Studio => {
                self.show_top_bar(ctx);
                self.show_tools(ctx);
                self.show_right_panel(ctx);
                self.show_timeline(ctx);
                self.show_canvas(ctx);
                if Instant::now() < self.toast_until {
                    egui::Area::new(egui::Id::new("toast"))
                        .anchor(egui::Align2::CENTER_BOTTOM, Vec2::new(0.0, -18.0))
                        .show(ctx, |ui| {
                            ui.label(
                                egui::RichText::new(&self.toast)
                                    .background_color(Color32::from_gray(35))
                                    .color(Color32::WHITE),
                            );
                        });
                }
            }
        }
        if self.dirty {
            ctx.request_repaint_after(Duration::from_secs(1));
        }
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        let data = serde_json::json!({
            "brush_id": self.brush_id,
            "brush_category": self.brush_category,
            "color": self.color,
            "secondary": self.secondary,
            "size": self.size,
            "opacity": self.opacity,
            "panel": self.panel,
        });
        storage.set_string("ui_preferences", data.to_string());
    }
}
