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
  const angleLerp=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
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

  // Six deliberate service holds, five cinematic transfers and one final overview.
  const HOLD=.095;
  const TRANSITION=.060;
  const OVERVIEW=.130;
  const OVERVIEW_START=HOLD*6+TRANSITION*5;

  let renderer=null,scene=null,camera=null,root=null;
  let profile=null,stations=[],stationBoxes=[],routePositions=[],overviewPositions=[];
  let holdCache=[],transitionCache=[],overviewCache=[];
  let routeCurve=null,routeTube=null,routeGlow=null,dataPackets=[],dust=null,ambientRings=[];
  let keyLight=null,rimLight=null,fillLight=null,sharedShadowTexture=null;
  let initialized=false,initQueued=false,initAttempts=0,bound=false;
  let visible=false,pageVisible=!document.hidden,rafId=0,lastTime=0;
  let targetProgress=0,progress=0,progressQueued=false,resizeQueued=false;
  let activeCopyStage=-1,overviewCopy=false,copyToken=0,activeLightingKey='';
  let screenUpdateAt=0,styleUpdateAt=0,renderRatio=1;

  const fitCamera=new THREE.PerspectiveCamera(36,1,.08,240);
  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpC=new THREE.Vector3();
  const tmpD=new THREE.Vector3(),tmpE=new THREE.Vector3();
  const WORLD_UP=new THREE.Vector3(0,1,0);

  function getProfile(){
    const w=Math.max(1,Math.round(sticky.clientWidth||innerWidth));
    const h=Math.max(1,Math.round(sticky.clientHeight||innerHeight));
    const aspect=w/h;
    const compact=w<760||(coarse&&w<900);
    const tablet=!compact&&w<1180;
    const portrait=aspect<.86;
    const landscape=aspect>1.45;
    const short=h<600;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const low=memory<=3||cores<=4;
    const high=memory>=6&&cores>=6;
    const tier=low?'low':(high?'high':'balanced');
    let fov=34;
    if(compact)fov=landscape?35:(portrait?37:36);
    else if(tablet)fov=portrait?36:35;
    return {w,h,aspect,compact,tablet,portrait,landscape,short,memory,cores,low,high,tier,fov};
  }

  function qualityRatio(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    let cap,budget;
    if(p.compact){
      cap=p.high?2.0:(p.low?1.32:1.68);
      budget=p.high?2450000:(p.low?1050000:1700000);
    }else if(p.tablet){
      cap=p.high?1.95:(p.low?1.32:1.64);
      budget=p.high?3500000:(p.low?1750000:2650000);
    }else{
      cap=p.high?2.0:(p.low?1.34:1.68);
      budget=p.high?5000000:(p.low?2400000:3700000);
    }
    return Math.max(1,Math.min(dpr,cap,Math.sqrt(budget/Math.max(1,p.w*p.h))));
  }

  function configureLayouts(){
    const spacing=profile.compact?10.4:(profile.tablet?11.5:12.2);
    routePositions=[
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(spacing,0,-2.1),
      new THREE.Vector3(spacing*2,0,1.45),
      new THREE.Vector3(spacing*3,0,-1.65),
      new THREE.Vector3(spacing*4,0,1.7),
      new THREE.Vector3(spacing*5,0,-.15)
    ];
    if(profile.compact&&profile.portrait){
      overviewPositions=[
        new THREE.Vector3(-3.35,0,5.05),new THREE.Vector3(3.35,0,5.05),
        new THREE.Vector3(-3.35,0,0),new THREE.Vector3(3.35,0,0),
        new THREE.Vector3(-3.35,0,-5.05),new THREE.Vector3(3.35,0,-5.05)
      ];
    }else{
      overviewPositions=[
        new THREE.Vector3(-5.65,0,3.75),new THREE.Vector3(0,0,3.75),new THREE.Vector3(5.65,0,3.75),
        new THREE.Vector3(-5.65,0,-3.75),new THREE.Vector3(0,0,-3.75),new THREE.Vector3(5.65,0,-3.75)
      ];
    }
  }

  function createRenderer(){
    const antialias=!profile.low;
    try{
      return new THREE.WebGLRenderer({canvas,antialias,alpha:false,powerPreference:profile.low?'default':'high-performance',precision:profile.low?'mediump':'highp',stencil:false,preserveDrawingBuffer:false,depth:true});
    }catch(_){
      try{return new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'default',precision:'mediump',stencil:false,preserveDrawingBuffer:false,depth:true});}
      catch(__){return null;}
    }
  }

  function makeLiveScreen(i){
    const c=document.createElement('canvas');
    c.width=profile.compact?512:768;
    c.height=profile.compact?288:432;
    const ctx=c.getContext('2d',{alpha:false});
    const tex=new THREE.CanvasTexture(c);
    tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
    tex.minFilter=THREE.LinearFilter;
    tex.magFilter=THREE.LinearFilter;
    tex.generateMipmaps=false;
    tex.encoding=THREE.sRGBEncoding;
    tex.needsUpdate=true;
    return {canvas:c,ctx,texture:tex,last:-1,index:i};
  }

  function drawScreen(screen,time,active,overview){
    const interval=active?92:(overview?420:260);
    const bucket=Math.floor(time/interval);
    if(screen.last===bucket)return;
    screen.last=bucket;
    const c=screen.canvas,x=screen.ctx,w=c.width,h=c.height;
    const accent=screen.index%2?'#72d5c2':'#efc46d';
    const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#06100f');g.addColorStop(.58,'#12312d');g.addColorStop(1,'#1a1108');x.fillStyle=g;x.fillRect(0,0,w,h);
    const glow=x.createRadialGradient(w*.76,h*.24,4,w*.76,h*.24,w*.66);glow.addColorStop(0,screen.index%2?'rgba(105,220,199,.36)':'rgba(240,194,100,.36)');glow.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=glow;x.fillRect(0,0,w,h);
    x.strokeStyle='rgba(240,218,172,.10)';x.lineWidth=1;
    for(let i=0;i<10;i++){x.beginPath();x.moveTo(i*w/9,0);x.lineTo(i*w/9,h);x.stroke();}
    for(let i=0;i<6;i++){x.beginPath();x.moveTo(0,i*h/5);x.lineTo(w,i*h/5);x.stroke();}
    x.strokeStyle='rgba(238,207,142,.44)';x.lineWidth=Math.max(2,w/420);x.strokeRect(w*.055,h*.075,w*.89,h*.85);
    x.fillStyle='#fff7e8';x.font=`800 ${Math.round(h*.135)}px Inter,Arial,sans-serif`;x.fillText('BY MELI',w*.085,h*.23);
    x.fillStyle=accent;x.font=`600 ${Math.round(h*.05)}px monospace`;x.fillText(`${String(screen.index+1).padStart(2,'0')} / ${serviceCodes[screen.index]}`,w*.09,h*.335);
    x.fillStyle='rgba(255,247,232,.72)';x.font=`500 ${Math.round(h*.038)}px Inter,Arial,sans-serif`;x.fillText(active?'LIVE PRODUCTION SYSTEM':'CONNECTED DELIVERY NETWORK',w*.09,h*.43);
    const phase=(time*.0004+screen.index*.13)%1;
    x.lineWidth=Math.max(2,w/520);x.strokeStyle=accent;x.beginPath();
    for(let k=0;k<52;k++){
      const px=w*(.09+.82*k/51),wave=Math.sin(k*.34+phase*Math.PI*2)*.055+Math.sin(k*.11+screen.index)*.022;
      const py=h*(.69-wave);if(k===0)x.moveTo(px,py);else x.lineTo(px,py);
    }x.stroke();
    for(let k=0;k<16;k++){x.fillStyle=k/16<phase?accent:'rgba(255,255,255,.15)';x.fillRect(w*(.09+k*.049),h*.81,w*.03,h*.013);}
    screen.texture.needsUpdate=true;
  }

  function tuneConnectedMaterials(materials){
    if(!materials)return;
    Object.keys(materials).forEach(key=>{
      const m=materials[key];if(!m)return;
      if('envMapIntensity'in m)m.envMapIntensity=Math.min(profile.compact?1.05:1.25,m.envMapIntensity||1);
    });
    if(materials.glass){
      if(profile.compact){materials.glass.transmission=0;materials.glass.opacity=.30;materials.glass.roughness=.16;materials.glass.metalness=.04;}
      else{materials.glass.transmission=.22;materials.glass.opacity=.38;materials.glass.roughness=.10;}
      materials.glass.depthWrite=false;materials.glass.needsUpdate=true;
    }
    if(materials.gold){materials.gold.clearcoat=profile.compact?.25:.34;materials.gold.clearcoatRoughness=.19;materials.gold.needsUpdate=true;}
  }

  function makePlatform(i){
    const group=new THREE.Group();
    const accent=i%2?0x70cfbc:0xe8be67;
    const base=new THREE.Mesh(new THREE.CylinderGeometry(5.95,6.18,.22,profile.low?48:72),new THREE.MeshStandardMaterial({color:0x11100d,roughness:.86,metalness:.13,envMapIntensity:.54}));
    base.position.y=.11;base.receiveShadow=Boolean(renderer.shadowMap.enabled);group.add(base);
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(5.50,5.50,.035,profile.low?48:72),new THREE.MeshStandardMaterial({color:0x17140f,roughness:.75,metalness:.18,envMapIntensity:.65}));inner.position.y=.235;group.add(inner);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(5.36,.042,8,profile.low?64:104),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.78,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));ring.rotation.x=Math.PI/2;ring.position.y=.26;group.add(ring);
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(4.63,.014,6,profile.low?56:92),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.25,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));ring2.rotation.x=Math.PI/2;ring2.position.y=.266;group.add(ring2);
    if(!sharedShadowTexture){
      const size=profile.compact?512:768;
      const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
      const g=x.createRadialGradient(size/2,size/2,size*.025,size/2,size/2,size*.49);
      g.addColorStop(0,'rgba(0,0,0,.58)');g.addColorStop(.38,'rgba(0,0,0,.28)');g.addColorStop(.76,'rgba(0,0,0,.065)');g.addColorStop(1,'rgba(0,0,0,0)');
      x.fillStyle=g;x.fillRect(0,0,size,size);sharedShadowTexture=new THREE.CanvasTexture(c);sharedShadowTexture.minFilter=THREE.LinearFilter;sharedShadowTexture.magFilter=THREE.LinearFilter;sharedShadowTexture.generateMipmaps=false;sharedShadowTexture.needsUpdate=true;
    }
    const shadowPlane=new THREE.Mesh(new THREE.PlaneGeometry(10.5,10.5),new THREE.MeshBasicMaterial({map:sharedShadowTexture,transparent:true,opacity:profile.compact?.42:.48,depthWrite:false,toneMapped:false}));
    shadowPlane.rotation.x=-Math.PI/2;shadowPlane.position.y=.268;shadowPlane.renderOrder=1;group.add(shadowPlane);

    const beaconMat=new THREE.MeshStandardMaterial({color:0x16130e,roughness:.38,metalness:.56,emissive:accent,emissiveIntensity:.16});
    [[-4.35,-3.25],[4.35,-3.25],[-4.35,3.25],[4.35,3.25]].forEach(([x,z],k)=>{
      const post=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,.62,12),beaconMat);post.position.set(x,.49,z);group.add(post);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.75,depthWrite:false,toneMapped:false}));cap.position.set(x,.83,z);cap.userData.phase=k*.8;group.add(cap);
    });
    return group;
  }

  function makeScanner(i){
    const accent=i%2?0x75d3c1:0xefc66e;
    const group=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.TorusGeometry(4.65,.018,6,profile.low?56:96),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    ring.rotation.x=Math.PI/2;group.add(ring);
    const glow=new THREE.Mesh(new THREE.RingGeometry(4.36,4.92,profile.low?56:96),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    glow.rotation.x=-Math.PI/2;group.add(glow);
    return {group,ring,glow};
  }

  function buildStations(){
    factory&&factory.setShadowEnabled&&factory.setShadowEnabled(Boolean(renderer.shadowMap.enabled));
    stations=[];stationBoxes=[];
    serviceTypes.forEach((type,i)=>{
      const wrapper=new THREE.Group();wrapper.name=`connected-station-${type}`;
      const materials=factory?factory.createMaterials(renderer,{skipScreenTexture:true}):null;tuneConnectedMaterials(materials);
      const screen=makeLiveScreen(i);
      if(materials&&materials.screen){
        const old=materials.screen.map;materials.screen.map=screen.texture;materials.screen.emissiveMap=screen.texture;materials.screen.emissiveIntensity=1.18;materials.screen.needsUpdate=true;if(old&&old!==screen.texture)old.dispose&&old.dispose();
      }
      const platform=makePlatform(i);wrapper.add(platform);
      const detail=new THREE.Group();detail.name='detail';
      if(factory&&factory.factories&&factory.factories[type])factory.factories[type](detail,materials);
      detail.scale.setScalar(.82);detail.position.y=.30;wrapper.add(detail);
      const accentColor=i%2?0x78d8c5:0xf0c66c;
      const accent=new THREE.PointLight(accentColor,profile.compact?.78:1.0,15,2);accent.position.set(i%2?3.1:-3.1,4.2,3.0);wrapper.add(accent);
      const scanner=makeScanner(i);wrapper.add(scanner.group);
      const arch=new THREE.Mesh(new THREE.TorusGeometry(5.72,.022,6,profile.low?72:120,Math.PI*1.34),new THREE.MeshBasicMaterial({color:accentColor,transparent:true,opacity:.13,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      arch.rotation.set(Math.PI/2,0,-Math.PI*.17);arch.position.set(0,1.75,-1.48);wrapper.add(arch);
      root.add(wrapper);wrapper.updateMatrixWorld(true);

      const meshes=[],localLights=[];
      detail.traverse(o=>{
        if(o.isMesh&&o.geometry){
          o.geometry.computeBoundingBox&&o.geometry.computeBoundingBox();
          const size=new THREE.Vector3();if(o.geometry.boundingBox)o.geometry.boundingBox.getSize(size);
          o.userData.connectedSize=Math.max(size.x,size.y,size.z)*Math.max(o.scale.x,o.scale.y,o.scale.z);
          meshes.push(o);
        }
        if(o.isLight)localLights.push(o);
      });
      const box=new THREE.Box3().setFromObject(detail);
      box.min.sub(new THREE.Vector3(.22,.06,.22));box.max.add(new THREE.Vector3(.22,.20,.22));
      stationBoxes.push(box.clone());
      wrapper.position.copy(routePositions[i]);wrapper.updateMatrixWorld(true);
      stations.push({wrapper,detail,platform,accent,scanner,arch,materials,screen,meshes,localLights,lod:null,baseRoute:routePositions[i].clone()});
    });
  }

  function buildEnvironment(){
    const routePoints=routePositions.map((p,i)=>p.clone().add(new THREE.Vector3(0,.32,i%2?.15:-.15)));
    routeCurve=new THREE.CatmullRomCurve3(routePoints,false,'catmullrom',.22);
    routeTube=new THREE.Mesh(new THREE.TubeGeometry(routeCurve,profile.low?120:180,.028,6,false),new THREE.MeshBasicMaterial({color:0xe9c36d,transparent:true,opacity:.34,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));root.add(routeTube);
    routeGlow=new THREE.Mesh(new THREE.TubeGeometry(routeCurve,profile.low?120:180,.085,8,false),new THREE.MeshBasicMaterial({color:0x5fb9aa,transparent:true,opacity:.045,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));root.add(routeGlow);

    dataPackets=[];
    const packetCount=profile.low?5:(profile.compact?7:10);
    for(let i=0;i<packetCount;i++){
      const p=new THREE.Mesh(new THREE.SphereGeometry(.06,profile.low?8:12,profile.low?6:10),new THREE.MeshBasicMaterial({color:i%2?0x73d4c2:0xf0c870,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      p.userData={offset:i/packetCount,speed:.032+(i%3)*.003};root.add(p);dataPackets.push(p);
    }

    ambientRings=[];
    routePositions.forEach((p,i)=>{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(6.2,.012,5,profile.low?52:88),new THREE.MeshBasicMaterial({color:i%2?0x65c8b6:0xe3b65f,transparent:true,opacity:.035,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      ring.rotation.x=Math.PI/2;ring.position.copy(p).add(new THREE.Vector3(0,.30,0));root.add(ring);ambientRings.push(ring);
    });

    const count=profile.low?38:(profile.compact?62:92),positions=new Float32Array(count*3);
    const length=routePositions[5].x+14;
    for(let i=0;i<count;i++){positions[i*3]=-7+Math.random()*length;positions[i*3+1]=.5+Math.random()*6.5;positions[i*3+2]=(Math.random()-.5)*14;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const dot=document.createElement('canvas');dot.width=dot.height=32;const dx=dot.getContext('2d');const dg=dx.createRadialGradient(16,16,1,16,16,15);dg.addColorStop(0,'rgba(255,242,209,.85)');dg.addColorStop(.35,'rgba(229,185,91,.28)');dg.addColorStop(1,'rgba(0,0,0,0)');dx.fillStyle=dg;dx.fillRect(0,0,32,32);
    const dotTex=new THREE.CanvasTexture(dot);dotTex.minFilter=THREE.LinearFilter;dotTex.magFilter=THREE.LinearFilter;dotTex.generateMipmaps=false;
    dust=new THREE.Points(geo,new THREE.PointsMaterial({map:dotTex,size:profile.compact?.055:.07,transparent:true,opacity:.16,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));dust.frustumCulled=false;root.add(dust);
  }

  function boxCorners(box){
    const a=box.min,b=box.max;return [
      new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(a.x,a.y,b.z),new THREE.Vector3(a.x,b.y,a.z),new THREE.Vector3(a.x,b.y,b.z),
      new THREE.Vector3(b.x,a.y,a.z),new THREE.Vector3(b.x,a.y,b.z),new THREE.Vector3(b.x,b.y,a.z),new THREE.Vector3(b.x,b.y,b.z)
    ];
  }

  function transformedBox(i,position,scale){
    const local=stationBoxes[i];
    return new THREE.Box3(local.min.clone().multiplyScalar(scale).add(position),local.max.clone().multiplyScalar(scale).add(position));
  }

  function safeFrame(){
    const rtl=document.documentElement.dir==='rtl';
    if(profile.compact&&profile.portrait)return {left:-.91,right:.91,bottom:-.53,top:.74};
    if(profile.compact&&profile.landscape)return rtl?{left:-.94,right:-.02,bottom:-.76,top:.73}:{left:.02,right:.94,bottom:-.76,top:.73};
    if(profile.compact)return {left:-.91,right:.91,bottom:-.49,top:.76};
    if(profile.tablet)return rtl?{left:-.94,right:.02,bottom:-.79,top:.82}:{left:-.02,right:.94,bottom:-.79,top:.82};
    return rtl?{left:-.95,right:.04,bottom:-.80,top:.84}:{left:-.04,right:.95,bottom:-.80,top:.84};
  }

  function cameraPosition(target,yaw,elev,distance,out){
    const horizontal=Math.cos(elev)*distance;
    return (out||new THREE.Vector3()).set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
  }

  function projectedBounds(box,target,yaw,elev,distance,fov){
    fitCamera.fov=fov;fitCamera.aspect=profile.aspect;fitCamera.near=.08;fitCamera.far=240;fitCamera.updateProjectionMatrix();
    fitCamera.position.copy(cameraPosition(target,yaw,elev,distance,tmpC));fitCamera.up.set(0,1,0);fitCamera.lookAt(target);fitCamera.updateMatrixWorld(true);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
    boxCorners(box).forEach(p=>{const n=p.clone().project(fitCamera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
    return {minX,minY,maxX,maxY,behind};
  }

  function fitDistance(box,target,yaw,elev,fov,padding){
    const safe=safeFrame();
    const frame={left:safe.left+padding,right:safe.right-padding,bottom:safe.bottom+padding,top:safe.top-padding};
    const fits=d=>{const b=projectedBounds(box,target,yaw,elev,d,fov);return !b.behind&&b.minX>=frame.left&&b.maxX<=frame.right&&b.minY>=frame.bottom&&b.maxY<=frame.top;};
    let low=1.5,high=5;while(!fits(high)&&high<220)high*=1.3;
    for(let i=0;i<22;i++){const mid=(low+high)*.5;if(fits(mid))high=mid;else low=mid;}
    return high*(profile.compact?1.012:1.008);
  }

  function framedPose(box,yaw,elev,fov,padding=.025){
    const safe=safeFrame();const desiredX=(safe.left+safe.right)*.5,desiredY=(safe.bottom+safe.top)*.5;
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
    const mobile=[.54,-.49,.56,-.46,.50,-.54];
    const tablet=[.59,-.54,.61,-.50,.55,-.58];
    const desktop=[.62,-.57,.64,-.53,.58,-.61];
    return (profile.compact?mobile:(profile.tablet?tablet:desktop))[i];
  }

  function stageElevation(i){
    const mobile=[.19,.20,.175,.19,.18,.20];
    const tablet=[.205,.215,.19,.205,.195,.21];
    const desktop=[.22,.23,.205,.22,.21,.225];
    return (profile.compact?mobile:(profile.tablet?tablet:desktop))[i];
  }

  function holdPose(i,u){
    const position=routePositions[i];
    const box=transformedBox(i,position,1);
    const cinematic=smoother(u);
    const direction=i%2?-1:1;
    const yaw=stageYaw(i)+lerp(-.018,.018,cinematic)*direction;
    const elev=stageElevation(i)+Math.sin(Math.PI*u)*.006;
    const pose=framedPose(box,yaw,elev,profile.fov,profile.compact?.022:.020);
    // Very small deterministic dolly keeps the hold alive without floating.
    const dolly=1+Math.sin(Math.PI*u)*-.014;
    pose.pos.sub(pose.target).multiplyScalar(dolly).add(pose.target);
    return pose;
  }

  function transitionPose(i,q){
    const t=smoother(q);
    const start=holdCache[i][holdCache[i].length-1];
    const end=holdCache[i+1][0];
    const span=end.pos.clone().sub(start.pos);const len=Math.max(1,span.length());const dir=span.clone().normalize();
    const side=new THREE.Vector3().crossVectors(dir,WORLD_UP).normalize();
    const arc=profile.compact?1.15:1.55;
    const sideAmount=(i%2?-1:1)*(profile.compact?.34:.56);
    const c1=start.pos.clone().addScaledVector(dir,len*.30).addScaledVector(WORLD_UP,arc).addScaledVector(side,sideAmount);
    const c2=end.pos.clone().addScaledVector(dir,-len*.30).addScaledVector(WORLD_UP,arc).addScaledVector(side,-sideAmount);
    const pos=cubic(start.pos,c1,c2,end.pos,t,new THREE.Vector3());

    const targetSpan=end.target.clone().sub(start.target);const targetLen=Math.max(1,targetSpan.length());const targetDir=targetSpan.clone().normalize();
    const tc1=start.target.clone().addScaledVector(targetDir,targetLen*.34).addScaledVector(WORLD_UP,.38);
    const tc2=end.target.clone().addScaledVector(targetDir,-targetLen*.34).addScaledVector(WORLD_UP,.38);
    const target=cubic(start.target,tc1,tc2,end.target,t,new THREE.Vector3());
    const fov=lerp(start.fov,end.fov,t)+Math.sin(Math.PI*t)*(profile.compact?1.15:1.55);
    return {pos,target,fov};
  }

  function finalOverviewScale(){
    if(profile.compact&&profile.portrait)return .41;
    if(profile.compact)return .43;
    if(profile.tablet)return .45;
    return .48;
  }

  function finalOverviewPose(){
    const union=new THREE.Box3(),scale=finalOverviewScale();
    stations.forEach((_,i)=>union.union(transformedBox(i,overviewPositions[i],scale)));
    const yaw=profile.compact&&profile.portrait?.035:(profile.compact?.20:.27);
    const elev=profile.compact&&profile.portrait?.58:(profile.compact?.42:(profile.tablet?.41:.38));
    return framedPose(union,yaw,elev,profile.fov+(profile.compact?.45:.22),profile.compact?.033:.028);
  }

  function overviewPose(q){
    const t=smoother(q),start=holdCache[5][holdCache[5].length-1],end=overviewCache.final;
    const dir=end.pos.clone().sub(start.pos),len=Math.max(1,dir.length());dir.normalize();
    const side=new THREE.Vector3().crossVectors(dir,WORLD_UP).normalize();
    const c1=start.pos.clone().addScaledVector(dir,len*.26).addScaledVector(WORLD_UP,profile.compact?1.1:1.8).addScaledVector(side,profile.compact?.25:.48);
    const c2=end.pos.clone().addScaledVector(dir,-len*.32).addScaledVector(WORLD_UP,profile.compact?.85:1.25).addScaledVector(side,profile.compact?-.15:-.30);
    const pos=cubic(start.pos,c1,c2,end.pos,t,new THREE.Vector3());
    const tc1=start.target.clone().lerp(end.target,.34).add(new THREE.Vector3(0,.32,0));
    const tc2=start.target.clone().lerp(end.target,.72).add(new THREE.Vector3(0,.25,0));
    const target=cubic(start.target,tc1,tc2,end.target,t,new THREE.Vector3());
    return {pos,target,fov:lerp(start.fov,end.fov,t)+Math.sin(Math.PI*t)*(profile.compact?.8:1.05)};
  }

  function buildCameraCache(){
    holdCache=[];transitionCache=[];
    const holdCount=profile.low?7:11;
    const transCount=profile.low?15:(profile.compact?21:25);
    for(let i=0;i<6;i++){
      const list=[];for(let k=0;k<holdCount;k++)list.push(holdPose(i,k/(holdCount-1)));holdCache.push(list);
    }
    for(let i=0;i<5;i++){
      const list=[];for(let k=0;k<transCount;k++)list.push(transitionPose(i,k/(transCount-1)));transitionCache.push(list);
    }
    overviewCache={final:finalOverviewPose(),samples:[]};
    const overviewCount=profile.low?17:(profile.compact?23:29);
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
    const threshold=profile.compact?(profile.low?.80:.66):(profile.tablet?.54:.45);
    station.meshes.forEach(mesh=>{mesh.visible=!overview||(mesh.userData.connectedSize||1)>=threshold;});
    station.localLights.forEach(light=>{light.visible=!overview;});
  }

  function routeToOverviewPlacement(i,q){
    const finalScale=finalOverviewScale();
    if(i===5){
      const t=smoother(q);
      return {pos:routePositions[i].clone().lerp(overviewPositions[i],t),scale:lerp(1,finalScale,t),reveal:1};
    }
    // Secondary disciplines assemble only after the camera has entered the
    // overview space. They emerge around their final positions instead of
    // crossing the entire frame from the long walkthrough route.
    const delay=.50+i*.024;
    const reveal=smoother(clamp((q-delay)/Math.max(.001,.94-delay)));
    const outward=overviewPositions[i].clone();outward.y=0;
    if(outward.lengthSq()<.001)outward.set(i%2?1:-1,0,i<3?1:-1);
    outward.normalize().multiplyScalar(profile.compact?1.25:1.7);
    const start=overviewPositions[i].clone().add(outward);
    return {pos:start.lerp(overviewPositions[i],reveal),scale:lerp(.12,finalScale,reveal),reveal};
  }

  function applyState(state){
    stations.forEach(s=>{s.wrapper.visible=false;s.detail.visible=false;s.accent.intensity=0;s.scanner.group.visible=false;});
    if(state.mode==='hold'){
      const s=stations[state.stage];setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;s.wrapper.position.copy(routePositions[state.stage]);s.wrapper.scale.setScalar(1);s.accent.intensity=profile.compact?.82:1.02;s.scanner.group.visible=true;
    }else if(state.mode==='transition'){
      const mobileTight=profile.compact&&profile.low;
      const showOut=state.q<(mobileTight?.64:.82),showIn=state.q>(mobileTight?.36:.18);
      const out=stations[state.stage],incoming=stations[state.next];
      setStationLOD(out,'full');setStationLOD(incoming,'full');
      if(showOut){out.wrapper.visible=true;out.detail.visible=true;out.wrapper.position.copy(routePositions[state.stage]);out.wrapper.scale.setScalar(lerp(1,.92,smoother(clamp(state.q/.78))));out.accent.intensity=lerp(profile.compact?.82:1.02,.18,smoother(state.q));out.scanner.group.visible=state.q<.42;}
      if(showIn){incoming.wrapper.visible=true;incoming.detail.visible=true;incoming.wrapper.position.copy(routePositions[state.next]);incoming.wrapper.scale.setScalar(lerp(.92,1,smoother(clamp((state.q-.18)/.82))));incoming.accent.intensity=lerp(.18,profile.compact?.82:1.02,smoother(state.q));incoming.scanner.group.visible=state.q>.58;}
    }else{
      stations.forEach((s,i)=>{
        const p=routeToOverviewPlacement(i,state.q);setStationLOD(s,state.q<.28&&i===5?'full':'overview');
        s.wrapper.visible=p.reveal>.02;s.detail.visible=s.wrapper.visible;s.wrapper.position.copy(p.pos);s.wrapper.scale.setScalar(p.scale);s.accent.intensity=s.wrapper.visible?lerp(.08,.22,p.reveal):0;s.scanner.group.visible=false;
      });
    }
    stations.forEach(s=>s.wrapper.updateMatrixWorld());
  }

  function evaluateCamera(state){
    let pose;
    if(state.mode==='hold')pose=samplePose(holdCache[state.stage],state.local);
    else if(state.mode==='transition')pose=samplePose(transitionCache[state.stage],state.q);
    else pose=samplePose(overviewCache.samples,state.q);
    if(!pose)return null;
    desiredPos.copy(pose.pos);desiredTarget.copy(pose.target);return pose;
  }

  function copyStageFor(state){return state.mode==='transition'&&state.q>.54?state.next:state.stage;}

  function updateCopy(state){
    const overview=state.mode==='overview'&&state.q>.62;
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
    if(key===activeLightingKey)return;
    activeLightingKey=key;
    const focus=state.mode==='overview'?new THREE.Vector3(0,1.4,0):routePositions[stage].clone().add(new THREE.Vector3(0,1.4,0));
    if(keyLight){keyLight.position.copy(focus).add(new THREE.Vector3(profile.compact?5.5:7.5,profile.compact?7.5:9.5,profile.compact?5.6:7.2));keyLight.target.position.copy(focus);keyLight.target.updateMatrixWorld();}
    if(rimLight)rimLight.position.copy(focus).add(new THREE.Vector3(-5.2,5.1,-5.5));
    if(fillLight)fillLight.position.copy(focus).add(new THREE.Vector3(4.2,3.5,4.8));
    if(renderer&&renderer.shadowMap&&renderer.shadowMap.enabled)renderer.shadowMap.needsUpdate=true;
  }

  function animateScene(now,state,dt){
    const t=now*.001,active=copyStageFor(state);
    dataPackets.forEach((p,i)=>{const u=(t*p.userData.speed+p.userData.offset)%1;p.position.copy(routeCurve.getPointAt(u));p.position.y+=Math.sin(t*3+i)*.022;p.material.opacity=.52+.42*Math.sin(Math.PI*u);});
    ambientRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.018:-.018);ring.material.opacity=.025+(i===active?.045:.012)+Math.sin(t*.55+i)*.006;});
    if(dust){dust.rotation.y=Math.sin(t*.06)*.014;dust.position.y=Math.sin(t*.13)*.045;}
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const isActive=i===active;
      if(state.mode!=='overview'||state.q<.22)factory&&factory.animate&&factory.animate(s.detail,t+i*.17);
      s.arch.rotation.z+=dt*(i%2?.018:-.018);
      if(s.scanner.group.visible){const phase=(t*.24+i*.17)%1;const y=.45+phase*3.55;s.scanner.group.position.y=y;s.scanner.ring.material.opacity=(1-Math.abs(phase-.5)*2)*.18;s.scanner.glow.material.opacity=(1-Math.abs(phase-.5)*2)*.045;}
      s.platform.children.forEach(child=>{if(child.userData&&Number.isFinite(child.userData.phase))child.material.opacity=.55+.3*Math.sin(t*1.8+child.userData.phase);});
      s.accent.intensity*=.99+.01*Math.sin(t*1.4+i);
      if(isActive&&now-screenUpdateAt>0)drawScreen(s.screen,now,true,false);
    });
    if(now-screenUpdateAt>92){screenUpdateAt=now;stations.forEach((s,i)=>{if(s.wrapper.visible&&i!==active)drawScreen(s.screen,now,false,state.mode==='overview');});}
    updateLighting(active,state);
  }

  function readProgress(){
    const rect=track.getBoundingClientRect();
    const span=Math.max(1,track.offsetHeight-sticky.clientHeight);
    targetProgress=clamp(-rect.top/span);
  }

  function scheduleProgress(){if(progressQueued)return;progressQueued=true;requestAnimationFrame(()=>{progressQueued=false;readProgress();startLoop();});}

  function resize(){
    resizeQueued=false;if(!renderer||!camera)return;
    const old=profile;profile=getProfile();configureLayouts();
    // Keep fixed route positions in sync after profile changes.
    stations.forEach((s,i)=>{s.baseRoute.copy(routePositions[i]);});
    if(routeCurve){
      routeCurve.points=routePositions.map((p,i)=>p.clone().add(new THREE.Vector3(0,.32,i%2?.15:-.15)));
      const segments=profile.low?120:180;
      if(routeTube){routeTube.geometry.dispose&&routeTube.geometry.dispose();routeTube.geometry=new THREE.TubeGeometry(routeCurve,segments,.028,6,false);}
      if(routeGlow){routeGlow.geometry.dispose&&routeGlow.geometry.dispose();routeGlow.geometry=new THREE.TubeGeometry(routeCurve,segments,.085,8,false);}
    }
    renderRatio=qualityRatio(profile);renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);
    camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    buildCameraCache();readProgress();progress=targetProgress;
    const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    if(old&&(old.compact!==profile.compact||old.low!==profile.low))stations.forEach(s=>{s.lod=null;});
  }

  function scheduleResize(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);}

  function render(now){
    rafId=0;if(!renderer||!scene||!camera||!visible||!pageVisible)return;
    const dt=lastTime?Math.min(.04,(now-lastTime)/1000):1/60;lastTime=now;
    const lambda=profile.compact?16.5:14.5;
    progress=reduced?targetProgress:damp(progress,targetProgress,lambda,dt);
    if(Math.abs(progress-targetProgress)<.000018)progress=targetProgress;
    const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);if(Math.abs(camera.fov-pose.fov)>.0015){camera.fov=pose.fov;camera.updateProjectionMatrix();}}
    if(copyBox)copyBox.classList.toggle('in-transit',state.mode==='transition');updateCopy(state);animateScene(now,state,dt);
    if(now-styleUpdateAt>32){styleUpdateAt=now;sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');if(indicator)indicator.style.opacity=progress>.93?'0':'1';}
    renderer.render(scene,camera);
    if(!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
    rafId=requestAnimationFrame(render);
  }

  function startLoop(){if(!rafId&&initialized&&visible&&pageVisible){lastTime=0;rafId=requestAnimationFrame(render);}}
  function stopLoop(){if(rafId){cancelAnimationFrame(rafId);rafId=0;}}

  function resetCanvas(){
    if(!canvas||!canvas.isConnected)return;
    const clone=canvas.cloneNode(false);clone.width=1;clone.height=1;clone.style.pointerEvents='none';clone.style.touchAction='pan-y';canvas.replaceWith(clone);canvas=clone;
  }

  function bindCanvasLoss(){
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();sticky.classList.remove('model-active');if(fallback)fallback.style.opacity='.38';stopLoop();
      try{renderer&&renderer.dispose&&renderer.dispose();}catch(_){}
      renderer=scene=camera=root=null;stations=[];stationBoxes=[];initialized=false;initQueued=false;resetCanvas();setTimeout(queueInit,700);
    },{once:true});
  }

  function bindGlobal(){
    if(bound)return;bound=true;
    const io=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting);
      if(visible){readProgress();scheduleResize();startLoop();}else stopLoop();
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
    initialized=true;initQueued=false;initAttempts+=1;profile=getProfile();configureLayouts();
    renderer=createRenderer();
    if(!renderer){initialized=false;if(fallback)fallback.style.opacity='.5';resetCanvas();if(initAttempts<3)setTimeout(queueInit,700*initAttempts);return;}
    renderRatio=qualityRatio(profile);
    if(Q)Q.configureRenderer(renderer,{exposure:1.08,pixelCap:renderRatio});
    else{renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;}
    renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);renderer.setClearColor(0x070605,1);renderer.sortObjects=true;
    renderer.shadowMap.enabled=!profile.compact&&!profile.low&&profile.w>=1024;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x070605);scene.fog=new THREE.FogExp2(0x070605,profile.compact?.0048:.0038);if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);
    scene.add(new THREE.HemisphereLight(0xf3e4c7,0x080706,profile.compact?.94:1.02));
    keyLight=new THREE.DirectionalLight(0xffe4b5,profile.compact?1.12:1.28);keyLight.position.set(7,10,7);keyLight.castShadow=renderer.shadowMap.enabled;scene.add(keyLight);scene.add(keyLight.target);
    if(keyLight.castShadow){const size=profile.high?1536:1024;keyLight.shadow.mapSize.set(size,size);keyLight.shadow.camera.left=-10;keyLight.shadow.camera.right=10;keyLight.shadow.camera.top=10;keyLight.shadow.camera.bottom=-10;keyLight.shadow.bias=-.00025;keyLight.shadow.normalBias=.026;keyLight.shadow.radius=2.4;}
    rimLight=new THREE.PointLight(0x72d2bf,profile.compact?.48:.64,26,1.9);scene.add(rimLight);
    fillLight=new THREE.PointLight(0xe3b35c,profile.compact?.40:.54,24,2);scene.add(fillLight);

    buildEnvironment();buildStations();
    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.08,240);scene.add(camera);
    buildCameraCache();
    const state=timeline(0);applyState(state);const pose=evaluateCamera(state);
    if(pose){camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();}
    bindCanvasLoss();bindGlobal();readProgress();progress=targetProgress;if(visible)startLoop();
  }

  function queueInit(){
    if(initialized||initQueued)return;initQueued=true;
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:true}}));
    setTimeout(()=>{
      if(initialized)return;
      try{init();}
      catch(error){console.error('[By Meli] Connected V16 failed:',error);initialized=false;initQueued=false;if(fallback)fallback.style.opacity='.48';if(initAttempts<3)setTimeout(queueInit,760);}
    },200);
  }

  function auditAt(value){
    if(!initialized||!camera)return {initialized:false};
    progress=targetProgress=clamp(value);const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const frame=safeFrame(),items=[];
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const box=transformedBox(i,s.wrapper.position,s.wrapper.scale.x);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
      boxCorners(box).forEach(p=>{const n=p.clone().project(camera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
      const mostlyVisible=!behind&&maxX>=-1.08&&minX<=1.08&&maxY>=-1.08&&minY<=1.08;
      const intended=state.mode==='hold'||state.mode==='overview'&&state.q>.78;
      items.push({i,minX,maxX,minY,maxY,behind,mostlyVisible,inside:!behind&&minX>=frame.left-.04&&maxX<=frame.right+.04&&minY>=frame.bottom-.04&&maxY<=frame.top+.04,intended});
    });
    return {initialized:true,progress,state,frame,profile:{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio},camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,fov:camera.fov},target:{x:desiredTarget.x,y:desiredTarget.y,z:desiredTarget.z},items};
  }

  window.ByMeliConnectedV16={forceInit:queueInit,auditAt,getState:()=>auditAt(progress)};
  const bootstrap=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){bootstrap.disconnect();queueInit();}},{rootMargin:'460px 0px',threshold:0});bootstrap.observe(track);
  setTimeout(()=>{if(!initialized&&!initQueued){const r=track.getBoundingClientRect();if(r.top<innerHeight*3&&r.bottom>-innerHeight)queueInit();}},1100);
})();
