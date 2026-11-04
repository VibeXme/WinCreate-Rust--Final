/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
/* Procedural, deterministic still-art motion. Runs locally without a model service. */
WinCreate.use(app=>{
  const presets={rig:['Pin rig','Deform art with animated pins','M5 5l14 14M19 5L5 19'],breathe:['Breathe','A gentle living pulse','M12 3v18M3 12h18'],sway:['Sway','Soft rotation around an anchor','M5 19c0-9 14-9 14-14'],float:['Float','Slow, looping vertical motion','M4 12c4-8 12 8 16 0'],ripple:['Ripple','Flowing water and painted textures','M2 9c3-6 5 6 8 0s5 6 8 0'],breeze:['Breeze','Flexible motion for hair, cloth and foliage','M3 8h14M3 12h18M3 16h11'],drift:['Drift','A looping horizontal glide','M3 12h18m-5-5 5 5-5 5'],flicker:['Glow','A subtle opacity shimmer','m12 3 2 6 7 3-7 2-2 7-2-7-7-2 7-3Z'],parallax:['Parallax','Different layers move at different depths','m3 7 9-4 9 4-9 4-9-4m0 5 9 4 9-4']};
  let config={tracks:[],camera:'none',cameraAmount:30},selected='breathe',picking=false,region=null,drag=null;
  const finite=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
  const clone=x=>structuredClone(x);
  const safeTrack=t=>({pins:Array.isArray(t.pins)?t.pins.slice(0,16).map((p,i)=>({parent:Number.isInteger(p.parent)&&p.parent>=0&&p.parent<i?p.parent:-1,angle:finite(p.angle,-180,180,0),x:finite(p.x,0,4096,0),y:finite(p.y,0,4096,0),dx:finite(p.dx,-2048,2048,0),dy:finite(p.dy,-2048,2048,0),radius:finite(p.radius,8,4096,200),phase:finite(p.phase,0,360,0),fixed:!!p.fixed})):[],id:typeof t.id==='string'?t.id:crypto.randomUUID(),layerId:typeof t.layerId==='number'||typeof t.layerId==='string'?t.layerId:'*',preset:Object.hasOwn(presets,t.preset)?t.preset:'breathe',amount:finite(t.amount,0,100,35),cycles:finite(t.cycles,.1,10000,1),phase:finite(t.phase,0,360,0),anchorX:finite(t.anchorX,0,1,.5),anchorY:finite(t.anchorY,0,1,.65),region:t.region?{x:finite(t.region.x,0,1,0),y:finite(t.region.y,0,1,0),w:finite(t.region.w,.01,1,.5),h:finite(t.region.h,.01,1,.5)}:null});
  function capture(){return clone(config);}
  function restore(v){config={tracks:Array.isArray(v?.tracks)?v.tracks.filter(t=>t&&typeof t==='object').slice(0,40).map(safeTrack):[],camera:['none','push','pan','orbit'].includes(v?.camera)?v.camera:'none',cameraAmount:finite(v?.cameraAmount,0,100,30)};renderUI();}
  function reset(){restore(null);region=null;}
  function beginEdit(){if(app.animation?.busy)return false;if(!app.animation?.enabled){app.animation?.activate();app.animation?.setDuration(8);}app.animation?.beforeEdit();return true;}
  function commit(){app.markUnsavedChanges();renderUI();app.emit('motionChange');}
  app.on('canvasInit',reset);
  function matrix(track,seconds,duration,depth=1){
    const a=track.amount/100,u=seconds/Math.max(.01,duration)*Math.PI*2*track.cycles+track.phase*Math.PI/180,s=Math.sin(u),c=Math.cos(u);
    const m={x:0,y:0,sx:1,sy:1,rotation:0,alpha:1,wave:0,phase:u};
    if(track.preset==='breathe'){m.sx=1+a*.045*s;m.sy=1+a*.065*s;}
    if(track.preset==='sway')m.rotation=a*.13*s;
    if(track.preset==='float'){m.y=HEIGHT*a*.055*s;m.rotation=a*.018*c;}
    if(track.preset==='drift')m.x=WIDTH*a*.07*s;
    if(track.preset==='parallax'){m.x=WIDTH*a*.08*s*depth;m.y=HEIGHT*a*.025*c*depth;}
    if(track.preset==='flicker')m.alpha=1-a*.32*(.5+.5*s);
    if(track.preset==='ripple'||track.preset==='breeze')m.wave=WIDTH*a*.028;
    return m;
  }
  function applyCamera(ctx,seconds,duration,w,h){
    const a=config.cameraAmount/100,p=Math.min(1,seconds/Math.max(.01,duration)),u=2*Math.PI*p;
    if(config.camera==='none')return;
    ctx.translate(w/2,h/2);
    if(config.camera==='push'){const scale=1+.22*a*p;ctx.scale(scale,scale);}
    if(config.camera==='pan'){const scale=1+.2*a;ctx.scale(scale,scale);ctx.translate((p-.5)*w*a*.14,0);}
    if(config.camera==='orbit'){const scale=1+.15*a;ctx.scale(scale,scale);ctx.translate(Math.sin(u)*w*a*.04,Math.cos(u)*h*a*.025);ctx.rotate(Math.sin(u)*a*.012);}
    ctx.translate(-w/2,-h/2);
  }
  function draw(ctx,image,layer,seconds,duration,depth){
    const tracks=config.tracks.filter(t=>t.layerId==='*'||t.layerId===layer.id);if(!tracks.length){ctx.drawImage(image,0,0);return;}
    const rig=tracks.find(t=>t.preset==='rig'&&t.pins?.length);if(rig&&app.rig65)image=app.rig65.warp(image,rig,seconds,duration);
    ctx.save();let wave=0,phase=0,kind='';
    for(const t of tracks){const m=matrix(t,seconds,duration,depth),x=WIDTH*t.anchorX,y=HEIGHT*t.anchorY;ctx.translate(m.x+x,m.y+y);ctx.rotate(m.rotation);ctx.scale(m.sx,m.sy);ctx.translate(-x,-y);ctx.globalAlpha*=m.alpha;if(m.wave){wave+=m.wave;phase=m.phase;kind=t.preset;}}
    const area=tracks.find(t=>t.region)?.region;
    if(area){ctx.restore();ctx.drawImage(image,0,0);ctx.save();const x=area.x*WIDTH,y=area.y*HEIGHT,w=Math.min(area.w*WIDTH,WIDTH-x),h=Math.min(area.h*HEIGHT,HEIGHT-y);ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();wave=wave||WIDTH*tracks[0].amount/100*.018;phase=matrix(tracks[0],seconds,duration,depth).phase;
      const slice=8;for(let yy=Math.floor(y);yy<y+h;yy+=slice){const hh=Math.min(slice,y+h-yy),fade=Math.sin(Math.PI*(yy-y)/Math.max(1,h));const dx=Math.sin((yy/HEIGHT)*Math.PI*4+phase)*wave*fade;ctx.drawImage(image,Math.max(0,x-dx),yy,Math.min(w,WIDTH-Math.max(0,x-dx)),hh,x,yy,w,hh);}ctx.restore();return;}
    if(wave){const slice=8;for(let y=0;y<HEIGHT;y+=slice){const h=Math.min(slice,HEIGHT-y),falloff=kind==='breeze'?1-y/HEIGHT:1;ctx.drawImage(image,0,y,WIDTH,h,Math.sin(y/HEIGHT*Math.PI*4+phase)*wave*falloff,y,WIDTH,h);}}
    else ctx.drawImage(image,0,0);
    ctx.restore();
  }
  const host=document.createElement('div');host.id='motionLab';host.innerHTML=`<div class="motion-intro"><span class="studio-eyebrow">STILL → MOTION</span><h2>Give your artwork<br>a little life.</h2><p>Start with one drawing. Add a loop, move the camera, or animate layers at different depths.</p></div><div class="motion-presets" id="motionPresets"></div>
  <div class="inspector-section"><div class="inspector-heading">Motion controls <span id="motionPresetName">Breathe</span></div><label class="studio-field">Apply to<select id="motionTarget"><option value="*">Whole artwork</option></select></label><label class="studio-field">Intensity <output id="motionAmountLabel">35%</output><input id="motionAmount" type="range" min="0" max="100" value="35"></label><div class="studio-field-pair"><label class="studio-field">Cycles per project<input id="motionCycles" type="number" min="0.1" max="10000" step="0.1" value="1"></label><label class="studio-field">Phase °<input id="motionPhase" type="number" min="0" max="360" value="0"></label></div><div class="studio-field-pair"><label class="studio-field">Anchor X %<input id="motionAnchorX" type="number" min="0" max="100" value="50"></label><label class="studio-field">Anchor Y %<input id="motionAnchorY" type="number" min="0" max="100" value="65"></label></div><button id="motionRegion" class="studio-secondary">Select a moving region</button><small id="motionRegionLabel">Optional: paint-like distortion inside a rectangle.</small><button id="motionApply" class="studio-primary">Apply motion</button></div>
  <div class="inspector-section"><div class="inspector-heading">Camera movement</div><div class="camera-options" id="motionCameras"><button data-camera="none">Static</button><button data-camera="push">Push in</button><button data-camera="pan">Pan</button><button data-camera="orbit">Orbit</button></div><label class="studio-field">Travel<input id="motionCameraAmount" type="range" min="0" max="100" value="30"></label></div><div class="inspector-section"><div class="inspector-heading">Applied effects <span id="motionCount">0</span></div><div id="motionTracks"></div><button id="motionPreview" class="studio-secondary">▶ Preview animation</button><p class="studio-note">Use separate layers for a moving character, hair or background. A flattened image can still breathe, drift or ripple.</p></div>`;
  const grid=host.querySelector('#motionPresets');
  for(const [id,[name,description,path]] of Object.entries(presets)){const b=document.createElement('button');b.dataset.preset=id;b.title=description;b.innerHTML=`<svg viewBox="0 0 24 24"><path d="${path}"/></svg><span>${name}</span>`;b.onclick=()=>{selected=id;renderUI();};grid.append(b);}
  const el=id=>host.querySelector('#'+id);
  el('motionAmount').oninput=()=>el('motionAmountLabel').textContent=el('motionAmount').value+'%';
  el('motionApply').onclick=()=>{
    if(!beginEdit())return;const target=el('motionTarget').value,layer=app.state.layers.find(l=>String(l.id)===target);const track=safeTrack({id:crypto.randomUUID(),layerId:layer?layer.id:'*',preset:selected,amount:el('motionAmount').value,cycles:el('motionCycles').value,phase:el('motionPhase').value,anchorX:+el('motionAnchorX').value/100,anchorY:+el('motionAnchorY').value/100,region});
    config.tracks=config.tracks.filter(t=>!(t.layerId===track.layerId&&t.preset===track.preset));if(config.tracks.length>=40){app.msg('Keep up to 40 motion effects');return;}config.tracks.push(track);region=null;commit();app.msg(presets[selected][0]+' applied — press Play');
  };
  el('motionCameras').onclick=e=>{const b=e.target.closest('[data-camera]');if(!b||!beginEdit())return;config.camera=b.dataset.camera;commit();};
  el('motionCameraAmount').onpointerdown=()=>beginEdit();el('motionCameraAmount').onchange=()=>{if(!beginEdit())return;config.cameraAmount=+el('motionCameraAmount').value;commit();};
  el('motionPreview').onclick=()=>{if(!app.animation?.enabled)app.animation?.activate();app.animation?.play();};
  el('motionRegion').onclick=()=>{if(!beginEdit())return;app.animation.stop();picking=true;el('motionRegionLabel').textContent='Drag a rectangle on the artwork. Escape cancels.';viewportEl.style.cursor='crosshair';};
  const overlay=document.createElement('div');overlay.id='motionRegionOverlay';overlay.hidden=true;board.append(overlay);
  document.addEventListener('pointerdown',e=>{if(!picking||!viewportEl.contains(e.target))return;e.preventDefault();e.stopImmediatePropagation();const p=getCanvasPoint(e);drag={x:finite(p.x,0,WIDTH,0),y:finite(p.y,0,HEIGHT,0)};overlay.hidden=false;Object.assign(overlay.style,{left:drag.x+'px',top:drag.y+'px',width:'0px',height:'0px'});},true);
  document.addEventListener('pointermove',e=>{if(!picking||!drag)return;e.preventDefault();e.stopImmediatePropagation();const p=getCanvasPoint(e);Object.assign(overlay.style,{left:Math.min(drag.x,p.x)+'px',top:Math.min(drag.y,p.y)+'px',width:Math.abs(p.x-drag.x)+'px',height:Math.abs(p.y-drag.y)+'px'});},true);
  document.addEventListener('pointerup',e=>{if(!picking||!drag)return;e.preventDefault();e.stopImmediatePropagation();const p=getCanvasPoint(e);region={x:finite(Math.min(drag.x,p.x)/WIDTH,0,1,0),y:finite(Math.min(drag.y,p.y)/HEIGHT,0,1,0),w:finite(Math.abs(p.x-drag.x)/WIDTH,.01,1,.1),h:finite(Math.abs(p.y-drag.y)/HEIGHT,.01,1,.1)};picking=false;drag=null;overlay.hidden=true;viewportEl.style.cursor='';el('motionRegionLabel').textContent='Region selected. Apply motion to animate its texture.';},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking){picking=false;drag=null;overlay.hidden=true;viewportEl.style.cursor='';el('motionRegionLabel').textContent='Region selection cancelled.';}});
  function renderUI(){
    if(!host)return;
    host.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===selected));el('motionPresetName').textContent=presets[selected][0];
    const target=el('motionTarget'),value=target.value;target.replaceChildren(new Option('Whole artwork','*'));app.state.layers.filter(l=>!l.isFolder).forEach(l=>target.add(new Option(l.name,String(l.id))));if([...target.options].some(o=>o.value===value))target.value=value;
    el('motionCameras').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.camera===config.camera));el('motionCameraAmount').value=config.cameraAmount;el('motionCount').textContent=config.tracks.length;
    const list=el('motionTracks');list.replaceChildren();if(!config.tracks.length){const p=document.createElement('p');p.className='studio-note';p.textContent='Choose a preset above to start.';list.append(p);}
    for(const t of config.tracks){const row=document.createElement('div');row.className='motion-track';const text=document.createElement('span');text.textContent=presets[t.preset][0]+' · '+(t.layerId==='*'?'Whole artwork':app.state.layers.find(l=>l.id===t.layerId)?.name||'Missing layer');const b=document.createElement('button');b.textContent='×';b.title='Remove effect';b.onclick=()=>{if(!beginEdit())return;config.tracks=config.tracks.filter(x=>x.id!==t.id);commit();};row.append(text,b);list.append(row);}
  }
  app.motion={addRig(layerId,pins,cycles=1){if(!beginEdit())return;config.tracks=config.tracks.filter(t=>!(t.preset==='rig'&&t.layerId===layerId));if(config.tracks.length>=40){app.msg('Keep up to 40 motion effects');return;}config.tracks.push(safeTrack({id:crypto.randomUUID(),layerId,preset:'rig',pins,cycles,amount:100}));commit();},capture,restore,reset,draw,applyCamera,matrix,renderUI,host,get hasMotion(){return config.tracks.length>0||config.camera!=='none';}};
});
