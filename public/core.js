/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
const $ = id => document.getElementById(id);
const escapeMarkup = value => String(value ?? '').replace(/[&<>\"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
const VALID_HEX = /^#[0-9a-f]{6}$/i;

const ENGINE = {
  renderPipeline: 'vector',
  vectorBrushes: true,
  crispVectorZoom: true,
  smoothingMode: 'high',
  colorSpace: 'srgb',
  ssaaFactor: 2,
  edgeFeather: 0,
  autoFxaa: false,
  chaikinSubdiv: true,
  quickShapeDelay: 750,
  quickShapeInteractive: true,
  coalescedInput: true,
  pressureGamma: 1,
  floodTolerance: 42,
  fillGap: 4,
  fillExpand: 3,
  dragFill: true,
  undoMax: 100,
  zenHud: true,
  fpsTelemetry: false,
  deviceMode: 'auto',
  userUiScale: 1,
  canvasBackend: 'accelerated',
  gpuPreference: /Android/i.test(navigator.userAgent) ? 'auto' : 'high-performance',
  gpuDrawingEnabled: true,
  gpuWetPaintEnabled: true,
  gpuEffectsEnabled: true
};

// Persist only supported engine preferences, not mutable scene data.
try {
  const savedEngine = JSON.parse(localStorage.getItem('wincreate_engine_v34') || '{}');
  if (['readback', 'accelerated'].includes(savedEngine.canvasBackend)) ENGINE.canvasBackend = savedEngine.canvasBackend;
  if (['auto', 'high-performance', 'low-power'].includes(savedEngine.gpuPreference)) ENGINE.gpuPreference = savedEngine.gpuPreference;
  if (typeof savedEngine.gpuDrawingEnabled === 'boolean') ENGINE.gpuDrawingEnabled = savedEngine.gpuDrawingEnabled;
  if (typeof savedEngine.gpuWetPaintEnabled === 'boolean') ENGINE.gpuWetPaintEnabled = savedEngine.gpuWetPaintEnabled;
  if (typeof savedEngine.gpuEffectsEnabled === 'boolean') ENGINE.gpuEffectsEnabled = savedEngine.gpuEffectsEnabled;
} catch (_) {}
function persistEnginePreferences() {
  try {
    localStorage.setItem('wincreate_engine_v34', JSON.stringify({
      canvasBackend: ENGINE.canvasBackend,
      gpuPreference: ENGINE.gpuPreference,
      gpuDrawingEnabled: ENGINE.gpuDrawingEnabled,
      gpuWetPaintEnabled: ENGINE.gpuWetPaintEnabled,
      gpuEffectsEnabled: ENGINE.gpuEffectsEnabled
    }));
  } catch (_) {}
}
const TRACE = {
  revision: 0,
  hasImage: false,
  visible: true,
  rawImageCanvas: document.createElement('canvas'),
  fittedCanvas: document.createElement('canvas'),
  opacity: 45,
  fitMode: 'contain',
  mode: 'original',
  edgeSensitivity: 68,
  outlineColor: '#c084fc'
};

const SHAPE_EDITOR = {
  active: false,
  kind: 'line',
  filled: false,
  strokeR: 8,
  p1: { x: 200, y: 200 },
  p2: { x: 500, y: 200 },
  minX: 200,
  maxX: 500,
  minY: 200,
  maxY: 400,
  dragMode: null,
  dragStartPt: { x: 0, y: 0 },
  snapState: null,
  curveControl: null
};

const AI_PALETTES = {
  obsidian: ['#111115','#181824','#27273a','#4c1d95','#6d28d9','#6366f1','#8b5cf6','#a855f7','#e0e7ff','#38bdf8','#34d399','#f43f5e','#f8fafc','#ffffff'],
  cyber: ['#05050a','#0f172a','#3b0764','#701a75','#d946ef','#f43f5e','#ec4899','#8b5cf6','#06b6d4','#22d3ee','#fde047','#ffffff','#94a3b8','#334155'],
  forest: ['#041311','#062c28','#0f4c45','#14b8a6','#2dd4bf','#34d399','#a7f3d0','#38bdf8','#818cf8','#c084fc','#f472b6','#ecfdf5','#64748b','#1e293b'],
  solar: ['#0f0708','#2a0f12','#4c111b','#7f1d1d','#dc2626','#ea580c','#f97316','#fbbf24','#fde047','#fef08a','#c084fc','#8b5cf6','#e4e4e7','#52525b']
};

// Every preset has an explicit tip behavior. Only genuine round ink is stored as vector.
const BRUSHES = {
  Inking: [
    {id:'studio',name:'Studio Pen',spacing:.06,alpha:1,stream:35,taper:20,tip:'round',vector:true},
    {id:'technical',name:'Technical Pen',spacing:.05,alpha:1,stream:45,taper:10,tip:'round',vector:true},
    {id:'micro_liner',name:'Micro Liner',spacing:.04,alpha:1,stream:50,taper:0,tip:'round',vector:true},
    {id:'fountain',name:'Fountain Ink',spacing:.06,alpha:.94,stream:42,taper:38,tip:'round',vector:true},
    {id:'monoline',name:'Monoline',spacing:.05,alpha:1,stream:60,taper:0,tip:'round',vector:true},
    {id:'dry_ink',name:'Dry Ink',spacing:.11,alpha:.9,stream:25,taper:15,tip:'dry'},
    {id:'brush_ink',name:'Brush Ink',spacing:.075,alpha:.94,stream:35,taper:56,tip:'bristle'}
  ],
  Sketching: [
    {id:'2h',name:'2H Drafting Pencil',spacing:.11,alpha:.45,stream:20,taper:4,tip:'graphite'},
    {id:'hb',name:'HB Graphite',spacing:.12,alpha:.66,stream:20,taper:5,tip:'graphite'},
    {id:'6b',name:'6B Pencil',spacing:.13,alpha:.76,stream:15,taper:5,tip:'graphite'},
    {id:'graphite',name:'Graphite Shading',spacing:.16,alpha:.48,stream:17,taper:0,tip:'graphite'},
    {id:'peppermint',name:'Loose Sketch',spacing:.16,alpha:.6,stream:15,taper:5,tip:'graphite'},
    {id:'conte',name:'Conte Crayon',spacing:.14,alpha:.75,stream:15,taper:0,tip:'grain'}
  ],
  Painting: [
    {id:'acrylic',name:'Flat Marker',spacing:.12,alpha:.8,stream:20,taper:0,tip:'marker'},
    {id:'gouache',name:'Opaque Gouache',spacing:.13,alpha:.85,stream:25,taper:0,tip:'gouache'},
    {id:'watercolor',name:'Watercolor Wash',spacing:.2,alpha:.28,stream:25,taper:0,tip:'watercolor'},
    {id:'oil_brush',name:'Oil Bristles',spacing:.14,alpha:.8,stream:20,taper:0,tip:'bristle'},
    {id:'dry_brush',name:'Dry Bristle',spacing:.17,alpha:.65,stream:20,taper:0,tip:'dry'},
    {id:'chalk',name:'Soft Chalk',spacing:.15,alpha:.65,stream:12,taper:0,tip:'grain'},
    {id:'charcoal',name:'Charcoal Block',spacing:.17,alpha:.7,stream:10,taper:0,tip:'grain'},
    {id:'pastel',name:'Soft Pastel',spacing:.15,alpha:.56,stream:14,taper:0,tip:'pastel'},
    {id:'oil_pastel',name:'Oil Pastel',spacing:.12,alpha:.78,stream:20,taper:0,tip:'grain'}
  ],
  Airbrushing: [
    {id:'soft_air',name:'Soft Airbrush',spacing:.18,alpha:.18,stream:20,taper:0,tip:'air'},
    {id:'hard_air',name:'Hard Airbrush',spacing:.08,alpha:.88,stream:25,taper:10,tip:'round'},
    {id:'spray',name:'Spray Paint',spacing:.26,alpha:.47,stream:15,taper:0,tip:'spray'},
    {id:'splatter',name:'Paint Splatter',spacing:.38,alpha:.8,stream:14,taper:0,tip:'splatter'}
  ],
  Calligraphy: [
    {id:'script',name:'Chisel Script',spacing:.06,alpha:1,stream:55,taper:45,tip:'chisel'},
    {id:'ribbon',name:'Ribbon Lettering',spacing:.055,alpha:.92,stream:48,taper:25,tip:'ribbon'},
    {id:'soft_marker',name:'Calligraphy Marker',spacing:.09,alpha:.8,stream:35,taper:20,tip:'marker'}
  ],
  Textures: [
    {id:'stipple',name:'Stipple Dots',spacing:.25,alpha:.82,stream:16,taper:0,tip:'stipple'},
    {id:'halftone',name:'Halftone',spacing:.29,alpha:.85,stream:14,taper:0,tip:'halftone'},
    {id:'foliage',name:'Foliage',spacing:.32,alpha:.83,stream:15,taper:0,tip:'foliage'},
    {id:'pixel',name:'Pixel Brush',spacing:.12,alpha:1,stream:0,taper:0,tip:'pixel'},
    {id:'neon',name:'Neon Light',spacing:.08,alpha:.95,stream:36,taper:10,tip:'neon'}
  ]
};
const BRUSH_LOOKUP = new Map(Object.values(BRUSHES).flat().map(b => [b.id,b]));
function getBrushTip(id) { return BRUSH_LOOKUP.get(id)?.tip || 'round'; }
function isVectorCompatibleBrush(br) { return !!br && br.vector === true && (br.tip === 'round' || !br.tip); }


const CUSTOM_BRUSH_TIPS = Object.create(null), CUSTOM_SHAPES = Object.create(null), EVENT_BUS = Object.create(null);
const DEFAULT_KEYBINDS = {
  undo: 'Ctrl+Z', redo: 'Ctrl+Y', save: 'Ctrl+S', brush: 'B', eraser: 'E',
  smudge: 'S', move: 'V', eyedropper: 'I', layers: 'L', color: 'C',
  zoomIn: '=', zoomOut: '-', fitView: '0'
};
let KEYBINDS = Object.assign({}, DEFAULT_KEYBINDS);
try { Object.assign(KEYBINDS, JSON.parse(localStorage.getItem('wincreate_keybinds_v1') || '{}')); } catch (_) { /* corrupt local preferences should not block launch */ }
let listeningKeyAction = null;

// Per-brush settings & favourites persistence
let brushSettingsMap = {};
try { brushSettingsMap = JSON.parse(localStorage.getItem('wincreate_brush_settings_v1') || '{}'); } catch (_) {}
if(!brushSettingsMap||typeof brushSettingsMap!=='object'||Array.isArray(brushSettingsMap))brushSettingsMap={};
let favouriteBrushIds = new Set();
try { favouriteBrushIds = new Set(JSON.parse(localStorage.getItem('wincreate_fav_brushes_v1') || '["studio","6b"]')); } catch (_) {}
let recentBrushIds = ['studio'];
let artworkBrushHistory = []; // Stores { brushId, brushName, color, size, opacity, stream, taper }

let WIDTH = Math.max(200, window.innerWidth || 1280), HEIGHT = Math.max(200, window.innerHeight || 800);
let bgColor = '#ffffff', bgVisible = true, bgImageCanvas = null;
let layers = [], activeLayerId = null, selectedLayerIds = new Set(), referenceLayerId = null, layerSeq = 1, folderSeq = 1, openBlendDrawerLayerId = null;
let undoStack = [], redoStack = [];
let scale = 1, panX = 0, panY = 0, rotation = 0, flipX = 1, guideType = 'off';
let activeSet = 'Inking', currentTool = 'brush';
let toolBrushes = { brush: BRUSHES.Inking[0], smudge: BRUSHES.Painting[0], eraser: BRUSHES.Inking[0] };
let brushSize = 20, brushOpacity = 100, currentColor = '#6366f1', curH = 239, curS = 84, swatches = [...AI_PALETTES.obsidian];
let isSpace = false, isPanning = false, panStart = { x: 0, y: 0 }, isDrawing = false, splinePts = [], smoothPt = { x: 0, y: 0 }, lastRawPt = { x: 0, y: 0 }, rawStrokeLen = 0, smudgeHex = '#ffffff';
let strokeCanVectorize = false;
let editingTargetPending = false, strokeUndoRecord = null, strokeSavedState = null;
let activeDrawingPointer = null, penInRangeUntil = 0, penLastTap = null, temporaryPenEraser = null;
let touchTapGesture = null;
let quickShapeTimer = null, quickShapeActive = false, quickShapeKind = 'line', moveSnap = null, moveVectorStart = null, moveMaskStart = null, moveStart = { x: 0, y: 0 }, modActive = false;
let touchPinchDist = 0, touchStartAngle = 0, touchLastMid = null;
let lastStrokeLatencyMs = 0, hasUnsavedChanges = false, editRevision = 0;

const pixelSamplerCanvas = document.createElement('canvas');
pixelSamplerCanvas.width = 1; pixelSamplerCanvas.height = 1;
const pixelSamplerCtx = pixelSamplerCanvas.getContext('2d', { willReadFrequently: true });

const board = $('board'), viewportEl = $('viewport'), bgCanvas = $('bgCanvas'), bgCtx = bgCanvas.getContext('2d');
const traceCanvas = $('traceCanvas'), traceCtx = traceCanvas.getContext('2d'), guideCanvas = $('guideCanvas'), guideCtx = guideCanvas.getContext('2d');
const brushRing = $('brushRing'), layerMenuSheet = $('layerMenuSheet'), dynamicIsland = $('dynamicIsland'), islandText = $('islandText');
const shapeEditOverlay = $('shapeEditOverlay'), qsBox = $('qsBox'), qsHandleStart = $('qsHandleStart'), qsHandleEnd = $('qsHandleEnd'), qsMeasurePill = $('qsMeasurePill'), quickShapeToolbar = $('quickShapeToolbar');

document.body.classList.add('zen-hud');
const getCurrentBrush = () => toolBrushes[currentTool] || toolBrushes.brush;

function markUnsavedChanges() {
  editRevision++;
  window.WinCreate?.animation?.dirty();
  if(hasUnsavedChanges)return; // Every edit still advances revisions above.
  hasUnsavedChanges = true;
  if ($('saveStatusText')) $('saveStatusText').textContent = 'Unsaved*';
  if ($('saveDotIndicator')) {
    $('saveDotIndicator').style.background = 'var(--ios-amber)';
    $('saveDotIndicator').style.boxShadow = '0 0 8px var(--ios-amber)';
  }
}

function markSavedStatus(label = 'Saved', revision = editRevision) {
  if(revision !== editRevision)return false;
  hasUnsavedChanges = false;
  if ($('saveStatusText')) $('saveStatusText').textContent = label;
  if ($('saveDotIndicator')) {
    $('saveDotIndicator').style.background = 'var(--ios-green)';
    $('saveDotIndicator').style.boxShadow = '0 0 8px var(--ios-green)';
  }
}

function create2DContext(c, frequentRead = true) {
  try {
    const useSoftwareReadback = !ENGINE.gpuDrawingEnabled || (frequentRead && ENGINE.canvasBackend === 'readback');
    return c.getContext('2d', {
      colorSpace: ENGINE.colorSpace || 'srgb',
      willReadFrequently: useSoftwareReadback,
      desynchronized: ENGINE.gpuDrawingEnabled && !useSoftwareReadback
    }) || c.getContext('2d');
  } catch (_) {
    return c.getContext('2d');
  }
}

function applyContextSmoothing(ctx) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = ENGINE.smoothingMode !== 'pixelated';
  if (ctx.imageSmoothingEnabled) ctx.imageSmoothingQuality = ENGINE.smoothingMode;
}

const scratchCanvas = document.createElement('canvas');
scratchCanvas.style.zIndex = 950;
const scratchCtx = create2DContext(scratchCanvas, false);
board.insertBefore(scratchCanvas, shapeEditOverlay);
// Vector strokes are previewed by the very same SVG path algorithm used after commit.
// This removes the soft raster -> sharp SVG switch on pointer-up.
const liveInkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
liveInkSvg.classList.add('vector-layer-surface', 'wc-live-ink');
liveInkSvg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
liveInkSvg.setAttribute('preserveAspectRatio', 'none');
liveInkSvg.style.cssText = 'z-index:955;display:none;pointer-events:none;';
const liveInkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
liveInkPath.setAttribute('fill', 'none');
liveInkPath.setAttribute('stroke-linecap', 'round');
liveInkPath.setAttribute('stroke-linejoin', 'round');
liveInkSvg.append(liveInkPath);
board.insertBefore(liveInkSvg, shapeEditOverlay);
let pendingLiveInkFrame=0,erasePreviewLayer=null,liveEraseRecord=null,lastLiveInkPaintAt=0;
function scheduleLiveVectorPreview(){
  if(pendingLiveInkFrame)return;
  pendingLiveInkFrame=requestAnimationFrame(()=>{pendingLiveInkFrame=0;if(!isDrawing)return;const now=performance.now();if(lastLiveInkPaintAt&&now-lastLiveInkPaintAt+.5<(window.WCPerf?.interval()||0)){scheduleLiveVectorPreview();return;}const start=performance.now();updateLiveVectorPreview();window.WCPerf?.observe(performance.now()-start);lastLiveInkPaintAt=start;});
}
function stopLiveVectorPreview() {
  lastLiveInkPaintAt=0;
  liveEraseRecord=null;WCVectorCuts.endLive();
  if(erasePreviewLayer){const l=erasePreviewLayer;l.canvas.style.clipPath='';l.surface.style.maskImage='';l.surface.style.webkitMaskImage='';l.surface.querySelector('.wc-raster-erase-preview')?.remove();renderVectorLayer(l);WCLayerMasks.sync(l);}
  erasePreviewLayer=null;
  if(pendingLiveInkFrame){cancelAnimationFrame(pendingLiveInkFrame);pendingLiveInkFrame=0;}
  liveInkSvg.style.display='none';liveInkPath.removeAttribute('d');scratchCanvas.style.visibility='';
}
function clonePaintNode(node){
  const copy=node.cloneNode(true),sources=node.querySelectorAll('canvas'),targets=copy.querySelectorAll('canvas');
  sources.forEach((canvas,i)=>targets[i].getContext('2d').drawImage(canvas,0,0));return copy;
}
function applyVectorCutRegions(mark,erasures,defs,id,cache=null){
  const ns='http://www.w3.org/2000/svg',group=document.createElementNS(ns,'g');let key,regions;
  if(cache){key=erasures.map(er=>{if(!cache.ids.has(er)){
    const geometry=JSON.stringify([er.kind||'',er.width||1,er.opacity??1,er.selectionPoints||null,er.points||[]]);
    cache.geometryIds ||= new Map();if(!cache.geometryIds.has(geometry))cache.geometryIds.set(geometry,cache.geometryIds.size);
    cache.ids.set(er,cache.geometryIds.get(geometry));
  }return cache.ids.get(er);}).join(',');regions=cache.regions.get(key);}
  if(!regions){regions=WCVectorCuts.regions(erasures,WIDTH,HEIGHT).map((region,i)=>{
    const clip=document.createElementNS(ns,'clipPath'),path=document.createElementNS(ns,'path');
    clip.id=id+'-'+i;clip.setAttribute('clipPathUnits','userSpaceOnUse');path.setAttribute('d',region.d);path.setAttribute('clip-rule','evenodd');clip.append(path);defs.append(clip);return{id:clip.id,alpha:region.alpha};
  });if(cache)cache.regions.set(key,regions);}
  regions.forEach((region,i)=>{const part=document.createElementNS(ns,'g');part.setAttribute('clip-path',`url(#${region.id})`);part.setAttribute('opacity',region.alpha);part.append(i===regions.length-1?mark:clonePaintNode(mark));group.append(part);});return group;
}
function applyRasterErasePreview(layer,er){
  if(layer.rasterRevision===0)return;
  let preview=layer.surface.querySelector('.wc-raster-erase-preview');
  if(!preview){preview=document.createElement('canvas');preview.className='wc-raster-erase-preview';preview.width=WIDTH;preview.height=HEIGHT;preview.style.zIndex='1';layer.surface.insertBefore(preview,layer.vectorSvg);}
  const ctx=preview.getContext('2d'),b=getStrokeBounds(er);if(!b)return;
  const old=preview._eraseBounds;
  const x0=Math.max(0,Math.floor(Math.min(b.x0,old?.x0??b.x0))),y0=Math.max(0,Math.floor(Math.min(b.y0,old?.y0??b.y0))),x1=Math.min(WIDTH,Math.ceil(Math.max(b.x1,old?.x1??b.x1))),y1=Math.min(HEIGHT,Math.ceil(Math.max(b.y1,old?.y1??b.y1)));
  if(preview._revision!==layer.rasterRevision){ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.drawImage(layer.canvas,0,0);preview._revision=layer.rasterRevision;}
  else if(x1>x0&&y1>y0){ctx.clearRect(x0,y0,x1-x0,y1-y0);ctx.drawImage(layer.canvas,x0,y0,x1-x0,y1-y0,x0,y0,x1-x0,y1-y0);}
  ctx.save();ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip();if(er.selectionPoints?.length)ctx.clip(new Path2D(polygonCutPath(er.selectionPoints)));
  ctx.globalCompositeOperation='destination-out';ctx.globalAlpha=er.opacity??1;ctx.fillStyle='#000';fillErasureMask(ctx,er);ctx.restore();preview._eraseBounds=b;
  layer.canvas.style.clipPath='inset(100%)';
}
// Pressure-sensitive circular tip becomes a filled SVG contour, not a flattened bitmap.
// Centripetal cubic interpolation follows sparse curves without the overshoot of uniform splines.
function strokeCurveSamples(points){
  const pts=vectorStrokeSamples(points,.25);if(pts.length<3)return pts;
  let length=0;for(let i=1;i<pts.length;i++)length+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
  const step=Math.max(.8,length/6000),out=[{...pts[0]}];
  for(let i=0;i<pts.length-1;i++){
    const p1=pts[i],p2=pts[i+1],p0=pts[i-1]||{x:2*p1.x-p2.x,y:2*p1.y-p2.y},p3=pts[i+2]||{x:2*p2.x-p1.x,y:2*p2.y-p1.y};
    const d01=Math.max(.001,Math.sqrt(Math.hypot(p1.x-p0.x,p1.y-p0.y))),d12=Math.max(.001,Math.sqrt(Math.hypot(p2.x-p1.x,p2.y-p1.y))),d23=Math.max(.001,Math.sqrt(Math.hypot(p3.x-p2.x,p3.y-p2.y)));
    const control=(axis,end)=>{
      if(!end){const m=d12*((p1[axis]-p0[axis])/d01-(p2[axis]-p0[axis])/(d01+d12)+(p2[axis]-p1[axis])/d12);return p1[axis]+m/3;}
      const m=d12*((p2[axis]-p1[axis])/d12-(p3[axis]-p1[axis])/(d12+d23)+(p3[axis]-p2[axis])/d23);return p2[axis]-m/3;
    };
    const c1={x:control('x',false),y:control('y',false)},c2={x:control('x',true),y:control('y',true)},chord=Math.hypot(c1.x-p1.x,c1.y-p1.y)+Math.hypot(c2.x-c1.x,c2.y-c1.y)+Math.hypot(p2.x-c2.x,p2.y-c2.y),steps=Math.min(96,Math.max(1,Math.ceil(chord/step)));
    for(let j=1;j<=steps;j++){const t=j/steps,u=1-t,blend=t*t*(3-2*t),r1=p1.r??brushSize/2,r2=p2.r??brushSize/2;out.push({x:u*u*u*p1.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*p2.x,y:u*u*u*p1.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*p2.y,r:r1+(r2-r1)*blend});}
  }
  if(out.length<=4800)return out;
  let total=0;for(let i=1;i<out.length;i++)total+=Math.hypot(out[i].x-out[i-1].x,out[i].y-out[i-1].y);
  const limited=[out[0]],spacing=total/4799;let travelled=0,next=spacing;
  for(let i=1;i<out.length&&limited.length<4799;i++){const a=out[i-1],b=out[i],len=Math.hypot(b.x-a.x,b.y-a.y);while(len>0&&next<=travelled+len&&limited.length<4799){const t=(next-travelled)/len;limited.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,r:a.r+(b.r-a.r)*t});next+=spacing;}travelled+=len;}
  limited.push(out.at(-1));return limited;
}
function buildPressureOutlinePath(points) {
  const source=strokeCurveSamples(points);if(!source.length)return '';
  // Simplify position AND pressure with a bounded subpixel error. A round-tip
  // sweep avoids the folded, pinched ribbons made by offset normals at cusps.
  const keep=new Uint8Array(source.length);keep[0]=keep[source.length-1]=1;
  const pending=[[0,source.length-1]],radius=p=>Math.max(.125,p.r??brushSize/2);
  while(pending.length){const [a,b]=pending.pop();if(b-a<2)continue;
    const p=source[a],q=source[b],dx=q.x-p.x,dy=q.y-p.y,dd=dx*dx+dy*dy,pr=radius(p),dr=radius(q)-pr;let worst=1,index=-1;
    for(let i=a+1;i<b;i++){const v=source[i],u=dd?Math.max(0,Math.min(1,((v.x-p.x)*dx+(v.y-p.y)*dy)/dd)):(i-a)/(b-a);
      const ex=v.x-p.x-dx*u,ey=v.y-p.y-dy*u,rr=radius(v)-pr-dr*u,score=Math.max((ex*ex+ey*ey)*1600,rr*rr*2500);
      if(score>worst){worst=score;index=i;}}
    if(index>=0){keep[index]=1;pending.push([a,index],[index,b]);}
  }
  const pts=source.filter((_,i)=>keep[i]),n=v=>Number(v).toFixed(3);const union=WC65.unionTinySweep(pts,radius);if(union)return union;let d='';
  for(let i=0;i<pts.length;i++){
    const p=pts[i],r=radius(p);
    // All subpaths share their winding. Nonzero fill unions overlaps at the
    // stroke's opacity once, including self-crossings and rapid pressure changes.
    d+=`M ${n(p.x+r)} ${n(p.y)} A ${n(r)} ${n(r)} 0 1 0 ${n(p.x-r)} ${n(p.y)} A ${n(r)} ${n(r)} 0 1 0 ${n(p.x+r)} ${n(p.y)} Z `;
    if(!i)continue;const q=pts[i-1],qr=radius(q),dx=p.x-q.x,dy=p.y-q.y,len=Math.hypot(dx,dy);
    if(len<=Math.abs(qr-r)+1e-8)continue;
    const ux=dx/len,uy=dy/len,k=(qr-r)/len,h=Math.sqrt(Math.max(0,1-k*k));
    const ax=ux*k-uy*h,ay=uy*k+ux*h,bx=ux*k+uy*h,by=uy*k-ux*h;
    d+=`M ${n(q.x+ax*qr)} ${n(q.y+ay*qr)} L ${n(p.x+ax*r)} ${n(p.y+ay*r)} L ${n(p.x+bx*r)} ${n(p.y+by*r)} L ${n(q.x+bx*qr)} ${n(q.y+by*qr)} Z `;
  }
  return d;
}
// Compare with the last retained sample: tiny pen movements still accumulate into a curve.
function vectorStrokeSamples(pts,minimum=.6) {
  if(!pts?.length)return [];const out=[pts[0]];
  for(let i=1;i<pts.length-1;i++){const last=out.at(-1),p=pts[i];if(Math.hypot(p.x-last.x,p.y-last.y)>=minimum||Math.abs((p.r??0)-(last.r??0))>=.2)out.push(p);}
  const end=pts.at(-1),last=out.at(-1);if(Math.hypot(end.x-last.x,end.y-last.y)>.001)out.push(end);else if(pts.length>1)out[out.length-1]=end;
  return out;
}
function updateLiveVectorPreview() {
  if(currentTool==='eraser'){
    if(editingTargetPending)return;
    const l=getActiveLayer();if(!l?.surface||!splinePts.length)return;
    const er=liveEraseRecord ||= {};Object.assign(er,{width:brushSize,opacity:brushOpacity/100,points:vectorStrokeSamples(splinePts).map(p=>({x:+p.x.toFixed(3),y:+p.y.toFixed(3),r:+(p.r??brushSize/2).toFixed(3)})),selectionPoints:window.WinCreate?.selectionPoints||null});WCVectorCuts.live(er);
    renderVectorLayer(l,er);applyRasterErasePreview(l,er);erasePreviewLayer=l;
    scratchCanvas.style.visibility='hidden';return;
  }
  if (!strokeCanVectorize || currentTool !== 'brush' || quickShapeActive) return;
  const br = getCurrentBrush(), sampled = vectorStrokeSamples(splinePts);
  if (!sampled.length) return;
  const avgR = sampled.reduce((sum, pt) => sum + (pt.r || brushSize * .5), 0) / sampled.length;
  const layer=getActiveLayer();if(layer?.surface&&liveInkSvg.parentNode!==layer.surface)layer.surface.append(liveInkSvg);
  liveInkSvg.style.zIndex='3';liveInkSvg.style.display = 'block';
  scratchCanvas.style.visibility = 'hidden';
  liveInkPath.setAttribute('stroke', 'none');
  liveInkPath.setAttribute('fill', currentColor);
  liveInkPath.setAttribute('fill-opacity', String(Math.max(0, Math.min(1, (brushOpacity / 100) * br.alpha))));
  liveInkPath.setAttribute('stroke-width', String(Math.max(.25, avgR * 2)));
  // Match the 0.001px persisted-point quantization of a finished stroke exactly.
  liveInkPath.setAttribute('d', buildPressureOutlinePath(sampled.map(pt=>({x:+pt.x.toFixed(3),y:+pt.y.toFixed(3),r:+(pt.r||avgR).toFixed(3)}))));
}


function configureScratchSSAA() {
  const pixels = WIDTH * HEIGHT;
  // Preview and committed stroke now use the same native canvas pixel grid.
  // Supersampling the preview alone caused edges to change after pointer-up.
  const ssaa = 1;
  liveInkSvg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  scratchCanvas.width = WIDTH * ssaa;
  scratchCanvas.height = HEIGHT * ssaa;
  scratchCtx.setTransform(ssaa, 0, 0, ssaa, 0, 0);
  applyContextSmoothing(scratchCtx);
  if ($('aaBadge')) $('aaBadge').textContent = ssaa > 1 ? `${ssaa}× SSAA` : (ENGINE.autoFxaa ? 'FXAA' : '1× AA');
}

function clearScratchBuffer() {
  scratchCtx.save();
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  scratchCtx.restore();
}

const BASE_DPR = window.devicePixelRatio || 1;
function syncLockedUiScale() {
  const vvScale = window.visualViewport ? window.visualViewport.scale : 1;
  const dprRatio = (window.devicePixelRatio || 1) / BASE_DPR;
  const browserZoom = Math.max(0.25, vvScale * (dprRatio > 0 ? dprRatio : 1));
  const effectiveScale = (ENGINE.userUiScale / browserZoom).toFixed(4);
  document.documentElement.style.setProperty('--ui-scale', effectiveScale);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncLockedUiScale);
  window.visualViewport.addEventListener('scroll', syncLockedUiScale);
}
window.addEventListener('resize', syncLockedUiScale);

function detectDeviceProfile() {
  const ua = navigator.userAgent || '', w = window.innerWidth || 1280, h = window.innerHeight || 800, isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const detected = (/iPhone|Android.*Mobile/i.test(ua) || w < 640 || (isTouch && Math.min(w, h) < 520)) ? 'phone' : ((/iPad|Tablet/i.test(ua) || (w >= 640 && w <= 1024)) ? 'tablet' : 'laptop');
  const active = ENGINE.deviceMode === 'auto' ? detected : ENGINE.deviceMode;

  if (/Android/i.test(ua)) ENGINE.ssaaFactor = 1;
  if (active === 'phone') {
    ENGINE.ssaaFactor = 1;
    ENGINE.autoFxaa = false;
    ENGINE.smoothingMode = 'medium';
    document.documentElement.style.setProperty('--ui-blur', '0px');
  }

  document.body.classList.remove('device-phone', 'device-tablet', 'device-laptop');
  document.body.classList.add(`device-${active}`);
  const labels = { phone: 'Mobile', tablet: 'Tablet', laptop: 'Desktop' };
  if ($('deviceBadge')) $('deviceBadge').textContent = labels[active];
  if ($('detectedDeviceDesc')) $('detectedDeviceDesc').textContent = `Detected: ${labels[detected]} (${w}×${h})`;
  configureScratchSSAA();
  return active;
}
window.addEventListener('resize', detectDeviceProfile);
detectDeviceProfile();
if ($('deviceProfileSelect')) {
  $('deviceProfileSelect').onchange = e => {
    ENGINE.deviceMode = e.target.value;
    resetAllDraggedUiPositions();
    msg(`Layout: ${detectDeviceProfile().toUpperCase()}`);
  };
}

function makeElementDraggable(el, sel) {
  const handle = sel ? el?.querySelector(sel) : el;
  if (!el || !handle) return;
  let drag = false, sx = 0, sy = 0, ol = 0, ot = 0;
  handle.addEventListener('pointerdown', e => {
    if (['BUTTON', 'INPUT', 'SELECT'].includes(e.target.tagName) || e.target.closest('button') || e.target.id === 'colorDot') return;
    e.stopPropagation();
    drag = true;
    handle.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    ol = r.left; ot = r.top; sx = e.clientX; sy = e.clientY;
    Object.assign(el.style, { left: ol + 'px', top: ot + 'px', right: 'auto', bottom: 'auto', transformOrigin: '0 0', transform: 'scale(var(--ui-scale))' });
  });
  handle.addEventListener('pointermove', e => {
    if (!drag) return;
    e.stopPropagation();
    el.style.left = Math.max(4, Math.min(window.innerWidth - Math.min(el.offsetWidth,window.innerWidth-8), ol + e.clientX - sx)) + 'px';
    el.style.top = Math.max(4, Math.min(window.innerHeight - Math.min(el.offsetHeight,window.innerHeight-8), ot + e.clientY - sy)) + 'px';
  });
  handle.addEventListener('pointerup', e => {
    if (!drag) return;
    drag = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  });
}
['topLeftBar', 'dynamicIsland', 'topRightBar', 'leftDock', 'quickShapeToolbar'].forEach(id => makeElementDraggable($(id), '.ui-drag-grip'));
document.querySelectorAll('.popover, .ios-layer-menu-sheet').forEach(p => makeElementDraggable(p, '.ios-sheet-header'));

function resetAllDraggedUiPositions() {
  ['topLeftBar', 'dynamicIsland', 'topRightBar', 'leftDock', 'quickShapeToolbar'].forEach(id => $(id)?.removeAttribute('style'));
  document.querySelectorAll('.popover, .ios-layer-menu-sheet').forEach(p => p.removeAttribute('style'));
}
if ($('resetUiPosBtn')) $('resetUiPosBtn').onclick = () => { resetAllDraggedUiPositions(); msg('UI Layout Reset'); };

if ($('exportCssFileBtn')) {
  $('exportCssFileBtn').onclick = () => {
    let cssText = $('wincreateStylesheet')?.textContent?.trim() || '';
    if (!cssText) {
      try {
        cssText = Array.from(document.styleSheets)
          .flatMap(sheet => Array.from(sheet.cssRules || []))
          .map(rule => rule.cssText)
          .join('\n');
      } catch (_) {}
    }
    const blob = new Blob([cssText], { type: 'text/css' });
    const a = document.createElement('a');
    a.download = 'wincreate-studio.css';
    a.href = URL.createObjectURL(blob);
    a.click();
    msg('Exported wincreate-studio.css');
  };
}

let fpsFrames = 0, fpsLast = performance.now(), fpsFrame = 0;
function syncFpsTelemetry(){
  if(fpsFrame)cancelAnimationFrame(fpsFrame);
  fpsFrame=0;fpsFrames=0;fpsLast=performance.now();
  if(ENGINE.fpsTelemetry&&!document.hidden)fpsFrame=requestAnimationFrame(tickFps);
}
function tickFps(now) {
  fpsFrame=0;if(!ENGINE.fpsTelemetry||document.hidden)return;
  fpsFrames++;
  if (now - fpsLast >= 500) {
    if (ENGINE.fpsTelemetry && $('fpsBadge')) {
      const fps = Math.min(120, Math.round((fpsFrames * 1000) / (now - fpsLast)));
      $('fpsBadge').textContent = `${fps} FPS • ${lastStrokeLatencyMs.toFixed(1)}ms`;
    }
    fpsFrames = 0;
    fpsLast = now;
  }
  fpsFrame=requestAnimationFrame(tickFps);
}
document.addEventListener('visibilitychange',syncFpsTelemetry);
syncFpsTelemetry();

const popovers = {
  canvasSetup: $('canvasSetupPopover'),
  settings: $('settingsPopover'),
  trace: $('tracePopover'),
  actions: $('actionsPopover'),
  adjust: $('adjustPopover'),
  brush: $('brushPopover'),
  layers: $('layersPopover'),
  color: $('colorPopover')
};
const PERSISTENT_POPS = new Set(['layers', 'color']);

function keepPopoverInsideViewport(target){
  if(!target || target.classList.contains('docked') || document.body.classList.contains('wc-dil-fullscreen'))return;
  requestAnimationFrame(()=>{
    if(!target.classList.contains('open'))return;
    const r=target.getBoundingClientRect();
    if(!r.width||!r.height)return;
    const left=Math.max(5,Math.min(r.left,window.innerWidth-Math.min(r.width,window.innerWidth-10)-5));
    const top=Math.max(5,Math.min(r.top,window.innerHeight-Math.min(r.height,window.innerHeight-10)-5));
    if(Math.abs(left-r.left)>2||Math.abs(top-r.top)>2){target.style.left=left+'px';target.style.top=top+'px';target.style.right='auto';target.style.bottom='auto';}
  });
}
function togglePop(name) {
  const target = popovers[name];
  if (!target) return;
  target.style.display = '';
  if(name==='brush'&&!target.classList.contains('open'))renderBrushLibrary();
  if (PERSISTENT_POPS.has(name)) {
    const open = !target.classList.contains('open');
    target.classList.toggle('open', open);if(open)keepPopoverInsideViewport(target);
    if (name === 'layers' && !open) layerMenuSheet.classList.remove('open');
    if (name === 'layers' && open) renderLayers();
    return;
  }
  Object.keys(popovers).forEach(k => {
    if (!PERSISTENT_POPS.has(k) && popovers[k]) {
      popovers[k].style.display = '';
      popovers[k].classList.toggle('open', k === name && !popovers[k].classList.contains('open'));
    }
  });
  keepPopoverInsideViewport(target);
}

function closePops(forceAll = false) {
  Object.keys(popovers).forEach(k => {
    if ((forceAll || !PERSISTENT_POPS.has(k)) && popovers[k]) {
      popovers[k].style.display = '';
      popovers[k].classList.remove('open');
    }
  });
  layerMenuSheet.style.display = '';
  layerMenuSheet.classList.remove('open');
}

if ($('settingsBtn')) $('settingsBtn').onclick = () => togglePop('settings');
if ($('traceStudioBtn')) $('traceStudioBtn').onclick = () => togglePop('trace');
if ($('actionsBtn')) $('actionsBtn').onclick = () => togglePop('actions');
if ($('adjustBtn')) $('adjustBtn').onclick = () => togglePop('adjust');
if ($('layersBtn')) $('layersBtn').onclick = () => togglePop('layers');

