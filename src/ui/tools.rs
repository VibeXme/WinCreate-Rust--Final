use super::*;
use std::sync::mpsc::{self, TryRecvError};

pub(super) struct FillResult {
    pub(super) signature: u64,
    pub(super) layer_index: usize,
    pub(super) pixels: Tiled,
    pub(super) dirty: IRect,
}

impl WinCreateApp {
    pub(super) fn show_tools(&mut self, ctx: &egui::Context) {
        let mut apply_transform = false;
        let mut cancel_transform = false;
        let mut transform_changed = false;
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
                ui.horizontal(|ui| {
                    ui.label("Size");
                    let mut slider = brush::size_to_slider(self.size);
                    if ui
                        .add(egui::Slider::new(&mut slider, 0.0..=1.0).show_value(false))
                        .changed()
                    {
                        self.size = brush::slider_to_size(slider);
                    }
                    ui.add(
                        egui::DragValue::new(&mut self.size)
                            .range(brush::MIN_SIZE..=brush::MAX_SIZE)
                            .speed(0.25)
                            .suffix(" px"),
                    );
                });
                ui.add(egui::Slider::new(&mut self.opacity, 0.01..=1.0).text("Opacity"));
                if matches!(self.tool, Tool::Brush | Tool::Eraser) {
                    ui.checkbox(&mut self.quick_shape, "QuickShape");
                    ui.checkbox(
                        &mut self.simulate_pressure_from_speed,
                        "Pressure from speed",
                    );
                }
                if self.tool == Tool::Shape {
                    egui::ComboBox::from_label("Shape")
                        .selected_text(match self.shape_kind {
                            ShapeKind::Line => "Line",
                            ShapeKind::Rectangle => "Rectangle",
                            ShapeKind::Ellipse => "Ellipse",
                        })
                        .show_ui(ui, |ui| {
                            ui.selectable_value(&mut self.shape_kind, ShapeKind::Line, "Line");
                            ui.selectable_value(
                                &mut self.shape_kind,
                                ShapeKind::Rectangle,
                                "Rectangle",
                            );
                            ui.selectable_value(
                                &mut self.shape_kind,
                                ShapeKind::Ellipse,
                                "Ellipse",
                            );
                        });
                }
                if self.tool == Tool::Fill {
                    ui.add(
                        egui::Slider::new(&mut self.fill_tolerance, 0.0..=255.0).text("Tolerance"),
                    );
                    ui.add(egui::Slider::new(&mut self.fill_gap, 0..=32).text("Gap"));
                    ui.add(egui::Slider::new(&mut self.fill_expand, 0..=32).text("Expand"));
                    ui.checkbox(&mut self.sample_all_layers, "Sample all layers");
                    if self.fill_receiver.is_some() {
                        ui.spinner();
                        ui.label("Filling…");
                    }
                }
                if self.canvas.zoom <= 0.0 {
                    ui.label("Zoom · fit");
                } else {
                    ui.add(egui::Slider::new(&mut self.canvas.zoom, 0.02..=8.0).text("Zoom"));
                }
                ui.horizontal(|ui| {
                    if ui.button("Fit").clicked() {
                        self.canvas.zoom = 0.0;
                    }
                    if ui.button("100%").clicked() {
                        self.canvas.zoom = 1.0;
                    }
                    if ui
                        .button(if self.canvas.flip_x {
                            "Unflip"
                        } else {
                            "Flip H"
                        })
                        .clicked()
                    {
                        self.canvas.flip_x = !self.canvas.flip_x;
                    }
                });
                let mut degrees = self.canvas.rotation.to_degrees();
                if ui
                    .add(egui::Slider::new(&mut degrees, -180.0..=180.0).text("Rotation"))
                    .changed()
                {
                    self.canvas.rotation = degrees.to_radians();
                }
                ui.checkbox(&mut self.canvas.grid_visible, "Grid");
                if self.canvas.grid_visible {
                    ui.add(
                        egui::DragValue::new(&mut self.canvas.grid_spacing)
                            .range(4..=1024)
                            .prefix("Grid px "),
                    );
                }
                if self.tool == Tool::Move {
                    ui.separator();
                    ui.label("Transform layer");
                    transform_changed |= ui
                        .add(egui::Slider::new(&mut self.transform_scale, 0.1..=4.0).text("Scale"))
                        .changed();
                    transform_changed |= ui
                        .add(
                            egui::Slider::new(&mut self.transform_rotation, -180.0..=180.0)
                                .text("Rotate"),
                        )
                        .changed();
                    ui.horizontal(|ui| {
                        transform_changed |= ui
                            .add(egui::DragValue::new(&mut self.transform_offset.x).prefix("X "))
                            .changed();
                        transform_changed |= ui
                            .add(egui::DragValue::new(&mut self.transform_offset.y).prefix("Y "))
                            .changed();
                    });
                    ui.horizontal(|ui| {
                        apply_transform = ui.button("Apply").clicked();
                        cancel_transform = ui.button("Cancel").clicked();
                    });
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
                    self.remember_current_color();
                }
                if ui.text_edit_singleline(&mut self.hex).lost_focus() {
                    if let Some(parsed) = color::parse_hex(&self.hex) {
                        self.color = parsed;
                        self.remember_current_color();
                    }
                }
            });
        if transform_changed {
            self.update_transform_preview();
        }
        if apply_transform {
            if let Some(original) = self.transform_original.take() {
                self.history.push(&original, "Transform");
                self.transform_drag_start = None;
                self.dirty = true;
                self.canvas.invalidate();
            }
        } else if cancel_transform {
            if let Some(original) = self.transform_original.take() {
                self.doc = Some(original);
                self.transform_drag_start = None;
                self.canvas.invalidate();
            }
        }
    }

    pub(super) fn canvas_input(&mut self, ctx: &egui::Context, response: egui::Response) {
        if self.fill_receiver.is_some() {
            return;
        }
        let Some((doc_w, doc_h)) = self.doc.as_ref().map(|doc| (doc.w, doc.h)) else {
            return;
        };
        let events = ctx.input(|i| i.events.clone());
        let pointer = ctx.input(|i| i.pointer.interact_pos()).or_else(|| {
            events.iter().rev().find_map(|event| match event {
                egui::Event::PointerMoved(pos) => Some(*pos),
                egui::Event::Touch {
                    phase: egui::TouchPhase::Start | egui::TouchPhase::Move,
                    pos,
                    ..
                } => Some(*pos),
                _ => None,
            })
        });
        let hovered =
            response.hovered() || pointer.is_some_and(|position| response.rect.contains(position));
        let modifiers = ctx.input(|i| i.modifiers);
        if hovered {
            let scroll = ctx.input(|i| i.raw_scroll_delta);
            if modifiers.ctrl && scroll.y != 0.0 {
                let point = pointer.unwrap_or(response.rect.center());
                let factor = (scroll.y * 0.002).exp();
                self.canvas.zoom_at(
                    point,
                    response.rect,
                    doc_w,
                    doc_h,
                    self.canvas.zoom * factor,
                );
            } else if ctx.input(|i| (i.zoom_delta() - 1.0).abs() > 0.001) {
                let point = pointer.unwrap_or(response.rect.center());
                let factor = ctx.input(|i| i.zoom_delta());
                self.canvas.zoom_at(
                    point,
                    response.rect,
                    doc_w,
                    doc_h,
                    self.canvas.zoom * factor,
                );
            } else if scroll != Vec2::ZERO {
                self.canvas.pan += scroll;
            }
        }
        let mut touch_ids = Vec::new();
        for event in &events {
            if let egui::Event::Touch {
                phase: egui::TouchPhase::Start | egui::TouchPhase::Move,
                id,
                ..
            } = event
            {
                if !touch_ids.contains(id) {
                    touch_ids.push(*id);
                }
            }
        }
        if touch_ids.len() > 1 {
            return;
        }
        let touch_start = events.iter().any(|event| {
            matches!(
                event,
                egui::Event::Touch {
                    phase: egui::TouchPhase::Start,
                    ..
                }
            )
        });
        let touch_move = events.iter().any(|event| {
            matches!(
                event,
                egui::Event::Touch {
                    phase: egui::TouchPhase::Move,
                    ..
                }
            )
        });
        let touch_end = events.iter().any(|event| {
            matches!(
                event,
                egui::Event::Touch {
                    phase: egui::TouchPhase::End | egui::TouchPhase::Cancel,
                    ..
                }
            )
        });
        let pressed =
            ctx.input(|i| i.pointer.button_pressed(egui::PointerButton::Primary)) || touch_start;
        let down = ctx.input(|i| i.pointer.button_down(egui::PointerButton::Primary))
            || touch_start
            || touch_move;
        let released =
            ctx.input(|i| i.pointer.button_released(egui::PointerButton::Primary)) || touch_end;
        let middle_down = ctx.input(|i| i.pointer.button_down(egui::PointerButton::Middle));
        let Some(point) = pointer else { return };
        let press_event = events
            .iter()
            .enumerate()
            .find_map(|(index, event)| match event {
                egui::Event::PointerButton {
                    button: egui::PointerButton::Primary,
                    pressed: true,
                    pos,
                    ..
                } => Some((index, *pos, None)),
                egui::Event::Touch {
                    phase: egui::TouchPhase::Start,
                    pos,
                    force,
                    ..
                } => Some((index, *pos, force.map(|value| value.clamp(0.0, 1.0)))),
                _ => None,
            });
        let start = press_event.map_or((point, None), |(_, pos, pressure)| (pos, pressure));
        let start_canvas = self
            .canvas
            .screen_to_canvas(start.0, response.rect, doc_w, doc_h);
        let inside_canvas = start_canvas.0 >= 0.0
            && start_canvas.1 >= 0.0
            && start_canvas.0 < doc_w as f32
            && start_canvas.1 < doc_h as f32;

        if down && hovered && ctx.input(|i| i.key_down(egui::Key::R)) {
            self.canvas.rotation = (self.canvas.rotation
                + ctx.input(|i| i.pointer.delta().x * 0.01))
            .clamp(-std::f32::consts::PI, std::f32::consts::PI);
            return;
        }
        if self.tool == Tool::Move && pressed && hovered && inside_canvas {
            if self.transform_original.is_none() {
                self.transform_original = self.doc.clone();
            }
            self.transform_drag_start = Some(start_canvas);
            self.transform_initial_offset = self.transform_offset;
            return;
        }
        if self.tool == Tool::Move && down && hovered {
            if let Some(start) = self.transform_drag_start {
                let current = self
                    .canvas
                    .screen_to_canvas(point, response.rect, doc_w, doc_h);
                self.transform_offset = self.transform_initial_offset
                    + Vec2::new(current.0 - start.0, current.1 - start.1);
                self.update_transform_preview();
            }
            return;
        }
        if self.tool == Tool::Move && released {
            self.transform_drag_start = None;
        }

        if down && hovered && (self.tool == Tool::Hand || middle_down) {
            self.canvas.pan += ctx.input(|i| i.pointer.delta());
            return;
        }
        if pressed && hovered && inside_canvas {
            let (x, y) = self
                .canvas
                .screen_to_canvas(start.0, response.rect, doc_w, doc_h);
            if modifiers.alt || self.tool == Tool::Eyedropper {
                let Some(sample) = self
                    .doc
                    .as_ref()
                    .map(|doc| doc.sample(x.round() as i32, y.round() as i32, true))
                else {
                    return;
                };
                self.color = [sample[0], sample[1], sample[2]];
                self.hex = color::to_hex(self.color);
                self.remember_current_color();
                return;
            }
            if self.tool == Tool::Fill {
                self.fill_at(x.round() as i32, y.round() as i32);
                return;
            }
            let Some(doc) = self.doc.as_mut() else { return };
            let active = doc.active;
            if doc.layers[active].locked || !doc.layers[active].visible {
                self.notify("The selected layer is hidden or locked");
                return;
            }
            if self.mask_edit && doc.layers[active].mask.is_none() {
                self.history.push(doc, "Add mask");
                doc.layers[active].mask = Some(Tiled::new(doc.w, doc.h));
            }
            let alpha_lock = doc.layers[active].alpha_lock;
            let base = if self.mask_edit {
                doc.layers[active]
                    .mask
                    .as_ref()
                    .map_or_else(|| Tiled::new(doc.w, doc.h), Clone::clone)
            } else {
                doc.layers[active].pixels.clone()
            };
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
                    flow: self.flow,
                    spacing: self.spacing,
                    stream: self.stream,
                    taper_start: self.taper_start,
                    taper_end: self.taper_end,
                    color: self.color,
                    mode: if self.tool == Tool::Eraser {
                        StrokeMode::Erase
                    } else {
                        StrokeMode::Paint
                    },
                    pressure_size: self.pressure_size,
                    pressure_opacity: self.pressure_opacity,
                    pressure_gamma: self.pressure_gamma,
                    symmetry: self.symmetry,
                    alpha_lock,
                    jitter: self.jitter,
                };
                let seed = storage::now_secs() as u32;
                let mut stroke = Stroke::new(params, base, seed);
                let start_pressure =
                    sample_pressure(self.simulate_pressure_from_speed, None, start.0, start.1);
                let mut dirty = stroke.add_point(InputPoint {
                    x,
                    y,
                    pressure: start_pressure,
                });
                let mut previous = Some(start.0);
                let motion_start = press_event.map_or(0, |(index, _, _)| index + 1);
                for (position, force) in pointer_samples(&events, motion_start) {
                    let pressure = sample_pressure(
                        self.simulate_pressure_from_speed,
                        previous,
                        position,
                        force,
                    );
                    let (x, y) =
                        self.canvas
                            .screen_to_canvas(position, response.rect, doc_w, doc_h);
                    dirty = dirty.union(&stroke.add_point(InputPoint { x, y, pressure }));
                    previous = Some(position);
                }
                if self.tool != Tool::Shape {
                    apply_stroke_to_doc(doc, &stroke, dirty, self.mask_edit);
                    self.canvas.invalidate_rect(dirty);
                }
                self.stroke = Some(stroke);
                self.stroke_last_moved = Instant::now();
                self.dirty = true;
                Self::push_brush_history(
                    doc,
                    &self.brush_id,
                    self.color,
                    self.size,
                    self.opacity,
                    self.stream,
                    self.taper_end,
                );
            } else if self.tool == Tool::Smudge {
                self.history.push(doc, "Smudge");
                let settings = SmudgeSettings::preset(&self.smudge_preset);
                let mut smudge = SmudgeStroke::new(settings, self.size);
                let dirty = smudge.move_to(&mut doc.layers[doc.active].pixels, x, y, 1.0);
                self.canvas.invalidate_rect(dirty);
                self.smudge = Some(smudge);
                self.dirty = true;
            }
        } else if down && hovered {
            let mut samples = pointer_samples(&events, 0);
            if samples.is_empty() && ctx.input(|i| i.pointer.delta() != Vec2::ZERO) {
                samples.push((point, None));
            }
            let mut previous = None;
            for (position, force) in samples {
                if !response.rect.contains(position) {
                    continue;
                }
                let pressure =
                    sample_pressure(self.simulate_pressure_from_speed, previous, position, force);
                previous = Some(position);
                self.stroke_last_moved = Instant::now();
                if let Some(stroke) = self.stroke.as_mut() {
                    if let Some(doc) = self.doc.as_mut() {
                        let (x, y) =
                            self.canvas
                                .screen_to_canvas(position, response.rect, doc_w, doc_h);
                        let dirty = stroke.add_point(InputPoint { x, y, pressure });
                        if !dirty.is_empty() && self.tool != Tool::Shape {
                            apply_stroke_to_doc(doc, stroke, dirty, self.mask_edit);
                            self.canvas.invalidate_rect(dirty);
                        }
                        self.dirty = true;
                    }
                }
                if let Some(smudge) = self.smudge.as_mut() {
                    if let Some(doc) = self.doc.as_mut() {
                        let (x, y) =
                            self.canvas
                                .screen_to_canvas(position, response.rect, doc_w, doc_h);
                        let dirty =
                            smudge.move_to(&mut doc.layers[doc.active].pixels, x, y, pressure);
                        if !dirty.is_empty() {
                            doc.layers[doc.active].touch();
                            doc.sync_frame();
                            self.canvas.invalidate_rect(dirty);
                        }
                    }
                }
            }
        }
        if released {
            if let (Some(mut stroke), Some(doc)) = (self.stroke.take(), self.doc.as_mut()) {
                let mut snapped_shape = None;
                let dirty = if self.tool == Tool::Shape {
                    match (stroke.points.first(), stroke.points.last()) {
                        (Some(start), Some(end)) => {
                            let (vertices, closed) =
                                shape_vertices(self.shape_kind, (start.x, start.y), (end.x, end.y));
                            stroke.set_exact_points(brush::densify(&vertices, closed, 1.0))
                        }
                        _ => stroke.rerender(true),
                    }
                } else if self.quick_shape
                    && self.stroke_last_moved.elapsed() >= Duration::from_millis(500)
                {
                    if let Some((kind, vertices)) = brush::detect_shape(&stroke.points) {
                        let closed = !matches!(kind, brush::ShapeKind::Line);
                        let dirty = stroke.set_exact_points(brush::densify(&vertices, closed, 1.0));
                        snapped_shape = Some(shape_label(kind));
                        dirty
                    } else {
                        stroke.rerender(true)
                    }
                } else {
                    stroke.rerender(true)
                };
                if !dirty.is_empty() {
                    apply_stroke_to_doc(doc, &stroke, dirty, self.mask_edit);
                    self.canvas.invalidate_rect(dirty);
                }
                if let Some(shape) = snapped_shape {
                    self.notify(format!("QuickShape · {shape}"));
                }
            }
            self.smudge = None;
        }
        if self.tool == Tool::Shape && down {
            if let Some(stroke) = self.stroke.as_ref() {
                if let (Some(start), Some(end)) = (stroke.points.first(), stroke.points.last()) {
                    let (vertices, closed) =
                        shape_vertices(self.shape_kind, (start.x, start.y), (end.x, end.y));
                    let mut points = vertices
                        .iter()
                        .map(|(x, y)| {
                            self.canvas
                                .canvas_to_screen(*x, *y, response.rect, doc_w, doc_h)
                        })
                        .collect::<Vec<_>>();
                    if closed && !points.is_empty() {
                        points.push(points[0]);
                    }
                    ctx.layer_painter(egui::LayerId::new(
                        egui::Order::Foreground,
                        egui::Id::new("shape-preview"),
                    ))
                    .with_clip_rect(response.rect)
                    .add(egui::Shape::line(
                        points,
                        egui::Stroke::new(1.5_f32, Color32::WHITE),
                    ));
                }
            }
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

    pub(super) fn push_brush_history(
        doc: &mut Document,
        brush_id: &str,
        color_value: [u8; 3],
        size: f32,
        opacity: f32,
        stream: f32,
        taper: f32,
    ) {
        let entry = BrushHistoryEntry {
            brush_id: brush_id.to_string(),
            brush_name: brush::preset(brush_id).name.to_string(),
            color: color::to_hex(color_value),
            size,
            opacity,
            stream,
            taper,
        };
        if doc.brush_history.first() != Some(&entry) {
            doc.brush_history.insert(0, entry);
            doc.brush_history.truncate(12);
        }
    }

    pub(super) fn fill_at(&mut self, x: i32, y: i32) {
        if self.fill_receiver.is_some() {
            return;
        }
        let Some(doc) = self.doc.as_ref() else { return };
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
        let original = doc.clone();
        let reference_doc = original.clone();
        let base_pixels = layer.pixels.clone();
        let signature = document_signature(&original);
        let active = doc.active;
        let width = doc.w;
        let height = doc.h;
        let fill_color = [self.color[0], self.color[1], self.color[2], 255];
        let opacity = self.opacity;
        let options = crate::fill::FillOptions {
            tolerance: self.fill_tolerance,
            gap: self.fill_gap,
            expand: self.fill_expand,
        };
        let sample_all = self.sample_all_layers;
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let reference = if sample_all {
                reference_doc.flatten(false)
            } else {
                base_pixels.to_flat()
            };
            let Some(coverage) = crate::fill::flood_fill(&reference, width, height, x, y, options)
            else {
                let _ = sender.send(None);
                return;
            };
            let mut pixels = base_pixels;
            let mut left = width as i32;
            let mut top = height as i32;
            let mut right = 0i32;
            let mut bottom = 0i32;
            for (index, amount) in coverage.iter().enumerate() {
                let strength = *amount as f32 / 255.0 * opacity;
                if strength <= 0.0 {
                    continue;
                }
                let px = (index % width) as i32;
                let py = (index / width) as i32;
                let mut pixel = pixels.get(px, py);
                color::over_u8(&mut pixel, fill_color, strength);
                pixels.put(px, py, pixel);
                left = left.min(px);
                top = top.min(py);
                right = right.max(px + 1);
                bottom = bottom.max(py + 1);
            }
            if right <= left || bottom <= top {
                let _ = sender.send(None);
                return;
            }
            let _ = sender.send(Some(FillResult {
                signature,
                layer_index: active,
                pixels,
                dirty: IRect::new(left, top, right, bottom),
            }));
        });
        self.fill_original = Some(original);
        self.fill_receiver = Some(receiver);
        self.notify("Filling…");
    }

    pub(super) fn poll_fill(&mut self, ctx: &egui::Context) {
        let Some(receiver) = self.fill_receiver.as_ref() else {
            return;
        };
        match receiver.try_recv() {
            Ok(result) => {
                self.fill_receiver = None;
                let Some(result) = result else {
                    self.fill_original = None;
                    return;
                };
                let Some(original) = self.fill_original.take() else {
                    return;
                };
                let Some(doc) = self.doc.as_mut() else {
                    return;
                };
                if document_signature(doc) != result.signature || doc.active != result.layer_index {
                    self.notify("Fill cancelled because the document changed");
                    return;
                }
                self.history.push(&original, "Fill");
                if let Some(layer) = doc.layers.get_mut(result.layer_index) {
                    layer.pixels = result.pixels;
                    layer.touch();
                }
                doc.sync_frame();
                self.canvas.invalidate_rect(result.dirty);
                self.dirty = true;
                self.notify("Fill complete");
            }
            Err(TryRecvError::Empty) => ctx.request_repaint_after(Duration::from_millis(20)),
            Err(TryRecvError::Disconnected) => {
                self.fill_receiver = None;
                self.fill_original = None;
                self.notify("Fill worker stopped unexpectedly");
            }
        }
    }

    fn update_transform_preview(&mut self) {
        let Some(original) = self.transform_original.as_ref() else {
            return;
        };
        let active = original.active;
        let pixels = adjust::transform(
            &original.layers[active].pixels.to_flat(),
            original.w,
            original.h,
            self.transform_offset.x,
            self.transform_offset.y,
            self.transform_scale,
            self.transform_rotation,
        );
        if let Some(doc) = self.doc.as_mut() {
            if let Some(layer) = doc.layers.get_mut(active) {
                layer.pixels.write_flat(&pixels);
                layer.touch();
                doc.sync_frame();
            }
        }
        self.canvas.invalidate();
    }
}

