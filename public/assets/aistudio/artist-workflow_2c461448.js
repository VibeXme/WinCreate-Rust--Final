/*! WinCreate application code. All rights reserved by its respective authors. */
WinCreate.use(app=>{
  const match=document.getElementById('matchPaintBrushBtn');
  const popovers=[...document.querySelectorAll('.popover')];
  const syncPanels=()=>document.body.classList.toggle('artist-popover-open',popovers.some(p=>p.classList.contains('open')&&!p.classList.contains('docked')));
  const panels=new MutationObserver(syncPanels);for(const pop of popovers)panels.observe(pop,{attributes:true,attributeFilter:['class']});syncPanels();
  const update=()=>{match.hidden=currentTool!=='smudge';match.textContent='Use Paint Brush';};
  match.onclick=()=>matchPaintBrush(currentTool);app.on('toolChange',update);update();
  // Long-press is an additional shortcut; ordinary taps and keyboard activation
  // retain the existing select / tap-again-to-open-library behavior.
  for(const tool of ['smudge']){
    const button=document.getElementById(tool+'Btn');let timer=0,start=null,matched=false,suppressUntil=0;
    const cancel=()=>{clearTimeout(timer);timer=0;start=null;};
    button.addEventListener('pointerdown',e=>{if(e.button!==0)return;cancel();matched=false;start={id:e.pointerId,x:e.clientX,y:e.clientY};timer=setTimeout(()=>{timer=0;matched=true;suppressUntil=performance.now()+1000;matchPaintBrush(tool);},450);},{capture:true});
    button.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)cancel();},{capture:true});
    button.addEventListener('pointerup',e=>{const didMatch=matched;cancel();if(didMatch){matched=false;suppressUntil=performance.now()+650;e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
    button.addEventListener('pointercancel',()=>{cancel();matched=false;},{capture:true});
    button.addEventListener('pointerleave',()=>{if(timer)cancel();},{capture:true});
    button.addEventListener('contextmenu',e=>{if(timer||performance.now()<suppressUntil)e.preventDefault();});
    button.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
    window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  }
});
