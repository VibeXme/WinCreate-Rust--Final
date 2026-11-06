//! Snapshot-based undo/redo. Layer pixels are copy-on-write tiles, so a
//! snapshot only costs the tiles that later change.

use crate::document::Document;

pub struct History {
    undo: Vec<(Document, String)>,
    redo: Vec<(Document, String)>,
    pub limit: usize,
}

impl Default for History {
    fn default() -> Self {
        Self {
            undo: Vec::new(),
            redo: Vec::new(),
            limit: 100,
        }
    }
}

impl History {
    /// Record `doc` as it is *before* an edit.
    pub fn push(&mut self, doc: &Document, label: impl Into<String>) {
        let mut snap = doc.clone();
        snap.sync_frame();
        self.undo.push((snap, label.into()));
        self.redo.clear();
        if self.undo.len() > self.limit {
            let excess = self.undo.len() - self.limit;
            self.undo.drain(..excess);
        }
    }

    pub fn undo(&mut self, doc: &mut Document) -> Option<String> {
        let (prev, label) = self.undo.pop()?;
        let mut cur = doc.clone();
        cur.sync_frame();
        self.redo.push((cur, label.clone()));
        *doc = prev;
        Some(label)
    }

    pub fn redo(&mut self, doc: &mut Document) -> Option<String> {
        let (next, label) = self.redo.pop()?;
        let mut cur = doc.clone();
        cur.sync_frame();
        self.undo.push((cur, label.clone()));
        *doc = next;
        Some(label)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
    pub fn clear(&mut self) {
        self.undo.clear();
        self.redo.clear();
    }
    pub fn len(&self) -> usize {
        self.undo.len()
    }
    pub fn is_empty(&self) -> bool {
        self.undo.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn undo_redo_roundtrip() {
        let mut d = Document::new("t", 64, 64, [255, 255, 255]);
        let mut h = History::default();
        h.push(&d, "paint");
        d.layers[0].pixels.put(1, 1, [1, 2, 3, 255]);
        assert_eq!(h.undo(&mut d).as_deref(), Some("paint"));
        assert_eq!(d.layers[0].pixels.get(1, 1)[3], 0);
        h.redo(&mut d);
        assert_eq!(d.layers[0].pixels.get(1, 1), [1, 2, 3, 255]);
    }

    #[test]
    fn limit_is_enforced() {
        let d = Document::new("t", 64, 64, [255, 255, 255]);
        let mut h = History {
            limit: 3,
            ..Default::default()
        };
        for _ in 0..10 {
            h.push(&d, "x");
        }
        assert_eq!(h.len(), 3);
    }
}
