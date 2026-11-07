use super::*;

/// Separate from document state: appearance changes must never dirty artwork.
#[derive(Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub(super) struct WorkspacePrefs {
    pub accent_rgb: [u8; 3],
    pub compact: bool,
    pub gradients: bool,
    pub high_contrast: bool,
    pub corner_radius: u8,
    pub show_tools: bool,
    pub show_inspector: bool,
    pub show_timeline: bool,
}

impl Default for WorkspacePrefs {
    fn default() -> Self {
        Self {
            accent_rgb: [99, 222, 198],
            compact: false,
            gradients: true,
            high_contrast: false,
            corner_radius: 8,
            show_tools: true,
            show_inspector: true,
            show_timeline: true,
        }
    }
}

impl WorkspacePrefs {
    pub(super) fn accent(&self) -> Color32 {
        Color32::from_rgb(self.accent_rgb[0], self.accent_rgb[1], self.accent_rgb[2])
    }

    /// Accent text must remain visible against the dark workspace.
    pub(super) fn text_accent(&self) -> Color32 {
        let [r, g, b] = self.accent_rgb;
        let brightness = r as u32 * 299 + g as u32 * 587 + b as u32 * 114;
        if brightness < 140_000 {
            Color32::from_rgb(r / 2 + 127, g / 2 + 127, b / 2 + 127)
        } else {
            self.accent()
        }
    }

    /// Keep the primary CTA readable even with a very dark custom accent.
    pub(super) fn accent_ink(&self) -> Color32 {
        let [r, g, b] = self.accent_rgb;
        if (r as u32 * 299 + g as u32 * 587 + b as u32 * 114) > 145_000 {
            theme::INK
        } else {
            Color32::WHITE
        }
    }

    pub(super) fn apply(&self, ctx: &egui::Context) {
        theme::apply(ctx);
        let mut style = (*ctx.style()).clone();
        let accent = self.accent();
        let [r, g, b] = self.accent_rgb;
        let selected = Color32::from_rgb(22 + r / 8, 29 + g / 8, 38 + b / 8);
        style.visuals.selection.bg_fill = selected;
        style.visuals.widgets.active.bg_fill = selected;
        style.visuals.widgets.active.weak_bg_fill = selected;
        style.visuals.selection.stroke = egui::Stroke::new(1.5, self.text_accent());
        style.visuals.hyperlink_color = self.text_accent();
        style.visuals.widgets.hovered.bg_stroke = egui::Stroke::new(1.0, accent);
        style.visuals.widgets.active.bg_stroke = egui::Stroke::new(1.5, accent);
        for widget in [
            &mut style.visuals.widgets.noninteractive,
            &mut style.visuals.widgets.inactive,
            &mut style.visuals.widgets.hovered,
            &mut style.visuals.widgets.active,
            &mut style.visuals.widgets.open,
        ] {
            widget.corner_radius = egui::CornerRadius::same(self.corner_radius.min(16));
            if self.high_contrast {
                widget.bg_stroke.width = 1.5;
                widget.fg_stroke.color = Color32::WHITE;
            }
        }
        if self.high_contrast {
            style.visuals.widgets.noninteractive.bg_stroke.color = theme::MUTED;
            style.visuals.widgets.inactive.bg_stroke.color = theme::MUTED;
        }
        style.spacing.item_spacing = if self.compact { Vec2::new(8.0, 6.0) } else { Vec2::new(10.0, 9.0) };
        style.spacing.button_padding = if self.compact { Vec2::new(10.0, 6.0) } else { Vec2::new(13.0, 8.0) };
        style.spacing.interact_size.y = if self.compact { 30.0 } else { 36.0 };
        ctx.set_style(style);
    }
}

/// A real vertex-color gradient; no textures, dependencies, or per-frame allocations of images.
pub(super) fn gradient(painter: &egui::Painter, rect: egui::Rect, top: Color32, bottom: Color32) {
    if !rect.is_finite() || rect.width() <= 0.0 || rect.height() <= 0.0 { return; }
    let mut mesh = egui::Mesh::default();
    mesh.colored_vertex(rect.left_top(), top);
    mesh.colored_vertex(rect.right_top(), top);
    mesh.colored_vertex(rect.right_bottom(), bottom);
    mesh.colored_vertex(rect.left_bottom(), bottom);
    mesh.add_triangle(0, 1, 2);
    mesh.add_triangle(0, 2, 3);
    painter.add(egui::Shape::mesh(mesh));
}

impl WinCreateApp {
    pub(super) fn workspace_toast(&self, ctx: &egui::Context) {
        let now = Instant::now();
        if self.toast.is_empty() || now >= self.toast_until { return; }
        ctx.request_repaint_after(self.toast_until.saturating_duration_since(now));
        egui::Area::new(egui::Id::new("toast"))
            .order(egui::Order::Tooltip)
            .interactable(false)
            .anchor(egui::Align2::CENTER_BOTTOM, Vec2::new(0.0, -18.0))
            .show(ctx, |ui| {
                ui.set_max_width((ctx.screen_rect().width() - 32.0).clamp(160.0, 520.0));
                egui::Frame::popup(ui.style()).inner_margin(egui::Margin::same(12)).show(ui, |ui| {
                    ui.label(egui::RichText::new(&self.toast).color(theme::TEXT));
                });
            });
    }

