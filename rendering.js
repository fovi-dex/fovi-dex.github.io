"use strict";

(async () => {
  const $=id=>document.getElementById(id);
  const geometry=window.FoviCameraGeometry;
  const side=128,exitSide=512,rad=Math.PI/180;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const response=await fetch(window.FoviLoading.asset('assets/rendering-scene.json'));
  if(!response.ok)throw Error('Could not load the captured robot rendering scene');
  const meshScene=window.FoviRayScene.create(await response.json());
  const {scene,intersect}=meshScene;
  const webgl=await FoviWebGL.create(FoviLoading.asset("assets/rendering-meshes.json.gz"),scene);
  const state={mode:"foveated",yaw:0,pitch:0,col:68,row:60,mask:true,view:{yaw:55*rad,pitch:35*rad},builds:0,ready:false};
  const directions=new Float32Array(side*side*3),inverse=new Float32Array(exitSide*exitSide*2);
  const makeRaster=size=>{const canvas=document.createElement("canvas");canvas.width=canvas.height=size;return canvas;};
  const forwardImage=makeRaster(side),inverseImage=makeRaster(exitSide),outputImage=makeRaster(side);
  let pending=false,lutsDirty=true,sceneDirty=true;
  const fraction=()=>state.mode==="foveated"?geometry.paperFraction:1000;
  const selectedUV=()=>[1-(state.row+.5)/side,(state.col+.5)/side];
  // Canonical texture row is native x; texture column is native y.
  const selectedIndex=()=>3*(state.col*side+side-1-state.row);
  const rayAt=i=>Array.from(directions.subarray(i,i+3));
  function worldRay(d){
    const c=Math.cos(state.yaw*rad),s=Math.sin(state.yaw*rad);
    const cp=Math.cos(state.pitch*rad),sp=Math.sin(state.pitch*rad);
    const down=-cp*d[1]+sp*d[2],forward=-sp*d[1]-cp*d[2];
    const ros=[c*d[0]+s*forward,down,-s*d[0]+c*forward];
    return scene.rotation.map(row=>dot(row,ros));
  }
  function buildLUTs(){
    const f=fraction(),ctx=forwardImage.getContext("2d"),image=ctx.createImageData(side,side);
    for(let row=0;row<side;row++)for(let col=0;col<side;col++){
      const i=row*side+col,d=geometry.nativeDirection(2*(row+.5)/side-1,2*(col+.5)/side-1,f);
      directions.set(d,3*i);image.data.set([...d.map(v=>255*(v+1)/2),255],4*i);
    }
    ctx.putImageData(image,0,0);
    const ictx=inverseImage.getContext("2d"),imap=ictx.createImageData(exitSide,exitSide);
    for(let row=0;row<exitSide;row++)for(let col=0;col<exitSide;col++){
      const i=row*exitSide+col,d=geometry.octDecode((col+.5)/exitSide,(row+.5)/exitSide);
      const uv=geometry.nativeUV(d,f);inverse.set(uv,2*i);
      imap.data.set(uv[0]<0?[14,24,40,255]:[255*uv[0],255*uv[1],62,255],4*i);
    }
    ictx.putImageData(imap,0,0);state.builds++;lutsDirty=false;sceneDirty=true;
  }
  function inverseLookup(uv){
    const x=clamp(uv[0]*exitSide-.5,0,exitSide-1),y=clamp(uv[1]*exitSide-.5,0,exitSide-1);
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,exitSide-1),y1=Math.min(y0+1,exitSide-1),dx=x-x0,dy=y-y0;
    return [0,1].map(c=>inverse[2*(y0*exitSide+x0)+c]*(1-dx)*(1-dy)+inverse[2*(y0*exitSide+x1)+c]*dx*(1-dy)+inverse[2*(y1*exitSide+x0)+c]*(1-dx)*dy+inverse[2*(y1*exitSide+x1)+c]*dx*dy);
  }

  function sampleStatus(col,row,world){
    const circular=(2*(col+.5)/side-1)**2+(1-2*(row+.5)/side)**2<=1;
    const reference=[0,1,2].map(i=>world.reduce((sum,v,j)=>sum+v*scene.reference_rotation[j][i],0));
    const visible=geometry.project(reference).valid;
    return {circular,visible,valid:circular&&visible};
  }
  function renderOutput(){
    const world=new Float32Array(side*side*3),valid=new Uint8Array(side*side);
    for(let row=0;row<side;row++)for(let col=0;col<side;col++){
      const d=worldRay(rayAt(3*(col*side+side-1-row)));
      world.set(d,3*(row*side+col));const status=sampleStatus(col,row,d);
      valid[row*side+col]=status.circular&&(!state.mask||status.visible);
    }
    webgl.renderOutput(world,valid,outputImage.getContext("2d"));sceneDirty=false;
  }
  function marker(ctx,x,y,size=7){
    ctx.strokeStyle="#101a2c";ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle="#ffe39b";ctx.lineWidth=1.7;ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-size-5,y);ctx.lineTo(x-size+1,y);ctx.moveTo(x+size-1,y);ctx.lineTo(x+size+5,y);ctx.moveTo(x,y-size-5);ctx.lineTo(x,y-size+1);ctx.moveTo(x,y+size-1);ctx.lineTo(x,y+size+5);ctx.stroke();
  }
  function drawTexture(id,raster,point){
    const canvas=$(id),ctx=canvas.getContext("2d"),n=canvas.width;
    ctx.imageSmoothingEnabled=false;ctx.drawImage(raster,0,0,n,n);marker(ctx,point[0]*n,point[1]*n,n*.020);
  }
  function drawInverse(oct){
    const canvas=$("rtx-inverse"),ctx=canvas.getContext("2d"),n=canvas.width;
    ctx.drawImage(inverseImage,0,0);
    ctx.strokeStyle="#adc0db32";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(n/2,0);ctx.lineTo(n,n/2);ctx.lineTo(n/2,n);ctx.lineTo(0,n/2);ctx.closePath();ctx.stroke();
    marker(ctx,oct[0]*n,oct[1]*n,10);
  }
  function drawScene(){
    const canvas=$("rtx-scene"),w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const pointAt=d=>{const t=intersect(d).t;return scene.camera.map((v,i)=>v+d[i]*t);};
    const fan=[];
    for(let row=7;row<side;row+=16)for(let col=7;col<side;col+=16){
      const d=worldRay(rayAt(3*(col*side+side-1-row)));
      const status=sampleStatus(col,row,d);
      if(status.circular&&(!state.mask||status.visible))fan.push(pointAt(d));
    }
    const basis=[[1,0,0],[0,-1,0],[0,0,-1]].map(worldRay);
    const rotation=[0,1,2].map(i=>basis.map(axis=>axis[i]));
    canvas.getContext("2d").drawImage(webgl.renderOverview(state.view,canvas.width,canvas.height,
      {fan,selected:pointAt(worldRay(rayAt(selectedIndex())))},rotation),0,0);
  }
  function update(){
    if(lutsDirty)buildLUTs();
    if(sceneDirty)renderOutput();
    const d=rayAt(selectedIndex()),uv=selectedUV(),oct=geometry.octEncode(d),recovered=inverseLookup(oct),world=worldRay(d),status=sampleStatus(state.col,state.row,world);
    drawTexture("rtx-forward",forwardImage,uv);drawTexture("rtx-output",outputImage,[(state.col+.5)/side,(state.row+.5)/side]);drawScene();drawInverse(oct);
    const tuple=values=>values.map(v=>v.toFixed(3)).join(", ");
    $("rtx-pixel").textContent=`${state.col}, ${state.row}`;
    $("rtx-uv").textContent=tuple(uv);$("rtx-direction").textContent=tuple(d);
    let label=intersect(world).name;
    if(!status.circular)label="Masked · outside disc";
    else if(state.mask&&!status.visible)label="Masked · outside camera";
    $("rtx-hit").textContent=label;
    $("rtx-oct").textContent=tuple(oct);$("rtx-recovered").textContent=tuple(recovered);
    $("rtx-gaze-value").textContent=`${state.yaw>0?"+":""}${state.yaw}°`;
    $("rtx-pitch-value").textContent=`${state.pitch}°`;
    $("rtx-output-note").textContent=state.mask?"Circular + calibrated-camera masks":"Circular FOV mask · camera bounds disabled";
    state.selected={direction:d,world,uv,oct,recovered,status,hit:label};state.ready=true;
    window.FoviLoading.done("rendering");
  }
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;update();});}
  function reset(){
    state.mode="foveated";state.yaw=0;state.pitch=0;state.col=68;state.row=60;state.mask=true;state.view={yaw:55*rad,pitch:35*rad};
    $("rtx-gaze").value="0";$("rtx-pitch").value="0";$("rtx-mask").checked=true;
    document.querySelectorAll("[data-rtx-mode]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.rtxMode===state.mode));
    lutsDirty=true;$("rtx-lut-status").textContent="Both LUTs stay fixed when gaze rotates.";schedule();
  }
  $("rtx-gaze").addEventListener("input",()=>{state.yaw=Number($("rtx-gaze").value);sceneDirty=true;$("rtx-lut-status").textContent="Gaze rotated · both LUTs unchanged";schedule();});
  $("rtx-mask").addEventListener("change",()=>{state.mask=$("rtx-mask").checked;sceneDirty=true;schedule();});
  $("rtx-reset").addEventListener("click",reset);
  document.querySelectorAll("[data-rtx-mode]").forEach(button=>button.addEventListener("click",()=>{
    if(state.mode===button.dataset.rtxMode)return;
    state.mode=button.dataset.rtxMode;lutsDirty=true;
    document.querySelectorAll("[data-rtx-mode]").forEach(b=>b.setAttribute("aria-pressed",b===button));
    $("rtx-lut-status").textContent="Sampling changed · both LUTs rebuilt";schedule();
  }));
  function bindDrag(canvas,move){
    let previous=null;
    canvas.addEventListener("pointerdown",e=>{previous=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);move(e,0,0);});
    canvas.addEventListener("pointermove",e=>{if(!previous)return;move(e,e.clientX-previous[0],e.clientY-previous[1]);previous=[e.clientX,e.clientY];});
    for(const name of ["pointerup","pointercancel","lostpointercapture"])canvas.addEventListener(name,()=>{previous=null;});
  }
  for(const id of ["rtx-forward","rtx-output"]){
    const canvas=$(id),forward=id==="rtx-forward";
    bindDrag(canvas,e=>{
      const box=canvas.getBoundingClientRect(),x=clamp(Math.floor((e.clientX-box.x)/box.width*side),0,side-1),y=clamp(Math.floor((e.clientY-box.y)/box.height*side),0,side-1);
      state.col=forward?y:x;state.row=forward?side-1-x:y;schedule();
    });
    canvas.addEventListener("keydown",e=>{
      let dx=0,dy=0;
      if(e.key==="Home"){state.col=68;state.row=60;}
      else if(e.key==="ArrowLeft")dx=-1;
      else if(e.key==="ArrowRight")dx=1;
      else if(e.key==="ArrowUp")dy=-1;
      else if(e.key==="ArrowDown")dy=1;
      else return;
      state.col=clamp(state.col+(forward?dy:dx),0,side-1);state.row=clamp(state.row+(forward?-dx:dy),0,side-1);e.preventDefault();schedule();
    });
  }
  function rotateCamera(yaw,pitch){
    state.yaw=clamp(Math.round(yaw*2)/2,-32,32);state.pitch=clamp(Math.round(pitch*2)/2,-20,20);
    $("rtx-gaze").value=state.yaw;$("rtx-pitch").value=state.pitch;sceneDirty=true;schedule();
  }
  $("rtx-pitch").addEventListener("input",()=>rotateCamera(state.yaw,Number($("rtx-pitch").value)));
  bindDrag($("rtx-scene"),(_,dx,dy)=>rotateCamera(state.yaw+dx*.2,state.pitch-dy*.2));
  $("rtx-scene").addEventListener("keydown",e=>{
    if(e.key==="Home")rotateCamera(0,0);
    else if(e.key==="ArrowLeft")rotateCamera(state.yaw-2,state.pitch);
    else if(e.key==="ArrowRight")rotateCamera(state.yaw+2,state.pitch);
    else if(e.key==="ArrowUp")rotateCamera(state.yaw,state.pitch+2);
    else if(e.key==="ArrowDown")rotateCamera(state.yaw,state.pitch-2);
    else return;
    e.preventDefault();
  });
  new ResizeObserver(schedule).observe($("rtx-scene"));
  // Public inspection data supports reproducible numerical/browser audits.
  window.foviRTX={adapter:webgl.adapter,state,directions,inverse,side,exitSide,inverseLookup,scene,intersect,worldRay};
  schedule();
})();
