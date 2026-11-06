//! Export and interchange: PNG/JPEG/WebP/BMP, layered ORA and PSD, GIF,
//! PNG sequences and (when ffmpeg is installed) MP4/WebM video.

use crate::document::Document;
use crate::project::{self, encode_png};
use anyhow::{bail, Context, Result};
use std::io::Write;
use std::path::Path;

fn flatten_on(flat: &[u8], bg: [u8; 3]) -> Vec<u8> {
    let mut rgb = Vec::with_capacity(flat.len() / 4 * 3);
    for p in flat.chunks_exact(4) {
        let a = p[3] as f32 / 255.0;
        for c in 0..3 {
            rgb.push((p[c] as f32 * a + bg[c] as f32 * (1.0 - a) + 0.5) as u8);
        }
    }
    rgb
}

/// Save a flattened straight-alpha RGBA image; format is chosen by file extension.
pub fn save_image(path: &Path, flat: &[u8], w: usize, h: usize, bg: [u8; 3]) -> Result<()> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => std::fs::write(path, encode_png(flat, w, h)?)?,
        "jpg" | "jpeg" => {
            let rgb = flatten_on(flat, bg);
            let mut f = std::io::BufWriter::new(std::fs::File::create(path)?);
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut f, 95).encode(
                &rgb,
                w as u32,
                h as u32,
                image::ExtendedColorType::Rgb8,
            )?;
        }
        "webp" | "bmp" => {
            let img = image::RgbaImage::from_raw(w as u32, h as u32, flat.to_vec())
                .context("buffer size")?;
            img.save(path)?;
        }
        other => bail!("Unsupported image format: .{other}"),
    }
    Ok(())
}

pub fn export_flat(doc: &Document, path: &Path, with_bg: bool) -> Result<()> {
    let flat = doc.flatten(with_bg);
    save_image(path, &flat, doc.w, doc.h, doc.bg)
}

// ------------------------------------------------------------------ OpenRaster

pub fn export_ora(doc: &mut Document, path: &Path) -> Result<()> {
    use zip::write::SimpleFileOptions;
    let file = std::fs::File::create(path)?;
    let mut zip = zip::ZipWriter::new(file);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflate = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("mimetype", stored)?;
    zip.write_all(b"image/openraster")?;
    let mut stack = String::new();
    for (i, l) in doc.layers.iter().enumerate().rev() {
        let name = format!("data/layer{i}.png");
        zip.start_file(&name, stored)?;
        zip.write_all(&encode_png(&doc.baked_layer(i), doc.w, doc.h)?)?;
        stack.push_str(&format!(
            r#"<layer name="{}" src="{}" x="0" y="0" opacity="{:.3}" visibility="{}" composite-op="{}"/>"#,
            xml_escape(&l.name),
            name,
            l.opacity,
            if l.visible { "visible" } else { "hidden" },
            l.blend.ora()
        ));
    }
    if doc.bg_visible {
        let bg = crate::tiled::Tiled::filled(doc.w, doc.h, [doc.bg[0], doc.bg[1], doc.bg[2], 255]);
        zip.start_file("data/background.png", stored)?;
        zip.write_all(&encode_png(&bg.to_flat(), doc.w, doc.h)?)?;
        stack.push_str(r#"<layer name="Background" src="data/background.png" x="0" y="0" opacity="1" visibility="visible" composite-op="svg:src-over"/>"#);
    }
    zip.start_file("stack.xml", deflate)?;
    zip.write_all(
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?><image version="0.0.3" w="{}" h="{}" name="{}"><stack>{}</stack></image>"#,
            doc.w,
            doc.h,
            xml_escape(&doc.title),
            stack
        )
        .as_bytes(),
    )?;
    let merged = doc.flatten(true);
    zip.start_file("mergedimage.png", stored)?;
    zip.write_all(&encode_png(&merged, doc.w, doc.h)?)?;
    let tw = 256usize;
    let th = ((doc.h as f32 / doc.w as f32) * 256.0).round().max(1.0) as usize;
    zip.start_file("Thumbnails/thumbnail.png", stored)?;
    zip.write_all(&encode_png(
        &crate::adjust::resample(&merged, doc.w, doc.h, tw, th),
        tw,
        th,
    )?)?;
    zip.start_file("wincreate/document.winc", deflate)?;
    zip.write_all(project::serialize(doc)?.as_bytes())?;
    zip.finish()?;
    Ok(())
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn xml_attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let key = format!(" {name}=\"");
    let start = tag.find(&key)? + key.len();
    let end = tag[start..].find('"')? + start;
    Some(&tag[start..end])
}

