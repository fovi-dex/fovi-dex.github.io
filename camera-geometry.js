"use strict";

// Calibrated projection shared by the image sampler and the LUT illustration.
window.FoviCameraGeometry = (() => {
  const camera = {width:1920,height:1200,fx:712.731686803,fy:711.969733755,cx:965.703518882,cy:579.259500623,k:[.000073869126,-.003871958121,.001958585313,-.000450310583],limit:95*Math.PI/180};
  const paperFraction=.036021;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const lensRadius=t=>{const q=t*t,[a,b,c,d]=camera.k;return t*(1+q*(a+q*(b+q*(c+q*d))));};
  function unproject(x,y){
    const dx=(x-camera.cx)/camera.fx,dy=(y-camera.cy)/camera.fy,r=Math.hypot(dx,dy);
    let lo=0,hi=camera.limit;
    for(let i=0;i<42;i++){const mid=(lo+hi)/2;if(lensRadius(mid)<r)lo=mid;else hi=mid;}
    const t=(lo+hi)/2,s=r>1e-14?Math.sin(t)/r:1;
    return [dx*s,dy*s,Math.cos(t)];
  }
  function project(ray){
    const lateral=Math.hypot(ray[0],ray[1]),t=Math.atan2(lateral,ray[2]),s=lateral>1e-14?lensRadius(t)/lateral:1;
    const x=camera.fx*ray[0]*s+camera.cx,y=camera.fy*ray[1]*s+camera.cy;
    return {x,y,valid:t<=camera.limit&&x>=-.5&&x<camera.width-.5&&y>=-.5&&y<camera.height-.5};
  }
  function rotation(gaze){
    const p=Math.atan2(gaze[0],gaze[2]),t=Math.atan2(-gaze[1],Math.hypot(gaze[0],gaze[2]));
    const cp=Math.cos(p),sp=Math.sin(p),ct=Math.cos(t),st=Math.sin(t);
    return [[cp,sp*st,sp*ct],[0,ct,-st],[-sp,cp*st,cp*ct]];
  }
  const center=[(camera.width-1)/2,(camera.height-1)/2],central=unproject(...center);
  const fov=[-1,1].reduce((sum,s)=>sum+Math.acos(clamp(dot(central,unproject(center[0],center[1]+s*camera.height/2)),-1,1)),0);
  // Unit direction in RTX camera coordinates: right, up, backward.
  function nativeDirection(x,y,fraction){
    const rho=Math.hypot(x,y),a=fov*fraction,half=fov/2;
    let r=a*Math.expm1(rho*Math.log1p(half/a));
    if(r>half){const excess=r-half,remaining=Math.PI-half;r=half+remaining*excess/(remaining+excess);}
    const scale=rho>0?Math.sin(r)/rho:0;
    return [x*scale,y*scale,-Math.cos(r)];
  }
  function nativeUV([x,y,z],fraction){
    const lateral=Math.hypot(x,y),angle=Math.atan2(lateral,-z),half=fov/2,a=fov*fraction;
    if(angle>=Math.PI-1e-8)return [-1,-1];
    const remaining=Math.PI-half;
    const r=angle<=half?angle:half+remaining*(angle-half)/(Math.PI-angle);
    const rho=Math.log1p(r/a)/Math.log1p(half/a),scale=lateral>1e-15?rho/lateral:0;
    // Texture rows follow canonical x; columns follow canonical y.
    const uv=[(y*scale+1)/2,(x*scale+1)/2];
    return uv.every(v=>v>=0&&v<=1)?uv:[-1,-1];
  }
  function octEncode([x,y,z]){
    const total=Math.abs(x)+Math.abs(y)+Math.abs(z);
    x/=total;y/=total;z=-z/total;
    if(z<0){const oldX=x;x=(1-Math.abs(y))*(x>=0?1:-1);y=(1-Math.abs(oldX))*(y>=0?1:-1);}
    return [(x+1)/2,(y+1)/2];
  }
  function octDecode(u,v){
    let x=2*u-1,y=2*v-1;const z=1-Math.abs(x)-Math.abs(y);
    if(z<0){const oldX=x;x=(1-Math.abs(y))*(x>=0?1:-1);y=(1-Math.abs(oldX))*(y>=0?1:-1);}
    const norm=Math.hypot(x,y,z);return [x/norm,y/norm,-z/norm];
  }
  return {camera,paperFraction,center,fov,project,unproject,rotation,nativeDirection,nativeUV,octEncode,octDecode};
})();
