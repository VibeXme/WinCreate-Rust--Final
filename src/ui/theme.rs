//! Shared studio palette and interaction styling.
use eframe::egui::{self, Color32, Stroke, Vec2};

pub(super) const BACKGROUND: Color32 = Color32::from_rgb(16, 20, 27);
pub(super) const SURFACE: Color32 = Color32::from_rgb(23, 29, 38);
pub(super) const RAISED: Color32 = Color32::from_rgb(32, 40, 52);
pub(super) const BORDER: Color32 = Color32::from_rgb(55, 67, 83);
pub(super) const TEXT: Color32 = Color32::from_rgb(232, 239, 247);
pub(super) const MUTED: Color32 = Color32::from_rgb(164, 179, 197);
pub(super) const ACCENT: Color32 = Color32::from_rgb(99, 222, 198);
pub(super) const INK: Color32 = Color32::from_rgb(12, 32, 30);

pub(super) fn apply(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::dark();
    visuals.panel_fill = BACKGROUND;
    visuals.window_fill = SURFACE;
    visuals.extreme_bg_color = Color32::from_rgb(12, 16, 22);
    visuals.faint_bg_color = SURFACE;
    visuals.code_bg_color = RAISED;
    visuals.hyperlink_color = ACCENT;
    visuals.window_stroke = Stroke::new(1.0, BORDER);
    visuals.selection.bg_fill = Color32::from_rgb(36, 77, 74);
    visuals.selection.stroke = Stroke::new(1.0, ACCENT);

    visuals.widgets.noninteractive.bg_fill = SURFACE;
    visuals.widgets.noninteractive.weak_bg_fill = SURFACE;
    visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, BORDER);
    visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, TEXT);
    visuals.widgets.inactive.bg_fill = RAISED;
    visuals.widgets.inactive.weak_bg_fill = RAISED;
    visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, BORDER);
    visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, TEXT);
    visuals.widgets.hovered.bg_fill = Color32::from_rgb(43, 59, 70);
    visuals.widgets.hovered.weak_bg_fill = Color32::from_rgb(43, 59, 70);
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, ACCENT);
    visuals.widgets.hovered.fg_stroke = Stroke::new(1.0, TEXT);
    visuals.widgets.active.bg_fill = Color32::from_rgb(36, 77, 74);
    visuals.widgets.active.weak_bg_fill = Color32::from_rgb(36, 77, 74);
    visuals.widgets.active.bg_stroke = Stroke::new(1.0, ACCENT);
    visuals.widgets.active.fg_stroke = Stroke::new(1.0, TEXT);
    ctx.set_visuals(visuals);

    let mut style = (*ctx.style()).clone();
    for (text_style, size) in [
        (egui::TextStyle::Body, 14.0),
        (egui::TextStyle::Button, 14.0),
        (egui::TextStyle::Heading, 21.0),
        (egui::TextStyle::Small, 12.0),
    ] {
        style.text_styles.insert(text_style, egui::FontId::proportional(size));
    }
    style.spacing.item_spacing = Vec2::new(10.0, 9.0);
    style.spacing.button_padding = Vec2::new(13.0, 8.0);
    style.spacing.interact_size = Vec2::new(44.0, 34.0);
    ctx.set_style(style);
}
