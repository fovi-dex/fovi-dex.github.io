"use strict";

(() => {
  const $=id=>document.getElementById(id);
  const figure=$("figure-dialog");
  $("architecture-zoom").addEventListener("click",()=>{figure.showModal();document.body.style.overflow="hidden";});
  $("figure-close").addEventListener("click",()=>figure.close());
  figure.addEventListener("close",()=>{document.body.style.overflow="";});
  for(const modal of [figure])modal.addEventListener("click",event=>{if(event.target===modal){const box=modal.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)modal.close();}});
  const navLinks=[...document.querySelectorAll(".masthead nav a")];
  function trackReading(){
    const available=document.documentElement.scrollHeight-innerHeight;
    document.querySelector(".reading-progress").style.width=(available>0?100*scrollY/available:0)+"%";
    let current=null;for(const link of navLinks){if(document.querySelector(link.getAttribute("href")).getBoundingClientRect().top<innerHeight*.35)current=link;}
    for(const link of navLinks){link.classList.toggle("active",link===current);if(link===current)link.setAttribute("aria-current","location");else link.removeAttribute("aria-current");}
  }
  addEventListener("scroll",trackReading,{passive:true});trackReading();
})();