function msg(text) {
  islandText.textContent = text;
  dynamicIsland.classList.add('expanded');
  clearTimeout(msg._t);
  msg._t = setTimeout(() => {
    dynamicIsland.classList.remove('expanded');
    islandText.textContent = `${getCurrentBrush().name} • ${Math.round(scale * 100)}%`;
  }, 1650);
}

function goToPage(id) {
  if(!['pageStudio','pageAnimation'].includes(id))window.WinCreate?.layerMasks?.stop();
  closePops(true);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(id)?.classList.add('active');
}

function addCanvasPresetTile(p) {
  const t = document.createElement('div');
  t.className = 'preset-tile';
  t.innerHTML = `<div class="aspect-box"><div class="aspect-shape" style="width:${p.aw || 56}px;height:${p.ah || 44}px;background:${p.bg || '#ffffff'}"></div></div><strong style="font-size:13px">${p.name}</strong><span style="font-size:11px;color:var(--text-sub)">${p.fullscreen ? 'Native Fullscreen' : `${p.w} × ${p.h} px`}</span>`;
  t.onclick = () => initializeStudioCanvas(p.name, p.fullscreen ? Math.max(200, window.innerWidth) : p.w, p.fullscreen ? Math.max(200, window.innerHeight) : p.h, p.bg, true);
  $('resPresetGrid')?.appendChild(t);
}

[
  { name: 'Full Screen White', w: 0, h: 0, aw: 68, ah: 44, bg: '#ffffff', fullscreen: true },
  { name: 'Obsidian Dark', w: 0, h: 0, aw: 68, ah: 44, bg: '#0c0c12', fullscreen: true },
  { name: 'OLED Pitch Black', w: 0, h: 0, aw: 68, ah: 44, bg: '#000000', fullscreen: true },
  { name: 'Warm Sketchbook', w: 0, h: 0, aw: 68, ah: 44, bg: '#fdf6e3', fullscreen: true },
  { name: 'Square 1:1', w: 1080, h: 1080, aw: 50, ah: 50, bg: '#ffffff' },
  { name: 'Cinema 16:9', w: 1920, h: 1080, aw: 72, ah: 40, bg: '#ffffff' },
  { name: 'Story / Reel 9:16', w: 1080, h: 1920, aw: 34, ah: 52, bg: '#ffffff' },
  { name: 'A4 Print Portrait', w: 2480, h: 3508, aw: 38, ah: 52, bg: '#ffffff' }
].forEach(addCanvasPresetTile);

if ($('createCustomBtn')) {
  $('createCustomBtn').onclick = () => {
    ENGINE.colorSpace = $('customColorSpace').value;
    initializeStudioCanvas(
      $('customName').value || 'Custom',
      Math.min(8192, Math.max(64, +$('customW').value || window.innerWidth)),
      Math.min(8192, Math.max(64, +$('customH').value || window.innerHeight)),
      $('customBg').value || '#ffffff',
      true
    );
  };
}
if ($('matchScreenSizeBtn')) {
  $('matchScreenSizeBtn').onclick = () => {
    initializeStudioCanvas('Full Screen', Math.max(200, window.innerWidth), Math.max(200, window.innerHeight), bgColor, true);
    closePops();
  };
}

// =========================================================================
// VIEW TRANSFORM, ZOOM & FREE 360° CANVAS ROTATION
// =========================================================================
function normalizeAngle(deg) {
  let a = ((deg + 180) % 360);
  if (a < 0) a += 360;
  return a - 180;
}

function updateViewTransform() {
  board.style.transform = `translate3d(${panX}px,${panY}px,0) rotate(${rotation}deg) scale(${scale * flipX},${scale})`;
  board.classList.toggle('high-zoom', scale > 1.01);
  board.dataset.zoom = scale.toFixed(3);
  board.style.setProperty('--inv-canvas-scale', (1 / Math.max(0.15, scale)).toFixed(4));
  islandText.textContent = `${getCurrentBrush().name} • ${Math.round(scale * 100)}%`;

  const zTxt = $('zoomResetText');
  if (zTxt) zTxt.textContent = `${Math.round(scale * 100)}%`;
  else if ($('zoomResetBtn')) $('zoomResetBtn').textContent = `${Math.round(scale * 100)}%`;

  const degRound = Math.round(rotation);
  if ($('rotBadge')) $('rotBadge').textContent = `${degRound}°`;
  if ($('rotResetText')) $('rotResetText').textContent = `${degRound}°`;
  if ($('canvasRotValLabel')) $('canvasRotValLabel').textContent = `${degRound}°`;
  if ($('canvasRotateSlider')) $('canvasRotateSlider').value = degRound;
}

function setCanvasRotation(deg) {
  rotation = normalizeAngle(deg);
  updateViewTransform();
}

function zoomCanvasAtPoint(newScale, cx = window.innerWidth / 2, cy = window.innerHeight / 2) {
  const clamped = Math.min(16.0, Math.max(0.15, newScale));
  const ratio = clamped / scale;
  const vx = cx - window.innerWidth / 2, vy = cy - window.innerHeight / 2;
  panX = vx - (vx - panX) * ratio;
  panY = vy - (vy - panY) * ratio;
  scale = clamped;
  updateViewTransform();
}

function fitCanvasFullscreen() {
  if(document.body.classList.contains('studio-v5')) {const r=viewportEl.getBoundingClientRect(),padding=/Android/i.test(navigator.userAgent)?24:80;scale=Math.max(.05,Math.min(Math.max(1,r.width-padding)/WIDTH,Math.max(1,r.height-padding)/HEIGHT));panX=0;panY=0;rotation=0;flipX=1;updateViewTransform();return;}
  if(document.body.classList.contains('anim-workspace')) { scale=Math.min((viewportEl.clientWidth-100)/WIDTH,(viewportEl.clientHeight-120)/HEIGHT);panX=0;panY=35;rotation=0;flipX=1;updateViewTransform();return; }
  scale = Math.min(Math.max(200, window.innerWidth) / WIDTH, Math.max(200, window.innerHeight) / HEIGHT);
  panX = 0; panY = 0; rotation = 0; flipX = 1;
  updateViewTransform();
}

function zoomOutForEdges() {
  scale = Math.min(Math.max(200, window.innerWidth) / WIDTH, Math.max(200, window.innerHeight) / HEIGHT) * 0.76;
  panX = 0; panY = 0;
  updateViewTransform();
  msg(`Zoomed Out (${Math.round(scale * 100)}%)`);
}

if ($('zoomOutBtn')) $('zoomOutBtn').onclick = () => zoomCanvasAtPoint(scale * 0.84);
if ($('zoomInBtn')) $('zoomInBtn').onclick = () => zoomCanvasAtPoint(scale * 1.18);
if ($('zoomResetBtn')) {
  $('zoomResetBtn').onclick = () => {
    const fs = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
    Math.abs(scale - fs) < 0.04 ? zoomOutForEdges() : fitCanvasFullscreen();
  };
}
if ($('zoomOutEdgesMenuBtn')) $('zoomOutEdgesMenuBtn').onclick = () => { zoomOutForEdges(); closePops(); };

// Rotation button & slider bindings
if ($('rotLeftBtn')) $('rotLeftBtn').onclick = () => { setCanvasRotation(rotation - 15); msg(`Rotated ${Math.round(rotation)}°`); };
if ($('rotRightBtn')) $('rotRightBtn').onclick = () => { setCanvasRotation(rotation + 15); msg(`Rotated ${Math.round(rotation)}°`); };
if ($('rotResetBtn')) $('rotResetBtn').onclick = () => { setCanvasRotation(0); msg('Rotation Reset (0°)'); };
if ($('rotBadge')) $('rotBadge').onclick = () => { setCanvasRotation(0); msg('Rotation Reset (0°)'); };
if ($('canvasRotateSlider')) $('canvasRotateSlider').oninput = e => setCanvasRotation(+e.target.value);
if ($('resetRotationMenuBtn')) $('resetRotationMenuBtn').onclick = () => { setCanvasRotation(0); msg('Rotation Reset (0°)'); };

let gridVisible = true;
if ($('gridToggleBtn')) {
  $('gridToggleBtn').onclick = () => {
    gridVisible = !gridVisible;
    viewportEl.classList.toggle('hide-grid', !gridVisible);
    $('gridToggleBtn').classList.toggle('active', gridVisible);
    msg(gridVisible ? 'Grid Enabled' : 'Grid Hidden');
  };
}

function drawBackground() {
  bgCtx.clearRect(0, 0, WIDTH, HEIGHT);
  if (bgVisible) {
    bgCtx.fillStyle = bgColor;
    bgCtx.fillRect(0, 0, WIDTH, HEIGHT);
    if (bgImageCanvas) bgCtx.drawImage(bgImageCanvas, 0, 0, WIDTH, HEIGHT);
  }
}

function setBgColor(hex, visible = true) {
  bgImageCanvas = null;
  if (hex) bgColor = hex;
  bgVisible = visible;
  drawBackground();
  renderLayers();
  markUnsavedChanges();
  if ($('quickCanvasColorInput') && bgColor) $('quickCanvasColorInput').value = bgColor;
  if ($('csBgColorPicker') && bgColor) $('csBgColorPicker').value = bgColor;
}

window.addEventListener('wheel', e => {
  const inScrollable = e.target.closest('.popover, .ios-layer-list, .blib-list, .blib-cats, #pageWelcome, #pageSetup, #artGalleryModal, .studio-pane, #studioInspector, #wcAnimInspector, #animationStudio, #studioMoreTools, .wc-dil-island, #wcQuickHub .wc-hub-panel');
  if(inScrollable)return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.008);
    zoomCanvasAtPoint(scale * factor, e.clientX, e.clientY);
    return;
  }
  if (e.shiftKey && !inScrollable && ($('pageStudio').classList.contains('active')||$('pageAnimation')?.classList.contains('active'))) {
    e.preventDefault();
    setCanvasRotation(rotation + (e.deltaY > 0 ? 5 : -5));
    return;
  }
  if (!inScrollable && ($('pageStudio').classList.contains('active')||$('pageAnimation')?.classList.contains('active'))) {
    e.preventDefault();
    zoomCanvasAtPoint(scale * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX, e.clientY);
  }
}, { passive: false, capture: true });

// Two-finger Touch Pinch-Zoom + Free Rotation + Two-finger Pan
['gesturestart', 'gesturechange', 'gestureend'].forEach(evName => {
  window.addEventListener(evName, e => e.preventDefault(), { passive: false, capture: true });
});

window.addEventListener('touchstart', e => {
  if(e.touches.length>=2 && e.target.closest('#viewport')) {
    const size=e.touches.length;
    if(!touchTapGesture){touchTapGesture={size,time:performance.now(),x:e.touches[0].clientX,y:e.touches[0].clientY,moved:false};}
    else touchTapGesture.size=Math.max(size,touchTapGesture.size);
  }
  if (e.touches.length >= 2 && e.target.closest('#viewport')) {
    e.preventDefault();
    // A second finger belongs to navigation/undo, not to a paint stroke.
    cancelPointerForGesture();
    activeDrawingPointer=null;editingTargetPending=false;
    document.body.classList.remove('drawing-active');
    stopLiveVectorPreview();
    clearTimeout(quickShapeTimer);
    clearScratchBuffer();
    const t0 = e.touches[0], t1 = e.touches[1];
    touchPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    touchStartAngle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX) * (180 / Math.PI);
    touchLastMid = { x: (t0.clientX + t1.clientX) * 0.5, y: (t0.clientY + t1.clientY) * 0.5 };
  }
}, { passive: false, capture: true });

window.addEventListener('touchmove', e => {
  if(e.touches.length>=2 && touchTapGesture){
    if(Math.hypot(e.touches[0].clientX-touchTapGesture.x,e.touches[0].clientY-touchTapGesture.y)>12)touchTapGesture.moved=true;
  }
  if (e.touches.length >= 2) {
    e.preventDefault();
    const t0 = e.touches[0], t1 = e.touches[1];
    const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    const ang = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX) * (180 / Math.PI);
    const mid = { x: (t0.clientX + t1.clientX) * 0.5, y: (t0.clientY + t1.clientY) * 0.5 };

    if (touchLastMid) {
      panX += mid.x - touchLastMid.x;
      panY += mid.y - touchLastMid.y;
    }
    if (touchPinchDist > 10) {
      zoomCanvasAtPoint(scale * (d / touchPinchDist), mid.x, mid.y);
    }
    let deltaAngle = ang - touchStartAngle;
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;
    if (Math.abs(deltaAngle) > 0.35) {
      setCanvasRotation(rotation + deltaAngle);
    }

    touchPinchDist = d;
    touchStartAngle = ang;
    touchLastMid = mid;
  }
}, { passive: false, capture: true });

function finishTouchGesture(e) {
  if(touchTapGesture && e.touches.length===0){
    const g=touchTapGesture;touchTapGesture=null;
    if(e.type==='touchend'&&!g.moved && performance.now()-g.time<320){
      if(g.size===2)doUndo();else if(g.size>=3)doRedo();
    }
  }
  if (e.touches.length < 2) {
    touchPinchDist = 0;
    touchLastMid = null;
  }
}
window.addEventListener('touchend',finishTouchGesture,{capture:true});
window.addEventListener('touchcancel',finishTouchGesture,{capture:true});

function openStudioPrompt(title, defaultValue, onConfirm) {
  let modal = $('studioInputModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'studioInputModal';
    Object.assign(modal.style, { position: 'fixed', inset: '0', zIndex: '9999', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    modal.innerHTML = `<div style="background:var(--ios-sheet);border:1px solid var(--ios-sep);border-radius:14px;padding:18px;width:320px;box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:12px"><div id="studioModalTitle" style="font-size:13px;font-weight:700;color:var(--text-main)"></div><input id="studioModalInput" type="text" class="ai-prompt-input" style="width:100%"><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" class="blend-chip" id="studioModalCancel">Cancel</button><button type="button" class="blend-chip active" id="studioModalOk">Confirm</button></div></div>`;
    document.body.appendChild(modal);
  }
  $('studioModalTitle').textContent = title;
  const inp = $('studioModalInput');
  inp.value = defaultValue || '';
  modal.style.display = 'flex';
  inp.focus();
  const close = () => { modal.style.display = 'none'; };
  $('studioModalCancel').onclick = close;
  $('studioModalOk').onclick = () => { close(); onConfirm(inp.value); };
  inp.onkeydown = e => { if (e.key === 'Enter') $('studioModalOk').click(); if (e.key === 'Escape') close(); };
}

// =========================================================================
// TRACE STUDIO & SOBEL DETECTOR
// =========================================================================
if ($('traceUploadZone')) {
  $('traceUploadZone').onclick = () => $('traceFileInput').click();
  $('traceUploadZone').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('traceFileInput').click(); } };
}
if ($('traceFileInput')) {
  $('traceFileInput').onchange = e => {
    if (e.target.files?.[0]) loadUploadedImageFile(e.target.files[0]);
    e.target.value = '';
  };
}
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith('image/')) { goToPage('pageStudio'); loadUploadedImageFile(f); }
});

function loadUploadedImageFile(file) {
  const r = new FileReader();
  r.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const ratio=Math.min(1,4096/Math.max(img.width,img.height));
      TRACE.rawImageCanvas.width=Math.max(1,Math.round(img.width*ratio));
      TRACE.rawImageCanvas.height=Math.max(1,Math.round(img.height*ratio));
      TRACE.rawImageCanvas.getContext('2d').drawImage(img,0,0,TRACE.rawImageCanvas.width,TRACE.rawImageCanvas.height);
      TRACE.hasImage = true;
      TRACE.visible = true;
      $('traceVisSwitch')?.classList.add('on');
      $('traceStudioBtn')?.classList.add('has-trace');
      renderTraceReference();
      renderLayers();
      msg(`Reference Loaded (${img.width}×${img.height})`);
    };
    img.src = ev.target.result;
  };
  r.readAsDataURL(file);
}

function loadSampleReference(kind) {
  const w = 800, h = 600, ctx = TRACE.rawImageCanvas.getContext('2d');
  TRACE.rawImageCanvas.width = w; TRACE.rawImageCanvas.height = h;
  ctx.fillStyle = '#181824'; ctx.fillRect(0, 0, w, h);
  if (kind === 'anime') {
    ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(w / 2, h * 0.44, 115, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6366f1'; ctx.beginPath(); ctx.arc(w / 2, h * 0.38, 132, Math.PI, Math.PI * 2); ctx.lineTo(w / 2 + 155, h * 0.52); ctx.lineTo(w / 2 - 155, h * 0.52); ctx.closePath(); ctx.fill();
  } else if (kind === 'car') {
    ctx.fillStyle = '#8b5cf6'; ctx.beginPath(); ctx.moveTo(110, h * 0.66); ctx.lineTo(165, h * 0.47); ctx.lineTo(310, h * 0.36); ctx.lineTo(520, h * 0.36); ctx.lineTo(685, h * 0.5); ctx.lineTo(710, h * 0.66); ctx.closePath(); ctx.fill();
  } else if (kind === 'lotus') {
    [-1.1, 1.1, -0.6, 0.6, 0].forEach(a => { ctx.save(); ctx.translate(w / 2, h * 0.62); ctx.rotate(a); ctx.fillStyle = '#c084fc'; ctx.beginPath(); ctx.ellipse(0, -90, 60, 110, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
  } else {
    ctx.fillStyle = '#6366f1'; ctx.beginPath(); ctx.moveTo(w / 2, h * 0.2); ctx.lineTo(w / 2 + 150, h * 0.5); ctx.lineTo(w / 2, h * 0.82); ctx.lineTo(w / 2 - 150, h * 0.5); ctx.closePath(); ctx.fill();
  }
  TRACE.hasImage = true; TRACE.visible = true;
  $('traceVisSwitch')?.classList.add('on');
  $('traceStudioBtn')?.classList.add('has-trace');
  renderTraceReference(); renderLayers();
  msg(`Loaded ${kind.toUpperCase()} Reference`);
}

function computeSobelEdges(srcCtx, w, h, sens, hexColor, isBlue) {
  const result=WCEdgeTools.outlines(srcCtx.getImageData(0,0,w,h),sens,hexColor,isBlue);
  return new ImageData(result.data,w,h);
}

let traceRenderFrame = 0;
function scheduleTraceRender() { cancelAnimationFrame(traceRenderFrame); traceRenderFrame=requestAnimationFrame(renderTraceReference); }
function renderTraceReference() {
  TRACE.revision++;
  traceCtx.clearRect(0, 0, WIDTH, HEIGHT);
  if (!TRACE.hasImage || !TRACE.visible) { traceCanvas.style.display = 'none'; return; }
  traceCanvas.style.display = 'block';
  traceCanvas.style.opacity = TRACE.opacity / 100;
  TRACE.fittedCanvas.width = WIDTH; TRACE.fittedCanvas.height = HEIGHT;
  const fCtx = create2DContext(TRACE.fittedCanvas, true), iw = TRACE.rawImageCanvas.width, ih = TRACE.rawImageCanvas.height;
  if (!iw || !ih) return;
  const sr = TRACE.fitMode === 'cover' ? Math.max(WIDTH / iw, HEIGHT / ih) : Math.min(WIDTH / iw, HEIGHT / ih);
  fCtx.clearRect(0, 0, WIDTH, HEIGHT);
  fCtx.drawImage(TRACE.rawImageCanvas, (WIDTH - iw * sr) * 0.5, (HEIGHT - ih * sr) * 0.5, iw * sr, ih * sr);
  if (TRACE.mode === 'original') traceCtx.drawImage(TRACE.fittedCanvas, 0, 0);
  else {
    // Work on a bounded analysis canvas. The original reference remains full resolution.
    const ratio=Math.min(1,1600/Math.max(WIDTH,HEIGHT)),tw=Math.max(1,Math.round(WIDTH*ratio)),th=Math.max(1,Math.round(HEIGHT*ratio));
    if (!TRACE.edgeCanvas) TRACE.edgeCanvas=document.createElement('canvas');
    const edge=TRACE.edgeCanvas;edge.width=tw;edge.height=th;
    const ec= create2DContext(edge,true);
    ec.drawImage(TRACE.fittedCanvas,0,0,tw,th);
    ec.putImageData(computeSobelEdges(ec,tw,th,TRACE.edgeSensitivity,TRACE.outlineColor,TRACE.mode==='blueprint'),0,0);
    traceCtx.imageSmoothingEnabled=true;traceCtx.imageSmoothingQuality='high';
    traceCtx.drawImage(edge,0,0,WIDTH,HEIGHT);
  }
}

if ($('traceVisSwitch')) $('traceVisSwitch').onclick = function() { this.classList.toggle('on'); TRACE.visible = this.classList.contains('on'); renderTraceReference(); renderLayers(); };
if ($('traceOpacitySlider')) $('traceOpacitySlider').oninput = e => { TRACE.opacity = +e.target.value; $('traceOpacityLabel').textContent = TRACE.opacity + '%'; traceCanvas.style.opacity = TRACE.opacity / 100; };
if ($('traceFitSelect')) $('traceFitSelect').onchange = e => { TRACE.fitMode = e.target.value; scheduleTraceRender(); };
if ($('traceModeSelect')) $('traceModeSelect').onchange = e => { TRACE.mode = e.target.value; !TRACE.hasImage ? loadSampleReference('anime') : renderTraceReference(); };
if ($('edgeSensSlider')) $('edgeSensSlider').oninput = e => { TRACE.edgeSensitivity = +e.target.value; $('edgeSensLabel').textContent = TRACE.edgeSensitivity + '%'; if (TRACE.mode === 'original') $('traceModeSelect').value = TRACE.mode = 'ai_edges'; if (TRACE.hasImage) scheduleTraceRender(); };
document.querySelectorAll('#traceColorPills .accent-orb').forEach(o => o.onclick = () => { document.querySelectorAll('#traceColorPills .accent-orb').forEach(x => x.classList.remove('active')); o.classList.add('active'); TRACE.outlineColor = o.dataset.tcol; if (TRACE.mode === 'original') $('traceModeSelect').value = TRACE.mode = 'ai_edges'; if (TRACE.hasImage) scheduleTraceRender(); });
if ($('bakeTraceOutlinesBtn')) $('bakeTraceOutlinesBtn').onclick = () => { if (!TRACE.hasImage) { msg('Import a reference first'); return; } saveFullStateUndo(); renderTraceReference(); const l = createLayer('Trace Outlines'); l.ctx.putImageData(computeSobelEdges(create2DContext(TRACE.fittedCanvas, true), WIDTH, HEIGHT, TRACE.edgeSensitivity, TRACE.outlineColor, false), 0, 0); l.thumbDirty = true; renderLayers(); closePops(); msg('Outlines Stamped'); };
if ($('stampPhotoLayerBtn')) $('stampPhotoLayerBtn').onclick = () => { if (!TRACE.hasImage) { msg('Import a reference first'); return; } saveFullStateUndo(); renderTraceReference(); const l = createLayer('Imported Reference'); l.ctx.drawImage(TRACE.fittedCanvas, 0, 0); l.thumbDirty = true; renderLayers(); closePops(); msg('Reference Stamped'); };
if ($('clearTraceBtn')) $('clearTraceBtn').onclick = () => { TRACE.hasImage = false; traceCtx.clearRect(0, 0, WIDTH, HEIGHT); traceCanvas.style.display = 'none'; $('traceStudioBtn')?.classList.remove('has-trace'); renderLayers(); msg('Trace Cleared'); };

function extractOutlinesFromActiveLayer() {
  const l = getActiveLayer(); if (!l || l.isFolder) return;
  saveFullStateUndo();
  const nl = createLayer(`${l.name} Outlines`);
  nl.ctx.putImageData(computeSobelEdges(createLayerComposite(l).getContext('2d', {willReadFrequently:true}), WIDTH, HEIGHT, TRACE.edgeSensitivity, currentColor, false), 0, 0);
  nl.thumbDirty = true;
  renderLayers(); closePops(); markUnsavedChanges(); msg('Extracted Layer Outlines');
}
if ($('mDetectLayerEdges')) $('mDetectLayerEdges').onclick = extractOutlinesFromActiveLayer;
if ($('adjExtractOutlinesBtn')) $('adjExtractOutlinesBtn').onclick = extractOutlinesFromActiveLayer;

// =========================================================================
// PREFERENCES & FXAA
// =========================================================================
function switchSettingsTab(tab, btn) {
  document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
  $('pane-' + tab)?.classList.add('active');
}
if ($('uiScaleSlider')) {
  $('uiScaleSlider').oninput = e => {
    const pct = +e.target.value;
    ENGINE.userUiScale = pct / 100;
    syncLockedUiScale();
    $('uiScaleValLabel').textContent = pct + '%';
    msg(`UI Size: ${pct}%`);
  };
}
if ($('uiModeSelect')) $('uiModeSelect').onchange = e => { document.body.classList.remove('theme-oled', 'theme-matte'); if (e.target.value === 'oled') { document.body.classList.add('theme-oled'); viewportEl.classList.add('oled-backdrop'); $('oledViewportSwitch')?.classList.add('on'); } else if (e.target.value === 'matte') document.body.classList.add('theme-matte'); };
if ($('oledViewportSwitch')) $('oledViewportSwitch').onclick = function() { this.classList.toggle('on'); viewportEl.classList.toggle('oled-backdrop', this.classList.contains('on')); };
if ($('uiBlurSlider')) $('uiBlurSlider').oninput = e => { document.documentElement.style.setProperty('--ui-blur', e.target.value + 'px'); $('blurValLabel').textContent = e.target.value + 'px'; };
if ($('uiAlphaSlider')) $('uiAlphaSlider').oninput = e => { const v = +e.target.value; document.documentElement.style.setProperty('--ui-alpha', (v / 100).toFixed(2)); document.documentElement.style.setProperty('--sheet-alpha', Math.min(0.98, (v + 10) / 100).toFixed(2)); $('alphaValLabel').textContent = v + '%'; };
document.querySelectorAll('#accentPills .accent-orb').forEach(o => o.onclick = () => { document.querySelectorAll('#accentPills .accent-orb').forEach(x => x.classList.remove('active')); o.classList.add('active'); document.documentElement.style.setProperty('--ios-blue', o.dataset.accent); document.documentElement.style.setProperty('--accent-glow', o.dataset.glow); document.documentElement.style.setProperty('--accent-soft', o.dataset.soft); });
if ($('zenHudSwitch')) $('zenHudSwitch').onclick = function() { this.classList.toggle('on'); ENGINE.zenHud = this.classList.contains('on'); document.body.classList.toggle('zen-hud', ENGINE.zenHud); };
if ($('compactHudSwitch')) $('compactHudSwitch').onclick = function() { this.classList.toggle('on'); document.body.classList.toggle('compact-hud', this.classList.contains('on')); };
if ($('ssaaSelect')) $('ssaaSelect').onchange = e => { ENGINE.ssaaFactor = +e.target.value; configureScratchSSAA(); msg(`${ENGINE.ssaaFactor}× SSAA Active`); };
if ($('edgeFeatherSlider')) $('edgeFeatherSlider').oninput = e => { ENGINE.edgeFeather = +e.target.value / 100; $('featherValLabel').textContent = e.target.value + '%'; };
if ($('autoFxaaSwitch')) $('autoFxaaSwitch').onclick = function() { this.classList.toggle('on'); ENGINE.autoFxaa = this.classList.contains('on'); configureScratchSSAA(); };
if ($('chaikinSwitch')) $('chaikinSwitch').onclick = function() { this.classList.toggle('on'); ENGINE.chaikinSubdiv = this.classList.contains('on'); };

function runFXAAPass(layer, b = null) {
  if (!layer || layer.isFolder) return;
  const x0 = b ? Math.max(1, Math.floor(b.minX - 4)) : 1, y0 = b ? Math.max(1, Math.floor(b.minY - 4)) : 1, x1 = b ? Math.min(WIDTH - 2, Math.ceil(b.maxX + 4)) : WIDTH - 2, y1 = b ? Math.min(HEIGHT - 2, Math.ceil(b.maxY + 4)) : HEIGHT - 2;
  if (x1 <= x0 || y1 <= y0) return;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, src = layer.ctx.getImageData(x0 - 1, y0 - 1, w + 2, h + 2).data, outImg = layer.ctx.createImageData(w, h), d = outImg.data, st = (w + 2) * 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y + 1) * st + (x + 1) * 4, di = (y * w + x) * 4, aC = src[si + 3], aN = src[si - st + 3], aS = src[si + st + 3], aW = src[si - 4 + 3], aE = src[si + 4 + 3];
    if (Math.max(aC, aN, aS, aW, aE) - Math.min(aC, aN, aS, aW, aE) > 28) for (let c = 0; c < 4; c++) d[di + c] = (src[si + c] * 4 + src[si - st + c] + src[si + st + c] + src[si - 4 + c] + src[si + 4 + c]) / 8;
    else { d[di] = src[si]; d[di + 1] = src[si + 1]; d[di + 2] = src[si + 2]; d[di + 3] = aC; }
  }
  layer.ctx.putImageData(outImg, x0, y0);
  layer.thumbDirty = true;
}

if ($('runFxaaNowBtn')) $('runFxaaNowBtn').onclick = () => { const l = getActiveLayer(); if (!l || l.isFolder) return; saveUndo(); runFXAAPass(l); renderLayers(); closePops(); msg('FXAA Smoothing Applied'); };
if ($('fxaaAdjustBtn')) $('fxaaAdjustBtn').onclick = () => $('runFxaaNowBtn').click();
if ($('mFxaaLayer')) $('mFxaaLayer').onclick = () => $('runFxaaNowBtn').click();
// Graphics profile switches the Canvas2D context hint on actual paint layers.
// Changing a 2D context hint requires recreating the canvas, so preserve pixels.
function applyCanvasBackend(profile){
  if(!['readback','accelerated'].includes(profile))return;
  if(ENGINE.canvasBackend===profile)return;
  if(isDrawing||fillBusy){msg('Finish the stroke before switching renderer');return;}
  ENGINE.canvasBackend=profile;persistEnginePreferences();
  for(const l of layers){
    if(l.isFolder||!l.canvas)continue;
    const old=l.canvas, fresh=document.createElement('canvas');
    fresh.width=old.width;fresh.height=old.height;fresh.className=old.className;
    fresh.style.cssText=old.style.cssText;
    const ctx=create2DContext(fresh,true);
    applyContextSmoothing(ctx);
    ctx.drawImage(old,0,0);
    old.replaceWith(fresh);
    l.canvas=fresh;l.ctx=ctx;l._tracked=false;trackLayerPixels(l);l.rasterRevision=1;PIXEL_SNAPSHOTS.delete(l);l.thumbDirty=true;
  }
  syncLayers();renderLayers();
  msg(profile==='accelerated'?'Canvas 2D performance preference applied':'Paint-friendly readback preference applied');
}
if($('canvasBackendSelect')){
  $('canvasBackendSelect').value=ENGINE.canvasBackend;
  $('canvasBackendSelect').onchange=e=>applyCanvasBackend(e.target.value);
}

if ($('renderPipelineSelect')) $('renderPipelineSelect').value = ENGINE.renderPipeline;
function syncStrokeStyleUI() {
  if($('strokeStyleSelect'))$('strokeStyleSelect').value=ENGINE.renderPipeline==='vector'?'smooth':'texture';
  if($('renderPipelineSelect'))$('renderPipelineSelect').value=ENGINE.renderPipeline;
}
if ($('renderPipelineSelect')) $('renderPipelineSelect').onchange=e=>{ENGINE.renderPipeline=e.target.value;if(ENGINE.renderPipeline==='vector'&&!isVectorCompatibleBrush(toolBrushes.brush))toolBrushes.brush=BRUSHES.Inking[0];syncStrokeStyleUI();renderBrushLibrary();msg('Stroke renderer updated');};
if ($('strokeStyleSelect')) $('strokeStyleSelect').onchange=e=>{
  ENGINE.renderPipeline=e.target.value==='smooth'?'vector':'stamp';
  if(ENGINE.renderPipeline==='vector'&&!isVectorCompatibleBrush(toolBrushes.brush))toolBrushes.brush=BRUSHES.Inking[0];
  syncStrokeStyleUI();renderBrushLibrary();msg(e.target.value==='smooth'?'Smooth rounded vector ink':'Original textured brush tips');
};
syncStrokeStyleUI();
if ($('smoothingModeSelect')) $('smoothingModeSelect').onchange = e => { ENGINE.smoothingMode = e.target.value; document.documentElement.style.setProperty('--canvas-rendering', ENGINE.smoothingMode === 'pixelated' ? 'pixelated' : 'auto'); configureScratchSSAA(); layers.forEach(l => { if (l.ctx) applyContextSmoothing(l.ctx); }); };
if ($('pressureCurveSelect')) $('pressureCurveSelect').onchange = e => ENGINE.pressureGamma = +e.target.value;
if ($('fpsTelemetrySwitch')) $('fpsTelemetrySwitch').onclick = function() { this.classList.toggle('on'); ENGINE.fpsTelemetry = this.classList.contains('on'); $('fpsBadge')?.classList.toggle('show', ENGINE.fpsTelemetry); syncFpsTelemetry(); };
if ($('toleranceSlider')) $('toleranceSlider').oninput = e => $('tolValLabel').textContent = ENGINE.floodTolerance = +e.target.value;
if ($('qsDelaySlider')) $('qsDelaySlider').oninput = e => { ENGINE.quickShapeDelay = +e.target.value; $('qsDelayLabel').textContent = `${(ENGINE.quickShapeDelay / 1000).toFixed(2)}s`; };
if ($('qsInteractiveSwitch')) $('qsInteractiveSwitch').onclick = function() { this.classList.toggle('on'); ENGINE.quickShapeInteractive = this.classList.contains('on'); };

// Smart Fill controls
if ($('fillGapSlider')) $('fillGapSlider').oninput = e => { ENGINE.fillGap = +e.target.value; $('fillGapLbl').textContent = ENGINE.fillGap + 'px'; };
if ($('fillExpandSlider')) $('fillExpandSlider').oninput = e => { ENGINE.fillExpand = +e.target.value; $('fillExpandLbl').textContent = ENGINE.fillExpand + 'px'; };
if ($('dragFillSwitch')) $('dragFillSwitch').onclick = function() { this.classList.toggle('on'); ENGINE.dragFill = this.classList.contains('on'); };

const KEYBIND_LABELS = { undo: 'Undo', redo: 'Redo', save: 'Save Project', brush: 'Brush Tool', eraser: 'Eraser Tool', smudge: 'Smudge Tool', move: 'Move Layer', eyedropper: 'Eyedropper', layers: 'Layers Panel', color: 'Color Studio', zoomIn: 'Zoom In Canvas', zoomOut: 'Zoom Out Canvas', fitView: 'Fit Canvas 100%' };
function renderKeybindsList() {
  const wrap = $('keybindsList'); if (!wrap) return; wrap.innerHTML = '';
  Object.keys(KEYBIND_LABELS).forEach(act => {
    const row = document.createElement('div'); row.className = 'setting-row';
    row.innerHTML = `<span>${KEYBIND_LABELS[act]}</span><button type="button" class="keybind-btn ${listeningKeyAction === act ? 'listening' : ''}" data-kact="${act}">${listeningKeyAction === act ? 'Press key...' : KEYBINDS[act]}</button>`;
    row.querySelector('button').onclick = () => { listeningKeyAction = listeningKeyAction === act ? null : act; renderKeybindsList(); };
    wrap.appendChild(row);
  });
}
renderKeybindsList();
if ($('resetKeybindsBtn')) $('resetKeybindsBtn').onclick = () => { KEYBINDS = Object.assign({}, DEFAULT_KEYBINDS); try{localStorage.setItem('wincreate_keybinds_v1', JSON.stringify(KEYBINDS));}catch{} listeningKeyAction = null; renderKeybindsList(); msg('Keybinds Reset'); };

if ($('aiRimLightBtn')) {
  $('aiRimLightBtn').onclick = () => {
    const l = getActiveLayer(); if (!l || l.isFolder) return; saveUndo();
    if(l.vectorStrokes?.length){ flattenVectorLayer(l);msg('Rim light rasterized active layer'); }
    const src = l.ctx.getImageData(0, 0, WIDTH, HEIGHT), out = l.ctx.getImageData(0, 0, WIDTH, HEIGHT), s = src.data, d = out.data;
    const n = parseInt(currentColor.slice(1), 16), lr = (n >> 16) & 255, lg = (n >> 8) & 255, lb = n & 255;
    for (let y = 6; y < HEIGHT - 6; y++) for (let x = 6; x < WIDTH - 6; x++) {
      const i = (y * WIDTH + x) * 4;
      if (s[i + 3] > 40 && s[((y - 6) * WIDTH + (x - 6)) * 4 + 3] < 80) {
        const rim = (255 - s[((y - 6) * WIDTH + (x - 6)) * 4 + 3]) / 255 * 0.68;
        d[i] = Math.min(255, s[i] + lr * rim); d[i + 1] = Math.min(255, s[i + 1] + lg * rim); d[i + 2] = Math.min(255, s[i + 2] + lb * rim);
      }
    }
    l.ctx.putImageData(out, 0, 0); l.thumbDirty = true; renderLayers(); closePops(); msg('3D Rim Light Applied');
  };
}
function generateAiPalette(th) { if (AI_PALETTES[th]) { swatches = [...AI_PALETTES[th]]; renderSwatches(); setColor(swatches[5]); msg(`Palette: ${th.toUpperCase()}`); } }
if ($('aiExtractPaletteBtn')) {
  $('aiExtractPaletteBtn').onclick = () => {
    const comp = document.createElement('canvas'); comp.width = WIDTH; comp.height = HEIGHT; const cCtx = create2DContext(comp, true);
    if (bgVisible) { cCtx.fillStyle = bgColor; cCtx.fillRect(0, 0, WIDTH, HEIGHT); }
    layers.forEach(l => { if (l.visible && !l.isFolder && l.canvas) cCtx.drawImage(l.canvas, 0, 0, WIDTH, HEIGHT); });
    const d = cCtx.getImageData(0, 0, WIDTH, HEIGHT).data, found = new Set();
    for (let i = 0; i < 1600 && found.size < 14; i++) {
      const idx = Math.floor(Math.random() * (WIDTH * HEIGHT)) * 4;
      if (d[idx + 3] > 60) { const hex = '#' + [d[idx], d[idx + 1], d[idx + 2]].map(v => v.toString(16).padStart(2, '0')).join(''); if (hex !== '#ffffff' || found.size > 10) found.add(hex); }
    }
    if (found.size) { swatches = [...found, ...swatches].slice(0, 14); renderSwatches(); setColor(swatches[0]); msg(`Sampled ${found.size} Swatches`); }
  };
}

// =========================================================================
// LAYER FOLDERS, CACHED THUMBNAILS, MULTI-SELECT, DRAG REORDER & SEARCH
// =========================================================================
function isLayerEffectivelyVisible(l) {
  if (!l.visible) return false;
  if (l.parentId) {
    const parent = layers.find(x => x.id === l.parentId && x.isFolder);
    if (parent && !parent.visible) return false;
  }
  return true;
}

function getEffectiveLayerOpacity(l) {
  let op = (l.opacity ?? 100) / 100;
  if (l.parentId) {
    const parent = layers.find(x => x.id === l.parentId && x.isFolder);
    if (parent) op *= ((parent.opacity ?? 100) / 100);
  }
  return op;
}

function createVectorSurface(layerId) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.dataset.vectorLayer = String(layerId || '');
  svg.classList.add('vector-layer-surface');
  board.insertBefore(svg, scratchCanvas);
  return svg;
}

function smoothVectorPath(points) {
  if (!points || points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], n = points[i + 1];
    const mx = (p.x + n.x) * 0.5, my = (p.y + n.y) * 0.5;
    d += ` Q ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return d;
}

function buildVectorErasePath(points) {
  if (!Array.isArray(points) || !points.length) return '';
  if (points.length === 1) {
    const p = points[0]; return `M ${p.x} ${p.y} l .001 0`;
  }
  return smoothVectorPath(points);
}

// Explicit vector command can represent geometry independently of brush samples.
function vectorPathForStroke(st) { return st.svgPath || smoothVectorPath(st.points || []); }
function getVectorTransform(st){return st.svgTransform || {sx:1,sy:1,dx:0,dy:0};}
function adjustVectorTransform(st,sx=1,sy=1,dx=0,dy=0){
  if(!st.svgPath)return;
  const prev=getVectorTransform(st);
  st.svgTransform={sx:prev.sx*sx,sy:prev.sy*sy,dx:prev.dx*sx+dx,dy:prev.dy*sy+dy};
}
function vectorShapeSpec(kind, box, p1, p2, control) {
  const custom=WC65.shapeSpec(kind,box,p1,p2,control);if(custom)return custom;
  const n = v => +Number(v).toFixed(3);
  let {minX:x0,maxX:x1,minY:y0,maxY:y1}=box;
  if(kind==='circle') {
    const cx=(x0+x1)/2,cy=(y0+y1)/2,r=Math.max(2,(x1-x0)/2,(y1-y0)/2);
    x0=cx-r;x1=cx+r;y0=cy-r;y1=cy+r;
  }
  if(kind==='line')return {d:`M ${n(p1.x)} ${n(p1.y)} L ${n(p2.x)} ${n(p2.y)}`,points:[{...p1},{...p2}],closed:false};
  if(kind==='curve') {
    const c=control||{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};
    const points=Array.from({length:49},(_,i)=>{const t=i/48,v=1-t;return {x:v*v*p1.x+2*v*t*c.x+t*t*p2.x,y:v*v*p1.y+2*v*t*c.y+t*t*p2.y};});
    return {d:`M ${n(p1.x)} ${n(p1.y)} Q ${n(c.x)} ${n(c.y)} ${n(p2.x)} ${n(p2.y)}`,points,closed:false};
  }
  if(kind==='circle'||kind==='ellipse') {
    const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=Math.max(2,(x1-x0)/2),ry=Math.max(2,(y1-y0)/2);
    const points=Array.from({length:65},(_,i)=>({x:cx+Math.cos(i*Math.PI/32)*rx,y:cy+Math.sin(i*Math.PI/32)*ry}));
    return {d:`M ${n(cx+rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx-rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx+rx)} ${n(cy)} Z`,points,closed:true};
  }
  const pts=buildShapeVertices(kind,x0,x1,y0,y1);
  if(!pts?.length)return vectorShapeSpec('line',box,p1,p2,control);
  return {d:`M ${n(pts[0].x)} ${n(pts[0].y)} `+pts.slice(1).map(pt=>`L ${n(pt.x)} ${n(pt.y)}`).join(' ')+' Z',points:pts.map(pt=>({x:pt.x,y:pt.y})),closed:true};
}
function addVectorShapeToLayer(layer, spec, kind, width, color, opacity, filled=false) {
  if(!layer || !spec?.d)return;
  layer.vectorStrokes ||= [];
  layer.vectorStrokes.push({id:'shape_'+Date.now()+'_'+Math.random().toString(36).slice(2),shapeKind:kind,svgPath:spec.d,
    points:spec.points,color,width:Math.max(.25,width),opacity:Math.max(0,Math.min(1,opacity)),fill:!!filled&&spec.closed});
  renderVectorLayer(layer);layer.thumbDirty=true;
}
function polygonCutPath(points){
  if(!points?.length)return '';
  let ps=points.map(p=>({x:p.x,y:p.y})),area=0;for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];area+=a.x*b.y-b.x*a.y;}
  if(area>0)ps.reverse();return `M ${ps[0].x} ${ps[0].y} `+ps.slice(1).map(p=>`L ${p.x} ${p.y}`).join(' ')+' Z';
}
function eraserContour(er){
  if(er.kind==='selection')return polygonCutPath(er.points);
  if(er.kind==='wet')return WCVectorCuts.pathData(WCVectorCuts.cut(er));
  const pts=er.points||[],radius=p=>Math.max(.125,p.r??er.width/2),n=v=>+v.toFixed(3);let path='';
  for(let i=0;i<pts.length;i++){
    const p=pts[i],r=radius(p);path+=`M ${n(p.x+r)} ${n(p.y)} A ${n(r)} ${n(r)} 0 1 0 ${n(p.x-r)} ${n(p.y)} A ${n(r)} ${n(r)} 0 1 0 ${n(p.x+r)} ${n(p.y)} Z `;
    if(!i)continue;const q=pts[i-1],qr=radius(q),dx=p.x-q.x,dy=p.y-q.y,len=Math.hypot(dx,dy);if(len<.001)continue;
    const nx=-dy/len,ny=dx/len;
    path+=`M ${n(q.x+nx*qr)} ${n(q.y+ny*qr)} L ${n(p.x+nx*r)} ${n(p.y+ny*r)} L ${n(p.x-nx*r)} ${n(p.y-ny*r)} L ${n(q.x-nx*qr)} ${n(q.y-ny*qr)} Z `;
  }return path;
}
// Native-resolution path filling can drop a subpixel cut completely. Render
// those masks at 4x in bounded tiles, then integrate their coverage into pixels.
let wetEraseTile=null, wetEraseCtx=null;
function reusableWetEraseTile(width,height){
  const w=width*4,h=height*4;
  if(!wetEraseTile){wetEraseTile=document.createElement('canvas');wetEraseCtx=wetEraseTile.getContext('2d',{willReadFrequently:true});}
  // Grow only when required; no reallocation during repeated mask passes.
  if(wetEraseTile.width<w)wetEraseTile.width=Math.min(1024,Math.max(w,wetEraseTile.width||0));
  if(wetEraseTile.height<h)wetEraseTile.height=Math.min(1024,Math.max(h,wetEraseTile.height||0));
  return wetEraseCtx;
}
function fillErasureMask(ctx,er){
  const path=new Path2D(eraserContour(er));
  if(er.kind==='selection'||!(er.points||[]).some(p=>(p.r??er.width/2)<.5)){ctx.fill(path);return;}
  if(er.kind==='wet'){
    // Wet geometry is in document coordinates even inside a local scratch
    // canvas. Supersample its tiny footprint in local device coordinates.
    const m=ctx.getTransform(),b=getStrokeBounds(er);if(!b)return;
    const left=Math.max(0,Math.floor(b.x0+m.e)),top=Math.max(0,Math.floor(b.y0+m.f)),right=Math.min(ctx.canvas.width,Math.ceil(b.x1+m.e)),bottom=Math.min(ctx.canvas.height,Math.ceil(b.y1+m.f));
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=true;
    for(let y=top;y<bottom;y+=256)for(let x=left;x<right;x+=256){
      const w=Math.min(256,right-x),h=Math.min(256,bottom-y),t=reusableWetEraseTile(w,h);
      t.setTransform(1,0,0,1,0,0);t.clearRect(0,0,w*4,h*4);
      t.setTransform(4,0,0,4,(m.e-x)*4,(m.f-y)*4);t.fill(path);
      ctx.drawImage(wetEraseTile,0,0,w*4,h*4,x,y,w,h);
    }ctx.restore();return;
  }
  const b=getStrokeBounds(er);if(!b)return;
  const x0=Math.max(0,Math.floor(b.x0)),y0=Math.max(0,Math.floor(b.y0));
  const x1=Math.min(ctx.canvas.width,Math.ceil(b.x1)),y1=Math.min(ctx.canvas.height,Math.ceil(b.y1));
  const mask=document.createElement('canvas');ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  for(let y=y0;y<y1;y+=256)for(let x=x0;x<x1;x+=256){
    const w=Math.min(256,x1-x),h=Math.min(256,y1-y);mask.width=w*4;mask.height=h*4;
    const mc=mask.getContext('2d');mc.setTransform(4,0,0,4,-x*4,-y*4);mc.fillStyle='#000';mc.fill(path);
    ctx.drawImage(mask,0,0,w*4,h*4,x,y,w,h);
  }
  ctx.restore();
}
let vectorMaskSequence=0;
const VECTOR_PREVIEWS=new WeakMap();
function vectorMark(st,copyLive=false){
  const ns='http://www.w3.org/2000/svg';
    let mark;
    if(st.kind==='raster'){
      const live=LIVE_RASTER_COMMANDS.get(st),b=getStrokeBounds(st);
      if(live){mark=document.createElementNS(ns,'foreignObject');mark.setAttribute('x',b.x0);mark.setAttribute('y',b.y0);mark.setAttribute('width',b.x1-b.x0);mark.setAttribute('height',b.y1-b.y0);const paint=copyLive?live.canvas.cloneNode(true):live.canvas;if(copyLive)paint.getContext('2d').drawImage(live.canvas,0,0);paint.style.cssText='position:static;width:100%;height:100%;display:block;transform:none;image-rendering:auto;';mark.append(paint);}
      else {mark=document.createElementNS(ns,'image');
      mark.setAttribute('href',st.pngData);mark.setAttribute('x',b.x0);mark.setAttribute('y',b.y0);mark.setAttribute('width',b.x1-b.x0);mark.setAttribute('height',b.y1-b.y0);mark.setAttribute('preserveAspectRatio','none');}
    } else if (st.points.length === 1 && !st.svgPath) {
      mark = document.createElementNS(ns, 'circle');
      mark.setAttribute('cx', st.points[0].x); mark.setAttribute('cy', st.points[0].y);
      mark.setAttribute('r', String(Math.max(.125, (st.width || 1) * .5)));
      mark.setAttribute('fill', st.color || '#000000');
    } else {
      mark = document.createElementNS(ns, 'path');
      mark.setAttribute('d', vectorPathForStroke(st));
      mark.setAttribute('fill', st.fill ? (st.color || '#000000') : 'none');
      mark.setAttribute('stroke', st.outline ? 'none' : (st.color || '#000000'));
      const transform=getVectorTransform(st),scaleFactor=(Math.abs(transform.sx)+Math.abs(transform.sy))*0.5||1;
      mark.setAttribute('stroke-width', String(Math.max(.25, (st.width || 1)/scaleFactor)));
      if(st.svgPath&&st.svgTransform)mark.setAttribute('transform',`matrix(${transform.sx} 0 0 ${transform.sy} ${transform.dx} ${transform.dy})`);
      mark.setAttribute('stroke-linecap', 'round'); mark.setAttribute('stroke-linejoin', 'round');
    }
    mark.setAttribute('opacity', String(Math.max(0, Math.min(1, st.opacity ?? 1))));
  return mark;
}
function renderVectorLayer(layer,previewErase=null){
  if(!layer||layer.isFolder||!layer.vectorSvg)return;
  const svg=layer.vectorSvg,ns='http://www.w3.org/2000/svg',strokes=layer.vectorStrokes||[];let state=VECTOR_PREVIEWS.get(layer);
  if(previewErase){
    if(!state||state.strokes.length!==strokes.length||state.strokes.some((st,i)=>st!==strokes[i])){renderVectorLayer(layer);state=VECTOR_PREVIEWS.get(layer);}
    if(!state.liveDefs){state.liveDefs=document.createElementNS(ns,'defs');state.previewMarks=new Map();state.previewBuckets=new Map();state.bounds=strokes.map(getStrokeBounds);svg.prepend(state.liveDefs);}
    const updated=new Set();
    const bucketFor=history=>{const key=JSON.stringify(history.map(er=>[er.kind||'',er.width||1,er.opacity??1,er.selectionPoints||null,er.points||[]]));
      if(!state.previewBuckets.has(key))state.previewBuckets.set(key,{history,paths:[],prefix:'wc-preview-'+layer._maskNamespace+'-'+state.previewBuckets.size});return state.previewBuckets.get(key);};
    const refresh=bucket=>{if(updated.has(bucket))return;updated.add(bucket);
      // Combining historical and live cuts gives exactly the same edge coverage
      // as the committed SVG. Nested clips can change translucent boundary pixels.
      const regions=WCVectorCuts.regions([...bucket.history,previewErase],WIDTH,HEIGHT);bucket.regions=regions;
      while(bucket.paths.length>regions.length)bucket.paths.pop().parentNode.remove();
      regions.forEach((region,i)=>{let path=bucket.paths[i];if(!path){const clip=document.createElementNS(ns,'clipPath');clip.id=bucket.prefix+'-'+i;clip.setAttribute('clipPathUnits','userSpaceOnUse');path=document.createElementNS(ns,'path');path.setAttribute('clip-rule','evenodd');clip.append(path);state.liveDefs.append(clip);bucket.paths.push(path);}path.setAttribute('d',region.d);});
    };
    const bounds=getStrokeBounds(previewErase),touched=new Set();
    strokes.forEach((st,i)=>{const b=state.bounds[i],hit=bounds&&b&&b.x1>=bounds.x0&&b.x0<=bounds.x1&&b.y1>=bounds.y0&&b.y0<=bounds.y1;
      if(!hit&&!state.touched.has(i))return;const slot=state.slots[i];if(!slot||!st.points?.length)return;
      let record=state.previewMarks.get(i);
      if(!hit){if(record)slot.replaceChildren(...record.originals);state.previewMarks.delete(i);return;}
      touched.add(i);
      if(!record){const history=st.erasures||[],originals=[...slot.childNodes];record={originals,bases:history.length?[vectorMark(st,true)]:originals,groups:null,bucket:bucketFor(history)};state.previewMarks.set(i,record);}
      const bucket=record.bucket;refresh(bucket);const regions=bucket.regions;
      if(!record.groups||record.groups.length!==regions.length){slot.replaceChildren();record.groups=regions.map((region,j)=>{const part=document.createElementNS(ns,'g');for(const node of record.bases)part.append(j===0?node:clonePaintNode(node));slot.append(part);return part;});}
      regions.forEach((region,j)=>{record.groups[j].setAttribute('clip-path',`url(#${bucket.prefix}-${j})`);record.groups[j].setAttribute('opacity',region.alpha);});
    });state.touched=touched;return;
  }
  svg.setAttribute('viewBox',`0 0 ${WIDTH} ${HEIGHT}`);svg.replaceChildren();layer._maskNamespace ||= ++vectorMaskSequence;
  const defs=document.createElementNS(ns,'defs'),cache={ids:new Map(),regions:new Map()},slots=[];
  strokes.forEach((st,i)=>{const slot=document.createElementNS(ns,'g');slots.push(slot);if(st.points?.length){let mark=vectorMark(st);if(st.erasures?.length)mark=applyVectorCutRegions(mark,st.erasures,defs,'wc-cut-'+layer._maskNamespace+'-'+i,cache);slot.append(mark);}svg.append(slot);});if(defs.childNodes.length)svg.prepend(defs);
  VECTOR_PREVIEWS.set(layer,{strokes:strokes.slice(),slots,touched:new Set(),liveDefs:null});
}

