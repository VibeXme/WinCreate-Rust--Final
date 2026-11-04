/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
WinCreate.use(app => {
  // Remove Home button if it exists in DOM
  $('homeNavBtn')?.remove();

  // Global Event Listener for reliable cross close buttons across all popovers/windows
  document.addEventListener('click', e => {
    const closeBtn = e.target.closest('.pop-close-btn');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const modalOrPip = closeBtn.closest('#floatingRefWindow, #artGalleryModal, #recoveryHistoryModal');
      if (modalOrPip) {
        modalOrPip.style.display = 'none';
        return;
      }
      const popover = closeBtn.closest('.popover, .ios-layer-menu-sheet');
      if (popover) {
        popover.classList.remove('open');
        popover.style.display = '';
      }
    }
  });


  // =========================================================================
  // 1. Splash Loading Screen (0.5s) -> Reveals Launchpad (pageSetup)
  // =========================================================================
  const splashEl = document.createElement('div');
  splashEl.id = 'startupLoader';
  Object.assign(splashEl.style, {
    position: 'fixed', inset: '0', zIndex: '99999', background: '#090a0f',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.3s ease'
  });
  splashEl.innerHTML = `
    <img src="favicon.svg" alt="" width="48" height="48" style="margin-bottom:14px">
    <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;margin-bottom:6px">WinCreate Studio</div>
    <div style="font-size:13px;color:var(--text-sub);margin-bottom:20px">Loading your creative workspace</div>
    <div style="width:160px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
      <div id="splashBar" style="width:0%;height:100%;background:var(--ios-blue);transition:width 0.45s ease"></div>
    </div>
  `;
  document.body.appendChild(splashEl);

  setTimeout(() => {
    const bar = $('splashBar');
    if (bar) bar.style.width = '100%';
  }, 40);

  setTimeout(() => {
    splashEl.style.opacity = '0';
    setTimeout(() => {
      splashEl.remove();
      renderSetupSavedArtworksSection();
    }, 280);
  }, 520);

  // =========================================================================
  // 2. IndexedDB Full-Resolution Storage, Save Location & Recovery Checkpoints
  // =========================================================================
  let fixedDirectoryPath = 'In-App Gallery (Tap Browse to link folder)';try{fixedDirectoryPath=localStorage.getItem('wincreate_fixed_dir')||fixedDirectoryPath;}catch{}
  let savedDirectoryHandle = null;
  let activeSessionBaseName = null;
  let activeSessionGalleryId = null;
  let activeDocumentType='drawing';const documentSessions=new Map();
  let savedArtworksList = [];
  let recoveryCheckpointsList = [];
  let strokesSinceLastCheckpoint = 0;

  const DB_NAME = 'WinCreateStudioDB';
  const DB_VERSION = 4;
  const DB_INDEX='artworkIndex',DB_CHECKPOINT_INDEX='checkpointIndex';
  const DB_STORE = 'artworks';
  const DB_HANDLE_STORE = 'handles';
  const DB_CHECKPOINT_STORE = 'checkpoints';
  const MAX_CHECKPOINTS = 10;

  app.on('canvasInit', info => {
    documentSessions.clear();activeDocumentType='drawing';
    const cleanTitle = (info?.title || 'Artwork').replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '_');
    activeSessionBaseName = `${cleanTitle || 'Artwork'}_${Date.now()}`;
    activeSessionGalleryId = 'art_' + Date.now();
    strokesSinceLastCheckpoint = 0;
  });

  function openGalleryDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        for(const name of [DB_INDEX,DB_CHECKPOINT_INDEX])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(DB_HANDLE_STORE)) {
          db.createObjectStore(DB_HANDLE_STORE);
        }
        if (!db.objectStoreNames.contains(DB_CHECKPOINT_STORE)) {
          db.createObjectStore(DB_CHECKPOINT_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  async function saveDirHandleToDB(dirHandle) {
    try {
      const db = await openGalleryDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_HANDLE_STORE, 'readwrite');
        tx.objectStore(DB_HANDLE_STORE).put(dirHandle, 'savedDirectoryHandle');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Could not persist directory handle:', e);
    }
  }

  async function loadDirHandleFromDB() {
    try {
      const db = await openGalleryDB();
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_HANDLE_STORE, 'readonly');
        const req = tx.objectStore(DB_HANDLE_STORE).get('savedDirectoryHandle');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (handle) {
        savedDirectoryHandle = handle;
        fixedDirectoryPath = `📁 ${handle.name} (Direct Save Active)`;
        updateDirectoryPathUI();
      }
    } catch (_) {}
  }

  function updateDirectoryPathUI() {
    const dirInp = $('galleryDirPathInput');
    if (dirInp) dirInp.value = fixedDirectoryPath;
    const browseBtn = $('setupBrowseDirBtn');
    if (browseBtn) {
      browseBtn.textContent = savedDirectoryHandle
        ? `📁 Save Location: ${savedDirectoryHandle.name}`
        : `📁 Save Location: ${fixedDirectoryPath}`;
    }
  }

  async function verifyDirectoryPermission(dirHandle, withWrite = true) {
    if (!dirHandle) return false;
    const opts = { mode: withWrite ? 'readwrite' : 'read' };
    try {
      if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
      if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
    } catch (e) {
      console.warn('Permission request error:', e);
    }
    return false;
  }

  async function pickStorageDirectory() {
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        savedDirectoryHandle = handle;
        fixedDirectoryPath = `📁 ${handle.name} (Direct Save Active)`;
        try{localStorage.setItem('wincreate_fixed_dir', fixedDirectoryPath);}catch{}
        await saveDirHandleToDB(handle);
        updateDirectoryPathUI();
        app.msg(`Auto-Save Folder Linked: ${handle.name}`);
        return handle;
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
        return null;
      }
    } else {
      openStudioPrompt('Set Save Location Label / File Prefix:', fixedDirectoryPath, custom => {
        if (custom && custom.trim()) {
          fixedDirectoryPath = custom.trim();
          try{localStorage.setItem('wincreate_fixed_dir', fixedDirectoryPath);}catch{}
          updateDirectoryPathUI();
          renderGalleryGrid();
          app.msg(`Save Location Set: ${fixedDirectoryPath}`);
        }
      });
      return null;
    }
  }

  async function writeDirectlyToSelectedFolder(baseFileName, jsonString, pngDataUrl) {
    if (!savedDirectoryHandle) return false;
    const hasPerm = await verifyDirectoryPermission(savedDirectoryHandle, true);
    if (!hasPerm) return false;

    const wincFileHandle = await savedDirectoryHandle.getFileHandle(`${baseFileName}.winc`, { create: true });
    const wincStream = await wincFileHandle.createWritable();
    await wincStream.write(jsonString);
    await wincStream.close();

    if (pngDataUrl) {
      const res = await fetch(pngDataUrl);
      const pngBlob = await res.blob();
      const pngFileHandle = await savedDirectoryHandle.getFileHandle(`${baseFileName}.png`, { create: true });
      const pngStream = await pngFileHandle.createWritable();
      await pngStream.write(pngBlob);
      await pngStream.close();
    }
    return true;
  }

  function serializeCurrentArtworkState(customTitle, isCheckpoint = false) {
    app.flushPendingPaint?.();
    const type=app.animation?.enabled&&!app.animation.suspended?'animation':'drawing';
    if(type!==activeDocumentType){
      documentSessions.set(activeDocumentType,{id:activeSessionGalleryId,name:activeSessionBaseName});
      const session=documentSessions.get(type);activeSessionGalleryId=session?.id||('art_'+Date.now()+'_'+type);activeSessionBaseName=session?.name||('Artwork_'+type+'_'+Date.now());activeDocumentType=type;
    }
    const st = app.state;
    const w = st.WIDTH;
    const h = st.HEIGHT;

    const compCanvas = document.createElement('canvas');
    compCanvas.width = w;
    compCanvas.height = h;
    const cCtx = compCanvas.getContext('2d');
    cCtx.imageSmoothingEnabled = true;
    cCtx.imageSmoothingQuality = 'high';

    if (st.bgVisible) {
      cCtx.fillStyle = st.bgColor;
      cCtx.fillRect(0, 0, w, h);
    }
    st.layers.forEach(l => {
      if (!l.isFolder && l.canvas && l.visible) {
        if (l.parentId) {
          const parent = st.layers.find(x => x.id === l.parentId && x.isFolder);
          if (parent && !parent.visible) return;
        }
        cCtx.save();
        cCtx.globalAlpha = getEffectiveLayerOpacity(l);
        cCtx.globalCompositeOperation = l.blend === 'normal' ? 'source-over' : l.blend;
        cCtx.drawImage(app.createLayerComposite(l),0,0,w,h);
        cCtx.restore();
      }
    });

    if (!activeSessionGalleryId) activeSessionGalleryId = 'art_' + Date.now();
    if (!activeSessionBaseName) activeSessionBaseName = `Artwork_${Date.now()}`;

    const existingIdx = savedArtworksList.findIndex(x => x.id === activeSessionGalleryId);
    const baseTitle = customTitle || $('customName')?.value?.trim() || (existingIdx >= 0 ? savedArtworksList[existingIdx].title : `Artwork ${savedArtworksList.length + 1}`);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const thumb=document.createElement('canvas');thumb.width=240;thumb.height=Math.max(1,Math.round(240*h/w));thumb.getContext('2d').drawImage(compCanvas,0,0,thumb.width,thumb.height);
    return {
      thumbnail:thumb.toDataURL('image/png'),
      editRevision: app.state.editRevision,
      documentType: app.animation?.enabled&&!app.animation.suspended?'animation':'drawing',
      id: isCheckpoint ? ('chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)) : activeSessionGalleryId,
      parentArtId: activeSessionGalleryId,
      isCheckpoint,
      fileName: activeSessionBaseName,
      timestamp: Date.now(),
      title: isCheckpoint ? `${baseTitle} (Checkpoint)` : baseTitle,
      date: new Date().toLocaleDateString() + ' • ' + nowTime,
      width: w,
      height: h,
      bgColor: st.bgColor,
      bgVisible: st.bgVisible,
      animation: app.animation?.serialize() || null,
      artworkBrushHistory: st.artworkBrushHistory || [],
      dataUrl: compCanvas.toDataURL('image/png'),
      layers: st.layers.map(l => l.isFolder ? ({
        id: l.id,
        name: l.name,
        isFolder: true,
        collapsed: !!l.collapsed,layerMask:structuredClone(l.layerMask||null),
        visible: l.visible !== false,
        opacity: l.opacity ?? 100,
        blend: l.blend || 'normal'
      }) : ({
        id: l.id,
        name: l.name,
        isFolder: false,
        parentId: l.parentId || null,
        visible: l.visible !== false,
        opacity: l.opacity ?? 100,
        alphaLock: !!l.alphaLock,
        clipMask: !!l.clipMask,
        layerMask: structuredClone(l.layerMask||null),effects:structuredClone(l.effects||null),
        blend: l.blend || 'normal',
        vectorStrokes: structuredClone(l.vectorStrokes || []),
        pngData: l.canvas.toDataURL('image/png')
      }))
    };
  }

  function galleryMetadata(entry){return {id:entry.id,parentArtId:entry.parentArtId,title:entry.title,date:entry.date,timestamp:entry.timestamp,width:entry.width,height:entry.height,isCheckpoint:!!entry.isCheckpoint,reason:entry.reason||'',dataUrl:entry.thumbnail||'',metadataOnly:true};}
  async function migrateIndex(db,store,index){
    const count=await new Promise(res=>{const r=db.transaction(index).objectStore(index).count();r.onsuccess=()=>res(r.result);r.onerror=()=>res(-1);});
    const total=await new Promise(res=>{const r=db.transaction(store).objectStore(store).count();r.onsuccess=()=>res(r.result);r.onerror=()=>res(-1);});
    if(count===total)return;
    await new Promise((res,rej)=>{const tx=db.transaction([store,index],'readwrite'),r=tx.objectStore(store).openCursor();r.onsuccess=()=>{const c=r.result;if(c){tx.objectStore(index).put(galleryMetadata(c.value));c.continue();}};tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
  }
  async function loadAllArtworksFromDB() {
    try {
      const db = await openGalleryDB();
      await migrateIndex(db,DB_STORE,DB_INDEX);await migrateIndex(db,DB_CHECKPOINT_STORE,DB_CHECKPOINT_INDEX);
      const items = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_INDEX, 'readonly');
        const req = tx.objectStore(DB_INDEX).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      const chkItems = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_CHECKPOINT_INDEX, 'readonly');
        const req = tx.objectStore(DB_CHECKPOINT_INDEX).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      savedArtworksList = items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      recoveryCheckpointsList = chkItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (_) {
      savedArtworksList = [];
      recoveryCheckpointsList = [];
    }
    renderSetupSavedArtworksSection();
    renderGalleryGrid();
    renderRecoveryCheckpointsGrid();
  }

  async function putArtworkInDB(entry) {
    try {
      const db = await openGalleryDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([DB_STORE,DB_INDEX], 'readwrite');
        tx.objectStore(DB_STORE).put(entry);tx.objectStore(DB_INDEX).put(galleryMetadata(entry));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('IndexedDB write error:', e);
      throw e;
    }
  }

  async function removeArtworkFromDB(id) {
    try {
      const db = await openGalleryDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([DB_STORE,DB_INDEX], 'readwrite');
        tx.objectStore(DB_STORE).delete(id);tx.objectStore(DB_INDEX).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {}
  }

  let recoverySaveInProgress = false;
  async function createRecoveryCheckpoint(reason = 'Auto-Checkpoint') {
    if (recoverySaveInProgress) return false;
    recoverySaveInProgress = true;
    try {
      const snap = serializeCurrentArtworkState(null, true);
      snap.reason = reason;
      recoveryCheckpointsList.unshift(galleryMetadata(snap));

      const db = await openGalleryDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([DB_CHECKPOINT_STORE,DB_CHECKPOINT_INDEX], 'readwrite');
        const store = tx.objectStore(DB_CHECKPOINT_STORE);
        store.put(snap);tx.objectStore(DB_CHECKPOINT_INDEX).put(galleryMetadata(snap));
        while (recoveryCheckpointsList.length > MAX_CHECKPOINTS) {
          const oldest = recoveryCheckpointsList.pop();
          if (oldest?.id){store.delete(oldest.id);tx.objectStore(DB_CHECKPOINT_INDEX).delete(oldest.id);}
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      const shortTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      app.markSavedStatus(`Saved ${shortTime}`, snap.editRevision);
      renderRecoveryCheckpointsGrid();
      return true;
    } catch (e) {
      app.msg('Recovery save failed — use Save As to keep a project file');
      console.warn('Checkpoint error:', e);
      return false;
    } finally { recoverySaveInProgress = false; }
  }

  let pendingRecoveryTimer = 0;
  app.on('strokeCommit', () => {
    strokesSinceLastCheckpoint++;
    if (strokesSinceLastCheckpoint >= 8) {
      clearTimeout(pendingRecoveryTimer);
      pendingRecoveryTimer = setTimeout(() => {
        if (isDrawing || app.layerMasks?.busy || fillBusy) return;
        strokesSinceLastCheckpoint = 0;
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            if (!isDrawing && !app.layerMasks?.busy && !fillBusy) createRecoveryCheckpoint('Stroke Auto-Recovery');
          }, { timeout: 4000 });
        } else {
          createRecoveryCheckpoint('Stroke Auto-Recovery');
        }
      }, 2800);
    }
  });

  setInterval(() => {
    if ($('pageStudio')?.classList.contains('active') && (strokesSinceLastCheckpoint > 0 || hasUnsavedChanges) && !isDrawing && !app.layerMasks?.busy && !fillBusy) {
      strokesSinceLastCheckpoint = 0;
      createRecoveryCheckpoint('Timed Auto-Recovery');
    }
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && $('pageStudio')?.classList.contains('active') && hasUnsavedChanges && !isDrawing && !app.layerMasks?.busy && !fillBusy) {
      strokesSinceLastCheckpoint = 0;
      void createRecoveryCheckpoint('Drawing Background Recovery');
    }
  });

  async function saveCurrentCanvasToGallery(customTitle) {
    const entry = serializeCurrentArtworkState(customTitle, false);
    const existingIdx = savedArtworksList.findIndex(x => x.id === activeSessionGalleryId);
    if (existingIdx >= 0) savedArtworksList.splice(existingIdx, 1);
    savedArtworksList.unshift(galleryMetadata(entry));
    await putArtworkInDB(entry);
    await createRecoveryCheckpoint('Manual Save Point');
    renderSetupSavedArtworksSection();
    renderGalleryGrid();
    const shortTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    app.markSavedStatus(`Saved ${shortTime}`, entry.editRevision);
    return entry;
  }

  async function openSavedArtworkEntry(item) {
    if(!item||WCGuard.loading)return;
    WCGuard.loading=true;
    try{
      if(item.metadataOnly){const db=await openGalleryDB();item=await new Promise((res,rej)=>{const req=db.transaction(item.isCheckpoint?DB_CHECKPOINT_STORE:DB_STORE,'readonly').objectStore(item.isCheckpoint?DB_CHECKPOINT_STORE:DB_STORE).get(item.id);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});if(!item)throw Error('Saved project is unavailable');}
      const safe=WCGuard.cleanProject({...item,magic:'WINCREATE_PROJECT_V1'});
      item={...safe,id:item.id,parentArtId:item.parentArtId,title:String(item.title||'Artwork').slice(0,200),fileName:String(item.fileName||'Artwork').slice(0,200)};
      if(item.animation){await app.animation.load(item);app.setArtworkBrushHistory(item.artworkBrushHistory);activeDocumentType='animation';activeSessionGalleryId=item.parentArtId||item.id;activeSessionBaseName=item.fileName;app.markSavedStatus('Animation restored');return;}
      const decoded=new Map();await Promise.all(item.layers.filter(l=>!l.isFolder).map(l=>new Promise((res,rej)=>{const image=new Image(),timer=setTimeout(()=>rej(Error('Image decode timed out')),15000);image.onload=()=>{clearTimeout(timer);decoded.set(l.id,image);res();};image.onerror=()=>{clearTimeout(timer);rej(Error('Damaged layer image'));};image.src=l.pngData;})));
      await app.prepareRasterCommands(item.layers);
      app.initializeStudioCanvas(item.title,item.width,item.height,item.bgColor,true);app.setBgColor(item.bgColor,item.bgVisible);
      activeSessionGalleryId=item.parentArtId||item.id;activeSessionBaseName=item.fileName;
      const st=app.state;for(const l of st.layers){l.surface?.remove();l.canvas?.remove();l.vectorSvg?.remove();}st.layers.length=0;
      for(const saved of item.layers){if(saved.isFolder){const f=app.createFolderLayer(saved.name);Object.assign(f,saved);continue;}
        const l=app.createLayer(saved.name,{id:saved.id,parentId:saved.parentId,vectorStrokes:saved.vectorStrokes,layerMask:saved.layerMask,effects:saved.effects});for(const key of ['visible','opacity','alphaLock','clipMask','blend'])l[key]=saved[key];l.ctx.drawImage(decoded.get(saved.id),0,0);l.thumbDirty=true;}
      app.setArtworkBrushHistory(item.artworkBrushHistory);app.syncLayers();app.renderLayers();app.markSavedStatus('Restored');app.msg('Project restored');
    }catch(err){console.error('Restore failed',err);app.msg(err.message||'Cannot restore project');}
    finally{galleryModal.style.display='none';recoveryModal.style.display='none';WCGuard.loading=false;}
  }

  async function deleteSavedArtworkEntry(id, e) {
    if (e) e.stopPropagation();
    savedArtworksList = savedArtworksList.filter(x => x.id !== id);
    await removeArtworkFromDB(id);
    renderGalleryGrid();
    renderSetupSavedArtworksSection();
    app.msg('Removed from Saved Artworks');
  }

  function renderSetupSavedArtworksSection() {
    const grid = $('setupSavedArtworksGrid') || $('setupSavedGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (savedArtworksList.length === 0) {
      grid.innerHTML = `
        <div class="setup-empty-saved">
          <span>No saved canvases yet. Tap <strong>"📁 Select Save Folder..."</strong> to choose a save location, or draw on the canvas to generate automatic recovery checkpoints!</span>
        </div>
      `;
      return;
    }
    savedArtworksList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'preset-tile saved-art-tile';
      const resLabel = (item.width && item.height) ? `${item.width}×${item.height}` : 'Saved';
      const layerCount = item.layers ? `${item.layers.filter(x => !x.isFolder).length}L • ` : '';
      const brushCount = item.artworkBrushHistory?.length ? ` • 🖌️${item.artworkBrushHistory.length}` : '';
      card.innerHTML = `
        <div class="saved-thumb-box">
          <img class="safe-gallery-thumbnail" alt="${escapeMarkup(item.title)}">
          <button type="button" class="saved-del-btn" title="Delete saved canvas">✕</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <strong style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeMarkup(item.title)}</strong>
          <span style="font-size:10px;color:#a5b4fc;font-family:ui-monospace,monospace">${layerCount}${resLabel}${brushCount}</span>
        </div>
        <span style="font-size:10.5px;color:var(--text-sub)">${escapeMarkup(item.date)}</span>
      `;
      card.querySelector('.saved-del-btn').onclick = ev => deleteSavedArtworkEntry(item.id, ev);
      setSafeThumbnail(card,item);
      card.onclick = () => openSavedArtworkEntry(item);
      grid.appendChild(card);
    });
  }

  const galleryModal = document.createElement('div');
  galleryModal.id = 'artGalleryModal';
  Object.assign(galleryModal.style, {
    position: 'fixed', inset: '0', zIndex: '99990', background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(10px)', display: 'none', alignItems: 'center', justifyContent: 'center'
  });
  galleryModal.innerHTML = `
    <div style="background:var(--ios-sheet);border:1px solid var(--ios-sep);border-radius:18px;width:740px;max-width:94vw;max-height:86vh;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;overflow:hidden">
      <div class="ios-sheet-header" style="padding:14px 18px;border-bottom:1px solid var(--ios-sep);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="gallery-heading"><span class="gallery-heading-mark">W</span><span><strong>Artwork Library</strong><small>Your saved canvases and projects</small></span></span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button type="button" class="blend-chip" id="galleryOpenRecoveryBtn">History</button>
          <button type="button" class="blend-chip active" id="galleryNewCanvasBtn">+ New canvas</button>
          <button type="button" class="pop-close-btn" title="Close"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div style="padding:12px 18px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--ios-sep);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="gallery-location-label">Workspace</span>
        <input type="text" id="galleryDirPathInput" value="" readonly style="flex:1;min-width:150px;background:rgba(0,0,0,0.25);border:1px solid var(--ios-sep);border-radius:8px;padding:6px 10px;color:var(--text-main);font-size:12px">
        <button type="button" class="blend-chip" id="pickDirFolderBtn">Choose folder</button>
        <button type="button" class="blend-chip active" id="quickSaveCurrentToGalleryBtn">Save project</button>
      </div>
      <div class="gallery-grid-heading"><strong>Recent projects</strong><span id="galleryProjectCount">0 artworks</span></div><div id="galleryGridContainer" class="gallery-project-grid"></div>
    </div>
  `;
  document.body.appendChild(galleryModal);
  galleryModal.addEventListener('click', e => { if (e.target === galleryModal) galleryModal.style.display = 'none'; });
  document.addEventListener('keydown', e => {if(e.key==='Escape'){ galleryModal.style.display='none'; const recovery=$('recoveryHistoryModal'); if(recovery) recovery.style.display='none'; }});

  const recoveryModal = document.createElement('div');
  recoveryModal.id = 'recoveryHistoryModal';
  Object.assign(recoveryModal.style, {
    position: 'fixed', inset: '0', zIndex: '99992', background: 'rgba(0,0,0,0.78)',
    backdropFilter: 'blur(10px)', display: 'none', alignItems: 'center', justifyContent: 'center'
  });
  recoveryModal.innerHTML = `
    <div style="background:var(--ios-sheet);border:1px solid var(--ios-sep);border-radius:18px;width:700px;max-width:94vw;max-height:85vh;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;overflow:hidden">
      <div class="ios-sheet-header" style="padding:14px 18px;border-bottom:1px solid var(--ios-sep);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:14.5px;font-weight:700;color:var(--text-main)">Recovery history</span>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="blend-chip active" id="createManualCheckpointBtn">Create checkpoint</button>
          <button type="button" class="pop-close-btn" title="Close"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div style="padding:10px 18px;font-size:12px;color:var(--text-sub);border-bottom:1px solid var(--ios-sep)">
        WinCreate automatically saves recovery snapshots while you draw so you never lose work. Tap any version below to restore it.
      </div>
      <div id="recoveryGridContainer" style="padding:18px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(170px, 1fr));gap:14px;flex:1;touch-action:pan-y"></div>
    </div>
  `;
  document.body.appendChild(recoveryModal);
  recoveryModal.addEventListener('click', e => { if (e.target === recoveryModal) recoveryModal.style.display = 'none'; });

  function setSafeThumbnail(card,item) {
    const image=card.querySelector('.safe-gallery-thumbnail');
    if(!image)return;
    image.src='favicon.svg';
    try { const info=WCGuard.pngInfo(item.dataUrl); if(info.w*info.h<=1048576 && item.dataUrl.length<=2000000)image.src=item.dataUrl; } catch {}
  }

  function renderRecoveryCheckpointsGrid() {
    const grid = recoveryModal.querySelector('#recoveryGridContainer');
    if (!grid) return;
    grid.innerHTML = '';
    if (recoveryCheckpointsList.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--text-sub);font-size:13px">No recovery checkpoints yet. Draw on the canvas or tap <strong>"+ Create Checkpoint Now"</strong>!</div>`;
      return;
    }
    recoveryCheckpointsList.forEach(item => {
      const card = document.createElement('div');
      Object.assign(card.style, { position: 'relative', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ios-sep)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer' });
      card.innerHTML = `
        <div style="height:110px;background:#090a0f;display:flex;align-items:center;justify-content:center">
          <img class="safe-gallery-thumbnail" style="width:100%;height:100%;object-fit:contain">
        </div>
        <div style="padding:10px;display:flex;flex-direction:column;gap:3px">
          <strong style="font-size:11.5px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeMarkup(item.reason || 'Auto-Checkpoint')}</strong>
          <span style="font-size:10px;color:#a5b4fc">${escapeMarkup(item.date)}</span>
        </div>
      `;
      setSafeThumbnail(card,item);
      card.onclick = () => openSavedArtworkEntry(item);
      grid.appendChild(card);
    });
  }

  recoveryModal.querySelector('#createManualCheckpointBtn').onclick = () => {
    createRecoveryCheckpoint('Manual Snapshot');
    app.msg('Recovery Checkpoint Created');
  };

  if ($('recoveryStatusBtn')) {
    $('recoveryStatusBtn').onclick = () => {
      app.closePops();
      renderRecoveryCheckpointsGrid();
      recoveryModal.style.display = 'flex';
    };
  }
  if ($('setupViewCheckpointsBtn')) {
    $('setupViewCheckpointsBtn').onclick = () => {
      renderRecoveryCheckpointsGrid();
      recoveryModal.style.display = 'flex';
    };
  }
  galleryModal.querySelector('#galleryOpenRecoveryBtn').onclick = () => {
    galleryModal.style.display = 'none';
    renderRecoveryCheckpointsGrid();
    recoveryModal.style.display = 'flex';
  };

  galleryModal.querySelector('#galleryNewCanvasBtn').onclick = () => {
    galleryModal.style.display = 'none';
    renderSetupSavedArtworksSection();
    app.goToPage('pageSetup');
  };

  galleryModal.querySelector('#quickSaveCurrentToGalleryBtn').onclick = () => {
    saveProjectNative(true);
  };

  const escapeMarkup = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function renderGalleryGrid() {
    const grid = galleryModal.querySelector('#galleryGridContainer');
    if (!grid) return;
    grid.innerHTML = '';
    const countEl = galleryModal.querySelector('#galleryProjectCount');
    if(countEl) countEl.textContent=`${savedArtworksList.length} artwork${savedArtworksList.length===1?'':'s'}`;
    if (savedArtworksList.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-sub);font-size:13px">No projects saved yet. Create artwork, then choose <strong>Save project</strong> to see it here.</div>`;
      return;
    }
    savedArtworksList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'gallery-card gallery-project-card';
      const resLabel = (Number.isFinite(+item.width) && Number.isFinite(+item.height) && +item.width>0 && +item.height>0) ? `${Math.round(+item.width)}×${Math.round(+item.height)}px` : 'Saved';
      Object.assign(card.style, { position: 'relative', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ios-sep)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer' });
      card.innerHTML = `
        <div style="height:115px;background:#111;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative">
          <img class="safe-gallery-thumbnail" alt="Artwork preview" style="width:100%;height:100%;object-fit:contain;background:#090a0f">
          <button type="button" class="saved-del-btn" title="Delete">✕</button>
        </div>
        <div style="padding:10px;display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
            <strong style="font-size:12px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeMarkup(item.title)}</strong>
            <span style="font-size:10px;color:#a5b4fc;font-family:ui-monospace,monospace">${resLabel}</span>
          </div>
          <span style="font-size:10px;color:var(--text-sub)">${escapeMarkup(item.date)}</span>
        </div>
      `;
      card.querySelector('.saved-del-btn').onclick = ev => deleteSavedArtworkEntry(item.id, ev);
      setSafeThumbnail(card,item);
      card.onclick = () => openSavedArtworkEntry(item);
      grid.appendChild(card);
    });
  }

  function openArtGalleryModal() {
    renderGalleryGrid();
    updateDirectoryPathUI();
    galleryModal.style.display = 'flex';
  }

  if ($('openGalleryBtn')) {
    $('openGalleryBtn').onclick = () => {
      app.closePops();
      openArtGalleryModal();
    };
  }

  galleryModal.querySelector('#pickDirFolderBtn').onclick = pickStorageDirectory;
  if ($('setupBrowseDirBtn')) $('setupBrowseDirBtn').onclick = pickStorageDirectory;

  loadDirHandleFromDB();
  loadAllArtworksFromDB();

  // =========================================================================
  // 3. Dedicated Canvas Size, Color & Surface Studio Popover
  // =========================================================================
  app.registerPopover({
    name: 'canvasSetup',
    title: 'Canvas Size & Color Studio',
    width: 350,
    left: '16px',
    top: '64px',
    html: `
      <div class="settings-group">
        <div class="settings-group-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Canvas Dimensions</span>
          <span id="csCurrentResBadge" style="font-family:ui-monospace,monospace;color:#a5b4fc;font-size:10.5px">1920×1080</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center">
          <div style="display:flex;flex-direction:column;gap:3px">
            <small style="font-size:10px;color:var(--text-sub)">Width (px)</small>
            <input type="number" id="csWidthInput" class="ai-prompt-input" min="200" max="4096" value="1920" style="text-align:center;font-weight:700">
          </div>
          <button type="button" class="blend-chip" id="csSwapDimBtn" title="Swap Width & Height" style="margin-top:14px;padding:6px 8px">⇄</button>
          <div style="display:flex;flex-direction:column;gap:3px">
            <small style="font-size:10px;color:var(--text-sub)">Height (px)</small>
            <input type="number" id="csHeightInput" class="ai-prompt-input" min="200" max="4096" value="1080" style="text-align:center;font-weight:700">
          </div>
        </div>
        <div class="ios-blend-pills" id="csQuickResPills" style="flex-wrap:wrap">
          <button type="button" class="blend-chip" data-w="screen" data-h="screen">Fullscreen</button>
          <button type="button" class="blend-chip" data-w="1080" data-h="1080">1:1 Square</button>
          <button type="button" class="blend-chip" data-w="1920" data-h="1080">16:9 HD</button>
          <button type="button" class="blend-chip" data-w="1080" data-h="1920">9:16 Vertical</button>
          <button type="button" class="blend-chip" data-w="2480" data-h="3508">A4 Print</button>
          <button type="button" class="blend-chip" data-w="2560" data-h="1440">2K QHD</button>
        </div>
        <div class="setting-row">
          <span>Resize Behavior</span>
          <select class="setting-select" id="csResizeModeSelect">
            <option value="anchor">Keep Artwork Centered</option>
            <option value="stretch">Stretch Artwork to Fit</option>
            <option value="reset">Start Fresh Blank Canvas</option>
          </select>
        </div>
        <button type="button" class="ai-action-btn" id="csApplyResizeBtn">Apply Canvas Size ✓</button>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">Canvas Background Color</div>
        <div class="setting-row">
          <span>Opaque Background</span>
          <button type="button" class="ios-switch on" id="csBgVisSwitch"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>
        </div>
        <div class="setting-row">
          <span>Pick Canvas Color</span>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="color" id="csBgColorPicker" value="#ffffff" style="width:42px;height:28px;border:none;border-radius:6px;background:transparent;cursor:pointer">
            <button type="button" class="blend-chip" id="csUseBrushColBtn">Use Brush Color</button>
          </div>
        </div>
        <div class="ios-blend-pills" id="csSurfaceThemes" style="flex-wrap:wrap">
          <button type="button" class="blend-chip" data-bgcol="#ffffff">Paper White</button>
          <button type="button" class="blend-chip" data-bgcol="#fdf6e3">Warm Cream</button>
          <button type="button" class="blend-chip" data-bgcol="#cbd5e1">Cool Mist</button>
          <button type="button" class="blend-chip" data-bgcol="#334155">Slate Gray</button>
          <button type="button" class="blend-chip" data-bgcol="#11131a">Obsidian</button>
          <button type="button" class="blend-chip" data-bgcol="#000000">OLED Black</button>
        </div>
      </div>

      <button type="button" class="ai-action-btn secondary" id="csOpenFullSetupPageBtn">Open Full Preset &amp; Saved Canvas Screen →</button>
    `,
    onInit(pop) {
      const wInp = pop.querySelector('#csWidthInput');
      const hInp = pop.querySelector('#csHeightInput');
      const badge = pop.querySelector('#csCurrentResBadge');
      const bgPicker = pop.querySelector('#csBgColorPicker');
      const visSwitch = pop.querySelector('#csBgVisSwitch');

      function syncDialogFromState() {
        const st = app.state;
        wInp.value = st.WIDTH;
        hInp.value = st.HEIGHT;
        badge.textContent = `${st.WIDTH}×${st.HEIGHT}px`;
        bgPicker.value = st.bgColor || '#ffffff';
        visSwitch.classList.toggle('on', !!st.bgVisible);
      }

      app.on('canvasInit', syncDialogFromState);app.on('canvasResize',syncDialogFromState);
      syncDialogFromState();

      pop.querySelector('#csSwapDimBtn').onclick = () => {
        const tmp = wInp.value;
        wInp.value = hInp.value;
        hInp.value = tmp;
      };

      pop.querySelectorAll('#csQuickResPills [data-w]').forEach(btn => {
        btn.onclick = () => {
          pop.querySelectorAll('#csQuickResPills .blend-chip').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          wInp.value = btn.dataset.w === 'screen' ? Math.max(320, window.innerWidth) : btn.dataset.w;
          hInp.value = btn.dataset.h === 'screen' ? Math.max(320, window.innerHeight) : btn.dataset.h;
        };
      });

      pop.querySelector('#csApplyResizeBtn').onclick = () => {
        const nw = Math.min(4096, Math.max(200, +wInp.value || app.state.WIDTH));
        const nh = Math.min(4096, Math.max(200, +hInp.value || app.state.HEIGHT));
        const mode = pop.querySelector('#csResizeModeSelect').value;
        if (mode === 'reset') {
          app.initializeStudioCanvas('Custom Canvas', nw, nh, bgPicker.value, true);
        } else if (app.resizeStudioCanvas) {
          app.resizeStudioCanvas(nw, nh, mode, bgPicker.value, visSwitch.classList.contains('on'));
        }
        syncDialogFromState();
        app.closePops();
      };

      visSwitch.onclick = function() {
        this.classList.toggle('on');
        const on = this.classList.contains('on');
        app.setBgColor(app.state.bgColor, on);
        app.msg(on ? 'Backdrop Visible' : 'Transparent Backdrop');
      };

      bgPicker.oninput = e => {
        visSwitch.classList.add('on');
        app.setBgColor(e.target.value, true);
      };

      pop.querySelector('#csUseBrushColBtn').onclick = () => {
        bgPicker.value = app.state.currentColor;
        visSwitch.classList.add('on');
        app.setBgColor(app.state.currentColor, true);
        app.msg('Backdrop Set to Brush Color');
      };

      pop.querySelectorAll('#csSurfaceThemes [data-bgcol]').forEach(btn => {
        btn.onclick = () => {
          const hex = btn.dataset.bgcol;
          bgPicker.value = hex;
          visSwitch.classList.add('on');
          app.setBgColor(hex, true);
          app.msg(`Canvas Color: ${btn.textContent}`);
        };
      });

      pop.querySelector('#csOpenFullSetupPageBtn').onclick = () => {
        app.closePops();
        renderSetupSavedArtworksSection();
        app.goToPage('pageSetup');
      };
    }
  });

  if ($('canvasSetupBtn')) {$('canvasSetupBtn').onclick = () => app.togglePop('canvasSetup');
  }

  // =========================================================================
  // 4. Image Import & .winc Project Serialization
  // =========================================================================
  const imgOpenInput = document.createElement('input');
  imgOpenInput.type = 'file';
  imgOpenInput.accept = 'image/png, image/jpeg, image/webp';
  imgOpenInput.style.display = 'none';
  document.body.appendChild(imgOpenInput);

  imgOpenInput.onchange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 32*1024*1024) {
      app.msg('Choose a PNG, JPG, or WebP image under 32 MB');e.target.value='';return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        if(app.animation?.busy){app.msg('Finish the current operation before importing an image');return;}
        const wasOnSetup = $('pageSetup')?.classList.contains('active');
        if (wasOnSetup) {
          const w = Math.min(4096, Math.max(320, img.width));
          const h = Math.min(4096, Math.max(320, img.height));
          app.initializeStudioCanvas(file.name.replace(/\.[^.]+$/, ''), w, h, '#ffffff', true);
        } else {
          if(!document.body.classList.contains('wc-animation-page'))app.goToPage('pageStudio');
          app.saveFullStateUndo();
        }
        const l = app.createLayer(`Image: ${file.name.slice(0, 14)}`);
        const cw = app.state.WIDTH, ch = app.state.HEIGHT;
        const scaleFit = Math.min(cw / img.width, ch / img.height, 1);
        const dw = Math.round(img.width * scaleFit);
        const dh = Math.round(img.height * scaleFit);
        const dx = Math.round((cw - dw) * 0.5);
        const dy = Math.round((ch - dh) * 0.5);
        l.ctx.save();
        l.ctx.imageSmoothingEnabled = true;
        l.ctx.imageSmoothingQuality = 'high';
        l.ctx.drawImage(img, dx, dy, dw, dh);
        l.ctx.restore();
        l.thumbDirty = true;
        app.renderLayers();
        app.closePops();
        app.markUnsavedChanges();
        app.msg(`Imported Image (${img.width}×${img.height}px)`);
      };
      img.onerror=()=>app.msg('The image could not be decoded');
      img.src = ev.target.result;
    };
    reader.onerror=()=>app.msg('The image could not be read');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const projInput = document.createElement('input');
  projInput.type = 'file';
  projInput.accept = '.winc,application/json';
  projInput.style.display = 'none';
  document.body.appendChild(projInput);

  async function loadProjectFile(file) {
    if(!file||WCGuard.loading)return;
    try{const proj=await WCGuard.decodeProject(file);await openSavedArtworkEntry({...proj,id:'art_'+Date.now(),title:file.name.replace(/\.winc$/i,'')});}
    catch(err){console.error('Project load rejected:',err.message);app.msg(err.message);}
  }

  projInput.onchange = e => {
    if (e.target.files?.[0]) loadProjectFile(e.target.files[0]);
    e.target.value = '';
  };

  ['setupOpenProjectBtn', 'setupOpenWincBtn'].forEach(id => {
    if ($(id))$(id).onclick = () => projInput.click();
  });
  ['setupOpenImageBtn', 'setupImportImgBtn'].forEach(id => {
    if ($(id))$(id).onclick = () => imgOpenInput.click();
  });

  // =========================================================================
  // 5. Custom Brush Creator & Built-in Extra Brushes / Shapes
  // =========================================================================
  const STORAGE_KEY = 'wincreate_custom_brushes_v1';
  let savedCustomBrushes = [], pendingTipCanvas = null;

  function createAlphaMaskFromSource(source, invertMask = false) {
    const size = 128, c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size), d = imgData.data;
    let hasTrans = false; for (let i = 3; i < d.length; i += 16) if (d[i] < 240) { hasTrans = true; break; }
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let alpha = hasTrans ? d[i + 3] : (255 - luma);
      if (invertMask) alpha = 255 - alpha;
      const px = (i / 4) % size, py = Math.floor((i / 4) / size), dist = Math.hypot(px - size / 2, py - size / 2) / (size / 2);
      const fade = dist > 0.92 ? Math.max(0, (1 - dist) / 0.08) : 1;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = Math.max(0, Math.min(255, Math.round(alpha * fade)));
    }
    ctx.putImageData(imgData, 0, 0); return c;
  }

  function registerImageBrush({ id, name, category = 'Custom', spacing = 0.08, alpha = 0.95, scatter = 0, rotateJitter = true, maskDataUrl }) {
    if(typeof maskDataUrl!=='string'||maskDataUrl.length>300000)return;try{const info=WCGuard.pngInfo(maskDataUrl);if(info.w>512||info.h>512)return;}catch(_){return;}
    id=String(id||'custom').slice(0,100);name=String(name||'Custom brush').slice(0,100);category=String(category||'Custom').slice(0,100);if(['__proto__','prototype','constructor'].includes(category))return;
    spacing=Math.max(.01,Math.min(1,+spacing||.08));alpha=Math.max(0,Math.min(1,+alpha||.95));scatter=Math.max(0,Math.min(1,+scatter||0));
    const maskImg = new Image(), tintCache = document.createElement('canvas');
    tintCache.width = 128; tintCache.height = 128;
    const tintCtx = tintCache.getContext('2d');
    let lastCol = null, loaded = false;
    maskImg.onload = () => { loaded = true; lastCol = null; }; maskImg.src = maskDataUrl;
    app.registerBrush(category, { id, name, spacing: +spacing, alpha: +alpha }, (ctx, x, y, r, color) => {
      if (!loaded) return;
      if (lastCol !== color) {
        tintCtx.clearRect(0, 0, 128, 128); tintCtx.drawImage(maskImg, 0, 0, 128, 128);
        tintCtx.globalCompositeOperation = 'source-in'; tintCtx.fillStyle = color; tintCtx.fillRect(0, 0, 128, 128);
        tintCtx.globalCompositeOperation = 'source-over'; lastCol = color;
      }
      const jx = scatter > 0 ? (Math.random() - 0.5) * r * scatter * 3 : 0, jy = scatter > 0 ? (Math.random() - 0.5) * r * scatter * 3 : 0;
      ctx.save(); ctx.translate(x + jx, y + jy); if (rotateJitter) ctx.rotate(Math.random() * Math.PI * 2);
      ctx.drawImage(tintCache, -r, -r, r * 2, r * 2); ctx.restore();
    });
  }

  try { savedCustomBrushes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); savedCustomBrushes.forEach(registerImageBrush); } catch (_) { savedCustomBrushes = []; }

  app.registerPopover({
    name: 'brushImport', title: 'Custom Brush Creator', width: 340, left: '210px', top: '64px',
    html: `
      <input type="file" id="customBrushImgInput" accept="image/*" style="display:none">
      <div class="settings-group">
        <div class="settings-group-title">1. Tip Source &amp; Dynamics</div>
        <div style="display:flex;gap:10px;align-items:center">
          <canvas id="brushTipPreviewCanvas" width="64" height="64" style="width:64px;height:64px;border-radius:10px;background:#0d0f17;border:1px solid var(--accent-border)"></canvas>
          <div style="display:flex;flex-direction:column;gap:6px;flex:1">
            <button type="button" class="ai-action-btn" id="uploadBrushImgBtn" style="padding:6px 10px">Upload PNG / JPG</button>
            <button type="button" class="ai-action-btn secondary" id="captureLayerTipBtn" style="padding:6px 10px">Capture Active Layer</button>
          </div>
        </div>
        <div class="setting-row"><span>Invert Mask</span><button type="button" class="ios-switch" id="invertBrushMaskSwitch"></button></div>
        <div class="setting-row"><span>Name</span><input type="text" class="ai-prompt-input" id="newBrushNameInput" value="Custom Nib" style="width:150px;padding:5px 8px"></div>
        <div class="setting-row"><span>Spacing (<span id="cbSpacingLbl">12%</span>)</span><input type="range" id="cbSpacingSlider" min="3" max="80" value="12" style="width:120px;accent-color:var(--ios-blue)"></div>
        <div class="setting-row"><span>Scatter (<span id="cbScatterLbl">0%</span>)</span><input type="range" id="cbScatterSlider" min="0" max="100" value="0" style="width:120px;accent-color:var(--ios-blue)"></div>
        <button type="button" class="ai-action-btn" id="saveCustomBrushBtn">Save to Brush Library</button>
      </div>`,
    onInit(pop) {
      const prevCtx = pop.querySelector('#brushTipPreviewCanvas').getContext('2d');
      let rawCanvas = document.createElement('canvas'); rawCanvas.width = 128; rawCanvas.height = 128;
      const rCtx = rawCanvas.getContext('2d'), g = rCtx.createRadialGradient(64, 64, 4, 64, 64, 52);
      g.addColorStop(0, '#000'); g.addColorStop(1, 'transparent'); rCtx.fillStyle = g; rCtx.beginPath(); rCtx.arc(64, 64, 52, 0, Math.PI * 2); rCtx.fill();
      function refresh() {
        pendingTipCanvas = createAlphaMaskFromSource(rawCanvas, pop.querySelector('#invertBrushMaskSwitch').classList.contains('on'));
        prevCtx.clearRect(0, 0, 64, 64); prevCtx.drawImage(pendingTipCanvas, 0, 0, 64, 64);
      }
      refresh();
      pop.querySelector('#uploadBrushImgBtn').onclick = () => pop.querySelector('#customBrushImgInput').click();
      pop.querySelector('#customBrushImgInput').onchange = e => {
        const f = e.target.files?.[0]; if (!f) return;
        const r = new FileReader(); r.onload = ev => { const img = new Image(); img.onload = () => { rawCanvas.getContext('2d').clearRect(0, 0, 128, 128); rawCanvas.getContext('2d').drawImage(img, 0, 0, 128, 128); refresh(); }; img.src = ev.target.result; }; r.readAsDataURL(f);
      };
      pop.querySelector('#captureLayerTipBtn').onclick = () => { const l = app.getActiveLayer(); if (!l) return; rawCanvas.getContext('2d').clearRect(0, 0, 128, 128); rawCanvas.getContext('2d').drawImage(l.canvas, 0, 0, 128, 128); refresh(); app.msg('Captured Layer as Tip'); };
      pop.querySelector('#invertBrushMaskSwitch').onclick = function() { this.classList.toggle('on'); refresh(); };
      pop.querySelector('#cbSpacingSlider').oninput = e => pop.querySelector('#cbSpacingLbl').textContent = e.target.value + '%';
      pop.querySelector('#cbScatterSlider').oninput = e => pop.querySelector('#cbScatterLbl').textContent = e.target.value + '%';
      pop.querySelector('#saveCustomBrushBtn').onclick = () => {
        const cfg = { id: 'custom_' + Date.now(), name: (pop.querySelector('#newBrushNameInput').value || 'Custom').trim(), category: 'Custom', spacing: (+pop.querySelector('#cbSpacingSlider').value) / 100, alpha: 0.95, scatter: (+pop.querySelector('#cbScatterSlider').value) / 100, rotateJitter: true, maskDataUrl: pendingTipCanvas.toDataURL('image/png') };
        savedCustomBrushes.push(cfg); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCustomBrushes)); } catch (_) {}
        registerImageBrush(cfg); activeSet = 'Custom'; toolBrushes.brush = BRUSHES.Custom[BRUSHES.Custom.length - 1]; renderBrushLibrary(); app.togglePop('brush'); app.msg(`Saved "${cfg.name}"`);
      };
    }
  });

  const bh = document.querySelector('#brushPopover .ios-sheet-header > div');
  if (bh) { const b = document.createElement('button'); b.type = 'button'; b.className = 'blend-chip active'; b.textContent = '+ New Tip'; b.onclick = e => { e.stopPropagation(); app.togglePop('brushImport'); }; bh.insertBefore(b, bh.firstChild); }

  app.registerBrush('FX Glow', { id: 'neon_laser', name: 'Neon Laser', spacing: 0.06, alpha: 0.95, stream: 40, taper: 15 }, (ctx, x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 1.6); g.addColorStop(0, '#fff'); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
  });
  app.registerBrush('Painting', { id: 'watercolor_wash', name: 'Watercolor Wash', spacing: 0.12, alpha: 0.22, stream: 25, taper: 10 }, (ctx, x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.35); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.fill();
  });

  app.registerShape('spiral', 'Spiral', ({ cx, cy, rx, ry }) => { const pts = []; for (let t = 0; t <= Math.PI * 6; t += 0.1) { const f = t / (Math.PI * 6); pts.push({ x: cx + Math.cos(t) * rx * f, y: cy + Math.sin(t) * ry * f }); } return pts; });
  app.registerShape('gear', 'Gear', ({ cx, cy, rx, ry }) => { const pts = [], teeth = 12; for (let i = 0; i <= teeth * 2; i++) { const a = (i * Math.PI) / teeth, m = i % 2 === 0 ? 1 : 0.78; pts.push({ x: cx + Math.cos(a) * rx * m, y: cy + Math.sin(a) * ry * m }); } return pts; });

  // =========================================================================
  // 6. Typography, Reference PiP, Liquify, Selection & Layer Transform Studios
  // =========================================================================
  app.registerPopover({
    name: 'textStudio', title: 'Typography Studio', width: 300, left: '240px', top: '64px',
    html: `<div class="settings-group"><input type="text" class="ai-prompt-input" id="stampTextInput" value="WinCreate Studio"><div class="setting-row"><span>Size (<span id="stampSizeLbl">72px</span>)</span><input type="range" id="stampSizeSlider" min="18" max="220" value="72" style="width:120px;accent-color:var(--ios-blue)"></div><button type="button" class="ai-action-btn" id="stampTextCommitBtn">Stamp Text to Layer</button></div>`,
    onInit(pop) {
      pop.querySelector('#stampSizeSlider').oninput = e => pop.querySelector('#stampSizeLbl').textContent = e.target.value + 'px';
      pop.querySelector('#stampTextCommitBtn').onclick = () => {
        const txt = pop.querySelector('#stampTextInput').value || 'WinCreate', sz = +pop.querySelector('#stampSizeSlider').value || 72;
        app.saveFullStateUndo(); const l = app.createLayer(`Text: ${txt.slice(0, 10)}`);
        l.ctx.save(); l.ctx.font = `800 ${sz}px Inter, system-ui, sans-serif`; l.ctx.textAlign = 'center'; l.ctx.textBaseline = 'middle'; l.ctx.fillStyle = app.state.currentColor;
        l.ctx.fillText(txt, app.state.WIDTH / 2, app.state.HEIGHT / 2); l.ctx.restore(); l.thumbDirty = true; app.renderLayers();app.markUnsavedChanges(); app.closePops(); app.msg('Stamped Text Layer');
      };
    }
  });
  app.registerToolbarButton({
    bar: 'topLeftBar',
    id: 'textStudioBtn',
    label: '<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg><span>Text</span>',
    title: 'Typography Studio',
    onClick: () => app.togglePop('textStudio')
  });

  const refWin = document.createElement('div'); refWin.id = 'floatingRefWindow'; refWin.className = 'floating-ui';
  Object.assign(refWin.style, { top: '76px', left: '76px', width: '226px', background: 'var(--ios-sheet)', backdropFilter: 'blur(var(--ui-blur))', boxShadow: 'var(--specular),var(--shadow-soft)', borderRadius: '14px', padding: '10px', display: 'none', flexDirection: 'column', gap: '8px', zIndex: '175', transformOrigin: 'top left', transform: 'scale(var(--ui-scale))' });
  refWin.innerHTML = `<input type="file" id="pipRefInput" accept="image/*" style="display:none"><div style="display:flex;justify-content:space-between;align-items:center;cursor:grab" class="pip-header"><span style="font-size:11.5px;font-weight:700;color:#a5b4fc">⋮⋮ Reference PiP</span><div style="display:flex;gap:4px"><button type="button" class="blend-chip" id="pipLoadBtn" style="padding:2px 7px;font-size:10px">+ Load</button><button type="button" class="pop-close-btn" style="width:24px;height:24px">✕</button></div></div><canvas id="pipRefCanvas" width="206" height="145" style="border-radius:8px;cursor:var(--cursor-crosshair);width:100%;height:145px;background:#090a0f"></canvas>`;
  $('pageStudio').appendChild(refWin); makeElementDraggable(refWin, '.pip-header');
  const pipCanvas = refWin.querySelector('#pipRefCanvas'), pipCtx = pipCanvas.getContext('2d', { willReadFrequently: true });
  const pg = pipCtx.createLinearGradient(0, 0, 206, 145); pg.addColorStop(0, '#4f46e5'); pg.addColorStop(0.5, '#ec4899'); pg.addColorStop(1, '#f59e0b'); pipCtx.fillStyle = pg; pipCtx.fillRect(0, 0, 206, 145);
  refWin.querySelector('#pipLoadBtn').onclick = () => refWin.querySelector('#pipRefInput').click();
  refWin.querySelector('#pipRefInput').onchange = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { const img = new Image(); img.onload = () => { pipCtx.clearRect(0, 0, 206, 145); pipCtx.drawImage(img, 0, 0, 206, 145); }; img.src = ev.target.result; }; r.readAsDataURL(f); };
  pipCanvas.addEventListener('pointerdown', e => { e.stopPropagation(); const rect = pipCanvas.getBoundingClientRect(), d = pipCtx.getImageData(Math.floor(((e.clientX - rect.left) / rect.width) * pipCanvas.width), Math.floor(((e.clientY - rect.top) / rect.height) * pipCanvas.height), 1, 1).data; app.setColor('#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')); });
  app.registerToolbarButton({
    bar: 'topLeftBar',
    id: 'pipRefToggleBtn',
    label: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="9" width="8" height="6" rx="1"/></svg><span>Ref</span>',
    title: 'Reference Companion',
    onClick: () => refWin.style.display = refWin.style.display !== 'flex' ? 'flex' : 'none'
  });

  let liqMode = 'off', liqRad = 65, liqStr = 0.55, isLiq = false, lastLiq = null;
  app.registerPopover({
    name: 'liquifyStudio', title: 'Liquify & Warp Studio', width: 300, left: '220px', top: '64px',
    html: `<div class="settings-group"><div class="ios-blend-pills" id="liqModePills"><button type="button" class="blend-chip active" data-lmode="off">Off</button><button type="button" class="blend-chip" data-lmode="push">Push</button><button type="button" class="blend-chip" data-lmode="twirl">Twirl</button><button type="button" class="blend-chip" data-lmode="pinch">Pinch</button><button type="button" class="blend-chip" data-lmode="bloat">Expand</button></div><div class="setting-row"><span>Radius (<span id="liqRadLbl">65px</span>)</span><input type="range" id="liqRadSlider" min="20" max="180" value="65" style="width:120px;accent-color:var(--ios-blue)"></div></div>`,
    onInit(pop) {
      pop.querySelectorAll('[data-lmode]').forEach(btn => btn.onclick = () => { if(btn.dataset.lmode!=='off')releaseEditingModes();liqMode = btn.dataset.lmode;app.editingMode=liqMode==='off'?null:'liquify'; pop.querySelectorAll('[data-lmode]').forEach(b => b.classList.remove('active')); btn.classList.add('active'); $('liquifyToolBtn')?.classList.toggle('active', liqMode !== 'off'); app.msg(`Liquify: ${liqMode.toUpperCase()}`); });
      pop.querySelector('#liqRadSlider').oninput = e => { liqRad = +e.target.value; pop.querySelector('#liqRadLbl').textContent = liqRad + 'px'; };
    }
  });
  function stepLiquify(layer, cx, cy, dx, dy) {
    if (!layer || layer.isFolder) return;
    const W = app.state.WIDTH, H = app.state.HEIGHT;
    const r = liqRad, x0 = Math.max(0, Math.floor(cx - r)), y0 = Math.max(0, Math.floor(cy - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w <= 2 || h <= 2) return;
    const src = layer.ctx.getImageData(x0, y0, w, h).data, outImg = layer.ctx.createImageData(w, h), dst = outImg.data; dst.set(src);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const wx = x0 + px - cx, wy = y0 + py - cy, dist = Math.hypot(wx, wy); if (dist >= r) continue;
      const f = Math.pow(1 - dist / r, 2) * liqStr; let sx = px, sy = py;
      if (liqMode === 'push') { sx = px - dx * f; sy = py - dy * f; }
      else if (liqMode === 'twirl') { const a = f * 0.45; sx = (wx * Math.cos(a) - wy * Math.sin(a)) + (cx - x0); sy = (wx * Math.sin(a) + wy * Math.cos(a)) + (cy - y0); }
      else if (liqMode === 'pinch') { sx = px + wx * f * 0.35; sy = py + wy * f * 0.35; }
      else if (liqMode === 'bloat') { sx = px - wx * f * 0.35; sy = py - wy * f * 0.35; }
      const sIdx = (Math.max(0, Math.min(h - 1, Math.round(sy))) * w + Math.max(0, Math.min(w - 1, Math.round(sx)))) * 4, dIdx = (py * w + px) * 4;
      dst[dIdx] = src[sIdx]; dst[dIdx + 1] = src[sIdx + 1]; dst[dIdx + 2] = src[sIdx + 2]; dst[dIdx + 3] = src[sIdx + 3];
    }
    layer.ctx.putImageData(outImg, x0, y0);
    layer.thumbDirty = true;
  }
  viewportEl.addEventListener('pointerdown', e => { if (liqMode === 'off' || touchPinchDist > 0 || e.target.closest('.floating-ui,.popover,.ios-layer-menu-sheet')) return; e.stopImmediatePropagation(); e.preventDefault(); app.saveUndo();app.flattenVectorLayer(app.getActiveLayer()); isLiq = true; lastLiq = getCanvasPoint(e); stepLiquify(app.getActiveLayer(), lastLiq.x, lastLiq.y, 0, 0); }, true);
  window.addEventListener('pointermove', e => { if (!isLiq || liqMode === 'off') return; e.stopImmediatePropagation(); const pt = getCanvasPoint(e); stepLiquify(app.getActiveLayer(), pt.x, pt.y, pt.x - lastLiq.x, pt.y - lastLiq.y); lastLiq = pt; }, true);
  window.addEventListener('pointerup', () => { if (isLiq) { isLiq = false;app.markUnsavedChanges(); app.renderLayers(); } }, true);
  app.registerToolbarButton({
    bar: 'topLeftBar',
    id: 'liquifyToolBtn',
    label: '<svg viewBox="0 0 24 24"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg><span>Liquify</span>',
    title: 'Liquify & Warp',
    onClick: () => app.togglePop('liquifyStudio')
  });

  const selCanvas = document.createElement('canvas');
  selCanvas.style.zIndex = 970;
  const selCtx = selCanvas.getContext('2d');
  board.insertBefore(selCanvas, shapeEditOverlay);
  let selMode = 'off', isSelecting = false, selPts = [], antOffset = 0, hasActiveSelection = false;
  let selectionPointer=null,selectionMap=null,previousSelection=null,lastRawPoint=null;

  function syncSelectionCanvasSize() {
    selCanvas.width = app.state.WIDTH;
    selCanvas.height = app.state.HEIGHT;
  }
  syncSelectionCanvasSize();
  app.on('canvasInit', () => { syncSelectionCanvasSize(); clearSelectionMask(); });app.on('canvasResize',()=>{releaseEditingModes();syncSelectionCanvasSize();clearSelectionMask();});

  let antsFrame=0,antsLast=0;
  function startAnts(){if(!antsFrame&&hasActiveSelection&&app.selectionPath&&!document.hidden)antsFrame=requestAnimationFrame(renderMarchingAnts);}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(antsFrame);antsFrame=0;antsLast=0;}else startAnts();});
  function clearSelectionMask() {
    cancelAnimationFrame(antsFrame);antsFrame=0;antsLast=0;
    hasActiveSelection = false;
    app.selectionPath = null;app.selectionPoints=null;
    selPts = [];
    selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
  }

  function renderMarchingAnts(now) {
    antsFrame=0;if(document.hidden||!hasActiveSelection||!app.selectionPath)return;
    if (!antsLast||now-antsLast+.5>=Math.max(1000/30,window.WCPerf?.interval()||0)) {
      antsLast=now;
      selCtx.clearRect(0, 0, selCanvas.width, selCanvas.height);
      selCtx.save();
      selCtx.lineWidth = Math.max(1.2, 1.5 / app.state.scale);
      selCtx.strokeStyle = '#ffffff';
      selCtx.stroke(app.selectionPath);
      selCtx.setLineDash([6, 6]);
      selCtx.lineDashOffset = -antOffset;
      selCtx.strokeStyle = '#6366f1';
      selCtx.stroke(app.selectionPath);
      selCtx.restore();
      antOffset = (antOffset + 0.4) % 12;
    }
    startAnts();
  }

  app.registerPopover({
    name: 'selectionStudio', title: 'Selection Mask Studio', width: 290, left: '260px', top: '64px',
    html: `
      <div class="settings-group">
        <div class="settings-group-title">Selection Mode</div>
        <div class="ios-blend-pills" id="selModePills">
          <button type="button" class="blend-chip active" data-smode="off">Paint (Off)</button>
          <button type="button" class="blend-chip" data-smode="lasso">Freehand Lasso</button>
          <button type="button" class="blend-chip" data-smode="magnetic">Magnetic Lasso</button>
          <button type="button" class="blend-chip" data-smode="rect">Rect Marquee</button>
        </div>
        <label class="setting-row"><span>Edge source</span><select id="selectionEdgeSource" class="setting-select"><option value="drawing">Visible drawing</option><option value="active">Selected layer</option><option value="reference">Reference image</option></select></label>
        <label class="setting-row"><span>Snap radius (<span id="selectionRadiusLabel">14</span> px)</span><input type="range" id="selectionSnapRadius" min="4" max="48" value="14"></label>
        <label class="setting-row"><span>Edge sensitivity</span><input type="range" id="selectionEdgeSensitivity" min="10" max="95" value="70"></label>
        <p class="settings-note">Magnetic Lasso: drag near the outline to snap to nearby edges, then release to close the selection. Where no edge is found, it follows your hand. Draw close to the boundary; use Freehand for faint or crowded details.</p>
        <button type="button" class="ai-action-btn secondary" id="selectionInkSettingsBtn">Background &amp; Transparent Ink…</button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
          <button type="button" class="ai-action-btn secondary" id="fillSelectionBtn">Fill Mask</button>
          <button type="button" class="ai-action-btn secondary" id="clearSelectionBtn" style="color:var(--ios-red)">Deselect</button>
        </div>
      </div>`,
    onInit(pop) {
      pop.querySelectorAll('[data-smode]').forEach(btn => {
        btn.onclick = () => {
          if(btn.dataset.smode!=='off')releaseEditingModes();selMode = btn.dataset.smode;app.editingMode=selMode==='off'?null:'selection';
          pop.querySelectorAll('[data-smode]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          $('selectToolBtn')?.classList.toggle('active', selMode !== 'off');
          app.msg(selMode === 'off' ? 'Selection Tool Off' : `Selection: ${selMode.toUpperCase()}`);
        };
      });
      pop.querySelector('#selectionSnapRadius').oninput=e=>$('selectionRadiusLabel').textContent=e.target.value;
      pop.querySelector('#selectionInkSettingsBtn').onclick=()=>{app.closePops(true);app.togglePop('trace');};
      pop.querySelector('#fillSelectionBtn').onclick = () => $('mFill')?.click();
      pop.querySelector('#clearSelectionBtn').onclick = () => {
        releaseEditingModes();clearSelectionMask();
        selMode = 'off';
        pop.querySelectorAll('[data-smode]').forEach(b => b.classList.toggle('active', b.dataset.smode === 'off'));
        $('selectToolBtn')?.classList.remove('active');
        app.msg('Selection Cleared');
      };
    }
  });

  // A visible painter tool must own the next stroke, even after a modal
  // selection/liquify tool was armed. Preserve the existing selection mask.
  function releaseEditingModes(){
    if(isSelecting&&previousSelection){app.selectionPath=previousSelection.path;app.selectionPoints=previousSelection.points;hasActiveSelection=!!app.selectionPath;startAnts();selCtx.clearRect(0,0,selCanvas.width,selCanvas.height);}
    selectionPointer=null;selectionMap=null;previousSelection=null;lastRawPoint=null;
    liqMode='off';isLiq=false;selMode='off';isSelecting=false;app.editingMode=null;
    for(const [name,attr] of [['liquifyStudio','lmode'],['selectionStudio','smode']])
      document.querySelectorAll(`#${name}Popover [data-${attr}]`).forEach(b=>b.classList.toggle('active',b.dataset[attr]==='off'));
    $('liquifyToolBtn')?.classList.remove('active');$('selectToolBtn')?.classList.remove('active');
  }
  app.on('toolChange',releaseEditingModes);app.on('canvasInit',()=>{releaseEditingModes();clearSelectionMask();});
  window.addEventListener('pointercancel',()=>{if(isLiq){app.markUnsavedChanges();app.renderLayers();}releaseEditingModes();},true);

  function selectionPoint(e){const p=getCanvasPoint(e);return {x:Math.max(0,Math.min(app.state.WIDTH,p.x)),y:Math.max(0,Math.min(app.state.HEIGHT,p.y))};}
  function snappedPoint(p){return selMode==='magnetic'?app.edgeSelection.snap(selectionMap,p,+$('selectionSnapRadius').value/app.state.scale,Math.max(8,(100-(+$('selectionEdgeSensitivity').value))*.8)):p;}
  function publishSelection(){
    if(selPts.length<2)return;
    const path=new Path2D(),pt=selPts[selPts.length-1],p0=selPts[0];
    const points=selMode==='rect'?[p0,{x:pt.x,y:p0.y},pt,{x:p0.x,y:pt.y}]:selPts;
    points.forEach((p,i)=>i?path.lineTo(p.x,p.y):path.moveTo(p.x,p.y));path.closePath();
    app.selectionPoints=points.map(p=>({x:p.x,y:p.y}));app.selectionPath=path;hasActiveSelection=true;startAnts();
  }
  function addSelectionPoint(pt){
    if(!lastRawPoint)return;
    if(selMode==='rect'){selPts=[selPts[0],pt];}
    else{
      const dx=pt.x-lastRawPoint.x,dy=pt.y-lastRawPoint.y,d=Math.hypot(dx,dy);
      if(d*app.state.scale<1)return;
      const count=selMode==='magnetic'?Math.min(128,Math.max(1,Math.ceil(d*app.state.scale/3))):1;
      for(let i=1;i<=count;i++){if(selPts.length>=25000)break;const p=snappedPoint({x:lastRawPoint.x+dx*i/count,y:lastRawPoint.y+dy*i/count}),last=selPts[selPts.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>.2)selPts.push(p);}
    }
    lastRawPoint=pt;publishSelection();
  }
  viewportEl.addEventListener('pointerdown', e => {
    if(selMode==='off'||touchPinchDist>0||e.button>0||e.target.closest('.floating-ui,.popover,.ios-layer-menu-sheet'))return;
    e.stopImmediatePropagation();e.preventDefault();
    if(isSelecting){if(e.pointerId!==selectionPointer)releaseEditingModes();return;}
    try{selectionMap=selMode==='magnetic'?app.edgeSelection.buildMap($('selectionEdgeSource').value):null;}
    catch(error){app.msg(error.message);releaseEditingModes();return;}
    previousSelection={path:app.selectionPath,points:app.selectionPoints};selectionPointer=e.pointerId;isSelecting=true;
    lastRawPoint=selectionPoint(e);selPts=[snappedPoint(lastRawPoint)];app.closePops(true);
  },true);
  window.addEventListener('pointermove', e => {
    if(!isSelecting||e.pointerId!==selectionPointer)return;e.stopImmediatePropagation();e.preventDefault();addSelectionPoint(selectionPoint(e));
  },{capture:true,passive:false});
  window.addEventListener('pointerup', e => {
    if(!isSelecting||e.pointerId!==selectionPointer)return;e.stopImmediatePropagation();addSelectionPoint(selectionPoint(e));
    let area=0;for(let i=0,j=selPts.length-1;i<selPts.length;j=i++)area+=selPts[j].x*selPts[i].y-selPts[i].x*selPts[j].y;
    const valid=selMode==='rect'?selPts.length>1&&Math.abs((selPts[1].x-selPts[0].x)*(selPts[1].y-selPts[0].y))>1:Math.abs(area)>2&&selPts.length>=3;
    if(valid){publishSelection();isSelecting=false;previousSelection=null;}
    releaseEditingModes();app.msg(valid?'Active Selection Mask Set':'Selection cancelled: drag around an area.');
  },true);
  window.addEventListener('blur',()=>{if(isSelecting)releaseEditingModes();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&isSelecting)releaseEditingModes();});

  app.registerToolbarButton({
    bar: 'topLeftBar',
    id: 'selectToolBtn',
    label: '<svg viewBox="0 0 24 24"><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/></svg><span>Select</span>',
    title: 'Magnetic Lasso, Freehand & Marquee',
    onClick: () => app.togglePop('selectionStudio')
  });

  // =========================================================================
  // 7. Save Project Native & Actions Menu Items
  // =========================================================================

  async function saveProjectNative(overwrite = true) {
    app.layerMasks?.finish();
    if(isDrawing)finishPointerStroke();
    if(WCGuard.loading){app.msg('Wait for the project to finish opening');return;}
    try {
      if (!overwrite) {
        return await app.exports.save(async () => {
          const entry = await saveCurrentCanvasToGallery();
          const payload = { magic: 'WINCREATE_PROJECT_V1', documentType: entry.documentType,
            width: entry.width, height: entry.height, bgColor: entry.bgColor, bgVisible: entry.bgVisible,
            artworkBrushHistory: entry.artworkBrushHistory || [], animation: entry.animation || null, layers: entry.layers };
          return new Blob([JSON.stringify(payload)], { type: 'application/json' });
        }, (activeSessionBaseName || 'WinCreate-Project') + '.winc', 'files', { mime: 'application/json', description: 'WinCreate Project' });
      }
      const entry = await saveCurrentCanvasToGallery();
      const payload = {
        magic: 'WINCREATE_PROJECT_V1',
        documentType: entry.documentType,
        width: entry.width,
        height: entry.height,
        bgColor: entry.bgColor,
        bgVisible: entry.bgVisible,
        artworkBrushHistory: entry.artworkBrushHistory || [],
        animation: entry.animation || null,
        layers: entry.layers
      };
      const jsonString = JSON.stringify(payload);
      const baseName = entry.fileName || `Artwork_${Date.now()}`;

      if (overwrite && savedDirectoryHandle) {
        const wroteToFolder = await writeDirectlyToSelectedFolder(baseName, jsonString, entry.dataUrl);
        if (wroteToFolder) {
          app.closePops();
          app.msg(`Saved to 📁 ${savedDirectoryHandle.name}/${baseName}`);
          return;
        }
      }

      app.closePops();
      app.msg('Saved to WinCreate Library & Recovery History');
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Save error:', err);
        app.msg('Save failed: ' + err.message);
      }
    }
  }


  app.serializeProject=serializeCurrentArtworkState;app.openProjectData=openSavedArtworkEntry;
  app.saveProjectNative = saveProjectNative;
  app.saveRecoveryCheckpoint = createRecoveryCheckpoint;

  const actPop = $('actionsPopover');
  if (actPop) {
    const openGalleryBtn = document.createElement('button');
    openGalleryBtn.type = 'button';
    openGalleryBtn.className = 'ios-menu-item';
    openGalleryBtn.innerHTML = '<span>Open WinCreate Library &amp; Location...</span><span>🖼️</span>';
    openGalleryBtn.onclick = () => { app.closePops(); openArtGalleryModal(); };

    const openRecoveryBtn = document.createElement('button');
    openRecoveryBtn.type = 'button';
    openRecoveryBtn.className = 'ios-menu-item';
    openRecoveryBtn.innerHTML = '<span>Recovery Checkpoints History...</span><span>🕒</span>';
    openRecoveryBtn.onclick = () => { app.closePops(); renderRecoveryCheckpointsGrid(); recoveryModal.style.display = 'flex'; };

    const setFolderMenuBtn = document.createElement('button');
    setFolderMenuBtn.type = 'button';
    setFolderMenuBtn.className = 'ios-menu-item';
    setFolderMenuBtn.innerHTML = '<span>Set Save Folder Location...</span><span>📁</span>';
    setFolderMenuBtn.onclick = () => { app.closePops(); pickStorageDirectory(); };

    const openImgBtn = document.createElement('button');
    openImgBtn.type = 'button';
    openImgBtn.className = 'ios-menu-item';
    openImgBtn.innerHTML = '<span>Import Photo Layer...</span><span>🖼️</span>';
    openImgBtn.onclick = () => { app.closePops(); imgOpenInput.click(); };

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'ios-menu-item';
    saveBtn.innerHTML = '<span>Save to WinCreate Library (Ctrl+S)</span><span>💾</span>';
    saveBtn.onclick = () => saveProjectNative(true);

    const saveAsBtn = document.createElement('button');
    saveAsBtn.type = 'button';
    saveAsBtn.className = 'ios-menu-item';
    saveAsBtn.innerHTML = '<span>Export .winc Project File...</span><span>📂</span>';
    saveAsBtn.onclick = () => saveProjectNative(false);

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'ios-menu-item';
    loadBtn.innerHTML = '<span>Open .winc Project File...</span><span>📄</span>';
    loadBtn.onclick = () => { app.closePops(); projInput.click(); };

    actPop.appendChild(openGalleryBtn);
    actPop.appendChild(openRecoveryBtn);
    actPop.appendChild(setFolderMenuBtn);
    actPop.appendChild(openImgBtn);
    actPop.appendChild(saveBtn);
    actPop.appendChild(saveAsBtn);
    actPop.appendChild(loadBtn);
  }
});