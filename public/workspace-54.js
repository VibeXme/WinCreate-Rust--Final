/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
/* WinCreate 5.4 — Windows-only dynamic-island fullscreen and dedicated animation workspace.
   Reparents original working controls: no duplicate painter or layer state. */
WinCreate.use(app => {
  'use strict';
  const $=id=>document.getElementById(id);
  const body=document.body;
  const stage=$('viewport'), drawingHome=stage.parentElement;
  const page=document.createElement('section');page.id='pageAnimation';page.className='page';page.setAttribute('aria-label','Animation Studio workspace');
  page.innerHTML=`<header class="wc-anim-header"><div class="wc-anim-mark"><img src="favicon.svg" alt="" width="32" height="32"> <strong>WinCreate</strong><span>Animation Studio</span></div><div class="wc-anim-header-actions"><button id="wcBackToArt">← Drawing</button><button id="wcAnimFramesView" class="is-selected">Frames</button><button id="wcAnimMotionView">✦ Motion Lab</button><button id="wcAnimLayers" aria-controls="wcAnimInspector" aria-expanded="true">Layers</button><button id="wcAnimSave">Save project</button></div></header><nav id="wcAnimTools" aria-label="Animation drawing tools"><div id="wcAnimToolMount"></div><label class="wc-anim-brush-control">Brush px<input id="wcAnimBrushSize" type="number" min="0.25" max="800" step=".25" value="20"></label><button id="wcAnimColor" title="Colour wheel">◉ Colour</button></nav><aside id="wcAnimInspector"><div id="wcAnimInspectorCaption">Frame layers</div><div id="wcAnimInspectorMount"></div></aside>`;
  $('pageStudio').after(page);
  const panel=$('animationStudio');page.append(panel);
  const sourceTools=$('studioToolButtons'),sourceColor=$('studioColorMount'),sourceLayer=$('studioLayerPane'),sourceMotion=$('studioMotionPane'),sourceProps=$('studioProperties'),sourceMore=$('studioMoreTools'),sourceColorPop=$('colorPopover');
  const parked=new Map();
  function move(node, target){if(!node||!target)return;if(!parked.has(node))parked.set(node,{parent:node.parentNode,next:node.nextSibling});target.append(node);}
  function returnNode(node){const v=parked.get(node);if(!v)return;if(v.next?.parentNode===v.parent)v.parent.insertBefore(node,v.next);else v.parent?.append(node);parked.delete(node);}
  function refit(){requestAnimationFrame(()=>{app.fitCanvasFullscreen();app.renderLayers();});}
  const transfer=document.createElement('dialog');transfer.id='wcArtworkTransfer';transfer.innerHTML=`<div class="wc-transfer-mark">✦ ANIMATION STUDIO</div><h2>Use your drawing?</h2><p>Start with the artwork on your canvas, or make a blank animation. Your drawing is kept when you return to Draw.</p><div class="wc-transfer-buttons"><button id="wcArtCancel">Cancel</button><button id="wcArtBlank">Start blank</button><button id="wcArtUse" class="wc-positive">Use my drawing</button></div>`;document.body.append(transfer);
  function hasArtwork(){
    const {layers}=app.state;
    for(const l of layers){if(l.isFolder)continue;if(l.vectorStrokes?.length)return true;
      if(!l.ctx)continue;
      const w=l.canvas.width,h=l.canvas.height,step=256;
      for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
        const d=l.ctx.getImageData(x,y,Math.min(step,w-x),Math.min(step,h-y)).data;
        for(let i=3;i<d.length;i+=4)if(d[i]!==0)return true;
      }
    }return false;
  }
  function blankSnapshot(snapshot){
    return {...snapshot,layers:snapshot.layers.map(l=>l.isFolder?{...l}:{...l,data:null,vectorStrokes:[],layerMask:null})};
  }
  let originalDrawing=null,animationWasTransferred=false;
  function placeAnimation(){
    if(body.classList.contains('wc-dil-fullscreen'))dilExit();
    move($('studioHistoryActions'),page.querySelector('.wc-anim-header-actions'));move(stage,page);move(sourceTools,$('wcAnimToolMount'));move(sourceLayer,$('wcAnimInspectorMount'));move(sourceMotion,$('wcAnimInspectorMount'));
    move(sourceColorPop,page);
    body.classList.add('wc-animation-page');app.goToPage('pageAnimation');
    app.animation.activate();setAnimTab('frames');
    $('wcAnimLayers').setAttribute('aria-expanded',String(innerWidth>900&&!body.classList.contains('wc-anim-inspector-closed')||innerWidth<=900&&body.classList.contains('wc-anim-inspector-open')));
    $('wcAnimBrushSize').value=app.state.brushSize;
    $('wcAnimColor').style.color=app.state.currentColor;
    refit();
  }
  function enterAnimation(mode='animate',useDrawing=true){
    if(app.animation.busy){app.msg('Finish the current operation first');return;}
    if(!app.animation.enabled){
      originalDrawing=captureStudioSnapshot();animationWasTransferred=useDrawing;
      if(!useDrawing)restoreStudioSnapshot(blankSnapshot(originalDrawing));
      app.animation.activate();
      if(mode==='motion')app.animation.setDuration(8);
    }else if(originalDrawing){
      // Keep any drawing-only changes separate from animation frames.
      if($('pageStudio').classList.contains('active'))originalDrawing=captureStudioSnapshot();
      app.animation.resume();
      // Restore animation's own frame rather than capturing the drawing workspace over it.
      app.animation.diagnostics.show(app.animation.currentFrame,false);
    }
    placeAnimation();setAnimTab(mode==='motion'?'motion':'frames');
  }
  function openAnimation(mode='animate',autoUseArtwork=false){
    if(app.animation.busy){app.msg('Finish the current operation first');return;}
    if(app.animation.enabled){enterAnimation(mode);return;}
    if(autoUseArtwork){enterAnimation(mode,true);return;}
    if(!hasArtwork()){enterAnimation(mode,false);return;}
    transfer.showModal();
    transfer.dataset.mode=mode;
  }
  $('wcArtCancel').onclick=()=>transfer.close();
  $('wcArtBlank').onclick=()=>{const mode=transfer.dataset.mode;transfer.close();enterAnimation(mode,false);};
  $('wcArtUse').onclick=()=>{const mode=transfer.dataset.mode;transfer.close();enterAnimation(mode,true);};
  function setAnimTab(tab){
    const motion=tab==='motion';
    $('wcAnimFramesView').classList.toggle('is-selected',!motion);
    $('wcAnimMotionView').classList.toggle('is-selected',motion);
    $('wcAnimInspectorCaption').textContent=motion?'Motion Lab':'Frame layers';
    sourceLayer.style.display=motion?'none':'';sourceMotion.style.display=motion?'':'none';
    sourceLayer.classList.toggle('active',!motion);sourceMotion.classList.toggle('active',motion);
    if(motion)app.motion.renderUI();
    refit();
  }
  function openDrawing(){
    if(app.animation.busy){app.msg('Finish the current operation first');return;}
    if(!page.classList.contains('active'))return;
    // Persist the active animation frame before switching to the illustration snapshot.
    void app.animation.diagnostics.frames;
    app.animation.suspend();body.classList.remove('anim-workspace');$('animationModeBtn')?.classList.remove('active');
    for(const item of [$('studioHistoryActions'),sourceTools,sourceLayer,sourceMotion,sourceColorPop])returnNode(item);
    returnNode(stage);
    if(originalDrawing)restoreStudioSnapshot(originalDrawing);
    body.classList.remove('wc-animation-page');app.goToPage('pageStudio');
    sourceLayer.style.display='';sourceMotion.style.display='';
    if(sourceProps && !sourceProps.classList.contains('active'))sourceProps.classList.add('active');
    refit();app.markUnsavedChanges();app.studio.update();
  }
  $('wcBackToArt').onclick=openDrawing;
  $('wcAnimFramesView').onclick=()=>setAnimTab('frames');$('wcAnimMotionView').onclick=()=>setAnimTab('motion');
  $('wcAnimLayers').onclick=()=>{const small=innerWidth<=900;const key=small?'wc-anim-inspector-open':'wc-anim-inspector-closed';body.classList.toggle(key);$('wcAnimLayers').setAttribute('aria-expanded',String(small?body.classList.contains(key):!body.classList.contains(key)));refit();};
  $('wcAnimSave').onclick=()=>app.saveProjectNative(false);
  $('wcAnimColor').onclick=()=>{app.togglePop('color');sourceColorPop.style.zIndex='2300';};
  $('wcAnimBrushSize').onchange=e=>app.setBrushSize(Math.max(.25,Math.min(800,+e.target.value||20)));
  $('animDraw').addEventListener('click',e=>{if(page.classList.contains('active')){e.preventDefault();e.stopImmediatePropagation();openDrawing();}},true);
  // Keep original engine's canvasInit lifecycle; imported/new canvases invalidate stale snapshots.
  app.on('canvasInit',()=>{originalDrawing=null;animationWasTransferred=false;if(stage.parentElement===page){
    [$('studioHistoryActions'),sourceTools,sourceLayer,sourceMotion,sourceColorPop,stage].forEach(returnNode);body.classList.remove('wc-animation-page');refit();
  }});
  app.on('colorChange',()=>{$('wcAnimColor').style.color=app.state.currentColor;});

  const startBtn=document.createElement('button');startBtn.id='wcStartAnimation';startBtn.className='studio-secondary';startBtn.textContent='Animate drawing →';
  $('studioHeader').querySelector('.studio-header-actions').prepend(startBtn);startBtn.onclick=()=>openAnimation('animate');
  const dilBtn=document.createElement('button');dilBtn.id='wcDILStart';dilBtn.className='studio-secondary';dilBtn.textContent='◈ DIL Fullscreen';dilBtn.title='Dynamic Island Fullscreen: movable artist controls';
  $('studioHeader').querySelector('.studio-header-actions').prepend(dilBtn);

  const dock=document.createElement('div');dock.id='wcDilDock';dock.setAttribute('role','toolbar');dock.setAttribute('aria-label','Dynamic Island controls');
  dock.innerHTML='<button id="wcDilExit">↙ Exit DIL</button><span class="wc-dil-divider"></span><button data-open="tools">Tools</button><button data-open="stroke">Stroke</button><button data-open="color">Colour</button><button data-open="layers">Layers</button><button data-open="create">Create</button><button id="wcDilFit">Fit</button>';
  const root=document.createElement('div');root.id='wcDilRoot';root.append(dock);document.body.append(root);
  const descriptors=[['tools','Drawing tools','✎',24,100],['stroke','Brush studio','◉',24,395],['color','Colour wheel','◌',window.innerWidth-330,88],['layers','Layers & folders','▤',window.innerWidth-365,395],['create','Create & file','✦',Math.max(220,window.innerWidth*.41),90]];
  const windows=new Map();let z=2300,ownsFullscreen=false,previousInspectorTab='properties';
  for(const [key,title,symbol,x,y] of descriptors){
    const el=document.createElement('section');el.className='wc-dil-island';el.dataset.island=key;el.setAttribute('aria-label',title);
    el.style.left=Math.max(8,x)+'px';el.style.top=Math.max(10,y)+'px';
    el.innerHTML=`<header class="wc-dil-island-head"><span class="wc-dil-drag">${symbol} &nbsp; ${title}</span><button data-mini title="Minimize island" aria-label="Minimize ${title}">−</button><button data-close title="Close island" aria-label="Close ${title}">×</button></header><div class="wc-dil-island-body" id="wcDil${key[0].toUpperCase()+key.slice(1)}"></div>`;
    const content=el.querySelector('.wc-dil-island-body');root.append(el);windows.set(key,{el,content});
    el.addEventListener('pointerdown',()=>{el.style.zIndex=String(++z);});
    el.querySelector('[data-mini]').onclick=()=>{el.classList.toggle('minimized');el.querySelector('[data-mini]').textContent=el.classList.contains('minimized')?'+':'−';};
    el.querySelector('[data-close]').onclick=()=>{el.hidden=true;};
    const drag=el.querySelector('.wc-dil-drag');let pos=null;
    drag.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();pos={x:e.clientX,y:e.clientY,l:el.offsetLeft,t:el.offsetTop};drag.setPointerCapture(e.pointerId);});
    drag.addEventListener('pointermove',e=>{if(!pos)return;el.style.left=Math.max(0,Math.min(innerWidth-75,pos.l+e.clientX-pos.x))+'px';el.style.top=Math.max(0,Math.min(innerHeight-55,pos.t+e.clientY-pos.y))+'px';el.style.zIndex=String(++z);});
    drag.addEventListener('pointerup',e=>{pos=null;el.style.left=Math.max(5,Math.min(innerWidth-el.getBoundingClientRect().width-5,el.offsetLeft))+'px';el.style.top=Math.max(5,Math.min(innerHeight-54,el.offsetTop))+'px';try{drag.releasePointerCapture(e.pointerId);}catch{}});drag.addEventListener('pointercancel',()=>pos=null);
  }
  const create=windows.get('create').content;
  const shortcuts=[['✎','Pen','brushBtn'],['⌫','Eraser','eraserBtn'],['◉','Smudge','smudgeBtn'],['▧','Text','textStudioBtn'],['◇','Shapes','addShapeMenuBtn'],['▣','Trace image','traceStudioBtn'],['◈','Selection','selectToolBtn'],['◐','Layer mask','layerMaskToolBtn'],['▱','Transform','transformToolBtn'],['☰','Brush library','studioBrushLibrary'],['↶','Undo','undoBtn'],['↷','Redo','redoBtn'],['▤','Layers','layersBtn'],['↓','Export PNG','actionsBtn'],['▦','Canvas setup','canvasSetupBtn'],['⚙','Settings','settingsBtn']];
  for(const [symbol,label,id] of shortcuts){const b=document.createElement('button');b.className='wc-dil-shortcut';b.textContent=symbol+' '+label;b.title=label;b.onclick=()=>{
    if(id==='layersBtn'){reopen('layers');return;}
    const target=$(id);if(target)target.click();else app.msg(label+' unavailable');
  };create.append(b);}
  const toAnimate=document.createElement('button');toAnimate.className='wc-dil-shortcut wc-dil-wide';toAnimate.textContent='✦ Send artwork to Animation Studio →';toAnimate.onclick=()=>openAnimation('motion');create.append(toAnimate);
  const note=document.createElement('p');note.className='wc-dil-tip';note.textContent='Drag the island headers. Resize at the bottom-right edge. Minimize or close any island; reopen it from the dock.';create.append(note);
  function reopen(key){
    const v=windows.get(key);if(!v)return;
    // Narrow portrait screens have room for one island; others stay in dock.
    if(innerWidth<760){
      for(const [name,other] of windows)if(name!==key)other.el.hidden=true;
      v.el.style.width=Math.min(innerWidth-18,250)+'px';
      v.el.style.left='9px';v.el.style.top='64px';
      v.el.style.height='min(43dvh,325px)';
    }
    v.el.hidden=false;v.el.classList.remove('minimized');v.el.querySelector('[data-mini]').textContent='−';v.el.style.zIndex=String(++z);
  }
  // Responsive island arrangement avoids starting with controls on top of one another.
  function layoutIslands() {
    const w=innerWidth,h=innerHeight,compact=w<760,medium=w<1180;
    const width=compact?Math.min(w-18,250):(medium?Math.min(244,(w-48)/2):294);
    const presets=compact ? [
      ['tools',9,64,false],['stroke',9,320,true],['color',9,130,true],
      ['layers',9,194,true],['create',9,256,true]
    ] : medium ? [
      ['tools',12,65,false],['stroke',12,Math.min(h-290,360),h<690],
      ['color',w-width-12,65,false],['layers',w-width-12,Math.min(h-290,360),h<690],
      ['create',Math.max(12,(w-width)/2),Math.max(64,h-142),true]
    ] : [
      ['tools',12,65,false],['stroke',12,Math.min(h-295,390),false],
      ['color',w-width-12,65,false],['layers',w-width-12,Math.min(h-295,390),false],
      ['create',Math.max(315,(w-width)/2),65,false]
    ];
    for(const [key,left,top,mini] of presets){
      const v=windows.get(key);if(!v)continue;
      v.el.style.width=width+'px';
      v.el.hidden=compact && key!=='tools';
      v.el.style.left=Math.max(5,Math.min(w-width-5,left))+'px';
      v.el.style.top=Math.max(5,Math.min(h-(mini?55:120),top))+'px';
      v.el.classList.toggle('minimized',mini);
      v.el.querySelector('[data-mini]').textContent=mini?'+':'−';
      v.el.style.height=mini?'48px':(compact?'min(38dvh,270px)':(medium?'min(33dvh,265px)':'min(34dvh,295px)'));
    }
  }
  window.addEventListener('resize',()=>{if(body.classList.contains('wc-dil-fullscreen'))layoutIslands();});
  dock.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>reopen(b.dataset.open));
  $('wcDilFit').onclick=()=>app.fitCanvasFullscreen();$('wcDilExit').onclick=()=>dilExit();
  function dilStart(){
    if(!($('pageStudio')?.classList.contains('active')))return;
    previousInspectorTab=$('studioInspector')?.querySelector('[data-tab].active')?.dataset.tab||'properties';
    app.closePops(true);
    body.classList.remove('wc-hide-hud');body.classList.add('wc-dil-fullscreen');
    move(sourceTools,windows.get('tools').content);move(sourceMore,windows.get('tools').content);
    move(sourceProps,windows.get('stroke').content);move(sourceColorPop,windows.get('color').content);
    move(sourceLayer,windows.get('layers').content);
    sourceProps.classList.add('active');sourceLayer.classList.add('active');sourceColorPop.classList.add('open');
    windows.get('tools').content.classList.add('wc-dil-tool-grid');
    windows.get('color').content.classList.add('wc-dil-wheel');
    for(const [key,v] of windows){v.el.hidden=false;v.el.classList.remove('minimized');v.el.style.zIndex=String(++z);}
    layoutIslands();
    refit();
    if(!document.fullscreenElement && document.documentElement.requestFullscreen){
      document.documentElement.requestFullscreen({navigationUI:'hide'}).then(()=>ownsFullscreen=true).catch(()=>{ownsFullscreen=false;});
    }
  }
  function dilExit(){
    if(!body.classList.contains('wc-dil-fullscreen'))return;
    body.classList.remove('wc-dil-fullscreen');sourceColorPop.classList.remove('open');
    for(const node of [sourceTools,sourceMore,sourceProps,sourceColorPop,sourceLayer])returnNode(node);
    app.studio.setTab(previousInspectorTab);
    if(ownsFullscreen&&document.fullscreenElement){document.exitFullscreen().catch(()=>{});}ownsFullscreen=false;
    refit();
  }
  dilBtn.onclick=dilStart;
  document.addEventListener('keydown',e=>{
    if(!body.classList.contains('wc-dil-fullscreen'))return;
    if((e.key==='Escape'&&!e.target.closest('input,textarea,dialog'))||(e.key.toLowerCase()==='d'&&e.ctrlKey&&e.shiftKey)){
      e.preventDefault();e.stopImmediatePropagation();dilExit();
    }else if(e.key==='F11'){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  app.workspaces={openAnimation,openDrawing,setAnimTab,dilStart,dilExit,hasArtwork};
  // Make the left frame rail refresh with resize and page switches.
  window.addEventListener('resize',()=>{if(body.classList.contains('wc-dil-fullscreen')||body.classList.contains('wc-animation-page'))refit();});
});
