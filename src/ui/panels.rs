use super::*;

impl WinCreateApp {
    pub(super) fn show_right_panel(&mut self, ctx: &egui::Context) {
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
                ui.separator();
                self.trace_panel(ui);
            });
    }

    fn trace_panel(&mut self, ui: &mut egui::Ui) {
        let mut load = false;
        let mut extract = false;
        let mut remove = false;
        ui.collapsing("Trace reference", |ui| {
            load = ui.button("Load reference image…").clicked();
            if let Some(reference) = self.canvas.trace.as_mut() {
                ui.checkbox(&mut reference.locked, "Lock reference");
                ui.add_enabled_ui(!reference.locked, |ui| {
                    ui.add(egui::Slider::new(&mut reference.opacity, 0.0..=1.0).text("Opacity"));
                    ui.add(egui::Slider::new(&mut reference.scale, 0.05..=8.0).text("Scale"));
                    ui.horizontal(|ui| {
                        ui.label("Offset");
                        ui.add(
                            egui::DragValue::new(&mut reference.offset.x)
                                .speed(1.0)
                                .prefix("X "),
                        );
                        ui.add(
                            egui::DragValue::new(&mut reference.offset.y)
                                .speed(1.0)
                                .prefix("Y "),
                        );
                    });
                });
                ui.horizontal(|ui| {
                    extract = ui.button("Extract edges to layer").clicked();
                    remove = ui.button("Remove").clicked();
                });
            }
        });
        if load {
            self.load_trace_reference();
        }
        if extract {
            self.extract_trace_edges();
        }
        if remove {
            self.canvas.trace = None;
        }
    }

    pub(super) fn brush_panel(&mut self, ui: &mut egui::Ui) {
        egui::ComboBox::from_label("Category")
            .selected_text(self.brush_category.clone())
            .show_ui(ui, |ui| {
                for category in brush::CATEGORIES {
                    ui.selectable_value(&mut self.brush_category, category.to_string(), category);
                }
            });
        let presets = brush::presets()
            .iter()
            .filter(|preset| preset.category == self.brush_category)
            .cloned()
            .collect::<Vec<_>>();
        egui::ScrollArea::vertical()
            .max_height(190.0)
            .show(ui, |ui| {
                for preset in presets {
                    let texture = self.brush_thumbnail(ui.ctx(), &preset);
                    ui.horizontal(|ui| {
                        ui.image((texture.id(), Vec2::new(88.0, 28.0)));
                        if ui
                            .selectable_label(self.brush_id == preset.id, preset.name)
                            .clicked()
                        {
                            self.brush_id = preset.id.to_string();
                            self.size = 24.0;
                            self.opacity = preset.alpha;
                            self.flow = 1.0;
                            self.stream = preset.stream;
                            self.spacing = preset.spacing;
                            self.taper_start = 0.0;
                            self.taper_end = preset.taper;
                            self.jitter = 0.0;
                            self.pressure_size = 0.0;
                            self.pressure_opacity = 0.0;
                            self.pressure_gamma = 1.0;
                        }
                    });
                }
            });
        ui.separator();
        ui.label(format!("Selected · {}", brush::preset(&self.brush_id).name));
        let mut size_slider = brush::size_to_slider(self.size);
        if ui
            .add(egui::Slider::new(&mut size_slider, 0.0..=1.0).text("Size"))
            .changed()
        {
            self.size = brush::slider_to_size(size_slider);
        }
        ui.add(egui::Slider::new(&mut self.opacity, 0.01..=1.0).text("Opacity"));
        ui.add(egui::Slider::new(&mut self.flow, 0.01..=1.0).text("Flow"));
        ui.add(egui::Slider::new(&mut self.stream, 0.0..=100.0).text("Streamline"));
        ui.add(egui::Slider::new(&mut self.spacing, 0.01..=1.0).text("Spacing"));
        ui.add(egui::Slider::new(&mut self.taper_start, 0.0..=100.0).text("Taper start"));
        ui.add(egui::Slider::new(&mut self.taper_end, 0.0..=100.0).text("Taper end"));
        ui.add(egui::Slider::new(&mut self.jitter, 0.0..=1.0).text("Jitter"));
        ui.add(egui::Slider::new(&mut self.pressure_size, 0.0..=1.0).text("Pressure → size"));
        ui.add(egui::Slider::new(&mut self.pressure_opacity, 0.0..=1.0).text("Pressure → opacity"));
        ui.add(egui::Slider::new(&mut self.pressure_gamma, 0.25..=3.0).text("Pressure gamma"));
        egui::ComboBox::from_label("Smudge preset")
            .selected_text(self.smudge_preset.clone())
            .show_ui(ui, |ui| {
                for (id, label) in SmudgeSettings::PRESETS {
                    ui.selectable_value(&mut self.smudge_preset, id.to_string(), label);
                }
            });
        if let Some(history) = self.doc.as_ref().map(|doc| doc.brush_history.clone()) {
            ui.separator();
            ui.label("Recent brushes");
            ui.horizontal_wrapped(|ui| {
                for entry in history {
                    if ui
                        .small_button(format!("{} · {:.0}px", entry.brush_name, entry.size))
                        .clicked()
                    {
                        self.brush_id = entry.brush_id.clone();
                        self.size = entry.size;
                        self.opacity = entry.opacity;
                        self.stream = entry.stream;
                        self.taper_end = entry.taper;
                        let preset = brush::preset(&self.brush_id);
                        self.brush_category = preset.category.to_string();
                        self.spacing = preset.spacing;
                        if let Some(rgb) = color::parse_hex(&entry.color) {
                            self.color = rgb;
                            self.hex = entry.color;
                            self.remember_current_color();
                        }
                    }
                }
            });
        }
    }

    fn brush_thumbnail(
        &mut self,
        ctx: &egui::Context,
        preset: &brush::BrushPreset,
    ) -> egui::TextureHandle {
        if let Some(texture) = self.brush_thumbnails.get(preset.id) {
            return texture.clone();
        }
        let mut pixels = Tiled::new(120, 32);
        let params = StrokeParams {
            tip: preset.tip,
            size: 7.0,
            opacity: preset.alpha,
            flow: 1.0,
            spacing: preset.spacing,
            stream: preset.stream,
            taper_start: 0.0,
            taper_end: preset.taper,
            color: [135, 200, 255],
            mode: StrokeMode::Paint,
            pressure_size: 0.0,
            pressure_opacity: 0.0,
            pressure_gamma: 1.0,
            symmetry: Symmetry::Off,
            alpha_lock: false,
            jitter: 0.0,
        };
        let mut stroke = Stroke::new(params, pixels.clone(), preset.id.len() as u32);
        let mut dirty = stroke.add_point(InputPoint {
            x: 8.0,
            y: 24.0,
            pressure: 1.0,
        });
        for point in [
            InputPoint {
                x: 36.0,
                y: 8.0,
                pressure: 0.8,
            },
            InputPoint {
                x: 70.0,
                y: 24.0,
                pressure: 0.65,
            },
            InputPoint {
                x: 110.0,
                y: 9.0,
                pressure: 1.0,
            },
        ] {
            dirty = dirty.union(&stroke.add_point(point));
        }
        stroke.rerender(true);
        stroke.apply(&mut pixels, dirty);
        let image = egui::ColorImage::from_rgba_unmultiplied([120, 32], &pixels.to_flat());
        let texture = ctx.load_texture(
            format!("brush-preview-{}", preset.id),
            image,
            egui::TextureOptions::LINEAR,
        );
        self.brush_thumbnails
            .insert(preset.id.to_string(), texture.clone());
        texture
    }

    pub(super) fn colour_panel(&mut self, ui: &mut egui::Ui) {
        ui.heading("Colour studio");
        let [r, g, b] = color::u8_to_f(self.color);
        let (mut hue, mut saturation, mut value) = color::rgb_to_hsv([r, g, b]);
        let width = ui.available_width().clamp(140.0, 230.0);
        let (square, square_response) =
            ui.allocate_exact_size(Vec2::new(width, 150.0), egui::Sense::click_and_drag());
        paint_hsv_square(ui.painter(), square, hue);
        if let Some(pos) = square_response.interact_pointer_pos() {
            saturation = ((pos.x - square.left()) / square.width()).clamp(0.0, 1.0);
            value = (1.0 - (pos.y - square.top()) / square.height()).clamp(0.0, 1.0);
            self.set_primary_color(hue, saturation, value);
        }
        let (hue_rect, hue_response) =
            ui.allocate_exact_size(Vec2::new(width, 16.0), egui::Sense::click_and_drag());
        paint_hue_strip(ui.painter(), hue_rect);
        if let Some(pos) = hue_response.interact_pointer_pos() {
            hue = ((pos.x - hue_rect.left()) / hue_rect.width()).clamp(0.0, 1.0) * 360.0;
            self.set_primary_color(hue, saturation, value);
        }
        ui.separator();
        ui.horizontal(|ui| {
            ui.label("Hex");
            let response = ui.text_edit_singleline(&mut self.hex);
            if response.lost_focus() || response.changed() {
                if let Some(value) = color::parse_hex(&self.hex) {
                    self.color = value;
                    self.remember_current_color();
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
            self.remember_current_color();
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
                self.remember_current_color();
            }
            ui.label("Secondary");
            ui.colored_label(
                Color32::from_rgb(self.secondary[0], self.secondary[1], self.secondary[2]),
                "██████",
            );
        });
        ui.label("Built-in palettes");
        for (name, palette) in [
            (
                "Studio",
                [
                    [30, 34, 48],
                    [237, 91, 99],
                    [255, 186, 73],
                    [116, 211, 156],
                    [86, 190, 255],
                    [164, 120, 255],
                ],
            ),
            (
                "Earth",
                [
                    [56, 41, 31],
                    [119, 77, 53],
                    [174, 119, 75],
                    [204, 167, 112],
                    [130, 141, 91],
                    [73, 99, 76],
                ],
            ),
            (
                "Cool",
                [
                    [20, 34, 58],
                    [40, 83, 128],
                    [53, 142, 174],
                    [112, 192, 197],
                    [163, 188, 219],
                    [207, 214, 230],
                ],
            ),
        ] {
            ui.horizontal_wrapped(|ui| {
                ui.label(name);
                for swatch in palette {
                    let button = egui::Button::new("  ")
                        .fill(Color32::from_rgb(swatch[0], swatch[1], swatch[2]));
                    if ui.add(button).clicked() {
                        self.color = swatch;
                        self.hex = color::to_hex(self.color);
                        self.remember_current_color();
                    }
                }
            });
        }
        ui.horizontal(|ui| {
            ui.label("Recent");
            for swatch in self.recent_colors.clone() {
                if ui
                    .add(
                        egui::Button::new(" ")
                            .min_size(Vec2::splat(18.0))
                            .fill(Color32::from_rgb(swatch[0], swatch[1], swatch[2])),
                    )
                    .clicked()
                {
                    self.color = swatch;
                    self.hex = color::to_hex(swatch);
                }
            }
        });
        if ui.button("Add current colour to custom palette").clicked()
            && !self.custom_palette.contains(&self.color)
            && self.custom_palette.len() < 48
        {
            self.custom_palette.push(self.color);
        }
        ui.horizontal_wrapped(|ui| {
            for swatch in self.custom_palette.clone() {
                if ui
                    .add(
                        egui::Button::new(" ")
                            .min_size(Vec2::splat(18.0))
                            .fill(Color32::from_rgb(swatch[0], swatch[1], swatch[2])),
                    )
                    .clicked()
                {
                    self.color = swatch;
                    self.hex = color::to_hex(swatch);
                }
            }
        });
    }

    fn set_primary_color(&mut self, hue: f32, saturation: f32, value: f32) {
        self.color = color::hsv_to_rgb(hue, saturation, value)
            .map(|channel| (channel.clamp(0.0, 1.0) * 255.0).round() as u8);
        self.hex = color::to_hex(self.color);
        self.remember_current_color();
    }

    pub(super) fn remember_current_color(&mut self) {
        if self.recent_colors.first() != Some(&self.color) {
            self.recent_colors.insert(0, self.color);
            self.recent_colors.truncate(12);
        }
    }

    pub(super) fn layers_panel(&mut self, ui: &mut egui::Ui) {
        let Some(doc) = self.doc.as_ref() else { return };
        let original = doc.clone();
        let active = doc.active;
        let rows = doc
            .layers
            .iter()
            .enumerate()
            .rev()
            .map(|(index, layer)| {
                (
                    index,
                    layer.id,
                    layer.rev,
                    layer.name.clone(),
                    layer.visible,
                    layer.locked,
                    layer.alpha_lock,
                    layer.clip,
                    layer.mask.is_some(),
                    layer.mask_enabled,
                )
            })
            .collect::<Vec<_>>();
        let mut selected = None;
        let mut visibility = Vec::new();
        let mut locks = Vec::new();
        let mut alpha_locks = Vec::new();
        let mut clipping = Vec::new();
        let mut mask_enabled = Vec::new();
        let mut renames = Vec::new();
        egui::ScrollArea::vertical()
            .max_height(300.0)
            .show(ui, |ui| {
                for (index, id, revision, name, visible, locked, alpha, clip, has_mask, mask_on) in
                    &rows
                {
                    ui.horizontal(|ui| {
                        if let Some(texture) =
                            self.layer_thumbnail(ui.ctx(), *index, *id, *revision)
                        {
                            ui.image((texture.id(), Vec2::new(36.0, 30.0)));
                        }
                        if self.rename_layer == Some(*index) {
                            let mut edited = name.clone();
                            let response = ui.text_edit_singleline(&mut edited);
                            if response.lost_focus()
                                || ui.input(|input| input.key_pressed(egui::Key::Enter))
                            {
                                renames.push((*index, edited));
                                self.rename_layer = None;
                            }
                        } else {
                            let response = ui.selectable_label(active == *index, name);
                            if response.clicked() {
                                selected = Some(*index);
                            }
                            if response.double_clicked() {
                                self.rename_layer = Some(*index);
                            }
                        }
                        let mut is_visible = *visible;
                        if ui.checkbox(&mut is_visible, "◉").changed() {
                            visibility.push((*index, is_visible));
                        }
                        let mut is_locked = *locked;
                        if ui.checkbox(&mut is_locked, "🔒").changed() {
                            locks.push((*index, is_locked));
                        }
                    });
                    ui.horizontal(|ui| {
                        ui.label(format!("Layer {}", index + 1));
                        let mut alpha_lock = *alpha;
                        if ui.checkbox(&mut alpha_lock, "Alpha lock").changed() {
                            alpha_locks.push((*index, alpha_lock));
                        }
                        let mut clipped = *clip;
                        if ui.checkbox(&mut clipped, "Clip").changed() {
                            clipping.push((*index, clipped));
                        }
                        if *has_mask {
                            let mut enabled = *mask_on;
                            if ui.checkbox(&mut enabled, "Mask").changed() {
                                mask_enabled.push((*index, enabled));
                            }
                        } else {
                            ui.label("No mask");
                        }
                    });
                }
            });
        if let Some(index) = selected {
            if let Some(doc) = self.doc.as_mut() {
                doc.active = index;
            }
        }
        if !visibility.is_empty()
            || !locks.is_empty()
            || !alpha_locks.is_empty()
            || !clipping.is_empty()
            || !mask_enabled.is_empty()
            || !renames.is_empty()
        {
            self.history.push(&original, "Layer properties");
            if let Some(doc) = self.doc.as_mut() {
                for (index, value) in visibility {
                    doc.layers[index].visible = value;
                }
                for (index, value) in locks {
                    doc.layers[index].locked = value;
                }
                for (index, value) in alpha_locks {
                    doc.layers[index].alpha_lock = value;
                }
                for (index, value) in clipping {
                    doc.layers[index].clip = value;
                }
                for (index, value) in mask_enabled {
                    doc.layers[index].mask_enabled = value;
                }
                for (index, name) in renames {
                    if !name.trim().is_empty() {
                        doc.layers[index].name = name;
                    }
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
        let mut move_up = false;
        let mut move_down = false;
        let mut clear = false;
        let mut flip_horizontal = false;
        let mut flip_vertical = false;
        let mut add_mask = false;
        let mut delete_mask = false;
        let mut background_changed = false;
        let mut background_visible = self.doc.as_ref().is_some_and(|doc| doc.bg_visible);
        let mut background = self.doc.as_ref().map_or([255, 255, 255], |doc| doc.bg);
        ui.horizontal(|ui| {
            add = ui.button("+ Layer").clicked();
            duplicate = ui.button("Duplicate").clicked();
            delete = ui.button("Delete").clicked();
        });
        ui.horizontal(|ui| {
            move_up = ui.button("↑").clicked();
            move_down = ui.button("↓").clicked();
            clear = ui.button("Clear").clicked();
            flip_horizontal = ui.button("Flip H").clicked();
            flip_vertical = ui.button("Flip V").clicked();
        });
        ui.add(egui::Slider::new(&mut opacity, 0.0..=1.0).text("Layer opacity"));
        egui::ComboBox::from_label("Blend mode")
            .selected_text(blend.label())
            .show_ui(ui, |ui| {
                for value in BlendMode::ALL {
                    ui.selectable_value(&mut blend, value, value.label());
                }
            });
        ui.horizontal(|ui| {
            add_mask = ui.button("Add mask").clicked();
            delete_mask = ui.button("Delete mask").clicked();
            ui.checkbox(&mut self.mask_edit, "Edit mask");
        });
        ui.horizontal(|ui| {
            ui.checkbox(&mut background_visible, "Background");
            let mut color = Color32::from_rgb(background[0], background[1], background[2]);
            if ui.color_edit_button_srgba(&mut color).changed() {
                background = [color.r(), color.g(), color.b()];
                background_changed = true;
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
        if move_up {
            self.mutate_layer("Move layer", |doc| {
                let to = (doc.active + 1).min(doc.layers.len().saturating_sub(1));
                doc.move_layer(doc.active, to);
            });
        }
        if move_down {
            self.mutate_layer("Move layer", |doc| {
                doc.move_layer(doc.active, doc.active.saturating_sub(1));
            });
        }
        if clear {
            self.mutate_layer("Clear layer", |doc| {
                let active = doc.active;
                doc.layers[active].pixels = Tiled::new(doc.w, doc.h);
                doc.layers[active].touch();
            });
        }
        if flip_horizontal {
            self.mutate_layer("Flip layer", |doc| {
                let (w, h, active) = (doc.w, doc.h, doc.active);
                let mut flat = doc.layers[active].pixels.to_flat();
                adjust::flip_h(&mut flat, w, h);
                doc.layers[active].pixels.write_flat(&flat);
                doc.layers[active].touch();
            });
        }
        if flip_vertical {
            self.mutate_layer("Flip layer", |doc| {
                let (w, h, active) = (doc.w, doc.h, doc.active);
                let mut flat = doc.layers[active].pixels.to_flat();
                adjust::flip_v(&mut flat, w, h);
                doc.layers[active].pixels.write_flat(&flat);
                doc.layers[active].touch();
            });
        }
        if add_mask {
            self.mutate_layer("Add mask", |doc| {
                let (w, h, active) = (doc.w, doc.h, doc.active);
                if doc.layers[active].mask.is_none() {
                    doc.layers[active].mask = Some(Tiled::new(w, h));
                }
                doc.layers[active].mask_enabled = true;
                doc.layers[active].touch();
            });
        }
        if delete_mask {
            self.mutate_layer("Delete mask", |doc| {
                let active = doc.active;
                doc.layers[active].mask = None;
                doc.layers[active].mask_enabled = false;
                doc.layers[active].touch();
            });
            self.mask_edit = false;
        }
        if background_changed || background_visible != original.bg_visible {
            self.mutate_layer("Canvas background", |doc| {
                doc.bg = background;
                doc.bg_visible = background_visible;
            });
        }
    }

    fn layer_thumbnail(
        &mut self,
        ctx: &egui::Context,
        index: usize,
        id: u64,
        revision: u64,
    ) -> Option<egui::TextureHandle> {
        if let Some((cached_revision, texture)) = self.layer_thumbnails.get(&id) {
            if *cached_revision == revision {
                return Some(texture.clone());
            }
        }
        let doc = self.doc.as_ref()?;
        let layer = doc.layers.get(index)?;
        let rgba = adjust::resample(&layer.pixels.to_flat(), doc.w, doc.h, 48, 32);
        let texture = ctx.load_texture(
            format!("layer-preview-{id}"),
            egui::ColorImage::from_rgba_unmultiplied([48, 32], &rgba),
            egui::TextureOptions::LINEAR,
        );
        self.layer_thumbnails
            .insert(id, (revision, texture.clone()));
        Some(texture)
    }

    pub(super) fn adjust_panel(&mut self, ui: &mut egui::Ui) {
        let mut preview = self.adjustment_preview;
        let preview_changed = ui.checkbox(&mut preview, "Preview").changed();
        if preview_changed {
            if preview {
                self.adjustment_original = self.doc.clone();
            } else if let Some(original) = self.adjustment_original.take() {
                self.doc = Some(original);
                self.canvas.invalidate();
            }
            self.adjustment_preview = preview;
        }
        let mut changed = false;
        egui::ComboBox::from_label("Filter")
            .selected_text(self.filter.label())
            .show_ui(ui, |ui| {
                for filter in Filter::ALL {
                    if ui
                        .selectable_value(&mut self.filter, filter, filter.label())
                        .changed()
                    {
                        self.filter_values = self.filter.defaults();
                        changed = true;
                    }
                }
            });
        for (index, (name, min, max, _)) in self.filter.params().iter().enumerate() {
            if let Some(value) = self.filter_values.get_mut(index) {
                changed |= ui
                    .add(egui::Slider::new(value, *min..=*max).text(*name))
                    .changed();
            }
        }
        if self.adjustment_preview && (changed || preview_changed) {
            self.update_adjustment_preview();
        }
        let mut apply = false;
        let mut cancel = false;
        ui.horizontal(|ui| {
            apply = ui.button("Apply").clicked();
            cancel = self.adjustment_preview && ui.button("Cancel").clicked();
        });
        if apply && self.adjustment_preview {
            if let Some(original) = self.adjustment_original.take() {
                self.history.push(&original, "Adjust");
                self.adjustment_preview = false;
                self.dirty = true;
                self.canvas.invalidate();
            }
        } else if cancel {
            if let Some(original) = self.adjustment_original.take() {
                self.doc = Some(original);
            }
            self.adjustment_preview = false;
            self.canvas.invalidate();
        } else if apply {
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

    fn update_adjustment_preview(&mut self) {
        let Some(original) = self.adjustment_original.as_ref() else {
            return;
        };
        let active = original.active;
        let mut flat = original.layers[active].pixels.to_flat();
        adjust::apply(
            self.filter,
            &mut flat,
            original.w,
            original.h,
            &self.filter_values,
        );
        if let Some(doc) = self.doc.as_mut() {
            if let Some(layer) = doc.layers.get_mut(active) {
                layer.pixels.write_flat(&flat);
                layer.touch();
                doc.sync_frame();
            }
        }
        self.canvas.invalidate();
    }

    pub(super) fn mutate_layer(&mut self, label: &str, action: impl FnOnce(&mut Document)) {
        let Some(doc) = self.doc.as_mut() else { return };
        self.history.push(doc, label);
        action(doc);
        doc.sync_frame();
        self.canvas.invalidate();
        self.dirty = true;
    }
}

fn rgb_color(rgb: [f32; 3]) -> Color32 {
    Color32::from_rgb(
        (rgb[0].clamp(0.0, 1.0) * 255.0).round() as u8,
        (rgb[1].clamp(0.0, 1.0) * 255.0).round() as u8,
        (rgb[2].clamp(0.0, 1.0) * 255.0).round() as u8,
    )
}

fn add_color_quad(painter: &egui::Painter, points: [egui::Pos2; 4], colors: [Color32; 4]) {
    let mut mesh = egui::Mesh::default();
    mesh.vertices.extend(
        points
            .into_iter()
            .zip(colors)
            .map(|(pos, color)| egui::epaint::Vertex {
                pos,
                uv: egui::Pos2::ZERO,
                color,
            }),
    );
    mesh.indices.extend([0, 1, 2, 0, 2, 3]);
    painter.add(egui::Shape::mesh(mesh));
}

fn paint_hsv_square(painter: &egui::Painter, rect: egui::Rect, hue: f32) {
    let hue_color = rgb_color(color::hsv_to_rgb(hue, 1.0, 1.0));
    add_color_quad(
        painter,
        [
            rect.left_top(),
            rect.right_top(),
            rect.right_bottom(),
            rect.left_bottom(),
        ],
        [Color32::WHITE, hue_color, Color32::BLACK, Color32::BLACK],
    );
    painter.rect_stroke(
        rect,
        3.0,
        egui::Stroke::new(1.0_f32, Color32::from_gray(150)),
        egui::StrokeKind::Inside,
    );
}

fn paint_hue_strip(painter: &egui::Painter, rect: egui::Rect) {
    for segment in 0..6 {
        let left = rect.left() + rect.width() * segment as f32 / 6.0;
        let right = rect.left() + rect.width() * (segment + 1) as f32 / 6.0;
        add_color_quad(
            painter,
            [
                egui::Pos2::new(left, rect.top()),
                egui::Pos2::new(right, rect.top()),
                egui::Pos2::new(right, rect.bottom()),
                egui::Pos2::new(left, rect.bottom()),
            ],
            [
                rgb_color(color::hsv_to_rgb(segment as f32 * 60.0, 1.0, 1.0)),
                rgb_color(color::hsv_to_rgb((segment + 1) as f32 * 60.0, 1.0, 1.0)),
                rgb_color(color::hsv_to_rgb((segment + 1) as f32 * 60.0, 1.0, 1.0)),
                rgb_color(color::hsv_to_rgb(segment as f32 * 60.0, 1.0, 1.0)),
            ],
        );
    }
    painter.rect_stroke(
        rect,
        2.0,
        egui::Stroke::new(1.0_f32, Color32::from_gray(150)),
        egui::StrokeKind::Inside,
    );
}