fn document_signature(doc: &Document) -> u64 {
    let mut signature = (doc.w as u64)
        .wrapping_mul(31)
        .wrapping_add(doc.h as u64)
        .wrapping_add(doc.active as u64);
    for layer in &doc.layers {
        signature = signature
            .wrapping_mul(31)
            .wrapping_add(layer.id)
            .wrapping_add(layer.rev)
            .wrapping_add((layer.opacity.to_bits() as u64).rotate_left(7))
            .wrapping_add(layer.visible as u64);
    }
    if let Some(animation) = &doc.anim {
        signature = signature
            .wrapping_mul(31)
            .wrapping_add(animation.current as u64);
    }
    signature
}

fn pointer_samples(events: &[egui::Event], start: usize) -> Vec<(egui::Pos2, Option<f32>)> {
    events
        .iter()
        .skip(start)
        .filter_map(|event| match event {
            egui::Event::PointerMoved(pos) => Some((*pos, None)),
            egui::Event::Touch {
                phase: egui::TouchPhase::Start | egui::TouchPhase::Move,
                pos,
                force,
                ..
            } => Some((*pos, force.map(|value| value.clamp(0.0, 1.0)))),
            _ => None,
        })
        .collect()
}

fn sample_pressure(
    simulate: bool,
    previous: Option<egui::Pos2>,
    current: egui::Pos2,
    force: Option<f32>,
) -> f32 {
    force.unwrap_or_else(|| {
        if simulate {
            let distance = previous.map_or(0.0, |last| (current - last).length());
            (1.0 - distance / 120.0).clamp(0.15, 1.0)
        } else {
            1.0
        }
    })
}

