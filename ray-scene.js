"use strict";

// Shared captured geometry: CPU mesh tracing for the site, orbit framing for the film.
window.FoviRayScene=(()=>{
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function create(scene){
    if(!scene.robot||!scene.reference_rotation||!scene.framing_points)throw Error('Rendering scene requires captured robot, camera and framing geometry');
    const triangles=scene.faces.map(face=>{
      const e1=sub(face.points[1],face.points[0]),e2=sub(face.points[2],face.points[0]),delta=sub(scene.camera,face.points[0]),q=cross(delta,e1);
      return {face,e1,e2,delta,q,numerator:dot(e2,q),center:[0,1,2].map(i=>face.points.reduce((s,p)=>s+p[i],0)/3)};
    });
    function tree(items){
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(const item of items)for(const p of item.face.points)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}
      if(items.length<=8)return {lo,hi,items};
      const spans=hi.map((v,i)=>v-lo[i]),axis=spans.indexOf(Math.max(...spans));
      items.sort((a,b)=>a.center[axis]-b.center[axis]);const middle=Math.floor(items.length/2);
      return {lo,hi,left:tree(items.slice(0,middle)),right:tree(items.slice(middle))};
    }
    const root=tree(triangles);
    function intersect(direction){
      const origin=scene.camera;let distance=Infinity,face=null;
      function visit(node){
        let near=0,far=distance;
        for(let i=0;i<3;i++){
          if(Math.abs(direction[i])<1e-12){if(origin[i]<node.lo[i]||origin[i]>node.hi[i])return;continue;}
          const a=(node.lo[i]-origin[i])/direction[i],b=(node.hi[i]-origin[i])/direction[i];
          near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(far<near)return;
        }
        if(!node.items){visit(node.left);visit(node.right);return;}
        for(const triangle of node.items){
          const {e1,e2,delta,q}=triangle;
          const px=direction[1]*e2[2]-direction[2]*e2[1],py=direction[2]*e2[0]-direction[0]*e2[2],pz=direction[0]*e2[1]-direction[1]*e2[0];
          const det=e1[0]*px+e1[1]*py+e1[2]*pz;if(Math.abs(det)<1e-10)continue;
          const u=(delta[0]*px+delta[1]*py+delta[2]*pz)/det;if(u<0||u>1)continue;
          const v=(direction[0]*q[0]+direction[1]*q[1]+direction[2]*q[2])/det;if(v<0||u+v>1)continue;
          const t=triangle.numerator/det;
          if(t>1e-6&&t<distance){distance=t;face=triangle.face;}
        }
      }
      visit(root);
      if(face===null)return {t:1.5,color:[.76,.81,.89],name:'Background'};
      return {t:distance,color:face.color.map(v=>v*v),name:face.object};
    }
    function projector(view,{x,y,w,h}){
      const ca=Math.cos(view.yaw),sa=Math.sin(view.yaw),ce=Math.cos(view.pitch),se=Math.sin(view.pitch);
      const right=[-sa,ca,0],up=[-ca*se,-sa*se,ce],front=[ca*ce,sa*ce,se];
      const coordinates=scene.framing_points.map(p=>[dot(p,right),dot(p,up)]);
      const lo=[0,1].map(i=>Math.min(...coordinates.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...coordinates.map(p=>p[i])));
      const scale=Math.min(w*.86/(hi[0]-lo[0]),h*.86/(hi[1]-lo[1]));
      const screen=p=>[x+w/2+(dot(p,right)-(lo[0]+hi[0])/2)*scale,y+h/2-(dot(p,up)-(lo[1]+hi[1])/2)*scale,dot(p,front)];
      return {screen,right,up,front};
    }
    return {scene,intersect,projector};
  }
  return {create};
})();
