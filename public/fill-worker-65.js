/*! WinCreate 6.5 · off-main-thread flood fill with identical boundary math. */
self.onmessage=e=>{let message='';try{const result=compute(e.data);self.postMessage({result:result?.notice?null:result,message:result?.notice||message},result?.pixels?[result.pixels.buffer]:[]);}catch(error){self.postMessage({error:error.message});}};
function compute({sx,sy,hex,WIDTH,HEIGHT,ENGINE,reference,target,sameLayer}){let message='';
  sx = Math.max(0, Math.min(WIDTH - 1, sx | 0));
  sy = Math.max(0, Math.min(HEIGHT - 1, sy | 0));
  const tl=1,rl=sameLayer?1:2;const ref=new Uint8ClampedArray(reference),data=new Uint8ClampedArray(target);
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
        if (n4 === 4) continue; // Interior of thick stroke
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
    // Endpoint-to-endpoint spatial bridging for arbitrary gap angles
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
  // Scanline flood: stack contains span seeds rather than every pixel (lower memory).
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
  // Prevent catastrophic full-canvas floods through small breaks in a drawn outline.
  // The outside can still be intentionally filled by dropping outside the outline.
  const seededInsideInk=boundaryCount>60 && sx>bx0+5 && sy>by0+5 && sx<bx1-5 && sy<by1-5;
  if(seededInsideInk && touchedBorder && count>total*.60) {
    return {notice:'Open outline detected • try increasing Close Line Gaps'};
  }
  // Reach 1–12 pixels further into the antialiased fringe. Preserve solid
  // boundaries and do not let the expansion open an adjacent region.
  const expand=Math.min(12,Math.max(1,Math.round(ENGINE.fillExpand ?? 3)));
  // Cover near-opaque antialiased edge pixels without tunneling through
  // hard linework or extending into neighboring fill regions.
  const underInk=rl===tl && sa<220;
  const grown=new Uint8Array(filled);
  let contrast=0;
  // Estimate actual ink contrast from pixels directly touching the filled region.
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
  // For broad, opaque lineart we use the most contrasting nearby boundary.
  contrast=Math.max(120,contrast);
  let frontier=[];
  // Keep boundary-adjacent candidates for pinhole and acute-corner repair.
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
        // Never tunnel through virtual gap-closing bridges.
        if(closedBoundary[q]&&!boundary[q])continue;
        if(boundary[q])edgeCandidates.add(q);
        // Fill under partial-coverage ink. Solid black/opaque strokes remain crisp.
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
  // Two-pass pinhole & acute-corner sealing along antialiased edges.
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
  const pd=new Uint8ClampedArray(w*h*4);
  // Transparent lineart: destination-over paints directly beneath existing inks.
  // Opaque art: reconstruct its antialiased ink-on-background edge against new fill.
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
  return {pixels:pd,ox,oy,sx,sy,w,h,changed,underInk};
}