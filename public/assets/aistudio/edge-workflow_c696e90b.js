/*! WinCreate application code. All rights reserved by its respective authors. */
WinCreate.use(app=>{
  'use strict';
  function referenceCanvas(maxEdge=Infinity){
    if(!TRACE.hasImage)throw Error('Import a reference image first.');
    const ratio=Math.min(1,maxEdge/Math.max(WIDTH,HEIGHT)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(WIDTH*ratio));c.height=Math.max(1,Math.round(HEIGHT*ratio));
    const src=TRACE.rawImageCanvas,r=TRACE.fitMode==='cover'?Math.max(c.width/src.width,c.height/src.height):Math.min(c.width/src.width,c.height/src.height);
    c.getContext('2d').drawImage(src,(c.width-src.width*r)/2,(c.height-src.height*r)/2,src.width*r,src.height*r);return c;
  }
  function selectionMap(source='drawing'){
    if(source==='active'&&!layers.some(l=>l.id===activeLayerId&&!l.isFolder))throw Error('Select an image or paint layer first.');
    const ratio=Math.min(1,1024/Math.max(WIDTH,HEIGHT));let c;
    if(source==='reference')c=referenceCanvas(1024);
    else{
      c=document.createElement('canvas');c.width=Math.max(1,Math.round(WIDTH*ratio));c.height=Math.max(1,Math.round(HEIGHT*ratio));const ctx=c.getContext('2d',{willReadFrequently:true});
      const chosen=source==='active'?[getActiveLayer()]:layers;
      for(const l of chosen)if(l&&!l.isFolder&&(source==='active'||isLayerEffectivelyVisible(l))){ctx.save();ctx.globalAlpha=source==='active'?1:getEffectiveLayerOpacity(l);ctx.globalCompositeOperation=l.blend==='normal'?'source-over':l.blend;ctx.drawImage(createLayerComposite(l),0,0,c.width,c.height);ctx.restore();}
    }
    const map=WCEdgeTools.edgeMap(c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height));map.sx=c.width/WIDTH;map.sy=c.height/HEIGHT;return map;
  }
  function hideBackground(){
    if(isDrawing)finishPointerStroke();if(!bgVisible){app.msg('Canvas background is already transparent.');return;}
    app.saveFullStateUndo();bgVisible=false;drawBackground();app.renderLayers();app.markUnsavedChanges();app.msg('Canvas background hidden. Drawing strokes are preserved.');
  }
  let busy=false;
  async function extractInk(source='active'){
    if(busy)return false;const l=source==='active'?layers.find(layer=>layer.id===activeLayerId&&!layer.isFolder):null;
    if(source==='active'&&(!l||l.isFolder)){app.msg('Select an image or paint layer first.');return false;}
    if(WIDTH*HEIGHT>4194304){app.msg('Paper extraction supports up to 4 megapixels. Resize or crop first.');return false;}
    if(l?.clipMask){app.msg('Extract ink from an unclipped image layer first.');return false;}
    if(isDrawing)finishPointerStroke();if(SHAPE_EDITOR.active)commitEditableShape();
    busy=true;document.querySelectorAll('[data-extract-ink]').forEach(b=>b.disabled=true);
    const revision=editRevision,w=WIDTH,h=HEIGHT,reference=TRACE.rawImageCanvas,fit=TRACE.fitMode,traceRevision=TRACE.revision;
    try{
      const c=source==='reference'?referenceCanvas():createLayerComposite(l),image=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h);
      const hex=$('inkPaperColor').value,paper=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),tolerance=+$('inkPaperTolerance').value;
      app.msg('Separating paper from ink…');
      const changed=()=>revision!==editRevision||WIDTH!==w||HEIGHT!==h||(l&&getActiveLayer()!==l)||(source==='reference'&&(TRACE.revision!==traceRevision||!TRACE.hasImage));
      const fallback=async()=>{
        if(changed())throw Error('Drawing changed during extraction. Run it again on the current image.');
        // Local-file WebViews can disallow workers. Yield between bounded chunks
        // instead, and obtain a fresh snapshot if a worker detached the buffer.
        const pixels=image.data.byteLength?image:(source==='reference'?referenceCanvas():createLayerComposite(l)).getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h);
        return WCEdgeTools.removePaperCooperative(pixels,paper,tolerance);
      };
      const result=await new Promise((resolve,reject)=>{
        let worker,timer,settled=false;
        const finish=(error,data)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve(data);};
        const localFallback=()=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();fallback().then(resolve,reject);};
        try{
          worker=new Worker('edge-tools.js?v=6.5.2');timer=setTimeout(()=>finish(Error('Paper extraction timed out. Try a smaller image.')),30000);
          worker.onmessage=e=>finish(e.data.error?Error(e.data.error):null,e.data);worker.onerror=event=>{event.preventDefault();localFallback();};
          worker.postMessage({image,paper,tolerance},[image.data.buffer]);
        }catch(error){localFallback();}
      });
      if(revision!==editRevision||WIDTH!==w||HEIGHT!==h||(source==='active'&&getActiveLayer()!==l)||(source==='reference'&&(TRACE.rawImageCanvas!==reference||TRACE.fitMode!==fit||!TRACE.hasImage||TRACE.revision!==traceRevision))){app.msg('Drawing changed during extraction. Run it again on the current image.');return false;}
      if(!result.removed){app.msg('No matching paper reached the image edge. Adjust Paper colour or Tolerance.');return false;}
      app.saveFullStateUndo();
      const output=app.createLayer(source==='reference'?'Reference · transparent ink':l.name+' · transparent ink');output.ctx.putImageData(new ImageData(result.data,w,h),0,0);output.thumbDirty=true;
      if(l){output.opacity=l.opacity;output.blend=l.blend;output.parentId=l.parentId;l.visible=false;layers.pop();layers.splice(layers.indexOf(l)+1,0,output);}
      bgVisible=false;drawBackground();if(source==='reference'){TRACE.visible=false;renderTraceReference();$('traceVisSwitch')?.classList.remove('on');}
      app.syncLayers();app.renderLayers();app.markUnsavedChanges();app.msg('Transparent ink copy created. Original image kept.');return true;
    }catch(error){app.msg(error.message);return false;}
    finally{busy=false;document.querySelectorAll('[data-extract-ink]').forEach(b=>b.disabled=false);}
  }
  app.edgeSelection={buildMap:selectionMap,snap:WCEdgeTools.snap};
  app.inkExtraction={extract:extractInk,hideBackground,get busy(){return busy;}};
  $('hideCanvasBackgroundBtn').onclick=hideBackground;
  $('extractActiveInkBtn').onclick=()=>extractInk('active');$('extractReferenceInkBtn').onclick=()=>extractInk('reference');
  $('inkPaperTolerance').oninput=e=>$('inkPaperToleranceLabel').textContent=e.target.value;
  $('transparentExportBtn').onclick=()=>{hideBackground();app.exports.saveArtwork('files');};
});
