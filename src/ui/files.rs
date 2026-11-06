use super::*;

impl WinCreateApp {
    pub(super) fn load_path(&mut self, path: &std::path::Path) -> anyhow::Result<()> {
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

    pub(super) fn open_dialog(&mut self) {
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

    pub(super) fn save_gallery(&mut self) {
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

    pub(super) fn save_as(&mut self) {
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

    pub(super) fn export_dialog(&mut self) {
        self.export_dialog_with_background(true);
    }

    pub(super) fn export_dialog_with_background(&mut self, with_background: bool) {
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
            _ => crate::export::export_flat(doc, &path, with_background),
        };
        match result {
            Ok(()) => self.notify(format!("Exported {}", path.display())),
            Err(error) => self.notify(format!("Export failed: {error:#}")),
        }
    }

    pub(super) fn import_layer(&mut self) {
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

    pub(super) fn load_trace_reference(&mut self) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Reference image", &["png", "jpg", "jpeg", "webp", "bmp"])
            .pick_file()
        else {
            return;
        };
        let result = (|| -> anyhow::Result<()> {
            let bytes = std::fs::read(path)?;
            let image = image::load_from_memory(&bytes)?.to_rgba8();
            let size = [image.width() as usize, image.height() as usize];
            self.canvas.set_trace_reference(size, image.into_raw());
            Ok(())
        })();
        match result {
            Ok(()) => self.notify("Reference image loaded"),
            Err(error) => self.notify(format!("Reference load failed: {error:#}")),
        }
    }

    pub(super) fn extract_trace_edges(&mut self) {
        let Some(reference) = self.canvas.trace.as_ref() else {
            return;
        };
        let source = crate::adjust::edge_lines(
            &reference.pixels,
            reference.size[0],
            reference.size[1],
            1.0,
            [0, 0, 0],
        );
        let Some(doc) = self.doc.as_mut() else { return };
        let scale = (doc.w as f32 / reference.size[0] as f32)
            .min(doc.h as f32 / reference.size[1] as f32)
            .min(1.0);
        let (width, height) = (
            (reference.size[0] as f32 * scale).round().max(1.0) as usize,
            (reference.size[1] as f32 * scale).round().max(1.0) as usize,
        );
        let resized =
            crate::adjust::resample(&source, reference.size[0], reference.size[1], width, height);
        self.history.push(doc, "Extract reference edges");
        let mut centered = Tiled::new(doc.w, doc.h);
        let ox = (doc.w as i32 - width as i32) / 2;
        let oy = (doc.h as i32 - height as i32) / 2;
        let pixels = Tiled::from_flat(width, height, &resized);
        centered.for_each_mut(
            IRect::new(ox, oy, ox + width as i32, oy + height as i32),
            |x, y, pixel| pixel.copy_from_slice(&pixels.get(x - ox, y - oy)),
        );
        doc.add_layer_with("Reference edges", centered);
        doc.sync_frame();
        self.canvas.invalidate();
        self.dirty = true;
        self.notify("Reference edges added as a layer");
    }

    pub(super) fn begin_document(&mut self, doc: Document) {
        self.doc = Some(doc);
        self.screen = Screen::Studio;
        self.gallery_id = None;
        self.history.clear();
        self.stroke = None;
        self.canvas.invalidate();
        self.canvas.zoom = 0.0;
        self.dirty = true;
    }

    pub(super) fn undo(&mut self) {
        if let Some(doc) = self.doc.as_mut() {
            if let Some(label) = self.history.undo(doc) {
                self.canvas.invalidate();
                self.dirty = true;
                self.notify(format!("Undo {label}"));
            }
        }
    }

    pub(super) fn redo(&mut self) {
        if let Some(doc) = self.doc.as_mut() {
            if let Some(label) = self.history.redo(doc) {
                self.canvas.invalidate();
                self.dirty = true;
                self.notify(format!("Redo {label}"));
            }
        }
    }

    pub(super) fn show_top_bar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("topbar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                if ui.button("‹ Gallery").clicked() {
                    self.request_exit(ctx, ExitAction::Gallery);
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
                    if ui.button("Export with background…").clicked() {
                        ui.close_menu();
                        self.export_dialog_with_background(true);
                    }
                    if ui.button("Export transparent…").clicked() {
                        ui.close_menu();
                        self.export_dialog_with_background(false);
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
                    if ui.button("Resize canvas…").clicked() {
                        ui.close_menu();
                        if let Some(doc) = self.doc.as_ref() {
                            self.resize_width = doc.w;
                            self.resize_height = doc.h;
                        }
                        self.resize_dialog_open = true;
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
        self.show_resize_dialog(ctx);
    }

    pub(super) fn autosave_if_needed(&mut self) {
        if self.dirty && self.last_autosave.elapsed() > Duration::from_secs(60) {
            if let Some(doc) = self.doc.as_mut() {
                if let Err(error) = storage::autosave(doc) {
                    self.toast = format!("Autosave failed: {error:#}");
                }
            }
            self.last_autosave = Instant::now();
        }
    }

    fn request_exit(&mut self, ctx: &egui::Context, action: ExitAction) {
        if self.dirty {
            self.pending_exit = Some(action);
        } else {
            self.complete_exit(ctx, action);
        }
    }

    fn complete_exit(&mut self, ctx: &egui::Context, action: ExitAction) {
        self.pending_exit = None;
        match action {
            ExitAction::Gallery => {
                self.screen = Screen::Home;
                self.gallery = storage::list_gallery();
                self.doc = None;
                self.gallery_id = None;
                self.history.clear();
                self.dirty = false;
            }
            ExitAction::Close => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
        }
    }

    pub(super) fn show_unsaved_dialog(&mut self, ctx: &egui::Context) {
        let Some(action) = self.pending_exit else {
            return;
        };
        egui::Window::new("Unsaved changes")
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
            .show(ctx, |ui| {
                ui.label("Save your changes before leaving?");
                ui.horizontal(|ui| {
                    if ui.button("Save").clicked() {
                        self.save_gallery();
                        if !self.dirty {
                            self.complete_exit(ctx, action);
                        }
                    }
                    if ui.button("Discard").clicked() {
                        storage::clear_recovery();
                        self.dirty = false;
                        self.complete_exit(ctx, action);
                    }
                    if ui.button("Cancel").clicked() {
                        self.pending_exit = None;
                    }
                });
            });
    }

    fn show_resize_dialog(&mut self, ctx: &egui::Context) {
        if !self.resize_dialog_open {
            return;
        }
        let mut apply = false;
        let mut cancel = false;
        egui::Window::new("Resize canvas")
            .collapsible(false)
            .resizable(false)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.label("Width");
                    ui.add(
                        egui::DragValue::new(&mut self.resize_width)
                            .range(64..=MAX_EDGE)
                            .suffix(" px"),
                    );
                    ui.label("Height");
                    ui.add(
                        egui::DragValue::new(&mut self.resize_height)
                            .range(64..=MAX_EDGE)
                            .suffix(" px"),
                    );
                });
                ui.radio_value(&mut self.resize_scale, true, "Scale artwork");
                ui.radio_value(&mut self.resize_scale, false, "Canvas size only");
                ui.horizontal(|ui| {
                    apply = ui.button("Apply").clicked();
                    cancel = ui.button("Cancel").clicked();
                });
            });
        if apply {
            self.resize_width = self.resize_width.clamp(64, MAX_EDGE);
            self.resize_height = self.resize_height.clamp(64, MAX_EDGE);
            if let Some(doc) = self.doc.as_mut() {
                self.history.push(doc, "Resize canvas");
                doc.resize(self.resize_width, self.resize_height, self.resize_scale);
                self.canvas.zoom = 0.0;
                self.canvas.invalidate();
                self.dirty = true;
            }
            self.resize_dialog_open = false;
        } else if cancel {
            self.resize_dialog_open = false;
        }
    }

    pub(super) fn export_gif(&mut self) {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("GIF animation", &["gif"])
            .set_file_name("Animation.gif")
            .save_file()
        else {
            return;
        };
        let Some(doc) = self.doc.as_mut() else { return };
        let (frames, width, height, fps, looping) = (
            doc.frame_images(false),
            doc.w,
            doc.h,
            doc.anim.as_ref().map_or(12, |animation| animation.fps),
            doc.anim.as_ref().is_some_and(|animation| animation.looping),
        );
        match crate::export::export_gif(&path, &frames, width, height, fps, looping) {
            Ok(()) => self.notify(format!("Exported {}", path.display())),
            Err(error) => self.notify(format!("GIF export failed: {error:#}")),
        }
    }

    pub(super) fn export_png_sequence(&mut self) {
        let Some(dir) = rfd::FileDialog::new().pick_folder() else {
            return;
        };
        let Some(doc) = self.doc.as_mut() else { return };
        let (frames, width, height) = (doc.frame_images(false), doc.w, doc.h);
        match crate::export::export_png_sequence(&dir, "frame", &frames, width, height) {
            Ok(count) => self.notify(format!("Exported {count} PNG frames to {}", dir.display())),
            Err(error) => self.notify(format!("PNG sequence export failed: {error:#}")),
        }
    }

    pub(super) fn export_video(&mut self, extension: &str) {
        if !crate::export::ffmpeg_available() {
            self.notify("Video export requires ffmpeg on PATH");
            return;
        }
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Video", &[extension])
            .set_file_name(format!("Animation.{extension}"))
            .save_file()
        else {
            return;
        };
        let Some(doc) = self.doc.as_mut() else { return };
        let (frames, width, height, fps, bg) = (
            doc.frame_images(false),
            doc.w,
            doc.h,
            doc.anim.as_ref().map_or(12, |animation| animation.fps),
            doc.bg,
        );
        match crate::export::export_video(&path, &frames, width, height, fps, bg) {
            Ok(()) => self.notify(format!("Exported {}", path.display())),
            Err(error) => self.notify(format!("Video export failed: {error:#}")),
        }
    }
}
