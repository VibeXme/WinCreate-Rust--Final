/*! WinCreate application code. All rights reserved by its respective authors. No redistribution license is granted for original application code. Third-party components retain their own licenses. */
/* Deterministic WebCodecs video. Muxers are bundled locally under MIT licenses. */
WinCreate.use(app=>{
  let active=null;
  const support=()=>typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined';
  const choose=format=>support()?(format==='mp4'?'video/mp4':'video/webm'):null;
  const dialog=document.createElement('dialog');dialog.id='videoExportDialog';dialog.innerHTML=`<div class="video-export-icon"><svg viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg></div><span class="studio-eyebrow">RENDERING YOUR FILM</span><h2>Let your artwork move.</h2><p id="videoExportDetail">Preparing video…</p><progress id="videoExportProgress" max="1" value="0"></progress><div class="video-export-stats"><span id="videoExportTime">00:00 / 00:00</span><span id="videoExportBytes">0 MB</span></div><p class="studio-note" id="videoExportStorage"></p><div class="video-export-buttons"><button id="videoExportPause" class="studio-secondary">Pause</button><button id="videoExportCancel" class="studio-secondary">Cancel export</button></div>`;document.body.append(dialog);
  const el=id=>dialog.querySelector('#'+id),clock=s=>`${Math.floor(s/3600)>0?Math.floor(s/3600)+':':''}${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const yieldUI=()=>new Promise(r=>setTimeout(r,0));
  dialog.addEventListener('cancel',e=>{e.preventDefault();active?.cancel();});el('videoExportCancel').onclick=()=>active?.cancel();el('videoExportPause').onclick=()=>active?.pause();
  async function encoderConfig(format,width,height,fps,hasAudio,quality){
    const bitrate=Math.round(Math.max(1000000,Math.min(18000000,width*height*fps*.16)));
    const choices=format==='mp4'?['avc1.420033','avc1.42001f']:quality==='high'?['vp09.00.10.08','vp8']:['vp8','vp09.00.10.08'];let video=null;
    for(const codec of choices){const c={codec,width,height,framerate:fps,bitrate,latencyMode:quality==='high'?'quality':'realtime',...(format==='mp4'?{avc:{format:'avc'}}:{})};try{const result=await VideoEncoder.isConfigSupported(c);if(result.supported){video=result.config;break;}}catch{}}
    if(!video)throw Error((format==='mp4'?'MP4/H.264':'WebM')+' encoding is unavailable at this size. Try WebM at 1280 px in a recent desktop browser.');
    let audio=null;if(hasAudio){if(typeof AudioEncoder==='undefined'||typeof AudioData==='undefined')throw Error('Audio encoding is unavailable. Mute the soundtrack or use a recent desktop browser.');const c={codec:format==='mp4'?'mp4a.40.2':'opus',sampleRate:48000,numberOfChannels:2,bitrate:128000};try{const r=await AudioEncoder.isConfigSupported(c);if(r.supported)audio=r.config;}catch{}if(!audio)throw Error('This browser cannot encode this soundtrack format. Try WebM or mute audio.');}
    return {video,audio};
  }
  function patchDuration(bytes,seconds){
    function elem(p){let mask=128,n=1;while(n<=4&&!(bytes[p]&mask)){mask>>=1;n++;}if(n>4)throw Error();let id=0;for(let i=0;i<n;i++)id=id*256+bytes[p+i];let q=p+n,m=1;mask=128;while(m<=8&&!(bytes[q]&mask)){mask>>=1;m++;}if(m>8)throw Error();let size=bytes[q]&(mask-1);for(let i=1;i<m;i++)size=size*256+bytes[q+i];return{id,size,header:q+m};}
    try{let p=0;let segment=null;while(p<Math.min(bytes.length,1000)){const e=elem(p);if(e.id===0x18538067){segment=e;break;}p=e.header+e.size;}if(!segment)return;p=segment.header;while(p<Math.min(bytes.length,10000)){const e=elem(p);if(e.id===0x1549a966){let scale=1000000,d=null;for(let q=e.header;q<e.header+e.size;){const c=elem(q);if(c.id===0x2ad7b1){scale=0;for(let j=0;j<c.size;j++)scale=scale*256+bytes[c.header+j];}if(c.id===0x4489&&c.size===8)d=c.header;q=c.header+c.size;}if(d!==null)new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setFloat64(d,seconds*1e9/scale,false);return;}p=e.header+e.size;}}catch{}
  }
  async function run(options){
    if(active)throw Error('A video is already exporting');if(!support())throw Error('Video export needs WebCodecs. Use a recent Chrome or Edge browser on localhost/HTTPS.');
    const {fps,duration,render,audio,audioOffset=0,audioLoop=false,muted=false,onProgress,isCancelled=()=>false}=options;
    if(!Number.isFinite(duration)||duration<=0||duration>31536000)throw Error('Choose a duration up to one year; actual export is limited by your device, codec and disk space.');
    const format=options.format==='mp4'?'mp4':'webm',hasAudio=!!audio&&!muted,width=Math.max(2,options.width-options.width%2),height=Math.max(2,options.height-options.height%2);
    let writable=null,handle=null;
    // Request a file immediately inside the user's export click.
    if(typeof window.showSaveFilePicker==='function'&&options.directToDisk!==false){
      try{handle=await window.showSaveFilePicker({suggestedName:'WinCreate_Film.'+format,types:[{description:format.toUpperCase()+' video',accept:{[format==='mp4'?'video/mp4':'video/webm']:['.'+format]}}]});writable=await handle.createWritable();}
      catch(e){if(e.name==='AbortError')return {cancelled:true};throw Error('Cannot open the export file: '+e.message);}
    }
    let cancelled=false,paused=false,autoPaused=false,failure=null,videoEncoder=null,audioEncoder=null,audioContext=null,wakeLock=null,queue=Promise.resolve(),queuedBytes=0,encodedBytes=0,writtenBytes=0;
    const maxBuffered=128*1024*1024,canvas=Object.assign(document.createElement('canvas'),{width,height}),ctx=canvas.getContext('2d',{alpha:false});
    const togglePause=()=>{paused=!paused;el('videoExportPause').textContent=paused?'Resume':'Pause';el('videoExportDetail').textContent=paused?'Paused — resume when you’re ready.':`${width} × ${height} · ${fps} fps · ${format.toUpperCase()}`;};
    const visibility=()=>{if(document.hidden&&!paused){autoPaused=true;togglePause();}else if(!document.hidden&&autoPaused){autoPaused=false;if(paused)togglePause();}};
    active={cancel:()=>cancelled=true,pause:()=>{autoPaused=false;togglePause();}};
    function check(){if(cancelled||isCancelled())throw Error('Export cancelled');if(failure)throw failure;}
    function count(chunk){encodedBytes+=chunk.byteLength;if(!writable&&encodedBytes>maxBuffered)throw Error('Video exceeded the 128 MB download buffer. Use desktop direct-to-disk export or a shorter clip.');el('videoExportBytes').textContent=(Math.max(encodedBytes,writtenBytes)/1048576).toFixed(1)+' MB';}
    try{
      dialog.showModal();el('videoExportPause').textContent='Pause';el('videoExportProgress').value=0;el('videoExportBytes').textContent='0 MB';el('videoExportTime').textContent=`00:00 / ${clock(duration)}`;el('videoExportDetail').textContent='Checking video and audio encoders…';el('videoExportStorage').textContent=writable?'Writing to your chosen file as frames are encoded. Speed depends on artwork, resolution and device.':'Download mode buffers the encoded film (128 MB limit). Desktop direct-to-disk export supports larger films.';
      const configs=await encoderConfig(format,width,height,fps,hasAudio,options.quality||'fast');check();
      let buffer=null;if(hasAudio){audioContext=new AudioContext({sampleRate:48000});const data=await(await fetch(audio.data)).arrayBuffer();buffer=await audioContext.decodeAudioData(data);await audioContext.close();audioContext=null;}
      check();const lib=format==='mp4'?Mp4Muxer:WebMMuxer;
      const target=writable?new lib.StreamTarget({chunked:true,chunkSize:1024*1024,onData:(data,position)=>{
        const copy=data.slice();if(format==='webm'&&position===0)patchDuration(copy,duration);queuedBytes+=copy.byteLength;if(queuedBytes>32*1024*1024){failure=Error('Disk writes cannot keep up. Try a lower resolution.');return;}
        queue=queue.then(async()=>{if(!cancelled&&!failure){await writable.write({type:'write',position,data:copy});writtenBytes=Math.max(writtenBytes,position+copy.byteLength);}queuedBytes-=copy.byteLength;}).catch(e=>failure=e);
      }}):new lib.ArrayBufferTarget();
      const muxer=new lib.Muxer({target,video:{codec:format==='mp4'?'avc':configs.video.codec.startsWith('vp09')?'V_VP9':'V_VP8',width,height,frameRate:fps},...(hasAudio?{audio:{codec:format==='mp4'?'aac':'A_OPUS',sampleRate:48000,numberOfChannels:2}}:{}),...(format==='mp4'?{fastStart:false}:{}),firstTimestampBehavior:'offset'});
      videoEncoder=new VideoEncoder({output:(chunk,meta)=>{try{count(chunk);muxer.addVideoChunk(chunk,meta);}catch(e){failure=e;}},error:e=>failure=e});videoEncoder.configure(configs.video);
      if(hasAudio){audioEncoder=new AudioEncoder({output:(chunk,meta)=>{try{count(chunk);muxer.addAudioChunk(chunk,meta);}catch(e){failure=e;}},error:e=>failure=e});audioEncoder.configure(configs.audio);}
      try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
      document.addEventListener('visibilitychange',visibility);el('videoExportDetail').textContent=`${width} × ${height} · ${fps} fps · ${format.toUpperCase()}`;
      const frameCount=Math.ceil(duration*fps),sampleCount=Math.round(duration*48000);let audioSample=0;
      for(let i=0;i<frameCount;i++){
        check();while(paused){check();await new Promise(r=>setTimeout(r,50));}
        const seconds=i/fps;ctx.fillStyle=app.state.bgColor||'#ffffff';ctx.fillRect(0,0,width,height);ctx.drawImage(await render(seconds,width,height),0,0,width,height);
        const frame=new VideoFrame(canvas,{timestamp:Math.round(seconds*1e6),duration:Math.round(Math.min(1/fps,duration-seconds)*1e6)});try{videoEncoder.encode(frame,{keyFrame:i%fps===0});}finally{frame.close();}
        if(audioEncoder){const limit=Math.min(sampleCount,Math.ceil((i+1)/fps*48000));while(audioSample<limit){const n=Math.min(960,sampleCount-audioSample);if(n<=0)break;const samples=new Float32Array(n*2),offset=Math.round(audioOffset*48000);for(let channel=0;channel<2;channel++){const source=buffer.getChannelData(Math.min(channel,buffer.numberOfChannels-1));for(let j=0;j<n;j++){const sourceTime=(audioSample+j-offset)/48000,rawIndex=Math.floor(sourceTime*buffer.sampleRate),index=audioLoop&&rawIndex>=0?rawIndex%source.length:rawIndex;if(index>=0&&index<source.length)samples[channel*n+j]=source[index];}}
          const data=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(audioSample/48000*1e6),data:samples});try{audioEncoder.encode(data);}finally{data.close();}audioSample+=n;
        }}
        if(i%12===11||videoEncoder.encodeQueueSize>6||audioEncoder?.encodeQueueSize>16){await videoEncoder.flush();while(audioEncoder?.encodeQueueSize>8){check();await yieldUI();}await queue;check();}
        el('videoExportProgress').value=(i+1)/frameCount;el('videoExportTime').textContent=`${clock(Math.min(duration,(i+1)/fps))} / ${clock(duration)}`;onProgress?.((i+1)/frameCount);await yieldUI();
      }
      await videoEncoder.flush();await audioEncoder?.flush();check();muxer.finalize();await queue;check();
      let saveResult = { message: 'Video saved to Files' };
      if(writable){await writable.close();writable=null;}
      else{if(format==='webm')patchDuration(new Uint8Array(target.buffer),duration);const blob=new Blob([target.buffer],{type:format==='mp4'?'video/mp4':'video/webm'});saveResult=options.save?await options.save(blob):await app.exports.save(blob,'WinCreate_Film.'+format,'files',{mime:blob.type,pickFile:false});if(saveResult.status==='cancelled')return {cancelled:true};writtenBytes=blob.size;}
      return {cancelled:false,bytes:writtenBytes,format,duration,streamed:!!handle,frames:frameCount,message:saveResult.message};
    }catch(e){if(writable)try{await writable.abort();}catch{}if(e.message==='Export cancelled'||cancelled)return {cancelled:true};throw e;}
    finally{if(videoEncoder?.state!=='closed')try{videoEncoder?.close();}catch{}if(audioEncoder?.state!=='closed')try{audioEncoder?.close();}catch{}await audioContext?.close();await wakeLock?.release().catch(()=>{});document.removeEventListener('visibilitychange',visibility);dialog.close();active=null;}
  }
  app.videoExport={run,choose,support,get active(){return !!active;}};
});
