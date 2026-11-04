/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
/* WinCreate Studio 5 — a unified, responsive drawing and motion workspace. */
WinCreate.use(app=>{
  document.body.classList.add('studio-v5');
  const compactInspector=()=>innerWidth<=900||(/Android/i.test(navigator.userAgent)&&innerWidth<=1200);
  const icon=(path)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  const icons={draw:'m4 20 4-1 12-12-3-3L5 16l-1 4m11-14 3 3',animate:'M5 3h14v18H5zM5 8h14M5 16h14M9 3v5m6-5v5M9 16v5m6-5v5',motion:'M3 12c4-12 8 12 12 0s4-6 6-6',layers:'m3 7 9-4 9 4-9 4-9-4m0 5 9 4 9-4m-18 5 9 4 9-4',save:'M4 3h13l4 4v14H3V3h1m3 0v6h10V3M7 21v-8h10v8',export:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',chevron:'m9 5 7 7-7 7',image:'M3 3h18v18H3zm0 14 6-6 5 5 3-3 4 4M7 7h1',close:'m6 6 12 12M6 18 18 6',more:'M5 12h.01M12 12h.01M19 12h.01'};
  const shell=document.createElement('div');shell.id='studioShell';shell.innerHTML=`<header id="studioHeader"><button id="studioHome" class="studio-brand" title="Project dashboard"><span class="studio-logo"><img src="favicon.svg" alt=""></span><span>wincreate<span class="studio-brand-dot">.</span></span><small>STUDIO 6.5</small></button><div class="studio-document"><span class="studio-document-dot"></span><input id="studioProjectTitle" aria-label="Project title" value="Untitled artwork"><span id="studioDimensions"></span></div><nav id="studioModes" aria-label="Workspace"><button data-mode="draw" class="active">${icon(icons.draw)}<span>Draw</span></button><button data-mode="animate">${icon(icons.animate)}<span>Animate</span></button><button data-mode="motion">${icon(icons.motion)}<span>Motion Lab</span></button></nav><div class="studio-header-actions"><button id="studioInspectorToggle" class="studio-icon-button" title="Show or hide inspector">${icon(icons.layers)}</button><button id="studioSave" class="studio-secondary" title="Save editable project to Files (.winc)" aria-label="Save editable project to Files">${icon(icons.save)}<span>Save</span></button><button id="studioExport" class="studio-primary">${icon(icons.export)}<span>Export</span></button></div></header>
  <aside id="studioTools" aria-label="Drawing tools"><div id="studioToolButtons"></div><div class="studio-tool-separator"></div><button id="studioBrushLibrary" class="studio-icon-button" title="Brush library">${icon('M4 4h7v7H4zm10 0h6v7h-6zM4 14h7v6H4zm10 0h6v6h-6z')}</button><div id="studioColorMount"></div><div class="studio-tool-spacer"></div><details id="studioFileMenu"><summary title="More tools">${icon(icons.more)}</summary><div id="studioMoreTools"></div></details></aside>
  <aside id="studioInspector"><div class="studio-inspector-tabs" role="tablist"><button data-tab="properties" class="active" role="tab" aria-selected="true">Properties</button><button data-tab="layers" role="tab" aria-selected="false">Layers</button><button data-tab="motion" role="tab" aria-selected="false">Motion</button><button id="studioInspectorClose" title="Close inspector">×</button></div><div id="studioProperties" class="studio-pane active"><div class="inspector-section"><div class="inspector-heading"><span id="studioSettingsTitle">Brush settings</span> <span>LIVE</span></div><button id="studioCurrentBrush" class="studio-brush-preview"><svg viewBox="0 0 220 60"><path d="M12 42C35 8 52 60 79 26S115 52 145 25s40 9 63-8"/></svg><span id="studioBrushName">Studio Pen</span><small>Open brush library ↗</small></button><label class="studio-field">Diameter <div class="studio-unit-input"><input id="studioBrushSize" type="number" min="0.25" max="800" step="0.25" value="20"><span>px</span></div><input id="studioBrushRange" type="range" min="0" max="1000" value="500"></label><label class="studio-field"><span id="studioOpacityLabel">Opacity</span> <output id="studioOpacityValue">100%</output><input id="studioOpacity" type="range" min="1" max="100" value="100"></label><label class="studio-field">Smoothing <output id="studioSmoothingValue">35%</output><input id="studioSmoothing" type="range" min="0" max="92" value="35" aria-label="Stroke smoothing"></label><div class="studio-size-presets"><button data-size="1">1</button><button data-size="5">5</button><button data-size="20">20</button><button data-size="80">80</button><button data-size="200">200</button></div></div><div class="inspector-section"><div class="inspector-heading">Colour palette<button id="studioColorMore" title="Open full colour controls">＋</button></div><div class="studio-colour-row"><input id="studioColorPicker" type="color" value="#ea977c"><input id="studioHex" aria-label="Hex colour" value="#EA977C" maxlength="7"></div><div id="studioSwatches"></div></div><div class="inspector-section"><div class="inspector-heading">Your next idea</div><button class="studio-feature-link" id="studioStillMotion">${icon(icons.motion)}<span><strong>Animate this drawing</strong><small>Turn a still into a moving scene</small></span>${icon(icons.chevron)}</button><button class="studio-feature-link" id="studioImport">${icon(icons.image)}<span><strong>Bring in an image</strong><small>Add a photo or illustration</small></span>${icon(icons.chevron)}</button><p class="studio-note">B brush · E eraser · [ ] size<br>Space + drag to pan · Ctrl / ⌘ + Z undo</p></div></div><div id="studioLayerPane" class="studio-pane"></div><div id="studioMotionPane" class="studio-pane"></div></aside>
  <footer id="studioFooter"><div id="studioUndoMount"></div><span class="studio-footer-separator"></span><div id="studioZoomMount"></div><div id="studioStatusMount"></div><span id="studioProjectRuntime">Drawing workspace</span><button id="studioFit" title="Fit artwork to available space">Fit canvas</button></footer>`;
  $('pageStudio').append(shell);
  const move=(id,target)=>{const node=$(id);if(node)$(target).append(node);};
  for(const id of ['brushBtn','eraserBtn','smudgeBtn','transformToolBtn','selectToolBtn','layerMaskToolBtn','textStudioBtn','addShapeMenuBtn','modifyBtn'])move(id,'studioToolButtons');
  for(const id of ['openGalleryBtn','canvasSetupBtn','settingsBtn','actionsBtn','adjustBtn','traceStudioBtn','pipRefToggleBtn','liquifyToolBtn','recoveryStatusBtn','gridToggleBtn','rotLeftBtn','rotResetBtn','rotRightBtn'])move(id,'studioMoreTools');
  const history=document.createElement('div');history.id='studioHistoryActions';history.setAttribute('role','group');history.setAttribute('aria-label','Undo and redo');$('studioHeader').insertBefore(history,$('studioHeader').querySelector('.studio-document'));
  for(const id of ['undoBtn','redoBtn'])move(id,'studioHistoryActions');for(const id of ['zoomOutBtn','zoomResetBtn','zoomInBtn'])move(id,'studioZoomMount');move('dynamicIsland','studioStatusMount');move('colorDot','studioColorMount');
  move('layersPopover','studioLayerPane');$('layersPopover').classList.add('docked');$('studioMotionPane').append(app.motion.host);
  const timing=$('animationStudio');
  const motionButton=document.createElement('button');motionButton.id='studioTimelineMotion';motionButton.textContent='✦ Motion Lab';motionButton.onclick=()=>setMode('motion');timing.querySelector('.anim-actions').prepend(motionButton);
  function setTab(tab){
    shell.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));});
    for(const [name,id] of [['properties','studioProperties'],['layers','studioLayerPane'],['motion','studioMotionPane']])$(id).classList.toggle('active',name===tab);
    document.body.classList.remove('studio-inspector-hidden');if(compactInspector())document.body.classList.add('studio-inspector-open');app.motion.renderUI();
  }
  let mode='draw';
  function setMode(next){
    if(app.animation.busy){app.msg('Finish the current operation first');return;}
    if (app.workspaces && next!=='draw') { app.workspaces.openAnimation(next); return; }
    if (app.workspaces && next==='draw' && $('pageAnimation')?.classList.contains('active')) { app.workspaces.openDrawing(); return; }
    mode=next;app.animation.stop();if(next==='draw')$('animDraw').click();else{app.animation.activate();if(next==='motion'&&app.animation.frameCount===1&&app.animation.duration<1)app.animation.setDuration(8);}
    shell.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
    if(next==='motion')setTab('motion');else if(next==='animate')setTab('layers');else if(compactInspector())document.body.classList.remove('studio-inspector-open');
    document.body.dataset.studioMode=next;requestAnimationFrame(app.fitCanvasFullscreen);update();
  }
  shell.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));shell.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $('animDraw').addEventListener('click',()=>{shell.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==='draw'));mode='draw';document.body.dataset.studioMode='draw';requestAnimationFrame(app.fitCanvasFullscreen);});
  $('studioHome').onclick=()=>app.goToPage('pageSetup');$('studioSave').onclick=()=>{if(!app.animation.busy)app.saveProjectNative(false);};
  $('studioExport').onclick=()=>{if(app.animation.busy)return;if(app.animation.suspended||!app.animation.enabled){app.togglePop('actions');return;}app.animation.activate();$('animExportType').focus();$('animExport').scrollIntoView({block:'nearest'});$('animExport').classList.add('studio-attention');setTimeout(()=>$('animExport').classList.remove('studio-attention'),1000);};
  $('studioInspectorToggle').onclick=()=>{if(compactInspector())document.body.classList.toggle('studio-inspector-open');else document.body.classList.toggle('studio-inspector-hidden');requestAnimationFrame(app.fitCanvasFullscreen);};
  $('studioInspectorClose').onclick=()=>{document.body.classList.remove('studio-inspector-open');document.body.classList.add('studio-inspector-hidden');requestAnimationFrame(app.fitCanvasFullscreen);};
  $('studioBrushLibrary').onclick=$('studioCurrentBrush').onclick=()=>{if(!['brush','eraser','smudge'].includes(currentTool))app.activateTool('brush');$('brushLibTitle').textContent=currentTool==='eraser'?'Eraser Studio':currentTool==='smudge'?'Smudge Studio':'Brush Studio';app.togglePop('brush');};$('studioColorMore').onclick=()=>app.togglePop('color');
  $('layersBtn').onclick=()=>setTab('layers');$('expandLayersPanelBtn').onclick=()=>document.body.classList.toggle('studio-inspector-wide');
  $('studioStillMotion').onclick=()=>setMode('motion');$('studioImport').onclick=()=>$('setupImportImgBtn').click();$('studioFit').onclick=()=>app.fitCanvasFullscreen();
  $('studioMoreTools').addEventListener('click',e=>{if(e.target.closest('button'))$('studioFileMenu').open=false;});
  function size(v){app.setBrushSize(v);update();}
  $('studioBrushSize').onchange=e=>size(+e.target.value);$('studioBrushRange').oninput=e=>size(.25*Math.pow(3200,+e.target.value/1000));shell.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>size(+b.dataset.size));
  $('studioSmoothing').oninput=e=>{$('streamRange').value=e.target.value;saveCurrentBrushStabilisation();$('studioSmoothingValue').textContent=e.target.value+'%';};
  $('studioOpacity').oninput=e=>{brushOpacity=+e.target.value;const fill=$('opacityFill');if(fill)fill.style.height=brushOpacity+'%';$('studioOpacityValue').textContent=brushOpacity+'%';};
  const colours=['#F2EADC','#EA977C','#D86951','#A5473C','#673D44','#D8B77D','#9EAF9B','#557F73','#264F49','#263B4A','#405C7B','#8095B8','#B3A2BD','#766581','#31343C','#17191F'];
  for(const color of colours){const b=document.createElement('button');b.style.background=color;b.title=color;b.setAttribute('aria-label','Use colour '+color);b.onclick=()=>app.setColor(color);$('studioSwatches').append(b);}
  $('studioColorPicker').oninput=e=>app.setColor(e.target.value);$('studioHex').onchange=e=>{if(/^#[a-f0-9]{6}$/i.test(e.target.value))app.setColor(e.target.value);else update();};
  $('studioProjectTitle').onchange=e=>{const name=e.target.value.trim().slice(0,120)||'Untitled artwork';$('customName').value=name;e.target.value=name;app.markUnsavedChanges();};
  function update(){
    if(app.animation.enabled&&!$('animationStudio').hidden&&mode==='draw'){mode=app.motion.hasMotion?'motion':'animate';shell.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));document.body.dataset.studioMode=mode;setTab(mode==='motion'?'motion':'layers');}
    $('studioSmoothing').value=$('streamRange').value;$('studioSmoothingValue').textContent=$('streamRange').value+'%';
    const st=app.state;$('studioDimensions').textContent=`${st.WIDTH} × ${st.HEIGHT}`;$('studioBrushName').textContent=app.layerMasks?.editing!==null&&app.layerMasks?.editing!==undefined?((app.maskTexture?'Textured Mask Brush · ':'Round Mask Brush · ')+(app.layerMasks.mode==='hide'?'Hide':'Reveal')):currentTool==='smudge'?(getCurrentBrush().name+' · '+(SMUDGE.mode==='wet'?SMUDGE.label:'Vector Pull')):currentTool==='eraser'?'Hard Eraser':getCurrentBrush().name;$('studioSettingsTitle').textContent=app.layerMasks?.editing!==null&&app.layerMasks?.editing!==undefined?'Mask brush settings':currentTool==='smudge'?'Smudge settings':currentTool==='eraser'?'Eraser settings':'Brush settings';$('studioOpacityLabel').textContent=currentTool==='smudge'?'Strength':'Opacity';
    if(document.activeElement!==$('studioBrushSize'))$('studioBrushSize').value=+(st.brushSize.toFixed(2));if(document.activeElement!==$('studioBrushRange'))$('studioBrushRange').value=Math.log(st.brushSize/.25)/Math.log(3200)*1000;
    if(document.activeElement!==$('studioHex'))$('studioHex').value=st.currentColor.toUpperCase();$('studioColorPicker').value=st.currentColor;$('studioOpacity').value=st.brushOpacity;$('studioOpacityValue').textContent=st.brushOpacity+'%';
    $('studioProjectRuntime').textContent=app.animation.enabled&&!app.animation.suspended?`${app.animation.frameCount} clips · ${app.animation.duration.toFixed(1)} s · ${app.animation.fps} fps`:'Drawing workspace';
  }
  app.on('smudgeSettingsChange',update);app.on('toolChange',update);app.on('colorChange',update);app.on('animationRefresh',update);app.on('canvasInit',info=>{mode='draw';document.body.dataset.studioMode='draw';shell.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==='draw'));$('studioProjectTitle').value=info.title||'Untitled artwork';$('customName').value=info.title||'Untitled artwork';update();});
  setInterval(()=>{if($('pageStudio').classList.contains('active')&&!app.animation.busy)update();},1000);
  const hero=$('pageSetup').querySelector('.setup-hero');hero.querySelector('h1').innerHTML='Every great story<br>starts with a stroke<span>.</span>';hero.querySelector('p').textContent='Draw something beautiful. Give it movement. Make it a film.';hero.querySelector('.setup-kicker').innerHTML='<span class="setup-kicker-dot"></span> YOUR CREATIVE SPACE, IN MOTION';
  const art=hero.querySelector('.setup-hero-mark');art.innerHTML=`<div class="welcome-art"><svg viewBox="0 0 600 390"><defs><linearGradient id="welcomeSky" x2="0" y2="1"><stop stop-color="#573947"/><stop offset="1" stop-color="#efb58c"/></linearGradient></defs><rect width="600" height="390" rx="12" fill="url(#welcomeSky)"/><circle cx="380" cy="140" r="69" fill="#f4d2a2"/><path d="M0 283Q100 116 220 250T600 220V390H0Z" fill="#8d6874"/><path d="M0 320Q160 160 310 300T600 250V390H0Z" fill="#49666c"/><path d="M0 340Q110 286 230 350T600 310V390H0Z" fill="#243f45"/><path d="M490 390Q485 260 520 168M490 302q-66-40-51-70 55 14 51 70M501 250q63-27 69-64-63-7-69 64M510 203q-29-49-14-64 38 10 14 64" fill="#1c343a" stroke="#1c343a" stroke-width="5"/></svg><span class="welcome-art-label"><i></i> An idea, brought to life.</span></div>`;
  const ctas=document.createElement('div');ctas.className='welcome-actions';ctas.innerHTML='<button id="studioDemo" class="studio-primary">Try a living illustration ↗</button><button id="studioNewDrawing" class="studio-secondary">Create a canvas</button>';hero.querySelector('.setup-hero-copy').append(ctas);
  $('studioNewDrawing').onclick=()=>{$('customW').focus();$('customW').scrollIntoView({behavior:'smooth',block:'center'});};
  function demo(){
    app.initializeStudioCanvas('Evening, in motion',960,640,'#e5ba9b',true);const ls=app.state.layers;
    ls[0].name='Evening sky';const sky=ls[0].ctx,g=sky.createLinearGradient(0,0,0,640);g.addColorStop(0,'#533e57');g.addColorStop(.65,'#cf8d83');g.addColorStop(1,'#efc89c');sky.fillStyle=g;sky.fillRect(0,0,960,640);sky.fillStyle='#f5d5ab';sky.beginPath();sky.arc(650,215,100,0,Math.PI*2);sky.fill();
    ls[1].name='Distant mountains';let c=ls[1].ctx;c.fillStyle='#8d687d';c.beginPath();c.moveTo(0,490);c.bezierCurveTo(150,180,330,490,480,370);c.bezierCurveTo(630,220,780,400,960,280);c.lineTo(960,640);c.lineTo(0,640);c.fill();
    const mid=app.createLayer('Rolling hills');c=mid.ctx;c.fillStyle='#486a70';c.beginPath();c.moveTo(0,500);c.bezierCurveTo(180,350,370,370,580,520);c.bezierCurveTo(740,610,850,360,960,430);c.lineTo(960,640);c.lineTo(0,640);c.fill();
    const front=app.createLayer('Foreground leaves');c=front.ctx;c.fillStyle='#203f47';c.beginPath();c.moveTo(0,575);c.bezierCurveTo(170,450,400,650,630,560);c.bezierCurveTo(760,520,850,540,960,510);c.lineTo(960,640);c.lineTo(0,640);c.fill();c.strokeStyle='#1c343a';c.lineWidth=7;c.beginPath();c.moveTo(820,640);c.quadraticCurveTo(800,420,855,230);c.stroke();c.fillStyle='#1c343a';for(let i=0;i<6;i++){const y=320+i*40,x=840-i*5;c.save();c.translate(x,y);c.rotate(i%2?.65:-.65);c.beginPath();c.ellipse(i%2?28:-28,0,42,14,0,0,Math.PI*2);c.fill();c.restore();}
    ls.forEach(l=>l.thumbDirty=true);app.renderLayers();app.workspaces?.openAnimation('motion',true);app.animation.setDuration(12);app.animation.beforeEdit();app.motion.restore({camera:'orbit',cameraAmount:30,tracks:[{id:'demo-depth',layerId:'*',preset:'parallax',amount:15,cycles:1},{id:'demo-leaves',layerId:front.id,preset:'breeze',amount:22,cycles:2}]});app.markUnsavedChanges();app.emit('motionChange');app.animation.play();
  }
  $('studioDemo').onclick=demo;
  app.studio={setMode,setTab,demo,update};update();app.motion.renderUI();
});


