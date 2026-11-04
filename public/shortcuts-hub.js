/*! WinCreate 6.0 Additive shortcut guide and command launcher. No drawing-engine changes. */
'use strict';
(function () {
  const app = window.WinCreate;
  if (!app || typeof app.getKeyboardShortcuts !== 'function') return;
  const byId = id => document.getElementById(id);
  const FIXED = [
    ['Studio','Artist Studio 6.5','Alt+Shift+U','Brush tuning, blur, masks, guides, animation and files','Fixed'],
    ['Canvas','Increase brush size',']','Brush width', 'Fixed'],
    ['Canvas','Decrease brush size','[','Brush width', 'Fixed'],
    ['Canvas','Zoom in','Ctrl++ / Ctrl+=','Canvas zoom (also Ctrl + mouse wheel)', 'Fixed'],
    ['Canvas','Zoom out','Ctrl+-','Canvas zoom', 'Fixed'],
    ['Canvas','Fit canvas','Ctrl+0','Fit canvas to window', 'Fixed'],
    ['Canvas','Pan canvas','Space + drag','Hold while dragging', 'Gesture'],
    ['Canvas','Pick color','Alt + tap','Pick the pixel color', 'Gesture'],
    ['Canvas','Zoom canvas','Mouse wheel','Outside scrollable panels', 'Gesture'],
    ['Canvas','Rotate canvas','Shift + wheel','Rotate 5° per step', 'Gesture'],
    ['Canvas','Pan / zoom / rotate','Two-finger gesture','Touch screens', 'Gesture'],
    ['Shapes','Confirm editable shape','Enter','When QuickShape editor is active', 'Contextual'],
    ['Shapes','Cancel editable shape','Escape','When QuickShape editor is active', 'Contextual'],
    ['Workspace','Hide or show workspace controls','Shift+H','Drawing workspace; outside DIL fullscreen', 'Fixed'],
    ['Workspace','Fullscreen toggle','F11','Handled in drawing workspace', 'Fixed'],
    ['Workspace','Exit Dynamic Island fullscreen','Ctrl+Shift+D','Only in Dynamic Island fullscreen', 'Contextual'],
    ['Workspace','Exit / cancel','Escape','Depending on active workspace or dialog', 'Contextual'],
    ['Animation','Add drawing frame','N','Only while animation timeline is open', 'Contextual'],
    ['Animation','Duplicate drawing frame','Shift+D','Only while animation timeline is open', 'Contextual'],
    ['Animation','Previous frame',',','Only while animation timeline is open', 'Contextual'],
    ['Animation','Next frame','.','Only while animation timeline is open', 'Contextual'],
    ['Animation','Play or pause','Enter','Only while animation timeline is open', 'Contextual'],
    ['Animation','Stop playback','Escape','Only while animation timeline is open', 'Contextual'],
    ['Mask','Cancel current mask stroke','Escape / Ctrl+Z / Ctrl+Y','Only during an active mask stroke', 'Contextual'],
    ['Mask','Exit mask editing','Escape','Only in mask-edit mode', 'Contextual'],
    ['Discovery','Open full shortcut guide','?','When not typing in a field', 'Fixed'],
    ['Discovery','Search available commands','Ctrl+Shift+K','When not typing in a field', 'Fixed'],
    ['Pro Tools','Open radial QuickMenu','Alt+Shift+Q','Drawing workspace only', 'Fixed']
  ];
  const ASSIGNED = [
    ['undo','History','Undo'],['redo','History','Redo'],['save','Project','Save project'],
    ['brush','Drawing','Brush tool'],['eraser','Drawing','Eraser tool'],['smudge','Drawing','Smudge tool'],
    ['move','Drawing','Move / transform'],['eyedropper','Drawing','Eyedropper'],
    ['layers','Panels','Layers'],['color','Panels','Color studio'],
    ['zoomIn','Canvas','Zoom in'],['zoomOut','Canvas','Zoom out'],['fitView','Canvas','Fit canvas']
  ];
  const safeStore = {
    get() { try {const v=JSON.parse(localStorage.getItem('wincreate_favorite_commands_v1')||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,30):[];}catch(_){return[];} },
    set(v){try{localStorage.setItem('wincreate_favorite_commands_v1',JSON.stringify(v.slice(0,30)));}catch(_){}}
  };
  let favoriteIds = new Set(safeStore.get());
  const commands = [
    ['studio65','Artist Studio 6.5','Panels','Alt+Shift+U',()=>app.studio65?.open()],
    ['blur65','Gaussian Blur','Adjustments','',()=>app.studio65?.open('blur')],
    ['brush65','Advanced brush and smudge','Drawing','',()=>app.studio65?.open('brush')],
    ['rig65','Pin and bone animation','Animation','',()=>app.studio65?.open('rig')],
    ['film65','Resume long video parts','Animation','',()=>app.studio65?.open('longfilm')],
    ['interchange65','PSD ORA SVG import and export','Project','',()=>app.studio65?.open('files')],
    ['timelapse65','Timelapse recording','Project','',()=>app.studio65?.open('timelapse')],
    ['brush','Brush tool','Drawing','B',()=>app.activateTool('brush')],
    ['eraser','Eraser tool','Drawing','E',()=>app.activateTool('eraser')],
    ['smudge','Smudge tool','Drawing','S',()=>app.activateTool('smudge')],
    ['transform','Move / transform','Drawing','V',()=>app.activateTool('transform')],
    ['eyedropper','Eyedropper','Drawing','I',()=>byId('modifyBtn')?.click()],
    ['undo','Undo','History','Ctrl+Z',()=>byId('undoBtn')?.click()],
    ['redo','Redo','History','Ctrl+Y',()=>byId('redoBtn')?.click()],
    ['layers','Layers panel','Panels','L',()=>byId('layersBtn')?.click()],
    ['colors','Color studio','Panels','C',()=>app.togglePop('color')],
    ['brushes','Brush library','Panels','',()=>byId('studioBrushLibrary')?.click()],
    ['preferences','Studio preferences','Panels','',()=>app.togglePop('settings')],
    ['new-layer','Add paint layer','Layers','',()=>byId('addLayerBtn')?.click()],
    ['layer-mask','Layer masks','Layers','',()=>byId('layerMaskToolBtn')?.click()],
    ['shapes','Shape tools','Drawing','',()=>byId('addShapeMenuBtn')?.click()],
    ['trace','Trace reference','Drawing','',()=>byId('traceStudioBtn')?.click()],
    ['fit','Fit canvas','Canvas','0',()=>app.fitCanvasFullscreen()],
    ['save','Save editable project','Project','Ctrl+S',()=>app.saveProjectNative?.(false)],
    ['export','Export options','Project','',()=>byId('studioExport')?.click()],
    ['gallery','Saved projects gallery','Project','',()=>byId('openGalleryBtn')?.click()],
    ['animation','Open animation studio','Animation','',()=>app.workspaces?.openAnimation('animate')],
    ['motion','Open motion lab','Animation','',()=>app.workspaces?.openAnimation('motion')],
    ['shortcuts','Keyboard shortcut guide','Help','?',()=>open('shortcuts')],
    ['pro-colors','Color harmony panel','Pro Tools','',()=>app.proTools?.open('harmony')],
    ['pro-perspective','Perspective guide panel','Pro Tools','',()=>app.proTools?.open('perspective')],
    ['pro-navigator','Canvas navigator','Pro Tools','',()=>app.proTools?.open('navigator')],
    ['pro-quickmenu','Open radial QuickMenu','Pro Tools','Alt+Shift+Q',()=>app.proTools?.showQuickMenu()]
  ].map(([id,name,group,hint,run])=>({id,name,group,hint,run}));
  const BINDING_ACTION = {transform:'move',colors:'color',fit:'fitView'};
  const commandShortcut=(cmd,binds)=>binds[BINDING_ACTION[cmd.id]||cmd.id]||cmd.hint;
  // Keep the palette outside the app's canvas and animation containers, so the
  // overlay is usable regardless of which workspace is currently visible.
  const overlay=document.createElement('div');overlay.id='wcQuickHub';overlay.hidden=true;
  overlay.innerHTML=`<div class="wc-hub-backdrop" data-close="1"></div><section class="wc-hub-panel" role="dialog" aria-modal="true" aria-labelledby="wcHubTitle" tabindex="-1"><header class="wc-hub-top"><div><strong id="wcHubTitle">Keyboard shortcuts</strong><p>WinCreate 6.5 · searchable reference and command launcher</p></div><button id="wcHubClose" type="button" aria-label="Close shortcuts and commands">✕</button></header><div class="wc-hub-tabs" role="tablist" aria-label="Quick tools"><button id="wcHubTabShortcuts" type="button" aria-selected="true">⌨ All shortcuts</button><button id="wcHubTabCommands" type="button" aria-selected="false">⌕ Commands</button><button id="wcHubTabFavorites" type="button" aria-selected="false">★ Favorites</button></div><label class="wc-hub-find"><span>⌕</span><input id="wcHubQuery" type="search" autocomplete="off" spellcheck="false" placeholder="Find a shortcut or tool…" aria-label="Search keyboard shortcuts and commands"></label><div class="wc-hub-actions"><span id="wcHubCount" role="status" aria-live="polite"></span><div><button id="wcHubCopy" type="button">Copy list</button><button id="wcHubExport" type="button">Export .txt</button></div></div><div id="wcHubResults" class="wc-hub-results" tabindex="0" aria-label="Matching shortcuts and commands"></div><footer><span>Shortcut guide: <kbd>?</kbd> &nbsp; Command search: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd></span><span><kbd>Esc</kbd> to close</span></footer></section>`;
  document.body.appendChild(overlay);
  const search=byId('wcHubQuery'), results=byId('wcHubResults');
  const shortcutButton=document.createElement('button');shortcutButton.type='button';shortcutButton.id='wcHubToolbarButton';shortcutButton.className='studio-secondary';shortcutButton.title='View every assigned keyboard shortcut and search commands';shortcutButton.textContent='⌨ Shortcuts';
  const header=document.querySelector('#studioHeader .studio-header-actions');if(header)header.prepend(shortcutButton);
  // The same entry point appears in the existing settings, on touch screens,
  // and in Dynamic Island Fullscreen where the standard header is hidden.
  const dilDock=byId('wcDilDock');if(dilDock){const b=document.createElement('button');b.id='wcHubDilButton';b.textContent='⌨ Shortcuts';b.type='button';b.onclick=()=>open('shortcuts');dilDock.appendChild(b);}
  const animHeader=document.querySelector('.wc-anim-header-actions');if(animHeader){const b=document.createElement('button');b.id='wcHubAnimButton';b.textContent='⌨ Shortcuts';b.type='button';b.onclick=()=>open('shortcuts');animHeader.appendChild(b);}
  shortcutButton.onclick=()=>open('shortcuts');
  byId('wcOpenShortcutsInSettings')?.addEventListener('click',()=>open('shortcuts'));
  const closeButton=byId('wcHubClose');closeButton.addEventListener('click',close);
  overlay.querySelector('[data-close]')?.addEventListener('click',close);
  let tab='shortcuts',lastFocus=null,selectedCommandIndex=0;
  const normalize=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
  const assigned=()=>ASSIGNED.map(([id,group,name])=>({id,group,name,key:app.getKeyboardShortcuts()[id]||'Unassigned',type:'Editable',note:'Settings → Keybinds'}));
  const fixed=()=>FIXED.map(([group,name,key,note,type],i)=>({id:'fixed-'+i,group,name,key,type,note}));
  const shortcuts=()=>assigned().concat(fixed());
  const prettyRows=rows=>rows.map(x=>[x.group,x.name,x.key,x.type,x.note].filter(Boolean).join('  |  ')).join('\n');
  function matchingShortcuts(){const q=normalize(search.value);return shortcuts().filter(x=>normalize([x.group,x.name,x.key,x.type,x.note].join(' ')).includes(q));}
  function matchingCommands(){const q=normalize(search.value),ids=(tab==='favorites'?favoriteIds:null);const binds=app.getKeyboardShortcuts();return commands.filter(x=>(!ids||ids.has(x.id))&&normalize([x.group,x.name,commandShortcut(x,binds)].join(' ')).includes(q));}
  function makeText(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;return el;}
  function makeRow(data){
    const row=makeText('div','wc-hub-row',''),body=makeText('div','wc-hub-row-info','');
    body.append(makeText('strong','',data.name),makeText('small','',`${data.group} · ${data.type}${data.note?' · '+data.note:''}`));
    row.append(body,makeText('kbd','wc-hub-key',data.key));return row;
  }
  function makeCommandRow(cmd,index,binds){
    const row=makeText('div','wc-hub-command',''),run=makeText('button','wc-hub-command-main','');run.type='button';run.dataset.commandIndex=String(index);
    run.append(makeText('strong','',cmd.name),makeText('small','',cmd.group));
    if(commandShortcut(cmd,binds))run.append(makeText('kbd','wc-hub-key',commandShortcut(cmd,binds)));
    run.addEventListener('click',()=>execute(cmd));
    const fav=makeText('button','wc-hub-star',favoriteIds.has(cmd.id)?'★':'☆');fav.type='button';fav.setAttribute('aria-label',`${favoriteIds.has(cmd.id)?'Remove':'Add'} ${cmd.name} ${favoriteIds.has(cmd.id)?'from':'to'} favorites`);fav.title='Favorite command';fav.addEventListener('click',()=>{if(favoriteIds.has(cmd.id))favoriteIds.delete(cmd.id);else favoriteIds.add(cmd.id);safeStore.set([...favoriteIds]);render();});row.append(run,fav);return row;
  }
  function render(){
    results.replaceChildren();const binds=app.getKeyboardShortcuts();
    const isShortcut=tab==='shortcuts';const rows=isShortcut?matchingShortcuts():matchingCommands();
    const seen=new Map();if(isShortcut){for(const r of assigned()){if(r.key==='Unassigned')continue;const k=normalize(r.key);seen.set(k,(seen.get(k)||0)+1);}}
    byId('wcHubCopy').disabled=!isShortcut;byId('wcHubExport').disabled=!isShortcut;
    const count=byId('wcHubCount');count.textContent=`${rows.length} ${isShortcut?'shortcuts':'commands'}${isShortcut&&[...seen.values()].some(n=>n>1)?' · duplicate assignments detected':''}`;
    let lastGroup='';if(!rows.length)results.append(makeText('p','wc-hub-empty',tab==='favorites'?'Star commands in the Commands tab to pin them here.':'No matching results.'));
    rows.forEach((row,i)=>{if(row.group!==lastGroup&&isShortcut){results.append(makeText('h3','wc-hub-group',row.group));lastGroup=row.group;}results.append(isShortcut?makeRow(row):makeCommandRow(row,i,binds));});
    selectedCommandIndex=0;
  }
  function setTab(next){tab=next;for(const t of ['shortcuts','commands','favorites']){const b=byId('wcHubTab'+t[0].toUpperCase()+t.slice(1));b.setAttribute('aria-selected',String(t===tab));}search.placeholder=tab==='shortcuts'?'Search key, action or workspace…':'Search commands and tools…';search.value='';render();search.focus();}
  for(const t of ['shortcuts','commands','favorites'])byId('wcHubTab'+t[0].toUpperCase()+t.slice(1)).onclick=()=>setTab(t);
  search.addEventListener('input',render);
  function open(next='shortcuts'){
    if(app.isRecordingShortcut)return;
    if(overlay.hidden){lastFocus=document.activeElement;overlay.hidden=false;document.body.classList.add('wc-hub-visible');}
    setTab(next);
  }
  function close(){if(overlay.hidden)return;overlay.hidden=true;document.body.classList.remove('wc-hub-visible');if(lastFocus?.isConnected)lastFocus.focus();lastFocus=null;}
  function execute(cmd){close();try{cmd.run();}catch(e){console.error('Command failed',e);app.msg?.('Unable to run '+cmd.name);}}
  search.addEventListener('keydown',e=>{
    if(tab==='shortcuts')return;
    if(e.key==='Enter'){e.preventDefault();const all=matchingCommands();if(all.length)execute(all[Math.min(selectedCommandIndex,all.length-1)]);}
    else if(e.key==='ArrowDown'){e.preventDefault();selectedCommandIndex=Math.min(selectedCommandIndex+1,matchingCommands().length-1);results.querySelectorAll('[data-command-index]')[selectedCommandIndex]?.focus();}
  });
  function exportText(){return `WinCreate 6.0 — Shortcut reference\nCurrent editable assignments are pulled from your saved settings.\n\n${prettyRows(matchingShortcuts())}\n`;}
  byId('wcHubCopy').onclick=async()=>{
    try{await navigator.clipboard.writeText(exportText());app.msg?.('Shortcuts copied');}
    catch(_){app.msg?.('Clipboard blocked; use Export .txt');}
  };
  byId('wcHubExport').onclick=()=>{
    const url=URL.createObjectURL(new Blob([exportText()],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='WinCreate-6.0-Keyboard-Shortcuts.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  // Stop overlay keystrokes from reaching the existing global drawing handler
  // without blocking the search input's own keydown or text editing events.
  overlay.addEventListener('keydown',e=>e.stopPropagation());
  // Capture only the two new launch shortcuts. All existing bindings stay intact.
  document.addEventListener('keydown',e=>{
    if(!overlay.hidden){
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
      if(e.key==='Tab'){
        const tabbables=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
        if(tabbables.length){const first=tabbables[0],last=tabbables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
        return;
      }
      return;
    }
    if(app.isRecordingShortcut||e.isComposing||e.repeat||e.target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;
    if(e.key==='?'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();open('shortcuts');}
    else if(e.key.toLowerCase()==='k'&&e.ctrlKey&&e.shiftKey&&!e.altKey){e.preventDefault();e.stopImmediatePropagation();open('commands');}
  },true);
  window.WinCreateShortcutHub=Object.freeze({open,close,getShortcuts:shortcuts,getCommands:()=>commands.map(x=>({id:x.id,name:x.name,group:x.group}))});
})();
