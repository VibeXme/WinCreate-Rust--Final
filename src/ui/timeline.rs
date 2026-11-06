use super::*;

impl WinCreateApp {
    pub(super) fn show_timeline(&mut self, ctx: &egui::Context) {
        self.advance_animation(ctx);
        let mut export_gif = false;
        let mut export_sequence = false;
        let mut export_mp4 = false;
        let mut export_webm = false;
        {
            let Some(doc) = self.doc.as_mut() else { return };
            if doc.anim.is_none() {
                return;
            }
            egui::TopBottomPanel::bottom("timeline")
                .resizable(true)
                .default_height(142.0)
                .show(ctx, |ui| {
                    let before = doc.clone();
                    ui.horizontal(|ui| {
                        ui.strong("Timeline");
                        if ui
                            .button(if self.timeline_playing {
                                "Pause"
                            } else {
                                "Play"
                            })
                            .clicked()
                        {
                            self.timeline_playing = !self.timeline_playing;
                            self.last_frame_advance = Instant::now();
                            self.timeline_elapsed = 0.0;
                        }
                        if ui.button("+ Blank").clicked() {
                            self.history.push(&before, "Add frame");
                            doc.add_frame(false);
                            self.canvas.invalidate();
                            self.dirty = true;
                        }
                        if ui.button("Duplicate").clicked() {
                            self.history.push(&before, "Duplicate frame");
                            doc.add_frame(true);
                            self.canvas.invalidate();
                            self.dirty = true;
                        }
                        if ui.button("Delete").clicked()
                            && doc.anim.as_ref().is_some_and(|a| a.frames.len() > 1)
                        {
                            self.history.push(&before, "Delete frame");
                            doc.delete_frame();
                            self.canvas.invalidate();
                            self.dirty = true;
                        }
                        if ui.button("Prev").clicked() {
                            self.history.push(&before, "Move frame");
                            doc.move_frame(-1);
                            self.canvas.invalidate();
                            self.dirty = true;
                        }
                        if ui.button("Next").clicked() {
                            self.history.push(&before, "Move frame");
                            doc.move_frame(1);
                            self.canvas.invalidate();
                            self.dirty = true;
                        }
                        ui.menu_button("Export animation", |ui| {
                            export_gif |= ui.button("GIF...").clicked();
                            export_sequence |= ui.button("PNG sequence...").clicked();
                            let available = crate::export::ffmpeg_available();
                            let mp4 = ui
                                .add_enabled(available, egui::Button::new("MP4..."))
                                .on_hover_text(if available {
                                    "Export an MP4 animation"
                                } else {
                                    "Install ffmpeg and add it to PATH to export video"
                                });
                            export_mp4 |= mp4.clicked();
                            let webm = ui
                                .add_enabled(available, egui::Button::new("WebM..."))
                                .on_hover_text(if available {
                                    "Export a WebM animation"
                                } else {
                                    "Install ffmpeg and add it to PATH to export video"
                                });
                            export_webm |= webm.clicked();
                        });
                    });

                    let (
                        mut onion,
                        mut alpha,
                        mut before_count,
                        mut after_count,
                        mut fps,
                        mut looping,
                    ) = doc
                        .anim
                        .as_ref()
                        .map(|animation| {
                            (
                                animation.onion,
                                animation.onion_alpha,
                                animation.onion_before,
                                animation.onion_after,
                                animation.fps,
                                animation.looping,
                            )
                        })
                        .unwrap_or((false, 0.2, 0, 0, 12, true));
                    let mut frame_changes = Vec::new();
                    let mut selected_frame = None;
                    ui.horizontal(|ui| {
                        ui.add(egui::Slider::new(&mut fps, 1..=120).text("FPS"));
                        ui.checkbox(&mut looping, "Loop");
                        ui.checkbox(&mut onion, "Onion skin");
                        if onion {
                            ui.add(egui::Slider::new(&mut alpha, 0.05..=0.8).text("Onion alpha"));
                            ui.add(
                                egui::DragValue::new(&mut before_count)
                                    .range(0..=8)
                                    .prefix("Before "),
                            );
                            ui.add(
                                egui::DragValue::new(&mut after_count)
                                    .range(0..=8)
                                    .prefix("After "),
                            );
                        }
                    });
                    let settings_changed = before.anim.as_ref().is_some_and(|animation| {
                        animation.fps != fps
                            || animation.looping != looping
                            || animation.onion != onion
                            || animation.onion_alpha != alpha
                            || animation.onion_before != before_count
                            || animation.onion_after != after_count
                    });
                    if settings_changed {
                        self.history.push(&before, "Animation settings");
                        self.dirty = true;
                    }
                    if let Some(anim) = doc.anim.as_mut() {
                        anim.fps = fps;
                        anim.looping = looping;
                        anim.onion = onion;
                        anim.onion_alpha = alpha;
                        anim.onion_before = before_count;
                        anim.onion_after = after_count;
                    }

                    let frame_count = doc
                        .anim
                        .as_ref()
                        .map_or(0, |animation| animation.frames.len());
                    ui.horizontal_wrapped(|ui| {
                        for index in 0..frame_count {
                            let texture =
                                frame_thumbnail(&mut self.frame_thumbnails, ctx, doc, index);
                            ui.vertical(|ui| {
                                if let Some(texture) = texture {
                                    ui.image((texture.id(), Vec2::new(56.0, 42.0)));
                                }
                                let current = doc
                                    .anim
                                    .as_ref()
                                    .is_some_and(|animation| animation.current == index);
                                if ui
                                    .selectable_label(current, format!("Frame {}", index + 1))
                                    .clicked()
                                {
                                    selected_frame = Some(index);
                                }
                                let mut hold =
                                    doc.anim.as_ref().map_or(1, |a| a.frames[index].hold);
                                if ui
                                    .add(
                                        egui::DragValue::new(&mut hold)
                                            .range(1..=120)
                                            .prefix("Hold "),
                                    )
                                    .changed()
                                {
                                    frame_changes.push((index, hold));
                                }
                            });
                        }
                    });
                    if !frame_changes.is_empty() {
                        self.history.push(&before, "Frame holds");
                        if let Some(anim) = doc.anim.as_mut() {
                            for (index, hold) in frame_changes {
                                if let Some(frame) = anim.frames.get_mut(index) {
                                    frame.hold = hold.max(1);
                                }
                            }
                        }
                        self.dirty = true;
                    }
                    if let Some(index) = selected_frame {
                        doc.goto_frame(index);
                        self.canvas.invalidate();
                    }
                    if onion != before.anim.as_ref().is_some_and(|a| a.onion)
                        || alpha != before.anim.as_ref().map_or(0.0, |a| a.onion_alpha)
                    {
                        self.canvas.invalidate();
                    }
                });
        }
        if export_gif {
            self.export_gif();
        }
        if export_sequence {
            self.export_png_sequence();
        }
        if export_mp4 {
            self.export_video("mp4");
        }
        if export_webm {
            self.export_video("webm");
        }
    }

