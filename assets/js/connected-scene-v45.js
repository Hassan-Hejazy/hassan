(function(){
  'use strict';

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
  const HOLD=.088;
  const TRANSITION=.062;
  const OVERVIEW=1-(HOLD*6+TRANSITION*5);
  const OVERVIEW_START=HOLD*6+TRANSITION*5;

  let renderer=null,scene=null,camera=null,root=null;
  let profile=null,stations=[],stationBoxes=[],cameraBoxes=[],previewBoxes=[],overviewPositions=[],routePositions=[],stationRotations=[],overviewCenter=new THREE.Vector3();
  let holdCache=[],bridgeCache=[],overviewCache=[];
  let hub=null,hubCore=null,overviewLinkGroup=null,overviewLinks=[],hubRings=[],hubNodes=[],dataPackets=[],dust=null;
  let journeyGroup=null,journeyRoute=null,journeyPackets=[];
  let keyLight=null,rimLight=null,fillLight=null,topLight=null,surfaceTextures=null,edgeMaterial=null;
  let initialized=false,initQueued=false,initAttempts=0,factoryWaits=0,bound=false,contextLock=false,disposeTimer=0,initStartedAt=0,initReadyAt=0;
  let visible=false,pageVisible=!document.hidden,rafId=0,lastTime=0;
  let targetProgress=0,progress=0,progressVelocity=0,progressQueued=false,resizeQueued=false;
  let activeCopyStage=-1,overviewCopy=false,copyToken=0;
  let screenUpdateAt=0,styleUpdateAt=0,renderRatio=1,maxRenderRatio=1,motionRenderRatio=1,minRenderRatio=1,qualityState='motion',lastStateKey='',lastVeil=-1,lastTransit=null;
  let trackStart=0,trackSpan=1,lastRenderedAt=0,lastShadowAt=0,stableFrames=0,qualityWindowAt=0,qualityFrameTotal=0,qualityFrameCount=0,lastQualityChange=0,lastScrollAt=0,lastScrollY=0,scrollVelocity=0;

  const fitCamera=new THREE.PerspectiveCamera(36,1,.08,180);
  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpC=new THREE.Vector3();
  const WORLD_UP=new THREE.Vector3(0,1,0);

  function getProfile(){
    const w=Math.max(1,Math.round(sticky.clientWidth||innerWidth));
    const h=Math.max(1,Math.round(sticky.clientHeight||innerHeight));
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
    let fov=32.8;
    if(compact)fov=landscape?34.3:(portrait?33.2:33.8);
    else if(tablet)fov=33.4;
    return {w,h,aspect,compact,tablet,portrait,landscape,short,memory,cores,low,high,tier,fov};
  }

  function qualityTargets(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    let motionPixels,ultraPixels,motionCap,ultraCap,targetW,targetH,minRatio;
    if(p.compact){
      targetW=p.landscape?2880:2160;targetH=p.landscape?1800:3440;
      motionPixels=p.high?2250000:(p.low?980000:1650000);
      ultraPixels=p.high?6000000:(p.low?2200000:4200000);
      motionCap=p.high?2.35:(p.low?1.52:2.00);
      ultraCap=p.high?3.08:(p.low?1.96:2.70);
      minRatio=p.low?1.12:1.42;
    }else if(p.tablet){
      targetW=3200;targetH=2160;
      motionPixels=p.high?3200000:(p.low?1600000:2450000);
      ultraPixels=p.high?7200000:(p.low?3000000:5200000);
      motionCap=p.high?2.22:(p.low?1.58:1.98);
      ultraCap=p.high?3.05:(p.low?2.00:2.68);
      minRatio=p.low?1.18:1.46;
    }else{
      targetW=3840;targetH=2160;
      motionPixels=p.high?4400000:(p.low?2200000:3400000);
      ultraPixels=p.high?9000000:(p.low?4200000:7000000);
      motionCap=p.high?2.30:(p.low?1.72:2.08);
      ultraCap=p.high?3.10:(p.low?2.10:2.82);
      minRatio=p.low?1.24:1.55;
    }
    const targetRatio=Math.min(targetW/Math.max(1,p.w),targetH/Math.max(1,p.h));
    const motion=Math.max(1,Math.min(dpr,motionCap,targetRatio,Math.sqrt(motionPixels/Math.max(1,p.w*p.h))));
    const ultra=Math.max(motion,Math.min(Math.max(dpr,motion),ultraCap,targetRatio,Math.sqrt(ultraPixels/Math.max(1,p.w*p.h))));
    return {motion,ultra,minimum:Math.min(motion,minRatio)};
  }

  function capabilityRatioLimit(){
    if(!renderer||!profile)return Infinity;
    const gl=renderer.getContext&&renderer.getContext();
    let maxSize=renderer.capabilities?.maxTextureSize||4096;
    try{if(gl)maxSize=Math.min(maxSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||maxSize);}catch(_){}
    return Math.max(1,Math.min(maxSize/Math.max(1,profile.w),maxSize/Math.max(1,profile.h)));
  }

  function applyRenderRatio(next,force=false){
    if(!renderer||!profile)return;
    const rounded=Math.round(Math.min(next,capabilityRatioLimit())*20)/20;
    if(!force&&Math.abs(rounded-renderRatio)<.045)return;
    renderRatio=rounded;renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);
  }
  function useMotionQuality(){
    if(qualityState==='motion')return;
    qualityState='motion';applyRenderRatio(motionRenderRatio,true);lastQualityChange=performance.now();
  }
  function useUltraQuality(){
    if(qualityState==='ultra')return;
    qualityState='ultra';applyRenderRatio(maxRenderRatio,true);lastQualityChange=performance.now();
  }
  function updateAdaptiveQuality(now,frameMs,scrollActive){
    if(scrollActive){if(qualityState!=='motion'&&now-lastQualityChange>80)useMotionQuality();return;}
    if(now-lastScrollAt>220&&qualityState!=='ultra'&&now-lastQualityChange>150)useUltraQuality();
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
      {yaw:.40,elev:.205,focusY:.014,compY:.018},
      {yaw:.26,elev:.198,focusY:.022,compY:.014},
      {yaw:.38,elev:.176,focusY:.038,compY:.020},
      {yaw:.34,elev:.205,focusY:.026,compY:.014},
      {yaw:.28,elev:.174,focusY:.046,compY:.023},
      {yaw:.38,elev:.196,focusY:.036,compY:.016}
    ],
    phoneLandscape:[
      {yaw:.44,elev:.216,focusY:.014,compY:.009},
      {yaw:.30,elev:.208,focusY:.020,compY:.008},
      {yaw:.42,elev:.188,focusY:.034,compY:.012},
      {yaw:.34,elev:.216,focusY:.024,compY:.009},
      {yaw:.32,elev:.184,focusY:.042,compY:.014},
      {yaw:.42,elev:.208,focusY:.032,compY:.010}
    ],
    tablet:[
      {yaw:.48,elev:.226,focusY:.012,compY:.007},
      {yaw:.38,elev:.216,focusY:.018,compY:.006},
      {yaw:.46,elev:.198,focusY:.032,compY:.010},
      {yaw:.42,elev:.226,focusY:.022,compY:.007},
      {yaw:.36,elev:.192,focusY:.038,compY:.012},
      {yaw:.46,elev:.218,focusY:.030,compY:.008}
    ],
    desktop:[
      {yaw:.50,elev:.236,focusY:.010,compY:.005},
      {yaw:.36,elev:.226,focusY:.016,compY:.004},
      {yaw:.48,elev:.206,focusY:.030,compY:.008},
      {yaw:.44,elev:.238,focusY:.020,compY:.005},
      {yaw:.38,elev:.200,focusY:.036,compY:.010},
      {yaw:.48,elev:.226,focusY:.028,compY:.006}
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
    routePositions=Array.from({length:6},()=>new THREE.Vector3(0,0,0));
    overviewCenter.set(0,0,0);
    stationRotations=SERVICE_RELATIVE_YAW.slice();
  }


  function configureOverview(){
    if(profile.compact&&profile.portrait){
      overviewPositions=[
        new THREE.Vector3(-4.10,0,6.25),new THREE.Vector3(4.10,0,6.25),
        new THREE.Vector3(-4.10,0,0),new THREE.Vector3(4.10,0,0),
        new THREE.Vector3(-4.10,0,-6.25),new THREE.Vector3(4.10,0,-6.25)
      ];
    }else if(profile.tablet||profile.w<1250){
      overviewPositions=[
        new THREE.Vector3(-4.80,0,5.85),new THREE.Vector3(4.80,0,5.85),
        new THREE.Vector3(-4.80,0,0),new THREE.Vector3(4.80,0,0),
        new THREE.Vector3(-4.80,0,-5.85),new THREE.Vector3(4.80,0,-5.85)
      ];
    }else{
      overviewPositions=[
        new THREE.Vector3(-6.80,0,4.95),new THREE.Vector3(0,0,5.20),new THREE.Vector3(6.80,0,4.95),
        new THREE.Vector3(-6.80,0,-4.95),new THREE.Vector3(0,0,-5.20),new THREE.Vector3(6.80,0,-4.95)
      ];
    }
    updateOverviewLinks();
  }

  function createRenderer(){
    const options={canvas,antialias:!profile.low,alpha:false,premultipliedAlpha:false,powerPreference:profile.low?'default':'high-performance',precision:profile.low?'mediump':'highp',stencil:false,preserveDrawingBuffer:false,depth:true,logarithmicDepthBuffer:false};
    try{return new THREE.WebGLRenderer(options);}
    catch(_){
      try{return new THREE.WebGLRenderer(Object.assign({},options,{antialias:false,powerPreference:'default',precision:'mediump'}));}
      catch(__){return null;}
    }
  }

  function makeLiveScreen(i){
    const c=document.createElement('canvas');
    const high=profile.high&&!profile.low;
    c.width=profile.compact?(high?640:(profile.low?320:512)):(high?1024:832);
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
    const size=profile.high?(profile.compact?320:704):(profile.low?176:(profile.compact?256:448));
    const c=document.createElement('canvas');c.width=c.height=size;
    const x=c.getContext('2d');const image=x.createImageData(size,size);let seed=kind==='metal'?9127:(kind==='fabric'?4813:1729);
    const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let y=0;y<size;y++)for(let xx=0;xx<size;xx++){
      const i=(y*size+xx)*4;
      let v;
      if(kind==='metal'){
        const brushed=Math.sin((xx+y*.08)*.58)*4.1+Math.sin(xx*.074)*2.2;
        v=224+brushed+(rand()-.5)*4.2;
      }else if(kind==='fabric'){
        const weave=(Math.sin(xx*.44)+Math.sin(y*.47))*3.1+Math.sin((xx+y)*.18)*1.4;
        v=220+weave+(rand()-.5)*5.2;
      }else{
        const broad=Math.sin(xx*.052)*3+Math.cos(y*.046)*2.5;
        const grain=(rand()-.5)*7.5;
        v=229+broad+grain;
      }
      v=Math.max(190,Math.min(252,v));image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;
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
    if(materials.white){materials.white.color.setHex(0xf8f5ee);materials.white.roughness=.43;materials.white.metalness=.012;materials.white.envMapIntensity=.94;}
    if(materials.cream){materials.cream.color.setHex(0xeadcc4);materials.cream.roughness=.44;materials.cream.envMapIntensity=1.04;}
    if(materials.dark){materials.dark.color.setHex(0x14110e);materials.dark.roughness=.31;materials.dark.metalness=.44;materials.dark.envMapIntensity=1.30;}
    if(materials.teal){materials.teal.color.setHex(0x609e92);materials.teal.roughness=.31;materials.teal.emissiveIntensity=.045;materials.teal.envMapIntensity=1.32;materials.teal.clearcoat=.30;materials.teal.clearcoatRoughness=.14;}
    if(materials.red){materials.red.roughness=.38;materials.red.envMapIntensity=.96;}
    if(materials.glass){
      materials.glass.transmission=0;materials.glass.opacity=profile.compact?.32:.38;materials.glass.roughness=profile.compact?.070:.050;
      materials.glass.metalness=.018;materials.glass.depthWrite=false;materials.glass.envMapIntensity=1.72;materials.glass.clearcoat=.70;materials.glass.clearcoatRoughness=.025;
    }
    if(materials.gold){materials.gold.color.setHex(0xdab05e);materials.gold.roughness=.19;materials.gold.metalness=.84;materials.gold.clearcoat=profile.compact?.62:.74;materials.gold.clearcoatRoughness=.065;materials.gold.envMapIntensity=profile.compact?1.64:1.92;}
    if(materials.goldDark){materials.goldDark.color.setHex(0x805b2a);materials.goldDark.roughness=.29;materials.goldDark.metalness=.69;materials.goldDark.envMapIntensity=1.52;}
    if(materials.screen){materials.screen.emissiveIntensity=1.28;materials.screen.roughness=.10;materials.screen.metalness=.03;materials.screen.envMapIntensity=.88;}
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

  function makePlatform(i,radius,box){
    const group=new THREE.Group();
    const size=box.getSize(new THREE.Vector3());
    const width=Math.max(3.4,size.x*1.08),depth=Math.max(2.8,size.z*1.08);
    const baseMat=new THREE.MeshPhysicalMaterial({color:0x100f0d,roughness:.66,metalness:.10,clearcoat:.08,clearcoatRoughness:.48,envMapIntensity:.72});
    const base=new THREE.Mesh(new THREE.BoxGeometry(width,.075,depth),baseMat);
    base.position.y=.038;base.receiveShadow=Boolean(renderer.shadowMap.enabled);group.add(base);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(width*.96,.012,depth*.96),new THREE.MeshStandardMaterial({color:i%2?0x6d8e84:0x806633,roughness:.52,metalness:.42,envMapIntensity:.85}));
    trim.position.y=.083;group.add(trim);
    const shadowSize=profile.compact?192:320;
    const c=document.createElement('canvas');c.width=c.height=shadowSize;const x=c.getContext('2d');
    const g=x.createRadialGradient(shadowSize/2,shadowSize/2,shadowSize*.04,shadowSize/2,shadowSize/2,shadowSize*.49);
    g.addColorStop(0,'rgba(0,0,0,.52)');g.addColorStop(.52,'rgba(0,0,0,.20)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,shadowSize,shadowSize);
    const shadowTex=new THREE.CanvasTexture(c);shadowTex.minFilter=THREE.LinearFilter;shadowTex.magFilter=THREE.LinearFilter;shadowTex.generateMipmaps=false;
    const shadowPlane=new THREE.Mesh(new THREE.PlaneGeometry(width*.92,depth*.92),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:profile.compact?.34:.40,depthWrite:false,toneMapped:false}));
    shadowPlane.rotation.x=-Math.PI/2;shadowPlane.position.y=.09;shadowPlane.renderOrder=1;group.add(shadowPlane);
    return group;
  }


  function makeScanner(){
    const group=new THREE.Group();
    return {group,ring:{material:{opacity:0}},glow:{material:{opacity:0}}};
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
    stations=[];stationBoxes=[];cameraBoxes=[];previewBoxes=[];
    serviceTypes.forEach((type,i)=>{
      const wrapper=new THREE.Group();wrapper.name=`connected-station-${type}`;
      const materials=factory?factory.createMaterials(renderer,{skipScreenTexture:true}):null;tuneMaterials(materials);
      const screen=makeLiveScreen(i);
      if(materials&&materials.screen){
        const old=materials.screen.map;materials.screen.map=screen.texture;materials.screen.emissiveMap=screen.texture;materials.screen.emissiveIntensity=1.28;materials.screen.needsUpdate=true;if(old&&old!==screen.texture&&old.dispose)old.dispose();
      }
      const detail=new THREE.Group();detail.name='detail';
      if(factory&&factory.factories&&factory.factories[type])factory.factories[type](detail,materials);
      if(!profile.compact&&!profile.low)addUltraDetail(type,detail,materials);
      detail.scale.setScalar(profile.compact?1.035:1.025);detail.position.y=.11;
      detail.updateMatrixWorld(true);
      const rawBox=new THREE.Box3().setFromObject(detail);
      rawBox.min.sub(new THREE.Vector3(.04,.02,.04));rawBox.max.add(new THREE.Vector3(.04,.06,.04));
      const radius=platformRadius(rawBox);
      const platform=makePlatform(i,radius,rawBox);wrapper.add(platform);wrapper.add(detail);
      if(Q&&!profile.compact)Q.addContactShadow(wrapper,renderer,radius*.88,.34,.18);
      const preview=new THREE.Group();preview.visible=false;wrapper.add(preview);previewBoxes.push(rawBox.clone());
      const scanner=makeScanner(i,radius);wrapper.add(scanner.group);
      const accentColor=i%2?0x78d8c5:0xf0c66c;
      const accent=new THREE.PointLight(accentColor,profile.compact?.72:.92,14,2);accent.position.set(i%2?radius*.56:-radius*.56,4.1,radius*.48);wrapper.add(accent);
      const arch=new THREE.Group();arch.visible=false;wrapper.add(arch);
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
      const edgeLimit=profile.low?0:(profile.compact?4:12);let edgeCount=0;
      detail.traverse(o=>{
        if(edgeCount>=edgeLimit||!o.isMesh||!o.geometry||!o.geometry.type||o.geometry.type!=='BoxGeometry')return;
        const size=o.userData.connectedSize||0;if(size<(profile.compact?.92:.78))return;
        const lines=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,28),edgeMaterial);
        lines.material=edgeMaterial;lines.renderOrder=3;lines.frustumCulled=true;o.add(lines);edgeCount+=1;
      });
      stationBoxes.push(rawBox.clone());
      const cameraBox=rawBox.clone();const csz=cameraBox.getSize(new THREE.Vector3());cameraBox.expandByVector(new THREE.Vector3(-csz.x*.007,-csz.y*.004,-csz.z*.007));cameraBoxes.push(cameraBox);
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

  function buildLuxuryStudio(){
    const studio=new THREE.Group();studio.name='connected-luxury-studio';root.add(studio);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(profile.compact?72:88,profile.compact?72:88),new THREE.MeshBasicMaterial({color:0x080706,toneMapped:false}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.02;floor.receiveShadow=Boolean(renderer.shadowMap.enabled);studio.add(floor);
    const domeMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x17140f)},bottom:{value:new THREE.Color(0x050504)}},vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPos;uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp((normalize(vPos).y+1.0)*0.5,0.0,1.0);gl_FragColor=vec4(mix(bottom,top,smoothstep(0.12,0.90,h)),1.0);}'});
    const dome=new THREE.Mesh(new THREE.SphereGeometry(34,profile.low?28:(profile.compact?40:56),profile.low?16:(profile.compact?22:32)),domeMat);dome.position.y=3.0;studio.add(dome);
    const pool=new THREE.Mesh(new THREE.CircleGeometry(profile.compact?5.6:7.2,profile.low?64:128),new THREE.MeshBasicMaterial({color:0xd6b45d,transparent:true,opacity:.010,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    pool.rotation.x=-Math.PI/2;pool.position.y=.012;studio.add(pool);
    if(Q)Q.addContactShadow(studio,renderer,profile.compact?9.2:11.6,profile.compact?.26:.32,.014);
  }

  function buildHub(){
    hub=new THREE.Group();hub.visible=false;root.add(hub);
    hubCore=null;overviewLinkGroup=null;overviewLinks=[];hubRings=[];hubNodes=[];dataPackets=[];dust=null;
  }


  function buildJourney(){
    if(journeyGroup){root.remove(journeyGroup);}
    journeyGroup=new THREE.Group();journeyGroup.visible=false;journeyPackets=[];journeyRoute=null;root.add(journeyGroup);
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
    const local=stationBoxes[i],saved=stationBoxes[i];stationBoxes[i]=cameraBoxes[i]||local;
    const box=transformedBox(i,routePositions[i],1,false,stationRotations[i]||0);stationBoxes[i]=saved;return box;
  }

  function safeFrame(){
    const rtl=document.documentElement.dir==='rtl';
    if(profile.compact&&profile.portrait)return {left:-.985,right:.985,bottom:-.30,top:.91};
    if(profile.compact&&profile.landscape)return rtl?{left:-.985,right:-.005,bottom:-.74,top:.90}:{left:.005,right:.985,bottom:-.74,top:.90};
    if(profile.compact)return {left:-.985,right:.985,bottom:-.35,top:.90};
    if(profile.tablet)return rtl?{left:-.985,right:.15,bottom:-.78,top:.91}:{left:-.15,right:.985,bottom:-.78,top:.91};
    return rtl?{left:-.985,right:.28,bottom:-.80,top:.92}:{left:-.28,right:.985,bottom:-.80,top:.92};
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

  function stageYaw(i){const base=(stationRotations[i]||stagePreset(i).yaw);const lead=profile.compact?(profile.portrait?.08:.10):(profile.tablet?.10:.12);return base-lead;}

  function stageElevation(i){ return stagePreset(i).elev; }

  function stageComposition(i){ const p=stagePreset(i);return {x:0,y:p.compY+(profile.compact?(profile.portrait?-.070:-.038):.022)}; }

  function holdPose(i,u){
    const box=stageWorldBox(i);
    const size=box.getSize(new THREE.Vector3());
    const preset=stagePreset(i);
    const focus=box.getCenter(new THREE.Vector3());
    focus.y+=size.y*preset.focusY;
    const live=smoother(u),direction=i%2?-1:1;
    const orbit=profile.compact?.008:.015;
    const yaw=stageYaw(i)+lerp(-orbit,orbit,live)*direction;
    const elev=stageElevation(i)+Math.sin(Math.PI*u)*(profile.compact?.004:.006);
    const pose=framedPose(box,yaw,elev,profile.fov,profile.compact?.0035:.009,stageComposition(i),focus);
    const dolly=1-Math.sin(Math.PI*u)*(profile.compact?.006:.009);
    pose.pos.sub(pose.target).multiplyScalar(dolly).add(pose.target);
    return pose;
  }

  function transitionLayout(i,q){
    const t=smoother(q),side=i%2?-1:1;
    const outgoing=smoother(clamp(q/.48));
    const incoming=smoother(clamp((q-.52)/.48));
    const shift=i===3?(profile.compact?.12:.20):(profile.compact?.24:.44);
    const depth=profile.compact?.08:.14;
    return {
      t,pulse:Math.sin(Math.PI*t),
      aPos:new THREE.Vector3(-side*shift*outgoing,0,-depth*outgoing),
      bPos:new THREE.Vector3(side*shift*(1-incoming),0,depth*(1-incoming)),
      aScale:lerp(1,.94,outgoing),bScale:lerp(.94,1,incoming),
      showA:q<=.50,showB:q>.50
    };
  }


  function bridgePose(i,q){
    const layout=transitionLayout(i,q),t=layout.t;
    const from=holdPose(i,1),to=holdPose(i+1,0);
    const travel=smoother(t);
    const pos=from.pos.clone().lerp(to.pos,travel);
    const target=from.target.clone().lerp(to.target,smoother(clamp((t-.12)/.76)));
    const side=i%2?-1:1;
    pos.y+=Math.sin(Math.PI*t)*(profile.compact?.12:.18);
    pos.x+=Math.sin(Math.PI*t)*side*(profile.compact?.07:.12);
    pos.z+=Math.sin(Math.PI*t)*(profile.compact?.10:.15);
    return {pos,target,fov:lerp(from.fov,to.fov,travel)};
  }



  function finalOverviewScale(){
    if(profile.compact&&profile.portrait)return .38;
    if(profile.compact)return .41;
    if(profile.tablet||profile.w<1250)return .43;
    return .46;
  }

  function finalOverviewPose(){
    const scale=finalOverviewScale();
    const union=new THREE.Box3();
    const portrait=(profile.compact&&profile.portrait);
    const twoColumn=portrait||profile.tablet||profile.w<1250;
    stations.forEach((_,i)=>union.union(transformedBox(i,overviewCenter.clone().add(overviewPositions[i]),scale,false,SERVICE_RELATIVE_YAW[i]*.90)));
    const yaw=portrait?0.0:(twoColumn?.020:.11);
    const elev=portrait?.82:(twoColumn?.68:(profile.compact?.56:.50));
    const fov=portrait?(profile.fov+2.2):(twoColumn?(profile.fov+1.4):(profile.fov+.5));
    return framedPose(union,yaw,elev,fov,portrait?.018:(twoColumn?.022:.019),{x:0,y:portrait?.016:.010});
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
    const holdCount=profile.low?13:(profile.compact?29:39);
    const bridgeCount=profile.low?25:(profile.compact?53:73);
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
    const simplify=overview&&(profile.low||profile.compact);
    const threshold=profile.compact?1.45:.90;
    station.meshes.forEach(mesh=>{
      mesh.visible=!simplify||(mesh.userData.connectedSize||1)>=threshold;
      mesh.castShadow=!overview&&Boolean(mesh.userData.connectedCastShadow);
    });
    station.localLights.forEach(light=>{light.visible=!overview&&!profile.compact;});
    station.platform.children.forEach((child,idx)=>{child.visible=!overview||idx<=5;});
    station.arch.visible=false;
    station.accent.visible=!overview;
  }


  function finalPlacement(i,q){
    const finalScale=finalOverviewScale();
    const reveal=smoother(clamp((q-.22-i*.012)/Math.max(.001,.90-(.22+i*.012))));
    const finalPos=overviewCenter.clone().add(overviewPositions[i]);
    const start=overviewCenter.clone().add(overviewPositions[i].clone().multiplyScalar(profile.compact?.48:.52));start.y+=.10;
    return {pos:start.lerp(finalPos,reveal),scale:lerp(.22,finalScale,reveal),reveal};
  }

  function transitionVeil(state){return 0;}


  function applyState(state){
    stations.forEach(s=>{s.wrapper.visible=false;s.detail.visible=false;s.preview.visible=false;s.accent.intensity=0;s.scanner.group.visible=false;});
    if(journeyGroup)journeyGroup.visible=state.mode!=='overview'||state.q<.42;
    if(state.mode==='hold'){
      const s=stations[state.stage];setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;
      s.wrapper.position.copy(routePositions[state.stage]);s.wrapper.scale.setScalar(1);s.wrapper.rotation.y=stationRotations[state.stage]||0;
      s.accent.intensity=profile.compact?.44:.58;s.scanner.group.visible=false;
    }else if(state.mode==='transition'){
      const a=stations[state.stage],b=stations[state.next];
      setStationLOD(a,'full');setStationLOD(b,'full');
      const layout=transitionLayout(state.stage,state.q),t=layout.t;
      a.wrapper.visible=layout.showA;b.wrapper.visible=layout.showB;
      a.detail.visible=a.wrapper.visible;b.detail.visible=b.wrapper.visible;
      a.wrapper.position.copy(layout.aPos);b.wrapper.position.copy(layout.bPos);
      a.wrapper.rotation.y=stationRotations[state.stage]||0;
      b.wrapper.rotation.y=stationRotations[state.next]||0;
      a.wrapper.scale.setScalar(layout.aScale);b.wrapper.scale.setScalar(layout.bScale);
      a.accent.intensity=lerp(profile.compact?.46:.60,.06,t);b.accent.intensity=lerp(.06,profile.compact?.46:.60,t);
      a.scanner.group.visible=false;b.scanner.group.visible=false;
    }else{
      if(state.q<.56){
        const s=stations[5];setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;
        s.wrapper.position.copy(routePositions[5]);s.wrapper.rotation.y=stationRotations[5]||0;
        const t=smoother(clamp(state.q/.56));s.wrapper.scale.setScalar(lerp(1,.78,t));s.wrapper.position.y=lerp(0,.08,t);s.accent.intensity=lerp(profile.compact?.42:.55,.08,t);
      }
      if(state.q>.20){
        stations.forEach((s,i)=>{
          if(i===5&&state.q<.50)return;
          const p=finalPlacement(i,state.q);
          if(p.reveal<=.006)return;
          setStationLOD(s,'overview');s.wrapper.visible=true;s.detail.visible=true;s.preview.visible=false;s.wrapper.position.copy(p.pos);s.wrapper.scale.setScalar(p.scale);
          const overviewYaw=SERVICE_RELATIVE_YAW[i]*.90;
          s.wrapper.rotation.y=lerp(stationRotations[i]||0,overviewYaw,p.reveal);
        });
      }
    }
    if(hub)hub.visible=false;
    stations.forEach(s=>{if(s.wrapper.visible)s.wrapper.updateMatrixWorld(true);});
    const veil=transitionVeil(state);
    if(Math.abs(veil-lastVeil)>.001){lastVeil=veil;sticky.style.setProperty('--connected-transition',veil.toFixed(4));}
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


  function copyStageFor(state){return state.mode==='transition'&&state.q>.50?state.next:state.stage;}

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
    const focus=tmpA.set(0,1.48,0);
    if(state.mode==='overview')focus.y=1.30;
    const cut=state.mode==='transition'?Math.pow(Math.sin(Math.PI*clamp(state.q)),6):0;
    const energy=1-cut*.60;
    if(keyLight){keyLight.position.set(profile.compact?5.4:6.8,profile.compact?7.8:9.2,profile.compact?5.8:7.2);keyLight.target.position.copy(focus);keyLight.target.updateMatrixWorld();keyLight.intensity=(profile.compact?1.78:2.06)*energy;}
    if(rimLight){rimLight.position.set(-4.9,4.7,-5.2);rimLight.intensity=(profile.compact?.82:1.08)*energy;}
    if(fillLight){fillLight.position.set(4.2,3.3,4.7);fillLight.intensity=(profile.compact?.48:.66)*energy;}
    if(topLight){topLight.position.set(0,7.4,0);topLight.intensity=(profile.compact?.34:.46)*energy;}
  }



  function animateScene(now,state,dt){
    const t=now*.001,active=copyStageFor(state),overview=state.mode==='overview'&&state.q>.48;
    dataPackets.forEach((p,i)=>{const u=(t*p.userData.speed+p.userData.offset)%1;p.userData.curve.getPointAt(u,p.position);p.position.y+=Math.sin(t*2.2+i)*.010;p.material.opacity=.58+.18*Math.sin(Math.PI*u);});
    journeyPackets.forEach((p,i)=>{const u=(t*p.userData.speed+p.userData.offset)%1;p.userData.curve.getPointAt(u,p.position);p.position.y+=Math.sin(t*2+i)*.008;p.material.opacity=.52+.20*Math.sin(Math.PI*u);});
    hubRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.020:-.016);ring.material.opacity=(i===2?.10:.045)+Math.sin(t*.55+i)*.006;});
    hubNodes.forEach((node,i)=>{const selected=overview||i===active;node.scale.setScalar(selected?1.12:1);node.children[0].material.opacity=selected?.88:.52;node.children[1].rotation.z+=dt*(i%2?.22:-.18);node.children[1].material.opacity=selected?.42:.14;});
    if(hubCore&&hubCore.visible){hubCore.rotation.y+=dt*.10;hubCore.children[1].rotation.z+=dt*.34;hubCore.children[2].rotation.z-=dt*.22;hubCore.children[3].scale.setScalar(1+Math.sin(t*2.2)*.08);hubCore.children[4].material.opacity=.18+.08*Math.sin(t*1.7);}
    if(overviewLinkGroup&&overviewLinkGroup.visible)overviewLinks.forEach((line,i)=>{line.material.opacity=.17+.045*(.5+.5*Math.sin(t*.85+i*.72));});
    if(dust){dust.rotation.y=Math.sin(t*.07)*.012;dust.position.y=Math.sin(t*.14)*.035;}
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const isActive=i===active;
      if(s.detail.visible&&state.mode==='hold'&&isActive&&now-lastScrollAt>90&&(!profile.low||Math.floor(now/80)!==Math.floor((now-dt*1000)/80)))factory&&factory.animate&&factory.animate(s.detail,t+i*.17);
      // Decorative orbit effects removed for a calmer luxury presentation.
      if(s.scanner.group.visible){const phase=(t*.22+i*.17)%1;const y=.42+phase*3.45;s.scanner.group.position.y=y;s.scanner.ring.material.opacity=(1-Math.abs(phase-.5)*2)*.16;s.scanner.glow.material.opacity=(1-Math.abs(phase-.5)*2)*.038;}
      // Platform remains visually stable; no technical pulsing effects.
      if(isActive&&state.mode==='hold'&&now-s.screen.lastDrawAt>650){s.screen.lastDrawAt=now;drawScreen(s.screen,now,true,false);}
    });
    if(now-screenUpdateAt>1500){screenUpdateAt=now;stations.forEach((s,i)=>{if(s.wrapper.visible&&i!==active)drawScreen(s.screen,now,false,overview);});}
  }

  function measureTrack(){
    const rect=track.getBoundingClientRect();
    trackStart=rect.top+(window.scrollY||window.pageYOffset||0);
    trackSpan=Math.max(1,track.offsetHeight-sticky.clientHeight);
  }

  function readProgress(now=performance.now()){
    const y=window.scrollY||window.pageYOffset||0;
    const dy=y-lastScrollY;
    if(Math.abs(dy)>.01){
      const elapsed=Math.max(8,now-lastScrollAt||16);
      scrollVelocity=dy/elapsed;lastScrollAt=now;lastScrollY=y;
    }else scrollVelocity*=.86;
    targetProgress=clamp((y-trackStart)/trackSpan);
    document.body.classList.toggle('connected-scene-active',y>=trackStart-sticky.clientHeight*.08&&y<=trackStart+trackSpan+sticky.clientHeight*.08);
  }

  function scheduleProgress(){
    readProgress();
    const rect=track.getBoundingClientRect();
    const inScene=rect.bottom>0&&rect.top<(window.visualViewport?.height||innerHeight);
    if(inScene)visible=true;
    if(qualityState!=='motion')useMotionQuality();
    if(inScene)startLoop();
  }

  function resize(){
    resizeQueued=false;if(!renderer||!camera)return;stableFrames=0;
    profile=getProfile();configureRoute();configureOverview();buildJourney();measureTrack();
    {const q=qualityTargets(profile);maxRenderRatio=Math.min(q.ultra,capabilityRatioLimit());motionRenderRatio=Math.min(q.motion,maxRenderRatio);minRenderRatio=q.minimum;}applyRenderRatio(qualityState==='ultra'?maxRenderRatio:motionRenderRatio,true);
    camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    buildCameraCache();updateLighting(0,{mode:'hold',stage:0,next:0,q:0});readProgress();progress=targetProgress;progressVelocity=0;
    const state=timeline(progress);applyState(state);updateLighting(copyStageFor(state),state);
    const stateKey=state.mode+':'+state.stage+':'+state.next;
    if(renderer.shadowMap.enabled&&stateKey!==lastStateKey){lastStateKey=stateKey;renderer.shadowMap.needsUpdate=true;}
    const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    stations.forEach(s=>{s.lod=null;});
  }

  function scheduleResize(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);}

  function render(now){
    rafId=0;if(!renderer||!scene||!camera||!visible||!pageVisible)return;
    readProgress(now);
    const dt=lastTime?Math.min(.05,(now-lastTime)/1000):1/60;lastTime=now;
    const scrollActive=now-lastScrollAt<175||Math.abs(targetProgress-progress)>.00008;
    const frameMs=lastRenderedAt?Math.min(80,now-lastRenderedAt):16.67;lastRenderedAt=now;
    updateAdaptiveQuality(now,frameMs,scrollActive);
    // V45 uses a very light progress chase so the connected walkthrough
    // feels smoother and more cinematic like the booth-manufacturing scene,
    // while still remaining tightly synced to the actual page scroll.
    progress=damp(progress,targetProgress,scrollActive?(profile.compact?22:24):(profile.compact?14:16),dt);
    if(Math.abs(targetProgress-progress)<.00035)progress=targetProgress;
    const state=timeline(progress);applyState(state);updateLighting(copyStageFor(state),state);
    const stateKey=state.mode+':'+state.stage+':'+state.next;
    if(renderer.shadowMap.enabled&&stateKey!==lastStateKey){lastStateKey=stateKey;renderer.shadowMap.needsUpdate=true;lastShadowAt=now;}
    const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);if(Math.abs(camera.fov-pose.fov)>.001){camera.fov=pose.fov;camera.updateProjectionMatrix();}}
    const transit=state.mode!=='hold';if(copyBox&&transit!==lastTransit){lastTransit=transit;copyBox.classList.toggle('in-transit',transit);}updateCopy(state);animateScene(now,state,dt);
    if(now-styleUpdateAt>32){styleUpdateAt=now;sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');if(indicator)indicator.style.opacity=progress>.94?'0':'1';}
    renderer.render(scene,camera);
    stableFrames+=1;
    if(stableFrames>=2&&!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
    rafId=requestAnimationFrame(render);
  }


  function startLoop(){if(!rafId&&initialized&&visible&&pageVisible){lastTime=0;lastRenderedAt=0;progressVelocity=0;rafId=requestAnimationFrame(render);}}
  function stopLoop(){if(rafId){cancelAnimationFrame(rafId);rafId=0;}}

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
    stations=[];stationBoxes=[];cameraBoxes=[];previewBoxes=[];holdCache=[];bridgeCache=[];overviewCache=[];
    hub=hubCore=overviewLinkGroup=null;overviewLinks=[];hubRings=[];hubNodes=[];dataPackets=[];dust=null;
    journeyGroup=journeyRoute=null;journeyPackets=[];keyLight=rimLight=fillLight=topLight=null;
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
        clearTimeout(disposeTimer);measureTrack();readProgress();
        if(!initialized&&!initQueued)queueInit();else{scheduleResize();startLoop();}
      }else{
        stopLoop();
        clearTimeout(disposeTimer);
        disposeTimer=setTimeout(()=>{
          if(visible||!initialized)return;
          const rect=track.getBoundingClientRect(),vh=window.visualViewport?.height||innerHeight;
          if(rect.bottom < -vh*1.2 || rect.top > vh*2.0)disposeConnected(true);
        },900);
      }
    },{rootMargin:'220px 0px',threshold:0});io.observe(sticky);
    addEventListener('scroll',scheduleProgress,{passive:true});
    addEventListener('resize',scheduleResize,{passive:true});
    addEventListener('orientationchange',()=>setTimeout(scheduleResize,180),{passive:true});
    if('ResizeObserver'in window){const ro=new ResizeObserver(scheduleResize);ro.observe(sticky);ro.observe(track);}
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;lastTime=0;if(pageVisible&&visible)startLoop();else stopLoop();});
    document.addEventListener('bymeli:service-scene-claim',()=>{
      if(initialized&&!visible)disposeConnected(true);
    });
    document.addEventListener('languagechange',()=>{activeCopyStage=-1;overviewCopy=false;updateCopy(timeline(progress));});
  }

  function lockServiceContexts(){
    if(contextLock)return;
    contextLock=true;
    window.__BYMELI_CONNECTED_STARTING__=true;
    document.dispatchEvent(new CustomEvent('bymeli:connected-scene-state',{detail:{active:true,phase:'starting'}}));
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
    if(!initStartedAt)initStartedAt=performance.now();
    const availableFactory=getFactory();
    if(!availableFactory){
      initialized=false;initQueued=false;factoryWaits+=1;
      if(factoryWaits<30)setTimeout(queueInit,80);
      else{unlockServiceContexts('factory-unavailable');if(fallback)fallback.style.opacity='.42';}
      return;
    }
    factoryWaits=0;initialized=true;initQueued=false;initAttempts+=1;stableFrames=0;profile=getProfile();configureRoute();configureOverview();
    renderer=createRenderer();
    if(!renderer){initialized=false;if(fallback)fallback.style.opacity='.45';resetCanvas();if(initAttempts<5)setTimeout(queueInit,Math.min(1200,260*initAttempts));else unlockServiceContexts('renderer-unavailable');return;}
    {const q=qualityTargets(profile);maxRenderRatio=q.ultra;motionRenderRatio=q.motion;minRenderRatio=q.minimum;renderRatio=motionRenderRatio;qualityState='motion';}
    if(Q)Q.configureRenderer(renderer,{exposure:1.21,pixelCap:renderRatio});
    else{renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.20;}
    renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);renderer.setClearColor(0x060504,1);renderer.sortObjects=true;renderer.physicallyCorrectLights=false;
    renderer.toneMappingExposure=1.20;
    const connectedShadows=profile.high&&(!profile.compact||!profile.portrait);
    renderer.shadowMap.enabled=connectedShadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x060504);scene.fog=new THREE.FogExp2(0x060504,profile.compact?.0044:.0036);if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);
    surfaceTextures=makeSurfaceTextures();
    edgeMaterial=new THREE.LineBasicMaterial({color:0xf5e8c9,transparent:true,opacity:profile.compact?.028:.042,depthWrite:false,toneMapped:false});
    scene.add(new THREE.HemisphereLight(0xffefd3,0x080706,profile.compact?1.08:1.18));
    keyLight=new THREE.DirectionalLight(0xffe1a9,profile.compact?1.94:2.18);keyLight.position.set(7,10,7);keyLight.castShadow=renderer.shadowMap.enabled;scene.add(keyLight);scene.add(keyLight.target);
    if(keyLight.castShadow){const size=Math.min(renderer.capabilities.maxTextureSize||4096,profile.high?4096:2048);keyLight.shadow.mapSize.set(size,size);keyLight.shadow.camera.left=-10;keyLight.shadow.camera.right=10;keyLight.shadow.camera.top=10;keyLight.shadow.camera.bottom=-10;keyLight.shadow.bias=-.00024;keyLight.shadow.normalBias=.024;keyLight.shadow.radius=2.2;}
    rimLight=new THREE.PointLight(0x72d2bf,profile.compact?.88:1.14,25,1.9);scene.add(rimLight);
    fillLight=new THREE.PointLight(0xe3b35c,profile.compact?.72:.94,24,2);scene.add(fillLight);
    topLight=new THREE.PointLight(0xffe6bb,profile.compact?.38:.52,18,2);scene.add(topLight);
    updateLighting(0,{mode:'hold',stage:0,next:0,q:0});

    buildLuxuryStudio();buildHub();buildStations();buildJourney();measureTrack();
    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.08,170);scene.add(camera);
    buildCameraCache();
    const state=timeline(0);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    bindCanvasLoss();bindGlobal();readProgress();progress=targetProgress;initAttempts=0;initReadyAt=performance.now();markConnectedReady();if(visible)startLoop();
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
      try{init();}
      catch(error){
        console.error('[By Meli] Connected V45 failed:',error);
        initialized=false;initQueued=false;
        if(fallback)fallback.style.opacity='.42';
        if(initAttempts<5)setTimeout(queueInit,Math.min(1400,320*(initAttempts+1)));
        else unlockServiceContexts('failed');
      }
    },40);
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
    const result=auditAt(progress);
    // auditAt updates matrices for measurement; render once more so screenshots
    // and deterministic audit frames represent the measured state exactly.
    const finalState=timeline(progress);applyState(finalState);updateLighting(copyStageFor(finalState),finalState);const finalPose=evaluateCamera(finalState);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=finalPose.fov;camera.updateProjectionMatrix();
    animateScene(performance.now(),finalState,1/60);renderer.render(scene,camera);
    requestAnimationFrame(()=>{if(renderer&&scene&&camera)renderer.render(scene,camera);});
    return result;
  }

  window.ByMeliConnectedV45={forceInit:queueInit,dispose:()=>disposeConnected(true),auditAt,renderAt,getState:()=>({initialized,progress,target:targetProgress,state:timeline(progress),startupMs:initReadyAt&&initStartedAt?initReadyAt-initStartedAt:null,visible,rafActive:Boolean(rafId),pageVisible,profile:profile?{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio,ultraRatio:maxRenderRatio,motionRatio:motionRenderRatio,qualityState}:null})};
  window.ByMeliConnectedV44=window.ByMeliConnectedV45;
  window.ByMeliConnectedV43=window.ByMeliConnectedV45;
  window.ByMeliConnectedV42=window.ByMeliConnectedV45;
  window.ByMeliConnectedV41=window.ByMeliConnectedV45;
  window.ByMeliConnectedV40=window.ByMeliConnectedV45;
  window.ByMeliConnectedV39=window.ByMeliConnectedV45;
  window.ByMeliConnectedV38=window.ByMeliConnectedV45;
  window.ByMeliConnectedV37=window.ByMeliConnectedV45;
  window.ByMeliConnectedV36=window.ByMeliConnectedV45;
  window.ByMeliConnectedV35=window.ByMeliConnectedV45;
  window.ByMeliConnectedV34=window.ByMeliConnectedV45;
  window.ByMeliConnectedV33=window.ByMeliConnectedV45;
  window.ByMeliConnectedV32=window.ByMeliConnectedV45;
  window.ByMeliConnectedV31=window.ByMeliConnectedV45;
  window.ByMeliConnectedV30=window.ByMeliConnectedV45;
  window.ByMeliConnectedV29=window.ByMeliConnectedV45;
  window.ByMeliConnectedV28=window.ByMeliConnectedV45;
  window.ByMeliConnectedV27=window.ByMeliConnectedV45;
  window.ByMeliConnectedV26=window.ByMeliConnectedV45;
  window.ByMeliConnectedV25=window.ByMeliConnectedV45;
  window.ByMeliConnectedV24=window.ByMeliConnectedV45;
  window.ByMeliConnectedV20=window.ByMeliConnectedV45;
  const bootstrap=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){bootstrap.disconnect();queueInit();}},{rootMargin:'1400px 0px',threshold:0});bootstrap.observe(track);
  setTimeout(()=>{if(!initialized&&!initQueued){const r=track.getBoundingClientRect();if(r.top<innerHeight*4&&r.bottom>-innerHeight*1.5)queueInit();}},350);
})();
