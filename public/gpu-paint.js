/*! WinCreate 6.6 · bounded GPU wet-paint tiles; the document stays vector editable. */
(() => {
 'use strict';
 const key='wincreate_paint_engine_66', modes=['auto','gpu','cpu'];
 let mode='auto';try{const value=localStorage.getItem(key);if(modes.includes(value))mode=value;}catch{}
 let device=null,active=null,unavailable=false,status='Ready',reason='';
 const stats={dabs:0,uploads:0,readbacks:0,replayed:0,sessions:0,bytes:0,peakBytes:0};
 const vertex=`#version 300 es
 void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
 const head=`#version 300 es
 precision highp float;precision highp int;uniform sampler2D image;uniform ivec2 extent;
 vec4 fetch(ivec2 p){return texelFetch(image,clamp(p,ivec2(0),extent-1),0);}`;
 function init(){
  if(device)return device;if(unavailable)return null;
  let gl;const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  try{
   gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:window.WCPerf?.config().gpu==='auto'?'default':window.WCPerf?.config().gpu||'default'});
   if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('GPU float buffers unavailable');
   const ext=gl.getExtension('WEBGL_debug_renderer_info'),renderer=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'';
   const software=/swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer);
   if(software&&mode==='auto'){unavailable=true;status='CPU · software graphics detected';gl.getExtension('WEBGL_lose_context')?.loseContext();return null;}
   const programs={};
   function build(name,body,uniforms){
    const shaders=[];let program;
    try{
     for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,head+body]]){const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('Paint shader compilation failed: '+gl.getShaderInfoLog(sh));}
     program=gl.createProgram();for(const sh of shaders)gl.attachShader(program,sh);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Paint shader linking failed');
     const loc={};for(const n of ['image','extent',...uniforms])loc[n]=gl.getUniformLocation(program,n);programs[name]={id:program,loc};
    }catch(e){if(program)gl.deleteProgram(program);throw e;}finally{for(const sh of shaders)gl.deleteShader(sh);}
   }
   build('gather',`uniform ivec2 origin;out vec4 color;void main(){ivec2 p=ivec2(gl_FragCoord.xy)+origin;color=all(greaterThanEqual(p,ivec2(0)))&&all(lessThan(p,extent))?texelFetch(image,p,0):vec4(0.);}`,['origin']);
   build('premultiply',`out vec4 color;void main(){vec4 c=fetch(ivec2(gl_FragCoord.xy))*255.;color=vec4(c.rgb*c.a,c.a);}`,[]);
   build('blur',`uniform ivec2 axis;uniform int radius;out vec4 color;void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 sum=vec4(0.);for(int i=-8;i<=8;i++)if(abs(i)<=radius)sum+=fetch(p+axis*i);color=sum/float(radius*2+1);}`,['axis','radius']);
   build('pigment',`uniform sampler2D carrier;uniform sampler2D weights;uniform sampler2D haze;
    uniform float strength;uniform float pickup;uniform float softness;uniform int blurred;uniform int preserve;
    layout(location=0)out vec4 paint;layout(location=1)out vec4 picked;
    vec4 quantize(vec4 c){return roundEven(clamp(c,0.,255.));}
    void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 d=fetch(p)*255.,c=texelFetch(carrier,p,0)*255.;float weight=texelFetch(weights,p,0).r;
     paint=d/255.;picked=c/255.;if(weight<=0.)return;
     float w=weight*strength,mass=mix(d.a,c.a,w);vec4 result=quantize(vec4(mass>.001?(d.rgb*d.a*(1.-w)+c.rgb*c.a*w)/mass:vec3(0.),mass));
     if(blurred==1){vec4 h=texelFetch(haze,p,0);h=quantize(vec4(h.a>.001?h.rgb/h.a:vec3(0.),h.a));float hw=min(.85,weight*softness),ma=mix(result.a,h.a,hw);
      if(ma>.001)result.rgb=quantize(vec4((result.rgb*result.a*(1.-hw)+h.rgb*h.a*hw)/ma,0.)).rgb;result.a=quantize(vec4(ma)).a;}
     if(result.a<d.a&&d.a>0.)result.a=preserve==1?d.a:quantize(vec4(result.a+(d.a-result.a)*pow(d.a/255.,2.))).a;
     float pickupScale=d.a<c.a?max(.22,d.a/255.):1.;
     float exchange=pickup*weight*pickupScale,newMass=mix(c.a,d.a,exchange);
     picked=quantize(vec4(newMass>.001?(c.rgb*c.a*(1.-exchange)+d.rgb*d.a*exchange)/newMass:vec3(0.),newMass))/255.;paint=result/255.;
    }`,['carrier','weights','haze','strength','pickup','softness','blurred','preserve']);
   device={gl,canvas,programs,software,max:gl.getParameter(gl.MAX_TEXTURE_SIZE)};const owner=device;
   canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(owner.retired)return;unavailable=true;status='GPU interrupted; recovering paint on CPU';});
   // Recovery replays the unsynchronized journal before releasing resources.
   canvas.addEventListener('webglcontextrestored',()=>{if(owner.retired)return;if(active?.device===owner)recover(active);if(device===owner)device=null;unavailable=false;status='GPU restored; ready for the next stroke';});
   return device;
  }catch(e){reason=e.message;status='CPU fallback';unavailable=true;gl?.getExtension('WEBGL_lose_context')?.loseContext();return null;}
 }
 function destroy(session){
  if(!session)return;const gl=session.device.gl;
  for(const target of session.targets){gl.deleteTexture(target.tex);if(target.fb)gl.deleteFramebuffer(target.fb);}
  if(session.mrt)gl.deleteFramebuffer(session.mrt);session.journal.length=0;
  if(active===session)active=null;stats.bytes=0;
 }
 function recover(session){
  // CPU pixels and the carrier are a checkpoint. Replay only the dabs since
  // the last successful readback, never the already committed ones.
  const journal=session.journal.slice(),{s,work,layer}=session;
  destroy(session);s.gpuPaintFailed=true;s.gpuPending=false;
  for(const dab of journal){if(wetSmudgeDabCPU(s,layer,work,dab.tx,dab.ty,dab.weights,dab.strength,dab.pickup,dab.softness,null,null))s.workDirty=true;stats.replayed++;}
  status='Recovered on CPU';
 }
 function begin(s,work,layer){
  const d=init();if(!d||mode==='auto'&&d.software){status='CPU · software graphics detected';return null;}
  const {gl}=d,n=s.size,w=work.canvas.width,h=work.canvas.height;
  const bytes=w*h*4+n*n*(s.softness>0?56:24),budget=(window.WCPerf?.budget('gpuMB',2048*1048576)||2048*1048576)-(window.WC65GPU?.bytes||0);
  if(Math.max(n,w,h)>d.max||bytes>budget){status='CPU · GPU memory budget';return null;}
  const session={device:d,s,work,layer,n,w,h,targets:[],journal:[],dirty:null,bytes};
  try{
   function target(width,height,float=false,red=false){
    const t={tex:gl.createTexture(),fb:red?null:gl.createFramebuffer(),w:width,h:height};session.targets.push(t);
    gl.bindTexture(gl.TEXTURE_2D,t.tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,red?gl.R32F:float?gl.RGBA32F:gl.RGBA8,width,height,0,red?gl.RED:gl.RGBA,float||red?gl.FLOAT:gl.UNSIGNED_BYTE,null);
    if(t.fb){gl.bindFramebuffer(gl.FRAMEBUFFER,t.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Paint buffer allocation failed');}return t;
   }
   session.paint=target(w,h);session.tile=target(n,n);session.carrier=target(n,n);session.nextCarrier=target(n,n);session.output=target(n,n);session.weights=target(n,n,false,true);
   if(s.softness>0){session.a=target(n,n,true);session.b=target(n,n,true);}
   session.mrt=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,session.mrt);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,session.output.tex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,session.nextCarrier.tex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Paint output allocation failed');
   if(!work.pixels)work.pixels=work.ctx.getImageData(0,0,w,h);
   for(const [t,pixels]of [[session.paint,work.pixels.data],[session.carrier,s.carrier]]){gl.bindTexture(gl.TEXTURE_2D,t.tex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,t.w,t.h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);stats.uploads++;}
   if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('GPU paint allocation failed');
   active=session;stats.sessions++;stats.bytes=bytes;stats.peakBytes=Math.max(stats.peakBytes,bytes);status='GPU wet paint';return session;
  }catch(e){reason=e.message;destroy(session);s.gpuPaintFailed=true;status='CPU fallback';return null;}
 }
 function draw(session,name,source,target,values={},textures={}){
  const {gl,programs}=session.device,p=programs[name];
  gl.bindFramebuffer(gl.FRAMEBUFFER,target.fb);gl.viewport(0,0,target.w,target.h);gl.useProgram(p.id);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.tex);gl.uniform1i(p.loc.image,0);gl.uniform2i(p.loc.extent,source.w,source.h);
  let unit=1;for(const [key,t]of Object.entries(textures)){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t.tex);gl.uniform1i(p.loc[key],unit++);}
  for(const [key,v]of Object.entries(values)){if(Array.isArray(v))gl.uniform2i(p.loc[key],v[0],v[1]);else if(['radius','blurred','preserve'].includes(key))gl.uniform1i(p.loc[key],v);else gl.uniform1f(p.loc[key],v);}
  gl.drawArrays(gl.TRIANGLES,0,3);
 }
 function sync(s,work){
  const session=active;if(!session||session.s!==s||session.work!==work)return true;
  if(!session.journal.length)return true;
  const {gl}=session.device,b=session.dirty;
  try{
   if(gl.isContextLost())throw Error('GPU context lost');
   const width=b.x1-b.x0,height=b.y1-b.y0,count=width*height*4;
   const temp=session.readPixels?.length===count?session.readPixels:(session.readPixels=new Uint8Array(count));
   const carrier=session.readCarrier ||= new Uint8Array(s.carrier.length);
   gl.bindFramebuffer(gl.FRAMEBUFFER,session.paint.fb);gl.readPixels(b.x0,b.y0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,temp);
   gl.bindFramebuffer(gl.FRAMEBUFFER,session.carrier.fb);gl.readPixels(0,0,session.n,session.n,gl.RGBA,gl.UNSIGNED_BYTE,carrier);
   if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('GPU checkpoint failed');
   let changed=false;for(let row=0;row<height;row++){const start=((b.y0+row)*session.w+b.x0)*4,offset=row*width*4;for(let i=0;i<width*4;i++)if(work.pixels.data[start+i]!==temp[offset+i]){changed=true;break;}}
   // Commit both readbacks only after both have succeeded.
   for(let row=0;row<height;row++)work.pixels.data.set(temp.subarray(row*width*4,(row+1)*width*4),((b.y0+row)*session.w+b.x0)*4);
   s.carrier.set(carrier);s.gpuPending=false;s.workDirty ||= changed;
   if(changed){const old=work.dirty;work.dirty={x0:Math.min(old?.x0??session.w,b.x0),y0:Math.min(old?.y0??session.h,b.y0),x1:Math.max(old?.x1??0,b.x1),y1:Math.max(old?.y1??0,b.y1)};}
   session.journal.length=0;session.dirty=null;stats.readbacks+=2;return true;
  }catch(e){reason=e.message;recover(session);return false;}
 }
 function dab(s,layer,work,tx,ty,weights,strength,pickup,softness){
  if(mode!=='gpu'||s.gpuPaintFailed||s.mode!=='wet'||s.size<32)return false;
  if(active&&(active.s!==s||active.work!==work)){sync(active.s,active.work);destroy(active);}
  const session=active||begin(s,work,layer);if(!session)return false;
  const {gl}=session.device,n=session.n;
  if(session.journal.length>=1024){sync(s,work);if(s.gpuPaintFailed)return false;}
  const entry={tx,ty,weights,strength,pickup,softness};
  // Journal before submitting. A lost GPU can be reconstructed without losing
  // a stroke; weights are immutable cached tip/phase arrays.
  session.journal.push(entry);s.gpuPending=true;
  try{
   if(gl.isContextLost())throw Error('GPU context lost');
   draw(session,'gather',session.paint,session.tile,{origin:[tx-work.x,ty-work.y]});
   let haze=session.tile;
   if(s.softness>0){
    draw(session,'premultiply',session.tile,session.a);
    const radius=Math.max(1,Math.min(4,Math.round(s.radius*.07)));
    draw(session,'blur',session.a,session.b,{axis:[1,0],radius});draw(session,'blur',session.b,session.a,{axis:[0,1],radius});
    haze=session.a;
   }
   if(session.lastWeights!==weights){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,session.weights.tex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,n,n,gl.RED,gl.FLOAT,weights);session.lastWeights=weights;stats.uploads++;}
   draw(session,'pigment',session.tile,{fb:session.mrt,w:n,h:n},{strength,pickup,softness,blurred:s.softness>0?1:0,preserve:SMUDGE.preserveCoverage!==false?1:0},{carrier:session.carrier,weights:session.weights,haze});
   const x=tx-work.x,y=ty-work.y,x0=Math.max(0,x),y0=Math.max(0,y),x1=Math.min(session.w,x+n),y1=Math.min(session.h,y+n);
   if(x1>x0&&y1>y0){
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,session.output.fb);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,session.paint.fb);gl.blitFramebuffer(x0-x,y0-y,x1-x,y1-y,x0,y0,x1,y1,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    const old=session.dirty;session.dirty={x0:Math.min(old?.x0??session.w,x0),y0:Math.min(old?.y0??session.h,y0),x1:Math.max(old?.x1??0,x1),y1:Math.max(old?.y1??0,y1)};
   }
   [session.carrier,session.nextCarrier]=[session.nextCarrier,session.carrier];gl.bindFramebuffer(gl.FRAMEBUFFER,session.mrt);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,session.nextCarrier.tex,0);
   if(gl.isContextLost())throw Error('GPU paint interrupted');
   stats.dabs++;return true;
  }catch(e){reason=e.message;recover(session);return true;/* current dab was included in recovery */}
 }
 function release(s,commit=true){if(active&&(!s||active.s===s)){const session=active;if(commit)sync(session.s,session.work);if(active===session)destroy(session);}}
 function reset(){release();if(device){device.retired=true;const {gl,programs,canvas}=device;for(const p of Object.values(programs))gl.deleteProgram(p.id);device=null;canvas.width=canvas.height=1;gl.getExtension('WEBGL_lose_context')?.loseContext();}unavailable=false;status='Ready';}
 function setMode(next){if(!modes.includes(next))return false;if(typeof isDrawing!=='undefined'&&isDrawing||window.WC65?.busy)return false;release();mode=next;unavailable=false;try{localStorage.setItem(key,next);}catch{}status='Ready';return true;}
 window.WCGPUPaint={dab,sync,release,reset,setMode,get mode(){return mode;},get status(){return status;},get reason(){return reason;},get stats(){return {...stats};},get canvas(){return device?.canvas||null;}};
 window.addEventListener('pagehide',()=>release());window.addEventListener('wcperformancechange',reset);
 document.addEventListener('DOMContentLoaded',()=>{
  if('requestIdleCallback' in window)requestIdleCallback(()=>{if(mode!=='cpu'&&!document.hidden&&!isDrawing)init();},{timeout:2000});
  const panel=document.querySelector('#studio65 [data-panel="performance"]');if(!panel)return;
  const block=document.createElement('div');block.innerHTML='<h3>Paint renderer</h3><label>Wet paint<select id="wcPaintEngine"><option value="auto">Automatic</option><option value="gpu">GPU</option><option value="cpu">CPU compatibility</option></select></label><p>Automatic uses GPU wet paint for larger brushes on hardware graphics. Sharp vector tools and constrained strokes keep their existing renderer. Drawing and export resolution are preserved.</p><button id="wcPaintStatusRefresh" type="button">Show paint renderer status</button><p id="wcPaintStatus" role="status"></p>';
  panel.prepend(block);const select=block.querySelector('select'),output=block.querySelector('p[role]');select.value=mode;
  const refresh=()=>{output.textContent=`${status} · ${stats.dabs} GPU dabs · ${(stats.bytes/1048576).toFixed(1)} MB active`;};
  select.onchange=()=>{if(!setMode(select.value))output.textContent='Finish the stroke before changing the renderer.';else refresh();select.value=mode;};block.querySelector('button').onclick=refresh;refresh();
 });
})();