    fn advance_animation(&mut self, ctx: &egui::Context) {
        let now = Instant::now();
        let elapsed = now.saturating_duration_since(self.last_frame_advance);
        self.last_frame_advance = now;
        if !self.timeline_playing {
            return;
        }
        let Some(doc) = self.doc.as_mut() else {
            self.timeline_playing = false;
            return;
        };
        if doc.anim.is_none() {
            self.timeline_playing = false;
            return;
        }
        self.timeline_elapsed += elapsed.as_secs_f32();
        let mut advanced = false;
        for _ in 0..16 {
            let Some(anim) = doc.anim.as_ref() else { break };
            let frame = &anim.frames[anim.current];
            let duration = frame.hold.max(1) as f32 / anim.fps.max(1) as f32;
            if self.timeline_elapsed < duration {
                break;
            }
            self.timeline_elapsed -= duration;
            let next = anim.current + 1;
            if next >= anim.frames.len() {
                if anim.looping {
                    doc.goto_frame(0);
                } else {
                    self.timeline_playing = false;
                    self.timeline_elapsed = 0.0;
                    break;
                }
            } else {
                doc.goto_frame(next);
            }
            advanced = true;
        }
        if advanced {
            self.canvas.invalidate();
        }
        if self.timeline_playing {
            ctx.request_repaint_after(Duration::from_millis(16));
        }
    }
}

fn frame_thumbnail(
    cache: &mut HashMap<usize, (u64, egui::TextureHandle)>,
    ctx: &egui::Context,
    doc: &Document,
    index: usize,
) -> Option<egui::TextureHandle> {
    let frame = doc.anim.as_ref()?.frames.get(index)?;
    let signature = frame.layers.iter().fold(0u64, |value, layer| {
        value
            .wrapping_mul(31)
            .wrapping_add(layer.rev.wrapping_add(layer.id))
    });
    if let Some((cached_signature, texture)) = cache.get(&index) {
        if *cached_signature == signature {
            return Some(texture.clone());
        }
    }
    let flat = doc.flatten_layers(&frame.layers, false);
    let scaled = adjust::resample(&flat, doc.w, doc.h, 72, 48);
    let texture = ctx.load_texture(
        format!("frame-preview-{index}-{signature}"),
        egui::ColorImage::from_rgba_unmultiplied([72, 48], &scaled),
        egui::TextureOptions::LINEAR,
    );
    cache.insert(index, (signature, texture.clone()));
    Some(texture)
}
