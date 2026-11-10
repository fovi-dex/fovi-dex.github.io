"use strict";

(() => {
  const playableFiles=new Map(),preparations=[];
  for(const pair of document.querySelectorAll("[data-pair]")){
    const videos=[...pair.querySelectorAll("video")],isHook=pair.classList.contains("hook-pair");
    const play=pair.querySelector("[data-pair-play]"),replay=pair.querySelector("[data-pair-replay]"),status=pair.querySelector(".pair-status");
    const reduced=matchMedia("(prefers-reduced-motion: reduce)");
    let visible=false,wanted=isHook&&!reduced.matches,busy=false,frame=0,buffering=false,failed=false,generation=0;
    let prepared=null;
    const active=()=>wanted&&visible&&!pair.hidden&&!document.hidden&&window.FoviLoading.ready;
    const moving=()=>videos.some(v=>!v.paused&&!v.ended);
    function update(){
      const playing=active()&&!failed;
      play.textContent=isHook?(playing?"Ⅱ":"▷"):(playing?"Pause both Ⅱ":"Play both ▷");play.setAttribute("aria-label",playing?"Pause both recordings":"Play both recordings");
      play.disabled=busy;replay.disabled=busy;
    }
    function pause(){videos.forEach(v=>v.pause());if(frame)cancelAnimationFrame(frame);frame=0;update();}
    function showError(error){
      failed=true;wanted=false;pause();status.hidden=false;
      status.textContent=error.name==="NotAllowedError"?"Press play to start both recordings.":"The recordings could not be played. Reload to retry.";
    }
    async function prepare(video,version){
      const url=video.querySelector("source").src;
      // Complete, shared local blobs avoid later network waits and duplicate pairs.
      if(!playableFiles.has(url))playableFiles.set(url,(async()=>{
        const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
        if(!response.ok||response.headers.get("Content-Type")?.includes("text/html"))throw new Error("A policy recording could not load. Please check your connection or sign-in.");
        return URL.createObjectURL(await response.blob());
      })());
      const blob=await playableFiles.get(url);
      if(version!==generation)return;
      video.src=blob;video.preload="auto";
      video.load();
      if(video.readyState<3)await new Promise((resolve,reject)=>{
        const cleanup=()=>{video.removeEventListener("canplay",ready);video.removeEventListener("error",error);video.removeEventListener("emptied",cancel);};
        const ready=()=>{cleanup();resolve();};
        const error=()=>{cleanup();reject(new Error("Recording decode failed"));};
        const cancel=()=>{if(version!==generation){cleanup();resolve();}};
        video.addEventListener("canplay",ready);video.addEventListener("error",error);video.addEventListener("emptied",cancel);
      });
    }
    function ensurePrepared(){
      if(!prepared)prepared=Promise.all(videos.map(video=>prepare(video,generation)));
      return prepared;
    }
    function release(){
      generation++;prepared=null;
      for(const video of videos){
        const url=video.querySelector("source").src,blob=playableFiles.get(url);
        if(blob){blob.then(value=>URL.revokeObjectURL(value),()=>{});playableFiles.delete(url);}
        video.preload="none";video.removeAttribute("src");video.load();
      }
    }
    if(!pair.hidden)preparations.push(ensurePrepared());
    async function start(restart=false){
      if(busy)return;
      const version=generation;
      busy=true;failed=false;status.hidden=true;update();
      try{
        await ensurePrepared();
        if(!active()||version!==generation)return;
        if(restart||videos.every(v=>v.ended)){
          pause();videos.forEach(v=>{v.currentTime=0;});
          await Promise.all(videos.map(v=>v.seeking?new Promise(resolve=>v.addEventListener("seeked",resolve,{once:true})):Promise.resolve()));
        }
        if(!active())return;
        buffering=false;
        await Promise.all(videos.filter(v=>!v.ended).map(v=>v.play()));
        if(!active())pause();else if(!frame)frame=requestAnimationFrame(synchronize);
      }catch(error){if(version===generation)showError(error);}
      finally{busy=false;update();if(version!==generation&&active())start();}
    }
    function synchronize(){
      frame=0;
      if(!active()){pause();return;}
      if(videos.every(v=>v.ended)){start(true);return;}
      // Use the longest recording as the native-time clock. A shorter trial holds
      // its last frame, and both return to zero together after the longer trial.
      const master=videos.reduce((a,b)=>a.duration>b.duration?a:b);
      for(const video of videos){
        if(video===master||video.ended||video.seeking||master.seeking)continue;
        const target=Math.min(master.currentTime,video.duration);
        if(Math.abs(video.currentTime-target)>.16)video.currentTime=target;
      }
      frame=requestAnimationFrame(synchronize);
    }
    for(const video of videos){
      video.addEventListener("waiting",()=>{
        if(busy||!active()||!moving())return;
        buffering=true;pause();
      });
      video.addEventListener("canplay",()=>{
        if(buffering&&!busy&&active()&&videos.every(v=>v.ended||v.readyState>=3))start();
      });
      video.addEventListener("error",()=>{if(prepared&&!busy)showError(new Error("Recording failed"));});
    }
    play.addEventListener("click",()=>{wanted=!wanted;failed=false;if(active())start();else pause();update();});
    replay.addEventListener("click",()=>{wanted=true;start(true);});
    pair.addEventListener("fovi:example",event=>{
      wanted=event.detail.selected&&event.detail.play;
      if(!event.detail.selected){visible=false;pause();release();}
      else{const version=generation;ensurePrepared().catch(error=>{if(version===generation)showError(error);});if(active())start();}
      update();
    });
    new IntersectionObserver(entries=>{
      visible=entries.at(-1).isIntersecting;
      if(active())start();else pause();
    },{threshold:.12}).observe(pair);
    document.addEventListener("visibilitychange",()=>{if(active())start();else pause();});
    addEventListener("fovi:ready",()=>{if(active())start();else update();});
    reduced.addEventListener("change",()=>{wanted=isHook&&!reduced.matches;if(active())start();else pause();});
    addEventListener("pagehide",pause);
    update();
  }
  Promise.all(preparations).then(()=>window.FoviLoading.done("videos"),error=>window.FoviLoading.fail(error));
  addEventListener("pagehide",event=>{if(!event.persisted)for(const file of playableFiles.values())file.then(url=>URL.revokeObjectURL(url),()=>{});});
})();
