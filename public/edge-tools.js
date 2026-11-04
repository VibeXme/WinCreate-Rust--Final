/*! WinCreate application code. All rights reserved by its respective authors. */
/* Bounded image analysis shared by the UI and paper-extraction worker. */
((root)=>{
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function edgeMap(image){
    const {width:w,height:h,data}=image,n=w*h,channels=new Uint8ClampedArray(n*4),edges=new Float32Array(n);
    // Composite RGB onto white, and measure alpha independently. This detects
    // black, white, colored and transparent ink without treating hidden RGB as ink.
    for(let p=0;p<n;p++){const i=p*4,a=data[i+3]/255;for(let c=0;c<3;c++)channels[i+c]=255+(data[i+c]-255)*a;channels[i+3]=data[i+3];}
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const p=y*w+x;let peak=0;
      for(let c=0;c<4;c++){
        const i=p*4+c,row=w*4;
        const gx=-channels[i-row-4]+channels[i-row+4]-2*channels[i-4]+2*channels[i+4]-channels[i+row-4]+channels[i+row+4];
        const gy=-channels[i-row-4]-2*channels[i-row]-channels[i-row+4]+channels[i+row-4]+2*channels[i+row]+channels[i+row+4];
        peak=Math.max(peak,Math.hypot(gx,gy));
      }
      edges[p]=Math.min(255,peak/4);
    }
    return {width:w,height:h,edges};
  }
  function snap(map,point,radius,threshold=24){
    if(!map)return {...point};
    const {width:w,height:h,edges,sx=1,sy=1}=map,cx=point.x*sx,cy=point.y*sy;
    const rx=clamp(radius*sx,1,24),ry=clamp(radius*sy,1,24);let best=Infinity,result={...point};
    for(let y=Math.max(1,Math.floor(cy-ry));y<=Math.min(h-2,Math.ceil(cy+ry));y++)for(let x=Math.max(1,Math.floor(cx-rx));x<=Math.min(w-2,Math.ceil(cx+rx));x++){
      const d=((x-cx)/rx)**2+((y-cy)/ry)**2,e=edges[y*w+x];if(d>1||e<threshold)continue;
      const score=d+.3*(1-e/255);if(score<best){best=score;result={x:x/sx,y:y/sy};}
    }
    return result;
  }
  function outlines(image,sensitivity,hex,blue=false){
    const map=edgeMap(image),data=new Uint8ClampedArray(image.data.length),num=parseInt(hex.slice(1),16);
    const rgb=blue?[56,189,248]:[(num>>16)&255,(num>>8)&255,num&255],threshold=Math.max(3,(100-sensitivity)*.58);
    for(let p=0;p<map.edges.length;p++){const i=p*4,e=map.edges[p];if(e>threshold){data.set(rgb,i);data[i+3]=Math.min(255,Math.round((e-threshold)*12));}else if(blue){data.set([10,16,34,95],i);}}
    return {width:image.width,height:image.height,data};
  }
  function* paperSteps(image,paper=[255,255,255],tolerance=20){
    const {width:w,height:h,data}=image,n=w*h;
    if(n>4194304)throw Error('Paper extraction supports up to 4 megapixels. Resize or crop this image first.');
    tolerance=clamp(Number(tolerance)||20,1,80);
    const background=new Uint8Array(n),queue=new Uint32Array(n);let head=0,tail=0,removed=0;
    const distance=p=>{const i=p*4;return Math.max(Math.abs(data[i]-paper[0]),Math.abs(data[i+1]-paper[1]),Math.abs(data[i+2]-paper[2]));};
    const add=p=>{if(background[p]||(data[p*4+3]>8&&distance(p)>tolerance))return;background[p]=1;queue[tail++]=p;};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const p=queue[head++],x=p%w;if(x)add(p-1);if(x<w-1)add(p+1);if(p>=w)add(p-w);if(p<n-w)add(p+w);if((head&32767)===0)yield;}
    // Clear only paper connected to the perimeter. Enclosed white details and
    // disconnected white strokes are retained. The source is never modified.
    const out=new Uint8ClampedArray(data);
    for(let p=0;p<n;p++){if(background[p]){if(out[p*4+3]>8)removed++;out[p*4+3]=0;}if((p&32767)===0)yield;}
    // Unmatte the remaining boundary against nearby solid ink so gray paper
    // fringes become transparent antialiasing, rather than blurred white halos.
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const p=y*w+x,i=p*4;if((p&32767)===0)yield;if(background[p]||!data[i+3]||!(background[p-1]||background[p+1]||background[p-w]||background[p+w]))continue;
      let inkDistance=distance(p);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h){const q=yy*w+xx;if(!background[q]&&data[q*4+3]>200)inkDistance=Math.max(inkDistance,distance(q));}}
      const coverage=inkDistance?clamp(distance(p)/inkDistance,0,1):1;
      if(coverage<.995&&coverage>0){for(let c=0;c<3;c++)out[i+c]=clamp((data[i+c]-paper[c]*(1-coverage))/coverage,0,255);out[i+3]=Math.round(data[i+3]*coverage);}
    }
    return {width:w,height:h,data:out,removed};
  }
  function removePaper(...args){const it=paperSteps(...args);let r;do{r=it.next();}while(!r.done);return r.value;}
  async function removePaperCooperative(...args){const it=paperSteps(...args);let r;do{r=it.next();if(!r.done)await new Promise(resolve=>setTimeout(resolve,0));}while(!r.done);return r.value;}
  const api={edgeMap,snap,outlines,removePaper,removePaperCooperative};root.WCEdgeTools=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof document==='undefined'&&typeof root.postMessage==='function')root.onmessage=e=>{try{const result=removePaper(e.data.image,e.data.paper,e.data.tolerance);root.postMessage(result,[result.data.buffer]);}catch(error){root.postMessage({error:error.message});}};
})(typeof self!=='undefined'?self:globalThis);
