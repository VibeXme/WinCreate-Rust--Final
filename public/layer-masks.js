/*! WinCreate application code. All rights reserved by its respective authors. */
/* Vector mask records remain separate from every source paint pixel/path. */
((root)=>{
 'use strict';
 const ns='http://www.w3.org/2000/svg',records=new WeakMap(),cache=new Map();let sequence=0,bytes=0;
 const svg=document.createElementNS(ns,'svg');svg.id='wcMaskDefinitions';svg.style.cssText='position:absolute;width:0;height:0;pointer-events:none';svg.setAttribute('aria-hidden','true');document.body.append(svg);
 const element=(tag,attrs={})=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
 const value=(mask,v)=>mask.inverted?1-v:v;
 function commandNode(record,mask,cmd,index){
  const group=element('g'),t=cmd.transform||{sx:1,sy:1,dx:0,dy:0};group.setAttribute('transform',`matrix(${t.sx} 0 0 ${t.sy} ${t.dx} ${t.dy})`);
  const fill=Math.round(value(mask,cmd.value)*255),path=element('path',{d:cmd.path,fill:`rgb(${fill},${fill},${fill})`,'fill-opacity':cmd.opacity,'fill-rule':cmd.texture?'evenodd':'nonzero'});
  if(cmd.clip){const id=record.id+'-clip-'+index,clip=element('clipPath',{id,clipPathUnits:'userSpaceOnUse'});clip.append(element('path',{d:cmd.clip}));record.defs.append(clip);group.setAttribute('clip-path',`url(#${id})`);}
  if(cmd.softness>0){const id=record.id+'-soft-'+index,b=cmd.bounds||{x0:0,y0:0,x1:record.w,y1:record.h},margin=cmd.softness*3,filter=element('filter',{id,filterUnits:'userSpaceOnUse',x:b.x0-margin,y:b.y0-margin,width:b.x1-b.x0+margin*2,height:b.y1-b.y0+margin*2,'color-interpolation-filters':'sRGB'});filter.append(element('feGaussianBlur',{stdDeviation:cmd.softness}));record.defs.append(filter);path.setAttribute('filter',`url(#${id})`);}
  group.append(path);return group;
 }
 function sync(layer,w=WIDTH,h=HEIGHT){
  if(!layer?.surface)return;
  const mask=layer.layerMask;let record=records.get(layer);
  if(!mask||mask.enabled===false){if(record){layer.surface.style.maskImage='';layer.surface.style.webkitMaskImage='';record.defs.remove();records.delete(layer);}return;}
  if(record&&record.mask===mask&&record.w===w&&record.h===h){const url=`url("#${record.id}")`;if(layer.surface.style.maskImage!==url)layer.surface.style.maskImage=url;return;}
  record?.defs.remove();const id='wc-layer-mask-'+(++sequence),defs=element('defs'),node=element('mask',{id,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:0,y:0,width:w,height:h});node.style.maskType='luminance';
  record={id,defs,node,mask,w,h};defs.append(node);node.append(element('rect',{width:w,height:h,fill:`rgb(${Math.round(value(mask,mask.base)*255)},${Math.round(value(mask,mask.base)*255)},${Math.round(value(mask,mask.base)*255)})`}));
  if(mask.bitmap){const info=WCGuard.pngInfo(mask.bitmap),image=element('image',{href:mask.bitmap,width:info.w,height:info.h});if(mask.inverted)image.style.filter='invert(1)';const bt=mask.bitmapTransform;if(bt)image.setAttribute('transform',`matrix(${bt.sx} 0 0 ${bt.sy} ${bt.dx} ${bt.dy})`);node.append(image);}
  mask.commands.forEach((cmd,i)=>node.append(commandNode(record,mask,cmd,i)));svg.append(defs);records.set(layer,record);layer.surface.style.maskImage=`url("#${id}")`;layer.surface.style.webkitMaskImage=`url("#${id}")`;
 }
 function preview(layer,cmd){
  sync(layer);const r=records.get(layer);if(!r)return;r.preview?.remove();r.previewDefs?.forEach(e=>e.remove());r.previewDefs=[];
  if(cmd){const old=new Set(r.defs.children);r.preview=commandNode(r,r.mask,cmd,'live');r.previewDefs=[...r.defs.children].filter(e=>!old.has(e));r.node.append(r.preview);}else r.preview=null;
 }
 function syncAll(){const keep=new Set();for(const l of layers){sync(l);const r=records.get(l);if(r)keep.add(r.defs);}for(const d of [...svg.children])if(!keep.has(d))d.remove();}
 function maskCanvas(mask,w,h,region=null){
  if(!region&&cache.has(mask)){const r=cache.get(mask);if(r.width===w&&r.height===h){cache.delete(mask);cache.set(mask,r);return r;}bytes-=r.width*r.height*4;cache.delete(mask);}
  const c=Object.assign(document.createElement('canvas'),{width:w,height:h}),ctx=c.getContext('2d',{willReadFrequently:true}),base=Math.round(value(mask,mask.base)*255);ctx.fillStyle=`rgb(${base},${base},${base})`;ctx.fillRect(0,0,w,h);
  if(mask.bitmap){const image=bitmapImages.get(mask.bitmap);if(image?.complete){ctx.save();if(mask.inverted)ctx.filter='invert(1)';const bt=mask.bitmapTransform||{sx:1,sy:1,dx:0,dy:0};ctx.setTransform(bt.sx,0,0,bt.sy,bt.dx-(region?.x||0),bt.dy-(region?.y||0));ctx.drawImage(image,0,0);ctx.restore();}}
  for(const cmd of mask.commands){const t=cmd.transform||{sx:1,sy:1,dx:0,dy:0};ctx.save();ctx.setTransform(t.sx,0,0,t.sy,t.dx-(region?.x||0),t.dy-(region?.y||0));if(cmd.clip)ctx.clip(new Path2D(cmd.clip));ctx.globalAlpha=cmd.opacity;const v=Math.round(value(mask,cmd.value)*255);ctx.fillStyle=`rgb(${v},${v},${v})`;if(cmd.softness>0)ctx.filter=`blur(${cmd.softness}px)`;ctx.fill(new Path2D(cmd.path),cmd.texture?'evenodd':'nonzero');ctx.restore();}
  const image=ctx.getImageData(0,0,w,h);for(let i=0;i<image.data.length;i+=4){image.data[i+3]=image.data[i];image.data[i]=image.data[i+1]=image.data[i+2]=255;}ctx.putImageData(image,0,0);
  if(region)return c;
  const cost=w*h*4;while(cache.size&&(cache.size>=4||bytes+cost>32*1024*1024)){const key=cache.keys().next().value,old=cache.get(key);bytes-=old.width*old.height*4;cache.delete(key);}if(cost<=32*1024*1024){cache.set(mask,c);bytes+=cost;}return c;
 }
 const bitmapImages=new Map();
 function prepare(mask){if(!mask?.bitmap||bitmapImages.has(mask.bitmap))return Promise.resolve();return new Promise((res,rej)=>{const img=new Image();img.onload=()=>{bitmapImages.set(mask.bitmap,img);res();};img.onerror=()=>rej(Error('Damaged mask bitmap'));img.src=mask.bitmap;});}
 function apply(ctx,layer,w=WIDTH,h=HEIGHT){if(!layer.layerMask||layer.layerMask.enabled===false)return;ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-in';ctx.drawImage(maskCanvas(layer.layerMask,w,h),0,0);ctx.restore();}
 function applyRegion(ctx,layer,x,y,w,h){if(!layer.layerMask||layer.layerMask.enabled===false)return;ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-in';ctx.drawImage(maskCanvas(layer.layerMask,w,h,{x,y}),0,0);ctx.restore();}
 function transform(layer,sx=1,sy=1,dx=0,dy=0){if(!layer.layerMask)return;const bt=layer.layerMask.bitmapTransform||{sx:1,sy:1,dx:0,dy:0};layer.layerMask={...layer.layerMask,bitmapTransform:layer.layerMask.bitmap?{sx:bt.sx*sx,sy:bt.sy*sy,dx:bt.dx*sx+dx,dy:bt.dy*sy+dy}:undefined,commands:layer.layerMask.commands.map(cmd=>{const t=cmd.transform||{sx:1,sy:1,dx:0,dy:0};return{...cmd,transform:{sx:t.sx*sx,sy:t.sy*sy,dx:t.dx*sx+dx,dy:t.dy*sy+dy}};})};}
 const ownSync=sync,proxies=new WeakMap();
 sync=function(layer,w=WIDTH,h=HEIGHT){if(layer.isFolder)return;ownSync(layer,w,h);if(!layer.surface)return;const parent=layers.find(l=>l.isFolder&&l.id===layer.parentId);let proxy=proxies.get(layer);if(parent?.layerMask){if(!proxy){const wrapper=document.createElement('div');wrapper.className='wc-folder-mask-wrapper';wrapper.style.cssText='position:absolute;inset:0;pointer-events:none';layer.surface.replaceWith(wrapper);wrapper.append(layer.surface);proxy={surface:wrapper};proxies.set(layer,proxy);}proxy.surface.style.zIndex=layer.surface.style.zIndex;proxy.surface.style.display=layer.surface.style.display;proxy.layerMask=parent.layerMask;ownSync(proxy,w,h);}else if(proxy){proxy.layerMask=null;ownSync(proxy,w,h);proxy.surface.replaceWith(layer.surface);proxies.delete(layer);}};
 syncAll=function(){for(const l of layers)sync(l);for(const d of [...svg.children])if(!document.querySelector(`[style*="${d.firstElementChild?.id}"]`))d.remove();};
 root.WCLayerMasks={prepare,bitmapImages,sync,syncAll,preview,apply,applyRegion,maskCanvas,transform,cancelInput:null,finishInput:null};
})(window);
