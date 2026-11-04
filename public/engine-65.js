/*! WinCreate 6.5 · bounded drawing helpers. */
(() => {
 'use strict';
 const defaults={stabilizer:'realtime',fastStrength:0,taperStart:0,taperEnd:0,wrap:false,fillAnimation:false,performance:'balanced',assist:'off',vpX:50,vpY:35,spacing:1,scatter:0,grain:0,wetness:0,pickup:0,dilution:0,tilt:.18,pressure:1};
 let saved={};try{saved=JSON.parse(localStorage.getItem('wincreate65_settings')||'{}');}catch{}
 if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
 const settings={...defaults};for(const k of Object.keys(defaults))if(typeof saved[k]===typeof defaults[k])settings[k]=saved[k];
 for(const [k,a,b]of [['fastStrength',0,100],['taperStart',0,100],['taperEnd',0,100],['spacing',.2,4],['scatter',0,100],['grain',0,100],['wetness',0,100],['pickup',0,100],['dilution',0,100],['tilt',0,1],['pressure',.2,3],['vpX',-100,200],['vpY',-100,200]])settings[k]=Math.max(a,Math.min(b,Number.isFinite(settings[k])?settings[k]:defaults[k]));
 if(!['realtime','after','off'].includes(settings.stabilizer))settings.stabilizer='realtime';
 if(!['balanced','quality','fast'].includes(settings.performance))settings.performance=defaults.performance;
 if(!['off','one','two','three'].includes(settings.assist))settings.assist=defaults.assist;
 let start=null,locked=null,wetColor=null,sequence=0;
 const perBrush={};try{Object.assign(perBrush,JSON.parse(localStorage.getItem('wincreate65_brushes')||'{}'));}catch{}
 function persist(){try{localStorage.setItem('wincreate65_settings',JSON.stringify(settings));localStorage.setItem('wincreate65_brushes',JSON.stringify(perBrush));}catch{}}
 function brushConfig(){return settings;}
 function beginStroke(p){start={...p};locked=null;wetColor=null;sequence=0;}
 function assist(p){
  if(settings.assist==='off'||!start||currentTool!=='brush')return p;
  const w=WIDTH,h=HEIGHT,vps=[{x:w*settings.vpX/100,y:h*settings.vpY/100}];
  if(['two','three'].includes(settings.assist))vps.push({x:w*(1-settings.vpX/100),y:h*settings.vpY/100});
  if(settings.assist==='three')vps.push({x:w/2,y:h*1.6});
  if(Math.hypot(p.x-start.x,p.y-start.y)<3)return p;
  if(!locked){const d={x:p.x-start.x,y:p.y-start.y},length=Math.hypot(d.x,d.y);let best=Infinity;
   for(const v of vps){const x=v.x-start.x,y=v.y-start.y,n=Math.hypot(x,y);if(n<1)continue;const error=Math.abs(d.x*y-d.y*x)/(n*length);if(error<best){best=error;locked={x:x/n,y:y/n};}}
  }
  if(!locked)return p;const distance=(p.x-start.x)*locked.x+(p.y-start.y)*locked.y;return {...p,x:start.x+locked.x*distance,y:start.y+locked.y*distance};
 }
 function follow(base,speed){if(currentTool!=='brush')return base;if(settings.stabilizer!=='realtime')return 1;const f=Math.max(.12,base*(1-settings.fastStrength/100*Math.min(1,speed/2)*.65));if(window.WinCreateRustEngine?.isEnabled?.())window.WinCreateRustEngine.stabilizeCoord(0,1,f);return f;}
 function finishStroke(){
  if(!splinePts.length)return;
  if(settings.stabilizer==='after'&&splinePts.length>4){const original=splinePts;for(let pass=0;pass<2;pass++)splinePts=splinePts.map((p,i,a)=>i===0||i===a.length-1?p:{...p,x:(a[i-1].x+p.x*2+a[i+1].x)/4,y:(a[i-1].y+p.y*2+a[i+1].y)/4});splinePts[0]=original[0];splinePts[splinePts.length-1]=original.at(-1);}
  const n=splinePts.length;
  if(settings.taperStart||settings.taperEnd)for(let i=0;i<n;i++){const a=settings.taperStart/100,b=settings.taperEnd/100;const f=Math.min(a?Math.min(1,(i+1)/(Math.max(1,n*.25*a))):1,b?Math.min(1,(n-i)/(Math.max(1,n*.25*b))):1);splinePts[i]={...splinePts[i],r:Math.max(.125,splinePts[i].r*f)};}
  if(!strokeCanVectorize&&(settings.stabilizer==='after'||settings.taperStart||settings.taperEnd)){clearScratchBuffer();const br=getCurrentBrush();for(let i=0;i<splinePts.length;i++){const p=splinePts[i];if(i)stampQuadraticCurve(scratchCtx,splinePts[i-1],splinePts[i-1],p,splinePts[i-1].r,p.r,currentColor);else stampSymmetry(scratchCtx,br.id,p.x,p.y,p.r,currentColor);}}
 }
 const hash=(a,b)=>{const x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x);};
 function brushStamp(id,x,y,r,color,ctx){
  if(typeof currentTool==='undefined'||currentTool!=='brush')return{x,y,r,color};
  if(settings.scatter){const a=hash(x,y)*Math.PI*2,d=hash(y,x)*r*settings.scatter/100;x+=Math.cos(a)*d;y+=Math.sin(a)*d;}
  if(settings.grain){const step=Math.max(1.5,r*.14),path=new Path2D();path.rect(x-r*2,y-r*2,r*4,r*4);for(let yy=-r;yy<r;yy+=step)for(let xx=-r;xx<r;xx+=step)if(hash(Math.floor((x+xx)/step),Math.floor((y+yy)/step))<settings.grain/125)path.rect(x+xx,y+yy,step*.48,step*.48);ctx.clip(path,'evenodd');}
  if(settings.pickup&&sequence++%8===0){const layer=getActiveLayer(),c=document.createElement('canvas');c.width=c.height=1;const t=c.getContext('2d',{willReadFrequently:true});paintLayerRegion(t,layer,Math.floor(x),Math.floor(y),1,1);const d=t.getImageData(0,0,1,1).data;if(d[3])wetColor=d;}
  if(wetColor&&settings.pickup){const v=parseInt(color.slice(1),16),amount=settings.pickup/100*.85;const rgb=[v>>16,(v>>8)&255,v&255].map((q,i)=>Math.round(q*(1-amount)+wetColor[i]*amount));color='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');}
  ctx.globalAlpha*=1-settings.dilution/100*.85;
  if(settings.wetness){ctx.globalAlpha*=1-settings.wetness/100*.45;ctx.shadowColor=color;ctx.shadowBlur=r*settings.wetness/100*.2;}
  return{x,y,r,color};
 }
 function readTile(work,x,y,size,state){
  if(!work.pixels)work.pixels=work.ctx.getImageData(0,0,work.canvas.width,work.canvas.height);
  const tile=state.cpuTile?.width===size?state.cpuTile:(state.cpuTile=new ImageData(size,size)),src=work.pixels.data,dst=tile.data,w=work.canvas.width,h=work.canvas.height;
  dst.fill(0);const left=Math.max(0,x),right=Math.min(w,x+size);
  if(right>left)for(let row=Math.max(0,y);row<Math.min(h,y+size);row++)dst.set(src.subarray((row*w+left)*4,(row*w+right)*4),((row-y)*size+left-x)*4);
  return tile;
 }
 function writeTile(work,tile,x,y){const w=work.canvas.width,h=work.canvas.height,n=tile.width,left=Math.max(0,x),right=Math.min(w,x+n);if(right<=left)return;
  for(let row=Math.max(0,y);row<Math.min(h,y+n);row++)work.pixels.data.set(tile.data.subarray(((row-y)*n+left-x)*4,((row-y)*n+right-x)*4),(row*w+left)*4);
  const old=work.dirty;work.dirty={x0:Math.min(old?.x0??w,left),y0:Math.min(old?.y0??h,Math.max(0,y)),x1:Math.max(old?.x1??0,right),y1:Math.max(old?.y1??0,Math.min(h,y+n))};
 }
 function readRegion(work,x,y,w,h,state){
  const tile=state.presentTile?.width===w&&state.presentTile.height===h?state.presentTile:(state.presentTile=new ImageData(w,h));
  const src=work.pixels.data,stride=work.canvas.width;
  for(let row=0;row<h;row++)tile.data.set(src.subarray(((y+row)*stride+x)*4,((y+row)*stride+x+w)*4),row*w*4);
  return tile;
 }
 function uploadWork(w){if(w?.dirty&&w.pixels){const b=w.dirty;w.ctx.putImageData(w.pixels,0,0,b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);w.dirty=null;}}
 function shapeSpec(kind,box,p1,p2,control){
  const n=x=>+x.toFixed(3),c=control||{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2-80};
  if(kind==='bezier'){const c2=SHAPE_EDITOR.control2||{x:p2.x,y:p1.y};const points=Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return{x:u**3*p1.x+3*u*u*t*c.x+3*u*t*t*c2.x+t**3*p2.x,y:u**3*p1.y+3*u*u*t*c.y+3*u*t*t*c2.y+t**3*p2.y}});return{d:`M ${n(p1.x)} ${n(p1.y)} C ${n(c.x)} ${n(c.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`,points,closed:false};}
  if(kind==='arc'){const points=Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return{x:u*u*p1.x+2*u*t*c.x+t*t*p2.x,y:u*u*p1.y+2*u*t*c.y+t*t*p2.y}});return{d:`M ${n(p1.x)} ${n(p1.y)} Q ${n(c.x)} ${n(c.y)} ${n(p2.x)} ${n(p2.y)}`,points,closed:false};}
  if(kind==='rounded'){const x=box.minX,y=box.minY,w=Math.max(1,box.maxX-x),h=Math.max(1,box.maxY-y),r=Math.min(w,h)*.2;return{d:`M ${x+r} ${y} H ${x+w-r} Q ${x+w} ${y} ${x+w} ${y+r} V ${y+h-r} Q ${x+w} ${y+h} ${x+w-r} ${y+h} H ${x+r} Q ${x} ${y+h} ${x} ${y+h-r} V ${y+r} Q ${x} ${y} ${x+r} ${y} Z`,points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],closed:true};}return null;
 }
 function unionTinySweep(pts,radius){
  if(pts.length<6)return null;const minR=Math.min(...pts.map(radius));let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of pts){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}if(Math.max(x1-x0,y1-y0)>minR*1.5)return null;
  const C=ClipperLib,S=4096,paths=[],point=(x,y)=>({X:Math.round(x*S),Y:Math.round(y*S)}),add=path=>{if(!C.Clipper.Orientation(path))path.reverse();paths.push(path);};
  for(let i=0;i<pts.length;i++){const p=pts[i],r=radius(p),count=Math.max(32,Math.min(384,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-.005/r)))));add(Array.from({length:count},(_,j)=>{const a=j/count*Math.PI*2;return point(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r);}));if(!i)continue;const q=pts[i-1],qr=radius(q),dx=p.x-q.x,dy=p.y-q.y,len=Math.hypot(dx,dy);if(len<=Math.abs(qr-r)+1e-8)continue;const ux=dx/len,uy=dy/len,k=(qr-r)/len,h=Math.sqrt(Math.max(0,1-k*k)),ax=ux*k-uy*h,ay=uy*k+ux*h,bx=ux*k+uy*h,by=uy*k-ux*h;add([point(q.x+ax*qr,q.y+ay*qr),point(p.x+ax*r,p.y+ay*r),point(p.x+bx*r,p.y+by*r),point(q.x+bx*qr,q.y+by*qr)]);}
  const clip=new C.Clipper(C.Clipper.ioStrictlySimple),out=[];clip.AddPaths(paths,C.PolyType.ptSubject,true);clip.Execute(C.ClipType.ctUnion,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);return out.map(path=>'M '+path.map(p=>(p.X/S).toFixed(3)+' '+(p.Y/S).toFixed(3)).join(' L ')+' Z').join(' ');
 }
 window.WC65={defaults,settings,perBrush,persist,unionTinySweep,brushConfig,beginStroke,assist,follow,finishStroke,brushStamp,readTile,readRegion,writeTile,uploadWork,shapeSpec};
})();