function paintSingleVectorStroke(ctx, st) {
  const pts = st.points || [];
  if (!pts.length) return;
  if(st.kind==='raster'){const image=rasterCommandImage(st);if(image instanceof HTMLImageElement&&(!image.complete||!image.naturalWidth))return;const b=getStrokeBounds(st);ctx.drawImage(image,b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);return;}
  if(st.svgPath) {
    ctx.save();ctx.strokeStyle=st.color||'#000000';ctx.fillStyle=st.color||'#000000';
    ctx.lineWidth=Math.max(.25,st.width||1);ctx.lineCap='round';ctx.lineJoin='round';
    const tr=getVectorTransform(st);
    ctx.transform(tr.sx,0,0,tr.sy,tr.dx,tr.dy);
    ctx.lineWidth=Math.max(.25,(st.width||1)/((Math.abs(tr.sx)+Math.abs(tr.sy))*0.5||1));
    const path=new Path2D(st.svgPath);if(st.fill)ctx.fill(path);if(!st.outline)ctx.stroke(path);ctx.restore();return;
  }
  ctx.strokeStyle = st.color || '#000000';
  ctx.fillStyle = st.color || '#000000';
  ctx.lineWidth = Math.max(.25, st.width || 1);
  ctx.lineCap = 'round';ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth*.5, 0, Math.PI*2);ctx.fill();
  } else {
    ctx.beginPath();ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1; i<pts.length-1; i++) {
      const pt=pts[i], next=pts[i+1];
      ctx.quadraticCurveTo(pt.x, pt.y, (pt.x+next.x)*.5, (pt.y+next.y)*.5);
    }
    const last=pts[pts.length-1];ctx.lineTo(last.x,last.y);ctx.stroke();
  }
}
const VECTOR_BOUNDS_CACHE = new WeakMap();
function getStrokeBounds(st) {

  const pts=st.points||[];
  if (!pts.length) return null;
  const last=pts[pts.length-1],t=st.svgTransform,cached=VECTOR_BOUNDS_CACHE.get(st);
  // Bounds are queried for every nearby sample. Compare scalars without
  // allocating an array/string for every cache hit on a dense document.
  if(cached&&cached.points===pts&&cached.length===pts.length&&cached.width===st.width&&cached.x===last.x&&cached.y===last.y&&cached.r===last.r&&cached.sx===t?.sx&&cached.sy===t?.sy&&cached.dx===t?.dx&&cached.dy===t?.dy)return cached.bounds;
  let r=Math.max(.125,(st.width||1)*.5);for(const p of pts)r=Math.max(r,p.r||0);
  if(st.outline){let gap=0;for(let i=1;i<pts.length;i++)gap=Math.max(gap,Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));r+=gap*.5;}
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const pt of pts){
    x0=Math.min(x0,pt.x);y0=Math.min(y0,pt.y);
    x1=Math.max(x1,pt.x);y1=Math.max(y1,pt.y);
  }
  const bounds=st.kind==='raster'?{x0,y0,x1,y1}:{x0:x0-r-2,y0:y0-r-2,x1:x1+r+2,y1:y1+r+2};

  VECTOR_BOUNDS_CACHE.set(st,{points:pts,length:pts.length,width:st.width,x:last.x,y:last.y,r:last.r,sx:t?.sx,sy:t?.sy,dx:t?.dx,dy:t?.dy,bounds});return bounds;
}
// Narrow-phase hit test: a long curved ink path should NOT be rasterized
// just because the smudge crosses its (possibly huge) bounding rectangle.
function strokeTouchesArea(st, x, y, r) {
  if(st.kind==='raster'){const b=getStrokeBounds(st);return x+r>=b.x0&&x-r<=b.x1&&y+r>=b.y0&&y-r<=b.y1;}
  const b = getStrokeBounds(st);
  if (!b || b.x1 < x-r || b.x0 > x+r || b.y1 < y-r || b.y0 > y+r) return false;
  const pts=st.points||[];
  if (!pts.length) return false;
  let tip=Math.max(.125,(st.width||1)*.5);for(const p of pts)tip=Math.max(tip,p.r||0);
  const range=r+tip+1;
  if(st.fill&&st.svgPath){const probe=getActiveLayer()?.ctx;if(probe){probe.save();const tr=getVectorTransform(st);const hit=tr.sx&&tr.sy&&probe.isPointInPath(new Path2D(st.svgPath),(x-tr.dx)/tr.sx,(y-tr.dy)/tr.sy);probe.restore();if(hit)return true;}}
  const range2=range*range;
  const closeSegment=(a,bb)=>{
    const dx=bb.x-a.x,dy=bb.y-a.y;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return (x-a.x-t*dx)**2+(y-a.y-t*dy)**2<=range2;
  };
  if(pts.length===1)return (x-pts[0].x)**2+(y-pts[0].y)**2<=range2;
  if(pts.length===2)return closeSegment(pts[0],pts[1]);
  let from=pts[0];
  for(let i=1;i<pts.length-1;i++){
    const control=pts[i],next=pts[i+1],to={x:(control.x+next.x)*.5,y:(control.y+next.y)*.5};
    let prev=from;
    // Sample the same quadratic segments used for SVG and Canvas2D inking.
    for(let step=1;step<=4;step++){
      const t=step*.25,u=1-t;
      const curr={x:u*u*from.x+2*u*t*control.x+t*t*to.x,
                  y:u*u*from.y+2*u*t*control.y+t*t*to.y};
      if(closeSegment(prev,curr))return true;
      prev=curr;
    }
    from=to;
  }
  return closeSegment(from,pts[pts.length-1]);
}
function paintVectorStrokesToContext(ctx, layer, region=null) {
  if (!ctx || !layer || !layer.vectorStrokes?.length) return;
  for(const st of layer.vectorStrokes){
    if(!st.points?.length)continue;
    const bounds=region?getStrokeBounds(st):null;
    if(region&&(!bounds||bounds.x1<region.x0||bounds.x0>region.x1||bounds.y1<region.y0||bounds.y0>region.y1))continue;
    ctx.save();ctx.globalAlpha*=Math.max(0,Math.min(1,st.opacity??1));
    const erasures=st.erasures||[];
    if(!erasures.length)paintSingleVectorStroke(ctx,st);
    else {
      const b=bounds||getStrokeBounds(st),x0=Math.max(0,Math.floor(Math.max(b.x0,region?.x0??0))),y0=Math.max(0,Math.floor(Math.max(b.y0,region?.y0??0))),x1=Math.min(WIDTH,Math.ceil(Math.min(b.x1,region?.x1??WIDTH))),y1=Math.min(HEIGHT,Math.ceil(Math.min(b.y1,region?.y1??HEIGHT)));
      if(x1>x0&&y1>y0){
        const patch=document.createElement('canvas');patch.width=x1-x0;patch.height=y1-y0;const pc=patch.getContext('2d',{willReadFrequently:true});pc.translate(-x0,-y0);paintSingleVectorStroke(pc,st);pc.setTransform(1,0,0,1,0,0);pc.globalCompositeOperation='destination-out';pc.fillStyle='#000';
        for(const er of erasures){if(!er.points?.length)continue;pc.save();pc.globalAlpha=Math.max(0,Math.min(1,er.opacity??1));if(er.kind==='wet'){pc.translate(-x0,-y0);fillErasureMask(pc,er);}else{const local={...er,points:er.points.map(p=>({...p,x:p.x-x0,y:p.y-y0}))};if(er.selectionPoints?.length)pc.clip(new Path2D(polygonCutPath(er.selectionPoints.map(p=>({x:p.x-x0,y:p.y-y0})))));fillErasureMask(pc,local);}pc.restore();}
        ctx.drawImage(patch,x0,y0);
      }
    }
    ctx.restore();
  }
}
// Wet mode composites in original paint order; Sharp Ink edits only vector geometry.
function getSmudgeStartPixels(layer,tx,ty,size,x,y,r){
  const tile=document.createElement('canvas');tile.width=tile.height=size;
  const ctx=tile.getContext('2d',{willReadFrequently:true}),selection=window.WinCreate?.selectionPath;
  ctx.save();ctx.translate(-tx,-ty);if(selection)ctx.clip(selection);
  if(layer.rasterRevision!==0)ctx.drawImage(layer.canvas,0,0);
  // Regional compositing already culls bounds. Point hit tests can miss a
  // filled shape's closing edge and must not omit paint from the carrier.
  const near=layer.vectorStrokes||[];
  if(near.length)paintVectorStrokesToContext(ctx,{vectorStrokes:near},{x0:tx,y0:ty,x1:tx+size,y1:ty+size});
  // Restore the tile-space transform before applying any clip mask.
  ctx.restore();
  if(layer.clipMask){const base=layers[layers.indexOf(layer)-1];if(base&&!base.isFolder){const mask=document.createElement('canvas');mask.width=mask.height=size;paintLayerRegion(mask.getContext('2d',{willReadFrequently:true}),base,tx,ty,size,size);ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);}}
  return ctx.getImageData(0,0,size,size).data;
}
function getLayerReferencePixels(layer) {
  if (!layer || layer.isFolder) return null;
  if (!layer.vectorStrokes?.length) return layer.ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const tmp = document.createElement('canvas'); tmp.width = WIDTH; tmp.height = HEIGHT;
  const tctx = create2DContext(tmp, true); tctx.drawImage(layer.canvas, 0, 0); paintVectorStrokesToContext(tctx, layer);
  return tctx.getImageData(0, 0, WIDTH, HEIGHT).data;
}

function flattenVectorLayer(layer) {
  if (!layer || layer.isFolder || !layer.vectorStrokes?.length) return;
  paintVectorStrokesToContext(layer.ctx, layer);
  layer.vectorStrokes = [];
  renderVectorLayer(layer);
  layer.thumbDirty = true;
}

const RASTER_COMMAND_IMAGES=new Map(),LIVE_RASTER_COMMANDS=new WeakMap();
function setLiveRasterCommand(st,canvas){
  let live=LIVE_RASTER_COMMANDS.get(st);
  if(!live){live={canvas,revision:0,encodedRevision:-1,png:''};LIVE_RASTER_COMMANDS.set(st,live);
    Object.defineProperty(st,'pngData',{enumerable:true,configurable:true,get(){if(live.encodedRevision!==live.revision){live.png=live.canvas.toDataURL('image/png');live.encodedRevision=live.revision;const copy=document.createElement('canvas');copy.width=live.canvas.width;copy.height=live.canvas.height;copy.getContext('2d').drawImage(live.canvas,0,0);if(RASTER_COMMAND_IMAGES.size>=512)RASTER_COMMAND_IMAGES.delete(RASTER_COMMAND_IMAGES.keys().next().value);RASTER_COMMAND_IMAGES.set(live.png,copy);}return live.png;}});
  }live.canvas=canvas;live.revision++;
}
function materializeRasterCommand(st){
  const live=st&&LIVE_RASTER_COMMANDS.get(st);if(!live)return;
  const png=st.pngData;Object.defineProperty(st,'pngData',{value:png,writable:true,enumerable:true,configurable:true});
  LIVE_RASTER_COMMANDS.delete(st);RASTER_COMMAND_IMAGES.set(png,live.canvas);
}
function rasterCommandImage(st){
  const live=LIVE_RASTER_COMMANDS.get(st);if(live)return live.canvas;
  if(RASTER_COMMAND_IMAGES.has(st.pngData))return RASTER_COMMAND_IMAGES.get(st.pngData);
  const img=new Image();img.onload=()=>{for(const l of layers)if(l.vectorStrokes?.includes(st)){l.thumbDirty=true;renderVectorLayer(l);}};img.src=st.pngData;
  if(RASTER_COMMAND_IMAGES.size>512)RASTER_COMMAND_IMAGES.delete(RASTER_COMMAND_IMAGES.keys().next().value);
  RASTER_COMMAND_IMAGES.set(st.pngData,img);return img;
}
async function prepareRasterCommands(records){
  const work=[];for(const l of records||[])for(const st of l.vectorStrokes||[])if(st.kind==='raster'){
    const image=rasterCommandImage(st);if(image instanceof HTMLImageElement&&!image.complete)work.push(new Promise((res,rej)=>{image.addEventListener('load',res,{once:true});image.addEventListener('error',()=>rej(Error('Damaged painted stroke')),{once:true});}));
  }for(const l of records||[])work.push(WCLayerMasks.prepare(l.layerMask));await Promise.all(work);
}
let sharedLayerComposite=null;
function createLayerComposite(layer){
  const c=sharedLayerComposite ||= document.createElement('canvas');if(c.width!==WIDTH||c.height!==HEIGHT){c.width=WIDTH;c.height=HEIGHT;}
  const ctx=c.getContext('2d');ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.drawImage(layer.canvas,0,0);paintVectorStrokesToContext(ctx,layer);window.WC65Effects?.apply(ctx,layer);WCLayerMasks.apply(ctx,layer);const parent=layers.find(l=>l.isFolder&&l.id===layer.parentId);if(parent)WCLayerMasks.apply(ctx,parent);return c;
}
// Local sampling also bounds temporary erased-vector bitmaps.
function paintLayerRegion(ctx,layer,x,y,width,height){
  ctx.save();ctx.translate(-x,-y);if(layer.rasterRevision!==0)ctx.drawImage(layer.canvas,0,0);
  paintVectorStrokesToContext(ctx,layer,{x0:x,y0:y,x1:x+width,y1:y+height});ctx.restore();
}
function appendPaintPatch(layer,patch,x,y){
  if(!layer.vectorStrokes?.length){layer.ctx.drawImage(patch,x,y);return;}
  const pngData=patch.toDataURL('image/png');RASTER_COMMAND_IMAGES.set(pngData,patch);
  layer.vectorStrokes.push({kind:'raster',id:'paint_'+Date.now()+'_'+Math.random().toString(36).slice(2),pngData,
    points:[{x,y},{x:x+patch.width,y},{x:x+patch.width,y:y+patch.height},{x,y:y+patch.height}],width:0,opacity:1});
  renderVectorLayer(layer);
}
function commitRasterBrush(layer){
  const bounds=getStrokeBounds({points:splinePts,width:brushSize*4});
  if(!bounds)return;
  const x=Math.max(0,Math.floor(bounds.x0)),y=Math.max(0,Math.floor(bounds.y0)),w=Math.min(WIDTH,Math.ceil(bounds.x1))-x,h=Math.min(HEIGHT,Math.ceil(bounds.y1))-y;
  if(w<=0||h<=0)return;
  const patch=document.createElement('canvas');patch.width=w;patch.height=h;const ctx=patch.getContext('2d');
  ctx.save();ctx.translate(-x,-y);if(window.WinCreate?.selectionPath)ctx.clip(WinCreate.selectionPath);
  ctx.globalAlpha=(brushOpacity/100)*getCurrentBrush().alpha;ctx.drawImage(scratchCanvas,0,0,WIDTH,HEIGHT);ctx.restore();
  if(layer.alphaLock){ctx.globalCompositeOperation='destination-in';ctx.drawImage(createLayerComposite(layer),-x,-y);}
  if(layer.clipMask){const i=layers.indexOf(layer),base=layers[i-1];if(base&&!base.isFolder){ctx.globalCompositeOperation='destination-in';ctx.drawImage(createLayerComposite(base),-x,-y);}}
  appendPaintPatch(layer,patch,x,y);
}
const PIXEL_SNAPSHOTS=new WeakMap();
function trackLayerPixels(layer){
  if(layer._tracked)return;layer._tracked=true;layer.rasterRevision=0;
  for(const method of ['drawImage','putImageData','fill','stroke','clearRect','fillRect','strokeRect','fillText','strokeText','reset']){
    if(typeof layer.ctx[method]!=='function')continue;
    const native=layer.ctx[method].bind(layer.ctx);
    layer.ctx[method]=(...args)=>{const result=native(...args);layer.rasterRevision++;return result;};
  }
}
function captureLayerPixels(layer){
  const cached=PIXEL_SNAPSHOTS.get(layer);
  if(cached&&cached.revision===layer.rasterRevision)return cached.data;
  let data=null;
  if(layer.rasterRevision!==0){
    if(layer._livePixels&&layer._livePixelsRev===layer.rasterRevision&&layer._livePixels.width===WIDTH&&layer._livePixels.height===HEIGHT){
      data=new ImageData(new Uint8ClampedArray(layer._livePixels.data),WIDTH,HEIGHT);
    }else{
      data=layer.ctx.getImageData(0,0,WIDTH,HEIGHT);
    }
  }
  PIXEL_SNAPSHOTS.set(layer,{revision:layer.rasterRevision,data});return data;
}
function trimHistory(){
  const limit=window.WCPerf?.budget('undoMB',1024*1048576)||1024*1048576;
  // Account shared pixel snapshots once, then decrement counts as states leave.
  // This preserves the existing limits without rescanning history per removal.
  const pixels=new Map(),costs=new Map();let size=0;
  for(const state of [...undoStack,...redoStack]){
    const refs=[];let vectors=0;
    for(const layer of ['single','mask'].includes(state.type)?[state]:state.layers||[]){
      if(layer.data){const count=pixels.get(layer.data)||0;if(!count)size+=layer.data.data.byteLength;pixels.set(layer.data,count+1);refs.push(layer.data);}
      vectors+=(layer.layerMask?.bitmap?.length||0)*2;
      for(const cmd of layer.layerMask?.commands||[])vectors+=(cmd.path.length+(cmd.clip?.length||0))*2+128;
      for(const st of layer.vectorStrokes||[])vectors+=WCPerf.commandBytes(st);
    }
    size+=vectors;costs.set(state,{refs,vectors});
  }
  const remove=state=>{const c=costs.get(state);size-=c.vectors;for(const data of c.refs){const count=pixels.get(data)-1;if(!count){size-=data.data.byteLength;pixels.delete(data);}else pixels.set(data,count);}};
  while(undoStack.length>ENGINE.undoMax||(undoStack.length>1&&size>limit))remove(undoStack.shift());
  while(redoStack.length>1&&size>limit)remove(redoStack.shift());
}
function createLayer(name, opts = {}) {
  const c = document.createElement('canvas');
  c.width = WIDTH; c.height = HEIGHT;
  board.insertBefore(c, scratchCanvas);
  const ctx = create2DContext(c, true);
  applyContextSmoothing(ctx);
  const vectorSvg = createVectorSurface(opts.id || 'pending');

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 40; thumbCanvas.height = 28;

  const l = {
    id: opts.id || (Date.now() + Math.random()),
    name: name || `Layer ${layerSeq++}`,
    isFolder: false,
    parentId: opts.parentId || null,
    canvas: c,
    ctx,
    vectorSvg,
    vectorStrokes: Array.isArray(opts.vectorStrokes) ? structuredClone(opts.vectorStrokes) : [],
    thumbCanvas,
    thumbDirty: true,
    visible: true,
    opacity: 100,
    alphaLock: false,
    clipMask: false,
    layerMask: opts.layerMask ? structuredClone(opts.layerMask) : null,
    effects: structuredClone(opts.effects||null),
    blend: 'normal'
  };
  trackLayerPixels(l);
  vectorSvg.dataset.vectorLayer = String(l.id);
  renderVectorLayer(l);
  layers.push(l);
  activeLayerId = l.id;
  selectedLayerIds.clear();
  selectedLayerIds.add(l.id);
  syncLayers();
  renderLayers();
  return l;
}

function createFolderLayer(name) {
  const f = {
    id: Date.now() + Math.random(),
    name: name || `Folder ${folderSeq++}`,
    isFolder: true,
    collapsed: false,
    visible: true,
    opacity: 100,
    blend: 'normal'
  };
  layers.push(f);
  syncLayers();
  renderLayers();
  return f;
}

function getActiveLayer() {
  const found = layers.find(l => l.id === activeLayerId && !l.isFolder);
  if (found) return found;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (!layers[i].isFolder) return layers[i];
  }
  return null;
}

function syncLayers() {
  layers.forEach((l,i)=>{
    if(l.isFolder||!l.canvas)return;
    if(!l.surface||!l.surface.isConnected){l.surface=document.createElement('div');l.surface.className='wc-layer-group';board.insertBefore(l.surface,scratchCanvas);l.surface.append(l.canvas,l.vectorSvg);}
    Object.assign(l.surface.style,{zIndex:String((i+1)*4),display:isLayerEffectivelyVisible(l)?'block':'none',opacity:String(getEffectiveLayerOpacity(l)),mixBlendMode:l.blend==='normal'?'normal':l.blend});
    for(const [surface,z] of [[l.canvas,0],[l.vectorSvg,2]])if(surface)Object.assign(surface.style,{zIndex:String(z),display:'block',opacity:'1',mixBlendMode:'normal'});
  });
  WCLayerMasks.syncAll();window.WC65Effects?.syncAll();
}

// Row actions operate on the clicked layer; the layer menu is never required.
function moveLayerDirect(id, delta) {
  const idx=layers.findIndex(l=>l.id===id),target=idx+delta;
  if(idx<0||target<0||target>=layers.length)return false;
  saveFullStateUndo();[layers[idx],layers[target]]=[layers[target],layers[idx]];
  activeLayerId=id;selectedLayerIds=new Set([id]);syncLayers();renderLayers();markUnsavedChanges();return true;
}
function deleteLayerDirect(id) {
  const layer=layers.find(l=>l.id===id&&!l.isFolder);
  if(!layer || layers.filter(l=>!l.isFolder).length<=1) {msg('Keep at least one art layer');return false;}
  saveFullStateUndo();layer.surface?.remove();layer.canvas?.remove();layer.vectorSvg?.remove();
  layers=layers.filter(l=>l.id!==id);selectedLayerIds.delete(id);
  if(activeLayerId===id)activeLayerId=layers.filter(l=>!l.isFolder).slice(-1)[0]?.id||null;
  openBlendDrawerLayerId=null;layerMenuSheet?.classList.remove('open');
  syncLayers();renderLayers();markUnsavedChanges();msg('Layer Deleted');return true;
}
let dragLayerId = null;

