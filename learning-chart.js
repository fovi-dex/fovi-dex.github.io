"use strict";

window.FoviCharts = (() => {
  const models={
    foveated:{label:"Foveated active",color:"#2458d3",size:"128 × 128"},
    active:{label:"Uniform active",color:"#9063bc",size:"128 × 128"},
    lowres:{label:"Fixed · low",color:"#8896a8",size:"100 × 160"},
    mediumres:{label:"Fixed · medium",color:"#be842e",size:"200 × 320"},
    highres:{label:"Uniform fixed (high-res)",color:"#188576",size:"300 × 480"}
  };
  const bounds={left:57,right:818,top:29,bottom:352};
  function node(tag,attrs,text){
    const el=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);
    if(text!==undefined)el.textContent=text;
    return el;
  }
  function latest(points,time){
    let low=0,high=points.length;
    while(low<high){const mid=(low+high)>>1;if(points[mid][0]<=time)low=mid+1;else high=mid;}
    return low>0?points[low-1]:null;
  }
  function commonWindow(runs,axis,hours){
    if(!runs.length)throw new Error("A comparison needs a complete cohort.");
    if(!["hours","gpu-hours"].includes(axis))throw new Error("Unknown comparison axis: "+axis);
    if(!Number.isFinite(hours)||hours<=0)throw new Error("A positive analysis duration is required.");
    const coverage=Math.min(...runs.flatMap(run=>["isr","adr"].map(metric=>run[metric].at(-1)[0])));
    if(!Number.isFinite(coverage)||coverage<=0)throw new Error("The cohort has no positive recorded coverage.");
    // Clip every run in wall-clock time before converting its horizontal coordinates.
    const end=hours*(axis==="gpu-hours"?Math.max(...runs.map(run=>run.gpus)):1);
    if(!Number.isFinite(end)||end<=0)throw new Error("The cohort has no positive shared observation window.");
    return end;
  }
  function pointsWithin(points,end,step=false){
    if(!points.length)throw new Error("The comparison has no recorded coverage.");
    // A shorter run stops at its last observation; never extend it to the analysis limit.
    end=Math.min(end,points.at(-1)[0]);
    const kept=points.filter(point=>point[0]<=end);
    // Compressed ADR has no samples between changes; retain its known plateau.
    if(step&&kept.length&&kept.at(-1)[0]<end)kept.push([end,kept.at(-1)[1]]);
    return kept;
  }
  function sampleAt(points,time,step){
    if(!points.length||time<points[0][0]||time>points.at(-1)[0])return null;
    const left=latest(points,time);
    if(step||left[0]===time)return [time,...left.slice(1)];
    let low=0,high=points.length;
    while(low<high){const mid=(low+high)>>1;if(points[mid][0]<=time)low=mid+1;else high=mid;}
    const right=points[low],weight=(time-left[0])/(right[0]-left[0]);
    return [time,...left.slice(1).map((value,i)=>value+weight*(right[i+1]-value))];
  }
  function meanRange(pointSets,step){
    if(pointSets.length!==3)throw new Error("Mean + range requires all three seeds.");
    for(const points of pointSets){
      if(points.some((point,i)=>point.length!==2||!point.every(Number.isFinite)||(i>0&&point[0]<=points[i-1][0])))throw new Error("Seed observations must be finite and strictly ordered.");
    }
    if(pointSets.some(points=>!points.length))return {points:[],range:[]};
    const start=Math.max(...pointSets.map(points=>points[0][0])),end=Math.min(...pointSets.map(points=>points.at(-1)[0]));
    if(start>end)return {points:[],range:[]};
    const times=[...new Set([start,end,...pointSets.flatMap(points=>points.filter(point=>point[0]>=start&&point[0]<=end).map(point=>point[0]))])].sort((a,b)=>a-b);
    if(!step){
      // Include crossings so the range follows the exact envelope of the seed lines.
      const crossings=[];
      for(let k=1;k<times.length;k++){
        const left=pointSets.map(points=>sampleAt(points,times[k-1],false)[1]),right=pointSets.map(points=>sampleAt(points,times[k],false)[1]);
        for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
          const a=left[i]-left[j],b=right[i]-right[j];
          if(a*b<0)crossings.push(times[k-1]+a/(a-b)*(times[k]-times[k-1]));
        }
      }
      times.push(...crossings);times.sort((a,b)=>a-b);
    }
    const points=[],range=[];
    for(const time of new Set(times)){
      const values=pointSets.map(points=>sampleAt(points,time,step)[1]);
      points.push([time,values.reduce((sum,value)=>sum+value,0)/3]);
      range.push([time,Math.min(...values),Math.max(...values)]);
    }
    return {points,range};
  }
  function summarizeSeeds(series,step){
    const groups=new Map();
    for(const s of series){
      if(!s.group||!s.groupLabel||!Number.isInteger(s.seed))throw new Error("Seed summary needs an explicit condition and seed.");
      if(!groups.has(s.group))groups.set(s.group,[]);
      groups.get(s.group).push(s);
    }
    return [...groups.values()].map(seeds=>{
      if(new Set(seeds.map(s=>s.seed)).size!==3)throw new Error("A condition needs three distinct seeds.");
      const first=seeds[0],summary=meanRange(seeds.map(s=>s.points),step);
      return {id:"mean-"+first.group,group:first.group,label:first.groupLabel+" · mean and min–max across three seeds",color:first.color,width:2.5,opacity:1,dash:first.dash,endpoint:true,...summary};
    });
  }
  function summaryReadout(summary,time,step,metric,unit){
    if(!summary.points.length||time<summary.points[0][0])return {value:"—",detail:"No shared three-seed coverage here"};
    const at=Math.min(time,summary.points.at(-1)[0]),mean=sampleAt(summary.points,at,step)[1],range=sampleAt(summary.range,at,step);
    const suffix=metric==="isr"?" %":"",digits=metric==="isr"?1:0;
    return {value:mean.toFixed(1)+suffix,detail:`Mean · 3 seeds · ${range[1].toFixed(digits)}–${range[2].toFixed(digits)}${suffix} range · at ${at.toFixed(1)} ${unit}`};
  }
  function create({svg,slider,output,cursorId,onInspect}){
    let maximum=1,unit="h";
    const X=x=>bounds.left+x/maximum*(bounds.right-bounds.left);
    function cursor(time){
      const line=document.getElementById(cursorId);
      line.setAttribute("x1",X(time));line.setAttribute("x2",X(time));
      slider.value=time;output.textContent=time.toFixed(1)+" "+unit;
    }
    function draw({series,xMax,yMax,xTick,label,xLabel,time,step,unitLabel="h"}){
      maximum=xMax;unit=unitLabel;slider.max=xMax;
      const Y=y=>bounds.bottom-y/yMax*(bounds.bottom-bounds.top);
      const summarized=series.some(s=>s.range);
      svg.replaceChildren(node("title",{id:svg.id+"-title"},label+" by "+xLabel.toLowerCase()),node("desc",{id:svg.id+"-description"},summarized?"Line: equal-weight mean of three seeds. Shading: full minimum-to-maximum range, not a confidence interval or standard deviation. Summaries use only overlapping seed coverage.":"Recorded observations. Use the controls and time slider to inspect values. Curves end at their last measurement."));
      svg.setAttribute("aria-labelledby",svg.id+"-title "+svg.id+"-description");
      for(let y=0;y<=yMax;y+=yMax/5){
        svg.append(node("line",{x1:bounds.left,y1:Y(y),x2:bounds.right,y2:Y(y),stroke:"#e5eaf2","stroke-width":1}));
        svg.append(node("text",{x:bounds.left-12,y:Y(y)+4,"text-anchor":"end",class:"chart-axis"},y));
      }
      for(let x=0;x<=xMax;x+=xTick)svg.append(node("text",{x:X(x),y:bounds.bottom+23,"text-anchor":"middle",class:"chart-axis"},x));
      svg.append(node("text",{x:bounds.left,y:14,class:"chart-label"},label));
      svg.append(node("text",{x:(bounds.left+bounds.right)/2,y:399,"text-anchor":"middle",class:"chart-label"},xLabel));
      const trace=(points,reverse=false)=>points.map(([hour,value],i)=>{
        const x=X(hour).toFixed(2),y=Y(value).toFixed(2);
        return i===0?`M${x},${y}`:step?(reverse?`V${y}H${x}`:`H${x}V${y}`):`L${x},${y}`;
      }).join("");
      for(const s of series){
        if(!s.range?.length)continue;
        const upper=s.range.map(([hour,,high])=>[hour,high]),lower=s.range.map(([hour,low])=>[hour,low]).reverse();
        const band=node("path",{d:trace(upper)+trace(lower,true).replace(/^M/,"L")+"Z",fill:s.color,"fill-opacity":.16,stroke:"none",class:"chart-range","data-group":s.group});
        band.append(node("title",{},s.label));svg.append(band);
      }
      for(const s of series){
        if(!s.points.length)continue;
        const line=node("path",{d:trace(s.points),fill:"none",stroke:s.color,"stroke-width":s.width,opacity:s.opacity,"data-run":s.id});
        if(s.dash)line.setAttribute("stroke-dasharray",s.dash);
        line.append(node("title",{},s.label));svg.append(line);
        if(s.endpoint){
          const last=s.endpointPoint??s.points.at(-1),circle=node("circle",{cx:X(last[0]),cy:Y(last[1]),r:2.6,fill:s.color,opacity:s.opacity});
          circle.append(node("title",{},s.label+(s.range?" · end of shared seed coverage":" · last recorded observation")));svg.append(circle);
        }
      }
      if(!series.some(s=>s.points.length))svg.append(node("text",{x:438,y:180,"text-anchor":"middle",class:"chart-label"},"Select a model to show its observations."));
      svg.append(node("line",{id:cursorId,y1:bounds.top,y2:bounds.bottom,stroke:"#263b5b","stroke-width":1,"stroke-dasharray":"4 4",opacity:.45}));
      cursor(time);
    }
    slider.addEventListener("input",()=>onInspect(Number(slider.value)));
    svg.addEventListener("pointermove",event=>{
      if(event.pointerType==="touch"&&event.buttons===0)return;
      const box=svg.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*840;
      onInspect(Math.max(0,Math.min(maximum,(x-bounds.left)/(bounds.right-bounds.left)*maximum)));
    });
    return {draw,cursor};
  }
  return {models,create,latest,commonWindow,pointsWithin,sampleAt,meanRange,summarizeSeeds,summaryReadout};
})();
