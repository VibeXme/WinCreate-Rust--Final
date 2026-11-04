/*! WinCreate 5.14.8: geometric eraser clips. Original paths remain vector paths. */
(() => {
  'use strict';
  const C=ClipperLib,S=4096,cache=new Map(),regionCache=new Map();let cachedPoints=0,regionChars=0,regionPoints=0,liveRecord=null,liveState=null;
  const cutKey=er=>JSON.stringify([er.kind||'',er.width||1,er.selectionPoints||null,er.points||[]]);
  const point=p=>({X:Math.round(p.x*S),Y:Math.round(p.y*S)});
  function normalize(path){if(!C.Clipper.Orientation(path))path.reverse();return path;}
  function boolean(subject,clip,type){
    if(!subject.length)return [];
    if(!clip.length)return type===C.ClipType.ctIntersection?[]:subject;
    const c=new C.Clipper(C.Clipper.ioStrictlySimple),out=[];
    c.AddPaths(subject,C.PolyType.ptSubject,true);c.AddPaths(clip,C.PolyType.ptClip,true);
    c.Execute(type,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);return out;
  }
  function union(paths){if(!paths.length)return [];const c=new C.Clipper(C.Clipper.ioStrictlySimple),out=[];c.AddPaths(paths,C.PolyType.ptSubject,true);c.Execute(C.ClipType.ctUnion,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);return out;}
  function samples(source,width){
    const out=[];
    for(const p of source){const pt={x:p.x,y:p.y,r:Math.max(.125,p.r??width/2)};
      while(out.length>1){const a=out.at(-2),b=out.at(-1),dx=pt.x-a.x,dy=pt.y-a.y,dd=dx*dx+dy*dy;if(dd<1e-8)break;const t=((b.x-a.x)*dx+(b.y-a.y)*dy)/dd;
        if(t<=0||t>=1||Math.hypot(b.x-a.x-dx*t,b.y-a.y-dy*t)>.01||Math.abs(b.r-a.r-(pt.r-a.r)*t)>.01)break;out.pop();}
      out.push(pt);
    }return out;
  }
  function cut(er){
    const key=cutKey(er);if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);if(er===liveRecord)rememberLive(er,value.paths);return value.paths;}
    let paths=[];let ptsToCut=er.points||[],prefix=null;
    const selection=JSON.stringify(er.selectionPoints||null);
    if(er===liveRecord&&liveState&&er.kind!=='selection'&&liveState.width===er.width&&liveState.selection===selection&&ptsToCut.length>=liveState.points.length&&liveState.points.every((p,i)=>p.x===ptsToCut[i].x&&p.y===ptsToCut[i].y&&p.r===ptsToCut[i].r)){prefix=liveState.paths;ptsToCut=ptsToCut.slice(Math.max(0,liveState.points.length-1));}
    if(er.kind==='selection'){if(er.points?.length>2)paths=[normalize(er.points.map(point))];}
    else {
      const pts=samples(ptsToCut,er.width||1);
      for(let i=0;i<pts.length;i++){
        const p=pts[i],n=Math.max(16,Math.min(512,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-.01/p.r))))),circle=[];
        for(let j=0;j<n;j++){const a=j/n*Math.PI*2;circle.push(point({x:p.x+Math.cos(a)*p.r,y:p.y+Math.sin(a)*p.r}));}paths.push(normalize(circle));
        if(!i)continue;const q=pts[i-1],dx=p.x-q.x,dy=p.y-q.y,len=Math.hypot(dx,dy);if(len<.001)continue;
        const nx=-dy/len,ny=dx/len;
        paths.push(normalize([{x:q.x+nx*q.r,y:q.y+ny*q.r},{x:p.x+nx*p.r,y:p.y+ny*p.r},{x:p.x-nx*p.r,y:p.y-ny*p.r},{x:q.x-nx*q.r,y:q.y-ny*q.r}].map(point)));
      }
    }
    paths=union(paths);
    if(er.selectionPoints?.length>2)paths=boolean(paths,[normalize(er.selectionPoints.map(point))],C.ClipType.ctIntersection);
    if(prefix)paths=union([...prefix,...paths]);
    if(er===liveRecord)rememberLive(er,paths);
    const size=paths.reduce((n,p)=>n+p.length,0);
    if(size<=2000000){while(cache.size&&(cache.size>=512||cachedPoints+size>2000000)){const k=cache.keys().next().value;cachedPoints-=cache.get(k).size;cache.delete(k);}cache.set(key,{paths,size});cachedPoints+=size;}
    return paths;
  }
  function rememberLive(er,paths){liveState={width:er.width,selection:JSON.stringify(er.selectionPoints||null),points:(er.points||[]).map(p=>({x:p.x,y:p.y,r:p.r})),paths};}
  function pathData(paths){return paths.map(p=>p.length?'M'+p.map(q=>`${q.X/S} ${q.Y/S}`).join('L')+'Z':'').join('');}
  function regions(erasures,width,height){
    const keys=erasures.map(er=>[cutKey(er),er.opacity??1]),cacheKey=width+'x'+height+':'+JSON.stringify(keys);if(regionCache.has(cacheKey)){const hit=regionCache.get(cacheKey);regionCache.delete(cacheKey);regionCache.set(cacheKey,hit);return hit.value;}
    let parts=[{alpha:1,paths:[normalize([{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}].map(point))]}];
    let start=0;
    // A committed history is immutable during a live eraser gesture. Reuse its
    // geometric regions instead of replaying all previous cuts on every frame.
    if(erasures.length>1){const prefix=regionCache.get(width+'x'+height+':'+JSON.stringify(keys.slice(0,-1)));if(prefix?.parts){parts=prefix.parts;start=erasures.length-1;}}
    for(let index=start;index<erasures.length;index++){const er=erasures[index],opacity=Math.max(0,Math.min(1,er.opacity??1));if(!opacity)continue;const area=cut(er);if(!area.length)continue;const grouped=new Map();
      const add=(alpha,paths)=>{if(alpha<.000001||!paths.length)return;const key=Math.round(alpha*1e6)/1e6;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(...paths);};
      for(const part of parts){add(part.alpha,boolean(part.paths,area,C.ClipType.ctDifference));if(opacity<1)add(part.alpha*(1-opacity),boolean(part.paths,area,C.ClipType.ctIntersection));}
      parts=[...grouped].map(([alpha,paths])=>({alpha,paths:union(paths)}));
    }
    const value=parts.map(p=>({alpha:p.alpha,d:pathData(p.paths)})),chars=cacheKey.length+value.reduce((n,p)=>n+p.d.length,0);
    const points=parts.reduce((count,part)=>count+part.paths.reduce((n,path)=>n+path.length,0),0);
    if(chars<=32000000&&points<=2000000){while(regionCache.size&&(regionCache.size>=512||regionChars+chars>32000000||regionPoints+points>2000000)){const k=regionCache.keys().next().value,old=regionCache.get(k);regionChars-=old.chars;regionPoints-=old.points;regionCache.delete(k);}regionCache.set(cacheKey,{value,parts,chars,points});regionChars+=chars;regionPoints+=points;}return value;
  }
  window.WCVectorCuts={regions,cut,pathData,live(er){if(liveRecord!==er){liveRecord=er;liveState=null;}},endLive(){liveRecord=null;liveState=null;}};
})();