function renderLayers() {
  const list = $('layerList');
  if (!list) return;
  list.innerHTML = '';
  const query = ($('layerSearchInput')?.value || '').trim().toLowerCase();

  [...layers].reverse().forEach(l => {
    if (query && !l.name.toLowerCase().includes(query)) return;
    if (l.parentId && !query) {
      const parent = layers.find(x => x.id === l.parentId && x.isFolder);
      if (parent && parent.collapsed) return;
    }

    const isSelected = selectedLayerIds.has(l.id) || l.id === activeLayerId;
    const row = document.createElement('div');
    row.className = `ios-layer-row ${l.id === activeLayerId ? 'active' : ''} ${isSelected && selectedLayerIds.size > 1 ? 'multi-selected' : ''} ${l.clipMask ? 'clipped' : ''}`;
    if (l.parentId) row.style.marginLeft = '16px';
    row.draggable = true;

    row.ondragstart = e => { dragLayerId = l.id; e.dataTransfer.effectAllowed = 'move'; };
    row.ondragover = e => { e.preventDefault(); row.style.borderColor = 'var(--ios-blue)'; };
    row.ondragleave = () => { row.style.borderColor = ''; };
    row.ondrop = e => {
      e.preventDefault();
      row.style.borderColor = '';
      if (!dragLayerId || dragLayerId === l.id) return;
      const fromIdx = layers.findIndex(x => x.id === dragLayerId);
      const toIdx = layers.findIndex(x => x.id === l.id);
      if (fromIdx < 0 || toIdx < 0) return;
      saveFullStateUndo();
      const [moved] = layers.splice(fromIdx, 1);
      if (l.isFolder && !moved.isFolder) moved.parentId = l.id;
      layers.splice(toIdx, 0, moved);
      syncLayers();
      renderLayers();
      markUnsavedChanges();
    };

    const main = document.createElement('div');
    main.className = 'ios-layer-main';

    if (l.isFolder) {
      const caret = document.createElement('button');
      caret.type = 'button';
      caret.className = 'ios-n-trigger folder-toggle';
      caret.textContent = l.collapsed ? '›' : '⌄';
      caret.setAttribute('aria-label', `${l.collapsed ? 'Expand' : 'Collapse'} ${l.name}`);
      caret.setAttribute('aria-expanded', String(!l.collapsed));
      caret.onclick = e => { e.stopPropagation(); l.collapsed = !l.collapsed; renderLayers(); };

      const childCount = layers.filter(x => x.parentId === l.id).length;
      const txt = document.createElement('div');
      txt.className = 'ios-layer-text';
      txt.innerHTML = `<div class="ios-layer-name">${escapeMarkup(l.name)}</div><div class="ios-layer-badges">${childCount} layer${childCount === 1 ? '' : 's'}</div>`;

      const vis = document.createElement('button');
      vis.type = 'button';
      vis.className = `ios-vis-check ${l.visible ? 'on' : ''}`;
      vis.innerHTML = '✓';
      vis.onclick = e => { e.stopPropagation(); saveFullStateUndo(); l.visible = !l.visible; syncLayers(); renderLayers(); markUnsavedChanges(); };

      main.append(caret, txt, vis);
      row.appendChild(main);
      row.onclick = () => { l.collapsed = !l.collapsed; renderLayers(); };
      list.appendChild(row);
      return;
    }

    // Only update layer thumbnail when dirty
    if (l.thumbDirty || !l.thumbCanvas) {
      if (!l.thumbCanvas) {
        l.thumbCanvas = document.createElement('canvas');
        l.thumbCanvas.width = 40; l.thumbCanvas.height = 28;
      }
      const tCtx = l.thumbCanvas.getContext('2d');
      tCtx.clearRect(0, 0, 40, 28);
      tCtx.drawImage(l.canvas, 0, 0, 40, 28);
      if (l.vectorStrokes?.length) { tCtx.save(); tCtx.scale(40 / WIDTH, 28 / HEIGHT); paintVectorStrokesToContext(tCtx, l); tCtx.restore(); }
      if(l.layerMask?.enabled){tCtx.clearRect(0,0,40,28);tCtx.drawImage(createLayerComposite(l),0,0,40,28);}
      l.thumbDirty = false;
    }
    l.thumbCanvas.className = `ios-thumb-wrap ${l.alphaLock ? 'checker' : ''}`;

    const tags = [];
    if (l.clipMask) tags.push('↳ Clipped');
    if (l.alphaLock) tags.push('Alpha Lock');
    if(l.layerMask)tags.push(l.layerMask.enabled?'Mask':'Mask disabled');
    if (l.id === referenceLayerId) tags.push('★ Ref');
    if (l.opacity < 100) tags.push(`${l.opacity}%`);

    const txt = document.createElement('div');
    txt.className = 'ios-layer-text';
    txt.innerHTML = `<div class="ios-layer-name">${escapeMarkup(l.name)}</div>${tags.length ? `<div class="ios-layer-badges">${tags.join(' • ')}</div>` : ''}`;

    const nBtn = document.createElement('button');
    nBtn.type = 'button';
    nBtn.className = 'ios-n-trigger';
    nBtn.textContent = l.blend === 'normal' ? 'N' : l.blend.slice(0, 2).toUpperCase();
    nBtn.onclick = e => { e.stopPropagation(); openBlendDrawerLayerId = openBlendDrawerLayerId === l.id ? null : l.id; renderLayers(); };

    const vis = document.createElement('button');
    vis.type = 'button';
    vis.className = `ios-vis-check ${l.visible ? 'on' : ''}`;
    vis.innerHTML = '✓';
    vis.onclick = e => { e.stopPropagation(); saveFullStateUndo(); l.visible = !l.visible; syncLayers(); renderLayers(); markUnsavedChanges(); };

    const quick = document.createElement('div');quick.className='wc-layer-quick';
    const index=layers.findIndex(x=>x.id===l.id);
    [['↑',1,'Move layer up'],['↓',-1,'Move layer down'],['×',0,'Delete layer']].forEach(([glyph,delta,help])=>{
      const b=document.createElement('button');b.type='button';b.className='wc-layer-mini';b.textContent=glyph;
      b.title=help;b.setAttribute('aria-label',`${help}: ${l.name}`);
      b.disabled=delta===1?index>=layers.length-1:delta===-1?index<=0:layers.filter(x=>!x.isFolder).length<=1;
      b.onclick=e=>{e.stopPropagation();delta===0?deleteLayerDirect(l.id):moveLayerDirect(l.id,delta);};quick.appendChild(b);
    });
    if(l.layerMask){const badge=document.createElement('button');badge.type='button';badge.className='wc-mask-badge';badge.textContent='◐ Edit mask';badge.setAttribute('aria-label','Edit layer mask: '+l.name);badge.onclick=e=>{e.stopPropagation();WinCreate.selectLayer(l.id);WinCreate.layerMasks?.open();};txt.append(badge);}
    main.append(l.thumbCanvas, txt, quick, nBtn, vis);
    row.appendChild(main);

    if (openBlendDrawerLayerId === l.id) {
      const dr = document.createElement('div');
      dr.className = 'ios-blend-drawer open';
      dr.onclick = e => e.stopPropagation();
      dr.innerHTML = `<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-sub)"><span>Opacity</span><input type="range" min="5" max="100" value="${l.opacity}" style="flex:1;accent-color:var(--ios-blue)"></div><div class="ios-blend-pills"></div>`;
      let opacityUndoSaved=false;
      dr.querySelector('input').oninput = e => { if(!opacityUndoSaved){saveFullStateUndo();opacityUndoSaved=true;}l.opacity = +e.target.value; syncLayers(); markUnsavedChanges(); };
      dr.querySelector('input').onchange = renderLayers;
      const pills = dr.querySelector('.ios-blend-pills');
      ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge'].forEach(m => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = `blend-chip ${l.blend === m ? 'active' : ''}`;
        c.textContent = m;
        c.onclick = () => { saveFullStateUndo(); l.blend = m; syncLayers(); renderLayers(); markUnsavedChanges(); };
        pills.appendChild(c);
      });
      row.appendChild(dr);
    }

    row.onclick = e => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (selectedLayerIds.has(l.id)) selectedLayerIds.delete(l.id);
        else selectedLayerIds.add(l.id);
        activeLayerId = l.id;
        renderLayers();
        msg(`${selectedLayerIds.size} Layers Selected`);
        return;
      }
      selectedLayerIds.clear();
      selectedLayerIds.add(l.id);
      activeLayerId=l.id;
      layerMenuSheet.classList.remove('open');
      renderLayers();
    };
    list.appendChild(row);
  });

  const bgRow = document.createElement('div');
  bgRow.className = 'ios-layer-row';
  bgRow.innerHTML = `<div class="ios-layer-main"><input type="color" id="bgLiveColorPicker" value="${bgColor}" style="width:40px;height:28px;border:none;border-radius:5px;background:transparent;cursor:pointer"><div class="ios-layer-text"><div class="ios-layer-name">🔒 Background (paint locked)</div><div class="ios-layer-badges">Canvas colour · ${bgColor.toUpperCase()}</div></div><button type="button" class="blend-chip" id="bgSetCurrentColorBtn">Use Active</button><button type="button" class="ios-vis-check ${bgVisible ? 'on' : ''}">✓</button></div>`;
  const picker = bgRow.querySelector('#bgLiveColorPicker');
  picker.onclick = e => e.stopPropagation();
  picker.oninput = e => { e.stopPropagation(); setBgColor(e.target.value, true); };
  bgRow.querySelector('#bgSetCurrentColorBtn').onclick = e => { e.stopPropagation(); setBgColor(currentColor, true); };
  bgRow.querySelector('.ios-vis-check').onclick = e => { e.stopPropagation(); setBgColor(bgColor, !bgVisible); };
  list.appendChild(bgRow);
  window.WinCreate?.emit('layersRendered');
}

if ($('layerSearchInput')) $('layerSearchInput').oninput = renderLayers;
if ($('expandLayersPanelBtn')) {
  $('expandLayersPanelBtn').onclick = () => {
    const expanded = $('layersPopover')?.classList.toggle('expanded') || false;
    $('expandLayersPanelBtn').setAttribute('aria-pressed', String(expanded));
    $('expandLayersPanelBtn').setAttribute('aria-label', expanded ? 'Restore compact layers panel' : 'Expand layers panel');
    $('expandLayersPanelBtn').setAttribute('title', expanded ? 'Restore compact layers panel' : 'Expand layers panel');
  };
}
if ($('addFolderBtn')) {
  $('addFolderBtn').onclick = () => {
    saveFullStateUndo();
    const f = createFolderLayer();
    const cur = getActiveLayer();
    if (cur) cur.parentId = f.id;
    renderLayers();
    syncLayers();markUnsavedChanges();
    msg('Folder Created');
  };
}
if ($('groupLayersBtn')) {
  $('groupLayersBtn').onclick = () => {
    saveFullStateUndo();
    const f = createFolderLayer(`Group ${folderSeq++}`);
    const targets = selectedLayerIds.size > 0 ? Array.from(selectedLayerIds) : [activeLayerId];
    layers.forEach(l => {
      if (targets.includes(l.id) && !l.isFolder) l.parentId = f.id;
    });
    renderLayers();
    msg(`Grouped ${targets.length} Layer(s)`);
  };
}

function openLayerMenuSheet(l) {
  if (!l || l.isFolder) return;
  layerMenuSheet.style.display = '';
  layerMenuSheet.classList.add('open');
  $('mAlphaLock')?.classList.toggle('active', l.alphaLock);
  $('mClipMask')?.classList.toggle('active', l.clipMask);
  $('mReference')?.classList.toggle('active', referenceLayerId === l.id);
}

if ($('mRename')) $('mRename').onclick = () => { const l = getActiveLayer(); if (!l) return; layerMenuSheet.classList.remove('open'); openStudioPrompt('Rename Layer:', l.name, n => { if (n && n.trim()) { saveFullStateUndo(); l.name = n.trim(); renderLayers(); markUnsavedChanges(); } }); };
if ($('mMoveUp')) {
  $('mMoveUp').onclick = () => {
    const idx = layers.findIndex(x => x.id === activeLayerId);
    if (idx >= 0 && idx < layers.length - 1) {
      saveFullStateUndo(); markUnsavedChanges();
      const tmp = layers[idx]; layers[idx] = layers[idx + 1]; layers[idx + 1] = tmp;
      syncLayers(); renderLayers(); msg('Moved Layer Up');
    }
  };
}
if ($('mMoveDown')) {
  $('mMoveDown').onclick = () => {
    const idx = layers.findIndex(x => x.id === activeLayerId);
    if (idx > 0) {
      saveFullStateUndo(); markUnsavedChanges();
      const tmp = layers[idx]; layers[idx] = layers[idx - 1]; layers[idx - 1] = tmp;
      syncLayers(); renderLayers(); msg('Moved Layer Down');
    }
  };
}
if ($('mAlphaLock')) $('mAlphaLock').onclick = () => { const l = getActiveLayer(); if (!l) return; saveFullStateUndo(); markUnsavedChanges(); l.alphaLock = !l.alphaLock; renderLayers(); openLayerMenuSheet(l); msg(l.alphaLock ? 'Alpha Lock Enabled' : 'Alpha Lock Off'); };
if ($('mClipMask')) $('mClipMask').onclick = () => { const l = getActiveLayer(); if (!l) return; const idx = layers.findIndex(x => x.id === l.id); if (idx > 0) { saveFullStateUndo(); markUnsavedChanges(); l.clipMask = !l.clipMask; renderLayers(); openLayerMenuSheet(l); msg(l.clipMask ? 'Clipping Mask Enabled' : 'Clipping Mask Off'); } else msg('Move layer above another to clip'); };
if ($('mReference')) $('mReference').onclick = () => { const l = getActiveLayer(); if (!l) return; referenceLayerId = referenceLayerId === l.id ? null : l.id; renderLayers(); openLayerMenuSheet(l); msg(referenceLayerId ? 'Reference Layer Set' : 'Reference Off'); };
if ($('mFill')) {
  $('mFill').onclick = () => {
    const l = getActiveLayer(); if (!l) return; saveUndo();
    const patch=document.createElement('canvas');patch.width=WIDTH;patch.height=HEIGHT;const pc=patch.getContext('2d');
    if(window.WinCreate?.selectionPath)pc.clip(WinCreate.selectionPath);
    pc.fillStyle=currentColor;pc.fillRect(0,0,WIDTH,HEIGHT);
    if(l.alphaLock){pc.globalCompositeOperation='destination-in';pc.drawImage(createLayerComposite(l),0,0);}
    if(l.clipMask){const base=layers[layers.indexOf(l)-1];if(base&&!base.isFolder){pc.globalCompositeOperation='destination-in';pc.drawImage(createLayerComposite(base),0,0);}}
    appendPaintPatch(l,patch,0,0);
    l.thumbDirty = true; renderLayers(); layerMenuSheet.classList.remove('open'); markUnsavedChanges(); msg('Layer Filled');
  };
}
if ($('mClear')) {
  $('mClear').onclick = () => {
    const l = getActiveLayer(); if (!l) return; saveUndo();
    l.ctx.save();
    if (window.WinCreate?.selectionPath) l.ctx.clip(window.WinCreate.selectionPath);
    l.ctx.clearRect(0, 0, WIDTH, HEIGHT);
    l.ctx.restore();
    if (!window.WinCreate?.selectionPath) { l.vectorStrokes = []; renderVectorLayer(l); }
    else if(l.vectorStrokes?.length && window.WinCreate?.selectionPoints?.length){
      const erase={kind:'selection',points:structuredClone(WinCreate.selectionPoints),opacity:1,width:0};
      for(const st of l.vectorStrokes){st.erasures ||= [];st.erasures.push(structuredClone(erase));}renderVectorLayer(l);
    }

    l.thumbDirty = true; renderLayers(); layerMenuSheet.classList.remove('open'); markUnsavedChanges(); msg('Layer Cleared');
  };
}
if ($('mInvert')) {
  $('mInvert').onclick = () => {
    const l = getActiveLayer(); if (!l) return; saveUndo();
    for(const st of l.vectorStrokes||[]){if(st.kind==='raster'){const image=rasterCommandImage(st),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const cc=c.getContext('2d');cc.drawImage(image,0,0);const pixels=cc.getImageData(0,0,c.width,c.height);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=255-pixels.data[i];pixels.data[i+1]=255-pixels.data[i+1];pixels.data[i+2]=255-pixels.data[i+2];}cc.putImageData(pixels,0,0);st.pngData=c.toDataURL('image/png');RASTER_COMMAND_IMAGES.set(st.pngData,c);}else if(/^#[0-9a-f]{6}$/i.test(st.color)){st.color='#'+(0xffffff^parseInt(st.color.slice(1),16)).toString(16).padStart(6,'0');}}renderVectorLayer(l);
    const img = l.ctx.getImageData(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 0) { img.data[i] = 255 - img.data[i]; img.data[i + 1] = 255 - img.data[i + 1]; img.data[i + 2] = 255 - img.data[i + 2]; }
    l.ctx.putImageData(img, 0, 0); l.thumbDirty = true; renderLayers(); layerMenuSheet.classList.remove('open'); markUnsavedChanges(); msg('Layer Inverted');
  };
}
if ($('mDuplicate')) {
  $('mDuplicate').onclick = () => {
    saveFullStateUndo();
    const s = getActiveLayer(); if (!s) return;
    const d = createLayer(`${s.name} Copy`, { parentId: s.parentId });
    d.ctx.drawImage(s.canvas, 0, 0); d.vectorStrokes = structuredClone(s.vectorStrokes || []); renderVectorLayer(d); d.opacity = s.opacity;d.visible=s.visible;d.alphaLock=s.alphaLock;d.clipMask=s.clipMask; d.layerMask=structuredClone(s.layerMask||null); d.blend = s.blend; d.thumbDirty = true;
    syncLayers(); renderLayers(); layerMenuSheet.classList.remove('open'); markUnsavedChanges(); msg('Layer Duplicated');
  };
}
if ($('mMerge')) {
  $('mMerge').onclick = () => {
    const idx = layers.findIndex(x => x.id === activeLayerId);
    if (idx > 0 && !layers[idx - 1].isFolder) {
      const top=layers[idx],bot=layers[idx-1];
      if(top.blend!=='normal'||bot.blend!=='normal'||top.parentId!==bot.parentId){msg('Use Normal blending and the same folder before merging these layers');return;}
      saveFullStateUndo();
      if(top.opacity===100&&bot.opacity===100&&top.visible&&bot.visible&&!top.layerMask&&!bot.layerMask){
        if(top.rasterRevision>0)appendPaintPatch(bot,top.canvas,0,0);
        bot.vectorStrokes.push(...structuredClone(top.vectorStrokes||[]));renderVectorLayer(bot);
      }else{
        const merged=document.createElement('canvas');merged.width=WIDTH;merged.height=HEIGHT;const mc=merged.getContext('2d');
        for(const l of [bot,top])if(l.visible){mc.globalAlpha=l.opacity/100;mc.drawImage(createLayerComposite(l),0,0);}
        bot.ctx.clearRect(0,0,WIDTH,HEIGHT);bot.ctx.drawImage(merged,0,0);bot.vectorStrokes=[];bot.layerMask=null;bot.opacity=100;bot.visible=top.visible||bot.visible;renderVectorLayer(bot);
      }
      bot.thumbDirty = true;
      top.surface?.remove();top.canvas.remove();top.vectorSvg?.remove();layers.splice(idx, 1);activeLayerId=bot.id;
      syncLayers();renderLayers();layerMenuSheet.classList.remove('open');markUnsavedChanges();msg('Merged Down');
    } else msg('Cannot merge down into folder or bottom');
  };
}
if ($('mDelete')) {
  $('mDelete').onclick = () => {
    deleteLayerDirect(activeLayerId);
  };
}
if ($('addLayerBtn')) $('addLayerBtn').onclick = () => { saveFullStateUndo(); createLayer(); markUnsavedChanges(); msg('Layer Added'); };

// =========================================================================
// BRUSH ENGINE, FAVOURITES, SEARCH, ARTWORK BRUSH HISTORY & LIVE TEST PAD
// =========================================================================
function getAllBrushesFlat() {
  const map = new Map();
  Object.keys(BRUSHES).forEach(cat => {
    (BRUSHES[cat] || []).forEach(b => map.set(b.id, b));
  });
  return Array.from(map.values());
}

function applyBrushStabilisationSettings(br) {
  if (!br) return;
  const saved = brushSettingsMap[br.id] || {};
  const streamVal = saved.stream ?? br.stream ?? 35;
  const taperVal = saved.taper ?? br.taper ?? 20;
  if ($('streamRange')) $('streamRange').value = streamVal;
  if ($('taperRange')) $('taperRange').value = taperVal;
  if ($('favBrushBtn')) $('favBrushBtn').classList.toggle('active', favouriteBrushIds.has(br.id));
}

function saveCurrentBrushStabilisation() {
  const br = getCurrentBrush();
  if (!br) return;
  brushSettingsMap[br.id] = {
    stream: +($('streamRange')?.value || 35),
    taper: +($('taperRange')?.value || 20)
  };
  try { localStorage.setItem('wincreate_brush_settings_v1', JSON.stringify(brushSettingsMap)); } catch (_) {}
}

if ($('streamRange')) $('streamRange').onchange = saveCurrentBrushStabilisation;
if ($('taperRange')) $('taperRange').onchange = saveCurrentBrushStabilisation;

if ($('favBrushBtn')) {
  $('favBrushBtn').onclick = () => {
    const br = getCurrentBrush();
    if (!br) return;
    if (favouriteBrushIds.has(br.id)) favouriteBrushIds.delete(br.id);
    else favouriteBrushIds.add(br.id);
    try { localStorage.setItem('wincreate_fav_brushes_v1', JSON.stringify(Array.from(favouriteBrushIds))); } catch (_) {}
    $('favBrushBtn').classList.toggle('active', favouriteBrushIds.has(br.id));
    renderBrushLibrary();
    msg(favouriteBrushIds.has(br.id) ? `★ Added "${br.name}" to Favourites` : `Removed "${br.name}" from Favourites`);
  };
}

function recordBrushInArtworkHistory() {
  const br = getCurrentBrush();
  if (!br || currentTool !== 'brush') return;
  recentBrushIds = [br.id, ...recentBrushIds.filter(id => id !== br.id)].slice(0, 10);
  const entry = {
    brushId: br.id,
    brushName: br.name,
    color: currentColor,
    size: brushSize,
    opacity: brushOpacity,
    stream: +($('streamRange')?.value || 35),
    taper: +($('taperRange')?.value || 20)
  };
  artworkBrushHistory = [entry, ...artworkBrushHistory.filter(x => !(x.brushId === entry.brushId && x.color === entry.color))].slice(0, 12);
}

const MIN_BRUSH_SIZE = 0.25;
const MAX_BRUSH_SIZE = 1600;
function sizeToSlider(size) { return Math.log(Math.max(MIN_BRUSH_SIZE,Math.min(MAX_BRUSH_SIZE,size))/MIN_BRUSH_SIZE)/Math.log(MAX_BRUSH_SIZE/MIN_BRUSH_SIZE); }
function sliderToSize(r) { return MIN_BRUSH_SIZE*Math.pow(MAX_BRUSH_SIZE/MIN_BRUSH_SIZE,Math.max(0,Math.min(1,r))); }
function formatBrushSize(n) { return n < 10 ? (+n.toFixed(2)).toString() : n < 100 ? (+n.toFixed(1)).toString() : Math.round(n).toString(); }
function setBrushSize(next,{notify=false}={}) {
  const n=Number(next); if(!Number.isFinite(n)) return;
  brushSize = Math.max(MIN_BRUSH_SIZE,Math.min(MAX_BRUSH_SIZE,n));
  const el=$('sizeFill');if(el)el.style.height=`${(sizeToSlider(brushSize)*100).toFixed(2)}%`;
  const val=$('brushSizeInput');if(val && document.activeElement!==val)val.value=formatBrushSize(brushSize);
  const chip=$('sizeQuickLabel');if(chip)chip.textContent=`${formatBrushSize(brushSize)} px`;
  const ring=brushRing;
  if(ring) Object.assign(ring.style,{width:`${Math.min(brushSize*scale, 350)}px`,height:`${Math.min(brushSize*scale,350)}px`});
  try{localStorage.setItem('wincreate_brush_size_v35',String(brushSize));}catch(_){}
  if(SHAPE_EDITOR.active){SHAPE_EDITOR.strokeR=getStrokeMatchedRadius([]);renderActiveEditableShape();}
  if(notify)msg(`Brush ${formatBrushSize(brushSize)}px`);
}
try {const saved=Number(localStorage.getItem('wincreate_brush_size_v35')); if(saved>0&&Number.isFinite(saved))brushSize=Math.max(MIN_BRUSH_SIZE,Math.min(MAX_BRUSH_SIZE,saved));}catch(_){}
const BRUSH_PREVIEW_RANDOM = (i,seed=1) => {const v=Math.sin((i+1)*127.1+seed*311.7)*43758.5453;return v-Math.floor(v);};
function stampTip(ctx, id, x, y, r, color) {
  if (!Number.isFinite(r) || r <= 0) return;
  const tip = getBrushTip(id);
  ctx.save();
  const adjusted=WC65.brushStamp(id,x,y,r,color,ctx);x=adjusted.x;y=adjusted.y;r=adjusted.r;color=adjusted.color;
  if (ENGINE.smoothingMode === 'pixelated' || tip === 'pixel') {x=Math.round(x);y=Math.round(y);}
  if(CUSTOM_BRUSH_TIPS[id]){CUSTOM_BRUSH_TIPS[id](ctx,x,y,r,color);ctx.restore();return;}
  ctx.fillStyle=color;
  const circle=(cx,cy,rad)=>{ctx.beginPath();ctx.arc(cx,cy,Math.max(.15,rad),0,Math.PI*2);ctx.fill();};
  const gradient=(outer,inner,alpha=1)=>{
    const g=ctx.createRadialGradient(x,y,Math.max(.01,r*inner),x,y,Math.max(.02,r*outer));
    g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.globalAlpha=alpha;circle(x,y,r*outer);
  };
  if (tip==='air') gradient(1.6,.12,.2);
  else if(tip==='watercolor'){gradient(1.16,.12,.15);ctx.globalAlpha=.09;ctx.strokeStyle=color;ctx.lineWidth=Math.max(.25,r*.06);ctx.beginPath();ctx.arc(x,y,r*.91,0,Math.PI*2);ctx.stroke();}
  else if(tip==='neon') {ctx.shadowColor=color;ctx.shadowBlur=Math.min(35,r*.8);ctx.globalAlpha=.8;circle(x,y,r*.64);ctx.shadowBlur=0;ctx.globalAlpha=.9;circle(x,y,Math.max(.3,r*.21));}
  else if(tip==='chisel'||tip==='ribbon'){ctx.translate(x,y);ctx.rotate(-Math.PI/4);ctx.fillRect(-r,-r*(tip==='ribbon'?.20:.30),2*r,2*r*(tip==='ribbon'?.20:.30));}
  else if(tip==='pixel'){const s=Math.max(1,Math.round(2*r));ctx.fillRect(Math.round(x-s/2),Math.round(y-s/2),s,s);}
  else if(tip==='marker'){ctx.globalAlpha=.74;ctx.beginPath();ctx.ellipse(x,y,Math.max(.2,r),Math.max(.2,r*.68),-.28,0,Math.PI*2);ctx.fill();}
  else if(tip==='gouache'){ctx.globalAlpha=.8;circle(x,y,r*.95);}
  else if(tip==='bristle'||tip==='dry'){
    const count=Math.min(23,Math.max(5,Math.ceil(r*.35)));
    ctx.translate(x,y);ctx.rotate(-.5);ctx.globalAlpha=tip==='dry'?.56:.83;
    for(let i=0;i<count;i++){const q=(i+.5)/count*2-1;const jit=(BRUSH_PREVIEW_RANDOM(i,id.length)-.5)*r*.23;ctx.fillRect(-r*.83+jit,q*r*.9, r*(tip==='dry'?.85:1.5),Math.max(.3,r*1.7/count));}
  }
  else if(['graphite','grain','pastel','stipple','spray','splatter','halftone','foliage'].includes(tip)){
    // Deterministic per-dab marks keep preview strokes stable and avoid huge particle counts.
    const particle = Math.min(110,Math.max(7,Math.round(r*r*(tip==='spray'?.24:.12))));
    const key=(Math.round(x*7)*31+Math.round(y*7)*17+id.length*71)|0;
    ctx.globalAlpha=tip==='graphite'?.52:tip==='pastel'?.38:tip==='spray'?.44:.78;
    if(tip==='halftone'){
      const step=Math.max(1.25,r*.35);for(let dy=-r;dy<=r;dy+=step)for(let dx=-r;dx<=r;dx+=step){if(dx*dx+dy*dy<=r*r)circle(x+dx,y+dy,Math.max(.25,step*.21));}
    } else if(tip==='foliage'){
      const n=Math.max(3,Math.min(14,Math.round(r*.18)));
      for(let i=0;i<n;i++){const ang=BRUSH_PREVIEW_RANDOM(i,key)*Math.PI*2,ds=Math.sqrt(BRUSH_PREVIEW_RANDOM(i+91,key))*r*.87;ctx.beginPath();ctx.ellipse(x+Math.cos(ang)*ds,y+Math.sin(ang)*ds,Math.max(.6,r*.29),Math.max(.3,r*.11),ang,0,Math.PI*2);ctx.fill();}
    } else {
      for(let i=0;i<particle;i++){
        const a=BRUSH_PREVIEW_RANDOM(i,key)*Math.PI*2;
        const spread=tip==='splatter'?1.6:tip==='spray'?1.15:1;
        const dst=Math.sqrt(BRUSH_PREVIEW_RANDOM(i+123,key))*r*spread;
        const dot=tip==='splatter'?.4+BRUSH_PREVIEW_RANDOM(i+22,key)*r*.22:tip==='stipple'?Math.max(.4,r*.095):tip==='grain'?Math.max(.4,r*.065):Math.max(.2,r*.04);
        circle(x+Math.cos(a)*dst,y+Math.sin(a)*dst,dot);
      }
    }
  }
  else if (ENGINE.renderPipeline==='subpixel') gradient(1.15,.78,.85);
  else if(ENGINE.edgeFeather>.05 && ENGINE.smoothingMode!=='pixelated' && r>2)gradient(1,1-ENGINE.edgeFeather*.4,1);
  else circle(x,y,r);
  ctx.restore();
}

function renderBrushLibrary() {
  if (!$('blibSets') || !$('blibItems')) return;
  $('blibSets').innerHTML = '';
  $('blibItems').innerHTML = '';
  const activeB = getCurrentBrush();
  const query = ($('brushSearchInput')?.value || '').trim().toLowerCase();

  const virtualCats = ['★ Favourites', '🕒 Recent', '🎨 Artwork History', ...Object.keys(BRUSHES)];
  virtualCats.forEach(cat => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ios-menu-item ${cat === activeSet ? 'active' : ''}`;
    b.textContent = cat;
    b.onclick = () => { activeSet = cat; renderBrushLibrary(); };
    $('blibSets').appendChild(b);
  });

  if (activeSet === '🎨 Artwork History' && !query) {
    if (artworkBrushHistory.length === 0) {
      $('blibItems').innerHTML = `<div style="padding:18px;font-size:12px;color:var(--text-sub);text-align:center">Draw on the canvas to automatically record the brushes, sizes, colors, and stabilisation settings used in this artwork.</div>`;
      return;
    }
    artworkBrushHistory.forEach(item => {
      const card = document.createElement('div');
      card.className = `b-card ${item.brushId === activeB.id ? 'active' : ''}`;
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span style="margin:0"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${VALID_HEX.test(item.color) ? item.color : '#6366f1'};border:1px solid #fff"></span>${escapeMarkup(item.brushName)}</span><small style="font-size:10px;color:#a5b4fc">${item.size}px • ${item.opacity}% • S:${item.stream}%</small></div>`;
      card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-label',br.name);
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}};
    card.onclick = () => {
        const found = getAllBrushesFlat().find(x => x.id === item.brushId);
        if (found) {
          toolBrushes.brush = found;
          activateTool('brush');
          setBrushSize(item.size);
          brushOpacity = item.opacity;
          if ($('opacityFill')) $('opacityFill').style.height = `${brushOpacity}%`;
          if ($('streamRange')) $('streamRange').value = item.stream;
          if ($('taperRange')) $('taperRange').value = item.taper;
          setColor(item.color);
          renderBrushLibrary();
          msg(`Restored ${item.brushName} (${item.size}px)`);
        }
      };
      $('blibItems').appendChild(card);
    });
    return;
  }

  let listToRender = [];
  const allFlat = getAllBrushesFlat();
  if (query) {
    listToRender = allFlat.filter(b => b.name.toLowerCase().includes(query));
  } else if (activeSet === '★ Favourites') {
    listToRender = allFlat.filter(b => favouriteBrushIds.has(b.id));
  } else if (activeSet === '🕒 Recent') {
    listToRender = recentBrushIds.map(id => allFlat.find(b => b.id === id)).filter(Boolean);
  } else {
    listToRender = BRUSHES[activeSet] || [];
  }

  listToRender.forEach(br => {
    const card = document.createElement('div');
    card.className = `b-card ${br.id === activeB.id ? 'active' : ''}`;
    const cv = document.createElement('canvas');
    cv.width = 230; cv.height = 30;
    const cCtx = cv.getContext('2d');
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      stampTip(cCtx, br.id, 14 + t * 202, 15 + Math.sin(t * Math.PI * 2) * 5, Math.max(1, 5 * Math.sin(t * Math.PI)), '#a5b4fc');
    }
    const isFav = favouriteBrushIds.has(br.id);
    card.innerHTML = `<span style="justify-content:space-between"><span>${escapeMarkup(br.name)}</span><small style="color:${isFav ? '#fbbf24' : 'var(--text-sub)'}">${isFav ? '★' : ''}</small></span>`;
    card.appendChild(cv);
    card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-label',br.name);
    card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}};
    card.onclick = () => {
      selectToolBrush(['brush','smudge','eraser'].includes(currentTool)?currentTool:'brush',br);
      if(currentTool==='brush'&&!isVectorCompatibleBrush(br)&&ENGINE.renderPipeline==='vector')ENGINE.renderPipeline='stamp';
      syncStrokeStyleUI();
      applyBrushStabilisationSettings(br);
      renderBrushLibrary();
      rememberToolBrush();window.WinCreate?.emit('toolChange',{tool:currentTool});msg(br.name);
    };
    $('blibItems').appendChild(card);
  });
}

if ($('brushSearchInput')) $('brushSearchInput').oninput = renderBrushLibrary;
renderBrushLibrary();
applyBrushStabilisationSettings(getCurrentBrush());

// Live Brush Test Pad inside Brush Studio
(function initBrushTestPad() {
  const tc = $('brushTestCanvas');
  if (!tc) return;
  const tCtx = tc.getContext('2d');
  let testDown = false, tSmooth = { x: 0, y: 0 }, tLast = { x: 0, y: 0 };
  tc.addEventListener('pointerdown', e => {
    e.stopPropagation();
    testDown = true;
    tc.setPointerCapture(e.pointerId);
    const r = tc.getBoundingClientRect();
    tSmooth = { x: ((e.clientX - r.left) / r.width) * tc.width, y: ((e.clientY - r.top) / r.height) * tc.height };
    tLast = { ...tSmooth };
    stampTip(tCtx, getCurrentBrush().id, tSmooth.x, tSmooth.y, Math.min(14, Math.max(2, brushSize * 0.3)), currentColor);
  });
  tc.addEventListener('pointermove', e => {
    if (!testDown) return;
    e.stopPropagation();
    const r = tc.getBoundingClientRect();
    const ex = ((e.clientX - r.left) / r.width) * tc.width, ey = ((e.clientY - r.top) / r.height) * tc.height;
    const sf = 1 - (+($('streamRange')?.value || 35) / 100) * 0.75;
    tSmooth.x += (ex - tSmooth.x) * sf;
    tSmooth.y += (ey - tSmooth.y) * sf;
    const dist = Math.hypot(tSmooth.x - tLast.x, tSmooth.y - tLast.y);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      stampTip(tCtx, getCurrentBrush().id, tLast.x + (tSmooth.x - tLast.x) * u, tLast.y + (tSmooth.y - tLast.y) * u, Math.min(14, Math.max(2, brushSize * 0.3)), currentColor);
    }
    tLast = { ...tSmooth };
  });
  tc.addEventListener('pointerup', () => { testDown = false; });
  if ($('clearBrushTestBtn')) $('clearBrushTestBtn').onclick = () => tCtx.clearRect(0, 0, tc.width, tc.height);
})();