pub fn import_ora(path: &Path) -> Result<Document> {
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    if let Ok(mut f) = zip.by_name("wincreate/document.winc") {
        let mut s = String::new();
        f.read_to_string(&mut s)?;
        return project::deserialize(&s);
    }
    let mut xml = String::new();
    zip.by_name("stack.xml")
        .context("Invalid OpenRaster archive")?
        .read_to_string(&mut xml)?;
    let img_start = xml.find("<image").context("Invalid stack.xml")?;
    let img_tag = &xml[img_start..img_start + xml[img_start..].find('>').unwrap_or(0)];
    let w: usize = xml_attr(img_tag, "w")
        .and_then(|v| v.parse().ok())
        .context("missing width")?;
    let h: usize = xml_attr(img_tag, "h")
        .and_then(|v| v.parse().ok())
        .context("missing height")?;
    if !(1..=project::MAX_EDGE).contains(&w) || !(1..=project::MAX_EDGE).contains(&h) {
        bail!("OpenRaster dimensions out of range");
    }
    let mut doc = Document::new(
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Imported"),
        w.max(64),
        h.max(64),
        [255, 255, 255],
    );
    doc.bg_visible = false;
    doc.layers.clear();
    let mut tags: Vec<String> = xml
        .match_indices("<layer")
        .map(|(i, _)| xml[i..i + xml[i..].find('>').unwrap_or(0)].to_string())
        .collect();
    tags.reverse();
    for tag in tags {
        let Some(src) = xml_attr(&tag, "src") else {
            continue;
        };
        let mut bytes = Vec::new();
        zip.by_name(src)?.read_to_end(&mut bytes)?;
        let (flat, iw, ih) = project::decode_image_bytes(&bytes)?;
        let ox: i32 = xml_attr(&tag, "x")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let oy: i32 = xml_attr(&tag, "y")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let mut t = crate::tiled::Tiled::new(doc.w, doc.h);
        t.for_each_mut(
            crate::tiled::IRect::new(ox, oy, ox + iw as i32, oy + ih as i32),
            |x, y, p| {
                let i = (((y - oy) as usize) * iw + (x - ox) as usize) * 4;
                p.copy_from_slice(&flat[i..i + 4]);
            },
        );
        let id = doc.alloc_id();
        let mut l = crate::document::Layer::new(
            id,
            xml_attr(&tag, "name").unwrap_or("Layer"),
            doc.w,
            doc.h,
        );
        l.pixels = t;
        l.opacity = xml_attr(&tag, "opacity")
            .and_then(|v| v.parse().ok())
            .unwrap_or(1.0f32)
            .clamp(0.0, 1.0);
        l.visible = xml_attr(&tag, "visibility") != Some("hidden");
        l.blend = crate::color::BlendMode::from_css(
            xml_attr(&tag, "composite-op")
                .unwrap_or("")
                .trim_start_matches("svg:"),
        );
        doc.layers.push(l);
    }
    if doc.layers.is_empty() {
        doc.add_layer();
    }
    doc.active = doc.layers.len() - 1;
    Ok(doc)
}

// ------------------------------------------------------------------ PSD (8-bit RGB, raw channels)

