"use strict";

// Projection and warp follow the existing warped-cartesian-design.js explorer.
(() => {
  const $ = id => document.getElementById(id);
  const {camera,paperFraction,center,fov,project,nativeDirection}=window.FoviCameraGeometry;
  const rad=Math.PI/180;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const state={mode:"foveated",fraction:paperFraction,side:128,fixation:[...center],samples:[],fov:fov/rad,visible:0};
  window.foviSampling=state;
  // UI values use angular degrees; the shared sampler retains its normalized API.
  const fovDegrees=fov/rad,slider=$("foveation");
  slider.min=Math.floor((-4.2+Math.log10(fovDegrees))*1000)/1000;
  slider.max=Math.ceil((1.8+Math.log10(fovDegrees))*1000)/1000;
  slider.value=Math.log10(paperFraction*fovDegrees);
  function nativeRay(x,y){
    const d=nativeDirection(x,y,state.mode==="foveated"?state.fraction:1000);
    return [d[0],-d[1],-d[2]];
  }
  const image=new Image();
  let sampler,pooled,matrix,pending=false;
  const scratch=document.createElement("canvas");
  const highres=document.createElement("canvas");
  highres.width=$("sample-camera").width;highres.height=$("sample-camera").height;
  image.addEventListener("load",()=>{
    scratch.width=image.naturalWidth;scratch.height=image.naturalHeight;
    const ctx=scratch.getContext("2d",{willReadFrequently:true});ctx.drawImage(image,0,0);
    sampler=window.FoviRetinalSampler.create(ctx.getImageData(0,0,scratch.width,scratch.height));
    const baseline=highres.getContext("2d");baseline.imageSmoothingQuality="high";
    baseline.drawImage(image,0,0,highres.width,highres.height);update();
  });
  image.addEventListener("error",()=>{throw new Error("Sampling scene could not be loaded");});
  image.src=window.FoviLoading.asset("assets/grasp-scene.png");
  function build(){
    pooled=sampler.render(state.side,state.mode==="foveated"?state.fraction:1000,state.fixation);
    matrix=pooled.matrix;state.samples=pooled.samples;state.visible=pooled.visible;
  }
  function drawCamera(){
    const canvas=$("sample-camera"),ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
    ctx.drawImage(highres,0,0);
    ctx.lineWidth=1.4;ctx.strokeStyle="#92b8ff";ctx.beginPath();let started=false;
    for(let i=0;i<=240;i++){
      const angle=i*Math.PI/120,ray=nativeRay(Math.cos(angle),Math.sin(angle)),p=project(matrix.map(a=>dot(a,ray)));
      if(!p.valid){started=false;continue;}
      const x=(p.x+.5)/camera.width*w,y=(p.y+.5)/camera.height*h;
      if(started)ctx.lineTo(x,y);else ctx.moveTo(x,y);started=true;
    }
    ctx.stroke();
    const x=(state.fixation[0]+.5)/camera.width*w,y=(state.fixation[1]+.5)/camera.height*h;
    ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,6,0,2*Math.PI);ctx.moveTo(x-11,y);ctx.lineTo(x+11,y);ctx.moveTo(x,y-11);ctx.lineTo(x,y+11);ctx.stroke();
  }
  function drawNative(){
    const canvas=$("sample-native");canvas.width=canvas.height=state.side;
    canvas.getContext("2d").putImageData(new ImageData(pooled.data,state.side,state.side),0,0);
  }
  function update(){
    if(!sampler)return;build();drawCamera();drawNative();
    $("foveation-value").textContent=((state.mode==="foveated"?state.fraction:1000)*fovDegrees).toPrecision(4);
    $("active-view-label").textContent=state.mode==="foveated"?"Foveated active":"Uniform active";
    state.ready=true;
    window.FoviLoading.done("sampling");
  }
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;update();});}
  $("foveation").addEventListener("input",()=>{state.fraction=10**Number($("foveation").value)/fovDegrees;schedule();});
  document.querySelectorAll("[data-sampling]").forEach(button=>button.addEventListener("click",()=>{
    state.mode=button.dataset.sampling;$("foveation").disabled=state.mode==="uniform";
    document.querySelectorAll("[data-sampling]").forEach(b=>b.setAttribute("aria-pressed",b===button));schedule();
  }));
  $("sampling-reset").addEventListener("click",()=>{
    state.mode="foveated";state.fraction=paperFraction;state.fixation=[...center];
    $("foveation").value=Math.log10(paperFraction*fovDegrees);$("foveation").disabled=false;
    document.querySelectorAll("[data-sampling]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.sampling==="foveated"));schedule();
  });
  function bindDrag(canvas,move){let last=null;canvas.addEventListener("pointerdown",e=>{last=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);move(e,0,0);});canvas.addEventListener("pointermove",e=>{if(!last)return;move(e,e.clientX-last[0],e.clientY-last[1]);last=[e.clientX,e.clientY];});for(const name of ["pointerup","pointercancel","lostpointercapture"])canvas.addEventListener(name,()=>{last=null;});}
  bindDrag($("sample-camera"),(e)=>{const box=$("sample-camera").getBoundingClientRect();state.fixation=[clamp((e.clientX-box.x)/box.width,.001,.999)*camera.width-.5,clamp((e.clientY-box.y)/box.height,.001,.999)*camera.height-.5];schedule();});
  $("sample-camera").addEventListener("keydown",e=>{const steps={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(e.key==="Home")state.fixation=[...center];else if(steps[e.key])state.fixation=state.fixation.map((x,i)=>clamp(x+steps[e.key][i],0,i===0?1919:1199));else return;e.preventDefault();schedule();});
  new ResizeObserver(schedule).observe($("sample-camera"));
})();
