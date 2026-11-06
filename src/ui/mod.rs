mod canvas;
mod files;
mod home;
mod panels;
mod timeline;
mod tools;

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
use std::collections::HashMap;
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

#[derive(Clone, Copy, PartialEq, Eq)]
enum ExitAction {
    Gallery,
    Close,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ShapeKind {
    Line,
    Rectangle,
    Ellipse,
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
    flow: f32,
    stream: f32,
    spacing: f32,
    taper_start: f32,
    taper_end: f32,
    jitter: f32,
    pressure_size: f32,
    pressure_opacity: f32,
    pressure_gamma: f32,
    simulate_pressure_from_speed: bool,
    quick_shape: bool,
    shape_kind: ShapeKind,
    stroke_last_moved: Instant,
    fill_tolerance: f32,
    fill_gap: u32,
    fill_expand: u32,
    sample_all_layers: bool,
    mask_edit: bool,
    smudge_preset: String,
    brush_id: String,
    brush_category: String,
    panel: String,
    preset_title: String,
    width: usize,
    height: usize,
    transparent: bool,
    animation: bool,
    new_background: [u8; 3],
    gallery_id: Option<String>,
    gallery: Vec<GalleryEntry>,
    gallery_thumbnails: HashMap<String, egui::TextureHandle>,
    delete_confirmation: Option<GalleryEntry>,
    brush_thumbnails: HashMap<String, egui::TextureHandle>,
    frame_thumbnails: HashMap<usize, (u64, egui::TextureHandle)>,
    layer_thumbnails: HashMap<u64, (u64, egui::TextureHandle)>,
    rename_layer: Option<usize>,
    recent_colors: Vec<[u8; 3]>,
    custom_palette: Vec<[u8; 3]>,
    recovery: Option<GalleryEntry>,
    toast: String,
    toast_until: Instant,
    dirty: bool,
    last_autosave: Instant,
    filter: Filter,
    filter_values: Vec<f32>,
    adjustment_preview: bool,
    adjustment_original: Option<Document>,
    transform_original: Option<Document>,
    transform_scale: f32,
    transform_rotation: f32,
    transform_offset: Vec2,
    transform_drag_start: Option<(f32, f32)>,
    transform_initial_offset: Vec2,
    fill_receiver: Option<std::sync::mpsc::Receiver<Option<tools::FillResult>>>,
    fill_original: Option<Document>,
    pending_exit: Option<ExitAction>,
    resize_dialog_open: bool,
    resize_width: usize,
    resize_height: usize,
    resize_scale: bool,
    timeline_playing: bool,
    timeline_elapsed: f32,
    last_frame_advance: Instant,
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
            opacity: brush::preset("studio").alpha,
            flow: 1.0,
            stream: brush::preset("studio").stream,
            spacing: brush::preset("studio").spacing,
            taper_start: 0.0,
            taper_end: brush::preset("studio").taper,
            jitter: 0.0,
            pressure_size: 0.0,
            pressure_opacity: 0.0,
            pressure_gamma: 1.0,
            simulate_pressure_from_speed: false,
            quick_shape: true,
            shape_kind: ShapeKind::Line,
            stroke_last_moved: Instant::now(),
            fill_tolerance: crate::fill::FillOptions::default().tolerance,
            fill_gap: crate::fill::FillOptions::default().gap,
            fill_expand: crate::fill::FillOptions::default().expand,
            sample_all_layers: false,
            mask_edit: false,
            smudge_preset: "blend".to_string(),
            brush_id: "studio".to_string(),
            brush_category: "Inking".to_string(),
            panel: "Brushes".to_string(),
            preset_title: "Untitled Artwork".to_string(),
            width: 1280,
            height: 720,
            transparent: false,
            animation: false,
            new_background: [255, 255, 255],
            gallery_id: None,
            gallery: storage::list_gallery(),
            gallery_thumbnails: HashMap::new(),
            delete_confirmation: None,
            brush_thumbnails: HashMap::new(),
            frame_thumbnails: HashMap::new(),
            layer_thumbnails: HashMap::new(),
            rename_layer: None,
            recent_colors: vec![[86, 190, 255]],
            custom_palette: Vec::new(),
            recovery: storage::recovery(),
            toast: String::new(),
            toast_until: Instant::now(),
            dirty: false,
            last_autosave: Instant::now(),
            filter: Filter::Hsb,
            filter_values: Filter::Hsb.defaults(),
            adjustment_preview: false,
            adjustment_original: None,
            transform_original: None,
            transform_scale: 1.0,
            transform_rotation: 0.0,
            transform_offset: Vec2::ZERO,
            transform_drag_start: None,
            transform_initial_offset: Vec2::ZERO,
            fill_receiver: None,
            fill_original: None,
            pending_exit: None,
            resize_dialog_open: false,
            resize_width: 1280,
            resize_height: 720,
            resize_scale: true,
            timeline_playing: false,
            timeline_elapsed: 0.0,
            last_frame_advance: Instant::now(),
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
                let number = |key: &str, fallback: f32| {
                    prefs
                        .get(key)
                        .and_then(|value| value.as_f64())
                        .map(|value| value as f32)
                        .unwrap_or(fallback)
                };
                let boolean = |key: &str, fallback: bool| {
                    prefs
                        .get(key)
                        .and_then(|value| value.as_bool())
                        .unwrap_or(fallback)
                };
                let color_value = |value: &serde_json::Value| {
                    let values = value.as_array()?;
                    if values.len() != 3 {
                        return None;
                    }
                    Some([
                        values[0].as_u64()?.min(255) as u8,
                        values[1].as_u64()?.min(255) as u8,
                        values[2].as_u64()?.min(255) as u8,
                    ])
                };
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
                if let Some(value) = prefs.get("secondary").and_then(color_value) {
                    app.secondary = value;
                }
                if let Some(values) = prefs
                    .get("recent_colors")
                    .and_then(|value| value.as_array())
                {
                    app.recent_colors = values.iter().filter_map(color_value).take(12).collect();
                }
                if let Some(values) = prefs
                    .get("custom_palette")
                    .and_then(|value| value.as_array())
                {
                    app.custom_palette = values.iter().filter_map(color_value).take(48).collect();
                }
                app.size = number("size", app.size).clamp(brush::MIN_SIZE, brush::MAX_SIZE);
                app.opacity = number("opacity", app.opacity).clamp(0.01, 1.0);
                app.flow = number("flow", app.flow).clamp(0.01, 1.0);
                app.stream = number("stream", app.stream).clamp(0.0, 100.0);
                app.spacing = number("spacing", app.spacing).clamp(0.01, 1.0);
                app.taper_start = number("taper_start", app.taper_start).clamp(0.0, 100.0);
                app.taper_end = number("taper_end", app.taper_end).clamp(0.0, 100.0);
                app.jitter = number("jitter", app.jitter).clamp(0.0, 1.0);
                app.pressure_size = number("pressure_size", app.pressure_size).clamp(0.0, 1.0);
                app.pressure_opacity =
                    number("pressure_opacity", app.pressure_opacity).clamp(0.0, 1.0);
                app.pressure_gamma = number("pressure_gamma", app.pressure_gamma).clamp(0.25, 3.0);
                app.quick_shape = boolean("quick_shape", app.quick_shape);
                app.simulate_pressure_from_speed =
                    boolean("simulate_pressure", app.simulate_pressure_from_speed);
                app.sample_all_layers = boolean("sample_all_layers", app.sample_all_layers);
                app.canvas.flip_x = boolean("flip_x", app.canvas.flip_x);
                app.canvas.grid_visible = boolean("grid_visible", app.canvas.grid_visible);
                app.canvas.rotation = number("rotation", app.canvas.rotation);
                app.canvas.grid_spacing = prefs
                    .get("grid_spacing")
                    .and_then(|value| value.as_u64())
                    .map(|value| value.clamp(4, 1024) as usize)
                    .unwrap_or(app.canvas.grid_spacing);
                if let Some(value) = prefs.get("symmetry").and_then(|v| v.as_str()) {
                    if let Some(symmetry) = Symmetry::ALL.iter().find(|item| item.label() == value)
                    {
                        app.symmetry = *symmetry;
                    }
                }
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
}

impl eframe::App for WinCreateApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.poll_fill(ctx);
        if ctx.input(|input| input.viewport().close_requested()) && self.dirty {
            self.pending_exit = Some(ExitAction::Close);
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
        }
        if self.fill_receiver.is_none() {
            self.handle_shortcuts(ctx);
        }
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
        self.show_unsaved_dialog(ctx);
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
            "recent_colors": self.recent_colors,
            "custom_palette": self.custom_palette,
            "size": self.size,
            "opacity": self.opacity,
            "flow": self.flow,
            "stream": self.stream,
            "spacing": self.spacing,
            "taper_start": self.taper_start,
            "taper_end": self.taper_end,
            "jitter": self.jitter,
            "pressure_size": self.pressure_size,
            "pressure_opacity": self.pressure_opacity,
            "pressure_gamma": self.pressure_gamma,
            "quick_shape": self.quick_shape,
            "simulate_pressure": self.simulate_pressure_from_speed,
            "sample_all_layers": self.sample_all_layers,
            "flip_x": self.canvas.flip_x,
            "grid_visible": self.canvas.grid_visible,
            "grid_spacing": self.canvas.grid_spacing,
            "rotation": self.canvas.rotation,
            "symmetry": self.symmetry.label(),
            "panel": self.panel,
        });
        storage.set_string("ui_preferences", data.to_string());
    }
}
