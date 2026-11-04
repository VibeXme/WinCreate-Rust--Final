/* WinCreate 6.0 – additive professional workflows. No modifications to drawing/undo/serialization internals. */
(() => {
  'use strict';
  const app = window.WinCreate;
  if (!app || document.getElementById('wcProTools')) return;
  const $ = id => document.getElementById(id);
  const persist = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const load = (key, fallback) => { try { const value=JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; } catch (_) { return fallback; } };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
  const canRun = () => $('pageStudio')?.classList.contains('active');
  const notify = msg => { try { app.msg(msg); } catch (_) {} };
  const btn = (label, onClick, className='') => { const el=document.createElement('button'); el.type='button'; el.textContent=label; if(className) el.className=className; el.addEventListener('click',onClick); return el; };
  const make = (tag, className, text) => { const el=document.createElement(tag); if(className) el.className=className; if(text) el.textContent=text; return el; };

  // All actions use existing application commands; never synthesize mouse strokes.
  const ACTIONS = {
    brush: ['Brush', () => app.activateTool('brush')],
    eraser: ['Eraser', () => app.activateTool('eraser')],
    smudge: ['Smudge', () => app.activateTool('smudge')],
    undo: ['Undo', () => $('undoBtn')?.click()],
    redo: ['Redo', () => $('redoBtn')?.click()],
    layers: ['Layers', () => $('layersBtn')?.click()],
    colors: ['Color Studio', () => app.togglePop('color')],
    eyedropper: ['Eyedropper', () => $('modifyBtn')?.click()],
    fit: ['Fit canvas', () => app.fitCanvasFullscreen()],
    save: ['Save project', () => app.saveProjectNative?.(false)],
    shapes: ['Shapes', () => $('addShapeMenuBtn')?.click()],
    guides: ['Perspective', () => openPanel('perspective')]
  };
  const DEFAULT_SLOTS=['brush','eraser','smudge','undo','redo','layers'];
  let slots = load('wincreate6_quickmenu_slots', DEFAULT_SLOTS);
  if (!Array.isArray(slots) || slots.length!==6) slots=[...DEFAULT_SLOTS];
  slots=slots.map((x,i)=>ACTIONS[x]?x:DEFAULT_SLOTS[i]);
  let recentColors=load('wincreate6_color_history', []);
  if(!Array.isArray(recentColors))recentColors=[];
  recentColors=recentColors.filter(c=>/^#[0-9a-f]{6}$/i.test(c)).slice(0,20);
  const guide={mode:'off', horizon:50, left:22, right:78, density:10, opacity:50, ...load('wincreate6_perspective_v1',{})};
  if(!['off','one','two','three'].includes(guide.mode))guide.mode='off';
  ['horizon','left','right','density','opacity'].forEach(k=>guide[k]=clamp(guide[k], k==='density'?4:0, k==='density'?20:100));

  const entry=btn('✦ Pro Tools',()=>openPanel('harmony'),'wcpro-entry');
  entry.id='wcProToolsButton';entry.title='Color Harmony, Perspective, QuickMenu and Navigator';
  const toolbar=$('studioMoreTools')||$('topLeftBar')||document.querySelector('.studio-header-actions');
  toolbar?.appendChild(entry);
  const modal=make('section','wcpro-panel');modal.id='wcProTools';modal.hidden=true;
  modal.setAttribute('role','dialog');modal.setAttribute('aria-label','WinCreate professional tools');
  modal.innerHTML=`<header class="wcpro-title"><strong>✦ WinCreate Pro Tools</strong><button id="wcproClose" type="button" aria-label="Close Pro Tools">✕</button></header>
    <nav class="wcpro-tabs" aria-label="Professional tools"><button type="button" data-tab="harmony">Colors</button><button type="button" data-tab="perspective">Perspective</button><button type="button" data-tab="quickmenu">QuickMenu</button><button type="button" data-tab="navigator">Navigator</button></nav>
    <section id="wcproHarmony" class="wcpro-content"><label class="wcpro-field">Harmony type <select id="wcproHarmonyMode"><option value="complement">Complementary</option><option value="analogous">Analogous</option><option value="triadic">Triadic</option><option value="split">Split-complementary</option><option value="tetradic">Tetradic</option><option value="mono">Monochromatic</option></select></label><div id="wcproColorRows" class="wcpro-swatches" aria-live="polite"></div><p class="wcpro-hint">Select a swatch to use that color with the current brush. Double click a swatch to copy its hex value.</p><h4>Recent colors</h4><div id="wcproRecent" class="wcpro-swatches"></div><button id="wcproPrevColor" type="button" class="wcpro-small-btn">↔ Previous color</button></section>
    <section id="wcproPerspective" class="wcpro-content" hidden><p class="wcpro-hint">Visual construction guides only: they never alter your artwork, brush strokes, or exported images.</p>
    <label class="wcpro-field">Guide <select id="wcproGuideMode"><option value="off">Off</option><option value="one">1-point</option><option value="two">2-point</option><option value="three">3-point</option></select></label>
    <label class="wcpro-field">Horizon height <input id="wcproHorizon" type="range" min="5" max="95"></label>
    <label class="wcpro-field">Left vanishing point <input id="wcproLeft" type="range" min="0" max="100"></label>
    <label class="wcpro-field">Right vanishing point <input id="wcproRight" type="range" min="0" max="100"></label>
    <label class="wcpro-field">Guide density <input id="wcproDensity" type="range" min="4" max="20"></label>
    <label class="wcpro-field">Guide opacity <input id="wcproOpacity" type="range" min="10" max="90"></label>
    <button id="wcproClearGuides" class="wcpro-small-btn" type="button">Hide perspective guides</button></section>
    <section id="wcproQuickmenu" class="wcpro-content" hidden><p class="wcpro-hint">Customize six quick actions. They use WinCreate's existing commands and preserve your custom keyboard shortcuts.</p><div id="wcproSlotChoices" class="wcpro-slots"></div><button id="wcproTryMenu" class="wcpro-small-btn" type="button">Open radial QuickMenu</button><p class="wcpro-hint">Keyboard: Alt + Shift + Q. Also available from the ✧ button beside the canvas toolbar.</p></section>
    <section id="wcproNavigator" class="wcpro-content" hidden><p class="wcpro-hint">Live, reduced-resolution preview. Rendering is suspended while this tab is closed to save battery.</p><canvas id="wcproPreview" width="252" height="176" aria-label="Drawing preview"></canvas><div class="wcpro-tools"><button type="button" id="wcproNavFit">Fit canvas</button><button type="button" id="wcproNavRefresh">Refresh preview</button></div><p id="wcproDimensions" class="wcpro-hint"></p></section>`;
  document.body.appendChild(modal);
  const rim=make('div','wcpro-radial-overlay');rim.id='wcProRadialOverlay';rim.hidden=true;
  rim.innerHTML='<div class="wcpro-radial-backdrop"></div><section class="wcpro-radial-menu" aria-label="Quick actions" role="group"><div class="wcpro-radial-center">QuickMenu</div></section>';
  document.body.appendChild(rim);
  const radialBtn=btn('✧',()=>toggleRadial(),'wcpro-radial-trigger');radialBtn.id='wcProRadialButton';radialBtn.title='Custom radial QuickMenu (Alt+Shift+Q)';
  $('topRightBar')?.prepend(radialBtn);

  let activeTab='harmony';let previousFocus=null;let previousColor=null;
  const closeRadial=()=>{rim.hidden=true;};
  function closePanel(){modal.hidden=true; if(activeTab==='navigator')navDirty=false; previousFocus?.focus?.();}
  function openPanel(tab='harmony'){
    closeRadial();previousFocus=document.activeElement; modal.hidden=false;
    activeTab=['harmony','perspective','quickmenu','navigator'].includes(tab)?tab:'harmony';
    modal.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===activeTab); b.setAttribute('aria-selected',String(b.dataset.tab===activeTab));});
    for(const [key,name] of [['harmony','wcproHarmony'],['perspective','wcproPerspective'],['quickmenu','wcproQuickmenu'],['navigator','wcproNavigator']]) $(name).hidden=key!==activeTab;
    if(activeTab==='harmony')renderHarmony();
    if(activeTab==='quickmenu')renderSlots();
    if(activeTab==='navigator')schedulePreview(true);
    $('wcproClose').focus();
  }
  $('wcproClose').addEventListener('click',closePanel);
  modal.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.tab)));
  rim.querySelector('.wcpro-radial-backdrop').addEventListener('click',closeRadial);
  function toggleRadial(){if(!canRun())return;const show=rim.hidden;closePanel();rim.hidden=!show;if(show)renderRadial();}
  function renderRadial(){const menu=rim.querySelector('.wcpro-radial-menu');menu.querySelectorAll('button').forEach(b=>b.remove());slots.forEach((key,i)=>{
    const b=btn(ACTIONS[key][0],()=>{closeRadial();try{ACTIONS[key][1]();}catch(e){console.error('QuickMenu action failed',e);}},'wcpro-radial-choice');
    b.style.setProperty('--i',String(i));menu.appendChild(b);
  });}
  function renderSlots(){const root=$('wcproSlotChoices');root.replaceChildren();slots.forEach((key,i)=>{
    const label=make('label','wcpro-field','Slot '+(i+1));const select=make('select');
    Object.entries(ACTIONS).forEach(([id,[title]])=>{const option=make('option','',title);option.value=id;option.selected=id===key;select.appendChild(option);});
    select.addEventListener('change',()=>{slots[i]=select.value;persist('wincreate6_quickmenu_slots',slots);});label.appendChild(select);root.appendChild(label);
  });}
  $('wcproTryMenu').addEventListener('click',toggleRadial);
  document.addEventListener('keydown',e=>{
    const inField=e.target?.closest?.('input,textarea,select,[contenteditable="true"]');
    if(e.key==='Escape'){if(!rim.hidden){e.preventDefault();closeRadial();}else if(!modal.hidden){e.preventDefault();closePanel();}}
    if(e.altKey && e.shiftKey && e.code==='KeyQ' && !inField && !app.isRecordingShortcut && canRun()){e.preventDefault();e.stopPropagation();toggleRadial();}
  },true);

  function rgb(hex){const h=String(hex).replace('#','');return h.length===6 && /^[0-9a-f]{6}$/i.test(h)?[0,2,4].map(i=>parseInt(h.substring(i,i+2),16)):[88,120,242];}
  function toHsl(hex){const [r,g,b]=rgb(hex).map(v=>v/255);const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0,s=0,l=(max+min)/2;if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h*=60;if(h<0)h+=360;}return[h,s,l];}
  function fromHsl(h,s,l){h=((h%360)+360)%360;s=clamp(s,0,1);l=clamp(l,0,1);const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;const sext=Math.floor(h/60);const triples=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]];return '#'+triples[sext].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');}
  function harmony(hex,mode){const [h,s,l]=toHsl(hex);switch(mode){case 'analogous':return[-30,0,30].map(d=>fromHsl(h+d,s,l));case 'triadic':return[0,120,240].map(d=>fromHsl(h+d,s,l));case 'split':return[0,150,210].map(d=>fromHsl(h+d,s,l));case 'tetradic':return[0,90,180,270].map(d=>fromHsl(h+d,s,l));case 'mono':return[.2,.35,.5,.65,.8].map(v=>fromHsl(h,s,v));default:return[0,180].map(d=>fromHsl(h+d,s,l));}}
  let currentColor=app.state.currentColor||'#5878f2';
  const swatch=(hex,label)=>{const b=btn(label||hex,()=>app.setColor(hex),'wcpro-swatch');b.style.setProperty('--swatch',hex);b.title=`Use ${hex} (double-click to copy)`;b.addEventListener('dblclick',()=>navigator.clipboard?.writeText?.(hex).then(()=>notify('Color code copied')).catch(()=>{}));return b;};
  function renderHarmony(){if(modal.hidden || activeTab!=='harmony')return;const colors=harmony(currentColor,$('wcproHarmonyMode').value);$('wcproColorRows').replaceChildren(...colors.map(hex=>swatch(hex)));$('wcproRecent').replaceChildren(...recentColors.map(hex=>swatch(hex)));}
  $('wcproHarmonyMode').addEventListener('change',renderHarmony);
  $('wcproPrevColor').addEventListener('click',()=>{if(previousColor){app.setColor(previousColor);}});
  app.on('colorChange',hex=>{if(!/^#[0-9a-f]{6}$/i.test(hex||''))return;const normalized=hex.toLowerCase();if(currentColor!==normalized){previousColor=currentColor;currentColor=normalized;recentColors=[normalized,...recentColors.filter(x=>x!==normalized)].slice(0,20);persist('wincreate6_color_history',recentColors);}renderHarmony();});

  // Perspective canvas lives over the art board and is excluded from all layer and PNG exports.
  const perspectiveCanvas=document.createElement('canvas');perspectiveCanvas.id='wcproPerspectiveCanvas';perspectiveCanvas.setAttribute('aria-hidden','true');
  $('board')?.appendChild(perspectiveCanvas);
  const guideCtx=perspectiveCanvas.getContext('2d');
  function drawPerspective(){if(!guideCtx)return;const s=app.state;const w=Math.max(1,s.WIDTH),h=Math.max(1,s.HEIGHT);
    if(perspectiveCanvas.width!==w||perspectiveCanvas.height!==h){perspectiveCanvas.width=w;perspectiveCanvas.height=h;}
    guideCtx.clearRect(0,0,w,h);if(guide.mode==='off')return;
    const y=h*guide.horizon/100;const vp1=[guide.mode==='one'?w/2:w*guide.left/100,y],vp2=[w*guide.right/100,y];
    const vanishing=[vp1];if(guide.mode!=='one')vanishing.push(vp2);if(guide.mode==='three')vanishing.push([w*.5,h*1.4]);
    guideCtx.save();guideCtx.strokeStyle=`rgba(64,175,251,${guide.opacity/100})`;guideCtx.lineWidth=Math.max(.9,Math.min(w,h)/850);
    const targetCount=Math.max(4,Math.round(guide.density));
    // Render a bounded set of guidelines across the canvas perimeter. No expensive per-pixel work.
    for(const [vx,vy] of vanishing){for(let i=0;i<=targetCount;i++){
      const f=i/targetCount;
      for(const [tx,ty] of [[f*w,0],[f*w,h],[0,f*h],[w,f*h]]){
        guideCtx.beginPath();guideCtx.moveTo(vx,vy);guideCtx.lineTo(tx,ty);guideCtx.stroke();
      }
    }}
    guideCtx.setLineDash([Math.max(3,w/120),Math.max(3,w/170)]);guideCtx.strokeStyle=`rgba(255,185,74,${guide.opacity/100})`;
    guideCtx.beginPath();guideCtx.moveTo(0,y);guideCtx.lineTo(w,y);guideCtx.stroke();guideCtx.setLineDash([]);
    vanishing.forEach(([x,vy])=>{guideCtx.beginPath();guideCtx.arc(x,vy,Math.max(5,Math.min(w,h)/200),0,Math.PI*2);guideCtx.stroke();});guideCtx.restore();
  }
  const bindGuide=(id,key)=>{const element=$(id);element.value=String(guide[key]);element.addEventListener('input',()=>{guide[key]=key==='mode'?element.value:+element.value;persist('wincreate6_perspective_v1',guide);drawPerspective();});};
  bindGuide('wcproGuideMode','mode');bindGuide('wcproHorizon','horizon');bindGuide('wcproLeft','left');bindGuide('wcproRight','right');bindGuide('wcproDensity','density');bindGuide('wcproOpacity','opacity');
  $('wcproClearGuides').addEventListener('click',()=>{$('wcproGuideMode').value='off';guide.mode='off';persist('wincreate6_perspective_v1',guide);drawPerspective();});
  app.on('canvasResize',drawPerspective);
  drawPerspective();

  let navPending=false,navDirty=false;
  const preview=$('wcproPreview'),previewCtx=preview.getContext('2d');
  function navVisible(){return !modal.hidden && activeTab==='navigator' && canRun();}
  function schedulePreview(immediate=false){if(!navVisible())return;navDirty=true;if(navPending)return;navPending=true;setTimeout(()=>{navPending=false;if(!navDirty||!navVisible())return;navDirty=false;updatePreview();},immediate?0:300);}
  function updatePreview(){const s=app.state;const width=Math.max(1,s.WIDTH),height=Math.max(1,s.HEIGHT);
    previewCtx.clearRect(0,0,preview.width,preview.height);
    const scale=Math.min(preview.width/width,preview.height/height),drawW=width*scale,drawH=height*scale,x=(preview.width-drawW)/2,y=(preview.height-drawH)/2;
    previewCtx.fillStyle='#151923';previewCtx.fillRect(0,0,preview.width,preview.height);
    if(s.bgVisible){previewCtx.fillStyle=s.bgColor||'#ffffff';previewCtx.fillRect(x,y,drawW,drawH);}
    for(const layer of s.layers){if(layer.isFolder||!layer.visible)continue;
      let parent=layer;let hidden=false;
      for(let i=0;i<12&&parent.parentId;i++){parent=s.layers.find(l=>l.id===parent.parentId);if(!parent)break;if(parent.visible===false)hidden=true;}
      if(hidden)continue;
      previewCtx.save();previewCtx.globalAlpha=clamp(layer.opacity??100,0,100)/100;previewCtx.globalCompositeOperation=layer.blend && layer.blend!=='normal'?layer.blend:'source-over';
      try{previewCtx.drawImage(app.createLayerComposite(layer),x,y,drawW,drawH);}catch(err){if(layer.canvas)previewCtx.drawImage(layer.canvas,x,y,drawW,drawH);}
      previewCtx.restore();
    }
    $('wcproDimensions').textContent=`${width} × ${height} px · ${s.layers.filter(l=>!l.isFolder).length} paint layers`;
  }
  app.on('strokeCommit',()=>schedulePreview());app.on('layersRendered',()=>schedulePreview());app.on('canvasResize',()=>schedulePreview(true));
  $('wcproNavFit').addEventListener('click',()=>app.fitCanvasFullscreen());
  $('wcproNavRefresh').addEventListener('click',()=>schedulePreview(true));
  app.proTools={open:openPanel,close:closePanel,showQuickMenu:toggleRadial,getGuide:()=>({...guide}),getColorHarmony:(hex,mode)=>harmony(hex,mode),refreshNavigator:()=>schedulePreview(true)};
})();
