/*! WinCreate 6.5.2 · bounded GPU directional blur, with CPU fallback. */
(() => {
 'use strict';
 let state=null,failed=false,last='Not used yet';
 const preference=()=>ENGINE.gpuPreference==='auto'?'default':ENGINE.gpuPreference;
 const make=()=>document.createElement('canvas');
 function reset(){
  if(state){state.retired=true;const {gl,programs,targets,input,buffer,canvas}=state;
   for(const t of targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fb);}
   gl.deleteTexture(input);gl.deleteBuffer(buffer);for(const p of Object.values(programs))gl.deleteProgram(p.id);
   gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=1;
  }state=null;failed=false;last='Ready on next effect';
 }
 const vertex=`#version 300 es
 in vec2 point;void main(){gl_Position=vec4(point,0.,1.);}`;
 const header=`#version 300 es
 precision highp float;precision highp int;
 uniform sampler2D image;uniform ivec2 size;out vec4 color;
 ivec2 pixel(){return ivec2(gl_FragCoord.xy);}`;
 function init(){
  if(state&&state.preference!==preference())reset();
  if(state||failed)return state;
  let gl,canvas;
  try{
   canvas=make();gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:preference()});
   if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('Float render targets unavailable');
   const info=gl.getExtension('WEBGL_debug_renderer_info');
   if(info&&/swiftshader|llvmpipe|software|microsoft basic render/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))))throw Error('Software graphics; retain CPU blur');
   const programs={};
   const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);return s;};
   const build=(name,body,uniforms=[])=>{const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,header+body),id=gl.createProgram();gl.attachShader(id,vs);gl.attachShader(id,fs);gl.bindAttribLocation(id,0,'point');gl.linkProgram(id);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(id,gl.LINK_STATUS)){gl.deleteProgram(id);throw Error('GPU blur shader unavailable');}const loc={};for(const n of ['image','size',...uniforms])loc[n]=gl.getUniformLocation(id,n);programs[name]={id,loc};};
   build('copy','void main(){vec4 c=texelFetch(image,pixel(),0);color=vec4(c.rgb*c.a,c.a);}');
   build('scan',`uniform ivec2 stepSize;void main(){ivec2 p=pixel(),q=p-stepSize;color=texelFetch(image,p,0);if(all(greaterThanEqual(q,ivec2(0))))color+=texelFetch(image,q,0);}`,['stepSize']);
   build('box',`uniform sampler2D original;uniform ivec2 axis;uniform int radius;
    void main(){ivec2 p=pixel(),hi=min(size-1,p+axis*radius),lo=p-axis*(radius+1);vec4 sum=texelFetch(image,hi,0);if(all(greaterThanEqual(lo,ivec2(0))))sum-=texelFetch(image,lo,0);
    int at=axis.x==1?p.x:p.y,extent=axis.x==1?size.x:size.y;
    sum+=texelFetch(original,p-axis*at,0)*float(max(0,radius-at));
    sum+=texelFetch(original,p+axis*(extent-1-at),0)*float(max(0,at+radius-extent+1));
    color=sum/float(radius*2+1);}`,['original','axis','radius']);
   build('small',`uniform ivec2 axis;uniform int radius;void main(){ivec2 p=pixel();vec4 sum=vec4(0.);for(int i=-8;i<=8;i++){if(abs(i)<=radius)sum+=texelFetch(image,clamp(p+axis*i,ivec2(0),size-1),0);}color=sum/float(radius*2+1);}`,['axis','radius']);
   build('finish',`uniform sampler2D original;uniform int preserve;void main(){ivec2 p=pixel();vec4 c=texelFetch(image,p,0);vec3 rgb=c.a>0.00001?c.rgb/c.a:vec3(0.);float a=preserve==1?texelFetch(original,p,0).a:c.a;rgb=floor(clamp(rgb,0.,1.)*255.+.5)/255.;a=floor(clamp(a,0.,1.)*255.+.5)/255.;color=vec4(rgb*a,a);}`,['original','preserve']);
   const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
   const texture=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
   state={canvas,gl,programs,buffer,input:texture(),targets:Array.from({length:3},()=>({texture:texture(),fb:gl.createFramebuffer()})),width:0,height:0,max:gl.getParameter(gl.MAX_TEXTURE_SIZE),preference:preference(),bytes:0};
   const owner=state;
   canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();if(owner.retired)return;state=null;failed=true;last='Context lost; CPU fallback';});
   canvas.addEventListener('webglcontextrestored',()=>{if(!owner.retired){owner.retired=true;owner.gl.getExtension('WEBGL_lose_context')?.loseContext();owner.canvas.width=owner.canvas.height=1;failed=false;last='Restored; ready on next effect';}});
   return state;
  }catch{
   gl?.getExtension('WEBGL_lose_context')?.loseContext();state=null;failed=true;last='Unavailable; CPU fallback';return null;
  }
 }
 function blur(source,e,rx,ry,passes){
  // Tiny effects use the existing CPU implementation without a GL startup.
  const w=source.width,h=source.height,budget=window.WCPerf?.budget('gpuMB',64*1048576)||64*1048576;
  // Three RGBA32F targets + RGBA8 input + output. No depth/stencil/MSAA.
  if(w*h<16384||w*h*56>budget){last='Outside GPU working budget; CPU fallback';return null;}
  const s=init();if(!s||w>s.max||h>s.max)return null;
  const {gl,canvas,programs,targets}=s;
  try{
   if(w!==s.width||h!==s.height){
    canvas.width=w;canvas.height=h;
    if(gl.drawingBufferWidth!==w||gl.drawingBufferHeight!==h)throw Error('GPU size limit');
    for(const t of targets){gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,null);gl.bindFramebuffer(gl.FRAMEBUFFER,t.fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('GPU allocation failed');}
    if(gl.getError()!==gl.NO_ERROR)throw Error('GPU allocation failed');
    s.width=w;s.height=h;s.bytes=w*h*56;
   }
   gl.viewport(0,0,w,h);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,s.input);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
   const draw=(name,input,target,values={},original=null)=>{const p=programs[name];gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fb||null);gl.useProgram(p.id);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,input);gl.uniform1i(p.loc.image,0);gl.uniform2i(p.loc.size,w,h);if(original){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,original);gl.uniform1i(p.loc.original,1);}for(const [key,v]of Object.entries(values))Array.isArray(v)?gl.uniform2i(p.loc[key],...v):gl.uniform1i(p.loc[key],v);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);};
   let current=targets[0];draw('copy',s.input,current);
   const radius=sigma=>Math.max(0,Math.round((Math.sqrt(12*sigma*sigma/passes+1)-1)/2));
   for(let pass=0;pass<passes;pass++)for(const [axis,r]of [[[1,0],radius(rx)],[[0,1],radius(ry)]]){
    if(!r)continue;
    const original=current,spare=targets.filter(t=>t!==original);
    if(r<=8){current=spare[0];draw('small',original.texture,current,{axis,radius:r});continue;}
    let prefix=original,which=0;
    // Parallel inclusive prefix sums make large-radius box passes logarithmic
    // in the image dimension, rather than hundreds of samples per pixel.
    for(let offset=1;offset<(axis[0]?w:h);offset*=2){const target=spare[which];draw('scan',prefix.texture,target,{stepSize:[axis[0]*offset,axis[1]*offset]});prefix=target;which=1-which;}
    current=spare[which];draw('box',prefix.texture,current,{axis,radius:r},original.texture);
   }
   draw('finish',current.texture,null,{preserve:e.preserveAlpha?1:0},s.input);
   if(gl.isContextLost())throw Error('GPU context lost');
   last='WebGL2 directional blur';return canvas;
  }catch{reset();failed=true;last='GPU effect failed; CPU fallback';return null;}
 }
 window.WC65GPU={blur,reset,get status(){return last;},get bytes(){return state?.bytes||0;},get canvas(){return state?.canvas||null;}};
 window.addEventListener('pagehide',reset);
})();