pub fn export_psd(doc: &Document, path: &Path) -> Result<()> {
    let (w, h) = (doc.w as u32, doc.h as u32);
    let mut out: Vec<u8> = Vec::new();
    let be16 = |v: &mut Vec<u8>, x: u16| v.extend_from_slice(&x.to_be_bytes());
    let be32 = |v: &mut Vec<u8>, x: u32| v.extend_from_slice(&x.to_be_bytes());
    out.extend_from_slice(b"8BPS");
    be16(&mut out, 1);
    out.extend_from_slice(&[0; 6]);
    be16(&mut out, 4);
    be32(&mut out, h);
    be32(&mut out, w);
    be16(&mut out, 8);
    be16(&mut out, 3);
    be32(&mut out, 0); // colour mode data
    be32(&mut out, 0); // image resources

    // Layer info
    let mut info: Vec<u8> = Vec::new();
    let n = doc.layers.len() as i16;
    info.extend_from_slice(&(-n).to_be_bytes()); // negative: first alpha channel is merged transparency
    let plane_len = (w * h) as usize;
    let mut channel_data: Vec<u8> = Vec::new();
    for (i, l) in doc.layers.iter().enumerate() {
        let px = doc.baked_layer(i);
        be32(&mut info, 0);
        be32(&mut info, 0);
        be32(&mut info, h);
        be32(&mut info, w);
        be16(&mut info, 4);
        for id in [-1i16, 0, 1, 2] {
            info.extend_from_slice(&id.to_be_bytes());
            be32(&mut info, (plane_len + 2) as u32);
        }
        info.extend_from_slice(b"8BIM");
        info.extend_from_slice(l.blend.psd_key());
        info.push((l.opacity * 255.0).round() as u8);
        info.push(u8::from(l.clip));
        info.push(if l.visible { 0 } else { 2 });
        info.push(0);
        let mut name = l
            .name
            .as_bytes()
            .iter()
            .copied()
            .filter(|b| b.is_ascii())
            .take(255)
            .collect::<Vec<u8>>();
        let mut name_block = vec![name.len() as u8];
        name_block.append(&mut name);
        while name_block.len() % 4 != 0 {
            name_block.push(0);
        }
        let extra_len = 4 + 4 + name_block.len();
        be32(&mut info, extra_len as u32);
        be32(&mut info, 0); // mask data
        be32(&mut info, 0); // blending ranges
        info.extend_from_slice(&name_block);
        for ch in [3usize, 0, 1, 2] {
            be16(&mut channel_data, 0);
            channel_data.extend(px.chunks_exact(4).map(|p| p[ch]));
        }
    }
    info.extend_from_slice(&channel_data);
    if info.len() % 2 != 0 {
        info.push(0);
    }
    let mut lm: Vec<u8> = Vec::new();
    be32(&mut lm, info.len() as u32);
    lm.extend_from_slice(&info);
    be32(&mut lm, 0); // global layer mask
    be32(&mut out, lm.len() as u32);
    out.extend_from_slice(&lm);

    // Merged image (raw, planar RGBA)
    let merged = doc.flatten(true);
    be16(&mut out, 0);
    for ch in 0..4 {
        out.extend(merged.chunks_exact(4).map(|p| p[ch]));
    }
    std::fs::write(path, out)?;
    Ok(())
}

// ------------------------------------------------------------------ animation

pub fn export_gif(
    path: &Path,
    frames: &[(Vec<u8>, u32)],
    w: usize,
    h: usize,
    fps: u32,
    looping: bool,
) -> Result<()> {
    use image::codecs::gif::{GifEncoder, Repeat};
    let f = std::io::BufWriter::new(std::fs::File::create(path)?);
    let mut enc = GifEncoder::new_with_speed(f, 10);
    enc.set_repeat(if looping {
        Repeat::Infinite
    } else {
        Repeat::Finite(0)
    })?;
    for (img, hold) in frames {
        let buf =
            image::RgbaImage::from_raw(w as u32, h as u32, img.clone()).context("frame size")?;
        let delay = image::Delay::from_numer_denom_ms(1000 * hold.max(&1), fps.max(1));
        enc.encode_frame(image::Frame::from_parts(buf, 0, 0, delay))?;
    }
    Ok(())
}

