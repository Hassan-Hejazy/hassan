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
  let raf=0;
  let last=0;
  let queued=false;
  let visible=false;
  let wordSize=180;

  function viewport(){
    return {
      w:Math.max(1,sticky.clientWidth||innerWidth),
      h:Math.max(1,sticky.clientHeight||window.visualViewport?.height||innerHeight)
    };
  }

  function fitWord(){
    const {w,h}=viewport();
    const mobile=w<760;
    const landscape=w>h;
    const targetW=w*(mobile?.92:.88);
    const targetH=h*(landscape?.28:(mobile?.23:.30));

    word.style.setProperty('font-size','100px','important');
    word.style.setProperty('transform','translate(-50%,-50%) scale(1)','important');
    const rect=word.getBoundingClientRect();
    const scale=Math.min(targetW/Math.max(1,rect.width),targetH/Math.max(1,rect.height));
    wordSize=Math.max(58,Math.min(310,100*scale));
    root.style.setProperty('--wecan-word-size-v6',wordSize.toFixed(2)+'px');
    word.style.removeProperty('font-size');
    word.style.removeProperty('transform');
  }

  function readProgress(){
    const rect=track.getBoundingClientRect();
    const span=Math.max(1,track.offsetHeight-sticky.offsetHeight);
    target=clamp(-rect.top/span);
    if(!raf)raf=requestAnimationFrame(animate);
  }

  function apply(p){
    const mobile=sticky.clientWidth<760;

    /*
      00–16%  : pure black opening, white word held perfectly centered.
      16–48%  : image opens from the center while the word stays dominant.
      43–62%  : word fades only after the image is established.
      53–80%  : final heading arrives with no blank interval.
    */
    const reveal=smoother(range(p,.16,mobile?.49:.47));
    const wordMotion=smoother(range(p,.18,.50));
    const wordFade=smoother(range(p,mobile?.43:.42,mobile?.59:.58));
    const finalIn=smoother(range(p,mobile?.49:.48,mobile?.72:.70));
    const hintFade=smooth(range(p,.035,.15));
    const settle=smoother(range(p,.18,.90));

    const radius=reveal*112;
    const imageOpacity=smooth(range(p,.145,.23));
    const imageScale=(mobile?1.09:1.075)-settle*(mobile?.09:.075);
    const imageBrightness=.62+reveal*.23+finalIn*.035;
    const wordScale=1+wordMotion*(mobile?.09:.12);
    const finalY=(1-finalIn)*(mobile?28:40);
    const finalBlur=(1-finalIn)*(mobile?2.1:3.4);
    const finalScale=.975+finalIn*.025;

    root.style.setProperty('--wecan-reveal-radius-v6',radius.toFixed(3)+'vmax');
    root.style.setProperty('--wecan-image-opacity-v6',imageOpacity.toFixed(5));
    root.style.setProperty('--wecan-image-scale-v6',imageScale.toFixed(5));
    root.style.setProperty('--wecan-image-brightness-v6',imageBrightness.toFixed(5));
    root.style.setProperty('--wecan-film-opacity-v6',(reveal*.32).toFixed(5));
    root.style.setProperty('--wecan-lower-dark-v6',(.34+finalIn*.28).toFixed(5));
    root.style.setProperty('--wecan-overlay-v6',(.02+finalIn*.24).toFixed(5));
    root.style.setProperty('--wecan-word-scale-v6',wordScale.toFixed(5));
    root.style.setProperty('--wecan-word-opacity-v6',(1-wordFade).toFixed(5));
    root.style.setProperty('--wecan-word-shadow-v6',(reveal*.8).toFixed(5));
    root.style.setProperty('--wecan-hint-opacity-v6',(1-hintFade).toFixed(5));
    root.style.setProperty('--wecan-final-opacity-v6',finalIn.toFixed(5));
    root.style.setProperty('--wecan-final-y-v6',finalY.toFixed(2)+'px');
    root.style.setProperty('--wecan-final-blur-v6',finalBlur.toFixed(2)+'px');
    root.style.setProperty('--wecan-final-scale-v6',finalScale.toFixed(5));
    sticky.classList.toggle('is-final',finalIn>.68);
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
  addEventListener('orientationchange',()=>setTimeout(refresh,150),{passive:true});
  window.visualViewport?.addEventListener('resize',()=>requestAnimationFrame(refresh),{passive:true});
  document.addEventListener('languagechange',()=>requestAnimationFrame(refresh));

  if('ResizeObserver'in window){
    const ro=new ResizeObserver(()=>requestAnimationFrame(refresh));
    ro.observe(sticky);
  }
  const io=new IntersectionObserver(entries=>{
    visible=entries.some(e=>e.isIntersecting);
    if(visible)refresh();
  },{rootMargin:'280px 0px',threshold:0});
  io.observe(sticky);

  window.ByMeliWecanV6={requestUpdate:queueRead,refresh};
  if(image&&!image.complete)image.addEventListener('load',refresh,{once:true});
  if(document.fonts?.ready)document.fonts.ready.then(refresh);
  apply(0);
  refresh();
})();
