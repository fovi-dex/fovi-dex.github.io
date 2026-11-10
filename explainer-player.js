"use strict";

(() => {
  const video=document.getElementById("explainer-video");
  const play=document.getElementById("explainer-play");
  const status=document.getElementById("explainer-status");
  let visible=false,autoplayAttempted=false;
  async function autoplay(){
    if(autoplayAttempted||!window.FoviLoading.ready||!visible||document.hidden)return;
    autoplayAttempted=true;
    video.muted=true;
    try{await video.play();}
    catch(error){
      if(error.name!=="NotAllowedError"&&error.name!=="AbortError"){
        status.textContent="The film could not start. Use the download link or reload to retry.";status.hidden=false;
      }
    }
  }
  play.addEventListener("click",async()=>{
    status.hidden=true;
    autoplayAttempted=true;video.muted=false;
    try{if(video.ended)video.currentTime=0;await video.play();}
    catch(error){status.textContent="The film could not start. Use the download link or reload to retry.";status.hidden=false;}
  });
  video.addEventListener("play",()=>{play.hidden=true;});
  video.addEventListener("pause",()=>{play.hidden=false;});
  video.addEventListener("ended",()=>{play.hidden=false;play.textContent="Replay the film ↺";});
  video.addEventListener("error",()=>{status.textContent="The film could not load. Reload or use the download link.";status.hidden=false;});
  new IntersectionObserver(entries=>{
    visible=entries.at(-1).intersectionRatio>=.12;
    if(!visible)video.pause();else autoplay();
  },{threshold:.12}).observe(video);
  addEventListener("fovi:ready",autoplay);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)video.pause();else autoplay();});
  addEventListener("pagehide",()=>video.pause());
})();
