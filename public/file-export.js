/* Confirmed native exports, desktop file picker, and honest browser downloads. */
WinCreate.use(app => {
  'use strict';
  const CHUNK = 48 * 1024;
  let busy = false;
  const abort = () => new DOMException('Save cancelled', 'AbortError');
  function filename(name) {
    let safe = String(name || 'WinCreate-Artwork.png')
      .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/^\.+/, '_').replace(/[. ]+$/, '');
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = '_' + safe;
    const dot = safe.lastIndexOf('.'), extension = dot > 0 ? safe.slice(dot, dot + 13) : '';
    let stem = dot > 0 ? safe.slice(0, dot) : safe;
    const encoder = new TextEncoder();
    while (encoder.encode(stem + extension).length > 120) stem = Array.from(stem).slice(0, -1).join('');
    return (stem || 'WinCreate') + extension;
  }
  function reply(value) {
    let result;
    try { result = typeof value === 'string' ? JSON.parse(value) : value; } catch {}
    if (!result || result.ok !== true) throw new Error(result?.error || 'The Android app did not confirm the save. Update its native saving code.');
    return result;
  }
  function nativeSupport() {
    const bridge = window.WinCreateStorage;
    if (!bridge) return null;
    const caps = reply(bridge.capabilities());
    if (caps.version !== 1) throw new Error('Update the Android app to use the current saving code.');
    return { bridge, caps };
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.dataset.wcExport = 'file'; document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    return { status: 'download-started', filename: name, message: 'Download started — check Files / Downloads' };
  }
  function progress(name) {
    const dialog = document.createElement('dialog'); dialog.className = 'wc-save-dialog';
    dialog.setAttribute('aria-label', 'Saving file');
    const title = document.createElement('h2'); title.textContent = 'Saving ' + name;
    const text = document.createElement('p'); text.textContent = 'Preparing file…'; text.setAttribute('aria-live', 'polite');
    const meter = document.createElement('progress'); meter.max = 1; meter.value = 0;
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    let cancelled = false;
    const stop = e => { e?.preventDefault(); cancelled = true; text.textContent = 'Cancelling…'; cancel.disabled = true; };
    cancel.onclick = stop; dialog.addEventListener('cancel', stop);
    dialog.append(title, text, meter, cancel); document.body.appendChild(dialog); dialog.showModal();
    return {
      check() { if (cancelled) throw abort(); },
      update(value) { meter.value = value; text.textContent = 'Saving ' + Math.round(value * 100) + '%'; },
      close() { dialog.close(); dialog.remove(); }
    };
  }
  function shareFile(file) {
    const payload = { files: [file], title: 'WinCreate artwork' };
    // Encoding a large PNG may outlast the browser's transient user activation.
    if (!navigator.userActivation || navigator.userActivation.isActive) return navigator.share(payload);
    return new Promise((resolve, reject) => {
      const dialog = document.createElement('dialog'); dialog.className = 'wc-save-dialog'; dialog.setAttribute('aria-label', 'Share ready');
      const title = document.createElement('h2'); title.textContent = 'Your PNG is ready';
      const share = document.createElement('button'); share.textContent = 'Choose app to share';
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
      const close = () => { dialog.close(); dialog.remove(); };
      share.onclick = () => { close(); try { Promise.resolve(navigator.share(payload)).then(resolve, reject); } catch (e) { reject(e); } };
      const stop = e => { e?.preventDefault(); close(); reject(abort()); };
      cancel.onclick = stop; dialog.addEventListener('cancel', stop);
      dialog.append(title, share, cancel); document.body.appendChild(dialog); dialog.showModal();
    });
  }
  async function nativeSave(blob, name, destination, native) {
    const { bridge, caps } = native;
    if (!caps[destination]) throw new Error('Direct saving needs Android 10 or newer. Use Save to Files in a browser, or Share PNG.');
    if (blob.size > caps.maxBytes) throw new Error('This file exceeds the Android save limit. Export a smaller file or save it in a desktop browser.');
    const ui = progress(name);
    let id;
    try {
      const started = reply(bridge.beginExport(destination, name, blob.type, blob.size));
      if (typeof started.id !== 'string' || !started.id) throw new Error('The Android app did not start the save.');
      id = started.id;
      const chunkSize = Math.min(CHUNK, Number(caps.chunkBytes) || CHUNK);
      if (chunkSize < 1024) throw new Error('Invalid Android save chunk size.');
      for (let offset = 0; offset < blob.size; offset += chunkSize) {
        ui.check();
        const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
        ui.check();
        const ack = reply(bridge.writeChunk(id, btoa(String.fromCharCode(...bytes))));
        if (ack.received !== offset + bytes.length) throw new Error('Android reported an incomplete file write.');
        ui.update(ack.received / blob.size);
        // Let touch input, the Cancel button and progress paint between chunks.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      ui.check();
      const saved = reply(bridge.finishExport(id));
      if (typeof saved.uri !== 'string' || !saved.uri.startsWith('content://') || saved.bytes !== blob.size || saved.destination !== destination) {
        throw new Error('Android did not confirm the completed file. Check storage before retrying.');
      }
      id = null;
      return { status: 'saved', filename: saved.filename || name, uri: saved.uri,
        message: destination === 'gallery' ? 'Saved to Gallery · Pictures / WinCreate' : 'Saved to Files · Downloads / WinCreate' };
    } finally {
      if (id) { try { reply(bridge.cancelExport(id)); } catch (e) { console.warn('Could not confirm cancellation of the pending Android export', e); } }
      ui.close();
    }
  }
  async function save(source, name, destination = 'files', options = {}) {
    if (busy) throw new Error('Another file is saving. Wait for it to finish.');
    if (!['files', 'gallery', 'share'].includes(destination)) throw new Error('Unknown save destination.');
    name = filename(name); busy = true;
    let writable;
    try {
      const native = destination === 'share' ? null : nativeSupport();
      if (destination === 'files' && native && !native.caps.files) {
        throw new Error('Direct Files saving needs Android 10 or newer. Use Share PNG, or open WinCreate in a browser to download.');
      }
      if (destination === 'gallery' && !native?.caps.gallery) {
        throw new Error('Direct Gallery saving requires the updated Android app. Choose Share PNG to send to Photos, or Save PNG to Files.');
      }
      // Open the picker synchronously in the click handler, before PNG encoding or DB work.
      let handle;
      if (destination === 'files' && !native?.caps.files && typeof window.showSaveFilePicker === 'function' && options.pickFile !== false) {
        const extension = '.' + name.split('.').pop();
        handle = await window.showSaveFilePicker({ suggestedName: name,
          types: [{ description: options.description || 'WinCreate export', accept: { [options.mime || 'image/png']: [extension] } }] });
      }
      const blob = typeof source === 'function' ? await source() : await source;
      if (!(blob instanceof Blob) || !blob.size) throw new Error('The exported file is empty.');
      let result;
      if (destination === 'share') {
        const file = new File([blob], name, { type: blob.type });
        if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
          throw new Error('File sharing is unavailable here. Use Save PNG to Files.');
        }
        await shareFile(file);
        result = { status: 'shared', filename: name, message: 'Shared — saving depends on the app you selected' };
      } else if (native?.caps[destination]) {
        result = await nativeSave(blob, name, destination, native);
      } else if (handle) {
        writable = await handle.createWritable(); await writable.write(blob); await writable.close(); writable = null;
        result = { status: 'saved', filename: handle.name || name, message: 'Saved to Files · ' + (handle.name || name) };
      } else {
        result = download(blob, name);
      }
      app.closePops(); app.msg(result.message); return result;
    } catch (e) {
      if (writable) { try { await writable.abort(); } catch {} }
      if (e.name === 'AbortError') { app.msg('Save cancelled'); return { status: 'cancelled', message: 'Save cancelled' }; }
      throw e;
    } finally { busy = false; }
  }
  function galleryHelp() {
    const dialog = document.createElement('dialog'); dialog.className = 'wc-save-dialog'; dialog.setAttribute('aria-label', 'Save artwork');
    const title = document.createElement('h2'); title.textContent = 'Save your drawing';
    const text = document.createElement('p');
    text.textContent = 'Direct Gallery saving needs the updated Android app. You can download the PNG to Files, or share it to Photos if your phone offers that option.';
    const files = document.createElement('button'); files.textContent = 'Save PNG to Files';
    const share = document.createElement('button'); share.textContent = 'Share PNG'; share.hidden = typeof navigator.share !== 'function';
    const close = document.createElement('button'); close.textContent = 'Close';
    const dismiss = () => { dialog.close(); dialog.remove(); };
    files.onclick = () => { dismiss(); saveArtwork('files'); };
    share.onclick = () => { dismiss(); saveArtwork('share'); };
    close.onclick = dismiss; dialog.addEventListener('cancel', e => { e.preventDefault(); dismiss(); });
    dialog.append(title, text, files, share, close); document.body.appendChild(dialog); dialog.showModal();
  }
  async function saveArtwork(destination) {
    if (busy) { app.msg('Another file is saving. Wait for it to finish.'); return; }
    try {
      app.layerMasks?.finish();
      if (isDrawing) finishPointerStroke();
      if (window.WCGuard?.loading) throw new Error('Wait for the project to finish opening.');
      if (destination === 'gallery' && !nativeSupport()?.caps.gallery) { galleryHelp(); return; }
      return await save(artworkPngBlob, 'WinCreate-Artwork-' + Date.now() + '.png', destination, { mime: 'image/png' });
    } catch (e) { console.error('Artwork save failed', e); app.msg('Save failed: ' + e.message); return { status: 'failed', message: e.message }; }
  }
  app.exports = { save, saveArtwork, filename, get busy() { return busy; } };
  const files = document.getElementById('exportPngBtn'), gallery = document.getElementById('androidGallerySaveBtn'), share = document.getElementById('sharePngBtn');
  if (files) files.onclick = () => saveArtwork('files');
  if (gallery) { gallery.hidden = !(/Android/i.test(navigator.userAgent) || window.WinCreateAndroid || window.WinCreateStorage); gallery.onclick = () => saveArtwork('gallery'); }
  if (share) { share.hidden = typeof navigator.share !== 'function'; share.onclick = () => saveArtwork('share'); }
});