    pub(super) fn workspace_bar(&mut self, ctx: &egui::Context) {
        if self.screen == Screen::Studio && !ctx.wants_keyboard_input()
            && !self.appearance_open && self.pending_exit.is_none()
            && ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::Tab))
        {
            self.focus_mode = !self.focus_mode;
        }
        let before = self.workspace.clone();
        egui::TopBottomPanel::top("workspace-controls").show(ctx, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.label(egui::RichText::new("WINCREATE").strong().color(self.workspace.text_accent()));
                ui.separator();
                if ui.button("Appearance").on_hover_text("Accent, density, contrast, corners and scale").clicked() {
                    self.appearance_open = true;
                }
                if self.screen == Screen::Studio {
                    ui.toggle_value(&mut self.focus_mode, "Focus · Tab")
                        .on_hover_text("Hide sidebars and timeline. Press Tab again to restore them.");
                    if !self.focus_mode {
                        ui.toggle_value(&mut self.workspace.show_tools, "Tools");
                        ui.toggle_value(&mut self.workspace.show_inspector, "Inspector");
                        ui.toggle_value(&mut self.workspace.show_timeline, "Timeline");
                    }
                }
                ui.menu_button("Shortcuts", |ui| {
                    ui.label("B Brush · E Eraser · S Smudge · G Fill");
                    ui.label("I Eyedropper · U Shape · V Move · H Hand");
                    ui.label("[ / ] Brush size · Tab Focus workspace");
                    ui.label("Ctrl+Z Undo · Ctrl+Shift+Z Redo");
                    ui.label("Ctrl+S Save · Ctrl+O Open · Ctrl+E Export");
                    ui.label("Ctrl+0 Fit canvas · Ctrl+1 Actual size");
                });
            });
            if self.workspace.gradients && !self.workspace.high_contrast {
                let rect = ui.max_rect();
                gradient(ui.painter(), egui::Rect::from_min_size(
                    egui::pos2(rect.left(), rect.bottom() - 2.0), Vec2::new(rect.width(), 2.0)),
                    self.workspace.accent(), theme::SURFACE);
            }
        });
        if before != self.workspace { self.workspace.apply(ctx); }
    }

    pub(super) fn appearance_window(&mut self, ctx: &egui::Context) {
        if !self.appearance_open { return; }
        let before = self.workspace.clone();
        let mut open = self.appearance_open;
        egui::Window::new("Make this studio yours")
            .id(egui::Id::new("workspace-appearance"))
            .open(&mut open).resizable(true).default_width(370.0)
            .show(ctx, |ui| {
                egui::ScrollArea::vertical().max_height(480.0).show(ui, |ui| {
                    ui.label(egui::RichText::new("APPEARANCE").small().strong().color(theme::MUTED));
                    ui.label("Preferences are remembered on this device.");
                    ui.add_space(8.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.label("Accent");
                        ui.color_edit_button_srgb(&mut self.workspace.accent_rgb);
                        for (name, rgb) in [("Mint", [99, 222, 198]), ("Iris", [170, 164, 255]), ("Rose", [255, 161, 190]), ("Gold", [245, 199, 111])] {
                            if ui.small_button(name).clicked() { self.workspace.accent_rgb = rgb; }
                        }
                    });
                    ui.checkbox(&mut self.workspace.gradients, "Subtle gradient accents");
                    ui.checkbox(&mut self.workspace.high_contrast, "High contrast outlines");
                    ui.checkbox(&mut self.workspace.compact, "Compact spacing");
                    ui.add(egui::Slider::new(&mut self.workspace.corner_radius, 0..=16).text("Corner radius"));
                    if ui.add(egui::Slider::new(&mut self.ui_scale, 0.75..=2.0).text("Interface scale")).changed() {
                        ctx.set_zoom_factor(self.ui_scale);
                    }
                    ui.separator();
                    ui.label(egui::RichText::new("WORKSPACE").small().strong().color(theme::MUTED));
                    ui.checkbox(&mut self.workspace.show_tools, "Show tool sidebar");
                    ui.checkbox(&mut self.workspace.show_inspector, "Show inspector");
                    ui.checkbox(&mut self.workspace.show_timeline, "Show animation timeline");
                    ui.checkbox(&mut self.focus_mode, "Focus mode (Tab)");
                    ui.label(egui::RichText::new("Drag sidebar edges to resize them. Focus mode never hides the controls needed to leave it.").small().color(theme::MUTED));
                    ui.add_space(8.0);
                    if ui.button("Reset appearance and panel visibility").clicked() {
                        self.workspace = WorkspacePrefs::default();
                        self.focus_mode = false;
                        self.ui_scale = 1.0;
                        ctx.set_zoom_factor(1.0);
                    }
                });
            });
        self.appearance_open = open;
        if before != self.workspace { self.workspace.apply(ctx); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn older_preferences_get_safe_defaults() {
        let prefs: WorkspacePrefs = serde_json::from_str("{}").unwrap();
        assert!(prefs.show_tools && prefs.show_inspector && prefs.show_timeline);
        assert_eq!(prefs.accent_rgb, [99, 222, 198]);
    }

    #[test]
    fn appearance_round_trips() {
        let mut prefs = WorkspacePrefs::default();
        prefs.accent_rgb = [80, 90, 100];
        prefs.compact = true;
        prefs.show_inspector = false;
        let restored: WorkspacePrefs = serde_json::from_str(&serde_json::to_string(&prefs).unwrap()).unwrap();
        assert!(prefs == restored);
    }

    #[test]
    fn dark_accents_use_light_button_text() {
        let mut prefs = WorkspacePrefs::default();
        prefs.accent_rgb = [0, 0, 0];
        assert_eq!(prefs.accent_ink(), Color32::WHITE);
        prefs.accent_rgb = [255, 255, 255];
        assert_eq!(prefs.accent_ink(), theme::INK);
    }
}
