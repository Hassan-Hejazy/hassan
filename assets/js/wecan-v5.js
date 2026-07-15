(function(){
  'use strict';

  const root=document.documentElement;
  const track=document.getElementById('wecanTrack');
  const sticky=track?.querySelector('.wecan-sticky');
  const word=track?.querySelector('.wecan-mobile-word');
  const image=track?.querySelector('.wecan-single-image img');
  if(!track||!sticky||!word)return;

  const clamp=v=>Math.max(0,Math.min(1,v));
  const smooth=t=>t*t*(3-2*t);
  const smoother=t=>t*t*t*(t*(t*6-15)+10);
  const range=(v,a,b)=>clamp((v-a)/(b-a));
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;

  let target=0;
  let displayed=0;
  let fitScale=1;
  let raf=0;
  let last=0;
  let queued=false;
  let visible=false;

  function viewport(){
    return {
      w:Math.max(1,sticky.clientWidth||innerWidth),
      h:Math.max(1,sticky.clientHeight||window.visualViewport?.height||innerHeight)
    };
  }

  function fitWord(){
    const {w,h}=viewport();
    word.style.setProperty('transform','translate(-50%,-50%) scale(1)','important');
    const rect=word.getBoundingClientRect();
    const maxW=w*(w<760?.90:.88);
    const maxH=h*(w<760?.25:.30);
    fitScale=Math.max(.16,Math.min(2.8,maxW/Math.max(1,rect.width),maxH/Math.max(1,rect.height)));
    word.style.removeProperty('transform');
    root.style.setProperty('--wecan-word-fit-v5',fitScale.toFixed(6));
  }

  function readProgress(){
    const rect=track.getBoundingClientRect();
    const span=Math.max(1,track.offsetHeight-sticky.offsetHeight);
    target=clamp(-rect.top/span);
    if(!raf)raf=requestAnimationFrame(animate);
  }

  function apply(p){
    const mobile=sticky.clientWidth<760;

    // 0–16%: hold a pure black opening with the word perfectly centered.
    // 16–54%: reveal the image from the center while the word remains stable.
    // 42–64%: gently fade the word, never over-zooming or cropping it.
    // 60–84%: bring in the final heading and actions.
    const reveal=smoother(range(p,.16,mobile?.54:.52));
    const wordLift=smoother(range(p,.24,.50));
    const wordFade=smoother(range(p,mobile?.43:.42,mobile?.64:.62));
    const finalIn=smoother(range(p,mobile?.54:.53,mobile?.77:.75));
    const hintFade=smooth(range(p,.025,.14));
    const settle=smoother(range(p,.18,.90));

    const radius=reveal*(mobile?78:72);
    const wordScale=fitScale*(1+wordLift*(mobile?.13:.16));
    const imageScale=(mobile?1.075:1.065)-settle*(mobile?.075:.065);
    const brightness=.68+reveal*.25+finalIn*.04;
    const finalY=(1-finalIn)*(mobile?25:36);
    const finalBlur=(1-finalIn)*(mobile?1.1:1.8);
    const finalScale=.98+finalIn*.02;

    root.style.setProperty('--wecan-reveal-radius-v5',radius.toFixed(3)+'vmax');
    root.style.setProperty('--wecan-image-scale-v5',imageScale.toFixed(5));
    root.style.setProperty('--wecan-image-brightness-v5',brightness.toFixed(5));
    root.style.setProperty('--wecan-film-opacity-v5',(reveal*.34).toFixed(5));
    root.style.setProperty('--wecan-lower-dark-v5',(.38+finalIn*.22).toFixed(5));
    root.style.setProperty('--wecan-overlay-v5',(.04+finalIn*.22).toFixed(5));
    root.style.setProperty('--wecan-word-scale-v5',wordScale.toFixed(6));
    root.style.setProperty('--wecan-word-opacity-v5',(1-wordFade).toFixed(5));
    root.style.setProperty('--wecan-word-shadow-v5',(reveal*.72).toFixed(5));
    root.style.setProperty('--wecan-hint-opacity-v5',(1-hintFade).toFixed(5));
    root.style.setProperty('--wecan-final-opacity-v5',finalIn.toFixed(5));
    root.style.setProperty('--wecan-final-y-v5',finalY.toFixed(2)+'px');
    root.style.setProperty('--wecan-final-blur-v5',finalBlur.toFixed(2)+'px');
    root.style.setProperty('--wecan-final-scale-v5',finalScale.toFixed(5));
    sticky.classList.toggle('is-final',finalIn>.72);
  }

  function animate(now){
    raf=0;
    const dt=last?Math.min(.05,(now-last)/1000):1/60;
    last=now;
    const damping=reduced?1:(1-Math.exp(-(sticky.clientWidth<760?17:19)*dt));
    displayed+=(target-displayed)*damping;
    if(Math.abs(target-displayed)<.00005)displayed=target;
    apply(displayed);
    if(visible&&Math.abs(target-displayed)>.00005)raf=requestAnimationFrame(animate);
  }

  function queueRead(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      readProgress();
    });
  }

  function refresh(){
    fitWord();
    readProgress();
  }

  addEventListener('scroll',queueRead,{passive:true});
  addEventListener('resize',()=>requestAnimationFrame(refresh),{passive:true});
  addEventListener('orientationchange',()=>setTimeout(refresh,140),{passive:true});
  window.visualViewport?.addEventListener('resize',()=>requestAnimationFrame(refresh),{passive:true});
  document.addEventListener('languagechange',()=>requestAnimationFrame(refresh));

  if('ResizeObserver'in window){
    const ro=new ResizeObserver(()=>requestAnimationFrame(refresh));
    ro.observe(sticky);
  }
  const io=new IntersectionObserver(entries=>{
    visible=entries.some(e=>e.isIntersecting);
    if(visible)refresh();
  },{rootMargin:'260px 0px',threshold:0});
  io.observe(sticky);

  window.ByMeliWecanV5={requestUpdate:queueRead,refresh};
  if(image&&!image.complete)image.addEventListener('load',refresh,{once:true});
  if(document.fonts?.ready)document.fonts.ready.then(refresh);
  apply(0);
  refresh();
})();