const TOOL_TARGET={mode:'auto'};let resolvedEditingHit=null;
const editingProbeCanvas=document.createElement('canvas');
const editingProbeCtx=editingProbeCanvas.getContext('2d',{willReadFrequently:true});
const TOOL_PARAMETERS={brush:null,eraser:{size:40,opacity:100},smudge:{size:72,opacity:100}};
const TOOL_BRUSH_MEMORY=Object.create(null);
function rememberToolBrush(persist=true){
  if(!['brush','smudge','eraser'].includes(currentTool))return;
  const br=getCurrentBrush(),key=currentTool+':'+br.id;delete TOOL_BRUSH_MEMORY[key];TOOL_BRUSH_MEMORY[key]={size:brushSize,opacity:brushOpacity};
  while(Object.keys(TOOL_BRUSH_MEMORY).length>256)delete TOOL_BRUSH_MEMORY[Object.keys(TOOL_BRUSH_MEMORY)[0]];
  if(persist)saveToolBrushMemory();
}
function saveToolBrushMemory(){
  try{localStorage.setItem('wincreate_tool_brushes_v1',JSON.stringify({settings:TOOL_BRUSH_MEMORY,selected:Object.fromEntries(Object.entries(toolBrushes).map(([tool,br])=>[tool,br.id]))}));}catch(_){}
}
function restoreBrushParameters(tool){
  const v=TOOL_BRUSH_MEMORY[tool+':'+toolBrushes[tool]?.id];if(!v)return;
  setBrushSize(v.size);brushOpacity=v.opacity;if($('opacityFill'))$('opacityFill').style.height=brushOpacity+'%';
}
function selectToolBrush(tool,br){
  if(!['brush','smudge','eraser'].includes(tool)||!br)return;
  if(isDrawing)finishPointerStroke();rememberToolBrush(false);
  toolBrushes[tool]=br;
  if(tool===currentTool){restoreBrushParameters(tool);applyBrushStabilisationSettings(br);}
  saveToolBrushMemory();window.WinCreate?.emit('toolChange',{tool:currentTool});
}
function matchPaintBrush(tool){
  if(!['smudge','eraser'].includes(tool))return;
  selectToolBrush(tool,toolBrushes.brush);activateTool(tool);closePops();renderBrushLibrary();
  msg((tool==='smudge'?'Smudge':'Eraser')+' • '+toolBrushes[tool].name);
}
window.addEventListener('DOMContentLoaded',()=>{
  try{const saved=JSON.parse(localStorage.getItem('wincreate_tool_brushes_v1')||'{}');
    for(const [key,v] of Object.entries(saved.settings||{}).slice(0,256)){
      if(!/^(brush|smudge|eraser):.{1,96}$/.test(key)||!v||!Number.isFinite(v.size)||!Number.isFinite(v.opacity)||v.size<.25||v.size>1600||v.opacity<0||v.opacity>100)continue;
      TOOL_BRUSH_MEMORY[key]={size:v.size,opacity:v.opacity};
    }
    for(const tool of ['brush','smudge','eraser']){const br=BRUSH_LOOKUP.get(saved.selected?.[tool]);if(br)toolBrushes[tool]=br;}
    restoreBrushParameters(currentTool);if(!isVectorCompatibleBrush(getCurrentBrush())&&ENGINE.renderPipeline==='vector')ENGINE.renderPipeline='stamp';syncStrokeStyleUI();
    const category=Object.keys(BRUSHES).find(cat=>BRUSHES[cat].some(br=>br.id===getCurrentBrush().id));if(category)activeSet=category;
    applyBrushStabilisationSettings(getCurrentBrush());renderBrushLibrary();WinCreate.emit('toolChange',{tool:currentTool});
  }catch(_){}
});
window.addEventListener('pagehide',()=>rememberToolBrush());
let toolMemoryTimer=0;
for(const event of ['input','change','click'])document.addEventListener(event,e=>{
  if(!e.target.closest?.('#studioBrushSize,#studioBrushRange,#studioOpacity,#brushSizeInput,#sizeTrack,#opacityTrack,[data-brush-size],[data-size]'))return;
  clearTimeout(toolMemoryTimer);toolMemoryTimer=setTimeout(()=>rememberToolBrush(),100);
});
// Auto editing locks to the first visible ink reached by this gesture. The
// selected-layer option deliberately bypasses this hit test.
function resolveEditingLayer(x,y,from=null){
  resolvedEditingHit=null;
  const active=getActiveLayer();
  if(!['eraser','smudge'].includes(currentTool)||TOOL_TARGET.mode==='active')return active;
  const r=Math.max(2,brushSize/2),distance=from?Math.hypot(x-from.x,y-from.y):0;
  const steps=Math.max(1,Math.ceil(distance/Math.max(2,r/2)));
  let target=null,firstHit=Infinity;
  for(const l of [...layers].reverse()){
    if(l.isFolder||!isLayerEffectivelyVisible(l)||getEffectiveLayerOpacity(l)<=0)continue;
    if(!l.vectorStrokes?.length&&l.rasterRevision===0)continue;
    const hasVectors=!!l.vectorStrokes?.length||!!l.layerMask?.enabled,ctx=hasVectors?editingProbeCtx:l.ctx;
    const useLive=!hasVectors&&l._livePixels&&l._livePixelsRev===l.rasterRevision&&l._livePixels.width===WIDTH&&l._livePixels.height===HEIGHT;
    for(let step=0;step<=steps&&step<firstHit;step++){
      const t=step/steps,cx=from?from.x+(x-from.x)*t:x,cy=from?from.y+(y-from.y)*t:y;
      const x0=Math.max(0,Math.floor(cx-r)),y0=Math.max(0,Math.floor(cy-r));
      const w=Math.min(WIDTH,Math.ceil(cx+r+1))-x0,h=Math.min(HEIGHT,Math.ceil(cy+r+1))-y0;
      if(w<1||h<1)continue;
      if(useLive){
        const liveData=l._livePixels.data,x1=x0+w,y1=y0+h;
        let hit=false;
        for(let py=y0;py<y1&&!hit;py++){
          const dy=(py+.5)-cy,dy2=dy*dy,row=py*WIDTH;
          for(let px=x0;px<x1;px++){
            if(liveData[(row+px)*4+3]>0){const dx=(px+.5)-cx;if(dx*dx+dy2<=r*r){hit=true;break;}}
          }
        }
        if(hit){target=l;firstHit=step;resolvedEditingHit={x:cx,y:cy};break;}
        continue;
      }
      if(hasVectors){if(editingProbeCanvas.width!==w||editingProbeCanvas.height!==h){editingProbeCanvas.width=w;editingProbeCanvas.height=h;}else ctx.clearRect(0,0,w,h);paintLayerRegion(ctx,l,x0,y0,w,h);WCLayerMasks.applyRegion(ctx,l,x0,y0,w,h);}
      const data=ctx.getImageData(hasVectors?0:x0,hasVectors?0:y0,w,h).data;
      let hit=false;
      for(let i=3;i<data.length;i+=4){if(data[i]>0){const px=x0+((i-3)/4)%w+.5,py=y0+Math.floor((i-3)/4/w)+.5;if((px-cx)**2+(py-cy)**2<=r*r){hit=true;break;}}}
      if(hit){target=l;firstHit=step;resolvedEditingHit={x:cx,y:cy};break;}
    }
    if(firstHit===0)break;
  }
  if(target&&target.id!==activeLayerId){
    activeLayerId=target.id;selectedLayerIds.clear();selectedLayerIds.add(target.id);renderLayers();
    window.WinCreate?.emit('editingLayerChange',{layer:target});
    msg(`${currentTool==='eraser'?'Erasing':'Smudging'} ${target.name}`);
  }
  return target;
}
function acquirePendingEditingLayer(pt){
  if(!editingTargetPending)return true;
  const l=resolveEditingLayer(pt.x,pt.y,lastRawPt);
  if(!l)return false;
  // Capture the actual target before its first mutation, so undo never records
  // the empty layer on which a gesture happened to start.
  strokeUndoRecord=currentTool==='smudge'?null:saveUndo();editingTargetPending=false;
  if(currentTool==='smudge'){const hit=resolvedEditingHit||pt;beginWetSmudge(l,hit.x,hit.y);smoothPt={x:hit.x,y:hit.y};}
  return true;
}
function activateTool(tool) {
  if(isDrawing)finishPointerStroke();
  if(tool!==currentTool)rememberToolBrush();
  if(tool!==currentTool&&TOOL_PARAMETERS[currentTool]!==undefined)TOOL_PARAMETERS[currentTool]={size:brushSize,opacity:brushOpacity};
  if(tool!==currentTool&&TOOL_PARAMETERS[tool]){setBrushSize(TOOL_PARAMETERS[tool].size);brushOpacity=TOOL_PARAMETERS[tool].opacity;if($('opacityFill'))$('opacityFill').style.height=brushOpacity+'%';}
  if (SHAPE_EDITOR.active) {commitEditableShape();return;}
  const switched=tool!==currentTool;currentTool = tool;
  if(switched)restoreBrushParameters(tool);
  ['brushBtn', 'smudgeBtn', 'eraserBtn', 'transformToolBtn'].forEach(id => $(id)?.classList.remove('active'));
  $(tool === 'transform' ? 'transformToolBtn' : tool + 'Btn')?.classList.add('active');
  applyBrushStabilisationSettings(getCurrentBrush());
  if ($('opacityTrack')) $('opacityTrack').title = tool === 'smudge' ? 'Smudge Strength (drag up/down)' : 'Brush Opacity';
  if ($('sizeTrack')) $('sizeTrack').title = tool === 'smudge' ? 'Smudge Brush Size (drag up/down)' : 'Brush Radius';
  window.WinCreate?.emit('toolChange',{tool});
}
['brush', 'smudge', 'eraser'].forEach(t => {
  if ($(t + 'Btn')) {
    const toolButton=$(t+'Btn');let fingerTap=null,suppressNativeClickUntil=0;
    toolButton.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){penInRangeUntil=0;fingerTap={id:e.pointerId,x:e.clientX,y:e.clientY};}});
    toolButton.addEventListener('pointercancel',()=>fingerTap=null);
    toolButton.addEventListener('pointerup',e=>{
      if(e.pointerType!=='touch'||fingerTap?.id!==e.pointerId)return;
      const tap=fingerTap;fingerTap=null;
      if(Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>10)return;
      // WebViews may delay or omit compatibility clicks after canvas drags.
      // Select on a real finger tap; suppress only its later trusted click.
      e.preventDefault();suppressNativeClickUntil=performance.now()+650;toolButton.click();
    });
    toolButton.addEventListener('click',e=>{if(e.isTrusted&&(e.pointerType==='touch'||e.sourceCapabilities?.firesTouchEvents)&&performance.now()<suppressNativeClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    $(t + 'Btn').onclick = () => {
      const compact=innerWidth<=900||(/Android/i.test(navigator.userAgent)&&innerWidth<=1200);
      const inspectorOpen=compact&&(document.body.classList.contains('studio-inspector-open')||document.body.classList.contains('wc-anim-inspector-open'));
      if(compact){document.body.classList.remove('studio-inspector-open','wc-anim-inspector-open');$('wcAnimLayers')?.setAttribute('aria-expanded','false');}
      if (currentTool === t && !window.WinCreate?.editingMode && !inspectorOpen) {
        $('brushLibTitle').textContent = `⋮⋮ ${t.charAt(0).toUpperCase() + t.slice(1)} Studio`;
        renderBrushLibrary();
        togglePop('brush');
      } else {
        activateTool(t);
        closePops();
        msg(toolBrushes[t].name);
      }
    };
  }
});
if ($('transformToolBtn')) $('transformToolBtn').onclick = () => { activateTool(currentTool === 'transform' ? 'brush' : 'transform'); closePops(); msg(currentTool === 'transform' ? 'Move Layer Tool' : 'Brush Tool'); };

function bindSlider(trId, flId, cb) {
  const tr = $(trId), fl = $(flId);
  if (!tr || !fl) return;
  let down = false;
  const move = e => {
    const rect = tr.getBoundingClientRect(), r = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    fl.style.height = `${Math.round(r * 100)}%`;
    cb(r);
  };
  tr.addEventListener('pointerdown', e => { e.stopPropagation(); down = true; tr.setPointerCapture(e.pointerId); move(e); });
  tr.addEventListener('pointermove', e => { if (down) move(e); });
  tr.addEventListener('pointerup', () => { down = false; brushRing.style.display = 'none'; });
}
bindSlider('sizeTrack', 'sizeFill', r => { setBrushSize(sliderToSize(r)); brushRing.style.display='block'; });
if($('brushSizeInput')){
  const input=$('brushSizeInput');
  const apply=()=>{const n=Number(input.value);if(!Number.isFinite(n)||n<MIN_BRUSH_SIZE){input.value=formatBrushSize(brushSize);return;}setBrushSize(n,{notify:true});};
  input.addEventListener('change',apply);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){apply();input.blur();}});
}
document.querySelectorAll('[data-brush-size]').forEach(btn=>btn.addEventListener('click',()=>{
  setBrushSize(Number(btn.dataset.brushSize),{notify:true});
  document.querySelectorAll('[data-brush-size]').forEach(b=>b.classList.toggle('active',Math.abs(Number(b.dataset.brushSize)-brushSize)<.01));
}));
setBrushSize(brushSize);
$('sizeQuickLabel')?.addEventListener('click',()=>{const input=$('brushSizeInput'); if($('brushPopover') && !$('brushPopover').classList.contains('open'))togglePop('brush');if(input){input.focus();input.select();}});

bindSlider('opacityTrack', 'opacityFill', r => { brushOpacity = Math.round(r * 100); Object.assign(brushRing.style, { display: 'block', width: `${brushSize}px`, height: `${brushSize}px`, opacity: r }); scratchCanvas.style.opacity = r * getCurrentBrush().alpha; msg(`Opacity ${brushOpacity}%`); });

function renderSwatches() {
  if (!$('swatchGrid')) return;
  $('swatchGrid').innerHTML = '';
  swatches.forEach(hex => {
    const d = document.createElement('div');
    d.className = 'swatch-dot';
    d.style.background = hex;
    d.onclick = () => setColor(hex);
    $('swatchGrid').appendChild(d);
  });
}
renderSwatches();

function setColor(hex) {
  currentColor = hex;
  if ($('colorDot')) $('colorDot').style.background = hex;
  if ($('customHexInput')) $('customHexInput').value = hex.replace('#', '').toUpperCase();
  if (SHAPE_EDITOR.active) renderActiveEditableShape();
  if (window.WinCreate) WinCreate.emit('colorChange', hex);
}
setColor(currentColor);
if ($('customHexInput')) $('customHexInput').oninput = e => { const c = e.target.value.replace(/[^0-9a-fA-F]/g, ''); if (c.length === 6) setColor('#' + c); };
if ($('addSwatchBtn')) $('addSwatchBtn').onclick = () => { swatches.unshift(currentColor); if (swatches.length > 14) swatches.pop(); renderSwatches(); msg('Swatch Saved'); };
if ($('setCanvasBgFromColorBtn')) $('setCanvasBgFromColorBtn').onclick = () => { setBgColor(currentColor, true); msg('Canvas Backdrop Updated'); };

function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const wheelCanvas = $('colorWheelCanvas'), wheelCtx = wheelCanvas?.getContext('2d');
function drawWheel() {
  if (!wheelCanvas || !wheelCtx) return;
  const r = wheelCanvas.width / 2, v = $('valSlider').value;
  for (let a = 0; a < 360; a++) {
    wheelCtx.beginPath(); wheelCtx.moveTo(r, r); wheelCtx.arc(r, r, r, (a - 1) * Math.PI / 180, (a + 1) * Math.PI / 180); wheelCtx.closePath();
    const g = wheelCtx.createRadialGradient(r, r, 0, r, r, r); g.addColorStop(0, `hsl(${a},10%,${v}%)`); g.addColorStop(1, `hsl(${a},100%,${v}%)`); wheelCtx.fillStyle = g; wheelCtx.fill();
  }
}
drawWheel();
let wheelDown = false;
function pickWheel(e) {
  const rect = wheelCanvas.getBoundingClientRect(), c = rect.width / 2, dx = e.clientX - rect.left - c, dy = e.clientY - rect.top - c;
  let deg = Math.atan2(dy, dx) * (180 / Math.PI); if (deg < 0) deg += 360;
  curH = Math.round(deg); curS = Math.round((Math.min(c, Math.hypot(dx, dy)) / c) * 100);
  setColor(hslToHex(curH, curS, +$('valSlider').value));
}
if (wheelCanvas) wheelCanvas.addEventListener('pointerdown', e => { wheelDown = true; pickWheel(e); });
window.addEventListener('pointermove', e => { if (wheelDown) pickWheel(e); });
window.addEventListener('pointerup', () => wheelDown = false);
if ($('valSlider')) $('valSlider').oninput = () => { drawWheel(); setColor(hslToHex(curH, curS, +$('valSlider').value)); };

// =========================================================================
// SMART GAP-CLOSING COLORDROP & PRECISION DROP-TO-FILL
// =========================================================================
let draggingDrop = false, dropMoved = false, dropStartX = 0, dropStartY = 0;
let fillRevealState = null;
let dropPointerId = null;

function isCanvasPointInside(pt) {
  return !!pt && pt.x >= 0 && pt.x < WIDTH && pt.y >= 0 && pt.y < HEIGHT;
}

