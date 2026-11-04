/*! WinCreate Android workspace and safe-area integration. */
(() => {
  if (!/Android/i.test(navigator.userAgent)) return;
  const body=document.body, root=document.documentElement, native=window.WinCreateAndroid;
  body.classList.add('wc-android');
  let requested=false, frame=0, nativeInsets=false;
  let custom={};
  try { custom=JSON.parse(localStorage.getItem('wincreate_android_spacing_v514')||'{}'); } catch (_) {}
  if(!custom||typeof custom!=='object'||Array.isArray(custom))custom={};
  const clamp=value=>Math.max(0,Math.min(160,Number(value)||0));
  function updateLegacyInsets(){
    // Older embedded WebViews can report zero CSS insets even under system bars.
    // This conservative fallback is adjustable; native reports replace it entirely.
    const legacy=/;\s*wv\)|\bwv\b|Version\/4\.0/i.test(navigator.userAgent)&&!nativeInsets&&!document.fullscreenElement;
    root.style.setProperty('--wc-legacy-top',legacy?'28px':'0px');
    root.style.setProperty('--wc-legacy-bottom',legacy?'16px':'0px');
  }
  function refit(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      root.style.setProperty('--wc-app-height',(window.visualViewport?.height||innerHeight)+'px');
      if(!isDrawing&&!SHAPE_EDITOR.active)window.WinCreate?.fitCanvasFullscreen?.();
    });
  }
  function applyCustom(){
    for(const side of ['top','bottom']){
      if(Number.isFinite(custom[side]))root.style.setProperty('--wc-manual-'+side,clamp(custom[side])+'px');
      else root.style.removeProperty('--wc-manual-'+side);
    }
    try{localStorage.setItem('wincreate_android_spacing_v514',JSON.stringify(custom));}catch(_){}
    refit();
  }
  function setInsets(insets){
    if(!insets||!['top','right','bottom','left'].every(k=>Number.isFinite(insets[k])))return;
    nativeInsets=true;
    for(const side of ['top','right','bottom','left'])root.style.setProperty('--wc-native-'+side,clamp(insets[side])+'px');
    updateLegacyInsets();refit();
  }
  function readNativeInsets(){
    if(!native?.getSafeAreaInsets)return;
    try{setInsets(JSON.parse(native.getSafeAreaInsets()));}catch(_){}
  }
  function enterImmersive(){
    if(native?.setImmersiveMode){try{native.setImmersiveMode(true);requested=true;}catch(_){}readNativeInsets();}
    else if(!document.fullscreenElement&&document.documentElement.requestFullscreen&&navigator.userActivation?.isActive){
      document.documentElement.requestFullscreen({navigationUI:'hide'}).then(()=>{requested=true;updateLegacyInsets();refit();}).catch(()=>{});
    }
    refit();
  }
  document.addEventListener('wincreate:android-insets',e=>setInsets(e.detail));
  document.addEventListener('fullscreenchange',()=>{updateLegacyInsets();refit();});
  updateLegacyInsets();applyCustom();readNativeInsets();
  if(native?.setImmersiveMode)enterImmersive();
  document.getElementById('pageSetup')?.addEventListener('click',e=>{
    if(e.target.closest('button,.preset-card,.preset-tile,.gallery-project-card'))enterImmersive();
  },true);
  window.WinCreate?.on?.('canvasInit',()=>{if(!requested)enterImmersive();readNativeInsets();refit();});
  window.addEventListener('resize',()=>{readNativeInsets();refit();});
  window.addEventListener('orientationchange',()=>setTimeout(()=>{readNativeInsets();refit();},180));
  window.visualViewport?.addEventListener('resize',refit);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(native?.setImmersiveMode&&requested)enterImmersive();readNativeInsets();refit();}});
  const more=document.getElementById('studioMoreTools');
  if(more){
    const library=document.getElementById('studioBrushLibrary');
    if(library){const label=document.createElement('span');label.textContent='Brush library';library.append(label);more.prepend(library);}
    const screen=document.createElement('div');screen.className='wc-screen-settings';
    screen.innerHTML='<button type="button" id="wcAndroidFullscreen">⛶ Full screen</button><details><summary>Screen spacing</summary><label>Top <input id="wcScreenTop" type="number" min="0" max="160" step="1" inputmode="numeric" aria-label="Top screen spacing"> px</label><label>Bottom <input id="wcScreenBottom" type="number" min="0" max="160" step="1" inputmode="numeric" aria-label="Bottom screen spacing"> px</label><button type="button" id="wcScreenAuto">Use automatic spacing</button></details>';
    more.append(screen);screen.querySelector('#wcAndroidFullscreen').onclick=enterImmersive;
    for(const side of ['top','bottom']){
      const input=screen.querySelector(side==='top'?'#wcScreenTop':'#wcScreenBottom');
      input.value=Number.isFinite(custom[side])?custom[side]:'';input.placeholder='Auto';
      input.onchange=()=>{if(input.value==='')delete custom[side];else custom[side]=clamp(input.value);applyCustom();};
    }
    screen.querySelector('#wcScreenAuto').onclick=()=>{custom={};screen.querySelectorAll('input').forEach(el=>el.value='');applyCustom();readNativeInsets();};
  }
  for(const b of document.querySelectorAll('#studioToolButtons button')){
    if(!b.getAttribute('aria-label'))b.setAttribute('aria-label',b.title||b.textContent.trim());
  }
  window.WinCreateAndroidUI={setInsets,enterImmersive};
})();
