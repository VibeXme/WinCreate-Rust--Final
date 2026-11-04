/*! WinCreate application code. All rights reserved by its respective authors. */
WinCreate.use(app=>{
 'use strict';
 let editing=null,active=null,raf=0,mode='hide';
 const selected=()=>layers.find(l=>l.id===activeLayerId);
 const blank=()=>({enabled:true,base:1,inverted:false,commands:[]});
 function undoMask(layer){
  if(app.animation?.enabled&&!app.animation.suspended)app.animation.beforeEdit();
  else{undoStack.push({type:'mask',id:layer.id,layerMask:structuredClone(layer.layerMask||null)});redoStack=[];trimHistory();}
 }
 function changed(layer){layer.thumbDirty=true;WCLayerMasks.sync(layer);app.syncLayers();app.renderLayers();app.markUnsavedChanges();app.animation?.dirty();update();}
 function mutate(fn){cancel();const layer=selected();if(!layer){app.msg('Select a paint layer first.');return false;}undoMask(layer);fn(layer);changed(layer);return true;}
 function add(){mutate(layer=>{layer.layerMask ||= blank();});}
 function stopEditing(){cancel();editing=null;if(app.editingMode==='mask')app.editingMode=null;document.body.classList.remove('mask-editing');$('layerMaskToolBtn')?.classList.remove('active');update();}
 function edit(nextMode=mode){
  const l=selected();if(!l){app.msg('Select a paint layer first.');return;}
  if(!l.layerMask)add();if(!l.layerMask.enabled)mutate(layer=>layer.layerMask={...layer.layerMask,enabled:true});
  app.activateTool('brush');penInRangeUntil=0;mode=nextMode;editing=l.id;app.editingMode='mask';document.body.classList.add('mask-editing');$('layerMaskToolBtn')?.classList.add('active');app.closePops(true);update();app.msg(mode==='hide'?'Mask brush: hide ink':'Mask brush: reveal ink');
 }
 function pathFromSelection(){const pts=app.selectionPoints;if(!pts||pts.length<3)return '';const step=Math.max(1,Math.ceil(pts.length/4000));return polygonCutPath(pts.filter((_,i)=>i%step===0).map(p=>({x:+p.x.toFixed(3),y:+p.y.toFixed(3)})));}
 function fromSelection(){const path=pathFromSelection();if(!path){app.msg('Create a lasso or rectangle selection first.');return;}const layer=selected();if(layer&&!budget({...layer,layerMask:layer.layerMask||blank()},{path})){app.msg('This selection is too complex for the mask budget. Simplify it first.');return;}mutate(layer=>layer.layerMask={enabled:true,base:0,inverted:false,commands:[{path,value:1,opacity:1,softness:0}]});}
 function budget(layer,cmd){const chars=m=>(m?.commands||[]).reduce((n,c)=>n+c.path.length+(c.clip?.length||0),0);return layer.layerMask.commands.length<512&&cmd.path.length<=250000&&layers.reduce((n,l)=>n+chars(l.layerMask)+(l.vectorStrokes||[]).reduce((z,st)=>z+(st.svgPath?.length||0),0),0)+cmd.path.length+(cmd.clip?.length||0)<=1500000;}
 function point(e){const p=getCanvasPoint(e),pressure=e.pointerType==='pen'?Math.max(0,Math.min(1,e.pressure)):1;return{x:p.x,y:p.y,r:Math.max(.125,brushSize*.5*Math.pow(pressure,ENGINE.pressureGamma))};}
 function command(stroke){const points=stroke.points.filter((_,i)=>i%Math.max(1,Math.ceil(stroke.points.length/512))===0);if(points.at(-1)!==stroke.points.at(-1))points.push(stroke.points.at(-1));let path=buildPressureOutlinePath(points);if(stroke.texture){const size=Math.max(2,brushSize*.13);for(const p of points.filter((_,i)=>i%3===0))for(let j=-2;j<=2;j++){if(Math.abs(j*size)+size>p.r*.65)continue;const x=p.x+j*size,y=p.y+Math.sin(j*7+p.x)*size;path+=` M ${x} ${y} h ${size*.45} v ${size*.45} h ${-size*.45} Z`;}}return{path,texture:!!stroke.texture,value:stroke.value,opacity:stroke.opacity,softness:stroke.softness,clip:stroke.clip||undefined,bounds:{x0:Math.min(...points.map(p=>p.x-p.r)),y0:Math.min(...points.map(p=>p.y-p.r)),x1:Math.max(...points.map(p=>p.x+p.r)),y1:Math.max(...points.map(p=>p.y+p.r))}};}
 function drawPreview(){raf=0;if(active)WCLayerMasks.preview(active.layer,command(active));}
 function cancel(){cancelAnimationFrame(raf);raf=0;if(active){WCLayerMasks.preview(active.layer,null);active=null;}document.body.classList.remove('mask-stroke-active');}
 function finish(e){
  if(!active||e&&e.pointerId!==active.pointerId)return;const stroke=active;if(e){const p=point(e),last=stroke.points.at(-1);if(e.pressure===0)p.r=last.r;if(Math.hypot(p.x-last.x,p.y-last.y)>.3)stroke.points.push(p);}const cmd=command(stroke);cancel();
  if(!layers.includes(stroke.layer)||stroke.layer.id!==activeLayerId||!budget(stroke.layer,cmd)){app.msg('Mask stroke cancelled. Select the layer again or simplify this mask.');return;}
  if(cmd.opacity<=0)return;undoMask(stroke.layer);stroke.layer.layerMask={...stroke.layer.layerMask,commands:[...stroke.layer.layerMask.commands,cmd]};changed(stroke.layer);
 }
 function addPoint(e){if(!active)return;const p=point(e),last=active.points.at(-1);if(e.pointerType==='pen'&&e.pressure===0)return;if(Math.hypot(p.x-last.x,p.y-last.y)>.3&&active.points.length<12000)active.points.push(p);if(!raf)raf=requestAnimationFrame(drawPreview);}
 window.addEventListener('pointerdown',e=>{
  if(editing===null||e.target.closest('.floating-ui,.popover,.ios-layer-menu-sheet,button,input,select,textarea')||!e.target.closest('#viewport'))return;
  if(app.editingMode!=='mask'){stopEditing();return;}
  if(e.button>0||isSpace||modActive||e.altKey)return;
  e.preventDefault();e.stopImmediatePropagation();if(active){if(e.pointerId!==active.pointerId)cancel();return;}
  const l=selected();if(!l||l.id!==editing||!l.layerMask||l.layerMask.enabled===false||!isLayerEffectivelyVisible(l)){stopEditing();return;}
  const p=point(e);if(p.x<0||p.y<0||p.x>=WIDTH||p.y>=HEIGHT||e.pointerType==='pen'&&e.pressure===0||brushOpacity<=0)return;
  if(touchPinchDist>0||e.pointerType==='touch'&&performance.now()<penInRangeUntil)return;
  if(e.pointerType==='pen')penInRangeUntil=performance.now()+1300;
  active={layer:l,pointerId:e.pointerId,points:[p],value:(mode==='hide'?0:1)^(l.layerMask.inverted?1:0),opacity:brushOpacity/100,softness:brushSize*.25*(+$('maskSoftness').value/100),clip:pathFromSelection(),texture:!!app.maskTexture};app.closePops(true);document.body.classList.add('mask-stroke-active');drawPreview();
 },{capture:true,passive:false});
 window.addEventListener('pointermove',e=>{if(!active||e.pointerId!==active.pointerId)return;e.stopImmediatePropagation();e.preventDefault();const samples=e.getCoalescedEvents?.();for(const ev of samples?.length?samples:[e])addPoint(ev);if(!raf)raf=requestAnimationFrame(drawPreview);},{capture:true,passive:false});
 window.addEventListener('pointerup',e=>{if(!active||e.pointerId!==active.pointerId)return;e.stopImmediatePropagation();finish(e);},true);
 window.addEventListener('pointercancel',()=>{cancel();if(editing!==null)app.editingMode='mask';},true);window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 window.addEventListener('keydown',e=>{if(active&&(e.key==='Escape'||(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase()))){e.preventDefault();e.stopImmediatePropagation();cancel();}else if(e.key==='Escape'&&editing!==null){stopEditing();}},true);
 const panel=document.createElement('div');panel.id='maskEditingStrip';panel.className='floating-ui';panel.hidden=true;panel.innerHTML='<strong>Layer Mask</strong><button type="button" id="maskHide">Hide · Black</button><button type="button" id="maskReveal">Reveal · White</button><button type="button" id="maskDone">Done</button>';document.body.append(panel);
 app.registerPopover({name:'layerMask',title:'Non-destructive Layer Mask',width:320,left:'220px',html:`<div class="settings-group"><strong id="maskLayerName"></strong><p class="settings-note">Black hides, white reveals. The drawing stays intact. Mask brush uses the current size, strength and pen pressure with a round tip.</p><div class="mask-actions"><button type="button" class="blend-chip" id="maskAdd">Add Mask · Reveal All</button><button type="button" class="blend-chip" id="maskFromSelection">Mask from Selection</button><button type="button" class="blend-chip" id="maskEditHide">Paint Black · Hide</button><button type="button" class="blend-chip" id="maskEditReveal">Paint White · Reveal</button><button type="button" class="blend-chip" id="maskToggle">Disable Mask</button><button type="button" class="blend-chip" id="maskInvert">Invert Mask</button><button type="button" class="blend-chip" id="maskShowAll">Reveal All</button><button type="button" class="blend-chip" id="maskHideAll">Hide All</button><button type="button" class="blend-chip" id="maskRemove">Remove Mask · Keep Drawing</button></div><label class="setting-row"><span>Mask brush softness</span><input type="range" id="maskSoftness" min="0" max="100" value="0"></label><p class="settings-note">Finish with Done to paint or smudge the artwork. Disable or remove the mask to restore hidden areas. Lasso selections also limit mask brush strokes.</p></div>`,onInit(pop){
   pop.querySelector('#maskAdd').onclick=add;pop.querySelector('#maskFromSelection').onclick=fromSelection;
   pop.querySelector('#maskEditHide').onclick=()=>edit('hide');pop.querySelector('#maskEditReveal').onclick=()=>edit('reveal');
   pop.querySelector('#maskToggle').onclick=()=>mutate(l=>{if(l.layerMask)l.layerMask={...l.layerMask,enabled:!l.layerMask.enabled};});
   pop.querySelector('#maskInvert').onclick=()=>mutate(l=>{if(l.layerMask)l.layerMask={...l.layerMask,inverted:!l.layerMask.inverted};});
   pop.querySelector('#maskShowAll').onclick=()=>mutate(l=>l.layerMask=blank());pop.querySelector('#maskHideAll').onclick=()=>mutate(l=>l.layerMask={...blank(),base:0});
   pop.querySelector('#maskRemove').onclick=()=>{mutate(l=>l.layerMask=null);stopEditing();};
 }});
 document.body.append($('layerMaskPopover'));
 $('maskHide').onclick=()=>edit('hide');$('maskReveal').onclick=()=>edit('reveal');$('maskDone').onclick=stopEditing;
 function update(){const l=selected(),has=!!l?.layerMask;$('maskLayerName').textContent=l?'Layer: '+l.name:'Select a paint layer';for(const id of ['maskEditHide','maskEditReveal','maskToggle','maskInvert','maskShowAll','maskHideAll','maskRemove'])$(id).disabled=!has;$('maskAdd').disabled=!l||has;$('maskFromSelection').disabled=!l||!app.selectionPoints?.length;$('maskToggle').textContent=l?.layerMask?.enabled===false?'Enable Mask':'Disable Mask';panel.hidden=editing===null;app.studio?.update();$('maskHide').setAttribute('aria-pressed',String(mode==='hide'));$('maskReveal').setAttribute('aria-pressed',String(mode==='reveal'));}
 app.registerToolbarButton({id:'layerMaskToolBtn',label:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/></svg><span>Mask</span>',title:'Layer masks',onClick:()=>{update();app.togglePop('layerMask');}});
 $('mLayerMask').onclick=()=>{layerMenuSheet.classList.remove('open');update();app.togglePop('layerMask');};
 app.on('toolChange',stopEditing);app.on('canvasInit',stopEditing);app.on('canvasResize',stopEditing);app.on('layersRendered',()=>{if(editing!==null&&selected()?.id!==editing)stopEditing();update();});
 WCLayerMasks.cancelInput=cancel;WCLayerMasks.finishInput=finish;
 app.layerMasks={add,edit,fromSelection,stop:stopEditing,cancel,finish,get editing(){return editing;},get mode(){return mode;},get busy(){return !!active;},open(){update();app.togglePop('layerMask');}};
 update();
});
