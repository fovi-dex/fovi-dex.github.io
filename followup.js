"use strict";

(() => {
  const $=id=>document.getElementById(id),data=window.FOVI_FOLLOWUP;
  const {models,create,latest,commonWindow,pointsWithin,summarizeSeeds,summaryReadout}=window.FoviCharts;
  const modelIds=["foveated","active","highres"];
  const cases={five:{objects:5,gpus:[4,8],label:"Five-object clutter · four vs. eight GPUs"}};
  const state={view:"five",metric:"isr",seed:"mean",axis:"hours",enabled:new Set(modelIds),time:null,currentRuns:[]};
  window.foviFollowup=state;
  let xMax=1,summaries=[];
  const chart=create({svg:$("followup-chart"),slider:$("followup-time"),output:$("followup-hour"),cursorId:"followup-cursor",onInspect:time=>{state.time=time;readout();}});
  const multiplier=run=>state.axis==="gpu-hours"?run.gpus:1;
  const metricScale=()=>state.metric==="isr"?100:1;
  const metricValue=value=>state.metric==="isr"?(100*value).toFixed(1)+" %":value.toFixed(0);
  function selectedCase(){
    const c=cases[state.view];
    return data.runs.filter(r=>r.objects===c.objects&&c.gpus.includes(r.gpus));
  }
  function readout(){
    chart.cursor(state.time);$("followup-values").replaceChildren();
    for(const model of modelIds){
      if(!state.enabled.has(model))continue;
      for(const gpus of [...cases[state.view].gpus].reverse()){
        const runs=state.currentRuns.filter(r=>r.model===model&&r.gpus===gpus),observations=[];
        for(const run of runs){
          const point=latest(run[state.metric],Math.min(state.commonHours,state.time/multiplier(run)));
          if(point)observations.push({run,point});
        }
        const el=document.createElement("div");el.className="readout-item";
        const title=document.createElement("span"),dot=document.createElement("i");dot.className="legend-dot";dot.style.setProperty("--model-color",models[model].color);title.append(dot,models[model].label);
        if(cases[state.view].gpus.length>1){const gpu=document.createElement("small");gpu.textContent=`${gpus} GPUs`;title.append(gpu);}
        const value=document.createElement("strong"),detail=document.createElement("small");
        if(state.seed==="mean"){
          const summary=summaryReadout(summaries.find(s=>s.group===`${model}-${gpus}`),state.time,state.metric==="adr",state.metric,state.axis==="hours"?"h":"GPU-h");
          value.textContent=summary.value;detail.textContent=summary.detail;
        }
        else if(!observations.length){value.textContent="—";detail.textContent="No observation yet";}
        else{
          const values=observations.map(o=>o.point[1]),low=Math.min(...values),high=Math.max(...values);
          value.textContent=observations.length===1?metricValue(low):`${(low*metricScale()).toFixed(state.metric==="isr"?1:0)}–${metricValue(high)}`;
          const times=observations.map(o=>o.point[0]*multiplier(o.run)),minTime=Math.min(...times),maxTime=Math.max(...times),unit=state.axis==="hours"?"h":"GPU-h";
          const timeText=maxTime-minTime<.1?maxTime.toFixed(1):minTime.toFixed(1)+"–"+maxTime.toFixed(1);
          detail.textContent=observations.length===1?`Seed ${observations[0].run.seed} · observed at ${timeText} ${unit}`:`${observations.length} seeds · observed at ${timeText} ${unit}`;
        }
        el.append(title,value,detail);$("followup-values").append(el);
      }
    }
  }
  function draw(){
    const cohort=selectedCase();
    state.currentRuns=cohort.filter(r=>state.enabled.has(r.model)&&(["mean","all"].includes(state.seed)||r.seed===Number(state.seed)));
    const end=commonWindow(cohort,state.axis,data.analysis_wall_clock_hours);
    state.commonHours=commonWindow(cohort,"hours",data.analysis_wall_clock_hours);
    const tick=end/4;
    xMax=end;
    state.time=state.time===null?end:Math.min(state.time,xMax);
    const scale=cases[state.view].gpus.length>1,all=state.seed==="all";
    let series=[...state.currentRuns].sort((a,b)=>(a.model==="foveated")-(b.model==="foveated")).map(run=>({
      id:run.id,label:`${models[run.model].label} · ${run.gpus} GPUs · seed ${run.seed}`,
      group:`${run.model}-${run.gpus}`,groupLabel:`${models[run.model].label} · ${run.gpus} GPUs`,seed:run.seed,
      color:models[run.model].color,width:run.model==="foveated"?2.4:1.8,opacity:all?.62:.95,
      dash:scale&&run.gpus===4?"7 4":"",endpoint:true,
      endpointPoint:latest(run[state.metric],state.commonHours)?.map((v,i)=>v*(i===0?multiplier(run):metricScale())),
      points:pointsWithin(run[state.metric],state.commonHours,state.metric==="adr").map(([h,v])=>[h*multiplier(run),v*metricScale()])
    }));
    summaries=state.seed==="mean"?summarizeSeeds(series,state.metric==="adr"):[];
    if(state.seed==="mean")series=summaries;
    chart.draw({series,xMax,yMax:state.metric==="isr"?75:50,xTick:tick,label:state.metric==="isr"?"Success-region occupancy (%)":"ADR curriculum level",xLabel:state.axis==="hours"?"Elapsed training time (hours)":"Allocated GPU-hours (elapsed hours × GPU count)",time:state.time,step:state.metric==="adr",unitLabel:state.axis==="hours"?"h":"GPU-h"});
    $("followup-line-key").hidden=!scale;
    const allocationNote=state.axis==="gpu-hours"?" "+cases[state.view].gpus.map(gpus=>`${gpus} GPUs: ${(state.commonHours*gpus).toFixed(2)} GPU-hours`).join("; ")+".":"";
    state.commonEnd=end;
    const seedLabel=state.seed==="mean"?"Mean line + min–max shading · 3 seeds":all?"All three individual seeds":"Seed "+state.seed;
    $("followup-protocol").textContent=`${cases[state.view].label} · ${seedLabel} · shared wall-clock window ${state.commonHours.toFixed(2)} hours.${allocationNote} ${scale?"Solid: eight GPUs; dashed: four GPUs. ":""}${state.metric==="isr"?"ISR measures time in the success region at the run’s current ADR, not episode success rate.":"Step-based ADR changes task difficulty; it is not a success measure."}`;
    $("followup-readout-note").textContent=state.seed==="mean"?"Equal-weight mean and full seed range at the indicated time. ISR is linearly aligned; ADR holds its last level. Only shared seed coverage is summarized. Shading is not a confidence interval or standard deviation.":"Latest observation at or before the cursor. Ranges span individual seeds. Dots mark the last measurement inside the shared window.";
    readout();
  }
  for(const id of modelIds){
    const button=document.createElement("button"),dot=document.createElement("i");button.dataset.followupModel=id;button.setAttribute("aria-pressed","true");dot.className="legend-dot";dot.style.setProperty("--model-color",models[id].color);button.append(dot,models[id].label);
    button.addEventListener("click",()=>{if(state.enabled.has(id))state.enabled.delete(id);else state.enabled.add(id);button.setAttribute("aria-pressed",state.enabled.has(id));draw();});$("followup-legend").append(button);
  }
  document.querySelectorAll("[data-followup-metric]").forEach(button=>button.addEventListener("click",()=>{
    state.metric=button.dataset.followupMetric;
    document.querySelectorAll("[data-followup-metric]").forEach(b=>b.setAttribute("aria-pressed",b===button));draw();
  }));
  $("followup-seed").addEventListener("change",()=>{state.seed=$("followup-seed").value;draw();});
  $("followup-axis").addEventListener("change",()=>{state.axis=$("followup-axis").value;state.time=null;draw();});
  draw();
})();