fn apply_stroke_to_doc(doc: &mut Document, stroke: &Stroke, dirty: IRect, mask_edit: bool) {
    let active = doc.active;
    if mask_edit {
        if let Some(mask) = doc
            .layers
            .get_mut(active)
            .and_then(|layer| layer.mask.as_mut())
        {
            stroke.apply(mask, dirty);
        }
    } else if let Some(layer) = doc.layers.get_mut(active) {
        stroke.apply(&mut layer.pixels, dirty);
    }
    if let Some(layer) = doc.layers.get_mut(active) {
        layer.touch();
    }
    doc.sync_frame();
}

fn shape_vertices(kind: ShapeKind, start: (f32, f32), end: (f32, f32)) -> (Vec<(f32, f32)>, bool) {
    match kind {
        ShapeKind::Line => (vec![start, end], false),
        ShapeKind::Rectangle => (vec![start, (end.0, start.1), end, (start.0, end.1)], true),
        ShapeKind::Ellipse => (
            brush::ellipse_points(
                (start.0 + end.0) * 0.5,
                (start.1 + end.1) * 0.5,
                ((end.0 - start.0) * 0.5).abs(),
                ((end.1 - start.1) * 0.5).abs(),
                0.0,
            ),
            true,
        ),
    }
}

fn shape_label(kind: brush::ShapeKind) -> &'static str {
    match kind {
        brush::ShapeKind::Line => "Line",
        brush::ShapeKind::Rect => "Rectangle",
        brush::ShapeKind::Ellipse => "Ellipse",
        brush::ShapeKind::Triangle => "Triangle",
        brush::ShapeKind::Polygon => "Polygon",
    }
}