// Distraction-free canvas: hide ALL studio furniture, including legacy corner HUD.
(function setupArtistFullscreen() {
  const css = document.createElement('style');
  css.textContent = `
  body.wc-hide-hud #pageStudio > :not(#viewport),
  body.wc-hide-hud #wcArtistControls,
  body.wc-hide-hud #topLeftBar, body.wc-hide-hud #dynamicIsland,
  body.wc-hide-hud #topRightBar, body.wc-hide-hud #leftDock,
  body.wc-hide-hud #quickShapeToolbar, body.wc-hide-hud #studioShell,
  body.wc-hide-hud #animationStudio, body.wc-hide-hud #dropGhost,
  body.wc-hide-hud #brushRing, body.wc-hide-hud #loupe,
  body.wc-hide-hud #shapeEditOverlay,
  body.wc-hide-hud .floating-ui, body.wc-hide-hud .popover,
  body.wc-hide-hud .ios-layer-menu-sheet {display:none!important;visibility:hidden!important;pointer-events:none!important}
  body.studio-v5.wc-hide-hud {--studio-rail:0px;--studio-sidebar:0px;--studio-top:0px;--studio-bottom:0px}
  body.studio-v5.wc-hide-hud #viewport {inset:0!important;left:0!important;right:0!important;top:0!important;bottom:0!important;width:100vw!important;height:100dvh!important}
  #wcArtistControls {position:fixed;z-index:2100;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));display:flex;gap:6px;opacity:.72;transition:opacity .15s}
  #wcArtistControls:hover,#wcArtistControls:focus-within{opacity:1}
  #wcArtistControls button{border:1px solid #ffffff44;background:#191b21d9;color:#fff;border-radius:10px;padding:10px 13px;font:600 12px system-ui;touch-action:manipulation}
  body:not(.wc-hide-hud) #wcArtistControls {bottom:50px}
  `;
  document.head.appendChild(css);
  const bar=document.createElement('div');bar.id='wcArtistControls';
  bar.innerHTML='<button type="button" id="wcHideHud" aria-pressed="false" title="Hide HUD (Shift+H)">Hide HUD</button><button type="button" id="wcFullScreen" title="Fullscreen (F11)">⛶ Fullscreen</button>';
  document.body.appendChild(bar);
  const hud=bar.querySelector('#wcHideHud'),fs=bar.querySelector('#wcFullScreen');
  function refit(){try{window.WinCreate?.fitCanvasFullscreen?.()}catch(_) {}}
  function setHud(hidden){
    document.body.classList.toggle('wc-hide-hud',hidden);
    hud.textContent=hidden?'Show HUD':'Hide HUD';hud.setAttribute('aria-pressed',String(hidden));
    requestAnimationFrame(refit);
  }
  function toggleHud(){setHud(!document.body.classList.contains('wc-hide-hud'));}
  async function toggleFullScreen(){
    try {
      if (window.WinCreateAndroid?.setImmersiveMode) {
        const enter=!document.body.classList.contains('wc-native-fullscreen');
        window.WinCreateAndroid.setImmersiveMode(enter);
        document.body.classList.toggle('wc-native-fullscreen',enter);
        setHud(enter);return;
      }
      if (document.fullscreenElement){await document.exitFullscreen();setHud(false);}
      else if (document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen({navigationUI:'hide'});setHud(true);}
      else setHud(true);
    } catch(err) {console.warn('Fullscreen unavailable',err);setHud(true);}
    requestAnimationFrame(refit);
  }
  hud.addEventListener('click',toggleHud);
  fs.addEventListener('click',toggleFullScreen);
  document.addEventListener('fullscreenchange',()=>{fs.textContent=document.fullscreenElement?'↙ Exit fullscreen':'⛶ Fullscreen';requestAnimationFrame(refit)});
  document.addEventListener('keydown',e=>{
    if (e.target?.closest?.('input,textarea,[contenteditable="true"]')||e.ctrlKey||e.altKey||e.metaKey)return;
    if (document.body.classList.contains('wc-dil-fullscreen')) return;
    if (e.key==='H' && e.shiftKey && document.getElementById('pageStudio')?.classList.contains('active')) {e.preventDefault();toggleHud();}
    else if(e.key==='Escape' && document.body.classList.contains('wc-hide-hud')){setHud(false);}
    else if(e.key==='F11'){e.preventDefault();toggleFullScreen();}
  });
  // Invisible top-right 52px touch corner to restore controls on Android;
  // no visible floating button remains while the HUD is hidden.
  document.getElementById('viewport')?.addEventListener('pointerdown',e=>{
    if (!document.body.classList.contains('wc-hide-hud'))return;
    if(e.clientX>=window.innerWidth-52 && e.clientY<=52){
      e.preventDefault();e.stopImmediatePropagation();setHud(false);
    }
  },true);
})();;
