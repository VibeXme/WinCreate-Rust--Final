//! Local gallery of saved artworks and the crash-recovery autosave.

use crate::document::Document;
use crate::project;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GalleryEntry {
    pub id: String,
    pub title: String,
    pub width: usize,
    pub height: usize,
    pub modified: u64,
    pub animation: bool,
    #[serde(skip)]
    pub thumb_path: PathBuf,
    #[serde(skip)]
    pub project_path: PathBuf,
}

pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("WINCREATE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    directories::ProjectDirs::from("com", "WinCreate", "WinCreate Studio")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir().join("wincreate-studio"))
}

fn gallery_dir() -> PathBuf {
    data_dir().join("projects")
}

fn recovery_dir() -> PathBuf {
    data_dir().join("recovery")
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn new_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("art_{nanos}")
}

fn thumbnail(doc: &Document) -> Result<Vec<u8>> {
    let flat = doc.flatten(true);
    let scale = 320.0 / doc.w.max(doc.h) as f32;
    let (tw, th) = (
        ((doc.w as f32 * scale).round() as usize).max(1),
        ((doc.h as f32 * scale).round() as usize).max(1),
    );
    project::encode_png(
        &crate::adjust::resample(&flat, doc.w, doc.h, tw, th),
        tw,
        th,
    )
}

fn write_entry(dir: &PathBuf, id: &str, doc: &mut Document) -> Result<GalleryEntry> {
    std::fs::create_dir_all(dir)?;
    let project_path = dir.join(format!("{id}.winc"));
    project::save_file(doc, &project_path)?;
    let thumb_path = dir.join(format!("{id}.png"));
    std::fs::write(&thumb_path, thumbnail(doc)?)?;
    let entry = GalleryEntry {
        id: id.to_string(),
        title: doc.title.clone(),
        width: doc.w,
        height: doc.h,
        modified: now_secs(),
        animation: doc.anim.is_some(),
        thumb_path,
        project_path,
    };
    std::fs::write(dir.join(format!("{id}.json")), serde_json::to_vec(&entry)?)?;
    Ok(entry)
}

pub fn save_to_gallery(id: &str, doc: &mut Document) -> Result<GalleryEntry> {
    write_entry(&gallery_dir(), id, doc)
}

fn list_dir(dir: PathBuf) -> Vec<GalleryEntry> {
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<GalleryEntry> = rd
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| {
            let mut entry: GalleryEntry =
                serde_json::from_slice(&std::fs::read(e.path()).ok()?).ok()?;
            entry.project_path = dir.join(format!("{}.winc", entry.id));
            entry.thumb_path = dir.join(format!("{}.png", entry.id));
            entry.project_path.exists().then_some(entry)
        })
        .collect();
    out.sort_by_key(|entry| std::cmp::Reverse(entry.modified));
    out
}

pub fn list_gallery() -> Vec<GalleryEntry> {
    list_dir(gallery_dir())
}

pub fn delete_entry(entry: &GalleryEntry) -> Result<()> {
    let dir = entry
        .project_path
        .parent()
        .context("no parent")?
        .to_path_buf();
    for ext in ["winc", "png", "json"] {
        let _ = std::fs::remove_file(dir.join(format!("{}.{ext}", entry.id)));
    }
    Ok(())
}

pub fn autosave(doc: &mut Document) -> Result<GalleryEntry> {
    write_entry(&recovery_dir(), "autosave", doc)
}

pub fn recovery() -> Option<GalleryEntry> {
    list_dir(recovery_dir()).into_iter().next()
}

pub fn clear_recovery() {
    let _ = std::fs::remove_dir_all(recovery_dir());
}
