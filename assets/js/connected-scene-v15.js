(function(){
  'use strict';

  let canvas=document.getElementById('connectedCanvas');
  const track=document.getElementById('connectedTrack');
  if(!canvas||!track||!window.THREE)return;

  const THREE=window.THREE;
  const sticky=canvas.closest('.connected-sticky');
  const fallback=sticky?.querySelector('.connected-fallback');
  const copyBox=sticky?.querySelector('.connected-copy');
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

  const HOLD=.105;
  const TRANSITION=.045;
  const OVERVIEW=.145;
  const SERVICE_BLOCK=HOLD+TRANSITION;
  const OVERVIEW_START=HOLD*6+TRANSITION*5;

  let renderer=null,scene=null,camera=null,root=null;
  let profile=null,stations=[],stationBoxes=[],overviewPositions=[];
  let cameraCache={holds:[],transitions:[],overview:[]};
  let floor=null,grid=null,networkGroup=null,portalRings=[],dataPackets=[],dust=null;
  let keyLight=null,rimLight=null,fillLight=null;
  let initialized=false,initQueued=false,initAttempts=0,bound=false;
  let visible=false,pageVisible=!document.hidden,rafId=0,lastTime=0;
  let targetProgress=0,progress=0,progressQueued=false,resizeQueued=false;
  let activeCopyStage=-1,overviewCopy=false,copyToken=0;
  let screenUpdateAt=0;
  let renderRatio=1;

  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpC=new THREE.Vector3();
  const fitCamera=new THREE.PerspectiveCamera(40,1,.08,180);

  function getProfile(){
    const w=Math.max(1,Math.round(sticky.clientWidth||innerWidth));
    const h=Math.max(1,Math.round(sticky.clientHeight||innerHeight));
    const aspect=w/h;
    const compact=w<760||(coarse&&w<900);
    const tablet=!compact&&w<1180;
    const portrait=aspect<.88;
    const landscape=aspect>1.45;
    const short=h<620;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const low=memory<=3||cores<=4;
    const high=memory>=6&&cores>=6;
    const tier=low?'low':(high?'high':'balanced');
    const fov=compact?(portrait?41:39):(tablet?(portrait?39:38):37);
    return {w,h,aspect,compact,tablet,portrait,landscape,short,memory,cores,low,high,tier,fov};
  }

  function qualityRatio(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    let cap,budget;
    if(p.compact){
      cap=p.high?2.15:(p.low?1.38:1.78);
      budget=p.high?2600000:(p.low?1150000:1850000);
    }else if(p.tablet){
      cap=p.high?2.05:(p.low?1.35:1.72);
      budget=p.high?3900000:(p.low?1900000:2900000);
    }else{
      cap=p.high?2.0:(p.low?1.35:1.68);
      budget=p.high?5200000:(p.low?2500000:3850000);
    }
    return Math.max(1,Math.min(dpr,cap,Math.sqrt(budget/Math.max(1,p.w*p.h))));
  }

  function configureOverview(){
    if(profile.compact&&profile.portrait){
      overviewPositions=[
        new THREE.Vector3(-3.15,0,5.15),new THREE.Vector3(3.15,0,5.15),
        new THREE.Vector3(-3.15,0,0),new THREE.Vector3(3.15,0,0),
        new THREE.Vector3(-3.15,0,-5.15),new THREE.Vector3(3.15,0,-5.15)
      ];
    }else{
      overviewPositions=[
        new THREE.Vector3(-5.45,0,3.9),new THREE.Vector3(0,0,3.9),new THREE.Vector3(5.45,0,3.9),
        new THREE.Vector3(-5.45,0,-3.9),new THREE.Vector3(0,0,-3.9),new THREE.Vector3(5.45,0,-3.9)
      ];
    }
  }

  function createRenderer(){
    try{
      return new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:profile.low?'default':'high-performance',precision:profile.low?'mediump':'highp',stencil:false,preserveDrawingBuffer:false,depth:true});
    }catch(_){
      try{return new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'default',precision:'mediump',stencil:false,preserveDrawingBuffer:false,depth:true});}
      catch(__){return null;}
    }
  }

  function makeLiveScreen(i){
    const c=document.createElement('canvas');
    c.width=profile.compact?768:1152;
    c.height=profile.compact?432:648;
    const ctx=c.getContext('2d');
    const tex=new THREE.CanvasTexture(c);
    tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
    tex.minFilter=THREE.LinearMipmapLinearFilter;
    tex.magFilter=THREE.LinearFilter;
    tex.generateMipmaps=true;
    tex.encoding=THREE.sRGBEncoding;
    tex.needsUpdate=true;
    return {canvas:c,ctx,texture:tex,last:-1,index:i};
  }

  function drawScreen(screen,time,active,overview){
    const bucket=Math.floor(time/(overview?190:100));
    if(screen.last===bucket)return;
    screen.last=bucket;
    const c=screen.canvas,x=screen.ctx,w=c.width,h=c.height;
    const accent=screen.index%2?'#71d2c0':'#e8bd65';
    const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#06100f');g.addColorStop(.58,'#14302d');g.addColorStop(1,'#1a1108');
    x.fillStyle=g;x.fillRect(0,0,w,h);
    const glow=x.createRadialGradient(w*.74,h*.25,4,w*.74,h*.25,w*.7);glow.addColorStop(0,screen.index%2?'rgba(102,213,193,.34)':'rgba(232,187,95,.34)');glow.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=glow;x.fillRect(0,0,w,h);
    x.strokeStyle='rgba(240,217,171,.11)';x.lineWidth=1;for(let i=0;i<12;i++){x.beginPath();x.moveTo(i*w/11,0);x.lineTo(i*w/11,h);x.stroke()}for(let i=0;i<7;i++){x.beginPath();x.moveTo(0,i*h/6);x.lineTo(w,i*h/6);x.stroke()}
    x.strokeStyle='rgba(238,207,142,.42)';x.lineWidth=Math.max(2,w/500);x.strokeRect(w*.055,h*.075,w*.89,h*.85);
    x.fillStyle='#fff7e8';x.font=`800 ${Math.round(h*.13)}px Inter,Arial,sans-serif`;x.fillText('BY MELI',w*.085,h*.22);
    x.fillStyle=accent;x.font=`600 ${Math.round(h*.045)}px monospace`;x.fillText(`${String(screen.index+1).padStart(2,'0')} / ${serviceCodes[screen.index]}`,w*.09,h*.31);
    x.fillStyle='rgba(255,247,232,.72)';x.font=`500 ${Math.round(h*.035)}px Inter,Arial,sans-serif`;x.fillText(active?'LIVE PRODUCTION SYSTEM':'CONNECTED DELIVERY NETWORK',w*.09,h*.40);
    const phase=(time*.00036+screen.index*.13)%1;
    x.lineWidth=Math.max(2,w/620);x.strokeStyle=accent;x.beginPath();
    for(let k=0;k<64;k++){
      const px=w*(.09+.82*k/63),wave=Math.sin(k*.33+phase*Math.PI*2)*.055+Math.sin(k*.1+screen.index)*.025;
      const py=h*(.67-wave);if(k===0)x.moveTo(px,py);else x.lineTo(px,py);
    }x.stroke();
    for(let k=0;k<18;k++){x.fillStyle=k/18<phase?accent:'rgba(255,255,255,.16)';x.fillRect(w*(.09+k*.045),h*.79,w*.028,h*.012)}
    screen.texture.needsUpdate=true;
  }

  function makePlatform(materials,i){
    const g=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(6.2,6.45,.24,profile.low?56:96),new THREE.MeshStandardMaterial({color:0x11100d,roughness:.86,metalness:.12,envMapIntensity:.55}));
    base.position.y=.12;base.receiveShadow=Boolean(renderer.shadowMap.enabled);g.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(5.48,.045,10,profile.low?80:140),new THREE.MeshBasicMaterial({color:i%2?0x70d0bd:0xe8be67,transparent:true,opacity:.72,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    ring.rotation.x=Math.PI/2;ring.position.y=.255;g.add(ring);
    const inner=new THREE.Mesh(new THREE.RingGeometry(4.25,5.18,profile.low?64:112),new THREE.MeshBasicMaterial({color:i%2?0x244e47:0x4a3518,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false}));
    inner.rotation.x=-Math.PI/2;inner.position.y=.251;g.add(inner);
    if(Q)Q.addContactShadow(g,renderer,5.25,profile.compact?.42:.5,.265);
    return g;
  }

  function buildStations(){
    factory?.setShadowEnabled?.(Boolean(renderer.shadowMap.enabled));
    stations=[];stationBoxes=[];
    serviceTypes.forEach((type,i)=>{
      const wrapper=new THREE.Group();wrapper.name=`connected-station-${type}`;
      const materials=factory?factory.createMaterials(renderer):null;
      const screen=makeLiveScreen(i);
      if(materials?.screen){const old=materials.screen.map;materials.screen.map=screen.texture;materials.screen.emissiveMap=screen.texture;materials.screen.emissiveIntensity=1.28;materials.screen.needsUpdate=true;if(old&&old!==screen.texture)old.dispose?.();}
      wrapper.add(makePlatform(materials,i));
      const detail=new THREE.Group();detail.name='detail';
      if(factory?.factories?.[type])factory.factories[type](detail,materials);
      detail.scale.setScalar(.82);detail.position.y=.30;wrapper.add(detail);
      const accent=new THREE.PointLight(i%2?0x78d7c5:0xf0c66c,1.1,17,2);accent.position.set(i%2?3.2:-3.2,4.4,3.2);wrapper.add(accent);
      const arch=new THREE.Mesh(new THREE.TorusGeometry(5.9,.022,6,profile.low?90:160,Math.PI*1.38),new THREE.MeshBasicMaterial({color:i%2?0x6dcbbb:0xe6b85e,transparent:true,opacity:.17,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      arch.rotation.set(Math.PI/2,0,-Math.PI*.19);arch.position.set(0,1.75,-1.65);wrapper.add(arch);
      root.add(wrapper);wrapper.updateMatrixWorld(true);
      const meshes=[],localLights=[];
      detail.traverse(o=>{
        if(o.isMesh&&o.geometry){
          o.geometry.computeBoundingBox?.();
          const size=new THREE.Vector3();o.geometry.boundingBox?.getSize(size);
          o.userData.connectedSize=Math.max(size.x,size.y,size.z)*Math.max(o.scale.x,o.scale.y,o.scale.z);
          meshes.push(o);
        }
        if(o.isLight)localLights.push(o);
      });
      const box=new THREE.Box3().setFromObject(detail);
      box.min.sub(new THREE.Vector3(.25,.07,.25));box.max.add(new THREE.Vector3(.25,.22,.25));
      stationBoxes.push(box.clone());
      stations.push({wrapper,detail,accent,arch,materials,screen,meshes,localLights,lod:null});
    });
  }

  function buildEnvironment(){
    const floorMat=new THREE.MeshStandardMaterial({color:0x0d0c0a,roughness:.92,metalness:.06,envMapIntensity:.34});
    floor=new THREE.Mesh(new THREE.PlaneGeometry(44,44),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=Boolean(renderer.shadowMap.enabled);root.add(floor);
    grid=new THREE.GridHelper(42,42,0x795522,0x211a13);grid.position.y=.006;grid.material.transparent=true;grid.material.opacity=.07;root.add(grid);

    networkGroup=new THREE.Group();networkGroup.position.set(0,2.2,-5.8);root.add(networkGroup);
    portalRings=[];
    [4.2,5.3,6.4].forEach((r,k)=>{
      const mat=new THREE.MeshBasicMaterial({color:k%2?0x68c8b7:0xe7bb63,transparent:true,opacity:.08+(2-k)*.035,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
      const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.025,6,profile.low?90:160),mat);ring.rotation.set(Math.PI/2.2,0,k*.42);networkGroup.add(ring);portalRings.push(ring);
    });
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6,.35,1.6),new THREE.Vector3(-3.1,.48,-.2),new THREE.Vector3(0,.4,1.1),new THREE.Vector3(3.1,.48,-.2),new THREE.Vector3(6,.35,1.6)
    ],false,'catmullrom',.35);
    const line=new THREE.Mesh(new THREE.TubeGeometry(curve,profile.low?90:150,.025,6,false),new THREE.MeshBasicMaterial({color:0xe8c16c,transparent:true,opacity:.42,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));root.add(line);
    dataPackets=[];
    const packetCount=profile.low?5:(profile.compact?8:12);
    for(let i=0;i<packetCount;i++){
      const p=new THREE.Mesh(new THREE.SphereGeometry(.055,profile.low?10:16,profile.low?8:12),new THREE.MeshBasicMaterial({color:i%2?0x73d4c2:0xf0c870,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      p.userData={curve,offset:i/packetCount,speed:.045+(i%3)*.004};root.add(p);dataPackets.push(p);
    }
    const count=profile.low?50:(profile.compact?85:130),positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*20;positions[i*3+1]=.5+Math.random()*7;positions[i*3+2]=(Math.random()-.5)*15;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const dot=document.createElement('canvas');dot.width=dot.height=40;const dx=dot.getContext('2d');const dg=dx.createRadialGradient(20,20,1,20,20,19);dg.addColorStop(0,'rgba(255,242,209,.9)');dg.addColorStop(.35,'rgba(229,185,91,.34)');dg.addColorStop(1,'rgba(0,0,0,0)');dx.fillStyle=dg;dx.fillRect(0,0,40,40);
    dust=new THREE.Points(geo,new THREE.PointsMaterial({map:new THREE.CanvasTexture(dot),size:profile.compact?.05:.065,transparent:true,opacity:.2,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));dust.frustumCulled=false;root.add(dust);
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
    if(profile.compact&&profile.portrait)return {left:-.90,right:.90,bottom:-.24,top:.88};
    if(profile.compact&&profile.landscape)return rtl?{left:-.93,right:.16,bottom:-.78,top:.84}:{left:-.16,right:.93,bottom:-.78,top:.84};
    if(profile.tablet)return rtl?{left:-.94,right:.16,bottom:-.78,top:.86}:{left:-.16,right:.94,bottom:-.78,top:.86};
    return rtl?{left:-.95,right:.15,bottom:-.80,top:.88}:{left:-.15,right:.95,bottom:-.80,top:.88};
  }

  function cameraPosition(target,yaw,elev,distance,out=new THREE.Vector3()){
    const horizontal=Math.cos(elev)*distance;
    return out.set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
  }

  function projectedBounds(box,target,yaw,elev,distance,fov){
    fitCamera.fov=fov;fitCamera.aspect=profile.aspect;fitCamera.near=.08;fitCamera.far=180;fitCamera.updateProjectionMatrix();
    fitCamera.position.copy(cameraPosition(target,yaw,elev,distance,tmpC));fitCamera.up.set(0,1,0);fitCamera.lookAt(target);fitCamera.updateMatrixWorld(true);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
    boxCorners(box).forEach(p=>{const n=p.clone().project(fitCamera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
    return {minX,minY,maxX,maxY,behind};
  }

  function fitDistance(box,target,yaw,elev,fov,padding){
    const safe=safeFrame();const frame={left:safe.left+padding,right:safe.right-padding,bottom:safe.bottom+padding,top:safe.top-padding};
    const fits=d=>{const b=projectedBounds(box,target,yaw,elev,d,fov);return !b.behind&&b.minX>=frame.left&&b.maxX<=frame.right&&b.minY>=frame.bottom&&b.maxY<=frame.top;};
    let low=2,high=6;while(!fits(high)&&high<150)high*=1.28;
    for(let i=0;i<20;i++){const mid=(low+high)*.5;if(fits(mid))high=mid;else low=mid;}
    return high*(profile.compact?1.018:1.012);
  }

  function framedPose(box,yaw,elev,fov,padding=.03){
    const safe=safeFrame();const desiredX=(safe.left+safe.right)*.5,desiredY=(safe.bottom+safe.top)*.5;
    const target=new THREE.Vector3();box.getCenter(target);
    let distance=0;
    for(let pass=0;pass<7;pass++){
      distance=fitDistance(box,target,yaw,elev,fov,padding);
      const b=projectedBounds(box,target,yaw,elev,distance,fov);
      const currentX=(b.minX+b.maxX)*.5,currentY=(b.minY+b.maxY)*.5;
      const forward=target.clone().sub(cameraPosition(target,yaw,elev,distance,tmpA)).normalize();
      const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
      const up=new THREE.Vector3().crossVectors(right,forward).normalize();
      const halfV=Math.tan(THREE.MathUtils.degToRad(fov)*.5)*distance,halfH=halfV*profile.aspect;
      target.addScaledVector(right,-(desiredX-currentX)*halfH);
      target.addScaledVector(up,-(desiredY-currentY)*halfV);
    }
    distance=fitDistance(box,target,yaw,elev,fov,padding);
    return {pos:cameraPosition(target,yaw,elev,distance,new THREE.Vector3()),target,distance,fov};
  }

  function stageYaw(i){
    const mobile=[.58,-.54,.61,-.50,.55,-.60];
    const tablet=[.64,-.59,.67,-.56,.61,-.64];
    const desktop=[.70,-.64,.72,-.60,.66,-.68];
    return (profile.compact?mobile:(profile.tablet?tablet:desktop))[i];
  }

  function stageElevation(i){
    const mobile=[.205,.215,.19,.205,.19,.215];
    const tablet=[.22,.23,.205,.22,.21,.225];
    const desktop=[.235,.245,.22,.235,.225,.24];
    return (profile.compact?mobile:(profile.tablet?tablet:desktop))[i];
  }

  function holdPose(i,local){
    const box=transformedBox(i,new THREE.Vector3(),1);
    const drift=(smoother(local)-.5)*(profile.compact?.055:.075)*(i%2?-1:1);
    return framedPose(box,stageYaw(i)+drift,stageElevation(i),profile.fov,profile.compact?.026:.024);
  }

  function transitionPlacement(i,q){
    const e=smoother(q),dir=i%2?1:-1;
    const outE=smoother(clamp(q/.92));
    const inE=smoother(clamp((q-.08)/.92));
    return {
      outPos:new THREE.Vector3(dir*2.35*outE,0,1.05*outE),
      inPos:new THREE.Vector3(-dir*2.35*(1-inE),0,-1.05*(1-inE)),
      outScale:lerp(1,.82,outE),
      inScale:lerp(.82,1,inE),
      showOut:q<.965,
      showIn:q>.035,
      ease:e
    };
  }

  function transitionPose(i,q){
    const p=transitionPlacement(i,q),union=new THREE.Box3();
    if(p.showOut)union.union(transformedBox(i,p.outPos,p.outScale));
    if(p.showIn)union.union(transformedBox(i+1,p.inPos,p.inScale));
    const neutral=(i%2?-.07:.07);
    const yaw=q<.5?angleLerp(stageYaw(i),neutral,smoother(q*2)):angleLerp(neutral,stageYaw(i+1),smoother((q-.5)*2));
    const elev=lerp(stageElevation(i),stageElevation(i+1),smoother(q))+(Math.sin(Math.PI*q)*(profile.compact?.015:.022));
    const fov=profile.fov+Math.sin(Math.PI*q)*(profile.compact?1.4:1.8);
    return framedPose(union,yaw,elev,fov,profile.compact?.034:.03);
  }

  function overviewPlacement(i,q){
    const delay=i===5?0:(.06+Math.abs(5-i)*.035);
    const e=smoother(clamp((q-delay)/Math.max(.001,1-delay)));
    const start=i===5?new THREE.Vector3():overviewPositions[i].clone().multiplyScalar(.18);
    const pos=start.lerp(overviewPositions[i],e);
    const targetScale=profile.compact&&profile.portrait?.43:.47;
    const scale=i===5?lerp(1,targetScale,e):lerp(.06,targetScale,e);
    return {pos,scale,reveal:i===5?1:e};
  }

  function overviewPose(q){
    const union=new THREE.Box3();
    stations.forEach((_,i)=>{const p=overviewPlacement(i,q);if(p.reveal>.025)union.union(transformedBox(i,p.pos,p.scale));});
    if(union.isEmpty())union.copy(transformedBox(5,new THREE.Vector3(),1));
    const e=smoother(q);
    const yaw=angleLerp(stageYaw(5),profile.compact&&profile.portrait?.07:.32,e);
    const elev=lerp(stageElevation(5),profile.compact&&profile.portrait?.36:.305,e);
    return framedPose(union,yaw,elev,profile.fov+(profile.compact?.65:.4),profile.compact?.045:.04);
  }

  function samplePose(samples,u){
    if(!samples.length)return null;
    if(samples.length===1)return samples[0];
    const scaled=clamp(u)*(samples.length-1),i=Math.min(samples.length-2,Math.floor(scaled)),t=scaled-i;
    const a=samples[i],b=samples[i+1];
    return {pos:a.pos.clone().lerp(b.pos,t),target:a.target.clone().lerp(b.target,t),fov:lerp(a.fov,b.fov,t)};
  }

  function buildCameraCache(){
    cameraCache={holds:[],transitions:[],overview:[]};
    const holdCount=profile.low?9:13;
    const transitionCount=profile.low?17:(profile.compact?23:27);
    const overviewCount=profile.low?23:(profile.compact?29:35);
    for(let i=0;i<6;i++){
      const list=[];for(let k=0;k<holdCount;k++)list.push(holdPose(i,k/(holdCount-1)));cameraCache.holds.push(list);
      if(i<5){const bridge=[];for(let k=0;k<transitionCount;k++)bridge.push(transitionPose(i,k/(transitionCount-1)));cameraCache.transitions.push(bridge);}
    }
    for(let k=0;k<overviewCount;k++)cameraCache.overview.push(overviewPose(k/(overviewCount-1)));
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
    const threshold=profile.compact?(profile.low?.82:.68):(profile.tablet?.56:.46);
    station.meshes.forEach(mesh=>{mesh.visible=!overview||(mesh.userData.connectedSize||1)>=threshold;});
    station.localLights.forEach(light=>{light.visible=!overview;});
  }

  function applyState(state){
    stations.forEach((s,i)=>{s.wrapper.visible=false;s.detail.visible=false;s.accent.intensity=0;});
    if(state.mode==='hold'){
      const s=stations[state.stage];setStationLOD(s,'full');s.wrapper.visible=true;s.detail.visible=true;s.wrapper.position.set(0,0,0);s.wrapper.scale.setScalar(1);s.accent.intensity=1.18;
    }else if(state.mode==='transition'){
      const p=transitionPlacement(state.stage,state.q),out=stations[state.stage],incoming=stations[state.next];
      setStationLOD(out,'full');setStationLOD(incoming,'full');
      if(p.showOut){out.wrapper.visible=true;out.detail.visible=true;out.wrapper.position.copy(p.outPos);out.wrapper.scale.setScalar(p.outScale);out.accent.intensity=lerp(1.18,.32,p.ease);}
      if(p.showIn){incoming.wrapper.visible=true;incoming.detail.visible=true;incoming.wrapper.position.copy(p.inPos);incoming.wrapper.scale.setScalar(p.inScale);incoming.accent.intensity=lerp(.32,1.18,p.ease);}
    }else{
      stations.forEach((s,i)=>{const p=overviewPlacement(i,state.q);setStationLOD(s,state.q<.22&&i===5?'full':'overview');s.wrapper.visible=p.reveal>.025;s.detail.visible=s.wrapper.visible;s.wrapper.position.copy(p.pos);s.wrapper.scale.setScalar(p.scale);s.accent.intensity=s.wrapper.visible?lerp(.12,.32,p.reveal):0;});
    }
    stations.forEach(s=>s.wrapper.updateMatrixWorld());
  }

  function evaluateCamera(state){
    let pose;
    if(state.mode==='hold')pose=samplePose(cameraCache.holds[state.stage]||[],state.local)||holdPose(state.stage,state.local);
    else if(state.mode==='transition')pose=samplePose(cameraCache.transitions[state.stage]||[],state.q)||transitionPose(state.stage,state.q);
    else pose=samplePose(cameraCache.overview,state.q)||overviewPose(state.q);
    desiredPos.copy(pose.pos);desiredTarget.copy(pose.target);
    return pose;
  }

  function copyStageFor(state){
    if(state.mode==='transition'&&state.q>.56)return state.next;
    return state.stage;
  }

  function updateCopy(state){
    const overview=state.mode==='overview'&&state.q>.66;
    const stage=copyStageFor(state);
    if(stage===activeCopyStage&&overview===overviewCopy)return;
    activeCopyStage=stage;overviewCopy=overview;
    const lang=document.documentElement.lang==='ar'?'ar':'en',token=++copyToken;
    copyBox?.classList.add('switching');
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
      requestAnimationFrame(()=>{if(token===copyToken)copyBox?.classList.remove('switching');});
    });
  }

  function animateScene(now,state,dt){
    const t=now*.001;
    portalRings.forEach((ring,i)=>{ring.rotation.z+=dt*(i%2?.035:-.03);ring.material.opacity=.08+(2-i)*.035+Math.sin(t*.7+i)*.012;});
    dataPackets.forEach((p,i)=>{const u=(t*p.userData.speed+p.userData.offset)%1;p.position.copy(p.userData.curve.getPointAt(u));p.position.y=.38+Math.sin(t*3+i)*.025;p.material.opacity=.62+.34*Math.sin(Math.PI*u);});
    if(dust){dust.rotation.y=Math.sin(t*.08)*.024;dust.position.y=Math.sin(t*.14)*.06;}
    stations.forEach((s,i)=>{if(!s.wrapper.visible)return;if(state.mode!=='overview'||state.q<.24)factory?.animate?.(s.detail,t+i*.17);s.arch.rotation.z+=dt*(i%2?.025:-.025);});
    if(now-screenUpdateAt>80){screenUpdateAt=now;stations.forEach((s,i)=>{if(s.wrapper.visible)drawScreen(s.screen,now,i===copyStageFor(state),state.mode==='overview');});}
    const focus=state.mode==='overview'?new THREE.Vector3(0,1.4,0):(stations[copyStageFor(state)]?.wrapper.position||new THREE.Vector3());
    const a=1-Math.exp(-5.5*dt);
    if(keyLight){tmpA.copy(focus).add(new THREE.Vector3(profile.compact?5.2:7.2,profile.compact?7.1:9.5,profile.compact?5.0:6.8));keyLight.position.lerp(tmpA,a);}
    if(rimLight){tmpB.copy(focus).add(new THREE.Vector3(profile.compact?-4.8:-6.8,profile.compact?4.9:6.2,-5.2));rimLight.position.lerp(tmpB,a);}
    if(fillLight){tmpC.copy(focus).add(new THREE.Vector3(0,profile.compact?3.2:4.3,4.5));fillLight.position.lerp(tmpC,a);}
  }

  function readProgress(){
    const rect=track.getBoundingClientRect();
    const span=Math.max(1,track.offsetHeight-sticky.clientHeight);
    targetProgress=clamp(-rect.top/span);
  }

  function scheduleProgress(){
    if(progressQueued)return;progressQueued=true;
    requestAnimationFrame(()=>{progressQueued=false;readProgress();});
  }

  function resize(){
    resizeQueued=false;if(!renderer||!camera)return;
    profile=getProfile();configureOverview();
    renderRatio=qualityRatio(profile);renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);
    camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    buildCameraCache();
    readProgress();progress=targetProgress;
    const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);camera.position.copy(desiredPos);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();
  }

  function scheduleResize(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);}

  function render(now){
    rafId=0;if(!renderer||!scene||!camera||!visible||!pageVisible)return;
    const dt=lastTime?Math.min(.04,(now-lastTime)/1000):1/60;lastTime=now;
    progress=reduced?targetProgress:damp(progress,targetProgress,profile.compact?12.5:11.5,dt);
    if(Math.abs(progress-targetProgress)<.00002)progress=targetProgress;
    const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);
    if(Math.abs(camera.fov-pose.fov)>.002){camera.fov=pose.fov;camera.updateProjectionMatrix();}
    copyBox?.classList.toggle('in-transit',state.mode==='transition');updateCopy(state);animateScene(now,state,dt);
    sticky.style.setProperty('--connected-progress',progress.toFixed(4));sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');
    if(indicator)indicator.style.opacity=progress>.94?'0':'1';
    renderer.render(scene,camera);
    if(!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
    rafId=requestAnimationFrame(render);
  }

  function startLoop(){if(!rafId&&initialized&&visible&&pageVisible){lastTime=0;rafId=requestAnimationFrame(render);}}
  function stopLoop(){if(rafId){cancelAnimationFrame(rafId);rafId=0;}}

  function resetCanvas(){
    if(!canvas?.isConnected)return;
    const clone=canvas.cloneNode(false);clone.width=1;clone.height=1;clone.style.pointerEvents='none';clone.style.touchAction='pan-y';canvas.replaceWith(clone);canvas=clone;
  }

  function bindCanvasLoss(){
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();sticky.classList.remove('model-active');if(fallback)fallback.style.opacity='.34';stopLoop();
      try{renderer?.dispose?.();}catch(_){}
      renderer=scene=camera=root=null;stations=[];stationBoxes=[];initialized=false;initQueued=false;resetCanvas();setTimeout(queueInit,620);
    },{once:true});
  }

  function bindGlobal(){
    if(bound)return;bound=true;
    const io=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting);
      if(visible){readProgress();scheduleResize();startLoop();}else stopLoop();
    },{rootMargin:'240px 0px',threshold:0});io.observe(sticky);
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
    if(!renderer){initialized=false;if(fallback)fallback.style.opacity='.48';resetCanvas();if(initAttempts<3)setTimeout(queueInit,700*initAttempts);return;}
    renderRatio=qualityRatio(profile);
    if(Q)Q.configureRenderer(renderer,{exposure:1.12,pixelCap:renderRatio});
    else{renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;}
    renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);renderer.setClearColor(0x070605,1);renderer.sortObjects=true;
    renderer.shadowMap.enabled=!profile.compact&&!profile.low&&profile.w>=980;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=true;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x070605);scene.fog=new THREE.FogExp2(0x070605,profile.compact?.0065:.0052);if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);
    scene.add(new THREE.HemisphereLight(0xf4e4c5,0x090807,.92));
    keyLight=new THREE.DirectionalLight(0xffe4b5,1.28);keyLight.position.set(7,10,7);keyLight.castShadow=renderer.shadowMap.enabled;
    if(keyLight.castShadow){const size=profile.high?2048:1536;keyLight.shadow.mapSize.set(size,size);keyLight.shadow.camera.left=-13;keyLight.shadow.camera.right=13;keyLight.shadow.camera.top=13;keyLight.shadow.camera.bottom=-13;keyLight.shadow.bias=-.00025;keyLight.shadow.normalBias=.026;keyLight.shadow.radius=3;}scene.add(keyLight);
    rimLight=new THREE.PointLight(0x72d2bf,.72,30,1.9);rimLight.position.set(-6,5,-5);scene.add(rimLight);
    fillLight=new THREE.PointLight(0xe3b35c,.58,28,2);fillLight.position.set(4,4,5);scene.add(fillLight);

    buildEnvironment();buildStations();
    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.08,180);scene.add(camera);
    const state=timeline(0);applyState(state);const pose=evaluateCamera(state);camera.position.copy(desiredPos);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();
    bindCanvasLoss();bindGlobal();readProgress();progress=targetProgress;if(visible)startLoop();
  }

  function queueInit(){
    if(initialized||initQueued)return;initQueued=true;
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:true}}));
    setTimeout(()=>{if(!initialized){try{init();}catch(error){console.error('[By Meli] Connected V15 failed:',error);initialized=false;initQueued=false;if(fallback)fallback.style.opacity='.46';if(initAttempts<3)setTimeout(queueInit,720);}}},220);
  }

  function auditAt(value){
    if(!initialized||!camera)return {initialized:false};
    progress=targetProgress=clamp(value);const state=timeline(progress);applyState(state);const pose=evaluateCamera(state);camera.position.copy(desiredPos);camera.lookAt(desiredTarget);camera.fov=pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    const frame=safeFrame(),items=[];
    stations.forEach((s,i)=>{
      if(!s.wrapper.visible)return;
      const box=transformedBox(i,s.wrapper.position,s.wrapper.scale.x);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
      boxCorners(box).forEach(p=>{const n=p.clone().project(camera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
      items.push({i,minX,maxX,minY,maxY,behind,inside:!behind&&minX>=frame.left-.035&&maxX<=frame.right+.035&&minY>=frame.bottom-.035&&maxY<=frame.top+.035});
    });
    return {initialized:true,progress,state,frame,profile:{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio},camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,fov:camera.fov},target:{x:desiredTarget.x,y:desiredTarget.y,z:desiredTarget.z},items};
  }

  window.ByMeliConnectedV15={forceInit:queueInit,auditAt,getState:()=>auditAt(progress)};
  const bootstrap=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){bootstrap.disconnect();queueInit();}},{rootMargin:'440px 0px',threshold:0});bootstrap.observe(track);
  setTimeout(()=>{if(!initialized&&!initQueued){const r=track.getBoundingClientRect();if(r.top<innerHeight*3&&r.bottom>-innerHeight)queueInit();}},1200);
})();
