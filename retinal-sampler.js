"use strict";

// Deployment recipe: res_mult=2, cmf_a_mult=1, average cortical-neighbor pooling.
// On nested Cartesian grids, the four nearest fine-grid centers form a 2×2 cell.
window.FoviRetinalSampler = (() => {
  const {camera,nativeDirection,project,unproject,rotation}=window.FoviCameraGeometry;
  function create({data,width,height}){
    if(data.length!==width*height*4)throw new Error("Expected an RGBA source image");
    function render(side,fraction,fixation){
      if(!Number.isInteger(side)||side<2||!Number.isFinite(fraction)||fraction<=0)throw new Error("Invalid retinal grid");
      const matrix=rotation(unproject(...fixation));
      const raster=new Uint8ClampedArray(side*side*4),samples=[];
      let visible=0;
      function map(x,y){
        const d=nativeDirection(x,y,fraction),local=[d[0],-d[1],-d[2]];
        const ray=matrix.map(a=>a[0]*local[0]+a[1]*local[1]+a[2]*local[2]);
        return {local,ray,pixel:project(ray)};
      }
      for(let row=0;row<side;row++)for(let col=0;col<side;col++){
        const x=2*(col+.5)/side-1,y=1-2*(row+.5)/side,offset=4*(row*side+col);
        raster[offset+3]=255;
        if(x*x+y*y>1)continue;
        const center=map(x,y);
        samples.push({row,col,...center});
        if(!center.pixel.valid)continue;
        visible++;
        let red=0,green=0,blue=0;
        for(const dy of [-.5,.5])for(const dx of [-.5,.5]){
          const sx=x+dx/side,sy=y+dy/side;
          // Invalid fine-grid samples contribute zero, before average pooling.
          if(sx*sx+sy*sy>1)continue;
          const {pixel}=map(sx,sy);
          if(!pixel.valid)continue;
          const px=Math.floor((pixel.x+.5)/camera.width*width),py=Math.floor((pixel.y+.5)/camera.height*height);
          const source=4*(py*width+px);
          red+=data[source];green+=data[source+1];blue+=data[source+2];
        }
        raster[offset]=red/4;raster[offset+1]=green/4;raster[offset+2]=blue/4;
      }
      return {data:raster,width:side,height:side,samples,visible,matrix};
    }
    return {render};
  }
  return {create};
})();