pub fn export_png_sequence(
    dir: &Path,
    stem: &str,
    frames: &[(Vec<u8>, u32)],
    w: usize,
    h: usize,
) -> Result<usize> {
    std::fs::create_dir_all(dir)?;
    for (i, (img, _)) in frames.iter().enumerate() {
        std::fs::write(
            dir.join(format!("{stem}_{:04}.png", i + 1)),
            encode_png(img, w, h)?,
        )?;
    }
    Ok(frames.len())
}

pub fn ffmpeg_available() -> bool {
    std::process::Command::new("ffmpeg")
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Encode frames (holds already expanded) through a local ffmpeg binary.
pub fn export_video(
    path: &Path,
    frames: &[(Vec<u8>, u32)],
    w: usize,
    h: usize,
    fps: u32,
    bg: [u8; 3],
) -> Result<()> {
    use std::process::{Command, Stdio};
    let webm = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("webm"))
        .unwrap_or(false);
    // Encoders need even dimensions.
    let (ew, eh) = (w & !1, h & !1);
    let mut cmd = Command::new("ffmpeg");
    cmd.args([
        "-y",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
    ])
    .args([
        "-s",
        &format!("{ew}x{eh}"),
        "-r",
        &fps.to_string(),
        "-i",
        "-",
    ]);
    if webm {
        cmd.args(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30"]);
    } else {
        cmd.args([
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-movflags",
            "+faststart",
        ]);
    }
    cmd.args(["-pix_fmt", "yuv420p"])
        .arg(path)
        .stdin(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .context("ffmpeg is not installed or not on PATH")?;
    {
        let stdin = child.stdin.as_mut().context("ffmpeg stdin")?;
        for (img, hold) in frames {
            let rgb = flatten_on(img, bg);
            let mut cropped = Vec::with_capacity(ew * eh * 3);
            for y in 0..eh {
                cropped.extend_from_slice(&rgb[y * w * 3..y * w * 3 + ew * 3]);
            }
            for _ in 0..(*hold).max(1) {
                stdin.write_all(&cropped)?;
            }
        }
    }
    let out = child.wait_with_output()?;
    if !out.status.success() {
        bail!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("wincreate-test-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d.join(name)
    }

    #[test]
    fn ora_roundtrip_via_metadata() {
        let mut d = Document::new("Ora", 64, 64, [255, 0, 0]);
        d.layers[0].pixels.put(3, 3, [0, 255, 0, 255]);
        let p = tmp("a.ora");
        export_ora(&mut d, &p).unwrap();
        let back = import_ora(&p).unwrap();
        assert_eq!(back.layers[0].pixels.get(3, 3), [0, 255, 0, 255]);
    }

    #[test]
    fn psd_has_valid_header() {
        let mut d = Document::new("Psd", 64, 64, [255, 255, 255]);
        d.add_layer();
        let p = tmp("a.psd");
        export_psd(&d, &p).unwrap();
        let bytes = std::fs::read(&p).unwrap();
        assert_eq!(&bytes[..4], b"8BPS");
        assert_eq!(u16::from_be_bytes([bytes[12], bytes[13]]), 4);
    }

    #[test]
    fn image_formats() {
        let d = Document::new("Img", 64, 64, [255, 255, 255]);
        for ext in ["png", "jpg", "webp", "bmp"] {
            let p = tmp(&format!("a.{ext}"));
            export_flat(&d, &p, true).unwrap();
            assert!(image::open(&p).is_ok(), "{ext}");
        }
    }

    #[test]
    fn gif_export() {
        let mut d = Document::new("Gif", 64, 64, [255, 255, 255]);
        d.enable_animation();
        d.add_frame(false);
        let frames = d.frame_images(false);
        let p = tmp("a.gif");
        export_gif(&p, &frames, 64, 64, 12, true).unwrap();
        assert!(std::fs::metadata(&p).unwrap().len() > 0);
    }
}
