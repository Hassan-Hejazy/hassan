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
  const factory=window.ByMeliServiceFactory||null;
  const Q=window.BYMELI_QUALITY||null;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const coarse=matchMedia('(pointer:coarse)').matches;

  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t);
  const smoother=t=>t*t*t*(t*(t*6-15)+10);
  const damp=(current,target,lambda,dt)=>lerp(current,target,1-Math.exp(-lambda*dt));
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
  const HOLD=.118;
  const TRANSITION=.038;
  const OVERVIEW=.102;
  const OVERVIEW_START=HOLD*6+TRANSITION*5;

  let renderer=null,scene=null,camera=null,root=null;
  let profile=null,stations=[],stationBoxes=[],previewBoxes=[],overviewPositions=[];
  let holdCache=[],bridgeCache=[],overviewCache=[];
  let hub=null,hubCore=null,overviewLinkGroup=null,overviewLinks=[],hubRings=[],hubNodes=[],dataPackets=[],dust=null;
  let keyLight=null,rimLight=null,fillLight=null,topLight=null,surfaceTexture=null,edgeMaterial=null;
  let initialized=false,initQueued=false,initAttempts=0,bound=false;
  let visible=false,pageVisible=!document.hidden,rafId=0,lastTime=0;
  let targetProgress=0,progress=0,progressQueued=false,resizeQueued=false;
  let activeCopyStage=-1,overviewCopy=false,copyToken=0;
  let screenUpdateAt=0,styleUpdateAt=0,renderRatio=1,lastStateKey='';
  let trackStart=0,trackSpan=1,lastRenderedAt=0;

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
    let fov=32.5;
    if(compact)fov=landscape?34:(portrait?33.5:33.8);
    else if(tablet)fov=portrait?33.5:32.8;
    return {w,h,aspect,compact,tablet,portrait,landscape,short,memory,cores,low,high,tier,fov};
  }

  function qualityRatio(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    let cap,budget;
    if(p.compact){
      cap=p.high?2.60:(p.low?1.50:2.10);
      budget=p.high?3300000:(p.low?1300000:2400000);
    }else if(p.tablet){
      cap=p.high?2.45:(p.low?1.55:2.05);
      budget=p.high?4800000:(p.low?2100000:3500000);
    }else{
      cap=p.high?2.25:(p.low?1.55:1.95);
      budget=p.high?5900000:(p.low?2900000:4500000);
    }
    return Math.max(1,Math.min(dpr,cap,Math.sqrt(budget/Math.max(1,p.w*p.h))));
  }

  function configureOverview(){
    if(profile.compact&&profile.portrait){
      overviewPositions=[
        new THREE.Vector3(-2.30,0,3.05),new THREE.Vector3(2.30,0,3.05),
        new THREE.Vector3(-2.30,0,0),new THREE.Vector3(2.30,0,0),
        new THREE.Vector3(-2.30,0,-3.05),new THREE.Vector3(2.30,0,-3.05)
      ];
    }else if(profile.tablet||profile.w<1250){
      overviewPositions=[
        new THREE.Vector3(-2.55,0,3.62),new THREE.Vector3(2.55,0,3.62),
        new THREE.Vector3(-2.55,0,0),new THREE.Vector3(2.55,0,0),
        new THREE.Vector3(-2.55,0,-3.62),new THREE.Vector3(2.55,0,-3.62)
      ];
    }else{
      overviewPositions=[
        new THREE.Vector3(-3.62,0,2.42),new THREE.Vector3(0,0,2.42),new THREE.Vector3(3.62,0,2.42),
        new THREE.Vector3(-3.62,0,-2.42),new THREE.Vector3(0,0,-2.42),new THREE.Vector3(3.62,0,-2.42)
      ];
    }
    updateOverviewLinks();
  }

  function createRenderer(){
    const options={canvas,antialias:!profile.low,alpha:false,powerPreference:profile.low?'default':'high-performance',precision:profile.low?'mediump':'highp',stencil:false,preserveDrawingBuffer:false,depth:true};
    try{return new THREE.WebGLRenderer(options);}
    catch(_){
      try{return new THREE.WebGLRenderer(Object.assign({},options,{antialias:false,powerPreference:'default',precision:'mediump'}));}
      catch(__){return null;}
    }
  }

  function makeLiveScreen(i){
    const c=document.createElement('canvas');
    const high=profile.high&&!profile.low;
    c.width=profile.compact?(high?768:(profile.low?512:640)):(high?1024:768);
    c.height=Math.round(c.width*9/16);
    const ctx=c.getContext('2d',{alpha:false});
    const tex=new THREE.CanvasTexture(c);
    tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
    tex.minFilter=THREE.LinearFilter;
    tex.magFilter=THREE.LinearFilter;
    tex.generateMipmaps=false;
    tex.encoding=THREE.sRGBEncoding;
    if(renderer&&renderer.capabilities&&renderer.capabilities.getMaxAnisotropy)tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate=true;
    return {canvas:c,ctx,texture:tex,last:-1,index:i};
  }

  function drawScreen(screen,time,active,overview){
    const interval=active?110:(overview?420:280);
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

  function makeSurfaceTexture(){
    const size=128,c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
    const image=x.createImageData(size,size);let seed=1729;
    const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<image.data.length;i+=4){const fine=(rand()-.5)*22;const band=Math.sin((i/4%size)*.42)*5;const v=Math.max(92,Math.min(164,128+fine+band));image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}
    x.putImageData(image,0,0);
    const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(3.5,3.5);tex.minFilter=THREE.LinearMipMapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=true;
    if(renderer&&renderer.capabilities&&renderer.capabilities.getMaxAnisotropy)tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  function tuneMaterials(materials){
    if(!materials)return;
    if(surfaceTexture){
      ['white','cream','dark','gold','goldDark','teal','red'].forEach(key=>{const m=materials[key];if(m&&'bumpMap'in m){m.bumpMap=surfaceTexture;m.bumpScale=(key==='dark'?.018:(key.includes('gold')?.009:.012));m.needsUpdate=true;}});
    }
    Object.keys(materials).forEach(key=>{
      const m=materials[key];if(!m)return;
      if('envMapIntensity'in m)m.envMapIntensity=Math.min(profile.compact?1.18:1.38,Math.max(.6,m.envMapIntensity||1));
    });
    if(materials.white){materials.white.color.setHex(0xf3ede2);materials.white.roughness=.46;materials.white.envMapIntensity=.72;materials.white.needsUpdate=true;}
    if(materials.cream){materials.cream.color.setHex(0xdfd0b7);materials.cream.roughness=.44;materials.cream.envMapIntensity=.82;materials.cream.needsUpdate=true;}
    if(materials.dark){materials.dark.color.setHex(0x15110d);materials.dark.roughness=.34;materials.dark.metalness=.38;materials.dark.envMapIntensity=1.02;materials.dark.needsUpdate=true;}
    if(materials.teal){materials.teal.color.setHex(0x568f84);materials.teal.emissiveIntensity=.10;materials.teal.needsUpdate=true;}
    if(materials.glass){
      if(profile.compact){materials.glass.transmission=profile.low?0:.14;materials.glass.opacity=.32;materials.glass.roughness=.11;}
      else{materials.glass.transmission=.34;materials.glass.opacity=.40;materials.glass.roughness=.075;}
      materials.glass.depthWrite=false;materials.glass.needsUpdate=true;
    }
    if(materials.gold){materials.gold.color.setHex(0xc69a4f);materials.gold.clearcoat=profile.compact?.34:.46;materials.gold.clearcoatRoughness=.16;materials.gold.needsUpdate=true;}
    if(materials.screen){materials.screen.emissiveIntensity=1.24;materials.screen.needsUpdate=true;}
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
    factory&&factory.setShadowEnabled&&factory.setShadowEnabled(Boolean(renderer.shadowMap.enabled));
    stations=[];stationBoxes=[];previewBoxes=[];
    serviceTypes.forEach((type,i)=>{
      const wrapper=new THREE.Group();wrapper.name=`connected-station-${type}`;
      const materials=factory?factory.createMaterials(renderer,{skipScreenTexture:true}):null;tuneMaterials(materials);
      const screen=makeLiveScreen(i);
      if(materials&&materials.screen){
        const old=materials.screen.map;materials.screen.map=screen.texture;materials.screen.emissiveMap=screen.texture;materials.screen.emissiveIntensity=1.28;materials.screen.needsUpdate=true;if(old&&old!==screen.texture&&old.dispose)old.dispose();
      }
      const detail=new THREE.Group();detail.name='detail';
      if(factory&&factory.factories&&factory.factories[type])factory.factories[type](detail,materials);
      detail.scale.setScalar(profile.compact?.90:.94);detail.position.y=.28;
      detail.updateMatrixWorld(true);
      const rawBox=new THREE.Box3().setFromObject(detail);
      rawBox.min.sub(new THREE.Vector3(.20,.05,.20));rawBox.max.add(new THREE.Vector3(.20,.18,.20));
      const radius=platformRadius(rawBox);
      const platform=makePlatform(i,radius);wrapper.add(platform);wrapper.add(detail);
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
      const edgeLimit=profile.compact?(profile.low?8:14):24;let edgeCount=0;
      detail.traverse(o=>{
        if(edgeCount>=edgeLimit||!o.isMesh||!o.geometry||!o.geometry.type||o.geometry.type!=='BoxGeometry')return;
        const size=o.userData.connectedSize||0;if(size<.72)return;
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

  function buildHub(){
    hub=new THREE.Group();root.add(hub);
    hubRings=[];hubNodes=[];dataPackets=[];
    hubCore=new THREE.Group();hubCore.visible=false;hub.add(hubCore);
    const coreBase=new THREE.Mesh(new THREE.CylinderGeometry(.72,.88,.18,48),new THREE.MeshStandardMaterial({color:0x17130e,roughness:.42,metalness:.48,envMapIntensity:1.0}));coreBase.position.y=.16;hubCore.add(coreBase);
    const coreRingA=new THREE.Mesh(new THREE.TorusGeometry(.58,.026,8,72),new THREE.MeshBasicMaterial({color:0xe8bd65,transparent:true,opacity:.88,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));coreRingA.rotation.x=Math.PI/2;coreRingA.position.y=.29;hubCore.add(coreRingA);
    const coreRingB=new THREE.Mesh(new THREE.TorusGeometry(.88,.012,6,72),new THREE.MeshBasicMaterial({color:0x6fd0bd,transparent:true,opacity:.42,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));coreRingB.rotation.x=Math.PI/2;coreRingB.position.y=.32;hubCore.add(coreRingB);
    const coreOrb=new THREE.Mesh(new THREE.SphereGeometry(.16,24,18),new THREE.MeshPhysicalMaterial({color:0xf0c66e,emissive:0xe1a94a,emissiveIntensity:1.35,roughness:.18,metalness:.28,clearcoat:.55,clearcoatRoughness:.12}));coreOrb.position.y=.72;hubCore.add(coreOrb);
    const coreBeam=new THREE.Mesh(new THREE.CylinderGeometry(.025,.07,2.15,16,1,true),new THREE.MeshBasicMaterial({color:0xe9c46d,transparent:true,opacity:.23,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));coreBeam.position.y=1.38;hubCore.add(coreBeam);
    overviewLinkGroup=new THREE.Group();overviewLinkGroup.visible=false;root.add(overviewLinkGroup);overviewLinks=[];
    for(let i=0;i<6;i++){
      const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:i%2?0x6fd0bd:0xe8bd65,transparent:true,opacity:.0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      line.renderOrder=1;overviewLinkGroup.add(line);overviewLinks.push(line);
    }
    updateOverviewLinks();
    const ringSpecs=[[6.45,.012,.09],[7.0,.008,.045],[5.95,.018,.12]];
    ringSpecs.forEach((spec,i)=>{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(spec[0],spec[1],6,profile.low?72:128),new THREE.MeshBasicMaterial({color:i===1?0x65c8b6:0xe3b65f,transparent:true,opacity:spec[2],depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      ring.rotation.x=Math.PI/2;ring.position.y=.30+i*.012;hub.add(ring);hubRings.push(ring);
    });
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2-Math.PI/2;
      const node=new THREE.Group();
      const core=new THREE.Mesh(new THREE.SphereGeometry(.095,16,12),new THREE.MeshBasicMaterial({color:i%2?0x6fd1be:0xeec56b,transparent:true,opacity:.72,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      const orbit=new THREE.Mesh(new THREE.TorusGeometry(.23,.012,6,32),new THREE.MeshBasicMaterial({color:i%2?0x6fd1be:0xeec56b,transparent:true,opacity:.22,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));orbit.rotation.x=Math.PI/2;
      node.add(core,orbit);node.position.set(Math.cos(a)*6.48,.33,Math.sin(a)*6.48);hub.add(node);hubNodes.push(node);
    }
    const curve=new THREE.EllipseCurve(0,0,6.45,6.45,0,Math.PI*2,false,0);
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

  function boxCorners(box){
    const a=box.min,b=box.max;return [
      new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(a.x,a.y,b.z),new THREE.Vector3(a.x,b.y,a.z),new THREE.Vector3(a.x,b.y,b.z),
      new THREE.Vector3(b.x,a.y,a.z),new THREE.Vector3(b.x,a.y,b.z),new THREE.Vector3(b.x,b.y,a.z),new THREE.Vector3(b.x,b.y,b.z)
    ];
  }

  function transformedBox(i,position,scale,usePreview=false){
    const local=usePreview?previewBoxes[i]:stationBoxes[i];
    return new THREE.Box3(local.min.clone().multiplyScalar(scale).add(position),local.max.clone().multiplyScalar(scale).add(position));
  }

  function safeFrame(){
    const rtl=document.documentElement.dir==='rtl';
    if(profile.compact&&profile.portrait)return {left:-.965,right:.965,bottom:-.43,top:.80};
    if(profile.compact&&profile.landscape)return rtl?{left:-.97,right:-.01,bottom:-.76,top:.78}:{left:.01,right:.97,bottom:-.76,top:.78};
    if(profile.compact)return {left:-.955,right:.955,bottom:-.44,top:.80};
    if(profile.tablet)return rtl?{left:-.945,right:.035,bottom:-.79,top:.84}:{left:-.035,right:.945,bottom:-.79,top:.84};
    return rtl?{left:-.95,right:.055,bottom:-.82,top:.85}:{left:-.055,right:.95,bottom:-.82,top:.85};
  }

  function cameraPosition(target,yaw,elev,distance,out){
    const horizontal=Math.cos(elev)*distance;
    return (out||new THREE.Vector3()).set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
  }

  function projectedBounds(box,target,yaw,elev,distance,fov){
    fitCamera.fov=fov;fitCamera.aspect=profile.aspect;fitCamera.near=.08;fitCamera.far=180;fitCamera.updateProjectionMatrix();
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

  function framedPose(box,yaw,elev,fov,padding=.022){
    const safe=safeFrame();const desiredX=(safe.left+safe.right)*.5;
    const desiredY=(safe.bottom+safe.top)*.5+(profile.compact&&profile.portrait?.105:(profile.compact?.045:0));
    const target=new THREE.Vector3();box.getCenter(target);
    let distance=0;
    for(let pass=0;pass<8;pass++){
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

  function stageYaw(i){
    const mobile=[.60,-.57,.58,-.54,.56,-.60];
    const tablet=[.63,-.60,.61,-.57,.59,-.63];
    const desktop=[.66,-.62,.64,-.60,.62,-.66];
    return (profile.compact?mobile:(profile.tablet?tablet:desktop))[i];
  }

  function stageElevation(i){
    const mobile=[.265,.275,.245,.265,.255,.278];
    const tablet=[.285,.295,.265,.285,.275,.295];
    const desktop=[.305,.315,.285,.305,.295,.315];
    return (profile.compact?mobile:(profile.tablet?tablet:desktop))[i];
  }

  function holdPose(i,u){
    const box=transformedBox(i,new THREE.Vector3(),1);
    const live=smoother(u),direction=i%2?-1:1;
    const yaw=stageYaw(i)+lerp(-.022,.022,live)*direction;
    const elev=stageElevation(i)+Math.sin(Math.PI*u)*.007;
    const pose=framedPose(box,yaw,elev,profile.fov,profile.compact?.006:.009);
    const dolly=1-Math.sin(Math.PI*u)*.022;
    pose.pos.sub(pose.target).multiplyScalar(dolly).add(pose.target);
    return pose;
  }

  function bridgePose(i,q){
    const start=holdCache[i][holdCache[i].length-1];
    const end=holdCache[i+1][0];
    const t=smoother(q);
    const target=start.target.clone().lerp(end.target,t);
    const startDir=start.pos.clone().sub(start.target);
    const endDir=end.pos.clone().sub(end.target);
    const startDistance=startDir.length(),endDistance=endDir.length();
    const startYaw=Math.atan2(startDir.x,startDir.z),endYaw=Math.atan2(endDir.x,endDir.z);
    let yawDelta=endYaw-startYaw;
    while(yawDelta>Math.PI)yawDelta-=Math.PI*2;
    while(yawDelta<-Math.PI)yawDelta+=Math.PI*2;
    const startElev=Math.asin(clamp(startDir.y/startDistance,-1,1));
    const endElev=Math.asin(clamp(endDir.y/endDistance,-1,1));
    const lift=Math.sin(Math.PI*t);
    const yaw=startYaw+yawDelta*t;
    const elev=lerp(startElev,endElev,t)+lift*(profile.compact?.018:.025);
    const bridgeClearance=(profile.short&&profile.landscape)?.12:(profile.compact?.018:.026);
    const distance=lerp(startDistance,endDistance,t)*(1+lift*bridgeClearance);
    target.y+=lift*(profile.compact?.08:.12);
    return {pos:cameraPosition(target,yaw,elev,distance,new THREE.Vector3()),target,fov:lerp(start.fov,end.fov,t)};
  }

  function finalOverviewScale(){
    if(profile.compact&&profile.portrait)return .49;
    if(profile.compact)return .47;
    if(profile.tablet||profile.w<1250)return .445;
    return .56;
  }

  function finalOverviewPose(){
    const union=new THREE.Box3(),scale=finalOverviewScale();
    stations.forEach((_,i)=>union.union(transformedBox(i,overviewPositions[i],scale,true)));
    const twoColumn=(profile.compact&&profile.portrait)||profile.tablet||profile.w<1250;
    const yaw=twoColumn?.025:(profile.compact?.12:.20);
    const elev=twoColumn?.565:(profile.compact?.44:.40);
    return framedPose(union,yaw,elev,profile.fov+(profile.compact?.35:.18),profile.compact?.028:.024);
  }

  function overviewPose(q){
    const start=holdCache[5][holdCache[5].length-1],end=overviewCache.final;
    const t=smoother(q);
    const midTarget=start.target.clone().lerp(end.target,.52).add(new THREE.Vector3(0,profile.compact?.25:.42,0));
    const midPos=start.pos.clone().lerp(end.pos,.52).add(new THREE.Vector3(profile.compact?.15:.32,profile.compact?.65:1.0,profile.compact?.45:.75));
    if(t<.5){
      const u=t*2;return {pos:start.pos.clone().lerp(midPos,smoother(u)),target:start.target.clone().lerp(midTarget,smoother(u)),fov:lerp(start.fov,end.fov+1.0,smooth(u))};
    }
    const u=(t-.5)*2;return {pos:midPos.clone().lerp(end.pos,smoother(u)),target:midTarget.clone().lerp(end.target,smoother(u)),fov:lerp(end.fov+1.0,end.fov,smooth(u))};
  }

  function buildCameraCache(){
    holdCache=[];bridgeCache=[];
    const holdCount=profile.low?7:(profile.compact?11:13);
    const bridgeCount=profile.low?13:(profile.compact?19:23);
    for(let i=0;i<6;i++){
      const list=[];for(let k=0;k<holdCount;k++)list.push(holdPose(i,k/(holdCount-1)));holdCache.push(list);
    }
    for(let i=0;i<5;i++){
      const list=[];for(let k=0;k<bridgeCount;k++)list.push(bridgePose(i,k/(bridgeCount-1)));bridgeCache.push(list);
    }
    overviewCache={final:finalOverviewPose(),samples:[]};
    const overviewCount=profile.low?15:(profile.compact?21:25);
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
    const threshold=profile.compact?(profile.low?1.42:1.18):(profile.tablet?.82:.62);
    station.meshes.forEach(mesh=>{
      mesh.visible=!overview||(mesh.userData.connectedSize||1)>=threshold;
      mesh.castShadow=overview?false:Boolean(mesh.userData.connectedCastShadow);
    });
    station.localLights.forEach(light=>{light.visible=!overview;});
    station.platform.children.forEach((child,idx)=>{child.visible=!overview||idx<=4;});
    station.arch.visible=!overview;
    station.accent.visible=!overview;
  }

  function finalPlacement(i,q){
    const finalScale=finalOverviewScale();
    const reveal=smoother(clamp((q-.46-i*.018)/Math.max(.001,.96-(.46+i*.018))));
    const start=overviewPositions[i].clone();
    const radial=start.clone().setY(0);if(radial.lengthSq()<.001)radial.set(i%2?1:-1,0,i<3?1:-1);radial.normalize();
    start.addScaledVector(radial,profile.compact?.70:1.0);start.y=.18;
    return {pos:start.lerp(overviewPositions[i],reveal),scale:lerp(.18,finalScale,reveal),reveal};
  }

  function transitionVeil(state){
    if(state.mode==='transition')return Math.pow(Math.sin(Math.PI*clamp(state.q)),1.7)*.52;
    if(state.mode==='overview')return Math.pow(Math.sin(Math.PI*clamp(state.q/.62)),1.45)*(state.q<.62?1:0);
    return 0;
  }

  function applyState(state){
    stations.forEach(s=>{s.wrapper.visible=false;s.detail.visible=false;s.preview.visible=false;s.accent.intensity=0;s.scanner.group.visible=false;});
    if(state.mode==='hold'){
      const s=stations[state.stage];setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;s.preview.visible=false;s.wrapper.position.set(0,0,0);s.wrapper.scale.setScalar(1);s.wrapper.rotation.y=0;s.accent.intensity=profile.compact?.88:1.08;s.scanner.group.visible=true;
    }else if(state.mode==='transition'){
      const before=state.q<.5;const s=stations[before?state.stage:state.next];
      setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;s.preview.visible=false;s.wrapper.position.set(0,0,0);
      const phase=before?clamp(state.q/.5):clamp((state.q-.5)/.5);
      const eased=smoother(phase);
      if(before){const outgoingEnd=(profile.short&&profile.landscape)?1:1.045;s.wrapper.scale.setScalar(lerp(1,outgoingEnd,eased));s.wrapper.rotation.y=lerp(0,(state.stage%2?-1:1)*.025,eased);s.wrapper.position.y=lerp(0,.025,eased);s.accent.intensity=lerp(profile.compact?.88:1.08,.42,eased);s.scanner.group.visible=phase<.62;}
      else{const incomingStart=(profile.short&&profile.landscape)?1:1.10;s.wrapper.scale.setScalar(lerp(incomingStart,1,eased));s.wrapper.rotation.y=lerp((state.next%2?1:-1)*.025,0,eased);s.wrapper.position.y=lerp(.025,0,eased);s.accent.intensity=lerp(.42,profile.compact?.88:1.08,eased);s.scanner.group.visible=phase>.38;}
    }else{
      if(state.q<.48){
        const s=stations[5];setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;s.preview.visible=false;s.wrapper.position.set(0,0,0);const t=smoother(clamp(state.q/.48));s.wrapper.scale.setScalar(lerp(1,.91,t));s.wrapper.position.y=lerp(0,.08,t);s.accent.intensity=lerp(profile.compact?.76:.96,.20,t);
      }else{
        stations.forEach((s,i)=>{const p=finalPlacement(i,state.q);setStationLOD(s,'overview');s.wrapper.visible=p.reveal>.015;s.detail.visible=false;s.preview.visible=s.wrapper.visible;s.wrapper.position.copy(p.pos);s.wrapper.scale.setScalar(p.scale);s.wrapper.rotation.y=(i%2?-1:1)*.08*(1-p.reveal);s.accent.intensity=0;});
      }
    }
    if(hub){
      const inOverview=state.mode==='overview'&&state.q>.48;
      const hs=inOverview?(profile.compact?.61:.78):1;
      hub.scale.setScalar(hs);hub.position.y=inOverview?.02:0;
      if(hubCore)hubCore.visible=inOverview;
      if(overviewLinkGroup){overviewLinkGroup.visible=inOverview;overviewLinks.forEach((line,i)=>{line.material.opacity=inOverview?(.16+(i%2)*.05):0;});}
    }
    stations.forEach(s=>{if(s.wrapper.visible)s.wrapper.updateMatrixWorld();});
    const veil=transitionVeil(state);sticky.style.setProperty('--connected-transition',veil.toFixed(4));
  }

  function evaluateCamera(state){
    let pose;
    if(state.mode==='hold')pose=samplePose(holdCache[state.stage],state.local);
    else if(state.mode==='transition')pose=samplePose(bridgeCache[state.stage],state.q);
    else pose=samplePose(overviewCache.samples,state.q);
    if(!pose)return null;desiredPos.copy(pose.pos);desiredTarget.copy(pose.target);return pose;
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
    const key=state.mode+':'+stage;
    if(key===lastStateKey)return;lastStateKey=key;
    const focus=state.mode==='overview'?new THREE.Vector3(0,1.35,0):new THREE.Vector3(0,1.55,0);
    if(keyLight){keyLight.position.copy(focus).add(new THREE.Vector3(profile.compact?5.6:7.4,profile.compact?7.8:9.5,profile.compact?5.8:7.4));keyLight.target.position.copy(focus);keyLight.target.updateMatrixWorld();}
    if(rimLight)rimLight.position.copy(focus).add(new THREE.Vector3(-5.0,4.9,-5.4));
    if(fillLight)fillLight.position.copy(focus).add(new THREE.Vector3(4.4,3.4,4.8));
    if(topLight)topLight.position.copy(focus).add(new THREE.Vector3(0,7.5,0));
    if(renderer&&renderer.shadowMap&&renderer.shadowMap.enabled)renderer.shadowMap.needsUpdate=true;
  }

  function animateScene(now,state,dt){
    const t=now*.001,active=copyStageFor(state),overview=state.mode==='overview'&&state.q>.48;
    dataPackets.forEach((p,i)=>{const u=(t*p.userData.speed+p.userData.offset)%1;p.position.copy(p.userData.curve.getPointAt(u));p.position.y+=Math.sin(t*3+i)*.018;p.material.opacity=.48+.40*Math.sin(Math.PI*u);});
    hubRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.020:-.016);ring.material.opacity=(i===2?.10:.045)+Math.sin(t*.55+i)*.006;});
    hubNodes.forEach((node,i)=>{const selected=overview||i===active;node.scale.setScalar(selected?1.12:1);node.children[0].material.opacity=selected?.92:.48;node.children[1].rotation.z+=dt*(i%2?.22:-.18);node.children[1].material.opacity=selected?.42:.14;});
    if(hubCore&&hubCore.visible){hubCore.rotation.y+=dt*.10;hubCore.children[1].rotation.z+=dt*.34;hubCore.children[2].rotation.z-=dt*.22;hubCore.children[3].scale.setScalar(1+Math.sin(t*2.2)*.08);hubCore.children[4].material.opacity=.18+.08*Math.sin(t*1.7);}
    if(overviewLinkGroup&&overviewLinkGroup.visible)overviewLinks.forEach((line,i)=>{line.material.opacity=.14+.09*(.5+.5*Math.sin(t*1.25+i*.72));});
    if(dust){dust.rotation.y=Math.sin(t*.07)*.012;dust.position.y=Math.sin(t*.14)*.035;}
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const isActive=i===active;
      if(s.detail.visible&&(!overview||state.q<.72))factory&&factory.animate&&factory.animate(s.detail,t+i*.17);
      s.arch.rotation.z+=dt*(i%2?.017:-.017);
      if(s.scanner.group.visible){const phase=(t*.22+i*.17)%1;const y=.42+phase*3.45;s.scanner.group.position.y=y;s.scanner.ring.material.opacity=(1-Math.abs(phase-.5)*2)*.16;s.scanner.glow.material.opacity=(1-Math.abs(phase-.5)*2)*.038;}
      s.platform.children.forEach(child=>{if(child.userData&&Number.isFinite(child.userData.phase))child.material.opacity=.54+.28*Math.sin(t*1.8+child.userData.phase);});
      if(isActive&&now-screenUpdateAt>0)drawScreen(s.screen,now,true,false);
    });
    if(now-screenUpdateAt>110){screenUpdateAt=now;stations.forEach((s,i)=>{if(s.wrapper.visible&&i!==active)drawScreen(s.screen,now,false,overview);});}
    updateLighting(active,state);
  }

  function measureTrack(){
    const rect=track.getBoundingClientRect();
    trackStart=rect.top+(window.scrollY||window.pageYOffset||0);
    trackSpan=Math.max(1,track.offsetHeight-sticky.clientHeight);
  }

  function readProgress(){
    const y=window.scrollY||window.pageYOffset||0;
    targetProgress=clamp((y-trackStart)/trackSpan);
    document.body.classList.toggle('connected-scene-active',y>=trackStart-sticky.clientHeight*.08&&y<=trackStart+trackSpan+sticky.clientHeight*.08);
  }

  function scheduleProgress(){readProgress();startLoop();}

  function resize(){
    resizeQueued=false;if(!renderer||!camera)return;
    profile=getProfile();configureOverview();measureTrack();
    renderRatio=qualityRatio(profile);renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);
    camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    buildCameraCache();readProgress();progress=targetProgress;
    const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    stations.forEach(s=>{s.lod=null;});
  }

  function scheduleResize(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);}

  function render(now){
    rafId=0;if(!renderer||!scene||!camera||!visible||!pageVisible)return;
    const minFrameMs=profile.compact?(profile.low?28:(profile.high?16:20)):16;
    if(lastRenderedAt&&now-lastRenderedAt<minFrameMs){rafId=requestAnimationFrame(render);return;}
    lastRenderedAt=now;readProgress();
    const dt=lastTime?Math.min(.04,(now-lastTime)/1000):1/60;lastTime=now;
    const gap=Math.abs(targetProgress-progress);
    const lambda=(profile.compact?24:20)+Math.min(28,gap*90);
    progress=reduced?targetProgress:damp(progress,targetProgress,lambda,dt);
    if(Math.abs(progress-targetProgress)<.000012)progress=targetProgress;
    const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);if(Math.abs(camera.fov-pose.fov)>.001){camera.fov=pose.fov;camera.updateProjectionMatrix();}}
    if(copyBox)copyBox.classList.toggle('in-transit',state.mode!=='hold');updateCopy(state);animateScene(now,state,dt);
    if(now-styleUpdateAt>32){styleUpdateAt=now;sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');if(indicator)indicator.style.opacity=progress>.94?'0':'1';}
    renderer.render(scene,camera);
    if(!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
    rafId=requestAnimationFrame(render);
  }

  function startLoop(){if(!rafId&&initialized&&visible&&pageVisible){lastTime=0;lastRenderedAt=0;rafId=requestAnimationFrame(render);}}
  function stopLoop(){if(rafId){cancelAnimationFrame(rafId);rafId=0;}}

  function resetCanvas(){
    if(!canvas||!canvas.isConnected)return;
    const clone=canvas.cloneNode(false);clone.width=1;clone.height=1;clone.style.pointerEvents='none';clone.style.touchAction='pan-y';canvas.replaceWith(clone);canvas=clone;
  }

  function bindCanvasLoss(){
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();sticky.classList.remove('model-active');if(fallback)fallback.style.opacity='.30';stopLoop();
      try{renderer&&renderer.dispose&&renderer.dispose();surfaceTexture&&surfaceTexture.dispose&&surfaceTexture.dispose();edgeMaterial&&edgeMaterial.dispose&&edgeMaterial.dispose();}catch(_){}
      surfaceTexture=edgeMaterial=null;renderer=scene=camera=root=null;stations=[];stationBoxes=[];initialized=false;initQueued=false;resetCanvas();setTimeout(queueInit,650);
    },{once:true});
  }

  function bindGlobal(){
    if(bound)return;bound=true;
    const io=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting);
      document.body.classList.toggle('connected-scene-active',visible);
      if(visible){measureTrack();readProgress();scheduleResize();startLoop();}else stopLoop();
    },{rootMargin:'220px 0px',threshold:0});io.observe(sticky);
    addEventListener('scroll',scheduleProgress,{passive:true});
    addEventListener('resize',scheduleResize,{passive:true});
    addEventListener('orientationchange',()=>setTimeout(scheduleResize,180),{passive:true});
    if('ResizeObserver'in window){const ro=new ResizeObserver(scheduleResize);ro.observe(sticky);ro.observe(track);}
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;lastTime=0;if(pageVisible&&visible)startLoop();else stopLoop();});
    document.addEventListener('languagechange',()=>{activeCopyStage=-1;overviewCopy=false;updateCopy(timeline(progress));});
  }

  function init(){
    if(initialized)return;
    initialized=true;initQueued=false;initAttempts+=1;profile=getProfile();configureOverview();
    renderer=createRenderer();
    if(!renderer){initialized=false;if(fallback)fallback.style.opacity='.45';resetCanvas();if(initAttempts<3)setTimeout(queueInit,650*initAttempts);return;}
    renderRatio=qualityRatio(profile);
    if(Q)Q.configureRenderer(renderer,{exposure:1.20,pixelCap:renderRatio});
    else{renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.20;}
    renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);renderer.setClearColor(0x060504,1);renderer.sortObjects=true;
    renderer.shadowMap.enabled=!profile.compact&&!profile.low&&profile.w>=1024;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x060504);scene.fog=new THREE.FogExp2(0x060504,profile.compact?.017:.013);if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);
    surfaceTexture=makeSurfaceTexture();
    edgeMaterial=new THREE.LineBasicMaterial({color:0xf2dfb6,transparent:true,opacity:profile.compact?.105:.13,depthWrite:false,toneMapped:false});
    scene.add(new THREE.HemisphereLight(0xffefd3,0x080706,profile.compact?.78:.88));
    keyLight=new THREE.DirectionalLight(0xffe1a9,profile.compact?1.62:1.82);keyLight.position.set(7,10,7);keyLight.castShadow=renderer.shadowMap.enabled;scene.add(keyLight);scene.add(keyLight.target);
    if(keyLight.castShadow){const size=profile.high?1536:1024;keyLight.shadow.mapSize.set(size,size);keyLight.shadow.camera.left=-10;keyLight.shadow.camera.right=10;keyLight.shadow.camera.top=10;keyLight.shadow.camera.bottom=-10;keyLight.shadow.bias=-.00024;keyLight.shadow.normalBias=.024;keyLight.shadow.radius=2.2;}
    rimLight=new THREE.PointLight(0x72d2bf,profile.compact?.64:.82,25,1.9);scene.add(rimLight);
    fillLight=new THREE.PointLight(0xe3b35c,profile.compact?.48:.64,24,2);scene.add(fillLight);
    topLight=new THREE.PointLight(0xffe6bb,profile.compact?.22:.32,18,2);scene.add(topLight);

    buildHub();buildStations();measureTrack();
    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.08,180);scene.add(camera);
    buildCameraCache();
    const state=timeline(0);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    bindCanvasLoss();bindGlobal();readProgress();progress=targetProgress;if(visible)startLoop();
  }

  function queueInit(){
    if(initialized||initQueued)return;initQueued=true;
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:false}}));
    setTimeout(()=>{
      if(initialized)return;
      try{init();}
      catch(error){console.error('[By Meli] Connected V18 failed:',error);initialized=false;initQueued=false;if(fallback)fallback.style.opacity='.42';if(initAttempts<3)setTimeout(queueInit,700);}
    },420);
  }

  function auditAt(value){
    if(!initialized||!camera)return {initialized:false};
    progress=targetProgress=clamp(value);const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const frame=safeFrame(),items=[];
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const box=transformedBox(i,s.wrapper.position,s.wrapper.scale.x,s.preview.visible);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
      boxCorners(box).forEach(p=>{const n=p.clone().project(camera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
      items.push({i,minX,maxX,minY,maxY,behind,inside:!behind&&minX>=frame.left-.035&&maxX<=frame.right+.035&&minY>=frame.bottom-.035&&maxY<=frame.top+.035});
    });
    return {initialized:true,progress,state,frame,profile:{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio},camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,fov:camera.fov},target:{x:desiredTarget.x,y:desiredTarget.y,z:desiredTarget.z},veil:transitionVeil(state),items};
  }

  function renderAt(value){
    if(!initialized||!renderer||!camera)return {initialized:false};
    stopLoop();visible=false;document.body.classList.add('connected-scene-active');
    progress=targetProgress=clamp(value);const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();
    updateCopy(state);animateScene(performance.now(),state,1/60);renderer.render(scene,camera);
    sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';
    return auditAt(progress);
  }

  window.ByMeliConnectedV18={forceInit:queueInit,auditAt,renderAt,getState:()=>({initialized,progress,target:targetProgress,state:timeline(progress),profile:profile?{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio}:null})};
  const bootstrap=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){bootstrap.disconnect();queueInit();}},{rootMargin:'460px 0px',threshold:0});bootstrap.observe(track);
  setTimeout(()=>{if(!initialized&&!initQueued){const r=track.getBoundingClientRect();if(r.top<innerHeight*3&&r.bottom>-innerHeight)queueInit();}},1000);
})();
