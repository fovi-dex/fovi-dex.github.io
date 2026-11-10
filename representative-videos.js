"use strict";
(() => {
  const root=document.getElementById("demonstrations"),pairs=[...root.querySelectorAll("[data-pair]")];
  const trial=document.getElementById("example-select");
  const cases=[...trial.options].map(option=>option.value);
  let current=pairs[0];
  function show(){
    const playing=[...current.querySelectorAll("video")].some(video=>!video.paused&&!video.ended);
    current.dispatchEvent(new CustomEvent("fovi:example",{detail:{selected:false,play:false}}));
    current.hidden=true;
    current=pairs.find(pair=>pair.dataset.case===trial.value);
    current.hidden=false;
    document.getElementById("example-position").textContent=`${cases.indexOf(trial.value)+1} / ${cases.length}`;
    current.dispatchEvent(new CustomEvent("fovi:example",{detail:{selected:true,play:playing}}));
  }
  function step(offset){trial.value=cases[(cases.indexOf(trial.value)+offset+cases.length)%cases.length];show();}
  trial.addEventListener("change",show);
  document.getElementById("example-previous").addEventListener("click",()=>step(-1));
  document.getElementById("example-next").addEventListener("click",()=>step(1));
})();
