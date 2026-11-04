/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
/* WinCreate import boundaries. No secrets or remote code are loaded by this module. */
((root)=>{'use strict';
 const LIMITS={file:32*1024*1024,pixels:256*1024*1024,points:250000,paths:2000000,images:32*1024*1024};
 const fail=m=>{throw Error('Project rejected: '+m);};
 const finite=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(label);return v;};
 const text=(v,n=200)=>typeof v==='string'?v.slice(0,n):'';
 const color=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'#000000';
 const blends=new Set(['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity']);
 function pngInfo(data){
  if(typeof data!=='string'||data.length>LIMITS.images||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data))fail('invalid PNG');
  let header;try{header=atob(data.slice(22,66));}catch{fail('invalid PNG encoding');}
  if(header.length<24||header.slice(0,8)!=='\x89PNG\r\n\x1a\n'||header.slice(12,16)!=='IHDR')fail('invalid PNG header');
  const u32=i=>((header.charCodeAt(i)*16777216)+(header.charCodeAt(i+1)<<16)+(header.charCodeAt(i+2)<<8)+header.charCodeAt(i+3));
  const w=u32(16),h=u32(20);if(!w||!h||w>4096||h>4096)fail('image dimensions');return {w,h};
 }
 function cleanProject(input){
  if(!input||input.magic!=='WINCREATE_PROJECT_V1')fail('unknown format');
  const w=finite(input.width,200,4096,'width'),h=finite(input.height,200,4096,'height');if(!Number.isInteger(w)||!Number.isInteger(h))fail('fractional dimensions');
  let pixels=0,points=0,pathBytes=0,imageBytes=0;
  const coords=arr=>{if(!Array.isArray(arr)||arr.length>25000)fail('point count');points+=arr.length;if(points>LIMITS.points)fail('geometry budget');return arr.map(p=>{if(!p||typeof p!=='object')fail('point');const out={x:finite(p.x,-32768,32768,'point x'),y:finite(p.y,-32768,32768,'point y')};if(p.r!==undefined)out.r=finite(p.r,0,1600,'radius');return out;});};
  const path=str=>{if(typeof str!=='string'||str.length>250000||!/^[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]*$/.test(str))fail('SVG path');pathBytes+=str.length;if(pathBytes>LIMITS.paths)fail('path budget');for(const v of str.match(/[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g)||[])if(!Number.isFinite(+v)||Math.abs(+v)>1e7)fail('path coordinates');return str;};
  const erasure=e=>{if(!e||typeof e!=='object')fail('erase data');const out={points:coords(e.points),width:finite(e.width??1,0,3200,'erase width'),opacity:finite(e.opacity??1,0,1,'erase opacity')};if(e.kind==='selection'||e.kind==='wet')out.kind=e.kind;if(e.selectionPoints)out.selectionPoints=coords(e.selectionPoints);return out;};
  const layerMask=m=>{
   if(m===undefined||m===null)return null;
   if(!m||typeof m!=='object'||!Array.isArray(m.commands)||m.commands.length>512)fail('layer mask');
   if(m.bitmap){const info=pngInfo(m.bitmap);pixels+=info.w*info.h*4;imageBytes+=m.bitmap.length;if(imageBytes>LIMITS.images)fail('mask image budget');}
   let bitmapTransform;if(m.bitmapTransform){const t=m.bitmapTransform;bitmapTransform={sx:finite(t.sx,-100,100,'bitmap mask scale'),sy:finite(t.sy,-100,100,'bitmap mask scale'),dx:finite(t.dx,-32768,32768,'bitmap mask offset'),dy:finite(t.dy,-32768,32768,'bitmap mask offset')};}
   return {bitmapTransform,bitmap:m.bitmap||undefined,enabled:m.enabled!==false,base:finite(m.base,0,1,'mask base'),inverted:m.inverted===true,commands:m.commands.map(c=>{
    if(!c||typeof c!=='object')fail('mask command');
    const out={texture:c.texture===true,path:path(c.path),value:finite(c.value,0,1,'mask value'),opacity:finite(c.opacity,0,1,'mask opacity'),softness:finite(c.softness??0,0,200,'mask softness')};
    if(c.clip)out.clip=path(c.clip);
    if(c.bounds){const b=c.bounds;out.bounds={x0:finite(b.x0,-32768,32768,'mask bounds'),y0:finite(b.y0,-32768,32768,'mask bounds'),x1:finite(b.x1,-32768,32768,'mask bounds'),y1:finite(b.y1,-32768,32768,'mask bounds')};if(b.x1<b.x0||b.y1<b.y0)fail('mask bounds');}
    if(c.transform){const t=c.transform;out.transform={sx:finite(t.sx,-100,100,'mask scale'),sy:finite(t.sy,-100,100,'mask scale'),dx:finite(t.dx,-32768,32768,'mask offset'),dy:finite(t.dy,-32768,32768,'mask offset')};}
    return out;
   })};
  };
  const strokes=arr=>{if(!Array.isArray(arr)||arr.length>20000)fail('stroke count');return arr.map(s=>{if(!s||typeof s!=='object')fail('stroke');const out={id:text(s.id,160),points:coords(s.points),width:finite(s.width??1,0,3200,'stroke width'),opacity:finite(s.opacity??1,0,1,'stroke opacity'),color:color(s.color),fill:s.fill===true,outline:s.outline===true};
   if(s.kind==='raster'){const info=pngInfo(s.pngData);imageBytes+=s.pngData.length;pixels+=info.w*info.h*4;if(imageBytes>LIMITS.images)fail('paint image budget');out.kind='raster';out.pngData=s.pngData;}
   if(s.svgPath)out.svgPath=path(s.svgPath);
   if(s.svgTransform){const tr=s.svgTransform;out.svgTransform={sx:finite(tr.sx,-100,100,'transform'),sy:finite(tr.sy,-100,100,'transform'),dx:finite(tr.dx,-32768,32768,'transform'),dy:finite(tr.dy,-32768,32768,'transform')};}
   if(s.shapeKind)out.shapeKind=text(s.shapeKind,32);if(s.brushId)out.brushId=text(s.brushId,100);
   if(s.erasures){if(!Array.isArray(s.erasures)||s.erasures.length>512)fail('erase count');out.erasures=s.erasures.map(erasure);}return out;});};
  function cleanLayers(arr,countPixels=true,allowEmpty=false){
   if(!Array.isArray(arr)||!arr.length||arr.length>160)fail('layer count');const ids=new Set();
   const result=arr.map(l=>{if(!l||typeof l!=='object'||!['string','number'].includes(typeof l.id)||String(l.id).length>160||['__proto__','constructor','prototype'].includes(String(l.id))||ids.has(l.id))fail('layer identity');if(typeof l.id==='number'&&!Number.isFinite(l.id))fail('layer identity');ids.add(l.id);
    const out={id:l.id,name:text(l.name,200)||'Layer',isFolder:l.isFolder===true,visible:l.visible!==false,opacity:finite(l.opacity??100,0,100,'layer opacity'),blend:blends.has(l.blend)?l.blend:'normal'};
    if(out.isFolder){out.collapsed=l.collapsed===true;out.layerMask=layerMask(l.layerMask);return out;}
    if(l.effects?.blur){const b=l.effects.blur;out.effects={blur:{enabled:b.enabled!==false,x:finite(b.x,0,100,'blur radius'),y:finite(b.y,0,100,'blur radius'),quality:['fast','balanced','high'].includes(b.quality)?b.quality:'balanced',preserveAlpha:!!b.preserveAlpha,selection:b.selection?coords(b.selection):null}};}
    out.parentId=l.parentId??null;out.alphaLock=l.alphaLock===true;out.clipMask=l.clipMask===true;out.layerMask=layerMask(l.layerMask);out.vectorStrokes=strokes(l.vectorStrokes||[]);
    if(allowEmpty&&l.emptyRaster===true&&l.pngData===null){out.emptyRaster=true;out.pngData=null;return out;}
    const info=pngInfo(l.pngData);if(info.w!==w||info.h!==h)fail('layer size mismatch');if(countPixels)pixels+=w*h*4;out.pngData=l.pngData;return out;});
   for(const l of result)if(l.parentId!==null&&l.parentId!==undefined&&!result.some(p=>p.id===l.parentId&&p.isFolder))fail('missing layer folder');return result;
  }
  const out={magic:'WINCREATE_PROJECT_V1',documentType:input.animation?'animation':'drawing',width:w,height:h,bgColor:color(input.bgColor||'#ffffff'),bgVisible:input.bgVisible!==false,artworkBrushHistory:Array.isArray(input.artworkBrushHistory)?input.artworkBrushHistory.slice(-100).filter(b=>b&&typeof b==='object').map(b=>({brushId:text(b.brushId,100),brushName:text(b.brushName,100),color:color(b.color),size:finite(b.size??20,.25,800,'brush size'),opacity:finite(b.opacity??100,0,100,'brush opacity'),stream:finite(b.stream??35,0,100,'brush smoothing'),taper:finite(b.taper??20,0,100,'brush taper')})):[],layers:cleanLayers(input.layers,!input.animation)};
  if(input.animation){const a=input.animation;if(a.version!==1||!Array.isArray(a.frames)||!a.frames.length||a.frames.length>1200)fail('animation frames');
   const sources=new Map(a.frames.filter(f=>f?.snap&&f.celId).map(f=>[f.celId,f.snap]));const seenCels=new Set(),cleanCels=new Map();const frames=a.frames.map(source=>{const f=source?.snapRef?{...source,snap:sources.get(source.snapRef)}:source;if(!f?.snap)fail('animation snapshot');const snap={type:'full',WIDTH:w,HEIGHT:h,activeLayerId:f.snap.activeLayerId,bgColor:color(f.snap.bgColor||out.bgColor),bgVisible:f.snap.bgVisible!==false,layers:f.celId&&cleanCels.has(f.celId)?cleanCels.get(f.celId):cleanLayers(f.snap.layers,true,true)};let key=null;
    if(f.key)key={x:finite(f.key.x,-32768,32768,'keyframe'),y:finite(f.key.y,-32768,32768,'keyframe'),scale:finite(f.key.scale,.01,10,'keyframe'),rotation:finite(f.key.rotation,-36000,36000,'keyframe'),opacity:finite(f.key.opacity,0,1,'keyframe'),ease:['linear','smooth','hold'].includes(f.key.ease)?f.key.ease:'linear'};
    if(f.celId){seenCels.add(f.celId);cleanCels.set(f.celId,snap.layers);}return {id:text(f.id,160),celId:f.celId?text(f.celId,160):null,label:text(f.label,100),group:text(f.group,100),hold:finite(f.hold,1,3784320000,'frame hold'),key,snap};});
   let audio=null;if(a.audio){if(typeof a.audio.data!=='string'||a.audio.data.length>14*1024*1024||!/^data:audio\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(a.audio.data))fail('audio');audio={name:text(a.audio.name,200),data:a.audio.data};}
   out.animation={version:1,frames,fps:finite(a.fps,1,120,'FPS'),loop:a.loop!==false,index:Math.min(frames.length-1,Math.max(0,Math.floor(a.index||0))),shared:Array.isArray(a.shared)?a.shared.filter(id=>frames[0].snap.layers.some(l=>l.id===id)).slice(0,160):[],motion:a.motion||null,audio,audioOffset:finite(a.audioOffset??0,0,3600,'audio offset'),audioMuted:!!a.audioMuted,audioLoop:!!a.audioLoop};
  }
  if(pixels>LIMITS.pixels)fail('decoded image budget exceeds 256 MiB');return out;
 }
 async function decodeProject(file){
  if(!file||file.size>LIMITS.file)fail('file over 32 MiB');const data=await file.text();
  if(typeof Worker!=='undefined'&&root.location?.protocol!=='file:')return new Promise((resolve,reject)=>{let worker;try{worker=new Worker('import-worker.js?v=6.5.2');}catch(e){reject(e);return;}const timer=setTimeout(()=>{worker.terminate();reject(Error('Project validation timed out'));},15000);worker.onmessage=e=>{clearTimeout(timer);worker.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.project);};worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('Project validation failed'));};worker.postMessage(data);});
  return cleanProject(JSON.parse(data));
 }
 async function checkImageFile(file){
  if(file.size>32*1024*1024)throw Error('Image exceeds 32 MiB');
  const b=new Uint8Array(await file.slice(0,262144).arrayBuffer()), v=new DataView(b.buffer);let w=0,h=0;
  if(b.length>=24 && b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71){w=v.getUint32(16);h=v.getUint32(20);}
  else if(b[0]===255 && b[1]===216){let i=2;while(i+9<b.length){if(b[i++]!==255)continue;const marker=b[i++];if(marker===216||marker===217)continue;const len=v.getUint16(i);if(len<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){h=v.getUint16(i+3);w=v.getUint16(i+5);break;}i+=len;}}
  else if(b.length>=30 && String.fromCharCode(...b.slice(0,4))==='RIFF' && String.fromCharCode(...b.slice(8,12))==='WEBP'){
   const kind=String.fromCharCode(...b.slice(12,16));
   if(kind==='VP8X'){w=1+b[24]+(b[25]<<8)+(b[26]<<16);h=1+b[27]+(b[28]<<8)+(b[29]<<16);}
   else if(kind==='VP8 '){w=v.getUint16(26,true)&16383;h=v.getUint16(28,true)&16383;}
   else if(kind==='VP8L' && b[20]===47){w=1+b[21]+((b[22]&63)<<8);h=1+(b[22]>>6)+(b[23]<<2)+((b[24]&15)<<10);}
  }
  if(!w||!h||w>8192||h>8192||w*h>16777216)throw Error('Use a PNG, JPEG or WebP image up to 16 megapixels (8192 pixels per edge)');return {w,h};
 }
 const api={LIMITS,pngInfo,cleanProject,decodeProject,checkImageFile,loading:false};root.WCGuard=api;
 if(root.document){const approved=new WeakSet();root.document.addEventListener('change',async e=>{const el=e.target;if(el?.type!=='file'||!el.files?.length||approved.has(e))return;if(el.id==='wc65Import')return;const files=Array.from(el.files);if(!files.some(f=>/^image\//.test(f.type)||/\.(png|jpe?g|webp|svg|gif|bmp|avif)$/i.test(f.name)))return;e.stopImmediatePropagation();try{for(const f of files)await checkImageFile(f);const next=new Event('change',{bubbles:true});approved.add(next);el.dispatchEvent(next);}catch(err){el.value='';if(root.WinCreate?.msg)root.WinCreate.msg(err.message);else root.alert(err.message);}},true);for(const event of ['pointerdown','click','keydown'])root.document.addEventListener(event,e=>{if(api.loading){e.preventDefault();e.stopImmediatePropagation();}},true);}
})(typeof self!=='undefined'?self:globalThis);
