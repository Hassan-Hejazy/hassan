(function(){
  'use strict';
  // V33: one continuous master production environment. The six disciplines
  // remain spatially connected while the camera travels through the system.

  let canvas=document.getElementById('connectedCanvas');
  const track=document.getElementById('connectedTrack');
  if(!canvas||!track||!window.THREE)return;

  const THREE=window.THREE;
  const sticky=canvas.closest('.connected-sticky');
  const fallback=sticky&&sticky.querySelector('.connected-fallback');
  const copyBox=sticky&&sticky.querySelector('.connected-copy');
  const title=document.getElementById('connectedTitle');
  const body=document.getElementById('connectedBody');
  const index=document.getElementById('connectedIndex');
  const rail=Array.from(document.querySelectorAll('#connectedRail span'));
  const indicator=document.getElementById('connectedScrollIndicator');
  let factory=window.ByMeliServiceFactory||null;
  const getFactory=()=>factory||(factory=window.ByMeliServiceFactory||null);
  const Q=window.BYMELI_QUALITY||null;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const coarse=matchMedia('(pointer:coarse)').matches;

  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t);
  const smoother=t=>t*t*t*(t*(t*6-15)+10);
  const damp=(current,target,lambda,dt)=>lerp(current,target,1-Math.exp(-lambda*dt));
  function smoothDampScalar(current,target,velocity,smoothTime,maxSpeed,dt){
    smoothTime=Math.max(.001,smoothTime);
    const omega=2/smoothTime;
    const x=omega*dt;
    const exp=1/(1+x+.48*x*x+.235*x*x*x);
    let change=current-target;
    const originalTarget=target;
    const maxChange=maxSpeed*smoothTime;
    change=clamp(change,-maxChange,maxChange);
    target=current-change;
    const temp=(velocity+omega*change)*dt;
    velocity=(velocity-omega*temp)*exp;
    let output=target+(change+temp)*exp;
    if((originalTarget-current>0)===(output>originalTarget)){
      output=originalTarget;
      velocity=(output-originalTarget)/Math.max(dt,.001);
    }
    return {value:output,velocity};
  }
  const cubic=(a,b,c,d,t,out)=>{
    const it=1-t,it2=it*it,t2=t*t;
    return out.set(
      a.x*it2*it+3*b.x*it2*t+3*c.x*it*t2+d.x*t2*t,
      a.y*it2*it+3*b.y*it2*t+3*c.y*it*t2+d.y*t2*t,
      a.z*it2*it+3*b.z*it2*t+3*c.z*it*t2+d.z*t2*t
    );
  };

  const serviceTypes=['booth','showroom','interior','management','crowd','av'];
  const serviceCodes=['BUILD','DISPLAY','INTERIOR','MANAGE','FLOW','LIVE AV'];
  const copy={
    en:[
      ['Exhibition Stands & Pavilions','Architecture, structure, media and hospitality establish the first destination.'],
      ['Showrooms & Brand Spaces','Product hierarchy, display fixtures and long-life brand architecture continue the route.'],
      ['Event Interiors & Hospitality','Furniture, material warmth and lighting extend the experience into guest-facing spaces.'],
      ['Project Management & Site Delivery','Planning, approvals, logistics and site control connect design to opening day.'],
      ['Crowd & Guest Operations','Entry, queues, staffing and wayfinding keep movement calm, safe and clear.'],
      ['Audio Visual & Live Production','Stage, LED, sound, lighting and show control complete the connected system.']
    ],
    ar:[
      ['أجنحة المعارض والأجنحة الوطنية','تجمع نقطة البداية بين العمارة والهيكل والوسائط والضيافة ضمن بيئة واحدة.'],
      ['صالات العرض ومساحات العلامات التجارية','تتواصل الرحلة من خلال ترتيب المنتجات ووحدات العرض وهوية المكان طويلة الأمد.'],
      ['ديكورات الفعاليات والضيافة','يمتد أثر التجربة من خلال الأثاث ودفء المواد والإضاءة إلى المساحات المخصصة للضيوف.'],
      ['إدارة المشاريع والتنفيذ في الموقع','تربط الجداول والاعتمادات واللوجستيات وإدارة الموقع بين التصميم وموعد الافتتاح.'],
      ['إدارة الحشود وتجربة الضيوف','تحافظ بوابات الدخول والطوابير وفرق التشغيل والإرشاد على حركة واضحة وآمنة.'],
      ['الأنظمة السمعية والبصرية والإنتاج الحي','يكتمل المسار من خلال المسرح وشاشات LED والصوت والإضاءة وأنظمة التحكم.']
    ]
  };

  // The timing intentionally totals 1.0. Each discipline receives a long,
  // readable hold and every transfer is short enough to remain responsive.
  const HOLD=.084;
  const TRANSITION=.061;
  const OVERVIEW=1-(HOLD*6+TRANSITION*5);
  const OVERVIEW_START=HOLD*6+TRANSITION*5;

  let renderer=null,scene=null,camera=null,root=null;
  let profile=null,stations=[],stationBoxes=[],previewBoxes=[],overviewPositions=[],routePositions=[],stationRotations=[],overviewCenter=new THREE.Vector3();
  let holdCache=[],bridgeCache=[],overviewCache=[];
  let hub=null,hubCore=null,hubBadge=null,overviewLinkGroup=null,overviewLinks=[],hubRings=[],hubNodes=[],dataPackets=[],dust=null;
  let journeyGroup=null,journeyRoute=null,journeyPackets=[];
  let integratedWorld=null,worldRings=[],worldBeacons=[],worldFrames=[],routeRadius=8.6;
  let keyLight=null,rimLight=null,fillLight=null,topLight=null,surfaceTextures=null,edgeMaterial=null;
  let initialized=false,initQueued=false,initAttempts=0,factoryWaits=0,bound=false,contextLock=false,disposeTimer=0;
  let visible=false,pageVisible=!document.hidden,rafId=0,lastTime=0;
  let targetProgress=0,progress=0,progressVelocity=0,progressQueued=false,resizeQueued=false;
  let activeCopyStage=-1,overviewCopy=false,copyToken=0;
  let screenUpdateAt=0,styleUpdateAt=0,renderRatio=1,maxRenderRatio=1,motionRenderRatio=1,minRenderRatio=1,lastStateKey='',lastVeil=-1,lastTransit=null;
  let trackStart=0,trackSpan=1,lastRenderedAt=0,lastShadowAt=0,stableFrames=0,qualityWindowAt=0,qualityFrameTotal=0,qualityFrameCount=0,lastQualityChange=0;
  let stableViewportHeight=0,lastLayoutWidth=0,lastLayoutHeight=0,lastOrientation='',resizeForce=false,viewportSettleTimer=0;
  let lastScrollY=0,lastScrollAt=0,scrollVelocity=0,renderDirty=true,lastAmbientAt=0,qualityState='motion';

  const fitCamera=new THREE.PerspectiveCamera(36,1,.08,180);
  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpC=new THREE.Vector3();
  const WORLD_UP=new THREE.Vector3(0,1,0);

  function captureStableViewport(force=false){
    const vv=window.visualViewport;
    const w=Math.max(1,Math.round((vv&&vv.width)||window.innerWidth||document.documentElement.clientWidth||sticky.clientWidth||1));
    const h=Math.max(1,Math.round((vv&&vv.height)||window.innerHeight||document.documentElement.clientHeight||sticky.clientHeight||1));
    const orientation=w>h?'landscape':'portrait';
    const widthChanged=Math.abs(w-lastLayoutWidth)>2;
    const heightChanged=Math.abs(h-lastLayoutHeight)>2;
    const orientationChanged=orientation!==lastOrientation;
    const scrollSettled=performance.now()-lastScrollAt>220;
    if(force||!stableViewportHeight||widthChanged||orientationChanged||(!coarse&&heightChanged)||(coarse&&heightChanged&&scrollSettled&&Math.abs(h-stableViewportHeight)>42)){
      stableViewportHeight=h;
      lastLayoutWidth=w;
      lastLayoutHeight=h;
      lastOrientation=orientation;
      sticky.style.setProperty('--connected-vh',stableViewportHeight+'px');
    }
    return stableViewportHeight||h;
  }

  function getProfile(){
    const w=Math.max(1,Math.round(sticky.clientWidth||innerWidth));
    const h=Math.max(1,Math.round(stableViewportHeight||sticky.clientHeight||innerHeight));
    const aspect=w/h;
    const compact=w<760||(coarse&&w<900);
    const tablet=!compact&&w<1180;
    const portrait=aspect<.88;
    const landscape=aspect>1.46;
    const short=h<610;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const low=memory<=3||cores<=4;
    const high=memory>=6&&cores>=6;
    const tier=low?'low':(high?'high':'balanced');
    let fov=33.0;
    if(compact)fov=landscape?36.5:(portrait?35.5:36.0);
    else if(tablet)fov=34.0;
    return {w,h,aspect,compact,tablet,portrait,landscape,short,memory,cores,low,high,tier,fov};
  }

  function qualityTargets(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    let cap,targetWidth,targetHeight,ultraPixels,motionPixels,minRatio;
    if(p.compact){
      cap=p.high?2.90:(p.low?1.78:2.45);
      targetWidth=p.landscape?2560:1600;
      targetHeight=2160;
      ultraPixels=p.high?4600000:(p.low?2200000:3600000);
      motionPixels=p.high?2000000:(p.low?1100000:1550000);
      minRatio=p.low?1.20:1.52;
    }else if(p.tablet){
      cap=p.high?2.85:(p.low?1.80:2.46);
      targetWidth=3200;
      targetHeight=2160;
      ultraPixels=p.high?7600000:(p.low?3400000:5600000);
      motionPixels=p.high?3800000:(p.low?2000000:3100000);
      minRatio=p.low?1.24:1.52;
    }else{
      cap=p.high?2.85:(p.low?1.84:2.50);
      targetWidth=3840;
      targetHeight=2160;
      ultraPixels=p.high?8800000:(p.low?3800000:6700000);
      motionPixels=p.high?4600000:(p.low?2400000:3800000);
      minRatio=p.low?1.26:1.54;
    }
    const targetRatio=Math.min(targetWidth/Math.max(1,p.w),targetHeight/Math.max(1,p.h));
    const ultraBudget=Math.sqrt(ultraPixels/Math.max(1,p.w*p.h));
    const motionBudget=Math.sqrt(motionPixels/Math.max(1,p.w*p.h));
    const ultra=Math.max(1,Math.min(cap,targetRatio,Math.max(dpr,ultraBudget)));
    const motion=Math.max(1,Math.min(ultra,cap,targetRatio,motionBudget));
    return {ultra,motion,minimum:Math.min(ultra,minRatio)};
  }

  function capabilityRatioLimit(){
    if(!renderer||!profile)return Infinity;
    const gl=renderer.getContext&&renderer.getContext();
    let maxSize=(renderer.capabilities&&renderer.capabilities.maxTextureSize)||4096;
    try{if(gl)maxSize=Math.min(maxSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||maxSize);}catch(_){}
    return Math.max(1,Math.min(maxSize/Math.max(1,profile.w),maxSize/Math.max(1,profile.h)));
  }

  function applyRenderRatio(next,force=false){
    if(!renderer||!profile)return;
    const limit=capabilityRatioLimit();
    const rounded=Math.round(clamp(Math.min(next,limit),minRenderRatio,maxRenderRatio)*20)/20;
    if(!force&&Math.abs(rounded-renderRatio)<.045)return;
    renderRatio=rounded;
    renderer.setPixelRatio(renderRatio);
    renderer.setSize(profile.w,profile.h,false);
    renderDirty=true;
  }

  function useMotionQuality(){
    qualityState='motion';
    applyRenderRatio(motionRenderRatio);
  }

  function useUltraQuality(){
    qualityState='ultra';
    applyRenderRatio(maxRenderRatio);
  }

  function updateAdaptiveQuality(now,frameMs,scrollActive){
    if(scrollActive){
      if(qualityState!=='motion')useMotionQuality();
      qualityFrameTotal+=frameMs;qualityFrameCount+=1;
      if(now-qualityWindowAt<1100||qualityFrameCount<12)return;
      const average=qualityFrameTotal/qualityFrameCount;
      qualityWindowAt=now;qualityFrameTotal=0;qualityFrameCount=0;
      if(average>28&&motionRenderRatio>minRenderRatio+.10&&now-lastQualityChange>1800){
        motionRenderRatio=Math.max(minRenderRatio,motionRenderRatio-.10);
        maxRenderRatio=Math.max(motionRenderRatio,maxRenderRatio-.06);
        lastQualityChange=now;
        applyRenderRatio(motionRenderRatio,true);
      }
      return;
    }
    qualityFrameTotal=0;qualityFrameCount=0;qualityWindowAt=now;
    if(now-lastScrollAt>320&&qualityState!=='ultra')useUltraQuality();
  }


  // Each service uses the same intentional three-quarter direction in its
  // standalone view and in the connected walkthrough. The showroom is kept
  // closer to frontal so its product wall, consultation counter and glass edge
  // are readable together instead of being viewed from the closed side.
  // All service environments share one architectural front direction.
  // The camera moves around that front instead of flipping from left to right
  // between disciplines, so the standalone views and connected walkthrough
  // always present the open, client-facing side of each model.
  const SERVICE_RELATIVE_YAW=[.52,.38,.48,.46,.40,.50];
  const CAMERA_PRESETS={
    phonePortrait:[
      {yaw:.52,elev:.215,focusY:.018,compY:.020},
      {yaw:.38,elev:.205,focusY:.024,compY:.016},
      {yaw:.48,elev:.184,focusY:.042,compY:.023},
      {yaw:.46,elev:.214,focusY:.030,compY:.016},
      {yaw:.40,elev:.180,focusY:.050,compY:.027},
      {yaw:.50,elev:.205,focusY:.040,compY:.018}
    ],
    phoneLandscape:[
      {yaw:.55,elev:.228,focusY:.016,compY:.010},
      {yaw:.41,elev:.218,focusY:.022,compY:.009},
      {yaw:.51,elev:.198,focusY:.038,compY:.014},
      {yaw:.49,elev:.228,focusY:.028,compY:.010},
      {yaw:.43,elev:.192,focusY:.046,compY:.016},
      {yaw:.53,elev:.220,focusY:.036,compY:.012}
    ],
    tablet:[
      {yaw:.58,elev:.238,focusY:.014,compY:.008},
      {yaw:.44,elev:.226,focusY:.020,compY:.007},
      {yaw:.54,elev:.208,focusY:.034,compY:.012},
      {yaw:.52,elev:.238,focusY:.026,compY:.008},
      {yaw:.46,elev:.200,focusY:.040,compY:.014},
      {yaw:.56,elev:.228,focusY:.032,compY:.010}
    ],
    desktop:[
      {yaw:.60,elev:.248,focusY:.012,compY:.006},
      {yaw:.46,elev:.238,focusY:.018,compY:.005},
      {yaw:.56,elev:.216,focusY:.032,compY:.010},
      {yaw:.54,elev:.250,focusY:.024,compY:.006},
      {yaw:.48,elev:.208,focusY:.038,compY:.012},
      {yaw:.58,elev:.236,focusY:.030,compY:.008}
    ]
  };

  function stagePreset(i){
    if(profile.compact&&profile.portrait)return CAMERA_PRESETS.phonePortrait[i];
    if(profile.compact)return CAMERA_PRESETS.phoneLandscape[i];
    if(profile.tablet)return CAMERA_PRESETS.tablet[i];
    return CAMERA_PRESETS.desktop[i];
  }

  function worldYawFor(i){return stagePreset(i).yaw;}

  function configureRoute(){
    routeRadius=profile.compact?(profile.portrait?7.15:7.65):(profile.tablet?8.10:8.70);
    // Clockwise route around one shared production hub. Every model keeps the
    // same client-facing angle relative to the camera while occupying a real
    // position in the master environment.
    const angles=[-.12,.93,1.98,3.03,4.08,5.13];
    routePositions=angles.map(a=>new THREE.Vector3(Math.sin(a)*routeRadius,0,Math.cos(a)*routeRadius));
    overviewCenter.set(0,0,0);
    stationRotations=routePositions.map((p,i)=>{
      const worldYaw=Math.atan2(-p.x,-p.z);
      return worldYaw-stagePreset(i).yaw;
    });
  }


  function configureOverview(){
    if(profile.compact&&profile.portrait){
      overviewPositions=[
        new THREE.Vector3(-2.75,0,4.05),new THREE.Vector3(2.75,0,4.05),
        new THREE.Vector3(-2.75,0,0),new THREE.Vector3(2.75,0,0),
        new THREE.Vector3(-2.75,0,-4.05),new THREE.Vector3(2.75,0,-4.05)
      ];
    }else if(profile.compact&&profile.landscape){
      overviewPositions=[
        new THREE.Vector3(-4.05,0,2.45),new THREE.Vector3(0,0,2.45),new THREE.Vector3(4.05,0,2.45),
        new THREE.Vector3(-4.05,0,-2.45),new THREE.Vector3(0,0,-2.45),new THREE.Vector3(4.05,0,-2.45)
      ];
    }else if(profile.tablet||profile.w<1250){
      overviewPositions=[
        new THREE.Vector3(-3.05,0,4.25),new THREE.Vector3(3.05,0,4.25),
        new THREE.Vector3(-3.05,0,0),new THREE.Vector3(3.05,0,0),
        new THREE.Vector3(-3.05,0,-4.25),new THREE.Vector3(3.05,0,-4.25)
      ];
    }else{
      overviewPositions=[
        new THREE.Vector3(-5.20,0,3.05),new THREE.Vector3(0,0,3.05),new THREE.Vector3(5.20,0,3.05),
        new THREE.Vector3(-5.20,0,-3.05),new THREE.Vector3(0,0,-3.05),new THREE.Vector3(5.20,0,-3.05)
      ];
    }
    updateOverviewLinks();
  }

  function createRenderer(){
    const options={canvas,antialias:!profile.low,alpha:false,premultipliedAlpha:false,powerPreference:'high-performance',precision:profile.low?'mediump':'highp',stencil:false,preserveDrawingBuffer:false,depth:true,logarithmicDepthBuffer:false,desynchronized:false,failIfMajorPerformanceCaveat:false};
    try{return new THREE.WebGLRenderer(options);}
    catch(_){
      try{return new THREE.WebGLRenderer(Object.assign({},options,{antialias:false,powerPreference:'default',precision:'mediump'}));}
      catch(__){return null;}
    }
  }

  function makeLiveScreen(i){
    const c=document.createElement('canvas');
    const high=profile.high&&!profile.low;
    c.width=profile.compact?(high?1536:(profile.low?768:1024)):(high?2048:1536);
    c.height=Math.round(c.width*9/16);
    const ctx=c.getContext('2d',{alpha:false});
    const tex=new THREE.CanvasTexture(c);
    tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
    tex.minFilter=THREE.LinearMipmapLinearFilter;
    tex.magFilter=THREE.LinearFilter;
    tex.generateMipmaps=true;
    tex.encoding=THREE.sRGBEncoding;
    if(renderer&&renderer.capabilities&&renderer.capabilities.getMaxAnisotropy)tex.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate=true;
    return {canvas:c,ctx,texture:tex,last:-1,lastDrawAt:0,index:i};
  }

  function drawScreen(screen,time,active,overview){
    const interval=active?180:(overview?520:360);
    const bucket=Math.floor(time/interval);
    if(screen.last===bucket)return;
    screen.last=bucket;
    const c=screen.canvas,x=screen.ctx,w=c.width,h=c.height;
    const accent=screen.index%2?'#70d2bf':'#efc56b';
    const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#050a09');g.addColorStop(.55,'#102923');g.addColorStop(1,'#181006');x.fillStyle=g;x.fillRect(0,0,w,h);
    const glow=x.createRadialGradient(w*.74,h*.22,4,w*.74,h*.22,w*.7);glow.addColorStop(0,screen.index%2?'rgba(105,220,199,.34)':'rgba(240,194,100,.34)');glow.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=glow;x.fillRect(0,0,w,h);
    x.strokeStyle='rgba(240,218,172,.085)';x.lineWidth=1;
    for(let i=0;i<10;i++){x.beginPath();x.moveTo(i*w/9,0);x.lineTo(i*w/9,h);x.stroke();}
    for(let i=0;i<6;i++){x.beginPath();x.moveTo(0,i*h/5);x.lineTo(w,i*h/5);x.stroke();}
    x.strokeStyle='rgba(238,207,142,.48)';x.lineWidth=Math.max(2,w/480);x.strokeRect(w*.055,h*.075,w*.89,h*.85);
    x.fillStyle='#fff7e8';x.font=`800 ${Math.round(h*.135)}px Inter,Arial,sans-serif`;x.fillText('BY MELI',w*.085,h*.23);
    x.fillStyle=accent;x.font=`600 ${Math.round(h*.05)}px monospace`;x.fillText(`${String(screen.index+1).padStart(2,'0')} / ${serviceCodes[screen.index]}`,w*.09,h*.335);
    x.fillStyle='rgba(255,247,232,.76)';x.font=`500 ${Math.round(h*.038)}px Inter,Arial,sans-serif`;x.fillText(active?'LIVE PRODUCTION SYSTEM':'CONNECTED DELIVERY NETWORK',w*.09,h*.43);
    const phase=(time*.00042+screen.index*.13)%1;
    x.lineWidth=Math.max(2,w/560);x.strokeStyle=accent;x.beginPath();
    for(let k=0;k<56;k++){
      const px=w*(.09+.82*k/55),wave=Math.sin(k*.31+phase*Math.PI*2)*.052+Math.sin(k*.105+screen.index)*.02;
      const py=h*(.69-wave);if(k===0)x.moveTo(px,py);else x.lineTo(px,py);
    }
    x.stroke();
    for(let k=0;k<16;k++){x.fillStyle=k/16<phase?accent:'rgba(255,255,255,.15)';x.fillRect(w*(.09+k*.049),h*.81,w*.03,h*.013);}
    screen.texture.needsUpdate=true;
  }

  function makeMicroTexture(kind){
    const size=profile.high?(profile.compact?768:1024):(profile.low?320:(profile.compact?512:768));
    const c=document.createElement('canvas');c.width=c.height=size;
    const x=c.getContext('2d',{alpha:false});const image=x.createImageData(size,size);let seed=kind==='metal'?9127:(kind==='fabric'?4813:1729);
    const data=image.data,total=size*size;
    for(let n=0;n<total;n++){
      const xx=n%size,y=(n/size)|0,i=n*4;
      seed=(seed*1664525+1013904223)>>>0;
      const random=seed/4294967296-.5;
      let v;
      if(kind==='metal')v=224+Math.sin((xx+y*.08)*.58)*4.1+Math.sin(xx*.074)*2.2+random*4.2;
      else if(kind==='fabric')v=220+(Math.sin(xx*.44)+Math.sin(y*.47))*3.1+Math.sin((xx+y)*.18)*1.4+random*5.2;
      else v=229+Math.sin(xx*.052)*3+Math.cos(y*.046)*2.5+random*7.5;
      v=Math.max(190,Math.min(252,v));data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
    }
    x.putImageData(image,0,0);
    const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(kind==='metal'?7:kind==='fabric'?5.5:4,kind==='metal'?7:kind==='fabric'?5.5:4);
    tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=true;
    if(renderer&&renderer.capabilities&&renderer.capabilities.getMaxAnisotropy)tex.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate=true;return tex;
  }

  function makeSurfaceTextures(){
    return {plaster:makeMicroTexture('plaster'),metal:makeMicroTexture('metal'),fabric:makeMicroTexture('fabric')};
  }

  function tuneMaterials(materials){
    if(!materials)return;
    const plaster=surfaceTextures&&surfaceTextures.plaster;
    const metal=surfaceTextures&&surfaceTextures.metal;
    const fabric=surfaceTextures&&surfaceTextures.fabric;
    Object.keys(materials).forEach(key=>{
      const m=materials[key];if(!m)return;
      m.dithering=true;
      if('envMapIntensity' in m)m.envMapIntensity=Math.min(profile.compact?1.50:1.82,Math.max(.78,m.envMapIntensity||1));
      const map=(key==='gold'||key==='goldDark'||key==='dark')?metal:((key==='teal'||key==='red')?fabric:plaster);
      if(map&&'roughnessMap' in m&&key!=='glass'&&key!=='screen')m.roughnessMap=map;
      if(map&&'bumpMap' in m&&key!=='glass'&&key!=='screen'){
        m.bumpMap=map;
        m.bumpScale=(key==='gold'||key==='goldDark')?.0017:(key==='dark'?.0024:(key==='teal'||key==='red'?.0015:.00125));
      }
      m.needsUpdate=true;
    });
    if(materials.white){materials.white.color.setHex(0xece5d9);materials.white.roughness=.39;materials.white.metalness=.018;materials.white.envMapIntensity=1.02;materials.white.clearcoat=.16;materials.white.clearcoatRoughness=.22;}
    if(materials.cream){materials.cream.color.setHex(0xdccdaf);materials.cream.roughness=.40;materials.cream.envMapIntensity=1.10;materials.cream.clearcoat=.12;materials.cream.clearcoatRoughness=.24;}
    if(materials.dark){materials.dark.color.setHex(0x17130f);materials.dark.roughness=.27;materials.dark.metalness=.48;materials.dark.envMapIntensity=1.38;}
    if(materials.teal){materials.teal.color.setHex(0x609e92);materials.teal.roughness=.31;materials.teal.emissiveIntensity=.045;materials.teal.envMapIntensity=1.32;materials.teal.clearcoat=.30;materials.teal.clearcoatRoughness=.14;}
    if(materials.red){materials.red.roughness=.38;materials.red.envMapIntensity=.96;}
    if(materials.glass){
      materials.glass.transmission=0;materials.glass.opacity=profile.compact?.32:.38;materials.glass.roughness=profile.compact?.070:.050;
      materials.glass.metalness=.018;materials.glass.depthWrite=false;materials.glass.envMapIntensity=1.72;materials.glass.clearcoat=.70;materials.glass.clearcoatRoughness=.025;
    }
    if(materials.gold){materials.gold.color.setHex(0xdab05e);materials.gold.roughness=.19;materials.gold.metalness=.84;materials.gold.clearcoat=profile.compact?.62:.74;materials.gold.clearcoatRoughness=.065;materials.gold.envMapIntensity=profile.compact?1.64:1.92;}
    if(materials.goldDark){materials.goldDark.color.setHex(0x805b2a);materials.goldDark.roughness=.29;materials.goldDark.metalness=.69;materials.goldDark.envMapIntensity=1.52;}
    if(materials.screen){materials.screen.emissiveIntensity=1.10;materials.screen.roughness=.10;materials.screen.metalness=.03;materials.screen.envMapIntensity=.88;}
    Object.keys(materials).forEach(key=>materials[key]&&(materials[key].needsUpdate=true));
  }

  function addUltraDetail(type,group,m){
    const detail=new THREE.Group();detail.name='ultra-detail';group.add(detail);
    const accent=new THREE.MeshBasicMaterial({color:0xe8c36f,transparent:true,opacity:.76,depthWrite:false,toneMapped:false});
    const tealGlow=new THREE.MeshBasicMaterial({color:0x79d4c1,transparent:true,opacity:.60,depthWrite:false,toneMapped:false});
    const dark=m.dark,gold=m.goldDark||m.gold,cream=m.cream;
    const box=(x,y,z,w,h,d,mat=gold)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=renderer.shadowMap.enabled;mesh.receiveShadow=renderer.shadowMap.enabled;detail.add(mesh);return mesh;};
    const cyl=(x,y,z,rt,rb,h,mat=gold,seg=20)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);mesh.position.set(x,y,z);mesh.castShadow=renderer.shadowMap.enabled;mesh.receiveShadow=renderer.shadowMap.enabled;detail.add(mesh);return mesh;};
    const strip=(x,y,z,w,h,d,mat=accent)=>box(x,y,z,w,h,d,mat);
    // Shared premium construction details: recessed floor seams and fastening points.
    [-2.4,0,2.4].forEach(x=>strip(x,.315,2.25,1.25,.014,.025,accent));
    [[-2.75,-2.0],[2.75,-2.0],[-2.75,2.0],[2.75,2.0]].forEach(([x,z])=>cyl(x,.34,z,.045,.045,.035,gold,16));
    if(type==='booth'){
      [-2.65,2.65].forEach(x=>strip(x,2.15,-2.02,.035,3.2,.035,tealGlow));
      [-1.65,-.55,.55,1.65].forEach(x=>{const lamp=cyl(x,4.42,.95,.06,.085,.18,dark,20);lamp.rotation.x=Math.PI/2;});
      box(0,4.22,2.28,2.9,.08,.035,accent);
    }else if(type==='showroom'){
      [-1.75,-.55,.65,1.85].forEach(z=>strip(-2.72,2.32,z,.035,3.5,.035,accent));
      [-1.9,-.65,.65,1.9].forEach(z=>box(-2.28,1.08,z,.48,.025,.26,cream));
      box(1.78,.95,-1.43,1.1,.025,.42,tealGlow);
    }else if(type==='interior'){
      [-1.8,-1.2,-.6,0,.6,1.2,1.8].forEach(x=>strip(x,2.45,-1.63,.022,2.25,.028,gold));
      [-.75,.75].forEach(x=>cyl(x,.97,.72,.055,.06,.20,accent,18));
      box(0,.38,2.12,4.8,.018,.04,tealGlow);
    }else if(type==='management'){
      [-2.0,-1.0,0,1.0,2.0].forEach(x=>box(x,1.075,.82,.62,.018,.40,cream));
      [-2.45,2.45].forEach(x=>{for(let y=.35;y<1.1;y+=.22)cyl(x,y,1.88,.032,.032,.08,accent,14);});
      strip(0,2.53,-2.015,4.9,.025,.03,tealGlow);
    }else if(type==='crowd'){
      [-1.5,-.5,.5,1.5].forEach(x=>strip(x,.74,.70,.025,.05,3.0,accent));
      [-2.15,2.15].forEach(x=>{box(x,1.42,-1.22,.48,1.55,.08,dark);strip(x,1.82,-1.17,.34,.035,.02,tealGlow);});
      for(let i=0;i<8;i++)cyl(-2.4+i*.69,.34,2.12,.03,.03,.025,accent,12);
    }else if(type==='av'){
      [-1.75,-.9,0,.9,1.75].forEach(x=>strip(x,2.18,-1.48,.045,1.85,.025,tealGlow));
      [-2.28,2.28].forEach(x=>{for(let y=.72;y<1.75;y+=.24)box(x,y,-.78,.50,.075,.52,dark);});
      for(let r=0;r<3;r++)for(let c=0;c<8;c++)cyl(-1.1+c*.31,.76+r*.15,1.75,.022,.022,.025,r%2?tealGlow:accent,10);
    }
    group.traverse(o=>{if(o.isMesh&&o.geometry){o.geometry.computeVertexNormals&&o.geometry.computeVertexNormals();o.frustumCulled=true;}});
  }


  function platformRadius(box){
    const size=new THREE.Vector3();box.getSize(size);
    return clamp(Math.max(size.x,size.z)*.52+.62,3.72,4.92);
  }

  function makePlatform(i,radius){
    const group=new THREE.Group();
    const accent=i%2?0x70cfbc:0xe8be67;
    const seg=profile.low?48:(profile.compact?64:88);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius+.18,.20,seg),new THREE.MeshStandardMaterial({color:0x11100d,roughness:.84,metalness:.16,envMapIntensity:.62}));
    base.position.y=.10;base.receiveShadow=Boolean(renderer.shadowMap.enabled);group.add(base);
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(radius-.22,radius-.22,.035,seg),new THREE.MeshStandardMaterial({color:0x19150f,roughness:.70,metalness:.22,envMapIntensity:.72}));inner.position.y=.22;group.add(inner);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius-.38,.036,8,seg+20),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.78,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));ring.rotation.x=Math.PI/2;ring.position.y=.245;group.add(ring);
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(radius-.82,.012,6,seg),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.23,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));ring2.rotation.x=Math.PI/2;ring2.position.y=.25;group.add(ring2);

    const shadowSize=profile.compact?384:640;
    const c=document.createElement('canvas');c.width=c.height=shadowSize;const x=c.getContext('2d');
    const g=x.createRadialGradient(shadowSize/2,shadowSize/2,shadowSize*.02,shadowSize/2,shadowSize/2,shadowSize*.49);
    g.addColorStop(0,'rgba(0,0,0,.62)');g.addColorStop(.38,'rgba(0,0,0,.30)');g.addColorStop(.78,'rgba(0,0,0,.055)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,shadowSize,shadowSize);
    const shadowTex=new THREE.CanvasTexture(c);shadowTex.minFilter=THREE.LinearFilter;shadowTex.magFilter=THREE.LinearFilter;shadowTex.generateMipmaps=false;
    const shadowPlane=new THREE.Mesh(new THREE.PlaneGeometry(radius*1.78,radius*1.78),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:profile.compact?.50:.58,depthWrite:false,toneMapped:false}));
    shadowPlane.rotation.x=-Math.PI/2;shadowPlane.position.y=.252;shadowPlane.renderOrder=1;group.add(shadowPlane);

    const nodeMaterial=new THREE.MeshStandardMaterial({color:0x16130e,roughness:.33,metalness:.60,emissive:accent,emissiveIntensity:.20});
    const nodeGlow=new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.80,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const d=radius*.72;
    [[-d,-d],[d,-d],[-d,d],[d,d]].forEach(([px,pz],k)=>{
      const post=new THREE.Mesh(new THREE.CylinderGeometry(.045,.065,.56,12),nodeMaterial);post.position.set(px,.46,pz);group.add(post);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.07,12,8),nodeGlow);cap.position.set(px,.78,pz);cap.userData.phase=k*.8;group.add(cap);
    });
    return group;
  }

  function makeScanner(i,radius){
    const accent=i%2?0x75d3c1:0xefc66e;
    const group=new THREE.Group();
    const seg=profile.low?56:96;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius*.78,.016,6,seg),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));ring.rotation.x=Math.PI/2;group.add(ring);
    const glow=new THREE.Mesh(new THREE.RingGeometry(radius*.72,radius*.84,seg),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));glow.rotation.x=-Math.PI/2;group.add(glow);
    return {group,ring,glow};
  }



  function makePreview(type,m){
    const g=new THREE.Group();
    const box=(x,y,z,w,h,d,mat)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=false;g.add(mesh);return mesh;};
    const cyl=(x,y,z,rt,rb,h,mat,seg=18)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg),mat);mesh.position.set(x,y,z);mesh.castShadow=false;mesh.receiveShadow=false;g.add(mesh);return mesh;};
    if(type==='booth'){
      box(0,2.0,-1.25,4.8,3.4,.14,m.cream);box(-2.35,1.7,0,.14,3.2,2.5,m.white);box(2.35,1.7,0,.14,3.2,2.5,m.white);box(0,2.15,-1.14,2.6,1.45,.08,m.screen);box(0,.48,.55,2.0,.9,.75,m.dark);box(0,3.75,.7,3.6,.5,.12,m.gold);
    }else if(type==='showroom'){
      box(-2.05,2.0,0,.18,4.0,4.5,m.dark);for(let i=0;i<3;i++)box(-1.65,1+i*.9,0,.75,.09,3.8,m.gold);[-1.1,0,1.1].forEach((x,i)=>box(x,.38+i*.08,.55,1.0,.65+i*.16,1.0,i===1?m.gold:m.cream));box(2.15,1.65,0,.08,3.3,3.7,m.glass);box(.5,2.7,-1.65,2.1,.72,.08,m.screen);
    }else if(type==='interior'){
      box(0,.34,0,4.7,.08,3.6,m.goldDark);box(0,.82,-.55,3.4,.72,.95,m.cream);box(0,1.25,-.95,3.4,.85,.35,m.white);box(-1.9,.75,.6,.9,.65,1.4,m.teal);box(1.9,.75,.6,.9,.65,1.4,m.teal);cyl(0,.58,.85,.72,.72,.12,m.glass,28);cyl(0,.32,.85,.08,.13,.55,m.gold,16);cyl(-2.25,1.5,-.6,.08,.12,2.5,m.goldDark,12);cyl(2.25,1.5,-.6,.08,.12,2.5,m.goldDark,12);
    }else if(type==='management'){
      box(0,.45,.5,3.8,.85,1.25,m.dark);box(0,2.35,-1.45,4.5,2.5,.12,m.cream);box(0,2.35,-1.34,2.6,1.35,.07,m.screen);[-1.25,0,1.25].forEach(x=>box(x,.95,.35,.7,.08,.5,m.gold));box(-2.0,1.5,.65,.75,2.4,.75,m.teal);box(2.0,1.5,.65,.75,2.4,.75,m.teal);
    }else if(type==='crowd'){
      box(0,3.2,-1.35,4.8,.22,.22,m.gold);box(-2.4,1.6,-1.35,.22,3.2,.22,m.gold);box(2.4,1.6,-1.35,.22,3.2,.22,m.gold);[-1.5,-.5,.5,1.5].forEach(x=>box(x,.42,.7,.07,.78,3.2,m.dark));for(let i=0;i<12;i++)cyl((i%4-1.5)*.72,.58,Math.floor(i/4)*.8-.15,.12,.15,1.1,i%3?m.dark:m.teal,12);box(0,.48,-1.8,2.0,.9,.65,m.cream);box(0,2.7,-1.24,2.2,.65,.07,m.screen);
    }else{
      box(0,.26,-.2,5.0,.42,3.0,m.dark);box(0,2.1,-1.55,4.3,2.5,.12,m.screen);box(0,.55,1.65,2.8,.85,1.0,m.dark);[-2.3,2.3].forEach(x=>box(x,1.2,-1.0,.65,1.4,.6,m.dark));for(let i=-2;i<=2;i++)cyl(i*1.0,3.7,.8,.12,.16,.3,m.goldDark,12);box(0,4.0,.8,5.0,.12,.12,m.gold);
    }
    return g;
  }

  function buildStations(){
    const factory=getFactory();
    if(!factory||!factory.factories||!factory.createMaterials)throw new Error('Service 3D factory is unavailable');
    factory.setShadowEnabled&&factory.setShadowEnabled(Boolean(renderer.shadowMap.enabled));
    stations=[];stationBoxes=[];previewBoxes=[];
    serviceTypes.forEach((type,i)=>{
      const wrapper=new THREE.Group();wrapper.name=`connected-station-${type}`;
      const materials=factory?factory.createMaterials(renderer,{skipScreenTexture:true}):null;tuneMaterials(materials);
      const screen=makeLiveScreen(i);
      if(materials&&materials.screen){
        const old=materials.screen.map;materials.screen.map=screen.texture;materials.screen.emissiveMap=screen.texture;materials.screen.emissiveIntensity=1.10;materials.screen.needsUpdate=true;if(old&&old!==screen.texture&&old.dispose)old.dispose();
      }
      const detail=new THREE.Group();detail.name='detail';
      if(factory&&factory.factories&&factory.factories[type])factory.factories[type](detail,materials);
      addUltraDetail(type,detail,materials);
      detail.scale.setScalar(profile.compact?.995:1.01);detail.position.y=.28;
      detail.updateMatrixWorld(true);
      const rawBox=new THREE.Box3().setFromObject(detail);
      rawBox.min.sub(new THREE.Vector3(.20,.05,.20));rawBox.max.add(new THREE.Vector3(.20,.18,.20));
      const radius=platformRadius(rawBox);
      const platform=makePlatform(i,radius);wrapper.add(platform);wrapper.add(detail);
      if(Q)Q.addContactShadow(wrapper,renderer,radius*.93,profile.compact?.30:.36,.252);
      const preview=makePreview(type,materials);preview.position.y=.28;preview.visible=false;wrapper.add(preview);preview.updateMatrixWorld(true);
      const previewBox=new THREE.Box3().setFromObject(preview);previewBox.min.sub(new THREE.Vector3(.12,.04,.12));previewBox.max.add(new THREE.Vector3(.12,.12,.12));previewBoxes.push(previewBox.clone());
      const scanner=makeScanner(i,radius);wrapper.add(scanner.group);
      const accentColor=i%2?0x78d8c5:0xf0c66c;
      const accent=new THREE.PointLight(accentColor,profile.compact?.72:.92,14,2);accent.position.set(i%2?radius*.56:-radius*.56,4.1,radius*.48);wrapper.add(accent);
      const arch=new THREE.Mesh(new THREE.TorusGeometry(radius*.92,.018,6,profile.low?72:120,Math.PI*1.34),new THREE.MeshBasicMaterial({color:accentColor,transparent:true,opacity:.11,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      arch.rotation.set(Math.PI/2,0,-Math.PI*.17);arch.position.set(0,1.65,-radius*.26);wrapper.add(arch);
      root.add(wrapper);wrapper.position.set(0,0,0);wrapper.visible=false;wrapper.updateMatrixWorld(true);

      const meshes=[],localLights=[];
      detail.traverse(o=>{
        if(o.isMesh&&o.geometry){
          o.geometry.computeBoundingBox&&o.geometry.computeBoundingBox();
          const size=new THREE.Vector3();if(o.geometry.boundingBox)o.geometry.boundingBox.getSize(size);
          o.userData.connectedSize=Math.max(size.x,size.y,size.z)*Math.max(o.scale.x,o.scale.y,o.scale.z);
          o.userData.connectedCastShadow=o.castShadow;
          meshes.push(o);
        }
        if(o.isLight)localLights.push(o);
      });
      const edgeLimit=profile.low?0:(profile.compact?20:36);let edgeCount=0;
      detail.traverse(o=>{
        if(edgeCount>=edgeLimit||!o.isMesh||!o.geometry||!o.geometry.type||o.geometry.type!=='BoxGeometry')return;
        const size=o.userData.connectedSize||0;if(size<(profile.compact?.92:.78))return;
        const lines=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,28),edgeMaterial);
        lines.material=edgeMaterial;lines.renderOrder=3;lines.frustumCulled=true;o.add(lines);edgeCount+=1;
      });
      stationBoxes.push(rawBox.clone());
      stations.push({wrapper,detail,preview,platform,accent,scanner,arch,materials,screen,meshes,localLights,lod:null,radius,baseRotation:0});
    });
  }

  function updateOverviewLinks(){
    if(!overviewLinkGroup||!overviewPositions.length)return;
    overviewLinks.forEach((line,i)=>{
      const end=overviewPositions[i];
      const mid=end.clone().multiplyScalar(.53);mid.y=.42+Math.abs(end.z)*.025;
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,.34,0),mid,new THREE.Vector3(end.x,.34,end.z));
      const pts=curve.getPoints(profile&&profile.low?12:24);
      line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(pts);
    });
  }

  function buildIntegratedWorld(){
    if(integratedWorld){root.remove(integratedWorld);integratedWorld.traverse(o=>{o.geometry&&o.geometry.dispose&&o.geometry.dispose();if(o.material){const list=Array.isArray(o.material)?o.material:[o.material];list.forEach(m=>m&&m.dispose&&m.dispose());}});}
    integratedWorld=new THREE.Group();integratedWorld.name='integrated-master-environment';root.add(integratedWorld);
    worldRings=[];worldBeacons=[];worldFrames=[];
    const floorMat=new THREE.MeshPhysicalMaterial({color:0x080705,roughness:.64,metalness:.18,clearcoat:.10,clearcoatRoughness:.42,envMapIntensity:.58});
    const floor=new THREE.Mesh(new THREE.CylinderGeometry(routeRadius+4.2,routeRadius+4.45,.22,profile.low?96:160),floorMat);
    floor.position.y=-.16;floor.receiveShadow=renderer.shadowMap.enabled;integratedWorld.add(floor);
    const inset=new THREE.Mesh(new THREE.CylinderGeometry(routeRadius+1.55,routeRadius+1.75,.055,profile.low?96:160),new THREE.MeshStandardMaterial({color:0x0e0c09,roughness:.60,metalness:.18,envMapIntensity:.58}));
    inset.position.y=-.015;inset.receiveShadow=renderer.shadowMap.enabled;integratedWorld.add(inset);
    const hubFloor=new THREE.Mesh(new THREE.CylinderGeometry(3.38,3.62,.09,96),new THREE.MeshPhysicalMaterial({color:0x11100c,roughness:.46,metalness:.34,clearcoat:.14,clearcoatRoughness:.30,envMapIntensity:.82}));
    hubFloor.position.y=.035;hubFloor.receiveShadow=renderer.shadowMap.enabled;integratedWorld.add(hubFloor);
    const ringSpecs=[[routeRadius,.055,0xe4ba64,.50],[routeRadius+1.16,.022,0x66c6b5,.22],[3.28,.038,0xe8c36c,.42],[2.72,.016,0x6bd0bd,.25]];
    ringSpecs.forEach((spec,i)=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(spec[0],spec[1],profile.low?6:10,profile.low?128:220),new THREE.MeshBasicMaterial({color:spec[2],transparent:true,opacity:spec[3],depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));ring.rotation.x=Math.PI/2;ring.position.y=.11+i*.012;ring.renderOrder=1;integratedWorld.add(ring);worldRings.push(ring);});
    // Six architectural connectors make the space read as one delivery system.
    routePositions.forEach((p,i)=>{
      const a=Math.atan2(p.x,p.z),length=routeRadius-3.35;
      const path=new THREE.Mesh(new THREE.BoxGeometry(profile.compact?.14:.18,.022,length),new THREE.MeshPhysicalMaterial({color:i%2?0x101715:0x17130d,roughness:.58,metalness:.20,clearcoat:.06,clearcoatRoughness:.42,envMapIntensity:.52}));
      path.position.set(Math.sin(a)*(3.35+length*.5),.035,Math.cos(a)*(3.35+length*.5));path.rotation.y=a;path.receiveShadow=renderer.shadowMap.enabled;integratedWorld.add(path);
      const bladeMat=new THREE.MeshPhysicalMaterial({color:i%2?0x233a35:0x44351f,roughness:.30,metalness:.68,clearcoat:.20,clearcoatRoughness:.18,envMapIntensity:1.18});
      const left=new THREE.Mesh(new THREE.BoxGeometry(.045,3.45,.30),bladeMat);const right=left.clone();
      const tangent=new THREE.Vector3(Math.cos(a),0,-Math.sin(a));
      const frameCenter=p.clone().normalize().multiplyScalar(routeRadius+2.15);
      left.position.copy(frameCenter).addScaledVector(tangent,-3.0);right.position.copy(frameCenter).addScaledVector(tangent,3.0);left.position.y=1.72;right.position.y=1.72;left.rotation.y=right.rotation.y=a;integratedWorld.add(left,right);worldFrames.push(left,right);
      const cap=new THREE.Mesh(new THREE.BoxGeometry(6.05,.045,.30),bladeMat);cap.position.copy(frameCenter);cap.position.y=3.43;cap.rotation.y=a;integratedWorld.add(cap);worldFrames.push(cap);
      const beacon=new THREE.PointLight(i%2?0x6ed0be:0xeac268,profile.compact?.34:.48,9,2);beacon.position.copy(p).multiplyScalar(.82);beacon.position.y=.44;integratedWorld.add(beacon);worldBeacons.push(beacon);
      const node=new THREE.Mesh(new THREE.CylinderGeometry(.15,.21,.12,24),new THREE.MeshPhysicalMaterial({color:i%2?0x69c7b5:0xe5bb64,emissive:i%2?0x244d46:0x563b11,emissiveIntensity:.85,roughness:.20,metalness:.45,clearcoat:.38}));node.position.copy(p).multiplyScalar(.92);node.position.y=.13;integratedWorld.add(node);
    });
    const canopy=new THREE.Mesh(new THREE.TorusGeometry(routeRadius+1.05,.035,8,profile.low?128:220),new THREE.MeshBasicMaterial({color:0xe6bf6d,transparent:true,opacity:.18,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    canopy.rotation.x=Math.PI/2;canopy.position.y=5.55;integratedWorld.add(canopy);worldRings.push(canopy);
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      const beam=new THREE.Mesh(new THREE.BoxGeometry(.045,.045,routeRadius+1.05),new THREE.MeshBasicMaterial({color:i%2?0x69cbbb:0xe7c06a,transparent:true,opacity:.10,depthWrite:false,toneMapped:false}));
      beam.position.set(Math.sin(a)*(routeRadius+1.05)*.5,5.55,Math.cos(a)*(routeRadius+1.05)*.5);beam.rotation.y=a;integratedWorld.add(beam);
    }
  }

  function buildHub(){
    hub=new THREE.Group();root.add(hub);
    hubRings=[];hubNodes=[];dataPackets=[];
    hubCore=new THREE.Group();hubCore.visible=false;hub.add(hubCore);
    const coreBase=new THREE.Mesh(new THREE.CylinderGeometry(.72,.88,.18,48),new THREE.MeshStandardMaterial({color:0x17130e,roughness:.42,metalness:.48,envMapIntensity:1.0}));coreBase.position.y=.16;hubCore.add(coreBase);
    const coreRingA=new THREE.Mesh(new THREE.TorusGeometry(.58,.026,8,72),new THREE.MeshBasicMaterial({color:0xe8bd65,transparent:true,opacity:.88,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));coreRingA.rotation.x=Math.PI/2;coreRingA.position.y=.29;hubCore.add(coreRingA);
    const coreRingB=new THREE.Mesh(new THREE.TorusGeometry(.88,.012,6,72),new THREE.MeshBasicMaterial({color:0x6fd0bd,transparent:true,opacity:.42,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));coreRingB.rotation.x=Math.PI/2;coreRingB.position.y=.32;hubCore.add(coreRingB);
    const coreOrb=new THREE.Mesh(new THREE.SphereGeometry(.16,24,18),new THREE.MeshPhysicalMaterial({color:0xf0c66e,emissive:0xe1a94a,emissiveIntensity:1.35,roughness:.18,metalness:.28,clearcoat:.55,clearcoatRoughness:.12}));coreOrb.position.y=.72;hubCore.add(coreOrb);
    const coreBeam=new THREE.Mesh(new THREE.CylinderGeometry(.025,.07,2.15,16,1,true),new THREE.MeshBasicMaterial({color:0xe9c46d,transparent:true,opacity:.23,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));coreBeam.position.y=1.38;hubCore.add(coreBeam);
    const badgeCanvas=document.createElement('canvas');badgeCanvas.width=1024;badgeCanvas.height=384;const bx=badgeCanvas.getContext('2d');bx.clearRect(0,0,1024,384);bx.fillStyle='rgba(7,6,4,.82)';bx.fillRect(22,30,980,324);bx.strokeStyle='rgba(232,194,105,.72)';bx.lineWidth=4;bx.strokeRect(26,34,972,316);bx.fillStyle='#fff7e7';bx.font='800 112px Inter,Arial,sans-serif';bx.textAlign='center';bx.fillText('BY MELI',512,176);bx.fillStyle='#e7bd67';bx.font='500 34px monospace';bx.fillText('CONNECTED PRODUCTION SYSTEM',512,252);const badgeTex=new THREE.CanvasTexture(badgeCanvas);badgeTex.minFilter=THREE.LinearMipmapLinearFilter;badgeTex.magFilter=THREE.LinearFilter;badgeTex.generateMipmaps=true;badgeTex.encoding=THREE.sRGBEncoding;hubBadge=new THREE.Sprite(new THREE.SpriteMaterial({map:badgeTex,transparent:true,depthWrite:false,toneMapped:false}));hubBadge.position.set(0,1.30,0);hubBadge.scale.set(1.48,.56,1);hubCore.add(hubBadge);
    overviewLinkGroup=new THREE.Group();overviewLinkGroup.visible=false;root.add(overviewLinkGroup);overviewLinks=[];
    for(let i=0;i<6;i++){
      const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:i%2?0x6fd0bd:0xe8bd65,transparent:true,opacity:.0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      line.renderOrder=1;overviewLinkGroup.add(line);overviewLinks.push(line);
    }
    updateOverviewLinks();
    const ringSpecs=[[2.42,.012,.10],[3.02,.008,.05],[1.82,.018,.13]];
    ringSpecs.forEach((spec,i)=>{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(spec[0],spec[1],6,profile.low?72:128),new THREE.MeshBasicMaterial({color:i===1?0x65c8b6:0xe3b65f,transparent:true,opacity:spec[2],depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      ring.rotation.x=Math.PI/2;ring.position.y=.30+i*.012;hub.add(ring);hubRings.push(ring);
    });
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2-Math.PI/2;
      const node=new THREE.Group();
      const core=new THREE.Mesh(new THREE.SphereGeometry(.095,16,12),new THREE.MeshBasicMaterial({color:i%2?0x6fd1be:0xeec56b,transparent:true,opacity:.72,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      const orbit=new THREE.Mesh(new THREE.TorusGeometry(.23,.012,6,32),new THREE.MeshBasicMaterial({color:i%2?0x6fd1be:0xeec56b,transparent:true,opacity:.22,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));orbit.rotation.x=Math.PI/2;
      node.add(core,orbit);node.position.set(Math.cos(a)*2.46,.33,Math.sin(a)*2.46);hub.add(node);hubNodes.push(node);
    }
    const curve=new THREE.EllipseCurve(0,0,2.44,2.44,0,Math.PI*2,false,0);
    const points=curve.getPoints(profile.low?96:160).map(v=>new THREE.Vector3(v.x,.34,v.y));
    const route=new THREE.CatmullRomCurve3(points,true,'catmullrom',.5);
    const packetCount=profile.low?4:(profile.compact?6:9);
    for(let i=0;i<packetCount;i++){
      const packet=new THREE.Mesh(new THREE.SphereGeometry(.055,profile.low?8:12,profile.low?6:10),new THREE.MeshBasicMaterial({color:i%2?0x71d2bf:0xefc66c,transparent:true,opacity:.88,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      packet.userData={offset:i/packetCount,speed:.045+(i%3)*.004,curve:route};hub.add(packet);dataPackets.push(packet);
    }

    const count=profile.low?28:(profile.compact?48:72),positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,r=3+Math.random()*7;positions[i*3]=Math.cos(a)*r;positions[i*3+1]=.8+Math.random()*5.8;positions[i*3+2]=Math.sin(a)*r;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const dot=document.createElement('canvas');dot.width=dot.height=32;const dx=dot.getContext('2d');const dg=dx.createRadialGradient(16,16,1,16,16,15);dg.addColorStop(0,'rgba(255,242,209,.82)');dg.addColorStop(.35,'rgba(229,185,91,.22)');dg.addColorStop(1,'rgba(0,0,0,0)');dx.fillStyle=dg;dx.fillRect(0,0,32,32);
    const dotTex=new THREE.CanvasTexture(dot);dotTex.minFilter=THREE.LinearFilter;dotTex.magFilter=THREE.LinearFilter;dotTex.generateMipmaps=false;
    dust=new THREE.Points(geo,new THREE.PointsMaterial({map:dotTex,size:profile.compact?.050:.065,transparent:true,opacity:.14,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));dust.frustumCulled=false;root.add(dust);
  }

  function buildJourney(){
    if(journeyGroup){root.remove(journeyGroup);journeyGroup.traverse(o=>{o.geometry&&o.geometry.dispose&&o.geometry.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m&&m.dispose&&m.dispose());}});}
    journeyGroup=new THREE.Group();journeyPackets=[];root.add(journeyGroup);
    const points=routePositions.map(p=>new THREE.Vector3(p.x,.18,p.z));
    journeyRoute=new THREE.CatmullRomCurve3(points,true,'catmullrom',.18);
    const segments=profile.low?144:(profile.compact?220:300);
    const routeMat=new THREE.MeshBasicMaterial({color:0xe4b95f,transparent:true,opacity:.29,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const routeGlowMat=new THREE.MeshBasicMaterial({color:0x65c9b7,transparent:true,opacity:.075,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const route=new THREE.Mesh(new THREE.TubeGeometry(journeyRoute,segments,.026,6,true),routeMat);
    const glow=new THREE.Mesh(new THREE.TubeGeometry(journeyRoute,segments,.095,8,true),routeGlowMat);
    journeyGroup.add(glow,route);
    const count=profile.low?5:(profile.compact?8:12);
    for(let i=0;i<count;i++){
      const packet=new THREE.Mesh(new THREE.SphereGeometry(profile.compact?.047:.060,10,8),new THREE.MeshBasicMaterial({color:i%2?0x6fd0bd:0xf0c66e,transparent:true,opacity:.78,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      packet.userData={curve:journeyRoute,offset:i/count,speed:.028+(i%3)*.0025};journeyGroup.add(packet);journeyPackets.push(packet);
    }
  }


  function boxCorners(box){
    const a=box.min,b=box.max;return [
      new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(a.x,a.y,b.z),new THREE.Vector3(a.x,b.y,a.z),new THREE.Vector3(a.x,b.y,b.z),
      new THREE.Vector3(b.x,a.y,a.z),new THREE.Vector3(b.x,a.y,b.z),new THREE.Vector3(b.x,b.y,a.z),new THREE.Vector3(b.x,b.y,b.z)
    ];
  }

  function transformedBox(i,position,scale,usePreview=false,rotationY=0){
    const local=usePreview?previewBoxes[i]:stationBoxes[i];
    const matrix=new THREE.Matrix4().compose(
      position||new THREE.Vector3(),
      new THREE.Quaternion().setFromAxisAngle(WORLD_UP,rotationY||0),
      new THREE.Vector3(scale,scale,scale)
    );
    const box=new THREE.Box3();
    boxCorners(local).forEach(point=>box.expandByPoint(point.applyMatrix4(matrix)));
    return box;
  }

  function stageWorldBox(i){
    return transformedBox(i,routePositions[i],1,false,stationRotations[i]||0);
  }

  function safeFrame(){
    const rtl=document.documentElement.dir==='rtl';
    if(profile.compact&&profile.portrait)return {left:-.965,right:.965,bottom:-.31,top:.875};
    if(profile.compact&&profile.landscape)return rtl?{left:-.98,right:.08,bottom:-.86,top:.88}:{left:-.08,right:.98,bottom:-.86,top:.88};
    if(profile.compact)return {left:-.965,right:.965,bottom:-.36,top:.875};
    if(profile.tablet)return rtl?{left:-.98,right:.08,bottom:-.74,top:.90}:{left:-.08,right:.98,bottom:-.74,top:.90};
    return rtl?{left:-.98,right:.14,bottom:-.74,top:.91}:{left:-.14,right:.98,bottom:-.74,top:.91};
  }


  function cameraPosition(target,yaw,elev,distance,out){
    const horizontal=Math.cos(elev)*distance;
    return (out||new THREE.Vector3()).set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
  }

  function projectedBounds(box,target,yaw,elev,distance,fov){
    fitCamera.fov=fov;fitCamera.aspect=profile.aspect;fitCamera.near=.08;fitCamera.far=170;fitCamera.updateProjectionMatrix();
    fitCamera.position.copy(cameraPosition(target,yaw,elev,distance,tmpC));fitCamera.up.set(0,1,0);fitCamera.lookAt(target);fitCamera.updateMatrixWorld(true);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
    boxCorners(box).forEach(p=>{const n=p.clone().project(fitCamera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
    return {minX,minY,maxX,maxY,behind};
  }

  function fitDistance(box,target,yaw,elev,fov,padding){
    const safe=safeFrame();
    const frame={left:safe.left+padding,right:safe.right-padding,bottom:safe.bottom+padding,top:safe.top-padding};
    const fits=d=>{const b=projectedBounds(box,target,yaw,elev,d,fov);return !b.behind&&b.minX>=frame.left&&b.maxX<=frame.right&&b.minY>=frame.bottom&&b.maxY<=frame.top;};
    let low=1.2,high=4;while(!fits(high)&&high<160)high*=1.28;
    for(let i=0;i<24;i++){const mid=(low+high)*.5;if(fits(mid))high=mid;else low=mid;}
    return high*(profile.compact?1.006:1.008);
  }

  function framedPose(box,yaw,elev,fov,padding=.018,composition=null,focusTarget=null){
    const safe=safeFrame();
    const comp=composition||{x:0,y:0};
    const desiredX=(safe.left+safe.right)*.5+(comp.x||0);
    const desiredY=(safe.bottom+safe.top)*.5+(comp.y||0);
    const target=focusTarget?focusTarget.clone():box.getCenter(new THREE.Vector3());
    let distance=0;
    for(let pass=0;pass<9;pass++){
      distance=fitDistance(box,target,yaw,elev,fov,padding);
      const b=projectedBounds(box,target,yaw,elev,distance,fov);
      const currentX=(b.minX+b.maxX)*.5,currentY=(b.minY+b.maxY)*.5;
      const pos=cameraPosition(target,yaw,elev,distance,tmpA);
      const forward=target.clone().sub(pos).normalize();
      const right=new THREE.Vector3().crossVectors(forward,WORLD_UP).normalize();
      const up=new THREE.Vector3().crossVectors(right,forward).normalize();
      const halfV=Math.tan(THREE.MathUtils.degToRad(fov)*.5)*distance,halfH=halfV*profile.aspect;
      target.addScaledVector(right,-(desiredX-currentX)*halfH);
      target.addScaledVector(up,-(desiredY-currentY)*halfV);
    }
    distance=fitDistance(box,target,yaw,elev,fov,padding);
    return {pos:cameraPosition(target,yaw,elev,distance,new THREE.Vector3()),target,distance,fov};
  }

  function stageYaw(i){const p=routePositions[i];return Math.atan2(-p.x,-p.z);}

  function stageElevation(i){ return stagePreset(i).elev; }

  function stageComposition(i){ return {x:0,y:stagePreset(i).compY}; }

  function holdPose(i,u){
    const box=stageWorldBox(i);
    const size=box.getSize(new THREE.Vector3());
    const preset=stagePreset(i);
    const focus=box.getCenter(new THREE.Vector3());
    focus.y+=size.y*preset.focusY;
    const live=smoother(u),direction=i%2?-1:1;
    const yaw=stageYaw(i)+lerp(-.0032,.0032,live)*direction;
    const elev=stageElevation(i)+Math.sin(Math.PI*u)*.0014;
    const pose=framedPose(box,yaw,elev,profile.fov,profile.compact?.006:.009,stageComposition(i),focus);
    const dolly=1-Math.sin(Math.PI*u)*.0032;
    pose.pos.sub(pose.target).multiplyScalar(dolly).add(pose.target);
    return pose;
  }

  function transitionLayout(i,q){
    const t=smoother(q),side=i%2?-1:1;
    const inward=smoother(clamp(t/.62));
    const outward=smoother(clamp((t-.38)/.62));
    const hubA=new THREE.Vector3(-side*1.48,.08,-.34);
    const hubB=new THREE.Vector3(side*1.48,.08,.34);
    const aPos=routePositions[i].clone().lerp(hubA,inward);
    const bPos=hubB.clone().lerp(routePositions[i+1],outward);
    return {t,pulse:Math.sin(Math.PI*t),aPos,bPos,aScale:lerp(1,.38,inward),bScale:lerp(.38,1,outward),showA:q<.84,showB:q>.16};
  }

  function bridgePose(i,q){
    const layout=transitionLayout(i,q),t=layout.t;
    const union=new THREE.Box3();
    if(layout.showA)union.union(transformedBox(i,layout.aPos,layout.aScale,false,stationRotations[i]||0));
    if(layout.showB)union.union(transformedBox(i+1,layout.bPos,layout.bScale,false,stationRotations[i+1]||0));
    let yawDelta=stageYaw(i+1)-stageYaw(i);while(yawDelta>Math.PI)yawDelta-=Math.PI*2;while(yawDelta<-Math.PI)yawDelta+=Math.PI*2;
    const yaw=stageYaw(i)+yawDelta*t;
    const elev=lerp(stageElevation(i),stageElevation(i+1),t)+Math.sin(Math.PI*t)*(profile.compact?.055:.075);
    const focus=union.getCenter(new THREE.Vector3());const size=union.getSize(new THREE.Vector3());focus.y+=size.y*.025;
    const pose=framedPose(union,yaw,elev,profile.fov+(profile.compact?.65:.42),profile.compact?.014:.012,{x:0,y:lerp(stagePreset(i).compY,stagePreset(i+1).compY,t)},focus);
    pose.pos.sub(pose.target).multiplyScalar(1+Math.sin(Math.PI*t)*(profile.compact?.012:.018)).add(pose.target);
    return pose;
  }


  function finalOverviewScale(){
    if(profile.compact&&profile.portrait)return .52;
    if(profile.compact)return .54;
    if(profile.tablet||profile.w<1250)return .56;
    return .60;
  }

  function finalOverviewPose(){
    const union=new THREE.Box3(),scale=finalOverviewScale();
    stations.forEach((_,i)=>union.union(transformedBox(i,overviewCenter.clone().add(overviewPositions[i]),scale,false,stationRotations[i]||0)));
    const yaw=profile.compact&&profile.portrait?.03:(profile.compact?.08:(profile.tablet?.10:.14));
    const elev=profile.compact&&profile.portrait?.90:(profile.compact?.74:(profile.tablet?.82:.68));
    return framedPose(union,yaw,elev,profile.fov+(profile.compact?1.1:.65),profile.compact?.028:.022,{x:0,y:profile.compact?.012:.004});
  }

  function overviewPose(q){
    const start=holdCache[5][holdCache[5].length-1],end=overviewCache.final;
    const t=smoother(q);
    const target=start.target.clone().lerp(end.target,t);
    const a=start.pos.clone().sub(start.target);
    const b=end.pos.clone().sub(end.target);
    const sa=new THREE.Spherical().setFromVector3(a);
    const sb=new THREE.Spherical().setFromVector3(b);
    let thetaDelta=sb.theta-sa.theta;
    while(thetaDelta>Math.PI)thetaDelta-=Math.PI*2;
    while(thetaDelta<-Math.PI)thetaDelta+=Math.PI*2;
    const spherical=new THREE.Spherical(
      lerp(sa.radius,sb.radius,t)*(1+Math.sin(Math.PI*t)*(profile.compact?.055:.075)),
      lerp(sa.phi,sb.phi,t)-Math.sin(Math.PI*t)*(profile.compact?.010:.016),
      sa.theta+thetaDelta*t
    );
    const pos=new THREE.Vector3().setFromSpherical(spherical).add(target);
    return {pos,target,fov:lerp(start.fov,end.fov,t)};
  }


  function buildCameraCache(){
    holdCache=[];bridgeCache=[];
    const holdCount=profile.low?15:(profile.compact?37:49);
    const bridgeCount=profile.low?31:(profile.compact?73:91);
    for(let i=0;i<6;i++){
      const list=[];for(let k=0;k<holdCount;k++)list.push(holdPose(i,k/(holdCount-1)));holdCache.push(list);
    }
    for(let i=0;i<5;i++){
      const list=[];for(let k=0;k<bridgeCount;k++)list.push(bridgePose(i,k/(bridgeCount-1)));bridgeCache.push(list);
    }
    overviewCache={final:finalOverviewPose(),samples:[]};
    const overviewCount=profile.low?31:(profile.compact?67:83);
    for(let k=0;k<overviewCount;k++)overviewCache.samples.push(overviewPose(k/(overviewCount-1)));
  }

  function samplePose(samples,u){
    if(!samples||!samples.length)return null;
    if(samples.length===1)return samples[0];
    const scaled=clamp(u)*(samples.length-1),i=Math.min(samples.length-2,Math.floor(scaled)),t=scaled-i;
    const a=samples[i],b=samples[i+1];
    return {pos:a.pos.clone().lerp(b.pos,t),target:a.target.clone().lerp(b.target,t),fov:lerp(a.fov,b.fov,t)};
  }

  function timeline(p){
    p=clamp(p);
    if(p>=OVERVIEW_START)return {mode:'overview',stage:5,next:5,local:1,q:clamp((p-OVERVIEW_START)/OVERVIEW)};
    let cursor=0;
    for(let i=0;i<6;i++){
      if(p<cursor+HOLD||i===5)return {mode:'hold',stage:i,next:i,local:clamp((p-cursor)/HOLD),q:0};
      cursor+=HOLD;
      if(i<5){if(p<cursor+TRANSITION)return {mode:'transition',stage:i,next:i+1,local:1,q:clamp((p-cursor)/TRANSITION)};cursor+=TRANSITION;}
    }
    return {mode:'overview',stage:5,next:5,local:1,q:0};
  }

  function setStationLOD(station,mode){
    if(station.lod===mode)return;station.lod=mode;
    const overview=mode==='overview';
    const simplify=overview&&profile.low;
    const threshold=profile.compact?1.20:.78;
    station.meshes.forEach(mesh=>{
      mesh.visible=!simplify||(mesh.userData.connectedSize||1)>=threshold;
      mesh.castShadow=!overview&&Boolean(mesh.userData.connectedCastShadow);
    });
    station.localLights.forEach(light=>{light.visible=!overview&&!profile.compact;});
    station.platform.children.forEach((child,idx)=>{child.visible=!overview||idx<=5;});
    station.arch.visible=!overview;
    station.accent.visible=!overview;
  }


  function finalPlacement(i,q){
    const finalScale=finalOverviewScale();
    const finalPos=overviewCenter.clone().add(overviewPositions[i]);
    if(i===5){
      const collapse=smoother(clamp(q/.16));
      const emerge=smoother(clamp((q-.58)/.36));
      const hubPos=overviewCenter.clone();if(profile.compact&&profile.landscape){hubPos.x=-1.05;hubPos.y=1.58;}else hubPos.y=.92;
      const pos=routePositions[i].clone().lerp(hubPos,collapse).lerp(finalPos,emerge);
      const compactScale=lerp(1,.22,collapse);
      return {pos,scale:lerp(compactScale,finalScale,emerge),reveal:1};
    }
    const startAt=.50+i*.035;
    const reveal=smoother(clamp((q-startAt)/Math.max(.001,.94-startAt)));
    const start=overviewCenter.clone().add(overviewPositions[i].clone().multiplyScalar(.18));start.y=.14;
    return {pos:start.lerp(finalPos,reveal),scale:lerp(.035,finalScale,reveal),reveal};
  }

  function transitionVeil(state){
    if(state.mode==='transition')return Math.pow(Math.sin(Math.PI*clamp(state.q)),2.2)*.055;
    if(state.mode==='overview')return state.q<.50?Math.pow(Math.sin(Math.PI*clamp(state.q/.50)),1.8)*.075:0;
    return 0;
  }

  function applyState(state){
    stations.forEach(s=>{s.wrapper.visible=false;s.detail.visible=false;s.preview.visible=false;s.accent.intensity=0;s.scanner.group.visible=false;});
    const worldOverviewT=state.mode==='overview'?smoother(clamp((state.q-.08)/.76)):0;
    if(journeyGroup){journeyGroup.visible=state.mode!=='overview'||state.q<.84;journeyGroup.scale.setScalar(state.mode==='overview'?lerp(1,.38,worldOverviewT):1);}
    if(integratedWorld){integratedWorld.visible=state.mode!=='overview'||state.q<.84;integratedWorld.scale.setScalar(state.mode==='overview'?lerp(1,.38,worldOverviewT):1);worldFrames.forEach(f=>{f.visible=!profile.compact&&state.mode==='hold';});}
    if(state.mode==='hold'){
      const s=stations[state.stage];setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;
      s.wrapper.position.copy(routePositions[state.stage]);s.wrapper.scale.setScalar(1);s.wrapper.rotation.y=stationRotations[state.stage]||0;
      s.accent.intensity=profile.compact?.82:1.00;s.scanner.group.visible=true;
    }else if(state.mode==='transition'){
      const a=stations[state.stage],b=stations[state.next];setStationLOD(a,'full');setStationLOD(b,'full');
      const layout=transitionLayout(state.stage,state.q),t=layout.t;
      a.wrapper.visible=layout.showA;b.wrapper.visible=layout.showB;a.detail.visible=a.wrapper.visible;b.detail.visible=b.wrapper.visible;
      a.wrapper.position.copy(layout.aPos);b.wrapper.position.copy(layout.bPos);
      a.wrapper.rotation.y=stationRotations[state.stage]||0;b.wrapper.rotation.y=stationRotations[state.next]||0;
      a.wrapper.scale.setScalar(layout.aScale);b.wrapper.scale.setScalar(layout.bScale);
      a.accent.intensity=lerp(profile.compact?.80:.96,.12,t);b.accent.intensity=lerp(.12,profile.compact?.80:.96,t);
      a.scanner.group.visible=state.q<.22;b.scanner.group.visible=state.q>.78;
    }else{
      stations.forEach((s,i)=>{
        const p=finalPlacement(i,state.q);if(p.reveal<=.004&&i!==5)return;
        setStationLOD(s,'overview');s.wrapper.visible=true;s.detail.visible=true;s.preview.visible=false;
        s.wrapper.position.copy(p.pos);s.wrapper.scale.setScalar(p.scale);const overviewYaw=profile.compact&&profile.portrait?(i%2?-.08:.08):0;s.wrapper.rotation.y=lerp(stationRotations[i]||0,overviewYaw,smoother(clamp(state.q/.92)));
      });
    }
    if(hub){
      const inOverview=state.mode==='overview';
      const hs=inOverview?lerp(profile.compact?.72:.82,profile.compact?.88:1.02,smoother(state.q)):profile.compact?.72:.84;
      hub.position.copy(overviewCenter);hub.scale.setScalar(hs);hub.position.y=.02;
      if(hubCore)hubCore.visible=true;if(hubBadge)hubBadge.visible=state.mode==='overview'||(!profile.compact&&state.mode==='hold');
      if(overviewLinkGroup){overviewLinkGroup.visible=inOverview&&state.q>.18;overviewLinks.forEach((line,i)=>{line.material.opacity=overviewLinkGroup.visible?(.13+(i%2)*.04):0;});}
    }
    stations.forEach(s=>{if(s.wrapper.visible)s.wrapper.updateMatrixWorld(true);});
    const veil=transitionVeil(state);if(Math.abs(veil-lastVeil)>.001){lastVeil=veil;sticky.style.setProperty('--connected-transition',veil.toFixed(4));}
  }

  function evaluateCamera(state){
    const samples=state.mode==='hold'?holdCache[state.stage]:(state.mode==='transition'?bridgeCache[state.stage]:overviewCache.samples);
    const u=state.mode==='hold'?state.local:state.q;
    if(!samples||!samples.length)return null;
    const scaled=clamp(u)*(samples.length-1);
    const idx=Math.min(samples.length-2,Math.floor(scaled));
    const mix=samples.length===1?0:scaled-idx;
    const a=samples[idx],b=samples[Math.min(samples.length-1,idx+1)];
    desiredPos.copy(a.pos).lerp(b.pos,mix);
    desiredTarget.copy(a.target).lerp(b.target,mix);
    return {fov:lerp(a.fov,b.fov,mix)};
  }


  function copyStageFor(state){return state.mode==='transition'&&state.q>.56?state.next:state.stage;}

  function updateCopy(state){
    const overview=state.mode==='overview'&&state.q>.70;
    const stage=copyStageFor(state);
    if(stage===activeCopyStage&&overview===overviewCopy)return;
    activeCopyStage=stage;overviewCopy=overview;
    const lang=document.documentElement.lang==='ar'?'ar':'en',token=++copyToken;
    copyBox&&copyBox.classList.add('switching');
    requestAnimationFrame(()=>{
      if(token!==copyToken)return;
      if(overview){
        if(index)index.textContent='06 / 06';
        if(title)title.textContent=lang==='ar'?'منظومة تنفيذ واحدة متكاملة':'One connected delivery system';
        if(body)body.textContent=lang==='ar'?'تجتمع الخدمات الست ضمن تكوين واحد واضح يمثل رحلة التنفيذ من الفكرة حتى الافتتاح.':'All six disciplines resolve into one clear production system from concept through opening day.';
        rail.forEach(x=>x.classList.add('active'));
      }else{
        const item=copy[lang][stage];
        if(index)index.textContent=String(stage+1).padStart(2,'0')+' / 06';
        if(title)title.textContent=item[0];
        if(body)body.textContent=item[1];
        rail.forEach((x,i)=>x.classList.toggle('active',i===stage));
      }
      requestAnimationFrame(()=>{if(token===copyToken&&copyBox)copyBox.classList.remove('switching');});
    });
  }

  function updateLighting(stage,state){
    const active=state.mode==='overview'?-1:copyStageFor(state);
    const focus=active>=0?routePositions[active].clone():overviewCenter.clone();focus.y=1.50;
    if(keyLight){keyLight.position.copy(focus).add(new THREE.Vector3(profile.compact?4.8:6.2,profile.compact?7.2:8.8,profile.compact?4.6:5.8));keyLight.target.position.copy(focus);keyLight.target.updateMatrixWorld();}
    if(rimLight)rimLight.position.copy(focus).add(new THREE.Vector3(-4.4,4.2,-4.8));
    if(fillLight)fillLight.position.copy(focus).add(new THREE.Vector3(4.0,3.0,4.2));
    if(topLight)topLight.position.set(0,7.8,0);
  }


  function animateScene(now,state,dt){
    const t=now*.001,active=copyStageFor(state),overview=state.mode==='overview'&&state.q>.48;
    dataPackets.forEach((p,i)=>{const u=(t*p.userData.speed+p.userData.offset)%1;p.userData.curve.getPointAt(u,p.position);p.position.y+=Math.sin(t*2.2+i)*.010;p.material.opacity=.58+.18*Math.sin(Math.PI*u);});
    journeyPackets.forEach((p,i)=>{const u=(t*p.userData.speed+p.userData.offset)%1;p.userData.curve.getPointAt(u,p.position);p.position.y+=Math.sin(t*2+i)*.008;p.material.opacity=.52+.20*Math.sin(Math.PI*u);});
    hubRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.020:-.016);ring.material.opacity=(i===2?.10:.045)+Math.sin(t*.55+i)*.006;});
    hubNodes.forEach((node,i)=>{const selected=overview||i===active;node.scale.setScalar(selected?1.12:1);node.children[0].material.opacity=selected?.88:.52;node.children[1].rotation.z+=dt*(i%2?.22:-.18);node.children[1].material.opacity=selected?.42:.14;});
    if(hubCore&&hubCore.visible){hubCore.rotation.y+=dt*.10;hubCore.children[1].rotation.z+=dt*.34;hubCore.children[2].rotation.z-=dt*.22;hubCore.children[3].scale.setScalar(1+Math.sin(t*2.2)*.08);hubCore.children[4].material.opacity=.18+.08*Math.sin(t*1.7);}
    if(overviewLinkGroup&&overviewLinkGroup.visible)overviewLinks.forEach((line,i)=>{line.material.opacity=.17+.045*(.5+.5*Math.sin(t*.85+i*.72));});
    if(dust){dust.rotation.y=Math.sin(t*.07)*.008;dust.position.y=Math.sin(t*.14)*.025;}
    worldRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.004:-.003);});
    worldBeacons.forEach((light,i)=>{light.intensity=(profile.compact?.30:.43)+Math.sin(t*.72+i*.8)*.055;});
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const isActive=i===active;
      if(s.detail.visible&&state.mode==='hold'&&isActive&&(!profile.low||Math.floor(now/50)!==Math.floor((now-dt*1000)/50)))factory&&factory.animate&&factory.animate(s.detail,t+i*.17);
      s.arch.rotation.z+=dt*(i%2?.017:-.017);
      if(s.scanner.group.visible){const phase=(t*.22+i*.17)%1;const y=.42+phase*3.45;s.scanner.group.position.y=y;s.scanner.ring.material.opacity=(1-Math.abs(phase-.5)*2)*.16;s.scanner.glow.material.opacity=(1-Math.abs(phase-.5)*2)*.038;}
      s.platform.children.forEach(child=>{if(child.userData&&Number.isFinite(child.userData.phase))child.material.opacity=.62+.14*Math.sin(t*1.15+child.userData.phase);});
      if(isActive&&state.mode==='hold'&&now-s.screen.lastDrawAt>650){s.screen.lastDrawAt=now;drawScreen(s.screen,now,true,false);}
    });
    if(now-screenUpdateAt>1500){screenUpdateAt=now;stations.forEach((s,i)=>{if(s.wrapper.visible&&i!==active)drawScreen(s.screen,now,false,overview);});}
  }

  function measureTrack(){
    const y=document.scrollingElement?document.scrollingElement.scrollTop:(window.scrollY||window.pageYOffset||0);
    const rect=track.getBoundingClientRect();
    trackStart=rect.top+y;
    trackSpan=Math.max(1,track.offsetHeight-(stableViewportHeight||sticky.clientHeight));
  }

  function readProgress(now=performance.now()){
    const y=document.scrollingElement?document.scrollingElement.scrollTop:(window.scrollY||window.pageYOffset||0);
    const dy=y-lastScrollY;
    if(Math.abs(dy)>.01){
      const elapsed=Math.max(8,now-lastScrollAt||16);
      scrollVelocity=dy/elapsed;
      lastScrollAt=now;
      lastScrollY=y;
      renderDirty=true;
    }else scrollVelocity*=.86;
    const next=clamp((y-trackStart)/trackSpan);
    if(Math.abs(next-targetProgress)>.000001){targetProgress=next;renderDirty=true;}
    document.body.classList.toggle('connected-scene-active',y>=trackStart-(stableViewportHeight||sticky.clientHeight)*.08&&y<=trackStart+trackSpan+(stableViewportHeight||sticky.clientHeight)*.08);
  }

  function scheduleProgress(){readProgress();if(qualityState!=='motion')useMotionQuality();startLoop();}

  function resize(){
    resizeQueued=false;if(!renderer||!camera)return;stableFrames=0;
    captureStableViewport(resizeForce);resizeForce=false;
    profile=getProfile();configureRoute();configureOverview();buildIntegratedWorld();buildJourney();measureTrack();
    {const q=qualityTargets(profile);maxRenderRatio=q.ultra;motionRenderRatio=q.motion;minRenderRatio=q.minimum;renderRatio=Math.min(renderRatio||motionRenderRatio,maxRenderRatio);}
    applyRenderRatio(qualityState==='ultra'?maxRenderRatio:motionRenderRatio,true);
    camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    buildCameraCache();updateLighting(0,{mode:'hold',stage:0,next:0,q:0});readProgress();progress=targetProgress;progressVelocity=0;
    const state=timeline(progress);applyState(state);updateLighting(copyStageFor(state),state);
    const stateKey=state.mode+':'+state.stage+':'+state.next;
    if(renderer.shadowMap.enabled&&stateKey!==lastStateKey){lastStateKey=stateKey;renderer.shadowMap.needsUpdate=true;lastShadowAt=performance.now();}
    const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    stations.forEach(s=>{s.lod=null;});
    renderDirty=true;
  }

  function scheduleResize(force=false){
    const w=Math.max(1,Math.round(window.innerWidth||document.documentElement.clientWidth||1));
    const h=Math.max(1,Math.round(window.innerHeight||document.documentElement.clientHeight||1));
    const orientation=w>h?'landscape':'portrait';
    const widthChanged=Math.abs(w-lastLayoutWidth)>2;
    const orientationChanged=orientation!==lastOrientation;
    const mobileLike=w<900||coarse;
    if(!force&&mobileLike&&!widthChanged&&!orientationChanged)return;
    if(!force&&!mobileLike&&!widthChanged&&Math.abs(h-lastLayoutHeight)<=2)return;
    resizeForce=resizeForce||force||widthChanged||orientationChanged||!mobileLike;
    if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);
  }

  function render(now){
    rafId=0;if(!renderer||!scene||!camera||!visible||!pageVisible)return;
    readProgress(now);
    const scrollActive=now-lastScrollAt<145&&(Math.abs(scrollVelocity)>.005||Math.abs(targetProgress-progress)>.000001);
    const minFrameMs=scrollActive?0:(profile.low?50:(profile.compact?34:28));
    if(!renderDirty&&lastRenderedAt&&now-lastRenderedAt<minFrameMs){rafId=requestAnimationFrame(render);return;}
    const frameMs=lastRenderedAt?Math.min(80,now-lastRenderedAt):16.67;
    lastRenderedAt=now;
    const dt=lastTime?Math.min(.04,(now-lastTime)/1000):1/60;lastTime=now;
    updateAdaptiveQuality(now,frameMs,scrollActive);
    // Every physical scroll position maps directly to one deterministic 3D
    // frame. No camera easing is applied to scrub progress, so touch inertia,
    // trackpads and mouse wheels remain visually locked to the scene.
    progress=targetProgress;
    progressVelocity=0;
    const state=timeline(progress);applyState(state);updateLighting(copyStageFor(state),state);
    const stateKey=state.mode+':'+state.stage+':'+state.next;
    if(renderer.shadowMap.enabled){
      const movingState=state.mode!=='hold';
      const shadowInterval=profile.compact?72:(profile.high?58:76);
      if(stateKey!==lastStateKey||movingState&&scrollActive&&now-lastShadowAt>shadowInterval){
        lastStateKey=stateKey;renderer.shadowMap.needsUpdate=true;lastShadowAt=now;
      }
    }
    const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);if(Math.abs(camera.fov-pose.fov)>.001){camera.fov=pose.fov;camera.updateProjectionMatrix();}}
    const transit=state.mode!=='hold';if(copyBox&&transit!==lastTransit){lastTransit=transit;copyBox.classList.toggle('in-transit',transit);}updateCopy(state);animateScene(now,state,dt);
    if(now-styleUpdateAt>32){styleUpdateAt=now;sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');if(indicator)indicator.style.opacity=progress>.94?'0':'1';}
    renderer.render(scene,camera);
    renderDirty=false;lastAmbientAt=now;stableFrames+=1;
    if(stableFrames>=2&&!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
    rafId=requestAnimationFrame(render);
  }

  function startLoop(){if(!rafId&&initialized&&visible&&pageVisible){lastTime=0;progressVelocity=0;renderDirty=true;rafId=requestAnimationFrame(render);}}
  function stopLoop(){if(rafId){cancelAnimationFrame(rafId);rafId=0;}}

  function nudgeRecoveryResize(){
    if(!initialized)return;
    setTimeout(()=>scheduleResize(true),90);
    setTimeout(()=>scheduleResize(true),280);
  }

  function disposeConnected(replace=true){
    clearTimeout(disposeTimer);stopLoop();
    if(renderer||scene){
      try{
        scene&&scene.traverse(obj=>{
          obj.geometry&&obj.geometry.dispose&&obj.geometry.dispose();
          const mats=Array.isArray(obj.material)?obj.material:[obj.material];
          mats.forEach(mat=>{
            if(!mat)return;
            ['map','emissiveMap','bumpMap','normalMap','roughnessMap','metalnessMap','alphaMap','envMap'].forEach(key=>{
              const tex=mat[key];if(tex&&tex.dispose)tex.dispose();
            });
            mat.dispose&&mat.dispose();
          });
        });
        if(scene&&scene.environment&&scene.environment.dispose)scene.environment.dispose();
        renderer&&renderer.renderLists&&renderer.renderLists.dispose&&renderer.renderLists.dispose();
        renderer&&renderer.dispose&&renderer.dispose();
        if(replace){
          try{renderer&&renderer.forceContextLoss&&renderer.forceContextLoss();}catch(_){}
          try{renderer&&renderer.getContext&&renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext?.();}catch(_){}
        }
      }catch(_){}
    }
    surfaceTextures&&Object.values(surfaceTextures).forEach(tex=>tex&&tex.dispose&&tex.dispose());
    edgeMaterial&&edgeMaterial.dispose&&edgeMaterial.dispose();
    renderer=scene=camera=root=null;surfaceTextures=edgeMaterial=null;
    stations=[];stationBoxes=[];previewBoxes=[];holdCache=[];bridgeCache=[];overviewCache=[];
    hub=hubCore=hubBadge=overviewLinkGroup=null;overviewLinks=[];hubRings=[];hubNodes=[];dataPackets=[];dust=null;
    journeyGroup=journeyRoute=null;journeyPackets=[];integratedWorld=null;worldRings=[];worldBeacons=[];worldFrames=[];keyLight=rimLight=fillLight=topLight=null;
    initialized=false;initQueued=false;stableFrames=0;lastStateKey='';lastVeil=-1;lastTransit=null;
    sticky.classList.remove('model-active');sticky.style.setProperty('--connected-transition','0');
    if(fallback)fallback.style.opacity='.16';
    unlockServiceContexts('disposed');
    if(replace&&canvas&&canvas.isConnected)resetCanvas();
  }

  function resetCanvas(){
    if(!canvas||!canvas.isConnected)return;
    const clone=canvas.cloneNode(false);clone.width=1;clone.height=1;clone.style.pointerEvents='none';clone.style.touchAction='pan-y';canvas.replaceWith(clone);canvas=clone;
  }

  function bindCanvasLoss(){
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();sticky.classList.remove('model-active');if(fallback)fallback.style.opacity='.30';
      disposeConnected(true);lockServiceContexts();setTimeout(queueInit,320);
    },{once:true});
  }

  function bindGlobal(){
    if(bound)return;bound=true;
    const io=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting);
      document.body.classList.toggle('connected-scene-active',visible);
      if(visible){
        clearTimeout(disposeTimer);lockServiceContexts();measureTrack();readProgress();
        if(!initialized&&!initQueued)queueInit();else{markConnectedReady();scheduleResize();startLoop();}
      }else{
        stopLoop();clearTimeout(disposeTimer);unlockServiceContexts('idle');
      }
    },{rootMargin:'220px 0px',threshold:0});io.observe(sticky);
    addEventListener('scroll',scheduleProgress,{passive:true});
    addEventListener('resize',()=>scheduleResize(false),{passive:true});
    window.visualViewport?.addEventListener('resize',()=>{scheduleResize(false);clearTimeout(viewportSettleTimer);viewportSettleTimer=setTimeout(()=>scheduleResize(true),240);},{passive:true});
    addEventListener('orientationchange',()=>setTimeout(()=>scheduleResize(true),180),{passive:true});
    addEventListener('pageshow',()=>{if(visible){scheduleResize(true);startLoop();}},{passive:true});
    if('ResizeObserver'in window){const ro=new ResizeObserver(()=>scheduleResize(false));ro.observe(sticky);ro.observe(track);}
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;lastTime=0;if(pageVisible&&visible)startLoop();else stopLoop();});
    document.addEventListener('bymeli:service-scene-claim',()=>{if(initialized&&!visible)unlockServiceContexts('idle');});
    document.addEventListener('languagechange',()=>{activeCopyStage=-1;overviewCopy=false;updateCopy(timeline(progress));});
  }

  function lockServiceContexts(){
    if(contextLock)return;
    contextLock=true;
    window.__BYMELI_CONNECTED_STARTING__=true;
    document.dispatchEvent(new CustomEvent('bymeli:connected-scene-state',{detail:{active:true,phase:'starting'}}));
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:false,reason:'connected-start'}}));
  }

  function markConnectedReady(){
    contextLock=true;
    window.__BYMELI_CONNECTED_STARTING__=false;
    document.dispatchEvent(new CustomEvent('bymeli:connected-scene-state',{detail:{active:true,phase:'ready'}}));
  }

  function unlockServiceContexts(phase='disposed'){
    contextLock=false;
    window.__BYMELI_CONNECTED_STARTING__=false;
    document.dispatchEvent(new CustomEvent('bymeli:connected-scene-state',{detail:{active:false,phase}}));
  }

  function init(){
    if(initialized)return;
    const availableFactory=getFactory();
    if(!availableFactory){
      initialized=false;initQueued=false;factoryWaits+=1;
      if(factoryWaits<30)setTimeout(queueInit,80);
      else{unlockServiceContexts('factory-unavailable');if(fallback)fallback.style.opacity='.42';}
      return;
    }
    factoryWaits=0;initialized=true;initQueued=false;initAttempts+=1;stableFrames=0;captureStableViewport(true);profile=getProfile();configureRoute();configureOverview();
    renderer=createRenderer();
    if(!renderer){initialized=false;if(fallback)fallback.style.opacity='.45';resetCanvas();if(initAttempts<5)setTimeout(queueInit,Math.min(1200,260*initAttempts));else unlockServiceContexts('renderer-unavailable');return;}
    {const q=qualityTargets(profile),limit=capabilityRatioLimit();maxRenderRatio=Math.min(q.ultra,limit);motionRenderRatio=Math.min(q.motion,maxRenderRatio);minRenderRatio=Math.min(maxRenderRatio,q.minimum);renderRatio=motionRenderRatio;qualityState='motion';}
    if(Q)Q.configureRenderer(renderer,{exposure:1.08,pixelCap:renderRatio});
    else{renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;}
    renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);renderer.setClearColor(0x090806,1);renderer.sortObjects=true;renderer.physicallyCorrectLights=false;
    renderer.toneMappingExposure=1.08;
    const connectedShadows=!profile.low&&(profile.high||!profile.compact);
    renderer.shadowMap.enabled=connectedShadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x090806);scene.fog=new THREE.FogExp2(0x090806,profile.compact?.0027:.0022);if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);
    surfaceTextures=makeSurfaceTextures();
    edgeMaterial=new THREE.LineBasicMaterial({color:0xf5e8c9,transparent:true,opacity:profile.compact?.032:.044,depthWrite:false,toneMapped:false});
    scene.add(new THREE.HemisphereLight(0xffe8c2,0x080706,profile.compact?.82:.92));
    keyLight=new THREE.DirectionalLight(0xffd99a,profile.compact?1.72:1.96);keyLight.position.set(7,10,7);keyLight.castShadow=renderer.shadowMap.enabled;scene.add(keyLight);scene.add(keyLight.target);
    if(keyLight.castShadow){const requested=profile.compact?2048:(profile.high?4096:2048);const size=Math.min(renderer.capabilities.maxTextureSize||4096,requested);keyLight.shadow.mapSize.set(size,size);keyLight.shadow.camera.left=-10;keyLight.shadow.camera.right=10;keyLight.shadow.camera.top=10;keyLight.shadow.camera.bottom=-10;keyLight.shadow.bias=-.00022;keyLight.shadow.normalBias=.022;keyLight.shadow.radius=profile.compact?1.8:2.4;}
    rimLight=new THREE.PointLight(0x72d2bf,profile.compact?.88:1.14,25,1.9);scene.add(rimLight);
    fillLight=new THREE.PointLight(0xe3b35c,profile.compact?.72:.94,24,2);scene.add(fillLight);
    topLight=new THREE.PointLight(0xffe6bb,profile.compact?.38:.52,18,2);scene.add(topLight);
    updateLighting(0,{mode:'hold',stage:0,next:0,q:0});

    buildIntegratedWorld();buildHub();buildStations();buildJourney();measureTrack();
    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.08,170);scene.add(camera);
    buildCameraCache();
    const state=timeline(0);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    bindCanvasLoss();bindGlobal();readProgress();progress=targetProgress;initAttempts=0;markConnectedReady();nudgeRecoveryResize();if(visible)startLoop();
  }

  function queueInit(){
    if(initialized||initQueued)return;
    initQueued=true;
    lockServiceContexts();
    // The event above disposes service renderers synchronously. A short delay
    // lets mobile browsers finish releasing the old WebGL contexts before the
    // connected renderer requests a new one.
    setTimeout(()=>{
      if(initialized){markConnectedReady();return;}
      document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:false,reason:'connected-final-release'}}));
      try{init();}
      catch(error){
        console.error('[By Meli] Connected V33 failed:',error);
        initialized=false;initQueued=false;
        if(fallback)fallback.style.opacity='.42';
        if(initAttempts<5)setTimeout(queueInit,Math.min(1400,320*(initAttempts+1)));
        else unlockServiceContexts('failed');
      }
    },coarse?360:210);
  }

  function auditAt(value){
    if(!initialized||!camera)return {initialized:false};
    progress=targetProgress=clamp(value);const state=timeline(progress);applyState(state);updateLighting(copyStageFor(state),state);const pose=evaluateCamera(state);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const frame=safeFrame(),items=[];
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const box=transformedBox(i,s.wrapper.position,s.wrapper.scale.x,s.preview.visible,s.wrapper.rotation.y);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
      boxCorners(box).forEach(p=>{const n=p.clone().project(camera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
      items.push({i,minX,maxX,minY,maxY,behind,rotationY:s.wrapper.rotation.y,scale:s.wrapper.scale.x,inside:!behind&&minX>=frame.left-.035&&maxX<=frame.right+.035&&minY>=frame.bottom-.035&&maxY<=frame.top+.035});
    });
    return {initialized:true,progress,state,frame,profile:{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio},camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,fov:camera.fov},target:{x:desiredTarget.x,y:desiredTarget.y,z:desiredTarget.z},veil:transitionVeil(state),items};
  }

  function renderAt(value){
    if(!initialized||!renderer||!camera)return {initialized:false};
    stopLoop();visible=false;document.body.classList.add('connected-scene-active');
    progress=targetProgress=clamp(value);const state=timeline(progress);applyState(state);updateLighting(copyStageFor(state),state);const pose=evaluateCamera(state);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();
    updateCopy(state);animateScene(performance.now(),state,1/60);renderer.render(scene,camera);
    sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';
    return auditAt(progress);
  }

  window.ByMeliConnectedV33={forceInit:queueInit,dispose:()=>disposeConnected(true),auditAt,renderAt,getState:()=>({initialized,progress,target:targetProgress,state:timeline(progress),profile:profile?{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio,ultraRatio:maxRenderRatio,motionRatio:motionRenderRatio,qualityState}:null})};
  window.ByMeliConnectedV32=window.ByMeliConnectedV33;
  window.ByMeliConnectedV31=window.ByMeliConnectedV33;
  window.ByMeliConnectedV30=window.ByMeliConnectedV33;
  window.ByMeliConnectedV29=window.ByMeliConnectedV33;
  window.ByMeliConnectedV28=window.ByMeliConnectedV33;
  window.ByMeliConnectedV27=window.ByMeliConnectedV33;
  window.ByMeliConnectedV26=window.ByMeliConnectedV33;
  window.ByMeliConnectedV25=window.ByMeliConnectedV33;
  window.ByMeliConnectedV24=window.ByMeliConnectedV33;
  window.ByMeliConnectedV20=window.ByMeliConnectedV33;
  const bootstrap=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){bootstrap.disconnect();queueInit();}},{rootMargin:'360px 0px',threshold:0});bootstrap.observe(track);
  setTimeout(()=>{if(!initialized&&!initQueued){const r=track.getBoundingClientRect();if(r.top<innerHeight*3&&r.bottom>-innerHeight)queueInit();}},1000);
})();
