/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
/* WinCreate Animation Studio — local, editable frame-by-frame projects. */
WinCreate.use(app => {
  'use strict';
  const MAX_BYTES = 256 * 1024 * 1024, MAX_FRAMES = 1200, MAX_FPS = 120;
  // Long clips reuse existing frames rather than duplicating large bitmap snapshots.
  const MAX_DURATION_SECONDS = 365 * 24 * 3600; // engineering safety bound; practical limit is encoder, storage and OS
  let enabled=false, suspended=false, frames=[], index=0, fps=24, loop=true, onion=true, onionAlpha=.22;
  let shared=[], past=[], future=[], playing=false, preview=false, loading=false, exporting=false;
  let dirtyFrame=true, revision=0, savedRevision=0, timer=0, raf=0, startTime=0, startTick=0;
  let audioData=null, sound=null, audioOffset=0, audioMuted=false, audioLoop=false, dragId=null;
  const cache=new Map(), encoded=new WeakMap();let cachedRasterBytes=0;
  const rasterCacheBytes=()=>window.WCPerf?.budget('rasterMB',48*1048576)||48*1048576;
  window.addEventListener('wcperformancechange',()=>{cache.clear();cachedRasterBytes=0;});
  const makeCanvas=(w=WIDTH,h=HEIGHT)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  const uid=()=>crypto.randomUUID?.() || 'frame-'+Date.now()+'-'+Math.random();
  const clamp=(v,min,max,fallback=min)=>Number.isFinite(+v)?Math.min(max,Math.max(min,+v)):fallback;
  const identity=()=>({x:0,y:0,scale:1,rotation:0,opacity:1,ease:'linear'});
  const blankFrame=snap=>({id:uid(),hold:1,key:null,snap});
  const editable=()=>!app.videoExport?.active&&!WC65.busy&&!app.layerMasks?.busy&&!loading&&!exporting&&!isDrawing&&!app.layerMasks?.busy&&!fillBusy&&!SHAPE_EDITOR.active;
  function ready(){if(!editable()){app.msg('Finish the current operation first');return false;} stop();return true;}
  function snapshot(){return captureStudioSnapshot();}
  function sync(){
    if(!enabled||suspended||!frames.length||loading||app.layerMasks?.busy)return;
    if(dirtyFrame){const snap=snapshot(),cel=frames[index].celId;frames=frames.map((f,i)=>i===index||cel&&f.celId===cel?{...f,snap}:f);dirtyFrame=false;}
    const src=frames[index].snap;
    // Shared layers are a single source of truth; other frames resolve these on display.
    shared=shared.filter(id=>src.layers.some(l=>l.id===id));
  }
  function resolved(i){
    const s=frames[i].snap, current=frames[index].snap;
    if(!shared.length)return s;
    const statics=current.layers.filter(l=>shared.includes(l.id));
    return {...s,layers:[...statics,...s.layers.filter(l=>!shared.includes(l.id))]};
  }
  function normalizeShared(){
    if(!shared.length)return;
    const all=frames.map((_,i)=>resolved(i));
    frames=frames.map((f,i)=>({...f,snap:all[i]}));
  }
  function memory(history=[]){
    const seen=new Set(),snapshots=new Set(),commands=new Set(),masks=new Set();let bytes=0;
    for(const f of [...frames,...history.flatMap(h=>h.frames)]){
      if(snapshots.has(f.snap))continue;snapshots.add(f.snap);
      for(const l of f.snap.layers){
        const mask=l.layerMask;if(mask&&!masks.has(mask)){masks.add(mask);bytes+=(mask.bitmap?.length||0)*2;for(const c of mask.commands||[])bytes+=((c.path?.length||0)+(c.clip?.length||0))*2+128;}
        if(l.data&&!seen.has(l.data)){seen.add(l.data);bytes+=l.data.data.byteLength;}
        for(const st of l.vectorStrokes||[])if(!commands.has(st)){commands.add(st);bytes+=WCPerf.commandBytes(st);}
      }
    }
    return bytes;
  }
  function state(){sync();normalizeShared();return {frames:frames.slice(),index,fps,loop,shared:shared.slice(),audioData,audioOffset,audioMuted,audioLoop,motion:app.motion?.capture()};}
  function beforeEdit(){
    if(!enabled||suspended||loading)return;
    if(playing||preview)stop();
    const entry=state(),previousFuture=future;past.push(entry);future=[];
    while(past.length>20 || (past.length>1&&memory(past)>MAX_BYTES))past.shift();
    dirtyFrame=true;return {entry,previousFuture};
  }
  function cancelEdit(token){if(token&&past.at(-1)===token.entry){past.pop();restoreState(token.entry);future=token.previousFuture;}}
  function dirty(){if(!enabled||suspended||loading)return;dirtyFrame=true;revision++;clearTimeout(timer);timer=setTimeout(refresh,240);}
  function changed(){dirty();app.markUnsavedChanges();refresh();}
  function restoreState(s){
    stop();({frames,index,fps,loop,shared,audioData,audioOffset,audioMuted,audioLoop}=s);
    app.motion?.restore(s.motion);frames=frames.slice();shared=shared.slice();dirtyFrame=false;setAudio();show(index,false);revision++;app.markUnsavedChanges();
  }
  function undo(){if(!ready())return;if(!past.length)return app.msg('Nothing to undo');future.push(state());restoreState(past.pop());app.msg('Animation undo');}
  function redo(){if(!ready())return;if(!future.length)return app.msg('Nothing to redo');past.push(state());restoreState(future.pop());app.msg('Animation redo');}
  function applySnapshot(s){
    restoreStudioSnapshot(s);
    selectedLayerIds.clear();if(activeLayerId)selectedLayerIds.add(activeLayerId);
    app.selectionPath=null;app.selectionPoints=null;
  }
  function show(i,commit=true){
    if(commit){sync();normalizeShared();}
    index=clamp(i,0,frames.length-1);
    loading=true;applySnapshot(resolved(index));loading=false;dirtyFrame=false;
    refresh();
  }
  function activate(){
    suspended=false;
    if(!enabled){enabled=true;frames=[blankFrame(snapshot())];index=0;past=[];future=[];dirtyFrame=false;revision++;}
    panel.hidden=false;document.body.classList.add('anim-workspace');$('animationModeBtn').classList.add('active');refresh();requestAnimationFrame(fitCanvasFullscreen);
  }
  function reset(){
    stop();enabled=false;suspended=false;frames=[];shared=[];past=[];future=[];index=0;dirtyFrame=true;audioData=null;audioLoop=false;setAudio();
    panel.hidden=true;document.body.classList.remove('anim-workspace');$('animationModeBtn')?.classList.remove('active');ghost.hidden=true;cache.clear();cachedRasterBytes=0;revision=0;savedRevision=0;
  }
  app.on('canvasInit',reset);
  window.addEventListener('resize',()=>{if(enabled&&!panel.hidden)requestAnimationFrame(fitCanvasFullscreen);});
  const panel=document.createElement('section');panel.id='animationStudio';panel.hidden=true;panel.setAttribute('aria-label','Animation timeline');
  panel.innerHTML=`<div class="anim-top"><div class="anim-heading"><span class="anim-badge">ANIMATE</span><strong>Animation Studio</strong><span id="animSummary"></span></div><div class="anim-actions"><button id="animFocus" aria-expanded="true" title="Collapse the timeline controls to give the canvas more space">Compact</button><button id="animHelp" title="Animation guide">?</button><button id="animDraw">Draw workspace</button></div></div>
  <div class="anim-controls">
    <button id="animFirst" title="First frame">|◀</button><button id="animPrev" title="Previous frame (comma)">◀</button><button id="animPlay" class="anim-primary">▶ Play</button><button id="animNext" title="Next frame (period)">▶</button>
    <label><input id="animLoop" type="checkbox" checked> Loop</label>
    <label>FPS <input id="animFps" type="number" min="1" max="120" value="24" list="animRates"></label><datalist id="animRates"><option value="6"><option value="12"><option value="24"><option value="30"><option value="60"><option value="120"></datalist>
    <span class="anim-divider"></span><button id="animAdd" title="New blank drawing (N)">＋ Drawing</button><button id="animDuplicate" title="Duplicate drawing (Shift+D)">Duplicate</button><button id="animBatch" title="Insert twelve blank drawings as one undoable action">＋ 12 drawings</button><button id="animDelete">Delete</button>
    <button id="animLeft" title="Move selected frame earlier">Move ←</button><button id="animRight" title="Move selected frame later">Move →</button>
    <label>Clip seconds <input id="animClipSeconds" type="number" min="0.008333" max="31536000" step="0.008333" value="1"></label><label>Total seconds <input id="animDuration" type="number" min="1" max="31536000" step="1" value="8"></label><button id="animSetDuration">Set duration</button><label>Hold <input id="animHold" type="number" min="1" max="3784320000" value="1"> ticks</label>
    <label><input id="animOnion" type="checkbox" checked> Onion skin</label><input id="animOnionAlpha" aria-label="Onion skin opacity" type="range" min="5" max="60" value="22">
  </div>
  <div class="anim-workflow"><div class="anim-rate-presets" role="group" aria-label="Playback frame rate"><span>Playback</span>${[12,24,30,60,120].map(rate=>`<button type="button" data-fps="${rate}" aria-pressed="${rate===24}">${rate}<small>fps</small></button>`).join('')}</div><div class="anim-jump"><button id="animJumpPrev" title="Previous drawing">←</button><label>Drawing <input id="animJump" aria-label="Go to drawing number" type="number" min="1" max="1200" value="1"></label><span id="animFrameCount">/ 1</span><button id="animJumpNext" title="Next drawing">→</button></div><span id="animCapacity" role="status"></span></div><div id="animFrames" role="listbox" aria-label="Animation frames"></div>
  <div class="anim-bottom"><input id="animScrub" type="range" min="0" max="0" value="0" aria-label="Scrub animation"><output id="animTime">0.00s</output><button id="animPreview">Preview pose</button><button id="animSave">Save project</button><select id="animExportType" aria-label="Export format"><option value="webm">Video · WebM + audio</option><option value="mp4">Video · MP4 + audio</option><option value="gif">Animated GIF · up to 50 FPS</option><option value="png">PNG sequence (.zip)</option></select><button id="animExport" class="anim-primary">Export</button><span id="animStatus" role="status" aria-live="polite"></span></div>
  <details id="animAdvanced"><summary>Background layers · motion keyframes · audio · export settings</summary><div class="anim-settings">
    <div class="anim-setting"><strong>Shared background</strong><span>Pin an ungrouped layer across every frame, beneath the animation.</span><select id="animLayer" aria-label="Layer to share"></select><button id="animPin">Pin / unpin layer</button><small id="animShared"></small></div>
    <div class="anim-setting"><strong>Motion keyframe · selected frame</strong><span>Transforms all animated layers together during preview and export. Draw in the original pose.</span><div class="anim-key-fields"><label>X <input id="animX" type="number" value="0"></label><label>Y <input id="animY" type="number" value="0"></label><label>Scale % <input id="animScale" type="number" min="1" max="1000" value="100"></label><label>Rotate ° <input id="animRotation" type="number" value="0"></label><label>Opacity % <input id="animOpacity" type="number" min="0" max="100" value="100"></label></div><select id="animEase" aria-label="Keyframe easing"><option value="linear">Linear</option><option value="smooth">Ease in / out</option><option value="hold">Hold pose</option></select><button id="animSetKey">Set keyframe</button><button id="animRemoveKey">Remove keyframe</button></div>
    <div class="anim-setting"><strong>Audio soundtrack</strong><span>Audio is saved in the project and included in video exports. GIF / PNG exports are silent.</span><input id="animAudioFile" type="file" accept="audio/*"><small id="animAudioName">No audio</small><label>Start offset (s) <input id="animAudioOffset" type="number" min="0" max="3600" step="0.1" value="0"></label><label><input id="animMute" type="checkbox"> Mute</label><label><input id="animAudioLoop" type="checkbox"> Loop soundtrack</label><button id="animRemoveAudio">Remove audio</button></div>
    <div class="anim-setting"><strong>Export</strong><label>Encoding<select id="animVideoQuality"><option value="fast">Balanced · faster</option><option value="high">Best detail · slower</option></select></label><label>Maximum edge <select id="animExportSize"><option value="512">512 px</option><option value="1024">1024 px</option><option value="1280" selected>1280 px · HD</option><option value="1920">1920 px · Full HD</option><option value="0">Original size</option></select></label><span>Video encodes every frame with synchronized audio. Keep this tab open; hidden tabs pause automatically. GIF/PNG remain available for short clips.</span><button id="animCancel" hidden>Cancel export</button></div>
  </div></details>`;
  $('pageStudio').appendChild(panel);
  const timing=document.createElement('details');timing.className='anim-timing';timing.innerHTML='<summary>Drawing timing &amp; total duration</summary><div class="anim-timing-fields"></div>';
  for(const id of ['animClipSeconds','animDuration','animSetDuration','animHold']){const el=$(id);timing.lastElementChild.append(el.closest('label')||el);}
  panel.insertBefore(timing,$('animAdvanced'));
  const controls=panel.querySelector('.anim-controls');
  for(const [className,ids] of [['anim-transport',['animFirst','animPrev','animPlay','animNext','animLoop','animFps']],['anim-edit-actions',['animAdd','animDuplicate','animBatch','animDelete','animLeft','animRight']],['anim-onion-controls',['animOnion','animOnionAlpha']]]){
    const group=document.createElement('div');group.className=className;for(const id of ids){const el=$(id);group.append(el.closest('label')||el);}controls.append(group);
  }
  controls.querySelector('.anim-divider')?.remove();

  let previousPanelHeight=0;new ResizeObserver(()=>{const height=panel.hidden?0:panel.getBoundingClientRect().height+(document.body.classList.contains('studio-v5')?0:24);document.body.style.setProperty('--animation-height',height+'px');if(Math.abs(height-previousPanelHeight)>2&&document.body.classList.contains('studio-v5'))requestAnimationFrame(fitCanvasFullscreen);previousPanelHeight=height;}).observe(panel);
  app.registerToolbarButton({id:'animationModeBtn',label:'<span>Animate</span>',title:'Open Animation Studio',onClick:()=>{if(ready())activate();}});
  const ghost=makeCanvas(), screen=makeCanvas();ghost.id='animGhost';screen.id='animScreen';ghost.hidden=true;screen.hidden=true;
  board.append(ghost,screen);
  // Capture on the document so plug-in capture handlers cannot draw into playback.
  document.addEventListener('pointerdown',e=>{if((playing||preview||loading||exporting)&&viewportEl.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();if(!loading&&!exporting){stop();app.msg('Preview stopped — draw in the original pose');}}},true);
  document.addEventListener('click',e=>{if((loading||exporting)&&!panel.contains(e.target)&&!e.target.closest('#videoExportDialog,.wc-save-dialog,a[data-wc-export="file"]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{if((loading||exporting)&&!e.target.closest('#videoExportDialog,.wc-save-dialog')){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape')cancelExport=true;}},true);
  const $a=id=>$(id);
  const bind=(id,fn)=>$a(id).addEventListener('click',()=>{if(ready())fn();});
  function timecode(t){const ticks=Math.max(0,Math.floor(t)),seconds=Math.floor(ticks/fps),pad=n=>String(n).padStart(2,'0');return (seconds>=3600?pad(Math.floor(seconds/3600))+':':'')+pad(Math.floor(seconds/60)%60)+':'+pad(seconds%60)+':'+pad(ticks%fps);}
  function starts(){let t=0;return frames.map(f=>{const a=t;t+=f.hold;return a;});}
  const total=()=>frames.reduce((s,f)=>s+f.hold,0);
  function frameAt(t){const st=starts();let i=0;while(i+1<st.length&&st[i+1]<=t)i++;return i;}
  function pose(t){
    const st=starts(),keys=frames.map((f,i)=>f.key?{t:st[i],k:f.key}:null).filter(Boolean);
    if(!keys.length)return identity();
    let a=keys[0],b=keys[keys.length-1];
    if(t<=a.t)return a.k;if(t>=b.t)return b.k;
    for(let i=1;i<keys.length;i++)if(keys[i].t>t){a=keys[i-1];b=keys[i];break;}
    let u=(t-a.t)/(b.t-a.t);if(a.k.ease==='hold')u=0;else if(a.k.ease==='smooth')u=u*u*(3-2*u);
    const out={ease:a.k.ease};for(const k of ['x','y','scale','rotation','opacity'])out[k]=a.k[k]+(b.k[k]-a.k[k])*u;return out;
  }
  function raster(l){
    if(cache.has(l)){const c=cache.get(l);cache.delete(l);cache.set(l,c);return c;}
    const c=makeCanvas(l.data?.width||WIDTH,l.data?.height||HEIGHT);if(l.data)c.getContext('2d').putImageData(l.data,0,0);app.paintVectorStrokesToContext(c.getContext('2d'),l);window.WC65Effects?.apply(c.getContext('2d'),l);WCLayerMasks.apply(c.getContext('2d'),l,c.width,c.height);
    const bytes=c.width*c.height*4;
    while(cache.size && cachedRasterBytes+bytes>rasterCacheBytes()){const key=cache.keys().next().value,old=cache.get(key);cachedRasterBytes-=old.width*old.height*4;cache.delete(key);}
    if(bytes<=rasterCacheBytes()){cache.set(l,c);cachedRasterBytes+=bytes;}return c;
  }
  function paintLayers(ctx,s,list,t=0){
    for(const l of list){if(l.isFolder||l.visible===false)continue;const parent=s.layers.find(p=>p.isFolder&&p.id===l.parentId);if(parent?.visible===false)continue;
      let image=raster(l);if(parent?.layerMask){const masked=makeCanvas(image.width,image.height);masked.getContext('2d').drawImage(image,0,0);WCLayerMasks.apply(masked.getContext('2d'),parent);image=masked;}
      ctx.save();ctx.globalAlpha=(l.opacity??100)/100*(parent?.opacity??100)/100;ctx.globalCompositeOperation=l.blend==='normal'?'source-over':l.blend||'source-over';if(app.motion)app.motion.draw(ctx,image,l,t/fps,total()/fps,(s.layers.indexOf(l)+1)/Math.max(1,s.layers.length));else ctx.drawImage(image,0,0);ctx.restore();
    }
  }
  const renderSurfaces=new Map();
  function composite(i,t,background=true,w=WIDTH,h=HEIGHT,animatedOnly=false,reuse=false){
    const key=w+'x'+h;let pool=reuse?renderSurfaces.get(key):null;if(reuse&&!pool){pool={main:makeCanvas(w,h),group:makeCanvas(w,h)};if(renderSurfaces.size>2)renderSurfaces.clear();renderSurfaces.set(key,pool);}
    const c=pool?pool.main:makeCanvas(w,h),ctx=c.getContext('2d'),s=resolved(i);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.scale(w/WIDTH,h/HEIGHT);
    if(background&&s.bgVisible){ctx.fillStyle=s.bgColor;ctx.fillRect(0,0,WIDTH,HEIGHT);}
    app.motion?.applyCamera(ctx,t/fps,total()/fps,WIDTH,HEIGHT);
    if(!animatedOnly)paintLayers(ctx,s,s.layers.filter(l=>shared.includes(l.id)),t);
    const p=pose(t);ctx.save();ctx.translate(WIDTH/2+p.x,HEIGHT/2+p.y);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.scale,p.scale);ctx.translate(-WIDTH/2,-HEIGHT/2);
    // Render into a group so opacity also applies to overlaps between layers.
    const group=pool?pool.group:makeCanvas(w,h),gc=group.getContext('2d');gc.setTransform(1,0,0,1,0,0);gc.clearRect(0,0,w,h);gc.scale(w/WIDTH,h/HEIGHT);paintLayers(gc,s,s.layers.filter(l=>!shared.includes(l.id)),t);
    ctx.globalAlpha=p.opacity;ctx.drawImage(group,0,0,WIDTH,HEIGHT);ctx.restore();return c;
  }
  function updateGhost(){
    ghost.width=WIDTH;ghost.height=HEIGHT;ghost.hidden=!enabled||!onion||playing||preview||panel.hidden;
    if(ghost.hidden)return;const ctx=ghost.getContext('2d'),st=starts();
    for(const [i,color] of [[index-1,'#ff657a'],[index+1,'#52c9ff']]){
      if(i<0||i>=frames.length)continue;
      const c=composite(i,st[i],false,WIDTH,HEIGHT,true),x=c.getContext('2d');x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,WIDTH,HEIGHT);ctx.globalAlpha=onionAlpha;ctx.drawImage(c,0,0);
    }
  }
  function refresh(){
    if(!enabled||suspended||loading||playing||exporting||isDrawing||app.layerMasks?.busy||fillBusy)return;sync();
    $('animFps').value=fps;$('animLoop').checked=loop;$('animHold').value=frames[index].hold;$('animClipSeconds').value=+(frames[index].hold/fps).toFixed(3);if(document.activeElement!==$('animDuration'))$('animDuration').value=+(total()/fps).toFixed(3);
    $('animJump').value=index+1;$('animJump').max=frames.length;$('animFrameCount').textContent='/ '+frames.length;
    const used=memory();$('animCapacity').textContent=`${frames.length.toLocaleString()} / ${MAX_FRAMES.toLocaleString()} drawings · ${Math.ceil(used/1024/1024)} / 256 MB`;
    panel.querySelectorAll('[data-fps]').forEach(b=>{b.classList.toggle('is-active',+b.dataset.fps===fps);b.setAttribute('aria-pressed',String(+b.dataset.fps===fps));});
    $('animOnion').checked=onion;$('animOnionAlpha').value=onionAlpha*100;
    const st=starts();$('animSummary').textContent=`${frames.length} drawing clip${frames.length===1?'':'s'} · ${timecode(total())}`;
    $('animScrub').max=total()-1;$('animScrub').value=st[index];$('animTime').textContent=timecode(st[index]);
    const list=$('animFrames');list.replaceChildren();
    const from=Math.max(0,index-24),to=Math.min(frames.length,index+25);
    if(from>0){const b=document.createElement('button');b.textContent='← Earlier clips';b.onclick=()=>{if(ready())show(Math.max(0,index-25));};list.append(b);}
    frames.forEach((f,i)=>{if(i<from||i>=to)return;
      const b=document.createElement('button');b.className='anim-frame'+(i===index?' selected':'');b.draggable=true;b.dataset.id=f.id;b.setAttribute('role','option');b.setAttribute('aria-selected',String(i===index));b.setAttribute('aria-label',`Frame ${i+1}, ${f.hold} ticks${f.key?', motion keyframe':''}`);
      const scale=Math.min(96/WIDTH,64/HEIGHT);const thumb=composite(i,st[i],true,Math.max(1,Math.round(WIDTH*scale)),Math.max(1,Math.round(HEIGHT*scale)));
      const number=document.createElement('strong');number.className='anim-frame-number';number.textContent=String(i+1).padStart(2,'0');b.append(number);
      const wrap=document.createElement('div');wrap.className='anim-thumb';wrap.append(thumb);const label=document.createElement('span');label.textContent=`${String(i+1).padStart(2,'0')} · ${f.hold} tick${f.hold===1?'':'s'} ${f.key?'◆':''}`;b.append(wrap,label);
      b.onclick=()=>{if(ready())show(i);};b.ondragstart=e=>{dragId=f.id;e.dataTransfer.setData('text/plain',f.id);};b.ondragover=e=>e.preventDefault();b.ondrop=e=>{e.preventDefault();if(ready())reorder(frames.findIndex(x=>x.id===dragId),i);};list.append(b);
    });
    if(to<frames.length){const b=document.createElement('button');b.textContent='Later clips →';b.onclick=()=>{if(ready())show(Math.min(frames.length-1,index+25));};list.append(b);}
    app.emit('animationRefresh',{index,fps,duration:total()/fps,frameCount:frames.length});
    const select=$('animLayer'),previous=select.value;select.replaceChildren();
    layers.filter(l=>!l.isFolder&&!l.parentId).forEach(l=>{const o=document.createElement('option');o.value=l.id;o.textContent=(shared.includes(l.id)?'● ':'')+l.name;select.append(o);});if([...select.options].some(o=>o.value===previous))select.value=previous;
    $('animShared').textContent=shared.length?`${shared.length} shared layer(s)`:'No shared layers';
    const k=frames[index].key||pose(st[index]);for(const [id,v] of Object.entries({animX:k.x,animY:k.y,animScale:k.scale*100,animRotation:k.rotation,animOpacity:k.opacity*100}))$(id).value=Math.round(v*100)/100;
    $('animEase').value=k.ease;$('animAudioName').textContent=audioData?.name||'No audio';$('animAudioOffset').value=audioOffset;$('animMute').checked=audioMuted;$('animAudioLoop').checked=audioLoop;updateGhost();
  }
  function add(duplicate,count=1){
    sync();normalizeShared();count=Math.round(clamp(count,1,1200,1));
    if(frames.length+count>MAX_FRAMES){app.msg(`Keep up to ${MAX_FRAMES.toLocaleString()} drawings per animation`);return;}
    if(memory()>=MAX_BYTES){app.msg('Animation memory limit reached. Use fewer layers or a smaller canvas.');return;}
    beforeEdit();const source=frames[index].snap;
    const snap=duplicate?source:{...source,layers:source.layers.map(l=>l.isFolder||shared.includes(l.id)?l:{...l,vectorStrokes:[],data:null,layerMask:null})};
    const added=Array.from({length:count},()=>blankFrame(snap));const target=index+1;
    frames.splice(target,0,...added);show(target,false);changed();
  }
  function reorder(from,to){if(from<0||to<0||to>=frames.length||from===to)return;beforeEdit();const active=frames[index].id;frames.splice(to,0,frames.splice(from,1)[0]);index=frames.findIndex(f=>f.id===active);changed();}
  bind('animAdd',()=>add(false));bind('animBatch',()=>add(false,12));
  bind('animJumpPrev',()=>show(Math.max(0,index-1)));bind('animJumpNext',()=>show(Math.min(frames.length-1,index+1)));
  $('animJump').onchange=()=>{if(ready())show(Math.round(clamp($('animJump').value,1,frames.length,1))-1);};
  for(const b of panel.querySelectorAll('[data-fps]'))b.onclick=()=>{if(ready()){beforeEdit();fps=+b.dataset.fps;changed();}};bind('animDuplicate',()=>add(true));
  bind('animDelete',()=>{if(frames.length===1)return app.msg('Keep at least one frame');beforeEdit();frames.splice(index,1);show(Math.min(index,frames.length-1),false);changed();});
  bind('animLeft',()=>reorder(index,index-1));bind('animRight',()=>reorder(index,index+1));
  bind('animFirst',()=>show(0));bind('animPrev',()=>show(Math.max(0,index-1)));bind('animNext',()=>show(Math.min(frames.length-1,index+1)));
  bind('animDraw',()=>{panel.hidden=true;document.body.classList.remove('anim-workspace');$('animationModeBtn').classList.remove('active');ghost.hidden=true;});
  function setting(id,fn){$(id).addEventListener('change',()=>{if(!ready())return;beforeEdit();fn();changed();});}
  setting('animFps',()=>fps=Math.round(clamp($('animFps').value,1,MAX_FPS,24)));
  setting('animHold',()=>frames[index]={...frames[index],hold:Math.round(clamp($('animHold').value,1,MAX_DURATION_SECONDS*fps,1))});
  setting('animClipSeconds',()=>frames[index]={...frames[index],hold:Math.max(1,Math.round(clamp($('animClipSeconds').value,1/MAX_FPS,MAX_DURATION_SECONDS,1)*fps))});
  bind('animSetDuration',()=>{const ticks=Math.round(clamp($('animDuration').value,1,MAX_DURATION_SECONDS,8)*fps),other=total()-frames[frames.length-1].hold;if(ticks<=other)return app.msg('Earlier clips already exceed this duration. Shorten those first.');beforeEdit();frames[frames.length-1]={...frames[frames.length-1],hold:ticks-other};changed();});
  setting('animLoop',()=>loop=$('animLoop').checked);
  $('animOnion').onchange=()=>{onion=$('animOnion').checked;updateGhost();};$('animOnionAlpha').oninput=()=>{onionAlpha=+$('animOnionAlpha').value/100;updateGhost();};
  bind('animPin',()=>{
    const l=layers.find(l=>String(l.id)===$('animLayer').value);if(!l||l.parentId||l.isFolder)return;
    beforeEdit();normalizeShared();if(shared.includes(l.id))shared=shared.filter(id=>id!==l.id);else shared.push(l.id);normalizeShared();show(index,false);changed();
  });
  bind('animSetKey',()=>{beforeEdit();frames[index]={...frames[index],key:{x:clamp($('animX').value,-32768,32768,0),y:clamp($('animY').value,-32768,32768,0),scale:clamp($('animScale').value,1,1000,100)/100,rotation:clamp($('animRotation').value,-36000,36000,0),opacity:clamp($('animOpacity').value,0,100,100)/100,ease:$('animEase').value}};changed();});
  bind('animRemoveKey',()=>{beforeEdit();frames[index]={...frames[index],key:null};changed();});
  function setAudio(){if(sound){sound.pause();sound.src='';}sound=audioData?new Audio(audioData.data):null;if(sound)sound.loop=audioLoop;}
  $('animAudioFile').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file||!ready())return;
    if(file.size>10*1024*1024||!file.type.startsWith('audio/'))return app.msg('Choose an audio file smaller than 10 MB');
    try{const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});beforeEdit();audioData={name:file.name,data};setAudio();changed();}catch{app.msg('Could not read audio');}
  };
  setting('animAudioOffset',()=>audioOffset=clamp($('animAudioOffset').value,0,3600,0));setting('animMute',()=>audioMuted=$('animMute').checked);setting('animAudioLoop',()=>{audioLoop=$('animAudioLoop').checked;if(sound)sound.loop=audioLoop;});
  bind('animRemoveAudio',()=>{beforeEdit();audioData=null;audioLoop=false;setAudio();changed();});
  function previewTick(t){if(screen.width!==WIDTH||screen.height!==HEIGHT){screen.width=WIDTH;screen.height=HEIGHT;}const sc=screen.getContext('2d');sc.clearRect(0,0,WIDTH,HEIGHT);sc.drawImage(composite(frameAt(t),t,true,WIDTH,HEIGHT,false,true),0,0);screen.hidden=false;ghost.hidden=true;$('animScrub').value=Math.floor(t);$('animTime').textContent=timecode(t);}
  function syncAudio(seconds,force=false){
    if(!sound)return;let t=seconds-audioOffset;if(audioLoop&&t>=0&&Number.isFinite(sound.duration)&&sound.duration>0)t%=sound.duration;
    if(audioMuted||t<0){sound.pause();return;}
    if(force||Math.abs(sound.currentTime-t)>.2){try{sound.currentTime=t;}catch{}}
    if(sound.paused&&(!Number.isFinite(sound.duration)||t<sound.duration))sound.play().catch(()=>{$('animStatus').textContent='Audio unavailable — check format or browser playback permission';});
  }
  function stop(){cancelAnimationFrame(raf);playing=false;preview=false;if(sound)sound.pause();screen.hidden=true;$('animPlay').textContent='▶ Play';if(enabled&&frames.length){$('animScrub').value=starts()[index];$('animTime').textContent=timecode(starts()[index]);updateGhost();}}
  function play(){
    if(playing){stop();return;}if(!ready()||!enabled)return;sync();normalizeShared();playing=true;startTick=starts()[index];startTime=performance.now();$('animPlay').textContent='❚❚ Pause';syncAudio(startTick/fps,true);
    let previous=-1,lastLoop=0;
    function step(now){if(!playing)return;let t=startTick+(now-startTime)*fps/1000;const n=total();if(!loop&&t>=n){previewTick(n-1);stop();show(frames.length-1);return;}
      const cycle=Math.floor(t/n);t=t%n;syncAudio(t/fps,cycle!==lastLoop);lastLoop=cycle;
      const tick=Math.floor(t);if(tick!==previous){previewTick(tick);previous=tick;}raf=requestAnimationFrame(step);
    }raf=requestAnimationFrame(step);
  }
  $('animFocus').onclick=()=>{const compact=panel.classList.toggle('anim-compact');$('animFocus').textContent=compact?'Expand':'Compact';$('animFocus').setAttribute('aria-expanded',String(!compact));requestAnimationFrame(fitCanvasFullscreen);};
  $('animPlay').onclick=play;bind('animPreview',()=>{sync();preview=true;previewTick(starts()[index]);});
  $('animScrub').oninput=()=>{if(!editable())return;stop();sync();preview=true;previewTick(+$('animScrub').value);};
  $('animScrub').onchange=()=>{const t=+$('animScrub').value;stop();show(frameAt(t));};
  $('animSave').onclick=()=>{if(ready())app.saveProjectNative(false);};
  document.addEventListener('keydown',e=>{
    if(!enabled||panel.hidden||e.target.closest('input,textarea,select,button,summary,[role=button],[contenteditable=true]')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Escape'){stop();return;}
    if(e.key.toLowerCase()==='n'&&!e.shiftKey){e.preventDefault();if(ready())add(false);return;}
    if(e.key.toLowerCase()==='d'&&e.shiftKey){e.preventDefault();if(ready())add(true);return;}
    if(e.key==='Enter'){e.preventDefault();play();}
    if(e.key===','||e.key==='.'){e.preventDefault();if(ready())show(clamp(index+(e.key===','?-1:1),0,frames.length-1));}
  });
  $('animHelp').onclick=()=>app.msg('N: new drawing · Shift+D: duplicate · comma/period: previous/next · Enter: play. Up to 1,200 drawings and 120 FPS, within the memory budget.');
  function encodeSnap(s){
    if(encoded.has(s))return encoded.get(s);
    const out={...s,layers:s.layers.map(l=>{if(l.isFolder)return {...l};const {data,...props}=l;if(!data)return {...props,emptyRaster:true,pngData:null};const c=makeCanvas(s.WIDTH,s.HEIGHT);c.getContext('2d').putImageData(data,0,0);return {...props,pngData:c.toDataURL('image/png')};})};encoded.set(s,out);return out;
  }
  function serialize(){if(!enabled||suspended)return null;sync();normalizeShared();return {version:1,fps,loop,index,shared:shared.slice(),motion:app.motion?.capture(),audio:audioData,audioOffset,audioMuted,audioLoop,frames:(()=>{const cels=new Set();return frames.map(f=>{if(f.celId&&cels.has(f.celId))return {...f,snap:null,snapRef:f.celId};if(f.celId)cels.add(f.celId);return {...f,snap:encodeSnap(f.snap)};});})()};}
  async function load(item){
    if(!editable())throw Error('Finish the current operation first');
    let a=item.animation;if(a?.frames){const sources=new Map(a.frames.filter(f=>f.snap&&f.celId).map(f=>[f.celId,f.snap]));a={...a,frames:a.frames.map(f=>f.snap?f:{...f,snap:sources.get(f.snapRef)})};}const w=+item.width,h=+item.height,importedFPS=Math.round(clamp(item.animation?.fps,1,MAX_FPS,24));
    if(!a||a.version!==1||!Array.isArray(a.frames)||!a.frames.length||a.frames.length>MAX_FRAMES||!Number.isInteger(w)||!Number.isInteger(h)||w<200||h<200||w>4096||h>4096)throw Error('Invalid animation dimensions or frame count');
    let count=0;const countedCels=new Set();for(const f of a.frames){if(!f.snap||!Array.isArray(f.snap.layers)||f.snap.layers.length>160)throw Error('Invalid frame layers');if(f.celId&&countedCels.has(f.celId))continue;if(f.celId)countedCels.add(f.celId);count+=f.snap.layers.filter(l=>!l.isFolder&&!(l.emptyRaster===true&&l.pngData===null)).length;}
    if(count*w*h*4>MAX_BYTES)throw Error('Animation exceeds the 256 MB decoded pixel limit');
    const safePng=v=>typeof v==='string'&&/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(v)&&v.length<64*1024*1024;
    if(a.audio&&(!/^data:audio\/[\w.+-]+;base64,[a-z0-9+/=]+$/i.test(a.audio.data)||a.audio.data.length>14*1024*1024))throw Error('Invalid audio');
    stop();loading=true;$('animStatus').textContent='Opening animation…';
    try{
      const decoded=[],celSnapshots=new Map();await app.prepareRasterCommands(a.frames.flatMap(f=>f.snap.layers));
      for(const f of a.frames){
        if(f.celId&&celSnapshots.has(f.celId)){decoded.push({...celSnapshots.get(f.celId),id:uid(),hold:Math.round(clamp(f.hold,1,MAX_DURATION_SECONDS*importedFPS,1)),label:String(f.label||'').slice(0,100),group:String(f.group||'').slice(0,100),key:f.key||null});continue;}
        const ls=[];const ids=new Set();for(const l of f.snap.layers){
          if(!l||!['number','string'].includes(typeof l.id)||ids.has(l.id)||typeof l.name!=='string'||l.name.length>500)throw Error('Invalid layer metadata');ids.add(l.id);
          if(l.vectorStrokes){if(!Array.isArray(l.vectorStrokes)||l.vectorStrokes.length>50000)throw Error('Too many vector strokes');for(const stroke of l.vectorStrokes){if(!Array.isArray(stroke.points)||stroke.points.length>100000||stroke.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('Invalid vector points');}}
          if(l.isFolder){ls.push({...l});continue;}if(l.emptyRaster===true&&l.pngData===null){const {pngData,...props}=l;ls.push({...props,data:null});continue;}if(!safePng(l.pngData))throw Error('Invalid frame image');
          const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Damaged frame image'));i.src=l.pngData;});
          if(img.width!==w||img.height!==h)throw Error('Frame image dimensions do not match');
          const c=makeCanvas(w,h);c.getContext('2d').drawImage(img,0,0);const {pngData,...props}=l;ls.push({...props,vectorStrokes:Array.isArray(l.vectorStrokes)?l.vectorStrokes:[],data:c.getContext('2d').getImageData(0,0,w,h)});
        }
        let key=null;if(f.key){key={};for(const [k,lo,hi,d] of [['x',-32768,32768,0],['y',-32768,32768,0],['scale',.01,10,1],['rotation',-36000,36000,0],['opacity',0,1,1]])key[k]=clamp(f.key[k],lo,hi,d);key.ease=['linear','smooth','hold'].includes(f.key.ease)?f.key.ease:'linear';}
        decoded.push({celId:typeof f.celId==='string'?f.celId:null,label:String(f.label||'').slice(0,100),group:String(f.group||'').slice(0,100),id:uid(),hold:Math.round(clamp(f.hold,1,MAX_DURATION_SECONDS*importedFPS,1)),key,snap:{...f.snap,type:'full',WIDTH:w,HEIGHT:h,layers:ls}});if(f.celId)celSnapshots.set(f.celId,decoded.at(-1));
      }
      app.initializeStudioCanvas(item.title||'Animation',w,h,item.bgColor||'#ffffff',true);
      enabled=true;frames=decoded;index=Math.round(clamp(a.index,0,frames.length-1));fps=Math.round(clamp(a.fps,1,MAX_FPS,24));loop=a.loop!==false;shared=Array.isArray(a.shared)?a.shared:[];audioData=a.audio||null;audioOffset=clamp(a.audioOffset,0,3600,0);audioMuted=!!a.audioMuted;audioLoop=!!a.audioLoop;past=[];future=[];app.motion?.restore(a.motion);setAudio();dirtyFrame=false;loading=false;activate();show(index,false);savedRevision=revision;
      requestAnimationFrame(()=>app.workspaces?.openAnimation(app.motion?.hasMotion?'motion':'animate'));
    }finally{loading=false;$('animStatus').textContent='';}
  }
  setInterval(async()=>{if(enabled&&!loading&&!exporting&&!isDrawing&&!app.layerMasks?.busy&&!fillBusy&&!SHAPE_EDITOR.active&&revision!==savedRevision){const r=revision;const ok=await app.saveRecoveryCheckpoint?.('Animation Auto-Recovery');if(ok)savedRevision=r;}},15000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();if(enabled&&revision!==savedRevision&&!loading&&!isDrawing&&!app.layerMasks?.busy&&!fillBusy)app.saveRecoveryCheckpoint?.('Animation Background Recovery');}});
  let cancelExport=false;
  const download = (blob, name) => app.exports.save(blob, name, 'files', { mime: blob.type, pickFile: false });
  const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
  // Stored ZIP: PNG compression already provides compressed payloads.
  const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  const crc32=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
  function zip(files){let offset=0;const local=[],central=[];for(const f of files){const name=new TextEncoder().encode(f.name),crc=crc32(f.data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,f.data.length,true);v.setUint32(22,f.data.length,true);v.setUint16(26,name.length,true);h.set(name,30);local.push(h,f.data);const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint32(16,crc,true);d.setUint32(20,f.data.length,true);d.setUint32(24,f.data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);central.push(c);offset+=h.length+f.data.length;}
    const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,central.reduce((s,c)=>s+c.length,0),true);v.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/zip'});
  }
  function gifHeader(w,h){const b=[...new TextEncoder().encode('GIF89a'),w&255,w>>8,h&255,h>>8,247,0,0];for(let i=0;i<256;i++)b.push(Math.round(((i>>5)&7)*255/7),Math.round(((i>>2)&7)*255/7),i===1?0:Math.round((i&3)*255/3));if(loop)b.push(33,255,11,...new TextEncoder().encode('NETSCAPE2.0'),3,1,0,0,0);return new Uint8Array(b);}
  function gifFrame(c,delay){
    const {width:w,height:h}=c,rgba=c.getContext('2d').getImageData(0,0,w,h).data;
    // Reset LZW before code size grows: valid bounded-memory 9-bit GIF stream.
    const codes=[];let bits=0,acc=0,count=0;const write=n=>{acc|=n<<bits;bits+=9;while(bits>=8){codes.push(acc&255);acc>>>=8;bits-=8;}};write(256);
    for(let p=0;p<rgba.length;p+=4){if(count===200){write(256);count=0;}let color=rgba[p+3]<128?0:((rgba[p]>>5)<<5)|((rgba[p+1]>>5)<<2)|(rgba[p+2]>>6);if(color===0&&rgba[p+3]>=128)color=1;write(color);count++;}write(257);if(bits)codes.push(acc&255);
    const header=new Uint8Array([33,249,4,9,delay&255,delay>>8,0,0,44,0,0,0,0,w&255,w>>8,h&255,h>>8,0,8]),blocks=[];
    for(let i=0;i<codes.length;i+=255){const chunk=codes.slice(i,i+255);blocks.push(new Uint8Array([chunk.length,...chunk]));}return [header,...blocks,new Uint8Array([0])];
  }
  $('animCancel').onclick=()=>cancelExport=true;
  $('animExport').onclick=async()=>{
    if(!ready())return;sync();normalizeShared();const n=total(),edge=+$('animExportSize').value,ratio=edge?Math.min(1,edge/Math.max(WIDTH,HEIGHT)):1,w=Math.max(1,Math.round(WIDTH*ratio)),h=Math.max(1,Math.round(HEIGHT*ratio)),type=$('animExportType').value;
    if(type==='webm'||type==='mp4'){
      exporting=true;cancelExport=false;$('animExport').disabled=true;
      try{const result=await app.videoExport.run({format:type,quality:$('animVideoQuality').value,width:w,height:h,fps,duration:n/fps,render:(seconds,rw,rh)=>composite(frameAt(Math.min(n-1,seconds*fps)),Math.min(n-1,seconds*fps),true,rw,rh,false,true),audio:audioData,audioOffset,audioLoop,muted:audioMuted,isCancelled:()=>cancelExport,onProgress:p=>$('animStatus').textContent='Rendering '+Math.round(p*100)+'%'});$('animStatus').textContent=result.cancelled?'Export cancelled':result.message || 'Video saved';}
      catch(e){$('animStatus').textContent=e.message;app.msg(e.message);}
      finally{exporting=false;$('animExport').disabled=false;}return;
    }
    if(type==='gif'&&fps>50){app.msg('Use WebM, MP4 or PNG sequence above 50 FPS. GIF timing cannot preserve this rate.');return;}
    if(n>4000||w*h*n>150000000){app.msg('Export is too large. Reduce size, holds or frames (150 million pixels per export).');return;}
    exporting=true;cancelExport=false;$('animCancel').hidden=false;$('animExport').disabled=true;
    try{
      const chunks=type==='gif'?[gifHeader(w,h)]:[],files=[];
      for(let t=0;t<n;t++){
        if(cancelExport)throw Error('Export cancelled');const c=composite(frameAt(t),t,true,w,h,false,true);
        if(type==='gif'){const delay=Math.max(1,Math.round((t+1)*100/fps)-Math.round(t*100/fps));chunks.push(...gifFrame(c,delay));}
        else{const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG encoding failed');files.push({name:`frame_${String(t+1).padStart(5,'0')}.png`,data:new Uint8Array(await blob.arrayBuffer())});}
        $('animStatus').textContent=`Exporting ${t+1} / ${n}`;await yieldUI();
      }
      let saved;
      if(type==='gif'){chunks.push(new Uint8Array([59]));saved=await download(new Blob(chunks,{type:'image/gif'}),'WinCreate_Animation.gif');}
      else{files.push({name:'timing.json',data:new TextEncoder().encode(JSON.stringify({fps,loop,width:w,height:h,frameCount:n,audioIncluded:false},null,2))});saved=await download(zip(files),'WinCreate_PNG_Sequence.zip');}
      $('animStatus').textContent=saved.message;
    }catch(e){$('animStatus').textContent=e.message;}finally{exporting=false;$('animCancel').hidden=true;$('animExport').disabled=false;}
  };
  app.on('motionChange',()=>{if(enabled)changed();});
  app.animation={get estimatedBytes(){sync();return memory();},get enabled(){return enabled;},get suspended(){return suspended;},suspend(){sync();suspended=true;clearTimeout(timer);stop();panel.hidden=true;},resume(){suspended=false;},get frameCount(){return frames.length;},get currentFrame(){return index;},get isPlaying(){return playing;},get busy(){return loading||exporting||isDrawing||!!app.layerMasks?.busy||fillBusy;},get maxFrames(){return MAX_FRAMES;},get maxFps(){return MAX_FPS;},get fps(){return fps;},get duration(){return total()/fps;},play,activate,dirty,beforeEdit,cancelEdit,undo,redo,serialize,load,stop,
    setDuration(seconds){if(!ready())return;beforeEdit();const ticks=Math.round(clamp(seconds,1,MAX_DURATION_SECONDS,8)*fps),other=total()-frames.at(-1).hold;frames[frames.length-1]={...frames.at(-1),hold:Math.max(1,ticks-other)};changed();},
    // Small diagnostic API used by regression checks and future native wrappers.
    diagnostics:{composite,pose,total,show,add,zip,gifHeader,gifFrame,get audio(){return {audioData,audioOffset,audioMuted,audioLoop};},scrub(t){if(!ready())return;sync();preview=true;previewTick(t);syncAudio(t/fps,true);setTimeout(()=>sound?.pause(),90);},get frames(){sync();return frames;}},
    linkDuplicate(){if(!ready()||frames.length>=MAX_FRAMES)return;beforeEdit();const current=frames[index],cel=current.celId||uid();frames[index]={...current,celId:cel};frames.splice(index+1,0,{...frames[index],id:uid()});show(index+1,false);changed();},
    unlink(){if(!ready())return;beforeEdit();frames[index]={...frames[index],celId:null};changed();},
    labelFrame(label,group){if(!ready())return;beforeEdit();frames[index]={...frames[index],label:String(label).slice(0,100),group:String(group).slice(0,100)};changed();}};
});