function updateDropTarget(e) {
  const ghost = $('dropGhost');
  if (!ghost) return null;
  const pt = getCanvasPoint(e);
  const inside = isCanvasPointInside(pt);
  ghost.classList.toggle('over-canvas', inside);
  ghost.classList.toggle('outside-canvas', !inside);
  ghost.style.setProperty('--drop-color', currentColor);
  ghost.style.background = currentColor;
  ghost.style.left = '0px'; ghost.style.top = '0px';
  ghost.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0) translate(-50%,-50%)`;
  ghost.style.display = 'block';
  return inside ? pt : null;
}

if ($('colorDot')) {
  $('colorDot').addEventListener('pointerdown', e => {
    if(draggingDrop || (e.button!==undefined && e.button!==0))return;
    e.preventDefault();
    e.stopPropagation();
    dropPointerId=e.pointerId;
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
    draggingDrop = true;
    dropMoved = false;
    dropStartX = e.clientX;
    dropStartY = e.clientY;
    $('colorDot').classList.add('color-drop-active');
    const ghost = $('dropGhost');
    if (ghost) {
      ghost.style.setProperty('--drop-color', currentColor);
      ghost.style.background = currentColor;
    }
  });
}

window.addEventListener('pointermove', e => {
  if (!draggingDrop || e.pointerId!==dropPointerId) return;
  if (!dropMoved && Math.hypot(e.clientX - dropStartX, e.clientY - dropStartY) > 7) {
    dropMoved = true;
  }
  if (dropMoved) updateDropTarget(e);
});

window.addEventListener('pointerup', e => {
  if (!draggingDrop || e.pointerId!==dropPointerId) return;
  draggingDrop = false; dropPointerId=null;
  $('colorDot')?.classList.remove('color-drop-active');
  const ghost = $('dropGhost');

  if (!dropMoved) {
    if (ghost) ghost.style.display = 'none';
    togglePop('color');
    return;
  }

  const pt = updateDropTarget(e);
  if (!pt) {
    if (ghost) {
      ghost.classList.add('drop-cancelled');
      setTimeout(() => { ghost.style.display = 'none'; ghost.classList.remove('drop-cancelled'); }, 140);
    }
    return;
  }

  if (fillBusy) { if (ghost) ghost.style.display='none'; return; }
  saveUndo();
  if (ghost) ghost.classList.add('drop-committing');
  floodFill(Math.floor(pt.x), Math.floor(pt.y), currentColor, { animate: true }).then(changed => {
    if (ghost) {
      ghost.classList.remove('drop-committing');
      ghost.style.display = 'none';
    }
    if (!changed) return;
    const tl = getActiveLayer();
    if (tl) tl.thumbDirty = true;
    renderLayers();
    markUnsavedChanges();
    msg('ColorDrop Filled');
  });
});

// Smart edge fill. Boundary segmentation is separate from visible pixels:
// this lets fills extend behind antialiased ink without deleting the ink.
let fillBusy = false;
const fillPreview = document.createElement('canvas');
fillPreview.id = 'fillAnimationCanvas';
fillPreview.style.cssText = 'position:absolute;inset:0;z-index:949;pointer-events:none;display:none';
board.insertBefore(fillPreview, scratchCanvas);
const fillPreviewCtx = create2DContext(fillPreview, false);
function ensureFillPreviewSize() {
  const limit=document.body.classList.contains('device-phone')?1024:1600;
  const ratio=Math.min(1,limit/Math.max(WIDTH,HEIGHT));
  const w=Math.max(1,Math.round(WIDTH*ratio)),h=Math.max(1,Math.round(HEIGHT*ratio));
  if(fillPreview.width!==w||fillPreview.height!==h){fillPreview.width=w;fillPreview.height=h;}
}
function finishFillReveal() {
  if(!fillRevealState)return;
  cancelAnimationFrame(fillRevealState.frame);
  fillRevealState.layer.canvas.style.visibility=fillRevealState.visibility;
  fillPreview.style.display='none';
  fillPreviewCtx.clearRect(0,0,fillPreview.width,fillPreview.height);
  fillRevealState=null;
}
window.addEventListener('pointerdown',finishFillReveal,true);
window.addEventListener('keydown',finishFillReveal,true);
window.addEventListener('pointercancel',e=>{
  if(e.pointerId===dropPointerId){draggingDrop=false;dropPointerId=null;$('dropGhost').style.display='none';$('colorDot')?.classList.remove('color-drop-active');}
  finishFillReveal();
});
window.addEventListener('blur',()=>{draggingDrop=false;dropPointerId=null;$('dropGhost').style.display='none';$('colorDot')?.classList.remove('color-drop-active');finishFillReveal();});

function buildFloodFillResult(sx, sy, hex) {
  sx = Math.max(0, Math.min(WIDTH - 1, sx | 0));
  sy = Math.max(0, Math.min(HEIGHT - 1, sy | 0));
  const tl = getActiveLayer(); if (!tl || tl.isFolder) return null;
  const rl = layers.find(l => l.id === referenceLayerId && !l.isFolder) || tl;
  const ref = getLayerReferencePixels(rl);
  const out = tl.ctx.getImageData(0, 0, WIDTH, HEIGHT), data = out.data;
  const tol = Math.max(0, Math.min(255, ENGINE.floodTolerance));
  const rgb = parseInt(hex.slice(1), 16), fr=(rgb >> 16)&255, fg=(rgb >> 8)&255, fb=rgb&255;
  const total = WIDTH * HEIGHT, seed = sy * WIDTH + sx, k=seed*4;
  const sr=ref[k], sg=ref[k+1], sb=ref[k+2], sa=ref[k+3];
  const dist = i => Math.abs(ref[i]-sr) + Math.abs(ref[i+1]-sg) + Math.abs(ref[i+2]-sb) + Math.abs(ref[i+3]-sa);
  // A low-tolerance seed on a line should not flood the entire outside.
  if (data[k]===fr && data[k+1]===fg && data[k+2]===fb && data[k+3]===255 && rl === tl) return null;
  const boundary = new Uint8Array(total);
  let boundaryCount=0, bx0=WIDTH,by0=HEIGHT,bx1=0,by1=0;
  for (let p=0,i=0;p<total;p++,i+=4) if (dist(i) > tol) {
    boundary[p]=1;boundaryCount++;
    const x=p%WIDTH,y=(p-x)/WIDTH;
    if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y;
  }
  // Bridge discontinuities in lineart across all angles without thickening the outline.
  const gap = Math.min(32, Math.max(0, Math.round(ENGINE.fillGap ?? 3)));
  const closedBoundary = new Uint8Array(boundary);
  if (gap && boundaryCount) {
    const nearSeed = (px, py) => Math.abs(px - sx) <= 2 && Math.abs(py - sy) <= 2;
    const localSeen = new Int32Array(total);
    const localQueue = new Int32Array(8192);
    let localTag = 1;
    const areLocallyConnected = (x0, y0, x1, y1) => {
      const pad = 6;
      const lx0 = Math.max(0, Math.min(x0, x1) - pad), lx1 = Math.min(WIDTH - 1, Math.max(x0, x1) + pad);
      const ly0 = Math.max(0, Math.min(y0, y1) - pad), ly1 = Math.min(HEIGHT - 1, Math.max(y0, y1) + pad);
      const start = y0 * WIDTH + x0, goal = y1 * WIDTH + x1;
      if (start === goal) return true;
      const tag = ++localTag;
      localSeen[start] = tag;
      localQueue[0] = start;
      let head = 0, tail = 1;
      while (head < tail && tail < 8192) {
        const cur = localQueue[head++];
        if (cur === goal) return true;
        const cx = cur % WIDTH, cy = (cur - cx) / WIDTH;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < ly0 || ny > ly1) continue;
          const row = ny * WIDTH;
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            if (nx < lx0 || nx > lx1) continue;
            const q = row + nx;
            if (localSeen[q] !== tag && closedBoundary[q]) {
              if (q === goal) return true;
              localSeen[q] = tag;
              localQueue[tail++] = q;
            }
          }
        }
      }
      return false;
    };
    const drawBridge = (x0, y0, x1, y1) => {
      const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
      if (nearSeed(mx, my) || areLocallyConnected(x0, y0, x1, y1)) return;
      let cx = x0, cy = y0;
      const dx = Math.abs(x1 - x0), sxStep = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0), syStep = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      while (true) {
        if (!nearSeed(cx, cy)) {
          const idx = cy * WIDTH + cx;
          closedBoundary[idx] = 1;
          if (cx + 1 < WIDTH && !nearSeed(cx + 1, cy)) closedBoundary[idx + 1] = 1;
        }
        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; cx += sxStep; }
        if (e2 <= dx) { err += dx; cy += syStep; }
      }
    };
    const dirs = [
      [1,0],[0,1],[1,1],[1,-1],
      [2,1],[1,2],[2,-1],[1,-2],
      [3,1],[1,3],[3,-1],[1,-3],
      [3,2],[2,3],[3,-2],[2,-3]
    ];
    const tips = [];
    for (let y = by0; y <= by1; y++) {
      const row = y * WIDTH;
      for (let x = bx0; x <= bx1; x++) {
        const p = row + x;
        if (!boundary[p]) continue;
        const n4 = (x > 0 ? boundary[p - 1] : 1) + (x + 1 < WIDTH ? boundary[p + 1] : 1) +
                   (y > 0 ? boundary[p - WIDTH] : 1) + (y + 1 < HEIGHT ? boundary[p + WIDTH] : 1);
        if (n4 === 4) continue;
        if (n4 <= 2) tips.push(p);
        for (let d = 0; d < dirs.length; d++) {
          const dx = dirs[d][0], dy = dirs[d][1];
          const fx = x + dx, fy = y + dy;
          if (fx < 0 || fx >= WIDTH || fy < 0 || fy >= HEIGHT || boundary[fy * WIDTH + fx]) continue;
          const stepLen = Math.hypot(dx, dy);
          const maxSteps = Math.ceil((gap + 1) / stepLen);
          for (let j = 2; j <= maxSteps; j++) {
            if (j * stepLen > gap + 1.35) break;
            const nx = x + dx * j, ny = y + dy * j;
            if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) break;
            if (!boundary[ny * WIDTH + nx]) continue;
            drawBridge(x, y, nx, ny);
            break;
          }
        }
      }
    }
    if (tips.length > 1 && tips.length <= 24000) {
      const cell = Math.max(4, gap + 1);
      const gridW = Math.ceil(WIDTH / cell);
      const buckets = new Map();
      for (let i = 0; i < tips.length; i++) {
        const p = tips[i], tx = p % WIDTH, ty = (p - tx) / WIDTH;
        const key = ((ty / cell) | 0) * gridW + ((tx / cell) | 0);
        let list = buckets.get(key);
        if (!list) { list = []; buckets.set(key, list); }
        list.push(p);
      }
      const maxDist2 = (gap + 1.25) * (gap + 1.25);
      for (let i = 0; i < tips.length; i++) {
        const p = tips[i], tx = p % WIDTH, ty = (p - tx) / WIDTH;
        const gx = (tx / cell) | 0, gy = (ty / cell) | 0;
        for (let cy = gy - 1; cy <= gy + 1; cy++) {
          if (cy < 0) continue;
          for (let cx = gx - 1; cx <= gx + 1; cx++) {
            if (cx < 0) continue;
            const list = buckets.get(cy * gridW + cx);
            if (!list) continue;
            for (let k = 0; k < list.length; k++) {
              const q = list[k];
              if (q <= p) continue;
              const qx = q % WIDTH, qy = (q - qx) / WIDTH;
              const d2 = (qx - tx) * (qx - tx) + (qy - ty) * (qy - ty);
              if (d2 < 4 || d2 > maxDist2) continue;
              const mx = (tx + qx) >> 1, my = (ty + qy) >> 1;
              if (!boundary[my * WIDTH + mx]) drawBridge(tx, ty, qx, qy);
            }
          }
        }
      }
    }
  }
  const filled = new Uint8Array(total);
  const stack=[seed];
  let minX=WIDTH,minY=HEIGHT,maxX=-1,maxY=-1,count=0,touchedBorder=false;
  while(stack.length) {
    const p=stack.pop(), y=Math.floor(p/WIDTH), x=p-y*WIDTH;
    if(closedBoundary[p]||filled[p])continue;
    let left=x,right=x;
    while(left>0&&!closedBoundary[y*WIDTH+left-1]&&!filled[y*WIDTH+left-1])left--;
    while(right<WIDTH-1&&!closedBoundary[y*WIDTH+right+1]&&!filled[y*WIDTH+right+1])right++;
    for(let xx=left;xx<=right;xx++)filled[y*WIDTH+xx]=1;
    count+=right-left+1;
    if(y===0||y===HEIGHT-1||left===0||right===WIDTH-1)touchedBorder=true;
    minX=Math.min(minX,left);maxX=Math.max(maxX,right);
    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    for(const ny of [y-1,y+1]) {
      if(ny<0||ny>=HEIGHT)continue;
      let run=false;
      for(let xx=left;xx<=right;xx++) {
        const q=ny*WIDTH+xx,ok=!closedBoundary[q]&&!filled[q];
        if(ok&&!run){stack.push(q);run=true;}
        else if(!ok)run=false;
      }
    }
  }
  if(!count)return null;
  const seededInsideInk=boundaryCount>60 && sx>bx0+5 && sy>by0+5 && sx<bx1-5 && sy<by1-5;
  if(seededInsideInk && touchedBorder && count>total*.60) {
    msg('Open outline detected • try increasing Close Line Gaps');
    return null;
  }
  const expand=Math.min(12,Math.max(1,Math.round(ENGINE.fillExpand ?? 3)));
  const underInk=rl===tl && sa<220;
  const grown=new Uint8Array(filled);
  let contrast=0;
  for(let y=Math.max(0,minY-1);y<=Math.min(HEIGHT-1,maxY+1);y++) {
    for(let x=Math.max(0,minX-1);x<=Math.min(WIDTH-1,maxX+1);x++) {
      const p=y*WIDTH+x;
      if(!boundary[p])continue;
      if((x>0&&filled[p-1])||(x+1<WIDTH&&filled[p+1])||(y>0&&filled[p-WIDTH])||(y+1<HEIGHT&&filled[p+WIDTH])) {
        contrast=Math.max(contrast,dist(p*4));
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) for(let j=1;j<=6;j++) {
          const nx=x+dx*j,ny=y+dy*j;
          if(nx<0||ny<0||nx>=WIDTH||ny>=HEIGHT)break;
          const q=ny*WIDTH+nx;
          if(!boundary[q])break;
          contrast=Math.max(contrast,dist(q*4));
        }
      }
    }
  }
  contrast=Math.max(120,contrast);
  let frontier=[];
  const edgeCandidates=new Set();
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    const p=y*WIDTH+x;
    if(!filled[p])continue;
    if(x>0&&boundary[p-1]||x+1<WIDTH&&boundary[p+1]||y>0&&boundary[p-WIDTH]||y+1<HEIGHT&&boundary[p+WIDTH]){
      frontier.push(p);
      if(x>0&&boundary[p-1])edgeCandidates.add(p-1);
      if(x+1<WIDTH&&boundary[p+1])edgeCandidates.add(p+1);
      if(y>0&&boundary[p-WIDTH])edgeCandidates.add(p-WIDTH);
      if(y+1<HEIGHT&&boundary[p+WIDTH])edgeCandidates.add(p+WIDTH);
    }
  }
  for(let step=0;step<expand&&frontier.length;step++) {
    const next=[];
    for(const p of frontier) {
      const x=p%WIDTH,y=(p-x)/WIDTH;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=WIDTH||ny<0||ny>=HEIGHT)continue;
        const q=ny*WIDTH+nx;
        if(grown[q])continue;
        if(closedBoundary[q]&&!boundary[q])continue;
        if(boundary[q])edgeCandidates.add(q);
        const cd=dist(q*4);
        const coverage=Math.min(1,cd/contrast);
        if(rl===tl && (underInk ? ref[q*4+3]===255 : coverage>=1))continue;
        if(underInk){
          const edgeAlpha=ref[q*4+3], fromAlpha=ref[p*4+3];
          if(!edgeAlpha || (boundary[p] && boundary[q] && fromAlpha>=32 && edgeAlpha+8<fromAlpha))continue;
        }
        grown[q]=1;
        if(underInk ? ref[q*4+3]<255 : coverage<.985)next.push(q);
        minX=Math.min(minX,nx);maxX=Math.max(maxX,nx);
        minY=Math.min(minY,ny);maxY=Math.max(maxY,ny);
      }
    }
    frontier=next;
  }
  for(let pass=0;pass<2;pass++){
    for(const p of edgeCandidates){
      if(grown[p]||(closedBoundary[p]&&!boundary[p]))continue;
      if(underInk ? ref[p*4+3]===255 : Math.min(1,dist(p*4)/contrast)>=.985)continue;
      const x=p%WIDTH,y=(p-x)/WIDTH;
      if(x<1||y<1||x>=WIDTH-1||y>=HEIGHT-1)continue;
      let neighbors=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(dx||dy)neighbors+=grown[p+dy*WIDTH+dx];
      }
      if(neighbors<5)continue;
      grown[p]=1;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
  }
  const ox=minX,oy=minY,w=maxX-minX+1,h=maxY-minY+1;
  const patch=document.createElement('canvas');patch.width=w;patch.height=h;
  const ctx=create2DContext(patch,false),image=ctx.createImageData(w,h),pd=image.data;
  let changed=0;
  for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
    const p=y*WIDTH+x;
    if(!grown[p])continue;
    const i=p*4,j=((y-oy)*w+x-ox)*4;
    if(filled[p]||underInk||rl!==tl) {
      pd[j]=fr;pd[j+1]=fg;pd[j+2]=fb;pd[j+3]=255;
    } else {
      const coverage=Math.min(1,dist(i)/contrast);
      if(coverage>=.985)continue;
      pd[j]=Math.max(0,Math.min(255,Math.round(ref[i]+(fr-sr)*(1-coverage))));
      pd[j+1]=Math.max(0,Math.min(255,Math.round(ref[i+1]+(fg-sg)*(1-coverage))));
      pd[j+2]=Math.max(0,Math.min(255,Math.round(ref[i+2]+(fb-sb)*(1-coverage))));
      pd[j+3]=255;
    }
    if(data[i]!==pd[j]||data[i+1]!==pd[j+1]||data[i+2]!==pd[j+2]||data[i+3]!==pd[j+3])changed++;
  }
  if(!changed)return null;
  ctx.putImageData(image,0,0);
  return { tl, patch, ox, oy, sx, sy, w, h, changed, underInk };
}
function commitFillResult(r) {
  if (!r) return false;
  r.tl.ctx.save();
  if (window.WinCreate?.selectionPath) r.tl.ctx.clip(window.WinCreate.selectionPath);
  r.tl.ctx.globalCompositeOperation=r.underInk?'destination-over':'source-over';
  r.tl.ctx.drawImage(r.patch,r.ox,r.oy);
  r.tl.ctx.restore();
  r.tl.thumbDirty=true;
  return true;
}
function animateFloodFill(r,before) {
  if(!r||!before)return;
  ensureFillPreviewSize();
  const after=document.createElement('canvas');after.width=before.width;after.height=before.height;
  after.getContext('2d').drawImage(r.tl.canvas,0,0,after.width,after.height);
  const layer=r.tl,visibility=layer.canvas.style.visibility;
  if(layer.surface)layer.surface.insertBefore(fillPreview,layer.vectorSvg);
  fillPreview.style.zIndex='1';
  fillPreview.style.opacity='1';
  fillPreview.style.mixBlendMode='normal';
  fillPreviewCtx.clearRect(0,0,fillPreview.width,fillPreview.height);
  fillPreviewCtx.drawImage(before,0,0);
  fillPreview.style.display='block';layer.canvas.style.visibility='hidden';
  const state={layer,visibility,frame:0};fillRevealState=state;
  const rx=fillPreview.width/WIDTH,ry=fillPreview.height/HEIGHT,x=r.sx*rx,y=r.sy*ry;
  const maxRadius=Math.max(Math.hypot(r.sx-r.ox,r.sy-r.oy),Math.hypot(r.sx-r.ox-r.w,r.sy-r.oy),Math.hypot(r.sx-r.ox,r.sy-r.oy-r.h),Math.hypot(r.sx-r.ox-r.w,r.sy-r.oy-r.h));
  const duration=Math.max(360,Math.min(560,360+Math.hypot(r.w,r.h)*.06));let start=null;
  const frame=now=>{
    if(fillRevealState!==state)return;
    if(!layer.canvas.isConnected){finishFillReveal();return;}
    if(start===null)start=now;
    const t=Math.min(1,(now-start)/duration),eased=t*t*(3-2*t);
    fillPreviewCtx.clearRect(0,0,fillPreview.width,fillPreview.height);
    fillPreviewCtx.drawImage(before,0,0);
    fillPreviewCtx.save();fillPreviewCtx.scale(rx,ry);fillPreviewCtx.beginPath();
    fillPreviewCtx.arc(r.sx,r.sy,maxRadius*eased+1,0,Math.PI*2);fillPreviewCtx.clip();
    // Replace the old preview inside the circle, including translucent pixels.
    fillPreviewCtx.clearRect(0,0,WIDTH,HEIGHT);
    fillPreviewCtx.drawImage(after,0,0,WIDTH,HEIGHT);
    fillPreviewCtx.restore();
    if(t<1)state.frame=requestAnimationFrame(frame);else finishFillReveal();
  };
  state.frame=requestAnimationFrame(frame);
}

async function buildFloodFillAsync(sx,sy,hex){
 if(typeof Worker==='undefined'||location.protocol==='file:')return buildFloodFillResult(sx,sy,hex);
 const tl=getActiveLayer();if(!tl||tl.isFolder)return null;const rl=layers.find(l=>l.id===referenceLayerId&&!l.isFolder)||tl;
 const expectedRevision=editRevision,expectedWidth=WIDTH,expectedHeight=HEIGHT;const reference=new Uint8ClampedArray(getLayerReferencePixels(rl)),target=tl.ctx.getImageData(0,0,WIDTH,HEIGHT).data;
 return new Promise((resolve,reject)=>{let worker;try{worker=new Worker('fill-worker-65.js?v=6.5.2');}catch{resolve(buildFloodFillResult(sx,sy,hex));return;}const timer=setTimeout(()=>{worker.terminate();reject(Error('Fill timed out. Reduce canvas size or close the outline.'));},30000);
 worker.onmessage=e=>{clearTimeout(timer);worker.terminate();if(e.data.error){reject(Error(e.data.error));return;}if(e.data.message)msg(e.data.message);const result=e.data.result;if(!result||editRevision!==expectedRevision||WIDTH!==expectedWidth||HEIGHT!==expectedHeight||!layers.includes(tl)){resolve(null);return;}const patch=document.createElement('canvas');patch.width=result.w;patch.height=result.h;patch.getContext('2d').putImageData(new ImageData(result.pixels,result.w,result.h),0,0);resolve({...result,patch,tl});};worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('Fill worker failed. Reload and retry.'));};worker.postMessage({sx,sy,hex,WIDTH,HEIGHT,ENGINE:{floodTolerance:ENGINE.floodTolerance,fillGap:ENGINE.fillGap,fillExpand:ENGINE.fillExpand},sameLayer:rl===tl,reference:reference.buffer,target:target.buffer},[reference.buffer,target.buffer]);
 });
}

async function floodFill(sx,sy,hex,options={}) {
  if(fillBusy)return false;
  finishFillReveal();fillBusy=true;
  try {
    const result=await buildFloodFillAsync(sx,sy,hex);if(!result)return false;
    let before=null;
    if(WC65.settings.fillAnimation&&options.animate!==false&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      ensureFillPreviewSize();before=document.createElement('canvas');before.width=fillPreview.width;before.height=fillPreview.height;
      before.getContext('2d').drawImage(result.tl.canvas,0,0,before.width,before.height);
    }
    const changed=commitFillResult(result);
    if(changed&&before)animateFloodFill(result,before);
    return changed;
  } finally {fillBusy=false;}
}

// =========================================================================
// QUICKSHAPE & GEOMETRY ENGINE
// =========================================================================
function getStrokeMatchedRadius(pts = splinePts) {
  if (pts && pts.length > 0) {
    const sum = pts.reduce((acc, p) => acc + (p.r || brushSize * 0.42), 0);
    return Math.max(0.125, sum / pts.length);
  }
  return Math.max(0.125, (brushSize * 0.5) * Math.pow(0.85, ENGINE.pressureGamma) * (1 - (+($('taperRange')?.value || 20) / 100) * 0.25));
}

function stampShapePath(ctx, pts, r, color) {
  if (!pts || pts.length < 2) return;
  const br = getCurrentBrush();
  let sm = (ENGINE.renderPipeline === 'subpixel' ? br.spacing * 0.55 : br.spacing)*WC65.brushConfig().spacing;
  if (ENGINE.chaikinSubdiv) sm *= 0.65;
  const stepDist = Math.max(0.55, r * sm);
  stampSymmetry(ctx, br.id, pts[0].x, pts[0].y, r, color);
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (segLen < 0.001) continue;
    let d = stepDist - carry;
    while (d <= segLen) {
      const t = d / segLen;
      stampSymmetry(ctx, br.id, p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, r, color);
      d += stepDist;
    }
    carry = segLen - (d - stepDist);
  }
}

function spawnInteractiveShape(kind = 'circle') {
  saveUndo();
  const cx = WIDTH * 0.5, cy = HEIGHT * 0.5, r = Math.min(WIDTH, HEIGHT) * 0.18;
  openEditableShapeSession(kind, { x: cx - r, y: cy }, { x: cx + r, y: cy }, { minX: cx - r, maxX: cx + r, minY: cy - r, maxY: cy + r }, getStrokeMatchedRadius([]));
}
if ($('addShapeMenuBtn')) $('addShapeMenuBtn').onclick = () => SHAPE_EDITOR.active ? commitEditableShape() : spawnInteractiveShape('circle');
if ($('toggleShapeFillBtn')) {
  $('toggleShapeFillBtn').onclick = function() {
    SHAPE_EDITOR.filled = !SHAPE_EDITOR.filled;
    const sp = this.querySelector('span');
    if (sp) sp.textContent = `Fill: ${SHAPE_EDITOR.filled ? 'On' : 'Off'}`;
    else this.textContent = `Fill: ${SHAPE_EDITOR.filled ? 'On' : 'Off'}`;
    this.classList.toggle('active', SHAPE_EDITOR.filled);
    renderActiveEditableShape();
  };
}

const qsCurveControl=document.createElement('div');
qsCurveControl.id='qsCurveControl';qsCurveControl.className='qs-handle endpoint wc-curve-handle';
qsCurveControl.title='Drag to bend the curve';shapeEditOverlay.append(qsCurveControl);
function openEditableShapeSession(kind, p1, p2, b, strokeR) {
  Object.assign(SHAPE_EDITOR, { active: true, kind, strokeR: strokeR || getStrokeMatchedRadius(), p1: { ...p1 }, p2: { ...p2 }, minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY });
  SHAPE_EDITOR.curveControl = b.control || {x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2-(['arc','bezier'].includes(kind)?Math.max(10,Math.hypot(p2.x-p1.x,p2.y-p1.y)*.4):0)};
  shapeEditOverlay.classList.add('active');
  quickShapeToolbar.classList.add('open');
  document.querySelectorAll('#quickShapeToolbar [data-qshape]').forEach(btn => btn.classList.toggle('active', btn.dataset.qshape === kind));
  renderActiveEditableShape();
}

function bindQuickShapeButton(btn) {
  btn.onclick = () => {
    const nk = btn.dataset.qshape;
    if (SHAPE_EDITOR.kind === 'line' && nk !== 'line') {
      const cx = (SHAPE_EDITOR.p1.x + SHAPE_EDITOR.p2.x) * 0.5, cy = (SHAPE_EDITOR.p1.y + SHAPE_EDITOR.p2.y) * 0.5, h = Math.max(40, Math.hypot(SHAPE_EDITOR.p2.x - SHAPE_EDITOR.p1.x, SHAPE_EDITOR.p2.y - SHAPE_EDITOR.p1.y) * 0.45);
      Object.assign(SHAPE_EDITOR, { minX: cx - h, maxX: cx + h, minY: cy - h, maxY: cy + h });
    }
    SHAPE_EDITOR.kind = nk;
    document.querySelectorAll('#quickShapeToolbar [data-qshape]').forEach(b => b.classList.toggle('active', b.dataset.qshape === nk));
    renderActiveEditableShape();
  };
}
document.querySelectorAll('#quickShapeToolbar [data-qshape]').forEach(bindQuickShapeButton);

const vectorGeometrySvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
vectorGeometrySvg.classList.add('vector-layer-surface','wc-geometry-preview');
vectorGeometrySvg.setAttribute('viewBox',`0 0 ${WIDTH} ${HEIGHT}`);
vectorGeometrySvg.setAttribute('preserveAspectRatio','none');
vectorGeometrySvg.style.cssText='display:none;z-index:956;pointer-events:none';
const vectorGeometryPath=document.createElementNS('http://www.w3.org/2000/svg','path');
vectorGeometryPath.setAttribute('stroke-linejoin','round');vectorGeometryPath.setAttribute('stroke-linecap','round');
vectorGeometrySvg.appendChild(vectorGeometryPath);board.insertBefore(vectorGeometrySvg,shapeEditOverlay);
function showVectorGeometry(spec, width, filled=false){
  if(!spec?.d)return;
  vectorGeometrySvg.setAttribute('viewBox',`0 0 ${WIDTH} ${HEIGHT}`);
  vectorGeometrySvg.style.display='block';scratchCanvas.style.visibility='hidden';
  vectorGeometryPath.setAttribute('d',spec.d);
  vectorGeometryPath.setAttribute('stroke',currentColor);
  vectorGeometryPath.setAttribute('fill',filled&&spec.closed?currentColor:'none');
  vectorGeometryPath.setAttribute('stroke-width',String(Math.max(.25,width)));
  vectorGeometryPath.setAttribute('opacity',String((brushOpacity/100)*getCurrentBrush().alpha));
}
function hideVectorGeometry(){vectorGeometrySvg.style.display='none';vectorGeometryPath.removeAttribute('d');scratchCanvas.style.visibility='';}
function setCornerPositions(x0, y0, x1, y1) {
  Object.assign($('qsCornerNW').style, { left: x0 + 'px', top: y0 + 'px' });
  Object.assign($('qsCornerNE').style, { left: x1 + 'px', top: y0 + 'px' });
  Object.assign($('qsCornerSW').style, { left: x0 + 'px', top: y1 + 'px' });
  Object.assign($('qsCornerSE').style, { left: x1 + 'px', top: y1 + 'px' });
}

function buildShapeVertices(kind, minX, maxX, minY, maxY) {
  const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, rx = Math.max(4, (maxX - minX) * 0.5), ry = Math.max(4, (maxY - minY) * 0.5), pts = [];
  if (CUSTOM_SHAPES[kind]) return CUSTOM_SHAPES[kind]({ minX, maxX, minY, maxY, cx, cy, rx, ry });
  if (kind === 'circle' || kind === 'ellipse') for (let a = 0; a <= Math.PI * 2; a += 0.03) pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  else if (kind === 'rect') pts.push({ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY });
  else if (kind === 'triangle') pts.push({ x: cx, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: cx, y: minY });
  else if (kind === 'diamond') pts.push({ x: cx, y: minY }, { x: maxX, y: cy }, { x: cx, y: maxY }, { x: minX, y: cy }, { x: cx, y: minY });
  else if (kind === 'hexagon') for (let i = 0; i <= 6; i++) { const a = (i * Math.PI) / 3 - Math.PI / 2; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
  else if (kind === 'star') for (let i = 0; i <= 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, m = i % 2 === 0 ? 1 : 0.42; pts.push({ x: cx + Math.cos(a) * rx * m, y: cy + Math.sin(a) * ry * m }); }
  else if (kind === 'heart') for (let t = 0; t <= Math.PI * 2; t += 0.04) pts.push({ x: cx + (16 * Math.pow(Math.sin(t), 3) / 16) * rx, y: cy + (-(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16) * ry });
  else if (kind === 'arrow') { const sy0 = cy - ry * 0.35, sy1 = cy + ry * 0.35, hx = minX + (maxX - minX) * 0.58; pts.push({ x: minX, y: sy0 }, { x: hx, y: sy0 }, { x: hx, y: minY }, { x: maxX, y: cy }, { x: hx, y: maxY }, { x: hx, y: sy1 }, { x: minX, y: sy1 }, { x: minX, y:sy0 }); }
  return pts;
}

function renderActiveEditableShape() {
  if (!SHAPE_EDITOR.active) return;
  clearScratchBuffer();
  scratchCanvas.style.opacity = (brushOpacity / 100) * getCurrentBrush().alpha;
  const r = SHAPE_EDITOR.strokeR || getStrokeMatchedRadius();
  if (['line','curve','bezier','arc'].includes(SHAPE_EDITOR.kind)) {
    const { p1, p2 } = SHAPE_EDITOR, mid = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
    showVectorGeometry(vectorShapeSpec(SHAPE_EDITOR.kind,SHAPE_EDITOR,p1,p2,SHAPE_EDITOR.curveControl),r*2,false);
    const bx = Math.min(p1.x, p2.x) - 16, by = Math.min(p1.y, p2.y) - 16, bw = Math.max(32, Math.abs(p2.x - p1.x) + 32), bh = Math.max(32, Math.abs(p2.y - p1.y) + 32);
    Object.assign(qsBox.style, { left: bx + 'px', top: by + 'px', width: bw + 'px', height: bh + 'px' });
    Object.assign(qsHandleStart.style, { display: 'block', left: p1.x + 'px', top: p1.y + 'px' });
    Object.assign(qsHandleEnd.style, { display: 'block', left: p2.x + 'px', top: p2.y + 'px' });
    qsCurveControl.style.display=['curve','bezier','arc'].includes(SHAPE_EDITOR.kind)?'block':'none';
    if(['curve','bezier','arc'].includes(SHAPE_EDITOR.kind))Object.assign(qsCurveControl.style,{left:SHAPE_EDITOR.curveControl.x+'px',top:SHAPE_EDITOR.curveControl.y+'px'});
    setCornerPositions(bx, by, bx + bw, by + bh);
    qsMeasurePill.textContent = `${SHAPE_EDITOR.kind === 'curve' ? 'Curve' : 'Line'}: ${Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y))}px`;
    Object.assign(qsMeasurePill.style, { left: mid.x + 'px', top: Math.min(p1.y, p2.y) + 'px' });
  } else {
    let { minX, maxX, minY, maxY, kind } = SHAPE_EDITOR;
    if (kind === 'circle') { const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, rad = Math.max(Math.abs(maxX - minX), Math.abs(maxY - minY)) * 0.5; minX = cx - rad; maxX = cx + rad; minY = cy - rad; maxY = cy + rad; }
    const spec=vectorShapeSpec(kind,{minX,maxX,minY,maxY},SHAPE_EDITOR.p1,SHAPE_EDITOR.p2,SHAPE_EDITOR.curveControl);
    showVectorGeometry(spec,r*2,SHAPE_EDITOR.filled);
    qsHandleStart.style.display = 'none'; qsHandleEnd.style.display = 'none'; qsCurveControl.style.display='none';
    Object.assign(qsBox.style, { left: minX + 'px', top: minY + 'px', width: (maxX - minX) + 'px', height: (maxY - minY) + 'px' });
    setCornerPositions(minX, minY, maxX, maxY);
    qsMeasurePill.textContent = `${kind.toUpperCase()} • ${Math.round(maxX - minX)}×${Math.round(maxY - minY)}px`;
    Object.assign(qsMeasurePill.style, { left: ((minX + maxX) * 0.5) + 'px', top: minY + 'px' });
  }
}

function commitEditableShape() {
  if(!SHAPE_EDITOR.active)return;
  const sh=SHAPE_EDITOR,r=sh.strokeR||getStrokeMatchedRadius();
  let {minX,maxX,minY,maxY}=sh;
  if(sh.kind==='circle'){const cx=(minX+maxX)*.5,cy=(minY+maxY)*.5,rad=Math.max(maxX-minX,maxY-minY)*.5;minX=cx-rad;maxX=cx+rad;minY=cy-rad;maxY=cy+rad;}
  const spec=vectorShapeSpec(sh.kind,{minX,maxX,minY,maxY},sh.p1,sh.p2,sh.curveControl);
  const l=getActiveLayer();if(l)addVectorShapeToLayer(l,spec,sh.kind,r*2,currentColor,(brushOpacity/100)*getCurrentBrush().alpha,sh.filled);
  sh.active=false;shapeEditOverlay.classList.remove('active');quickShapeToolbar.classList.remove('open');
  hideVectorGeometry();clearScratchBuffer();stopLiveVectorPreview();
  if(l){renderLayers();markUnsavedChanges();}msg('Crisp Vector Geometry Applied');
}
function cancelEditableShape() { SHAPE_EDITOR.active = false; shapeEditOverlay.classList.remove('active'); quickShapeToolbar.classList.remove('open'); hideVectorGeometry(); clearScratchBuffer(); }
if ($('commitShapeBtn')) $('commitShapeBtn').onclick = commitEditableShape;
if ($('cancelShapeBtn')) $('cancelShapeBtn').onclick = cancelEditableShape;

function startShapeHandleDrag(mode, e) {
  e.stopPropagation();
  SHAPE_EDITOR.dragMode = mode;
  SHAPE_EDITOR.dragStartPt = getCanvasPoint(e);
  SHAPE_EDITOR.snapState = { p1: { ...SHAPE_EDITOR.p1 }, p2: { ...SHAPE_EDITOR.p2 }, control2:{...(SHAPE_EDITOR.control2||{x:0,y:0})},curveControl: {...(SHAPE_EDITOR.curveControl||{x:0,y:0})}, minX: SHAPE_EDITOR.minX, maxX: SHAPE_EDITOR.maxX, minY: SHAPE_EDITOR.minY, maxY: SHAPE_EDITOR.maxY };
}
qsHandleStart.addEventListener('pointerdown', e => startShapeHandleDrag('start', e));
qsHandleEnd.addEventListener('pointerdown', e => startShapeHandleDrag('end', e));
qsCurveControl.addEventListener('pointerdown',e=>startShapeHandleDrag('curveControl',e));
qsBox.addEventListener('pointerdown', e => startShapeHandleDrag('move', e));
document.querySelectorAll('.qs-handle.box-resize').forEach(c => c.addEventListener('pointerdown', e => startShapeHandleDrag(c.dataset.corner, e)));

window.addEventListener('pointermove', e => {
  if (!SHAPE_EDITOR.active || !SHAPE_EDITOR.dragMode) return;
  const pt = getCanvasPoint(e), dx = pt.x - SHAPE_EDITOR.dragStartPt.x, dy = pt.y - SHAPE_EDITOR.dragStartPt.y, st = SHAPE_EDITOR.snapState, m = SHAPE_EDITOR.dragMode;
  if(e.shiftKey&&['start','end'].includes(m)){const anchor=m==='end'?SHAPE_EDITOR.p1:SHAPE_EDITOR.p2,a=Math.atan2(pt.y-anchor.y,pt.x-anchor.x),d=Math.hypot(pt.x-anchor.x,pt.y-anchor.y),angle=Math.round(a/(Math.PI/12))*Math.PI/12;pt.x=anchor.x+Math.cos(angle)*d;pt.y=anchor.y+Math.sin(angle)*d;}
  if(m==='control2')SHAPE_EDITOR.control2=pt;else if(m==='curveControl')SHAPE_EDITOR.curveControl=pt;
  else if (m === 'start') SHAPE_EDITOR.p1 = pt; else if (m === 'end') SHAPE_EDITOR.p2 = pt;
  else if (m === 'move') Object.assign(SHAPE_EDITOR, { p1: { x: st.p1.x + dx, y: st.p1.y + dy }, p2: { x: st.p2.x + dx, y: st.p2.y + dy }, curveControl:{x:st.curveControl.x+dx,y:st.curveControl.y+dy},control2:{x:st.control2.x+dx,y:st.control2.y+dy},minX: st.minX + dx, maxX: st.maxX + dx, minY: st.minY + dy, maxY: st.maxY + dy });
  else if (['line','curve','bezier','arc'].includes(SHAPE_EDITOR.kind)) {
    const cx = (st.p1.x + st.p2.x) * 0.5, cy = (st.p1.y + st.p2.y) * 0.5, f = Math.max(10, Math.hypot(pt.x - cx, pt.y - cy)) / Math.max(10, Math.hypot(SHAPE_EDITOR.dragStartPt.x - cx, SHAPE_EDITOR.dragStartPt.y - cy));
    SHAPE_EDITOR.p1 = { x: cx + (st.p1.x - cx) * f, y: cy + (st.p1.y - cy) * f }; SHAPE_EDITOR.p2 = { x: cx + (st.p2.x - cx) * f, y: cy + (st.p2.y - cy) * f };
  } else {
    if (m.includes('w')) SHAPE_EDITOR.minX = Math.min(st.maxX - 20, st.minX + dx); if (m.includes('e')) SHAPE_EDITOR.maxX = Math.max(st.minX + 20, st.maxX + dx);
    if (m.includes('n')) SHAPE_EDITOR.minY = Math.min(st.maxY - 20, st.minY + dy); if (m.includes('s')) SHAPE_EDITOR.maxY = Math.max(st.minY + 20, st.maxY + dy);
  }
  renderActiveEditableShape();
});
window.addEventListener('pointerup', () => SHAPE_EDITOR.dragMode = null);
shapeEditOverlay.addEventListener('pointerdown', e => { if (e.target === shapeEditOverlay) { e.preventDefault(); e.stopPropagation(); commitEditableShape(); } });

document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-g]').forEach(x => x.classList.remove('active')); b.classList.add('active'); guideType = b.dataset.g; drawGuides(); closePops(); });
function drawGuides() {
  guideCtx.clearRect(0, 0, WIDTH, HEIGHT);
  guideCtx.strokeStyle = 'rgba(156,163,175,0.55)';
  guideCtx.lineWidth = 1.3;
  if (guideType === 'grid2d') {
    for (let x = 0; x < WIDTH; x += 50) { guideCtx.beginPath(); guideCtx.moveTo(x, 0); guideCtx.lineTo(x, HEIGHT); guideCtx.stroke(); }
    for (let y = 0; y < HEIGHT; y += 50) { guideCtx.beginPath(); guideCtx.moveTo(0, y); guideCtx.lineTo(WIDTH, y); guideCtx.stroke(); }
  } else if (guideType.startsWith('sym_')) {
    guideCtx.beginPath(); guideCtx.moveTo(WIDTH / 2, 0); guideCtx.lineTo(WIDTH / 2, HEIGHT); guideCtx.stroke();
    if (guideType !== 'sym_v') { guideCtx.beginPath(); guideCtx.moveTo(0, HEIGHT / 2); guideCtx.lineTo(WIDTH, HEIGHT / 2); guideCtx.stroke(); }
    if (guideType === 'sym_radial') { guideCtx.beginPath(); guideCtx.moveTo(0, 0); guideCtx.lineTo(WIDTH, HEIGHT); guideCtx.moveTo(WIDTH, 0); guideCtx.lineTo(0, HEIGHT); guideCtx.stroke(); }
  }
}
if ($('flipCanvasBtn')) $('flipCanvasBtn').onclick = () => { flipX *= -1; updateViewTransform(); closePops(); };
if ($('fitViewBtn')) $('fitViewBtn').onclick = () => { fitCanvasFullscreen(); closePops(); };
if ($('blurRange')) $('blurRange').oninput = e => $('blurPxLabel').textContent = e.target.value + 'px';
if ($('blurLayerBtn')) {
  $('blurLayerBtn').onclick = () => {
    const px = +$('blurRange').value || 6, l = getActiveLayer(); if (!l || l.isFolder) return; saveUndo();flattenVectorLayer(l);
    const t = document.createElement('canvas'); t.width = WIDTH; t.height = HEIGHT; const tc = t.getContext('2d');
    tc.filter = `blur(${px}px)`; tc.drawImage(l.canvas, 0, 0); l.ctx.clearRect(0, 0, WIDTH, HEIGHT); l.ctx.drawImage(t, 0, 0); l.thumbDirty = true; renderLayers(); closePops(); markUnsavedChanges(); msg(`Blur ${px}px Applied`);
  };
}
if ($('invertLayerBtn')) $('invertLayerBtn').onclick = () => { $('mInvert').click(); closePops(); };
if ($('fillLayerBtn')) $('fillLayerBtn').onclick = () => { $('mFill').click(); closePops(); };

// =========================================================================
// SNAPSHOTS & MEMORY-SAFE UNDO / REDO
// =========================================================================
function captureStudioSnapshot() {
  return {
    type: 'full',
    WIDTH,
    HEIGHT,
    activeLayerId,
    bgColor,
    bgVisible,
    traceVisible: TRACE.visible,
    layers: layers.map(l => l.isFolder ? ({ ...l }) : ({
      id: l.id,
      name: l.name,
      isFolder: false,
      parentId: l.parentId || null,
      visible: l.visible,
      opacity: l.opacity,
      alphaLock: l.alphaLock,
      clipMask: l.clipMask,
      layerMask: structuredClone(l.layerMask||null),
      effects: structuredClone(l.effects||null),
      blend: l.blend,
      vectorStrokes: structuredClone(l.vectorStrokes || []),
      data: captureLayerPixels(l)
    }))
  };
}

function restoreStudioSnapshot(snap) {
  WCLayerMasks.cancelInput?.();
  if(snap.type==='mask'){const l=layers.find(l=>l.id===snap.id);if(l){l.layerMask=structuredClone(snap.layerMask||null);l.thumbDirty=true;syncLayers();renderLayers();}return;}
  if (snap.type === 'single') {
    const l = layers.find(x => x.id === snap.id && !x.isFolder);
    if (l) { if('layerMask' in snap)l.layerMask=structuredClone(snap.layerMask||null);if('effects' in snap)l.effects=structuredClone(snap.effects||null);if(snap.data)l.ctx.putImageData(snap.data,0,0);else l.ctx.clearRect(0,0,WIDTH,HEIGHT); l.vectorStrokes = structuredClone(snap.vectorStrokes || []); renderVectorLayer(l); l.thumbDirty = true; }
  } else {
    if (snap.WIDTH && snap.HEIGHT && (snap.WIDTH !== WIDTH || snap.HEIGHT !== HEIGHT)) {
      WIDTH = snap.WIDTH; HEIGHT = snap.HEIGHT;
      board.style.width = WIDTH + 'px'; board.style.height = HEIGHT + 'px';
      [bgCanvas, traceCanvas, guideCanvas].forEach(c => { c.width = WIDTH; c.height = HEIGHT; });
      configureScratchSSAA();
    }
    bgColor = snap.bgColor; bgVisible = snap.bgVisible; drawBackground();
    if(typeof snap.traceVisible==='boolean'){TRACE.visible=snap.traceVisible;renderTraceReference();$('traceVisSwitch')?.classList.toggle('on',TRACE.visible);}
    layers.forEach(l => { (l.surface?.parentElement?.classList.contains('wc-folder-mask-wrapper')?l.surface.parentElement:l.surface)?.remove();l.canvas?.remove();l.vectorSvg?.remove(); });
    layers = snap.layers.map(s => {
      if (s.isFolder) return { ...s };
      const c = document.createElement('canvas'); c.width = WIDTH; c.height = HEIGHT; board.insertBefore(c, scratchCanvas);
      const ctx = create2DContext(c, true); applyContextSmoothing(ctx); if(s.data)ctx.putImageData(s.data,0,0);
      const vectorSvg = createVectorSurface(s.id);
      const thumbCanvas = document.createElement('canvas'); thumbCanvas.width = 40; thumbCanvas.height = 28;
      const layer = { id: s.id, name: s.name, isFolder: false, parentId: s.parentId || null, canvas: c, ctx, vectorSvg, vectorStrokes: structuredClone(s.vectorStrokes || []), thumbCanvas, thumbDirty: true, visible: s.visible, opacity: s.opacity, alphaLock: s.alphaLock, clipMask: s.clipMask, layerMask: structuredClone(s.layerMask||null), effects: structuredClone(s.effects||null), blend: s.blend };
      trackLayerPixels(layer);if(s.data){layer.rasterRevision=1;PIXEL_SNAPSHOTS.set(layer,{revision:1,data:s.data});}
      renderVectorLayer(layer);
      return layer;
    });
    activeLayerId = snap.activeLayerId;
    syncLayers();
  }
  syncLayers();renderLayers();
}

function saveUndo() {
  if ((window.WinCreate?.animation?.enabled && !window.WinCreate.animation.suspended)) { return {animation:true,token:WinCreate.animation.beforeEdit()}; }
  const l = getActiveLayer(); if (!l || l.isFolder) return;
  const snapshot={ type: 'single', id: l.id, data: captureLayerPixels(l), vectorStrokes: structuredClone(l.vectorStrokes || []),layerMask:structuredClone(l.layerMask||null),effects:structuredClone(l.effects||null) },previousRedo=redoStack;
  undoStack.push(snapshot);
  trimHistory();redoStack = [];
  return {snapshot,previousRedo};
}

function saveFullStateUndo() {
  if ((window.WinCreate?.animation?.enabled && !window.WinCreate.animation.suspended)) { WinCreate.animation.beforeEdit(); return; }
  undoStack.push(captureStudioSnapshot());
  trimHistory();
  redoStack = [];
}

function doUndo() {
  if(isDrawing)finishPointerStroke();
  if ((window.WinCreate?.animation?.enabled && !window.WinCreate.animation.suspended)) { WinCreate.animation.undo(); return; }
  if (fillBusy) return;
  if (SHAPE_EDITOR.active) { cancelEditableShape(); return; }
  if (!undoStack.length) { msg('Nothing to Undo'); return; }
  const st = undoStack.pop();
  if(st.type==='mask'){const l=layers.find(l=>l.id===st.id);if(l)redoStack.push({type:'mask',id:l.id,layerMask:structuredClone(l.layerMask||null),effects:structuredClone(l.effects||null)});}
  else if (st.type === 'single') { const l = layers.find(x => x.id === st.id && !x.isFolder); if (l) redoStack.push({ type: 'single', id: l.id, data: captureLayerPixels(l), vectorStrokes: structuredClone(l.vectorStrokes || []),layerMask:structuredClone(l.layerMask||null),effects:structuredClone(l.effects||null) }); }
  else redoStack.push(captureStudioSnapshot());
  restoreStudioSnapshot(st); trimHistory();markUnsavedChanges(); msg('Undo');
}

function doRedo() {
  if(isDrawing)finishPointerStroke();
  if ((window.WinCreate?.animation?.enabled && !window.WinCreate.animation.suspended)) { WinCreate.animation.redo(); return; }
  if (fillBusy) return;
  if (!redoStack.length) { msg('Nothing to Redo'); return; }
  const st = redoStack.pop();
  if(st.type==='mask'){const l=layers.find(l=>l.id===st.id);if(l)undoStack.push({type:'mask',id:l.id,layerMask:structuredClone(l.layerMask||null),effects:structuredClone(l.effects||null)});}
  else if (st.type === 'single') { const l = layers.find(x => x.id === st.id && !x.isFolder); if (l) undoStack.push({ type: 'single', id: l.id, data: captureLayerPixels(l), vectorStrokes: structuredClone(l.vectorStrokes || []),layerMask:structuredClone(l.layerMask||null),effects:structuredClone(l.effects||null) }); }
  else undoStack.push(captureStudioSnapshot());
  restoreStudioSnapshot(st); trimHistory();markUnsavedChanges(); msg('Redo');
}
if ($('undoBtn')) $('undoBtn').onclick = doUndo;
if ($('redoBtn')) $('redoBtn').onclick = doRedo;

function formatKeyCombo(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) parts.push(k);
  return parts.join('+');
}

window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (listeningKeyAction) {
    e.preventDefault();
    const combo = formatKeyCombo(e);
    if (combo && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      KEYBINDS[listeningKeyAction] = combo;
      try{localStorage.setItem('wincreate_keybinds_v1', JSON.stringify(KEYBINDS));}catch{}
      listeningKeyAction = null; renderKeybindsList(); msg(`Bound to ${combo}`);
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && ['=', '+', '-', '_', '0'].includes(e.key)) {
    e.preventDefault();
    if (e.key === '0') fitCanvasFullscreen();
    else if (e.key === '-' || e.key === '_') zoomCanvasAtPoint(scale * 0.84);
    else zoomCanvasAtPoint(scale * 1.18);
    return;
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.code === 'BracketLeft'||e.code==='BracketRight')) {
    e.preventDefault();const dir=e.code==='BracketRight'?1:-1;
    const next=brushSize*(dir>0?1.25:.8);
    setBrushSize(next,{notify:true});return;
  }
  if (e.code === 'Space') isSpace = true;
  if (e.key === 'Enter' && SHAPE_EDITOR.active) commitEditableShape();
  if (e.key === 'Escape' && SHAPE_EDITOR.active) cancelEditableShape();
  const combo = formatKeyCombo(e);
  if (combo === KEYBINDS.undo) { e.preventDefault(); doUndo(); }
  else if (combo === KEYBINDS.redo) { e.preventDefault(); doRedo(); }
  else if (combo === KEYBINDS.save) {
    e.preventDefault();
    if (window.WinCreate?.saveProjectNative) window.WinCreate.saveProjectNative(true);
  }
  else if (combo === KEYBINDS.brush) activateTool('brush');
  else if (combo === KEYBINDS.eraser) activateTool('eraser');
  else if (combo === KEYBINDS.smudge) activateTool('smudge');
  else if (combo === KEYBINDS.move) activateTool('transform');
  else if (combo === KEYBINDS.eyedropper) $('modifyBtn')?.click();
  else if (combo === KEYBINDS.layers) {e.preventDefault();if($('pageAnimation')?.classList.contains('active'))$('wcAnimLayers')?.click();else $('layersBtn')?.click();}
  else if (combo === KEYBINDS.color) togglePop('color');
  else if (combo === KEYBINDS.zoomIn) zoomCanvasAtPoint(scale * 1.18);
  else if (combo === KEYBINDS.zoomOut) zoomCanvasAtPoint(scale * 0.84);
  else if (combo === KEYBINDS.fitView) fitCanvasFullscreen();
});
window.addEventListener('keyup', e => { if (e.code === 'Space') isSpace = false; });

// =========================================================================
// ROTATION-AWARE CANVAS COORDINATE MAPPING & STROKE ENGINE
// =========================================================================
// Reuse layout only within one synchronous input event. The next event reads
// fresh layout, so resize, scroll, zoom, rotation and mirroring cannot go stale.
function canvasInputMapping() {
  const r=viewportEl.getBoundingClientRect(),angle=-rotation*Math.PI/180;
  return {cx:r.left+r.width*.5+panX,cy:r.top+r.height*.5+panY,cos:Math.cos(angle),sin:Math.sin(angle),sx:scale*flipX,sy:scale};
}
function getCanvasPoint(e,m=canvasInputMapping()) {
  const dx=e.clientX-m.cx,dy=e.clientY-m.cy;
  return {x:(dx*m.cos-dy*m.sin)/m.sx+WIDTH*.5,y:(dx*m.sin+dy*m.cos)/m.sy+HEIGHT*.5};
}

if ($('modifyBtn')) $('modifyBtn').onclick = () => { modActive = !modActive; $('modifyBtn').classList.toggle('active', modActive); msg(modActive ? 'Eyedropper Active' : 'Eyedropper Off'); };

function pickCanvasPixel(x, y) {
  const cx = Math.max(0, Math.min(WIDTH - 1, Math.floor(x))), cy = Math.max(0, Math.min(HEIGHT - 1, Math.floor(y)));
  pixelSamplerCtx.clearRect(0, 0, 1, 1);
  if (bgVisible) { pixelSamplerCtx.fillStyle = bgColor; pixelSamplerCtx.fillRect(0, 0, 1, 1); }
  if (TRACE.hasImage && TRACE.visible) { pixelSamplerCtx.save(); pixelSamplerCtx.globalAlpha = TRACE.opacity / 100; pixelSamplerCtx.drawImage(traceCanvas, cx, cy, 1, 1, 0, 0, 1, 1); pixelSamplerCtx.restore(); }
  layers.forEach(l=>{if(l.isFolder||!l.canvas||!isLayerEffectivelyVisible(l))return;pixelSamplerCtx.save();pixelSamplerCtx.globalAlpha=getEffectiveLayerOpacity(l);pixelSamplerCtx.globalCompositeOperation=l.blend==='normal'?'source-over':l.blend;pixelSamplerCtx.drawImage(createLayerComposite(l),cx,cy,1,1,0,0,1,1);pixelSamplerCtx.restore();});
  const d = pixelSamplerCtx.getImageData(0, 0, 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
}

// WINCREATE WET MIX 3.4 — local pigment transport with stroke-coherent tip.
// Each brush step picks up *pre-write* destination pixels, carries paint to the
// next step and deposits premultiplied colors. A soft alpha mask removes seams.
const SMUDGE_PRESETS = {
  blend: { label:'Brush Blend', softness:32, pull:72, pickup:55, spacing:7 },
  soft: { label:'Soft Haze', softness:85, pull:26, pickup:68, spacing:8 },
  wet: { label:'Wet Paint', softness:48, pull:65, pickup:32, spacing:7 },
  finger: { label:'Finger Pull', softness:18, pull:88, pickup:15, spacing:6 }
};
const SMUDGE = {mode:'wet',preset:'blend',brushShape:true, ...SMUDGE_PRESETS.blend};
try {
  const saved = JSON.parse(localStorage.getItem('wincreate_smudge_v34') || '{}');
  if([59,60,61].includes(saved.behaviorVersion)){
  if (SMUDGE_PRESETS[saved.preset]) Object.assign(SMUDGE,{preset:saved.preset,...SMUDGE_PRESETS[saved.preset]});
  if(saved.behaviorVersion>=60&&['sharp','wet'].includes(saved.mode))SMUDGE.mode=saved.mode;
  SMUDGE.preserveCoverage=saved.preserveCoverage!==false;
  if(saved.behaviorVersion===61&&typeof saved.brushShape==='boolean')SMUDGE.brushShape=saved.brushShape;
  for (const field of ['softness', 'pull', 'pickup']) {
    if (Number.isFinite(+saved[field])) SMUDGE[field] = Math.max(0,Math.min(100,+saved[field]));
  }
  SMUDGE.spacing = SMUDGE_PRESETS[SMUDGE.preset].spacing;
  }
} catch (_) {}
function saveSmudgeSettings() {
  try { localStorage.setItem('wincreate_smudge_v34',JSON.stringify({behaviorVersion:61,preserveCoverage:SMUDGE.preserveCoverage!==false,brushShape:SMUDGE.brushShape,mode:SMUDGE.mode,preset:SMUDGE.preset,softness:SMUDGE.softness,pull:SMUDGE.pull,pickup:SMUDGE.pickup})); } catch (_) {}
}
let smudgeBuffer = null;
const SMUDGE_TIP_CACHE=new Map(),SMUDGE_CUSTOM_IDS=new WeakMap();let smudgeCustomId=0;
function makeSmudgeTip(size, radius) {
  const br=toolBrushes.smudge,custom=CUSTOM_BRUSH_TIPS[br.id];
  if(custom&&!SMUDGE_CUSTOM_IDS.has(custom))SMUDGE_CUSTOM_IDS.set(custom,++smudgeCustomId);
  const shaped=SMUDGE.brushShape!==false,tip=getBrushTip(br.id);
  const key=`${size}:${radius.toFixed(3)}:${SMUDGE.softness}:${shaped?br.id:'round'}:${custom?SMUDGE_CUSTOM_IDS.get(custom):0}`;
  if(SMUDGE_TIP_CACHE.has(key))return SMUDGE_TIP_CACHE.get(key);
  const weights = new Float32Array(size*size);
  const center=(size-1)/2;
  let shape=null,peak=0;
  if(shaped&&(tip!=='round'||custom)){
    const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{willReadFrequently:true});
    // Fit wide air/spray tips inside the advertised diameter and bounded buffer.
    const extent=['air','neon','splatter'].includes(tip)?1.6:tip==='watercolor'?1.16:tip==='spray'?1.15:1;
    stampTip(ctx,br.id,center,center,radius/extent,'#ffffff');shape=ctx.getImageData(0,0,size,size).data;
    for(let i=3;i<shape.length;i+=4)peak=Math.max(peak,shape[i]);
  }
  const feather = Math.max(.08,SMUDGE.softness/100*.92);
  for (let yy=0;yy<size;yy++) for (let xx=0;xx<size;xx++) {
    const d=Math.hypot(xx-center,yy-center)/radius;
    if (d>=1) continue;
    const t=Math.max(0,Math.min(1,(1-d)/feather));
    const shapeFactor=shape?(peak?Math.max(0.25,shape[(yy*size+xx)*4+3]/peak):1):1;
    weights[yy*size+xx]=t*t*(3-2*t)*Math.min(1,Math.PI*radius*radius)*shapeFactor;
  }
  SMUDGE_TIP_CACHE.set(key,weights);let bytes=0;for(const tip of SMUDGE_TIP_CACHE.values())bytes+=tip.byteLength;
  while((bytes>64*1024*1024||SMUDGE_TIP_CACHE.size>128)&&SMUDGE_TIP_CACHE.size>1){const first=SMUDGE_TIP_CACHE.keys().next().value;bytes-=SMUDGE_TIP_CACHE.get(first).byteLength;SMUDGE_TIP_CACHE.delete(first);}
  return weights;
}
function smudgeSubpixelWeights(s,cx,cy,tx,ty){
  if(s.size>48)return s.weights;
  const center=(s.size-1)*.5;
  const precision=4,half=2;
  const fx=Math.max(-half,Math.min(half,Math.round((cx-tx-center)*precision)));
  const fy=Math.max(-half,Math.min(half,Math.round((cy-ty-center)*precision)));
  if(!fx&&!fy)return s.weights;
  const key=(fy+half)*(precision+1)+fx+half;
  const cache=s.phaseTips ||= new Map();
  if(cache.has(key))return cache.get(key);
  const src=s.weights,n=s.size,out=new Float32Array(src.length);
  const ox=fx/precision,oy=fy/precision;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const xx=x-ox,yy=y-oy;
    const x0=Math.floor(xx),y0=Math.floor(yy),txf=xx-x0,tyf=yy-y0;
    const sample=(sx,sy)=>sx>=0&&sx<n&&sy>=0&&sy<n?src[sy*n+sx]:0;
    const top=sample(x0,y0)*(1-txf)+sample(x0+1,y0)*txf;
    const bottom=sample(x0,y0+1)*(1-txf)+sample(x0+1,y0+1)*txf;
    out[y*n+x]=top*(1-tyf)+bottom*tyf;
  }
  cache.set(key,out);
  return out;
}
function ensureLayerLivePixels(layer){
  if(layer._livePixels&&layer._livePixelsRev===layer.rasterRevision&&layer._livePixels.width===WIDTH&&layer._livePixels.height===HEIGHT)return layer._livePixels;
  const snap=PIXEL_SNAPSHOTS.get(layer);
  if(snap&&snap.revision===layer.rasterRevision&&snap.data&&snap.data.width===WIDTH&&snap.data.height===HEIGHT){
    if(!layer._livePixels||layer._livePixels.width!==WIDTH||layer._livePixels.height!==HEIGHT)layer._livePixels=new ImageData(WIDTH,HEIGHT);
    layer._livePixels.data.set(snap.data.data);
  }else if(layer.rasterRevision===0){
    if(!layer._livePixels||layer._livePixels.width!==WIDTH||layer._livePixels.height!==HEIGHT)layer._livePixels=new ImageData(WIDTH,HEIGHT);
    else layer._livePixels.data.fill(0);
  }else{
    layer._livePixels=layer.ctx.getImageData(0,0,WIDTH,HEIGHT);
  }
  layer._livePixelsRev=layer.rasterRevision;
  return layer._livePixels;
}
function beginWetSmudge(layer,x,y) {
  window.WCGPUPaint?.release();
  if (!layer || layer.isFolder) return;
  wetSmudgePaintCost=0;
  wetSmudgeLastPaintAt=0;
  const radius=Math.max(.125,brushSize*.5), size=Math.ceil(radius*2)+4;
  const tx=Math.round(x-(size-1)*.5),ty=Math.round(y-(size-1)*.5);
  const selection=window.WinCreate?.selectionPath;
  const maskCanvas=selection?document.createElement('canvas'):null;
  if(maskCanvas){maskCanvas.width=maskCanvas.height=size;}
  smudgeBuffer={layerId:layer.id,x,y,radius,size,mode:SMUDGE.mode,softness:SMUDGE.softness,rasterInk:layer.rasterRevision!==0,
    carrier:null,weights:makeSmudgeTip(size,radius),
    selectionMaskCtx:maskCanvas?.getContext('2d',{willReadFrequently:true}) || null,
    flow:(brushOpacity/100)*(SMUDGE.pull/100)*.72,
    pickupRate:SMUDGE.pickup/100*.58,
    spacing:Math.max(.5,Math.min(Math.max(1.8,radius*.11),radius*(SMUDGE.spacing/65))),moved:false,dabCount:0};
  if(SMUDGE.mode==='sharp'&&!layer.alphaLock&&!layer.clipMask&&!selection&&layer.vectorStrokes?.some(st=>st.kind!=='raster')){smudgeBuffer.sharpVector=true;return;}
  smudgeBuffer.localWet=true;
  if(!layer.vectorStrokes?.length&&!selection&&!layer.clipMask){
    const live=ensureLayerLivePixels(layer).data,carrier=new Uint8ClampedArray(size*size*4);
    const xStart=Math.max(0,-tx),yStart=Math.max(0,-ty),xEnd=Math.min(size,WIDTH-tx),yEnd=Math.min(size,HEIGHT-ty);
    for(let row=yStart;row<yEnd;row++){
      const srcOff=((ty+row)*WIDTH+(tx+xStart))*4,dstOff=(row*size+xStart)*4,len=(xEnd-xStart)*4;
      carrier.set(live.subarray(srcOff,srcOff+len),dstOff);
    }
    smudgeBuffer.carrier=carrier;
  }else{
    smudgeBuffer.carrier=new Uint8ClampedArray(getSmudgeStartPixels(layer,tx,ty,size,x,y,radius+2));
  }
}
let pendingWetSmudgeFrame=0;
let wetSmudgePaintCost=0,wetSmudgeLastPaintAt=0;
function scheduleWetSmudgePresentation(layer){
  if(pendingWetSmudgeFrame)return;
  const present=()=>{
    pendingWetSmudgeFrame=0;
    if(smudgeBuffer?.layerId!==layer.id)return;
    const start=performance.now();
    flushLocalWetSmudge(layer);
    const cost=performance.now()-start;
    wetSmudgePaintCost=wetSmudgePaintCost?wetSmudgePaintCost*.7+cost*.3:cost;
    WCPerf.observe(cost);wetSmudgeLastPaintAt=start;
  };
  pendingWetSmudgeFrame=requestAnimationFrame(present);
}
function finishWetSmudgePresentation(layer){
  if(pendingWetSmudgeFrame){cancelAnimationFrame(pendingWetSmudgeFrame);pendingWetSmudgeFrame=0;}
  flushLocalWetSmudge(layer);window.WCGPUPaint?.release(smudgeBuffer);
}
let pendingVectorSmudgeFrame=0;
function pullVectorInk(layer,x,y,pressure=1) {
  const s=smudgeBuffer,totalDx=x-s.x,totalDy=y-s.y,distance=Math.hypot(totalDx,totalDy);
  if(distance<.2)return;
  const baseStrength=Math.min(.92,(SMUDGE.pull/100*.82)*(brushOpacity/100)*Math.max(.1,pressure||.5));
  if(baseStrength<=0){s.x=x;s.y=y;return;}
  const selection=window.WinCreate?.selectionPath;
  const subSteps=Math.min(128,Math.max(1,Math.ceil(distance/Math.max(1,s.radius*.28))));
  const stepDx=totalDx/subSteps,stepDy=totalDy/subSteps;
  let changed=false;
  for(let step=1;step<=subSteps;step++){
    const sx=s.x+stepDx*(step-1),sy=s.y+stepDy*(step-1);
    for(const st of layer.vectorStrokes||[]){
      if(st.kind==='raster')continue;
      if(!strokeTouchesArea(st,sx,sy,s.radius+Math.hypot(stepDx,stepDy)))continue;
      const source=(st.points||[]).slice(),dense=[],spacing=Math.max(1,s.radius*.18);
      if(st.fill&&source.length>2&&Math.hypot(source[0].x-source.at(-1).x,source[0].y-source.at(-1).y)>.001)source.push(source[0]);
      for(let i=0;i<source.length;i++){
        const p=source[i],prev=source[i-1];
        if(prev){const count=Math.min(256,Math.max(1,Math.ceil(Math.hypot(p.x-prev.x,p.y-prev.y)/spacing)));
          for(let j=1;j<count&&dense.length<16000;j++){const t=j/count;dense.push({x:prev.x+(p.x-prev.x)*t,y:prev.y+(p.y-prev.y)*t,r:(prev.r||st.width/2)+((p.r||st.width/2)-(prev.r||st.width/2))*t});}}
        dense.push({...p});
      }
      let touched=false;
      for(const p of dense){
        const d=Math.hypot(p.x-sx,p.y-sy)/s.radius;
        if(d>=1||(selection&&!layer.ctx.isPointInPath(selection,p.x,p.y)))continue;
        const weight=Math.pow(1-d*d,2)*baseStrength;p.x+=stepDx*weight;p.y+=stepDy*weight;touched=true;
      }
      if(!touched)continue;
      if(isDrawing&&!strokeUndoRecord)strokeUndoRecord=saveUndo();
      for(const er of st.erasures||[]){
        const original=er.points||[],mask=[];
        for(let i=0;i<original.length;i++){const p=original[i],prev=original[i-1];if(prev){const count=Math.min(256,Math.max(1,Math.ceil(Math.hypot(p.x-prev.x,p.y-prev.y)/spacing)));for(let j=1;j<count&&mask.length<16000;j++){const t=j/count;mask.push({x:prev.x+(p.x-prev.x)*t,y:prev.y+(p.y-prev.y)*t,r:(prev.r??er.width/2)+((p.r??er.width/2)-(prev.r??er.width/2))*t});}}mask.push({...p});}
        for(const p of mask){const d=Math.hypot(p.x-sx,p.y-sy)/s.radius;if(d>=1||(selection&&!layer.ctx.isPointInPath(selection,p.x,p.y)))continue;const weight=Math.pow(1-d*d,2)*baseStrength;p.x+=stepDx*weight;p.y+=stepDy*weight;}er.points=mask;
      }
      st.points=dense;delete st.svgTransform;
      st.svgPath=st.fill&&!st.brushId?('M '+dense.map(p=>`${p.x} ${p.y}`).join(' L ')+' Z'):(st.outline?buildPressureOutlinePath(dense):smoothVectorPath(dense)+(st.fill?' Z':''));
      VECTOR_BOUNDS_CACHE.delete(st);changed=true;
    }
  }
  s.x=x;s.y=y;s.moved ||= changed;
  if(changed){layer.thumbDirty=true;markUnsavedChanges();
    if(!pendingVectorSmudgeFrame)pendingVectorSmudgeFrame=requestAnimationFrame(()=>{pendingVectorSmudgeFrame=0;renderVectorLayer(layer);});}
}
function diffuseCarrierInPlace(s,hazeStrength){
  const n=s.size;if(n<3||hazeStrength<=.01)return;
  const carrier=s.carrier,mix=Math.min(.65,hazeStrength*.65),inv=1-mix,stride=n*4;
  const src=s.carrierScratch||(s.carrierScratch=new Uint8ClampedArray(carrier.length));
  src.set(carrier);
  for(let y=1;y<n-1;y++){
    let i=(y*n+1)*4;
    for(let x=1;x<n-1;x++,i+=4){
      const a0=src[i+3],aL=src[i-4+3],aR=src[i+4+3],aU=src[i-stride+3],aD=src[i+stride+3];
      const sumA=a0*4+aL+aR+aU+aD;if(sumA===0)continue;
      const avgA=sumA*.125,outA=a0*inv+avgA*mix;
      if(outA>.5){
        const avgR=(src[i]*a0*4+src[i-4]*aL+src[i+4]*aR+src[i-stride]*aU+src[i+stride]*aD)/sumA;
        const avgG=(src[i+1]*a0*4+src[i-3]*aL+src[i+5]*aR+src[i-stride+1]*aU+src[i+stride+1]*aD)/sumA;
        const avgB=(src[i+2]*a0*4+src[i-2]*aL+src[i+6]*aR+src[i-stride+2]*aU+src[i+stride+2]*aD)/sumA;
        carrier[i]=(src[i]*inv+avgR*mix+.5)|0;
        carrier[i+1]=(src[i+1]*inv+avgG*mix+.5)|0;
        carrier[i+2]=(src[i+2]*inv+avgB*mix+.5)|0;
        carrier[i+3]=(outA+.5)|0;
      }else carrier[i]=carrier[i+1]=carrier[i+2]=carrier[i+3]=0;
    }
  }
}
function flushLocalWetSmudge(layer){
  const s=smudgeBuffer,w=s?.work;window.WCGPUPaint?.sync(s,w);
  if(!w||!s.workDirty||!w.dirty)return;
  const b=w.dirty,x0=Math.max(0,b.x0),y0=Math.max(0,b.y0),bw=Math.min(WIDTH,b.x1)-x0,bh=Math.min(HEIGHT,b.y1)-y0;
  w.dirty=null;s.workDirty=false;
  if(bw<=0||bh<=0)return;
  if(isDrawing&&!strokeUndoRecord)strokeUndoRecord=saveUndo();
  s.moved=true;
  layer.ctx.putImageData(w.pixels,0,0,x0,y0,bw,bh);
  layer._livePixelsRev=layer.rasterRevision;
  window.WC65Effects?.changed(layer);if(layer.effects?.blur)window.WC65Effects?.syncAll();
  markUnsavedChanges();
}
function prepareLocalWetSmudge(layer,x,y){
  const s=smudgeBuffer;if(!s)return null;
  if(s.work)return s.work;
  if(isDrawing&&!strokeUndoRecord)strokeUndoRecord=saveUndo();
  if(layer.vectorStrokes?.length)flattenVectorLayer(layer);
  const pixels=ensureLayerLivePixels(layer);
  s.work={x:0,y:0,canvas:layer.canvas,ctx:layer.ctx,pixels,dirty:null};
  return s.work;
}
function wetSmudgeDabCPU(s,layer,work,tx,ty,weights,strength,pickupRate,hazeStrength,selected,baseLayer){
  const n=s.size,carrier=s.carrier,maskCtx=s.selectionMaskCtx;
  const xStart=Math.max(0,-tx),yStart=Math.max(0,-ty),xEnd=Math.min(n,WIDTH-tx),yEnd=Math.min(n,HEIGHT-ty);
  if(xEnd<=xStart||yEnd<=yStart)return false;
  s.dabCount=(s.dabCount||0)+1;
  if(s.mode==='wet'&&s.softness>0&&hazeStrength>.01&&(s.dabCount&1)===0)diffuseCarrierInPlace(s,hazeStrength);
  const dst=work.pixels.data,preserveCov=SMUDGE.preserveCoverage!==false;
  let selectionPixels=null,basePixels=null;
  if(maskCtx&&selected){
    maskCtx.clearRect(0,0,n,n);
    maskCtx.save();maskCtx.translate(-tx,-ty);maskCtx.fillStyle='#fff';maskCtx.fill(selected);maskCtx.restore();
    selectionPixels=maskCtx.getImageData(0,0,n,n).data;
  }
  if(baseLayer){
    if(!s.clipSample){s.clipSample=document.createElement('canvas');s.clipSample.width=s.clipSample.height=n;s.clipSampleCtx=s.clipSample.getContext('2d',{willReadFrequently:true});}
    const ref=s.clipSampleCtx;ref.clearRect(0,0,n,n);paintLayerRegion(ref,baseLayer,tx,ty,n,n);basePixels=ref.getImageData(0,0,n,n).data;
  }
  let changed=false;
  if(!selectionPixels&&!basePixels&&!layer.alphaLock){
    const wasmChanged=window.WinCreateRustEngine?.blendSmudgeTileWasm?.(dst,WIDTH,tx,ty,n,carrier,weights,strength,pickupRate,preserveCov);
    if(typeof wasmChanged==='boolean'){
      changed=wasmChanged;
    }else{
    for(let row=yStart;row<yEnd;row++){
      let p=row*n+xStart,ci=p*4,di=((ty+row)*WIDTH+(tx+xStart))*4;
      for(let col=xStart;col<xEnd;col++,p++,ci+=4,di+=4){
        const weight=weights[p];if(weight<=0)continue;
        const w=weight*strength,a=dst[di+3],ca=carrier[ci+3];
        if(!a&&!ca)continue;
        const dr=dst[di],dg=dst[di+1],db=dst[di+2],cr=carrier[ci],cg=carrier[ci+1],cb=carrier[ci+2];
        if(a===255&&ca===255){
          const nr=(dr+(cr-dr)*w+.5)|0,ng=(dg+(cg-dg)*w+.5)|0,nb=(db+(cb-db)*w+.5)|0;
          if(nr!==dr||ng!==dg||nb!==db){dst[di]=nr;dst[di+1]=ng;dst[di+2]=nb;changed=true;}
          const ex=pickupRate*weight;
          carrier[ci]=(cr+(dr-cr)*ex+.5)|0;carrier[ci+1]=(cg+(dg-cg)*ex+.5)|0;carrier[ci+2]=(cb+(db-cb)*ex+.5)|0;
          continue;
        }
        const inv=1-w,mass=a*inv+ca*w;
        if(mass>.001){
          const invMass=1/mass;
          dst[di]=(dr*a*inv+cr*ca*w)*invMass+.5;
          dst[di+1]=(dg*a*inv+cg*ca*w)*invMass+.5;
          dst[di+2]=(db*a*inv+cb*ca*w)*invMass+.5;
        }else dst[di]=dst[di+1]=dst[di+2]=0;
        let outA=mass;
        if(outA<a&&a>0)outA=preserveCov?a:outA+(a-outA)*(a/255)*(a/255);
        dst[di+3]=outA+.5;
        if(dst[di+3]!==a||((a||dst[di+3])&&(dst[di]!==dr||dst[di+1]!==dg||dst[di+2]!==db)))changed=true;
        const pickupScale=a<ca?Math.max(.22,a/255):1;
        const exchange=pickupRate*weight*pickupScale,remain=1-exchange,newMass=ca*remain+a*exchange;
        if(newMass>.001){
          const invNew=1/newMass;
          carrier[ci]=(cr*ca*remain+dr*a*exchange)*invNew+.5;
          carrier[ci+1]=(cg*ca*remain+dg*a*exchange)*invNew+.5;
          carrier[ci+2]=(cb*ca*remain+db*a*exchange)*invNew+.5;
        }else carrier[ci]=carrier[ci+1]=carrier[ci+2]=0;
        carrier[ci+3]=newMass+.5;
      }
    }
    }
  }else{
    for(let row=yStart;row<yEnd;row++){
      let p=row*n+xStart,ci=p*4,di=((ty+row)*WIDTH+(tx+xStart))*4;
      for(let col=xStart;col<xEnd;col++,p++,ci+=4,di+=4){
        const weight=weights[p];
        if(weight<=0||(selectionPixels&&!selectionPixels[ci+3])||(basePixels&&!basePixels[ci+3]))continue;
        const a=dst[di+3],ca=carrier[ci+3];
        if(layer.alphaLock&&!a)continue;
        let w=weight*strength;
        if(selectionPixels)w*=selectionPixels[ci+3]/255;
        if(basePixels)w*=basePixels[ci+3]/255;
        const dr=dst[di],dg=dst[di+1],db=dst[di+2],cr=carrier[ci],cg=carrier[ci+1],cb=carrier[ci+2];
        const inv=1-w,mass=a*inv+ca*w;
        if(mass>.001){
          const invMass=1/mass;
          dst[di]=(dr*a*inv+cr*ca*w)*invMass+.5;
          dst[di+1]=(dg*a*inv+cg*ca*w)*invMass+.5;
          dst[di+2]=(db*a*inv+cb*ca*w)*invMass+.5;
        }else dst[di]=dst[di+1]=dst[di+2]=0;
        let outA=layer.alphaLock?a:mass;
        if(!layer.alphaLock&&outA<a&&a>0)outA=preserveCov?a:outA+(a-outA)*(a/255)*(a/255);
        dst[di+3]=outA+.5;
        if(dst[di+3]!==a||((a||dst[di+3])&&(dst[di]!==dr||dst[di+1]!==dg||dst[di+2]!==db)))changed=true;
        const pickupScale=a<ca?Math.max(.22,a/255):1;
        const exchange=pickupRate*weight*pickupScale,remain=1-exchange,newMass=ca*remain+a*exchange;
        if(newMass>.001){
          const invNew=1/newMass;
          carrier[ci]=(cr*ca*remain+dr*a*exchange)*invNew+.5;
          carrier[ci+1]=(cg*ca*remain+dg*a*exchange)*invNew+.5;
          carrier[ci+2]=(cb*ca*remain+db*a*exchange)*invNew+.5;
        }else carrier[ci]=carrier[ci+1]=carrier[ci+2]=0;
        carrier[ci+3]=newMass+.5;
      }
    }
  }
  if(changed){
    const bx0=tx+xStart,by0=ty+yStart,bx1=tx+xEnd,by1=ty+yEnd,d=work.dirty;
    work.dirty=d?{x0:Math.min(d.x0,bx0),y0:Math.min(d.y0,by0),x1:Math.max(d.x1,bx1),y1:Math.max(d.y1,by1)}:{x0:bx0,y0:by0,x1:bx1,y1:by1};
  }
  return changed;
}
function wetSmudgeTo(layer,x,y,pressure=1,deferPresentation=false) {
  const s=smudgeBuffer;
  if (!s || !layer || s.layerId!==layer.id) return;
  if(brushOpacity<=0||(!s.sharpVector&&s.flow===0&&s.softness===0))return;
  if(s.sharpVector){pullVectorInk(layer,x,y,pressure);return;}
  const dx=x-s.x,dy=y-s.y,distance=Math.hypot(dx,dy);
  if(distance<.15)return;
  const steps=window.WinCreateRustEngine?.isEnabled?.()
    ?window.WinCreateRustEngine.planSmudgeSteps(dx,dy,s.radius,SMUDGE.spacing/65)
    :Math.min(4096,Math.max(1,Math.ceil(distance/s.spacing)));
  const n=s.size;
  const inputPressure=Math.pow(Math.max(0,Math.min(1,Number.isFinite(pressure)?pressure:1)),ENGINE.pressureGamma);
  if(inputPressure===0)return;
  const distanceScale=distance/steps/s.spacing;
  const strength=1-Math.pow(1-s.flow*inputPressure,distanceScale);
  const pickupRate=1-Math.pow(1-s.pickupRate,distanceScale);
  const hazeStrength=1-Math.pow(1-Math.min(.85,(brushOpacity/100)*inputPressure*s.softness/100*.72),distanceScale);
  const selected=window.WinCreate?.selectionPath||null;
  const baseIndex=layer.clipMask?layers.findIndex(it=>it.id===layer.id)-1:-1;
  const baseLayer=baseIndex>=0&&!layers[baseIndex].isFolder?layers[baseIndex]:null;
  const unconstrained=!selected&&!baseLayer&&!layer.alphaLock;
  for(let step=1;step<=steps;step++){
    const cx=s.x+dx*(step/steps),cy=s.y+dy*(step/steps);
    const work=prepareLocalWetSmudge(layer,cx,cy);if(!work)continue;
    const tx=Math.round(cx-(n-1)*.5),ty=Math.round(cy-(n-1)*.5);
    const weights=smudgeSubpixelWeights(s,cx,cy,tx,ty);
    if(unconstrained&&window.WCGPUPaint?.dab(s,layer,work,tx,ty,weights,strength,pickupRate,hazeStrength))continue;
    window.WCGPUPaint?.sync(s,work);
    const changed=wetSmudgeDabCPU(s,layer,work,tx,ty,weights,strength,pickupRate,hazeStrength,selected,baseLayer);
    if(changed)s.workDirty=true;
  }
  s.x=x;s.y=y;
  if(s.workDirty||s.gpuPending){
    const now=performance.now();
    if(!deferPresentation||!wetSmudgeLastPaintAt||now-wetSmudgeLastPaintAt>=4){
      const start=now;
      flushLocalWetSmudge(layer);
      const cost=performance.now()-start;
      wetSmudgePaintCost=wetSmudgePaintCost?wetSmudgePaintCost*.7+cost*.3:cost;
      WCPerf.observe(cost);wetSmudgeLastPaintAt=start;
    }else{
      scheduleWetSmudgePresentation(layer);
    }
    layer.thumbDirty=true;
  }
}
function setSmudgePreset(preset){
  if(!SMUDGE_PRESETS[preset])return;
  if(isDrawing)finishPointerStroke();
  Object.assign(SMUDGE,{preset,mode:'wet',...SMUDGE_PRESETS[preset]});
  syncSmudgeUI();saveSmudgeSettings();
  msg(`${SMUDGE.label} • Smudge brush`);
}
function syncSmudgeUI(){
  if($('smudgeBrushShape'))$('smudgeBrushShape').checked=SMUDGE.brushShape!==false;
  if($('smudgeInteractionSelect'))$('smudgeInteractionSelect').value=SMUDGE.mode;
  if($('editingSmudgeMode'))$('editingSmudgeMode').value=SMUDGE.mode;
  const select=$('smudgePresetSelect');if(select)select.value=SMUDGE.preset;
  for(const key of ['softness','pull','pickup']){
    const control=$(`smudge${key[0].toUpperCase()+key.slice(1)}Slider`);
    const label=$(`smudge${key[0].toUpperCase()+key.slice(1)}Value`);
    if(control)control.value=SMUDGE[key];
    if(label)label.textContent=SMUDGE[key]+'%';
  }
  window.WinCreate?.emit('smudgeSettingsChange');
}
function setupSmudgeSettings(){
  $('smudgeBrushShape')?.addEventListener('change',e=>{if(isDrawing)finishPointerStroke();SMUDGE.brushShape=e.target.checked;saveSmudgeSettings();syncSmudgeUI();});
  $('smudgeInteractionSelect')?.addEventListener('change',e=>{if(isDrawing)finishPointerStroke();SMUDGE.mode=e.target.value;saveSmudgeSettings();syncSmudgeUI();msg(SMUDGE.mode==='sharp'?'Sharp vector pull':'Wet pigment blend');});
  $('smudgePresetSelect')?.addEventListener('change',e=>setSmudgePreset(e.target.value));
  for(const key of ['softness','pull','pickup']){
    const cap=key[0].toUpperCase()+key.slice(1);
    $(`smudge${cap}Slider`)?.addEventListener('input',e=>{
      if(isDrawing)finishPointerStroke();SMUDGE[key]=Math.max(0,Math.min(100,+e.target.value||0));
      const label=$(`smudge${cap}Value`);if(label)label.textContent=SMUDGE[key]+'%';
      saveSmudgeSettings();
    });
  }
  $('smudgeHelpBtn')?.addEventListener('click',()=>{activateTool('smudge');togglePop('settings');switchSettingsTab('smudge',document.querySelector('[data-settings-tab="smudge"]'));});
  syncSmudgeUI();
}
setupSmudgeSettings();

function stampSymmetry(ctx, brId, x, y, r, color) {
  stampTip(ctx, brId, x, y, r, color);
  if (guideType === 'sym_v' || guideType === 'sym_quad') stampTip(ctx, brId, WIDTH - x, y, r, color);
  if (guideType === 'sym_quad') { stampTip(ctx, brId, x, HEIGHT - y, r, color); stampTip(ctx, brId, WIDTH - x, HEIGHT - y, r, color); }
  if (guideType === 'sym_radial') { const cx = WIDTH / 2, cy = HEIGHT / 2, dx = x - cx, dy = y - cy; for (let k = 1; k < 8; k++) { const a = k * (Math.PI / 4); stampTip(ctx, brId, cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a), r, color); } }
}

function stampQuadraticCurve(ctx, p0, p1, p2, r0, r1, color) {
  if (ENGINE.renderPipeline === 'vector' && currentTool === 'brush' && isVectorCompatibleBrush(getCurrentBrush()) && guideType === 'off') {
    ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, r0 + r1);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y); ctx.stroke(); ctx.restore(); return;
  }
  const br = getCurrentBrush(), chord = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
  let sm = (ENGINE.renderPipeline === 'subpixel' ? br.spacing * 0.55 : br.spacing)*WC65.brushConfig().spacing;
  if (ENGINE.chaikinSubdiv) sm *= 0.65;
  const steps = Math.max(1, Math.ceil(chord / Math.max(0.4, ((r0 + r1) * 0.5) * sm)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, inv = 1 - t;
    stampSymmetry(ctx, br.id, inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x, inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y, Math.max(0.125, r0 + (r1 - r0) * t), color);
  }
}

// Douglas–Peucker simplification of a closed hand-drawn contour.
function detectPolygonCorners(pts, tolerance) {
  if(pts.length<6)return [];
  const p=pts.slice(0,-1),start=p[0];
  let far=0,best=0;
  p.forEach((v,i)=>{const d=Math.hypot(v.x-start.x,v.y-start.y);if(d>best){best=d;far=i;}});
  if(far<1||far>=p.length-1)return [];
  const simplify=path=>{
    if(path.length<=2)return path;
    const a=path[0],b=path.at(-1),dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
    let max=0,index=-1;
    for(let i=1;i<path.length-1;i++){
      const t=n?Math.max(0,Math.min(1,((path[i].x-a.x)*dx+(path[i].y-a.y)*dy)/n)):0;
      const dist=Math.hypot(path[i].x-a.x-dx*t,path[i].y-a.y-dy*t);
      if(dist>max){max=dist;index=i;}
    }
    if(max<=tolerance||index<0)return [a,b];
    return [...simplify(path.slice(0,index+1)).slice(0,-1),...simplify(path.slice(index))];
  };
  const end=[...p.slice(far),start];
  return [...simplify(p.slice(0,far+1)).slice(0,-1),...simplify(end).slice(0,-1)];
}
function detectStrokeShapeKind(pts) {
  if(!pts || pts.length<2)return {kind:'line',minX:0,maxX:1,minY:0,maxY:1};
  const f=pts[0],l=pts[pts.length-1];
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
  const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
  const diag=Math.hypot(maxX-minX,maxY-minY)||1, span=Math.hypot(l.x-f.x,l.y-f.y);
  const base={minX,maxX,minY,maxY};
  // A closure must be near its starting point; otherwise diagonal loops can be false circles.
  if(pts.length>=7 && span<Math.max(2.5,diag*.24) && diag>5) {
    let perimeter=0;for(let i=1;i<pts.length;i++)perimeter+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
    const corners=detectPolygonCorners(pts,diag*.055);
    if(corners.length===3)return {...base,kind:'triangle'};
    if(corners.length===4)return {...base,kind:'rect'};
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2,rx=(maxX-minX)/2||1,ry=(maxY-minY)/2||1;
    const ellipseError=pts.reduce((sum,p)=>sum+Math.abs(Math.hypot((p.x-cx)/rx,(p.y-cy)/ry)-1),0)/pts.length;
    if(perimeter>diag*1.9 && ellipseError<.23)
      return {...base,kind:Math.abs(rx-ry)/Math.max(rx,ry)<.17?'circle':'ellipse'};
  }
  // Fit a quadratic Bezier through the stroke midpoint to detect open curved gestures.
  const ux=(l.x-f.x)/(span||1),uy=(l.y-f.y)/(span||1);
  let far=pts[Math.floor(pts.length/2)],dev=0;
  for(const p of pts){const d=Math.abs((p.x-f.x)*uy-(p.y-f.y)*ux);if(d>dev){dev=d;far=p;}}
  if(span>5 && dev>Math.max(1.5,span*.085)){
    const t=.5,control={x:2*far.x-.5*(f.x+l.x),y:2*far.y-.5*(f.y+l.y)};
    return {...base,kind:'curve',control};
  }
  return {...base,kind:'line'};
}
function quickShapeMinimumLength(){return Math.max(5,Math.min(14,brushSize*.7));}
function triggerQuickShape() {
  if(!isDrawing || splinePts.length<4 || rawStrokeLen<quickShapeMinimumLength() || currentTool!=='brush')return;
  quickShapeActive=true;stopLiveVectorPreview();strokeCanVectorize=false;
  const det=detectStrokeShapeKind(splinePts);quickShapeKind=det.kind;
  SHAPE_EDITOR.strokeR=getStrokeMatchedRadius(splinePts);
  msg(`QuickShape: ${quickShapeKind.toUpperCase()} — release to adjust`);
  drawQuickShapePreview(splinePts[splinePts.length-1]);
}
function drawQuickShapePreview(endPt) {
  clearScratchBuffer();const det=detectStrokeShapeKind(splinePts),f=splinePts[0];
  const kind=quickShapeKind==='curve'?'curve':quickShapeKind;
  const spec=vectorShapeSpec(kind,det,f,endPt,det.control);
  showVectorGeometry(spec,(SHAPE_EDITOR.strokeR||getStrokeMatchedRadius(splinePts))*2,SHAPE_EDITOR.filled);
}

function commitScratchToActiveLayer() {
  const l = getActiveLayer();
  if (l && !l.isFolder) {
    if (['brush', 'eraser'].includes(currentTool)) {
      const idx = layers.findIndex(x => x.id === l.id), br = getCurrentBrush();
      const useVectorStroke = currentTool === 'brush' && strokeCanVectorize && ENGINE.vectorBrushes && ENGINE.renderPipeline === 'vector' && guideType === 'off' && !l.alphaLock && !l.clipMask && splinePts.length > 0;
      if (useVectorStroke) {
        const sampled = vectorStrokeSamples(splinePts);
        const avgR = sampled.reduce((a, p) => a + (p.r || brushSize * 0.5), 0) / Math.max(1, sampled.length);
        l.vectorStrokes.push({
          id: 'vs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          brushId: br.id,
          color: currentColor,
          width: Math.max(0.25, avgR * 2),
          opacity: (brushOpacity / 100) * br.alpha,
          points: sampled.map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), r: +((p.r || avgR).toFixed(3)) })),
          svgPath: buildPressureOutlinePath(sampled.map(p=>({x:+p.x.toFixed(3),y:+p.y.toFixed(3),r:+(p.r||avgR).toFixed(3)}))),
          fill: true, outline: true
        });
        renderVectorLayer(l);
      } else {
        if(currentTool==='eraser'){
          const sampled=vectorStrokeSamples(splinePts),eraseRecord={width:brushSize,opacity:brushOpacity/100,selectionPoints:structuredClone(window.WinCreate?.selectionPoints||null),points:sampled.map(p=>({x:+p.x.toFixed(3),y:+p.y.toFixed(3),r:+(p.r??brushSize/2).toFixed(3)}))};
          const region=getStrokeBounds({points:sampled,width:brushSize});
          for(const st of l.vectorStrokes||[]){const b=getStrokeBounds(st);if(!region||!b||b.x1<region.x0||b.x0>region.x1||b.y1<region.y0||b.y0>region.y1)continue;st.erasures ||= [];st.erasures.push(structuredClone(eraseRecord));}
          renderVectorLayer(l);
          l.ctx.save();if(window.WinCreate?.selectionPath)l.ctx.clip(WinCreate.selectionPath);
          l.ctx.globalCompositeOperation='destination-out';l.ctx.globalAlpha=brushOpacity/100;l.ctx.fillStyle='#000000';fillErasureMask(l.ctx,eraseRecord);l.ctx.restore();
        }else commitRasterBrush(l);
      }
    }
    l.thumbDirty = true;
  }
  syncLayers();
  recordBrushInArtworkHistory();
  markUnsavedChanges();
  clearScratchBuffer();
  stopLiveVectorPreview();
  if ($('layersPopover')?.classList.contains('open')) renderLayers();
  if (window.WinCreate) WinCreate.emit('strokeCommit', { layer: l, tool: currentTool });
}

function appendStrokePoint(point){
  splinePts.push(point);
  if(currentTool==='smudge'||strokeCanVectorize)return;
  const color=currentColor,n=splinePts.length;
  if(n===2){const p0=splinePts[0],p1=splinePts[1],mid={x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2};stampQuadraticCurve(scratchCtx,p0,{x:(p0.x+mid.x)/2,y:(p0.y+mid.y)/2},mid,p0.r,p1.r,color);}
  else if(n>=3){const p0=splinePts[n-3],p1=splinePts[n-2],p2=splinePts[n-1],a={x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2},b={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};stampQuadraticCurve(scratchCtx,a,p1,b,p0.r,p1.r,color);}
}
let lastStrokeSampleTime=0, lastPenPressure=.5;
viewportEl.addEventListener('pointerover',e=>{if(e.pointerType==='pen')penInRangeUntil=performance.now()+1300;});
viewportEl.addEventListener('pointerdown', e => {
  if(WC65.busy||touchPinchDist>0||fillBusy||activeDrawingPointer!==null)return;
  // When a pen is present, nearby hand contact must not paint.
  if(e.pointerType==='touch' && performance.now()<penInRangeUntil)return;
  if(e.pointerType==='pen')penInRangeUntil=performance.now()+1300;
  if (e.target.closest('.floating-ui') || e.target.closest('.popover') || e.target.closest('.ios-layer-menu-sheet')) return;
  if (SHAPE_EDITOR.active && e.target.closest('#shapeEditOverlay')) return;
  const penEraseButton=e.pointerType==='pen' && (e.button===5 || e.button===2 || (e.buttons&32)!==0);
  if(e.button!==undefined && e.button!==0 && e.button!==1 && !penEraseButton)return;
  if(penEraseButton && !temporaryPenEraser){temporaryPenEraser=currentTool;activateTool('eraser');}
  e.preventDefault(); closePops(false);
  if (SHAPE_EDITOR.active) {commitEditableShape();return;}
  if (isSpace || e.button === 1) { isPanning = true; panStart = { x: e.clientX - panX, y: e.clientY - panY }; return; }
  const pt = getCanvasPoint(e);WC65.beginStroke(pt);
  // Do not start strokes from the workspace outside the rotated canvas.
  if ((pt.x < 0 || pt.y < 0 || pt.x >= WIDTH || pt.y >= HEIGHT) && !modActive && !e.altKey) return;
  if (modActive || e.altKey) {
    const hex = pickCanvasPixel(pt.x, pt.y);
    Object.assign($('loupe').style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px' });
    $('loupeTop').style.background = hex; $('loupeBot').style.background = currentColor; setColor(hex);
    return;
  }
  if(['eraser','smudge'].includes(currentTool)&&brushOpacity<=0)return;
  if(TOOL_TARGET.mode==='active'&&['eraser','smudge'].includes(currentTool)&&layers.some(l=>l.id===activeLayerId&&l.isFolder))return;
  let l = resolveEditingLayer(pt.x,pt.y);
  if(!l){const ghost=$('animGhost');if(ghost&&!ghost.hidden)msg('Onion-skin images are guides. Select their frame to edit them.');else if(TRACE.hasImage&&TRACE.visible)msg('Reference images are guides. Stamp the image into a paint layer to erase it.');}
  editingTargetPending=!l&&['eraser','smudge'].includes(currentTool)&&TOOL_TARGET.mode==='auto';
  l ||= getActiveLayer();if(!l||l.isFolder||(!editingTargetPending&&!isLayerEffectivelyVisible(l)))return;
  try { viewportEl.setPointerCapture(e.pointerId); } catch (_) {}
  strokeSavedState={unsaved:hasUnsavedChanges,label:$('saveStatusText')?.textContent||'Saved'};
  strokeUndoRecord=editingTargetPending||currentTool==='smudge'?null:saveUndo(); activeDrawingPointer=e.pointerId; isDrawing = true; quickShapeActive = false; rawStrokeLen = 0;
  strokeCanVectorize = currentTool === 'brush' && isVectorCompatibleBrush(getCurrentBrush()) && ENGINE.vectorBrushes && ENGINE.renderPipeline === 'vector' && guideType === 'off' && !l.alphaLock && !l.clipMask && !window.WinCreate?.selectionPath;
  document.body.classList.add('drawing-active');
  if (currentTool === 'transform') { moveSnap = document.createElement('canvas'); moveSnap.width = WIDTH; moveSnap.height = HEIGHT; moveSnap.getContext('2d').drawImage(l.canvas, 0, 0); moveVectorStart = structuredClone(l.vectorStrokes || []); moveMaskStart=structuredClone(l.layerMask||null); moveStart = pt; return; }
  // Preserve vectors for erasing, smudging and transforms. For a Path2D selection,
  // raster fallback is necessary until selections can be represented as SVG masks.

  if (currentTool === 'smudge'&&!editingTargetPending) beginWetSmudge(l, pt.x, pt.y);
  const rawPressure = (e.pointerType === 'pen' && e.pressure > 0) ? Math.max(0.08, e.pressure) : (e.pointerType==='pen'?0.5:0.85);
  if(e.pointerType==='pen')lastPenPressure=rawPressure;
  const startTilt=Math.min(85,Math.hypot(e.tiltX||0,e.tiltY||0));
  const startR = Math.max(0.125, (brushSize * 0.5) * Math.pow(rawPressure, ENGINE.pressureGamma) * (1+startTilt/85*WC65.brushConfig().tilt) * (1 - (+($('taperRange')?.value || 20) / 100) * 0.25)), br = getCurrentBrush();
  lastStrokeSampleTime=e.timeStamp;
  splinePts = [{ x: pt.x, y: pt.y, r: startR }]; smoothPt = { x: pt.x, y: pt.y }; lastRawPt = { x: pt.x, y: pt.y };
  if (currentTool !== 'smudge') {
    scratchCanvas.style.opacity = (brushOpacity / 100) * br.alpha; clearScratchBuffer();
    if (strokeCanVectorize) scratchCanvas.style.visibility='hidden';
    else stampSymmetry(scratchCtx, br.id, pt.x, pt.y, startR, currentColor);
    updateLiveVectorPreview();
  }
});

window.addEventListener('pointermove', e => {
  if ($('loupe').style.display === 'block') { const pt = getCanvasPoint(e), hex = pickCanvasPixel(pt.x, pt.y); Object.assign($('loupe').style, { left: e.clientX + 'px', top: e.clientY + 'px' }); $('loupeTop').style.background = hex; setColor(hex); return; }
  if (isPanning) { panX = e.clientX - panStart.x; panY = e.clientY - panStart.y; updateViewTransform(); return; }
  if (!isDrawing || (activeDrawingPointer!==null && e.pointerId!==activeDrawingPointer)) return;
  if(e.pointerType==='pen')penInRangeUntil=performance.now()+1300;
  const t0 = performance.now(), inputMapping=canvasInputMapping();
  const pt = getCanvasPoint(e,inputMapping);
  acquirePendingEditingLayer(pt);
  const l = getActiveLayer();
  if (currentTool === 'transform' && moveSnap) {
    const dx=pt.x-moveStart.x,dy=pt.y-moveStart.y;
    l.ctx.clearRect(0,0,WIDTH,HEIGHT);l.ctx.drawImage(moveSnap,dx,dy);
    l.layerMask=structuredClone(moveMaskStart);WCLayerMasks.transform(l,1,1,dx,dy);WCLayerMasks.sync(l);
    if (moveVectorStart?.length) {
      l.vectorStrokes=structuredClone(moveVectorStart);
      for (const st of l.vectorStrokes) {
        for (const p of st.points||[]) {p.x+=dx;p.y+=dy;}
        adjustVectorTransform(st,1,1,dx,dy);
        for (const er of st.erasures||[])for(const p of [...(er.points||[]),...(er.selectionPoints||[])]){p.x+=dx;p.y+=dy;}
      }
      renderVectorLayer(l);
    }
    return;
  }
  if (quickShapeActive) { splinePts[splinePts.length - 1] = { x: pt.x, y: pt.y, r: SHAPE_EDITOR.strokeR }; drawQuickShapePreview(pt); return; }
  const coalesced = (ENGINE.coalescedInput && e.getCoalescedEvents) ? e.getCoalescedEvents() : null;
  const events = (coalesced && coalesced.length > 0) ? coalesced : [e], baseFollow = currentTool === 'smudge' ? .96 : 1 - (+($('streamRange')?.value || 35) / 100) * 0.65, ta = +($('taperRange')?.value || 20) / 100;
  events.forEach(ev => {
    const ep = WC65.assist(getCanvasPoint(ev,inputMapping)), rawStep = Math.hypot(ep.x - lastRawPt.x, ep.y - lastRawPt.y); rawStrokeLen += rawStep;
    if (rawStep > .35) { lastRawPt = { x: ep.x, y: ep.y }; clearTimeout(quickShapeTimer); if (rawStrokeLen > quickShapeMinimumLength() && currentTool === 'brush') quickShapeTimer = setTimeout(triggerQuickShape, ENGINE.quickShapeDelay); }
    const dt=Math.max(1,Math.min(40,(ev.timeStamp-lastStrokeSampleTime)||8.333));lastStrokeSampleTime=ev.timeStamp;const follow=WC65.follow(baseFollow,rawStep/dt);const sf=1-Math.pow(1-follow,dt/8.333);
    smoothPt.x += (ep.x - smoothPt.x) * sf; smoothPt.y += (ep.y - smoothPt.y) * sf;
    const prev = splinePts[splinePts.length - 1], dist = Math.hypot(smoothPt.x - prev.x, smoothPt.y - prev.y); if (dist < 0.25) return;
    const rawPr = ev.pointerType==='pen' ? (ev.pressure>0 ? Math.max(0.08,ev.pressure) : lastPenPressure) : .85;
    if(ev.pointerType==='pen'&&ev.pressure>0)lastPenPressure=rawPr;
    // Tilt is used as a very gentle nib size multiplier; pressure remains primary.
    const tilt=Math.min(85,Math.hypot(ev.tiltX||0,ev.tiltY||0));
    const speed=dist/dt,velocityTaper=ev.pointerType==='pen'?Math.max(.55,1-speed*.018*ta):1;
    const targetRadius=Math.max(.125,(brushSize*.5)*Math.pow(rawPr,ENGINE.pressureGamma*WC65.brushConfig().pressure)*(1+tilt/85*WC65.brushConfig().tilt)*velocityTaper),radiusFollow=1-Math.pow(.65,dt/8.333);
    const sr=prev.r+(targetRadius-prev.r)*radiusFollow;
    appendStrokePoint({x:smoothPt.x,y:smoothPt.y,r:sr});
    if(currentTool==='smudge'&&!editingTargetPending)wetSmudgeTo(l,smoothPt.x,smoothPt.y,ev.pointerType==='pen'?rawPr:1,true);
  });
  if(currentTool!=='smudge')scheduleLiveVectorPreview();
  lastStrokeLatencyMs = performance.now() - t0;
});

function cancelPointerForGesture(){
  if(!isDrawing)return;
  if(pendingWetSmudgeFrame){cancelAnimationFrame(pendingWetSmudgeFrame);pendingWetSmudgeFrame=0;}
  const record=strokeUndoRecord,savedState=strokeSavedState;strokeUndoRecord=null;strokeSavedState=null;isDrawing=false;
  stopLiveVectorPreview();clearScratchBuffer();clearTimeout(quickShapeTimer);
  activeDrawingPointer=null;editingTargetPending=false;quickShapeActive=false;
  moveSnap=null;moveVectorStart=null;window.WCGPUPaint?.release(smudgeBuffer,false);smudgeBuffer=null;
  if(pendingVectorSmudgeFrame){cancelAnimationFrame(pendingVectorSmudgeFrame);pendingVectorSmudgeFrame=0;}
  document.body.classList.remove('drawing-active');
  if(record?.animation)WinCreate.animation.cancelEdit(record.token);
  else if(record&&undoStack.at(-1)===record.snapshot){undoStack.pop();restoreStudioSnapshot(record.snapshot);redoStack=record.previousRedo;}
  if(savedState&&!savedState.unsaved)markSavedStatus(savedState.label);
}
function finishPointerStroke(e) {
  if(isDrawing&&e&&activeDrawingPointer!==null&&e.pointerId!==activeDrawingPointer)return;
  if(isDrawing&&editingTargetPending&&e?.type==='pointerup')acquirePendingEditingLayer(getCanvasPoint(e));
  if (isDrawing && currentTool === 'smudge' && e && e.type === 'pointerup' && smudgeBuffer) {
    const l = getActiveLayer(), pt = getCanvasPoint(e);
    if (l && Number.isFinite(pt.x) && Number.isFinite(pt.y)) wetSmudgeTo(l, pt.x, pt.y, e.pointerType === 'pen' ? (e.pressure>0?e.pressure:lastPenPressure) : 1);
  }
  if(isDrawing&&currentTool==='smudge'&&smudgeBuffer)finishWetSmudgePresentation(getActiveLayer());
  if(isDrawing&&e?.type==='pointerup'&&currentTool==='brush'&&!quickShapeActive)WC65.finishStroke();
  if(isDrawing&&e?.type==='pointerup'&&['brush','eraser'].includes(currentTool)&&!quickShapeActive&&splinePts.length){
    const end=getCanvasPoint(e),last=splinePts.at(-1);if(Number.isFinite(end.x)&&Number.isFinite(end.y)&&Math.hypot(end.x-last.x,end.y-last.y)>.05)appendStrokePoint({x:end.x,y:end.y,r:last.r});
  }
  document.body.classList.remove('drawing-active');
  if ($('loupe').style.display === 'block') { $('loupe').style.display = 'none'; modActive = false; $('modifyBtn')?.classList.remove('active'); }
  isPanning = false; clearTimeout(quickShapeTimer);
  activeDrawingPointer=null;
  if(temporaryPenEraser){const back=temporaryPenEraser;temporaryPenEraser=null;queueMicrotask(()=>activateTool(back));}
  if(!isDrawing)return;isDrawing=false;strokeUndoRecord=null;strokeSavedState=null;
  if(editingTargetPending){editingTargetPending=false;clearScratchBuffer();stopLiveVectorPreview();return;}
  moveSnap = null; moveVectorStart = null;
  if (quickShapeActive && currentTool === 'brush') {
    stopLiveVectorPreview();
    const det = detectStrokeShapeKind(splinePts);
    const matchedR = getStrokeMatchedRadius(splinePts);
    if(ENGINE.quickShapeInteractive){openEditableShapeSession(quickShapeKind,splinePts[0],splinePts[splinePts.length-1],det,matchedR);return;}
    const spec=vectorShapeSpec(quickShapeKind,det,splinePts[0],splinePts[splinePts.length-1],det.control);
    addVectorShapeToLayer(getActiveLayer(),spec,quickShapeKind,matchedR*2,currentColor,(brushOpacity/100)*getCurrentBrush().alpha,SHAPE_EDITOR.filled);
    hideVectorGeometry();clearScratchBuffer();markUnsavedChanges();return;
  }
  if (splinePts.length >= 2 && currentTool !== 'transform' && currentTool !== 'smudge' && !quickShapeActive) {
    const n1 = splinePts[splinePts.length - 2], n2 = splinePts[splinePts.length - 1], m1 = { x: (n1.x + n2.x) * 0.5, y: (n1.y + n2.y) * 0.5 };
    if(!strokeCanVectorize)stampQuadraticCurve(currentTool === 'smudge' ? getActiveLayer().ctx : scratchCtx, m1, n2, n2, n1.r, n2.r, currentTool === 'smudge' ? smudgeHex : currentColor);
  }
  if(currentTool==='smudge'&&!smudgeBuffer?.moved){smudgeBuffer=null;return;}
  if (currentTool === 'smudge') {
    if(pendingVectorSmudgeFrame){cancelAnimationFrame(pendingVectorSmudgeFrame);pendingVectorSmudgeFrame=0;}
    if(smudgeBuffer?.sharpVector)renderVectorLayer(getActiveLayer());
    smudgeBuffer = null;
  }
  commitScratchToActiveLayer();
}
window.addEventListener('pointerup', finishPointerStroke);
window.addEventListener('pointercancel', finishPointerStroke);
viewportEl.addEventListener('lostpointercapture',e=>{if(isDrawing&&e.pointerId===activeDrawingPointer)finishPointerStroke(e);});
function releaseInterruptedInput(){if(isDrawing)finishPointerStroke();touchPinchDist=0;touchLastMid=null;touchTapGesture=null;isSpace=false;isPanning=false;activeDrawingPointer=null;}
window.addEventListener('blur',releaseInterruptedInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInterruptedInput();});

// Export has one rendering path for Windows and Android so results match.
function flushPendingPaint(){const s=smudgeBuffer;if(s?.localWet){const layer=layers.find(l=>l.id===s.layerId);if(layer)flushLocalWetSmudge(layer);}}
function createFlattenedArtworkCanvas() {
  flushPendingPaint();
  if (SHAPE_EDITOR.active) {commitEditableShape();return;}
  const out = document.createElement('canvas'); out.width = WIDTH; out.height = HEIGHT;
  const ctx = create2DContext(out, false);
  if (bgVisible) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
  layers.forEach(l => { if (!l.isFolder && l.canvas && isLayerEffectivelyVisible(l)) {
    ctx.save(); ctx.globalAlpha = getEffectiveLayerOpacity(l);
    ctx.globalCompositeOperation = l.blend === 'normal' ? 'source-over' : l.blend;
    ctx.drawImage(createLayerComposite(l),0,0); ctx.restore();
  }});
  return out;
}
function artworkPngBlob() {
  return new Promise((resolve, reject) => {
    try { createFlattenedArtworkCanvas().toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'); }
    catch(e) { reject(e); }
  });
}
// File/Gallery exports are installed by file-export.js after the core API.

function resizeStudioCanvas(newW, newH, mode = 'anchor', newBg = bgColor, newBgVis = bgVisible) {
  if ((window.WinCreate?.animation?.enabled && !window.WinCreate.animation.suspended)) { msg('Animation canvas size is fixed. Create a new canvas for another size.'); return; }
  if (SHAPE_EDITOR.active) {commitEditableShape();return;}
  saveFullStateUndo();

  const oldW = WIDTH, oldH = HEIGHT;
  WIDTH = Math.min(8192, Math.max(64, Math.round(newW || WIDTH)));
  HEIGHT = Math.min(8192, Math.max(64, Math.round(newH || HEIGHT)));
  bgColor = newBg || bgColor;
  bgVisible = newBgVis;

  const snapshots = layers.filter(l => !l.isFolder && l.canvas).map(l => {
    const tmp = document.createElement('canvas');
    tmp.width = oldW; tmp.height = oldH;
    tmp.getContext('2d').drawImage(l.canvas, 0, 0);
    return { layer: l, canvas: tmp, vectorStrokes: structuredClone(l.vectorStrokes || []) };
  });

  board.style.width = WIDTH + 'px';
  board.style.height = HEIGHT + 'px';
  [bgCanvas, traceCanvas, guideCanvas].forEach(c => { c.width = WIDTH; c.height = HEIGHT; });
  configureScratchSSAA();

  snapshots.forEach(({ layer, canvas, vectorStrokes }) => {
    layer.canvas.width = WIDTH;
    layer.canvas.height = HEIGHT;
    layer.rasterRevision++;
    applyContextSmoothing(layer.ctx);
    if(mode==='reset'){layer.vectorStrokes=[];renderVectorLayer(layer);}
    if (mode === 'stretch') layer.ctx.drawImage(canvas, 0, 0, oldW, oldH, 0, 0, WIDTH, HEIGHT);
    else if (mode === 'anchor') layer.ctx.drawImage(canvas, Math.round((WIDTH - oldW) * 0.5), Math.round((HEIGHT - oldH) * 0.5));
    if (mode!=='reset' && vectorStrokes?.length) {
      const sx = mode === 'stretch' ? WIDTH / oldW : 1, sy = mode === 'stretch' ? HEIGHT / oldH : 1;
      const ox = mode === 'anchor' ? (WIDTH - oldW) * 0.5 : 0, oy = mode === 'anchor' ? (HEIGHT - oldH) * 0.5 : 0;
      layer.vectorStrokes = vectorStrokes.map(st => {
        const next={...st,width:st.width*(mode==='stretch'?(sx+sy)*.5:1),
          points:(st.points||[]).map(pt=>({...pt,x:pt.x*sx+ox,y:pt.y*sy+oy,r:pt.r?pt.r*(sx+sy)*.5:pt.r})),
          erasures:(st.erasures||[]).map(er=>({...er,width:er.width*(sx+sy)*.5,
            points:(er.points||[]).map(pt=>({...pt,x:pt.x*sx+ox,y:pt.y*sy+oy})),selectionPoints:er.selectionPoints?.map(pt=>({x:pt.x*sx+ox,y:pt.y*sy+oy}))}))};
        adjustVectorTransform(next,sx,sy,ox,oy);
        return next;
      });
      renderVectorLayer(layer);
    }
    if(mode==='reset')layer.layerMask=null;else WCLayerMasks.transform(layer,mode==='stretch'?WIDTH/oldW:1,mode==='stretch'?HEIGHT/oldH:1,mode==='anchor'?(WIDTH-oldW)*.5:0,mode==='anchor'?(HEIGHT-oldH)*.5:0);
    layer.thumbDirty = true;
  });

  drawBackground();
  if (TRACE.hasImage) renderTraceReference();
  drawGuides();
  syncLayers();
  renderLayers();
  fitCanvasFullscreen();
  markUnsavedChanges();
  msg(`Canvas Resized: ${WIDTH}×${HEIGHT}px`);
  window.WinCreate.selectionPath=null;window.WinCreate.selectionPoints=null;
  WinCreate.emit('canvasResize', { width: WIDTH, height: HEIGHT });
}

window.WinCreate = {
  version: '6.6.0',
  getKeyboardShortcuts() { return { ...KEYBINDS }; },
  get isRecordingShortcut() { return Boolean(listeningKeyAction); },
  selectionPath: null,
  get state() {
    return {
      WIDTH, HEIGHT, bgColor, bgVisible, layers, activeLayer: getActiveLayer(),
      currentColor, brushSize, brushOpacity, scale, rotation, ENGINE, TRACE, SHAPE_EDITOR, editRevision,
      artworkBrushHistory, SMUDGE
    };
  },
  setArtworkBrushHistory(hist) {
    artworkBrushHistory = Array.isArray(hist) ? hist : [];
    renderBrushLibrary();
  },
  selectLayer(id){if(layers.some(l=>l.id===id&&!l.isFolder)){activeLayerId=id;selectedLayerIds.clear();selectedLayerIds.add(id);renderLayers();}},
  activateTool,setBrushSize,fitCanvasFullscreen,
  flushPendingPaint, createLayerComposite, prepareRasterCommands, msg, saveUndo, saveFullStateUndo, createLayer, createFolderLayer, getActiveLayer, renderLayers, syncLayers, renderVectorLayer, paintVectorStrokesToContext, flattenVectorLayer,
  drawBackground, setBgColor, initializeStudioCanvas, resizeStudioCanvas, setColor, setCanvasRotation,
  togglePop, closePops, spawnInteractiveShape, goToPage, markUnsavedChanges, markSavedStatus,
  on(event, fn) { (EVENT_BUS[event] = EVENT_BUS[event] || []).push(fn); return this; },
  emit(event, data) { (EVENT_BUS[event] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); return this; },
  use(pluginFn, options = {}) { try { pluginFn(this, options); } catch (e) { console.error('Plugin error:', e); } return this; },
  registerBrush(category, brushConfig, customStampFn = null) {
    if (!BRUSHES[category]) BRUSHES[category] = [];
    if (!BRUSHES[category].some(b => b.id === brushConfig.id)) BRUSHES[category].push(brushConfig);
    BRUSH_LOOKUP.set(brushConfig.id,BRUSHES[category].find(b=>b.id===brushConfig.id));
    if (customStampFn) CUSTOM_BRUSH_TIPS[brushConfig.id] = customStampFn;
    renderBrushLibrary(); return this;
  },
  registerShape(id, label, vertexBuilderFn) {
    CUSTOM_SHAPES[id] = vertexBuilderFn;
    const wrap = $('quickShapeButtonsWrap');
    if (wrap && !wrap.querySelector(`[data-qshape="${id}"]`)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'blend-chip'; b.dataset.qshape = id; b.textContent = label;
      bindQuickShapeButton(b); wrap.appendChild(b);
    }
    return this;
  },
  registerToolbarButton({ bar = 'topLeftBar', id, label, title = '', className = '', beforeId = null, onClick }) {
    const targetBar = $(bar); if (!targetBar) return this;
    const existing = id ? $(id) : null;
    if (existing) existing.remove();
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = `ios-icon-btn ${className}`.trim();
    if (id) btn.id = id; if (title) btn.title = title; btn.innerHTML = label;
    if (onClick) btn.onclick = e => onClick(e, this);
    const refEl = beforeId ? $(beforeId) : null;
    if (refEl && refEl.parentNode === targetBar) targetBar.insertBefore(btn, refEl);
    else targetBar.appendChild(btn);
    return this;
  },
  registerPopover({ name, title, width = 300, left = '160px', top = '64px', persistent = false, html = '', onInit }) {
    let pop = $(`${name}Popover`);
    if (!pop) {
      pop = document.createElement('div'); pop.className = 'popover'; pop.id = `${name}Popover`;
      $('pageStudio').appendChild(pop);
    }
    Object.assign(pop.style, { width: typeof width === 'number' ? `${width}px` : width, left, top });
    pop.innerHTML = `<div class="ios-sheet-header"><span>⋮⋮ ${title}</span><button type="button" class="pop-close-btn">✕</button></div>${html}`;
    popovers[name] = pop;
    if (persistent) PERSISTENT_POPS.add(name);
    makeElementDraggable(pop, '.ios-sheet-header');
    const closeBtn = pop.querySelector('.pop-close-btn');
    if (closeBtn) closeBtn.onclick = () => togglePop(name);
    if (onInit) onInit(pop, this);
    return this;
  },
  registerPreset(presetObj) { addCanvasPresetTile(presetObj); return this; }
};

function initializeStudioCanvas(title, w, h, bg, switchToStudio = true) {
  if(isDrawing)finishPointerStroke();
  activeDrawingPointer=null;editingTargetPending=false;stopLiveVectorPreview();
  WinCreate.selectionPath=null;WinCreate.selectionPoints=null;
  if (SHAPE_EDITOR.active) cancelEditableShape();
  WIDTH = Math.min(8192,Math.max(64,Math.round(w || window.innerWidth || 1280)));
  HEIGHT = Math.min(8192,Math.max(64,Math.round(h || window.innerHeight || 800)));
  bgColor = bg || '#ffffff'; bgVisible = true; bgImageCanvas = null;
  board.style.width = WIDTH + 'px'; board.style.height = HEIGHT + 'px';
  [bgCanvas, traceCanvas, guideCanvas].forEach(c => { c.width = WIDTH; c.height = HEIGHT; });
  configureScratchSSAA();
  vectorGeometrySvg.setAttribute('viewBox',`0 0 ${WIDTH} ${HEIGHT}`);
  layers.forEach(l => { (l.surface?.parentElement?.classList.contains('wc-folder-mask-wrapper')?l.surface.parentElement:l.surface)?.remove();l.canvas?.remove();l.vectorSvg?.remove(); });
  layers = []; layerSeq = 1; folderSeq = 1; undoStack = []; redoStack = [];
  artworkBrushHistory = [];
  drawBackground(); if (TRACE.hasImage) renderTraceReference();
  createLayer('Artwork 1'); drawGuides();
  if (switchToStudio) goToPage('pageStudio');
  fitCanvasFullscreen();
  markSavedStatus('Ready');
  if (switchToStudio) msg(`${title} (${WIDTH}×${HEIGHT})`);
  WinCreate.emit('canvasInit', { title, width: WIDTH, height: HEIGHT, bg });
}

// Start on Launchpad (pageSetup) with background canvas ready
initializeStudioCanvas('Full Screen White', window.innerWidth, window.innerHeight, '#ffffff', false);
goToPage('pageSetup');

// The browser owns final GPU routing. This probe provides live WebGL2 & WebGPU diagnostics
// and independent Drawing Engine GPU Acceleration controls inside Studio Preferences.
(async function initGraphicsDiagnostics(){
  const adapterLabel=$('activeAdapterText'),result=$('gpuProbeStatus'),hint=$('gpuPreferenceSelect');
  const gpuPanePower=$('gpuPanePowerSelect');
  const drawingSwitch=$('gpuDrawingAccelSwitch');
  const wetSwitch=$('gpuWetPaintAccelSwitch');
  const effectsSwitch=$('gpuEffectsAccelSwitch');
  if(hint)hint.value=ENGINE.gpuPreference;
  if(gpuPanePower)gpuPanePower.value=ENGINE.gpuPreference;
  const safeSet=(el,val)=>{if(el)el.textContent=val;};
  let probeCounter=0;

  function syncSwitchEl(el,on){
    if(!el)return;
    el.classList.toggle('on',!!on);
    el.setAttribute('aria-checked',String(!!on));
  }

  function applyDrawingGpuControls(announce=false){
    const drawingOn=!!ENGINE.gpuDrawingEnabled;
    const wetOn=drawingOn&&!!ENGINE.gpuWetPaintEnabled;
    const effectsOn=drawingOn&&!!ENGINE.gpuEffectsEnabled;
    syncSwitchEl(drawingSwitch,drawingOn);
    syncSwitchEl(wetSwitch,ENGINE.gpuWetPaintEnabled);
    syncSwitchEl(effectsSwitch,ENGINE.gpuEffectsEnabled);
    if(wetSwitch)wetSwitch.style.opacity=drawingOn?'1':'0.5';
    if(effectsSwitch)effectsSwitch.style.opacity=drawingOn?'1':'0.5';

    const targetBackend=drawingOn?'accelerated':'readback';
    if(ENGINE.canvasBackend!==targetBackend&&!isDrawing&&!fillBusy){
      ENGINE.canvasBackend=targetBackend;
      if($('canvasBackendSelect'))$('canvasBackendSelect').value=targetBackend;
      for(const l of layers){
        if(l.isFolder||!l.canvas)continue;
        const old=l.canvas,fresh=document.createElement('canvas');
        fresh.width=old.width;fresh.height=old.height;fresh.className=old.className;
        fresh.style.cssText=old.style.cssText;
        const ctx=create2DContext(fresh,true);
        applyContextSmoothing(ctx);
        ctx.drawImage(old,0,0);
        old.replaceWith(fresh);
        l.canvas=fresh;l.ctx=ctx;l._tracked=false;trackLayerPixels(l);l.rasterRevision=1;PIXEL_SNAPSHOTS.delete(l);l.thumbDirty=true;
      }
      syncLayers();renderLayers();
    }
    window.WCGPUPaint?.setMode?.(wetOn?'gpu':'cpu');
    if(!effectsOn)window.WC65GPU?.reset?.();
    persistEnginePreferences();

    const stateEl=$('gpuPaneEngineState');
    if(stateEl){
      stateEl.textContent=drawingOn?'GPU Accelerated (Active)':'Disabled · Software CPU Pipeline';
      stateEl.style.color=drawingOn?'var(--ios-green)':'var(--ios-amber)';
    }
    safeSet($('gpuDrawingModeSubtext'),drawingOn
      ?'Hardware-accelerated Canvas 2D & stroke pipeline active'
      :'Pinned to CPU software readback pipeline');
    if(announce){
      msg(drawingOn?'Drawing Engine GPU Acceleration Enabled':'Drawing Engine GPU Acceleration Disabled (CPU Mode)');
    }
  }

  async function probeGpu(isManualRefresh=false){
    probeCounter++;
    const preference=ENGINE.gpuPreference;
    const prefText=preference==='auto'?'system default':preference;
    safeSet($('gpuProbeCountBadge'),`Probe #${probeCounter}`);
    safeSet($('gpuPaneProbeTime'),new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}));

    // 1. Live WebGL2 Probe
    let glAvailable=false,glName='Unavailable',maxTex=0,floatSupported=false;
    try{
      const probe=document.createElement('canvas');
      const gl=probe.getContext('webgl2',{powerPreference:preference==='auto'?'default':preference});
      if(gl){
        glAvailable=true;
        const ext=gl.getExtension('WEBGL_debug_renderer_info');
        glName=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'WebGL2 Hardware Renderer';
        maxTex=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||0;
        floatSupported=Boolean(gl.getExtension('EXT_color_buffer_float'));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    }catch(_){/* blocklist/privacy */}

    safeSet($('webglAdapterText'),glName);
    safeSet($('maxTextureText'),maxTex?`${maxTex} px`:'Unknown');
    safeSet($('gpuPaneWebglStatus'),glAvailable?`WebGL2 Ready · ${glName}`:'WebGL2 Unavailable');
    safeSet($('gpuPaneFloatStatus'),glAvailable?(floatSupported?'Supported (RGBA16F / RGBA32F)':'8-bit RGBA Fallback'):'Unavailable');
    safeSet($('gpuPaneMaxTexture'),maxTex?`${maxTex} px`:'Unknown');

    const wetBytes=window.WCGPUPaint?.stats?.bytes||0;
    const fxBytes=window.WC65GPU?.bytes||0;
    safeSet($('gpuPaneMemoryStatus'),`${((wetBytes+fxBytes)/1048576).toFixed(1)} MB allocated`);

    // 2. Live WebGPU Probe
    if(!('gpu' in navigator)){
      safeSet(adapterLabel,'Unavailable');
      safeSet($('gpuPaneWebgpuStatus'),'WebGPU Unavailable (WebGL2/Canvas2D Active)');
      const fallbackMsg=ENGINE.gpuDrawingEnabled
        ?`GPU probe #${probeCounter} complete (${prefText}) · WebGL2 active; WebGPU unavailable in this context.`
        :`GPU probe #${probeCounter} complete (${prefText}) · Drawing engine pinned to CPU software pipeline.`;
      safeSet(result,fallbackMsg);
      safeSet($('gpuPaneProbeNotice'),fallbackMsg);
      if(isManualRefresh)msg('GPU Probe Refreshed');
      return;
    }

    safeSet(result,'Checking WebGPU adapter…');
    safeSet($('gpuPaneProbeNotice'),'Probing WebGL2 & WebGPU adapter status…');
    try{
      const adapter=await navigator.gpu.requestAdapter(preference==='auto'?{}:{powerPreference:preference});
      if(!adapter){
        safeSet(adapterLabel,'Unavailable');
        safeSet($('gpuPaneWebgpuStatus'),'No WebGPU Adapter Returned (WebGL2 Active)');
        const noAdapterMsg=`GPU probe #${probeCounter} complete (${prefText}) · WebGL2 active (${maxTex||0} px max texture).`;
        safeSet(result,noAdapterMsg);
        safeSet($('gpuPaneProbeNotice'),noAdapterMsg);
        if(isManualRefresh)msg('GPU Probe Refreshed');
        return;
      }
      const info=adapter.info||{};
      const name=[info.vendor,info.architecture,info.device].filter(Boolean).join(' / ')||'WebGPU Hardware Adapter';
      safeSet(adapterLabel,name);
      safeSet($('gpuPaneWebgpuStatus'),`WebGPU Ready · ${name}`);
      const okMsg=ENGINE.gpuDrawingEnabled
        ?`GPU probe #${probeCounter} verified (${prefText}) · Drawing engine GPU acceleration active.`
        :`GPU probe #${probeCounter} verified (${prefText}) · Drawing engine pinned to CPU readback mode.`;
      safeSet(result,okMsg);
      safeSet($('gpuPaneProbeNotice'),okMsg);
    }catch(err){
      safeSet(adapterLabel,'Unavailable');
      safeSet($('gpuPaneWebgpuStatus'),'WebGPU Probe Blocked (WebGL2 Active)');
      const errMsg='GPU probe blocked: '+String(err?.message||err);
      safeSet(result,errMsg);
      safeSet($('gpuPaneProbeNotice'),errMsg);
    }
    if(isManualRefresh)msg('GPU Probe Refreshed');
  }

  drawingSwitch?.addEventListener('click',()=>{
    if(isDrawing||fillBusy){msg('Finish the current stroke before switching GPU mode');return;}
    ENGINE.gpuDrawingEnabled=!ENGINE.gpuDrawingEnabled;
    applyDrawingGpuControls(true);
    probeGpu(false);
  });
  wetSwitch?.addEventListener('click',()=>{
    ENGINE.gpuWetPaintEnabled=!ENGINE.gpuWetPaintEnabled;
    applyDrawingGpuControls(false);
    msg(ENGINE.gpuWetPaintEnabled?'Wet Mix WebGL2 Shader Enabled':'Wet Mix Pinned to CPU Engine');
    probeGpu(false);
  });
  effectsSwitch?.addEventListener('click',()=>{
    ENGINE.gpuEffectsEnabled=!ENGINE.gpuEffectsEnabled;
    applyDrawingGpuControls(false);
    msg(ENGINE.gpuEffectsEnabled?'Layer Effects GPU Pipeline Enabled':'Layer Effects Pinned to CPU');
    probeGpu(false);
  });

  function onPowerChange(val){
    ENGINE.gpuPreference=val;
    if(hint&&hint.value!==val)hint.value=val;
    if(gpuPanePower&&gpuPanePower.value!==val)gpuPanePower.value=val;
    persistEnginePreferences();
    window.WC65GPU?.reset();
    window.WCGPUPaint?.reset?.();
    window.WinCreate?.rig65?.reset();
    probeGpu(true);
  }
  hint?.addEventListener('change',e=>onPowerChange(e.target.value));
  gpuPanePower?.addEventListener('change',e=>onPowerChange(e.target.value));
  $('gpuProbeButton')?.addEventListener('click',()=>probeGpu(true));
  $('refreshGpuProbeBtn')?.addEventListener('click',()=>probeGpu(true));

  let stressTestBusy=false;

  function syncRustEngineTelemetry(lastBenchMs=null){
    const rustEng=window.WinCreateRustEngine;
    if(!rustEng)return;
    const modeSelect=$('rustEngineModeSelect');
    if(modeSelect&&modeSelect.value!==rustEng.mode)modeSelect.value=rustEng.mode;
    const enabled=rustEng.isEnabled();
    const badge=$('rustEngineStatusBadge');
    if(badge){
      badge.textContent=enabled
        ?(rustEng.mode==='rust-hybrid'?'Rust 6.6.0 (Wasm32 + WebGL2 Hybrid)':'Rust 6.6.0 (Wasm32 + Native Tauri)')
        :'JS Compatibility Fallback';
      badge.style.color=enabled?'var(--ios-green)':'var(--ios-amber)';
    }
    safeSet($('rustEngineMemoryText'),`${rustEng.memoryMB.toFixed(1)} MB Zero-Copy RGBA & Vector Heap`);
    const st=rustEng.stats;
    const benchSuffix=lastBenchMs!==null?` · ${lastBenchMs.toFixed(2)} ms/frame`:'';
    safeSet($('rustEngineKernelText'),enabled
      ?`Compiled Wasm32 Active (${st.smudgeDabsWasm} dabs · ${st.vectorStrokesTessellated} strokes${benchSuffix})`
      :`Fallback Mode (${st.smudgeDabsWasm} dabs · ${st.vectorStrokesTessellated} strokes)`);
    safeSet($('rustEngineNotice'),enabled
      ?'Rust core engine active — zero-gap smudge RGBA blending, stroke stabilization, and pressure vector ribbon tessellation execute in compiled Wasm linear memory.'
      :'Rust Wasm kernel bypassed — using JavaScript compatibility fallback for stroke and smudge processing.');
  }

  $('rustEngineModeSelect')?.addEventListener('change',e=>{
    const val=e.target.value;
    window.WinCreateRustEngine?.setMode?.(val);
    syncRustEngineTelemetry();
    msg(val==='js-fallback'?'Switched to JS Compatibility Fallback':'Rust Wasm32 Core Engine Active');
  });

  async function runVectorStressTest(){
    if(stressTestBusy)return null;
    stressTestBusy=true;
    const btn=$('runVectorStressTestBtn');
    const engBtn=$('benchmarkRustEngineBtn');
    const labelSpan=btn?.querySelector('span')||btn;
    const engLabelSpan=engBtn?.querySelector('span')||engBtn;
    if(btn)btn.disabled=true;
    if(engBtn)engBtn.disabled=true;
    if(labelSpan)labelSpan.textContent='Running Stress Test…';
    if(engLabelSpan)engLabelSpan.textContent='Benchmarking…';
    safeSet($('gpuStressVerdict'),'Executing complex multi-curve pressure vector strokes on the Rust/Wasm drawing engine…');

    // Allow UI status update to paint before running the frame benchmark
    await new Promise(r=>requestAnimationFrame(()=>r()));

    const strokeCount=24;
    const pointsPerStroke=180;
    const frames=8;
    const cw=Math.max(640,Math.min(1920,WIDTH||1280));
    const ch=Math.max(480,Math.min(1080,HEIGHT||800));
    const benchCanvas=document.createElement('canvas');
    benchCanvas.width=cw;
    benchCanvas.height=ch;
    const benchCtx=create2DContext(benchCanvas,false);
    applyContextSmoothing(benchCtx);

    const rustEng=window.WinCreateRustEngine;
    const useRustWasm=Boolean(rustEng?.isEnabled?.());
    const frameTimes=[];
    const wasmKernelTimes=[];
    let totalVertices=0;

    // Also exercise the Wasm linear-memory smudge RGBA kernel during the benchmark
    if(useRustWasm){
      const tileN=32;
      const sampleDst=new Uint8ClampedArray(tileN*tileN*4);
      const sampleCar=new Uint8ClampedArray(tileN*tileN*4);
      const sampleWeights=new Float32Array(tileN*tileN);
      sampleCar.fill(220);
      sampleWeights.fill(0.85);
      rustEng.blendSmudgeTileWasm(sampleDst,tileN,0,0,tileN,sampleCar,sampleWeights,0.65,0.45,true);
    }

    for(let f=0;f<frames;f++){
      const t0=performance.now();
      benchCtx.clearRect(0,0,cw,ch);
      let frameVerts=0;
      const cx=cw*0.5,cy=ch*0.5,rx=cw*0.38,ry=ch*0.38;

      for(let s=0;s<strokeCount;s++){
        const phase=((s+f)/strokeCount)*Math.PI*2;
        const freqX=3+(s%5);
        const freqY=2+((s*2)%7);
        const baseR=3+(s%9)*1.75;
        const pts=[];
        for(let i=0;i<pointsPerStroke;i++){
          const t=i/(pointsPerStroke-1);
          const theta=t*Math.PI*2;
          const harmonic=0.82+0.18*Math.sin(theta*6+phase);
          const x=cx+Math.cos(theta*freqX+phase)*rx*harmonic;
          const y=cy+Math.sin(theta*freqY+phase*1.3)*ry*harmonic;
          const pressure=0.2+0.8*Math.pow(Math.sin(t*Math.PI),0.85)*(0.75+0.25*Math.cos(theta*8+s));
          pts.push({x,y,r:Math.max(0.5,baseR*pressure)});
        }
        let pathData='';
        if(useRustWasm){
          const env=rustEng.tessellateStrokeEnvelope(pts);
          pathData=env?.svgPath||'';
          frameVerts+=env?.vertexCount||(pts.length*8);
        }else{
          pathData=buildPressureOutlinePath(pts);
          frameVerts+=pts.length*8;
        }
        if(pathData&&f===frames-1){
          const path2d=new Path2D(pathData);
          benchCtx.fillStyle=AI_PALETTES.cyber[s%AI_PALETTES.cyber.length]||'#6366f1';
          benchCtx.fill(path2d);
        }
      }
      totalVertices=frameVerts;
      const dt=Math.max(0.05,performance.now()-t0);
      frameTimes.push(dt);
      wasmKernelTimes.push(dt);
      WCPerf?.observe?.(dt);
    }

    // If running inside the native Rust Tauri shell (Windows or Android), also query the Rust native benchmark
    let rustNativeReport=null;
    try{
      if(window.__TAURI_INTERNALS__?.invoke){
        rustNativeReport=await window.__TAURI_INTERNALS__.invoke('run_vector_stress_test',{strokeCount,pointsPerStroke});
      }
    }catch(_){}

    const sum=frameTimes.reduce((a,b)=>a+b,0);
    const avgMs=+(sum/frameTimes.length).toFixed(2);
    const sorted=[...frameTimes].sort((a,b)=>a-b);
    const maxMs=+sorted[sorted.length-1].toFixed(2);
    const p95Ms=+sorted[Math.min(sorted.length-1,Math.floor(sorted.length*0.95))].toFixed(2);
    const effectiveFps=Math.min(360,Math.max(1,Math.round(1000/Math.max(0.2,avgMs))));
    const totalPoints=strokeCount*pointsPerStroke;
    const throughputPtsPerSec=Math.round((totalPoints*frames)/Math.max(0.001,sum/1000));

    const avgEl=$('gpuStressAvgFrameTime');
    if(avgEl){
      avgEl.textContent=`${avgMs.toFixed(2)} ms / frame`;
      avgEl.style.color=avgMs<=8.33?'var(--ios-green)':avgMs<=16.67?'var(--ios-amber)':'var(--ios-red)';
    }
    safeSet($('gpuStressFps'),`${effectiveFps} FPS (${(throughputPtsPerSec/1000).toFixed(1)}k pts/s)`);
    safeSet($('gpuStressPeakFrameTime'),`P95 ${p95Ms.toFixed(2)} ms · Peak ${maxMs.toFixed(2)} ms`);
    safeSet($('gpuStressWorkload'),`${strokeCount} complex strokes · ${totalPoints.toLocaleString('en-US')} pressure nodes (${totalVertices.toLocaleString('en-US')} tris)`);

    const hostPlatform=window.WinCreateDesktop?.platform||(/Android/i.test(navigator.userAgent)?'android':/Win/i.test(navigator.platform||navigator.userAgent)?'win32':'web-wasm');
    const engineTag=useRustWasm?'RUST-WASM32':'JS-FALLBACK';
    const rustNote=rustNativeReport?` · Native ${rustNativeReport.avgFrameTimeMs.toFixed(2)} ms`:'';
    safeSet($('gpuPaneRustPlatformStatus'),`Rust 6.6.0 (${engineTag} · ${hostPlatform.toUpperCase()}) · Windows (Win32/D3D11) & Android (ARM64/Vulkan)${rustNote}`);

    let verdict='';
    if(avgMs<=8.33){
      verdict=ENGINE.gpuDrawingEnabled
        ?`Optimal (${avgMs.toFixed(2)} ms/frame · 120Hz+ ProMotion ready) — Compiled Rust/Wasm vector ribbon tessellator and GPU pipeline render complex strokes well inside the 8.33 ms budget.`
        :`Optimal (${avgMs.toFixed(2)} ms/frame) — Compiled Rust/Wasm kernel is keeping up; enable Drawing Engine GPU Acceleration to minimize peak frame jitter.`;
    }else if(avgMs<=16.67){
      verdict=!ENGINE.gpuDrawingEnabled
        ?`Moderate frame time (${avgMs.toFixed(2)} ms/frame · 60Hz budget) — Enable "Drawing Engine GPU Acceleration" above to offload vector compositing for 120Hz stylus latency.`
        :ENGINE.ssaaFactor>1
          ?`Moderate frame time (${avgMs.toFixed(2)} ms/frame · 60Hz budget) — Lower Stroke Supersampling from ${ENGINE.ssaaFactor}× SSAA to 1× Native in AA & Stroke settings for 120Hz response.`
          :`Moderate frame time (${avgMs.toFixed(2)} ms/frame · 60Hz budget) — Switch Adapter Power Profile to "Prefer Dedicated GPU" to prevent mid-stroke throttling.`;
    }else{
      const tips=[];
      if(!useRustWasm)tips.push('switch Drawing Engine Core to Rust Wasm32 + Native SIMD');
      if(!ENGINE.gpuDrawingEnabled)tips.push('enable Drawing Engine GPU Acceleration');
      if(ENGINE.ssaaFactor>1)tips.push(`reduce SSAA from ${ENGINE.ssaaFactor}× to 1× Native`);
      tips.push('set Adapter Power Profile to Prefer Dedicated GPU');
      verdict=`Lag detected (${avgMs.toFixed(2)} ms/frame exceeds 16.67 ms 60Hz budget) — Recommended fixes: ${tips.join(', ')}.`;
    }
    safeSet($('gpuStressVerdict'),verdict);
    syncRustEngineTelemetry(avgMs);

    if(btn)btn.disabled=false;
    if(engBtn)engBtn.disabled=false;
    if(labelSpan)labelSpan.textContent='Run Vector Stress Test';
    if(engLabelSpan)engLabelSpan.textContent='Benchmark Rust Core';
    stressTestBusy=false;
    msg(`Rust Engine Stress Test: ${avgMs.toFixed(2)} ms/frame (${effectiveFps} FPS)`);
    return {avgFrameTimeMs:avgMs,p95FrameTimeMs:p95Ms,maxFrameTimeMs:maxMs,effectiveFps,strokeCount,totalPoints,verdict};
  }

  $('runVectorStressTestBtn')?.addEventListener('click',()=>runVectorStressTest());
  $('benchmarkRustEngineBtn')?.addEventListener('click',()=>runVectorStressTest());
  if(window.WinCreate)window.WinCreate.runVectorStressTest=runVectorStressTest;

  syncRustEngineTelemetry();
  applyDrawingGpuControls(false);
  await probeGpu(false);
})();
