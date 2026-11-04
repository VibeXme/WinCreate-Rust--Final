/*! WinCreate 6.5 · shared, premultiplied blur compositor. */
(() => {
 'use strict';
 const app=WinCreate,cache=new Map(),make=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 let scratchA=null,scratchB=null,scratchBytes=0,tileCount=0;
 function box(src,dst,w,h,rx,ry){
  if(!rx)dst.set(src);else for(let y=0;y<h;y++){
   const row=y*w*4,divisor=rx*2+1;let r=0,g=0,b=0,a=0;
   for(let i=-rx;i<=rx;i++){const p=row+Math.max(0,Math.min(w-1,i))*4;r+=src[p];g+=src[p+1];b+=src[p+2];a+=src[p+3];}
   for(let x=0;x<w;x++){const p=row+x*4;dst[p]=r/divisor;dst[p+1]=g/divisor;dst[p+2]=b/divisor;dst[p+3]=a/divisor;const left=row+Math.max(0,x-rx)*4,right=row+Math.min(w-1,x+rx+1)*4;r-=src[left];g-=src[left+1];b-=src[left+2];a-=src[left+3];r+=src[right];g+=src[right+1];b+=src[right+2];a+=src[right+3];}
  }
  if(!ry)src.set(dst);else for(let x=0;x<w;x++){
   const column=x*4,divisor=ry*2+1;let r=0,g=0,b=0,a=0;
   for(let i=-ry;i<=ry;i++){const p=Math.max(0,Math.min(h-1,i))*w*4+column;r+=dst[p];g+=dst[p+1];b+=dst[p+2];a+=dst[p+3];}
   for(let y=0;y<h;y++){const p=y*w*4+column;src[p]=r/divisor;src[p+1]=g/divisor;src[p+2]=b/divisor;src[p+3]=a/divisor;const top=Math.max(0,y-ry)*w*4+column,bottom=Math.min(h-1,y+ry+1)*w*4+column;r-=dst[top];g-=dst[top+1];b-=dst[top+2];a-=dst[top+3];r+=dst[bottom];g+=dst[bottom+1];b+=dst[bottom+2];a+=dst[bottom+3];}
  }
 }
 function cpuBlur(source,ctx,e,rx,ry){
  const w=source.width,h=source.height,passes=e.quality==='fast'?2:e.quality==='high'?5:3;
  const radius=sigma=>Math.max(0,Math.round((Math.sqrt(12*sigma*sigma/passes+1)-1)/2)),bx=radius(rx),by=radius(ry),hx=bx*passes,hy=by*passes;
  const limit=window.WCPerf?.budget('scratchMB',512*1048576)||512*1048576;
  let side=Math.max(w,h);while(side>1&&Math.min(w,side+hx*2)*Math.min(h,side+hy*2)*36>limit)side=Math.max(1,Math.floor(side/2));
  scratchBytes=0;tileCount=0;const input=source.getContext('2d');
  for(let y=0;y<h;y+=side)for(let x=0;x<w;x+=side){
   const tw=Math.min(side,w-x),th=Math.min(side,h-y),sx=Math.max(0,x-hx),sy=Math.max(0,y-hy),sw=Math.min(w,x+tw+hx)-sx,sh=Math.min(h,y+th+hy)-sy;
   const image=input.getImageData(sx,sy,sw,sh),d=image.data,n=d.length;
   if(!scratchA||scratchA.length<n||(scratchA.byteLength+scratchB.byteLength+d.byteLength)>limit){scratchA=new Float32Array(n);scratchB=new Float32Array(n);}
   const a=scratchA.subarray(0,n),b=scratchB.subarray(0,n);scratchBytes=Math.max(scratchBytes,scratchA.byteLength+scratchB.byteLength+d.byteLength);tileCount++;
   for(let i=0;i<n;i+=4){const alpha=d[i+3]/255;a[i]=d[i]*alpha;a[i+1]=d[i+1]*alpha;a[i+2]=d[i+2]*alpha;a[i+3]=alpha;}
   for(let pass=0;pass<passes;pass++)box(a,b,sw,sh,bx,by);
   for(let i=0;i<n;i+=4){const alpha=a[i+3];d[i+3]=alpha*255;d[i]=alpha>.00001?a[i]/alpha:0;d[i+1]=alpha>.00001?a[i+1]/alpha:0;d[i+2]=alpha>.00001?a[i+2]/alpha:0;}
   // Commit only the interior; the halo supplies every neighboring pass.
   ctx.putImageData(image,sx,sy,x-sx,y-sy,tw,th);
  }
 }
 function releaseCaches(){cache.clear();scratchA=scratchB=null;scratchBytes=tileCount=0;}
 function blur(source,e){
  const w=source.width,h=source.height,c=make(w,h),ctx=c.getContext('2d'),rx=Math.max(0,Math.min(200,+e.x||0)),ry=Math.max(0,Math.min(200,+e.y||0));
  let gpu=null;
  if(!rx&&!ry){ctx.drawImage(source,0,0);return c;}
  if(rx===ry&&'filter'in ctx){ctx.filter=`blur(${rx}px)`;ctx.drawImage(source,0,0);ctx.filter='none';}
  else if((gpu=window.WC65GPU?.blur(source,e,rx,ry,e.quality==='fast'?2:e.quality==='high'?5:3)))ctx.drawImage(gpu,0,0);
  else cpuBlur(source,ctx,e,rx,ry);
  if(e.preserveAlpha&&!gpu){const input=source.getContext('2d');for(let y=0;y<h;y+=128){const rows=Math.min(128,h-y),original=input.getImageData(0,y,w,rows),image=ctx.getImageData(0,y,w,rows);for(let i=3;i<image.data.length;i+=4)image.data[i]=original.data[i];ctx.putImageData(image,0,y);}}
  if(e.selection?.length){const selected=make(w,h),sc=selected.getContext('2d');sc.clip(new Path2D(polygonCutPath(e.selection)));sc.drawImage(c,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(source,0,0);ctx.save();ctx.clip(new Path2D(polygonCutPath(e.selection)));ctx.clearRect(0,0,w,h);ctx.drawImage(selected,0,0);ctx.restore();}
  return c;
 }
 function apply(ctx,layer){const e=layer.effects?.blur;if(!e||e.enabled===false||(!e.x&&!e.y))return;const c=ctx.canvas,w=c.width,h=c.height,key=JSON.stringify(e)+'|'+layer.rasterRevision+'|'+(layer._effectRevision||0)+'|'+w+'|'+h;
  let old=cache.get(layer);if(!old||old.key!==key){const src=make(w,h);src.getContext('2d').drawImage(c,0,0);old={key,canvas:blur(src,e)};cache.set(layer,old);let bytes=0;for(const entry of cache.values())bytes+=entry.canvas.width*entry.canvas.height*4;const limit=window.WCPerf?.budget('effectMB',1024*1048576)||1024*1048576;while(cache.size&&(bytes>limit||cache.size>32)){const key=cache.keys().next().value,entry=cache.get(key);bytes-=entry.canvas.width*entry.canvas.height*4;cache.delete(key);}}ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='copy';ctx.globalAlpha=1;ctx.drawImage(old.canvas,0,0);ctx.restore();
 }
 let scheduled=0;
 function syncAll(){if(scheduled)return;if(!layers.some(l=>l.effects?.blur||l._effectCanvas))return;scheduled=requestAnimationFrame(()=>{scheduled=0;
  if(isDrawing||app.layerMasks?.busy){syncAll();return;}
  for(const layer of layers){if(layer.isFolder)continue;const enabled=layer.effects?.blur?.enabled!==false&&layer.effects?.blur&&(layer.effects.blur.x||layer.effects.blur.y);
   if(!enabled){layer._effectCanvas?.remove();layer._effectCanvas=null;if(layer.canvas)layer.canvas.style.visibility='';if(layer.vectorSvg)layer.vectorSvg.style.visibility='';continue;}
   const c=layer._effectCanvas ||= make(WIDTH,HEIGHT);if(!c.isConnected){c.className='wc-effect-surface';c.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';layer.surface.append(c);}if(c.width!==WIDTH||c.height!==HEIGHT){c.width=WIDTH;c.height=HEIGHT;}
   const key=layer.rasterRevision+'|'+(layer._effectRevision||0)+'|'+WIDTH+'|'+HEIGHT+'|'+JSON.stringify(layer.effects);if(c._effectKey!==key){const ctx=c.getContext('2d');ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.drawImage(layer.canvas,0,0);paintVectorStrokesToContext(ctx,layer);apply(ctx,layer);c._effectKey=key;}layer.canvas.style.visibility='hidden';layer.vectorSvg.style.visibility='hidden';
  }
 });}
 function changed(layer){layer._effectRevision=(layer._effectRevision||0)+1;cache.delete(layer);}
 const render=renderVectorLayer;renderVectorLayer=function(l,...args){changed(l);const out=render(l,...args);if(l.effects?.blur)syncAll();return out;};app.renderVectorLayer=renderVectorLayer;
 const tracked=trackLayerPixels;trackLayerPixels=function(l){tracked(l);for(const method of ['drawImage','putImageData','clearRect','fill','fillRect','stroke','strokeRect']){const old=l.ctx[method].bind(l.ctx);l.ctx[method]=(...args)=>{const result=old(...args);if(l.effects?.blur){changed(l);syncAll();}return result;};}};
 app.on('canvasInit',()=>cache.clear());app.on('strokeCommit',({layer})=>{changed(layer);syncAll();});app.on('layersRendered',syncAll);
 function setBlur(e,destructive=false){if(isDrawing||fillBusy||app.animation?.busy)throw Error('Finish the current operation first');const l=getActiveLayer();if(!l)return;saveFullStateUndo();const clean={enabled:true,x:Math.max(0,Math.min(100,+e.x||0)),y:Math.max(0,Math.min(100,+e.y||0)),quality:['fast','balanced','high'].includes(e.quality)?e.quality:'balanced',preserveAlpha:!!e.preserveAlpha,selection:e.selection?structuredClone(e.selection):null};
  if(destructive){const src=make(WIDTH,HEIGHT),ctx=src.getContext('2d');ctx.drawImage(l.canvas,0,0);paintVectorStrokesToContext(ctx,l);const filtered=blur(src,clean);l.ctx.clearRect(0,0,WIDTH,HEIGHT);l.ctx.drawImage(filtered,0,0);l.vectorStrokes=[];renderVectorLayer(l);}
  else l.effects={...l.effects,blur:clean};changed(l);syncAll();l.thumbDirty=true;renderLayers();markUnsavedChanges();return clean;
 }
 window.WC65Effects={blur,apply,syncAll,changed,setBlur,releaseCaches,get scratchBytes(){return scratchBytes;},get tileCount(){return tileCount;}};app.effects=WC65Effects;
})();
