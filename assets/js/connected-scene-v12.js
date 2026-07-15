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

  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t);
  const smoother=t=>t*t*t*(t*(t*6-15)+10);

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

  const typeNames=['BUILD','DISPLAY','INTERIOR','MANAGE','FLOW','LIVE AV'];
  const types=['booth','showroom','interior','management','crowd','av'];
  const centers=[
    new THREE.Vector3(-.7,0,0),
    new THREE.Vector3(5.5,0,-7.25),
    new THREE.Vector3(-5.25,0,-14.5),
    new THREE.Vector3(5.05,0,-21.75),
    new THREE.Vector3(-4.8,0,-29),
    new THREE.Vector3(.15,0,-36.4)
  ];

  let renderer=null,scene=null,camera=null,root=null;
  let routeGroup=null,routeCurve=null,routeGlow=null,routeCore=null,overviewLinks=null,overviewLinkMeshes=[];
  let stations=[],stationBoxes=[],stationLights=[],stationRings=[],stationLabels=[],stationHalos=[];
  let routeMarkers=[],scanBeams=[],ambientParticles=null;
  let keyframes=[],overviewStart=.80,overviewPositions=[],overviewScale=.64;
  let profile=null;
  let initialized=false,initQueued=false,initAttempts=0;
  let visible=false,pageVisible=!document.hidden;
  let targetProgress=0,progress=0,lastTime=0;
  let activeStage=-1,overviewCopy=false;
  let resizeQueued=false,progressQueued=false;
  let liveCanvas=null,liveContext=null,liveTexture=null,lastLiveDraw=0;
  let renderRatio=1,rafId=0;

  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tmp0=new THREE.Vector3(),tmp1=new THREE.Vector3();
  const corner=new THREE.Vector3();

  function getProfile(){
    const w=Math.max(1,sticky.clientWidth||innerWidth);
    const h=Math.max(1,sticky.clientHeight||innerHeight);
    const aspect=w/h;
    const compact=w<760;
    const tablet=w>=760&&w<1100;
    const portrait=aspect<.82;
    const landscape=aspect>1.45;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const low=compact&&(memory<=3||cores<=4);
    const strong=memory>=6&&cores>=6;
    const fov=compact?(portrait?48:45):(tablet?(portrait?45:42):39);
    const vFov=THREE.MathUtils.degToRad(fov);
    const hFov=2*Math.atan(Math.tan(vFov/2)*aspect);
    return {w,h,aspect,compact,tablet,portrait,landscape,memory,cores,low,strong,fov,vFov,hFov};
  }

  function choosePixelRatio(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    const cap=p.compact?(p.low?1.45:(p.strong?2.05:1.78)):(p.tablet?(p.strong?2.25:1.95):(p.strong?2.45:2.15));
    const pixels=p.compact?(p.low?1700000:(p.strong?3200000:2450000)):(p.tablet?(p.strong?4600000:3600000):(p.strong?6800000:5400000));
    return Math.max(1,Math.min(dpr,cap,Math.sqrt(pixels/Math.max(1,p.w*p.h))));
  }

  function makeGradientTexture(){
    const c=document.createElement('canvas');c.width=1024;c.height=1024;
    const x=c.getContext('2d');
    const g=x.createRadialGradient(500,390,20,512,512,700);
    g.addColorStop(0,'#282016');g.addColorStop(.42,'#15110d');g.addColorStop(1,'#070605');
    x.fillStyle=g;x.fillRect(0,0,1024,1024);
    x.strokeStyle='rgba(226,184,91,.055)';x.lineWidth=1;
    for(let i=0;i<48;i++){x.beginPath();x.moveTo(i*24,0);x.lineTo(i*24,1024);x.stroke();x.beginPath();x.moveTo(0,i*24);x.lineTo(1024,i*24);x.stroke();}
    const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2.2,7.2);tex.needsUpdate=true;return tex;
  }

  function makeLabelTexture(number,label){
    const c=document.createElement('canvas');c.width=1024;c.height=256;
    const x=c.getContext('2d');
    x.clearRect(0,0,c.width,c.height);
    const bg=x.createLinearGradient(0,0,c.width,0);bg.addColorStop(0,'rgba(8,7,5,.94)');bg.addColorStop(.72,'rgba(14,12,8,.72)');bg.addColorStop(1,'rgba(14,12,8,0)');
    x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);
    x.strokeStyle='rgba(222,182,94,.72)';x.lineWidth=4;x.strokeRect(14,14,996,228);
    x.fillStyle='#e2b85f';x.font='600 45px IBM Plex Mono, monospace';x.fillText(String(number).padStart(2,'0')+' / 06',58,88);
    x.fillStyle='#fbf4e6';x.font='800 80px Inter, Arial, sans-serif';x.fillText(label,58,186);
    const tex=new THREE.CanvasTexture(c);tex.needsUpdate=true;if(Q)Q.prepareTexture(tex,renderer);return tex;
  }

  function makeLiveTexture(){
    liveCanvas=document.createElement('canvas');
    liveCanvas.width=profile.compact?1024:1600;
    liveCanvas.height=profile.compact?576:900;
    liveContext=liveCanvas.getContext('2d',{alpha:false});
    liveTexture=new THREE.CanvasTexture(liveCanvas);
    liveTexture.wrapS=liveTexture.wrapT=THREE.ClampToEdgeWrapping;
    if(Q)Q.prepareTexture(liveTexture,renderer);
    drawLiveTexture(0,0,true);
    return liveTexture;
  }

  function drawLiveTexture(now,stage,force=false){
    if(!liveContext||!liveTexture)return;
    const interval=profile.compact?88:56;
    if(!force&&now-lastLiveDraw<interval)return;
    lastLiveDraw=now;
    const x=liveContext,w=liveCanvas.width,h=liveCanvas.height,t=now*.001;
    const bg=x.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#04100e');bg.addColorStop(.55,'#123c36');bg.addColorStop(1,'#221507');x.fillStyle=bg;x.fillRect(0,0,w,h);
    const glow=x.createRadialGradient(w*(.68+.08*Math.sin(t*.4)),h*.26,4,w*.68,h*.26,w*.55);glow.addColorStop(0,'rgba(122,231,209,.5)');glow.addColorStop(.38,'rgba(89,188,169,.14)');glow.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=glow;x.fillRect(0,0,w,h);
    x.strokeStyle='rgba(237,209,145,.11)';x.lineWidth=Math.max(1,w/1200);for(let i=0;i<=16;i++){x.beginPath();x.moveTo(i*w/16,0);x.lineTo(i*w/16,h);x.stroke()}for(let i=0;i<=9;i++){x.beginPath();x.moveTo(0,i*h/9);x.lineTo(w,i*h/9);x.stroke()}
    const scan=((t*.18)%1)*w;x.fillStyle='rgba(132,238,216,.08)';x.fillRect(scan-w*.075,0,w*.075,h);
    x.strokeStyle='rgba(235,196,105,.78)';x.lineWidth=w/360;x.strokeRect(w*.045,h*.07,w*.91,h*.86);
    x.fillStyle='#fff7e8';x.font=`800 ${Math.round(w*.087)}px Inter,Arial`;x.fillText('BY MELI',w*.075,h*.28);
    x.fillStyle='#e2b85f';x.font=`600 ${Math.round(w*.025)}px IBM Plex Mono,monospace`;x.fillText('CONNECTED PRODUCTION / LIVE STATUS',w*.078,h*.39);
    x.fillStyle='rgba(255,248,234,.94)';x.font=`700 ${Math.round(w*.045)}px Inter,Arial`;x.fillText(typeNames[clamp(stage,0,5)],w*.078,h*.68);
    x.fillStyle='rgba(255,248,234,.62)';x.font=`500 ${Math.round(w*.018)}px IBM Plex Mono,monospace`;x.fillText('DESIGN  /  ENGINEER  /  BUILD  /  OPERATE',w*.078,h*.79);
    for(let i=0;i<20;i++){const on=(i+Math.floor(t*10))%7===0;x.fillStyle=on?'rgba(126,238,214,.98)':'rgba(226,184,91,.62)';x.fillRect(w*.08+i*w*.041,h*.86+(i%2)*h*.018,w*.024,h*.009)}
    liveTexture.needsUpdate=true;
  }

  function replaceLiveScreenMaterials(group,materials){
    group.traverse(o=>{
      if(!o.material)return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.forEach(m=>{
        if(m===materials.screen||m.emissiveMap||m.map===materials.screen?.map){
          m.map=liveTexture;m.emissiveMap=liveTexture;m.emissiveIntensity=Math.max(1.1,m.emissiveIntensity||0);m.needsUpdate=true;
        }
      });
    });
  }

  function makeProxy(type,materials){
    const g=new THREE.Group();
    const mesh=(geo,mat,x,y,z,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);g.add(m);return m;};
    const box=(w,h,d,x,y,z,mat=materials.dark)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);
    if(type==='booth'){box(5.6,3.5,.14,0,1.9,-1.8,materials.cream);box(4.6,.65,.18,0,4,1.75,materials.gold);box(2.2,1.2,.12,0,2.45,-1.7,materials.screen);}
    if(type==='showroom'){box(.18,4.2,5.2,-2.4,2.1,0,materials.dark);[-1.4,0,1.4].forEach((x,i)=>box(1.05,.8+i*.18,1.05,x,.45+i*.09,.4, i===1?materials.gold:materials.cream));}
    if(type==='interior'){box(4.2,.9,1.1,0,.8,-1,materials.cream);box(4.2,1.1,.25,0,1.5,-1.4,materials.cream);mesh(new THREE.CylinderGeometry(.9,.9,.1,30),materials.glass,0,.85,.7);}
    if(type==='management'){box(5.4,.22,2.4,0,.9,.2,materials.dark);box(5.2,2.8,.12,0,2.5,-2,materials.cream);[-1.7,0,1.7].forEach(x=>box(1.35,.82,.1,x,1.75,-.2,materials.screen));}
    if(type==='crowd'){box(5.2,.22,.22,0,3.6,-1.8,materials.gold);[-2.6,2.6].forEach(x=>box(.22,3.6,.22,x,1.8,-1.8,materials.gold));for(let i=0;i<10;i++)mesh(new THREE.CylinderGeometry(.12,.16,.8,10),i%3?materials.dark:materials.teal,(i%5-2)*.75,.55,Math.floor(i/5)*.85);}
    if(type==='av'){box(5.7,.4,3.4,0,.22,-.3,materials.dark);box(5,2.6,.14,0,2.1,-1.85,materials.screen);box(2.8,.8,1.05,0,.45,1.9,materials.dark);}
    return g;
  }

  function addStationPlatform(wrapper,i,materials){
    const platformMat=new THREE.MeshStandardMaterial({color:0x12100c,roughness:.82,metalness:.16,envMapIntensity:.55});
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(4.55,4.82,.3,profile.low?42:72),platformMat);platform.position.y=.15;platform.receiveShadow=!profile.compact;wrapper.add(platform);
    const ringMat=new THREE.MeshBasicMaterial({color:i%2?0x74cdbd:0xe0b55e,transparent:true,opacity:.52,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.92,4.38,profile.low?48:88),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=.31;wrapper.add(ring);stationRings.push(ring);
    const haloCount=profile.low?24:(profile.compact?32:44);
    const haloPositions=new Float32Array(haloCount*3);
    for(let h=0;h<haloCount;h++){const a=h/haloCount*Math.PI*2;const r=4.13+(h%3)*.035;haloPositions[h*3]=Math.cos(a)*r;haloPositions[h*3+1]=.355;haloPositions[h*3+2]=Math.sin(a)*r;}
    const haloGeometry=new THREE.BufferGeometry();haloGeometry.setAttribute('position',new THREE.BufferAttribute(haloPositions,3));
    const haloMaterial=new THREE.PointsMaterial({color:i%2?0x7bd8c6:0xf0ca73,size:profile.compact?.055:.065,transparent:true,opacity:.34,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const halo=new THREE.Points(haloGeometry,haloMaterial);halo.frustumCulled=false;wrapper.add(halo);stationHalos.push(halo);
    const edgeMat=new THREE.MeshBasicMaterial({color:0xe9c36f,transparent:true,opacity:.72,depthWrite:false,toneMapped:false});
    const edge=new THREE.Mesh(new THREE.TorusGeometry(4.47,.032,8,profile.low?64:112),edgeMat);edge.rotation.x=Math.PI/2;edge.position.y=.32;wrapper.add(edge);
    const labelMat=new THREE.MeshBasicMaterial({map:makeLabelTexture(i+1,typeNames[i]),transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
    const label=new THREE.Mesh(new THREE.PlaneGeometry(3.65,.91),labelMat);label.position.set(0,1.05,3.88);wrapper.add(label);stationLabels.push(label);
    const beaconMat=new THREE.MeshBasicMaterial({color:i%2?0x76d2c0:0xebc66f,transparent:true,opacity:.75,depthWrite:false,toneMapped:false});
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,3.2,8),beaconMat);beacon.position.set(-4.05,1.9,2.4);wrapper.add(beacon);
  }

  function configureOverviewLayout(){
    if(profile.compact&&profile.portrait){
      overviewScale=.64;
      overviewPositions=[
        new THREE.Vector3(-3.25,0,4.75),new THREE.Vector3(3.25,0,4.75),
        new THREE.Vector3(-3.25,0,0),new THREE.Vector3(3.25,0,0),
        new THREE.Vector3(-3.25,0,-4.75),new THREE.Vector3(3.25,0,-4.75)
      ];
    }else if(profile.compact||profile.tablet){
      overviewScale=.62;
      overviewPositions=[
        new THREE.Vector3(-4.6,0,3.7),new THREE.Vector3(0,0,3.7),new THREE.Vector3(4.6,0,3.7),
        new THREE.Vector3(-4.6,0,-3.7),new THREE.Vector3(0,0,-3.7),new THREE.Vector3(4.6,0,-3.7)
      ];
    }else{
      overviewScale=.68;
      overviewPositions=[
        new THREE.Vector3(-5.1,0,3.85),new THREE.Vector3(0,0,3.85),new THREE.Vector3(5.1,0,3.85),
        new THREE.Vector3(-5.1,0,-3.85),new THREE.Vector3(0,0,-3.85),new THREE.Vector3(5.1,0,-3.85)
      ];
    }
  }

  function disposeGroup(group){
    if(!group)return;
    group.traverse(o=>{o.geometry?.dispose?.();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m?.dispose?.());}});
    root?.remove(group);
  }

  function createOverviewLinks(){
    disposeGroup(overviewLinks);overviewLinkMeshes=[];
    overviewLinks=new THREE.Group();overviewLinks.visible=false;root.add(overviewLinks);
    const pairs=profile.compact&&profile.portrait?[[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[4,5]]:[[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5]];
    pairs.forEach(([a,b],i)=>{
      const pa=overviewPositions[a],pb=overviewPositions[b];
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(pa.x,.34,pa.z),
        new THREE.Vector3((pa.x+pb.x)*.5,.45,(pa.z+pb.z)*.5),
        new THREE.Vector3(pb.x,.34,pb.z)
      ],false,'catmullrom',.25);
      const mat=new THREE.MeshBasicMaterial({color:i%2?0x74d0bf:0xe4bc65,transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,28,.025,6,false),mat);overviewLinks.add(mesh);overviewLinkMeshes.push(mesh);
    });
  }

  function createRoute(materials){
    routeGroup=new THREE.Group();root.add(routeGroup);
    const routePoints=[];
    centers.forEach((p,i)=>{
      routePoints.push(new THREE.Vector3(p.x,.34,p.z+(i===0?3.2:0)));
      if(i<centers.length-1){const b=centers[i+1];routePoints.push(new THREE.Vector3((p.x+b.x)*.5+(i%2?-1.1:1.1),.34,(p.z+b.z)*.5));}
    });
    routeCurve=new THREE.CatmullRomCurve3(routePoints,false,'catmullrom',.24);
    const segments=profile.low?160:(profile.compact?240:360);
    const baseMat=new THREE.MeshStandardMaterial({color:0x21170d,emissive:0x563407,emissiveIntensity:.42,roughness:.64,metalness:.24,transparent:true,opacity:.92});
    routeGlow=new THREE.Mesh(new THREE.TubeGeometry(routeCurve,segments,.46,profile.low?6:10,false),baseMat);routeGlow.scale.y=.075;routeGroup.add(routeGlow);
    const coreMat=new THREE.MeshBasicMaterial({color:0xefc96f,transparent:true,opacity:.84,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    routeCore=new THREE.Mesh(new THREE.TubeGeometry(routeCurve,segments,.025,6,false),coreMat);routeGroup.add(routeCore);
    const sideCurveA=new THREE.CatmullRomCurve3(routePoints.map(p=>new THREE.Vector3(p.x+.34,p.y,p.z)),false,'catmullrom',.24);
    const sideCurveB=new THREE.CatmullRomCurve3(routePoints.map(p=>new THREE.Vector3(p.x-.34,p.y,p.z)),false,'catmullrom',.24);
    [sideCurveA,sideCurveB].forEach((curve,k)=>{const mat=new THREE.MeshBasicMaterial({color:k?0x6fcbbb:0xd7ae58,transparent:true,opacity:.26,depthWrite:false,toneMapped:false});routeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve,segments,.012,5,false),mat));});
    const count=profile.low?5:(profile.compact?8:12);
    routeMarkers=[];
    for(let i=0;i<count;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(profile.compact?.055:.065,profile.low?10:16,profile.low?8:12),new THREE.MeshBasicMaterial({color:i%2?0x76d6c3:0xf1cd77,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
      m.userData.offset=i/count;m.userData.speed=.024+(i%3)*.0025;routeGroup.add(m);routeMarkers.push(m);
    }
  }

  function createParticles(){
    const count=profile.low?70:(profile.compact?130:240);
    const pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){pos[i*3]=(Math.random()-.5)*22;pos[i*3+1]=.5+Math.random()*7;pos[i*3+2]=5-Math.random()*47;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const c=document.createElement('canvas');c.width=c.height=48;const x=c.getContext('2d');const g=x.createRadialGradient(24,24,1,24,24,23);g.addColorStop(0,'rgba(255,245,216,.9)');g.addColorStop(.32,'rgba(230,188,96,.38)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,48,48);
    const tex=new THREE.CanvasTexture(c);
    const mat=new THREE.PointsMaterial({map:tex,color:0xf0cf87,size:profile.compact?.055:.07,transparent:true,opacity:profile.compact?.18:.24,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    ambientParticles=new THREE.Points(geo,mat);ambientParticles.frustumCulled=false;root.add(ambientParticles);
  }

  function createScanBeams(){
    scanBeams=[];
    centers.forEach((p,i)=>{
      const mat=new THREE.MeshBasicMaterial({color:i%2?0x72d2c0:0xe9bd61,transparent:true,opacity:.026,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.15,2.2,6.8,profile.low?12:24,1,true),mat);beam.position.set(p.x+(i%2?.8:-.8),3.65,p.z);beam.rotation.z=i%2?.065:-.065;root.add(beam);scanBeams.push(beam);
    });
  }

  function buildStations(){
    const sharedMaterials=factory?factory.createMaterials(renderer):null;
    if(sharedMaterials){
      sharedMaterials.screen.map=liveTexture;sharedMaterials.screen.emissiveMap=liveTexture;sharedMaterials.screen.needsUpdate=true;
    }
    const fallbackMaterials=sharedMaterials||{
      gold:new THREE.MeshPhysicalMaterial({color:0xd4ad5d,metalness:.72,roughness:.24,clearcoat:.3}),
      goldDark:new THREE.MeshStandardMaterial({color:0x765527,metalness:.5,roughness:.36}),
      dark:new THREE.MeshStandardMaterial({color:0x1d1813,metalness:.26,roughness:.48}),
      cream:new THREE.MeshStandardMaterial({color:0xeee1c8,roughness:.6}),
      white:new THREE.MeshStandardMaterial({color:0xf8f3e9,roughness:.64}),
      teal:new THREE.MeshStandardMaterial({color:0x609f92,metalness:.18,roughness:.35}),
      glass:new THREE.MeshPhysicalMaterial({color:0xd2ebe5,transparent:true,opacity:.3,roughness:.05,transmission:.6,depthWrite:false}),
      screen:new THREE.MeshStandardMaterial({map:liveTexture,emissiveMap:liveTexture,emissive:0x73cdbb,emissiveIntensity:1.2}),
      red:new THREE.MeshStandardMaterial({color:0x91473b,roughness:.48})
    };
    factory?.setShadowEnabled?.(!profile.compact&&profile.strong);
    stations=[];stationBoxes=[];stationLights=[];stationRings=[];stationLabels=[];stationHalos=[];
    types.forEach((type,i)=>{
      const wrapper=new THREE.Group();wrapper.position.set(0,0,0);wrapper.userData.index=i;
      addStationPlatform(wrapper,i,fallbackMaterials);
      const detail=new THREE.Group();detail.name='detail';
      if(factory?.factories?.[type])factory.factories[type](detail,fallbackMaterials);else detail.add(makeProxy(type,fallbackMaterials));
      detail.scale.setScalar(.74);detail.position.y=.32;replaceLiveScreenMaterials(detail,fallbackMaterials);wrapper.add(detail);
      const proxy=makeProxy(type,fallbackMaterials);proxy.name='proxy';proxy.scale.setScalar(.72);proxy.position.y=.32;proxy.visible=false;wrapper.add(proxy);
      const light=new THREE.PointLight(i%2?0x72d0bf:0xe7ba60,0,13,2);light.position.set(i%2?2.6:-2.6,3.7,2);wrapper.add(light);stationLights.push(light);
      wrapper.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(detail);
      wrapper.position.copy(centers[i]);root.add(wrapper);wrapper.updateMatrixWorld(true);
      stationBoxes.push(box);stations.push({wrapper,detail,proxy,light,materials:fallbackMaterials});
    });
  }

  function boxCorners(box){
    const a=box.min,b=box.max;return [
      new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(a.x,a.y,b.z),new THREE.Vector3(a.x,b.y,a.z),new THREE.Vector3(a.x,b.y,b.z),
      new THREE.Vector3(b.x,a.y,a.z),new THREE.Vector3(b.x,a.y,b.z),new THREE.Vector3(b.x,b.y,a.z),new THREE.Vector3(b.x,b.y,b.z)
    ];
  }

  function stationWorldBox(i){
    const local=stationBoxes[i];const wrapper=stations[i].wrapper;
    const min=local.min.clone().multiplyScalar(wrapper.scale.x).add(wrapper.position);
    const max=local.max.clone().multiplyScalar(wrapper.scale.x).add(wrapper.position);
    return new THREE.Box3(min,max);
  }

  function fitDistance(box,target,yaw,elev,margin=1.08){
    const dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(elev),Math.sin(elev),Math.cos(yaw)*Math.cos(elev)).normalize();
    const forward=dir.clone().multiplyScalar(-1);
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),forward).normalize();
    const camUp=new THREE.Vector3().crossVectors(forward,right).normalize();
    const tanH=Math.tan(profile.hFov*.5)*(profile.compact?.91:(profile.tablet?.84:.78));
    const tanV=Math.tan(profile.vFov*.5)*(profile.compact?(profile.portrait?.62:.72):(profile.tablet?.80:.86));
    let distance=0;
    boxCorners(box).forEach(p=>{
      const rel=p.clone().sub(target);
      const along=rel.dot(forward);
      distance=Math.max(distance,Math.abs(rel.dot(right))/Math.max(.08,tanH)-along,Math.abs(rel.dot(camUp))/Math.max(.08,tanV)-along);
    });
    return Math.max(profile.compact?7.4:6.8,distance*margin+1.15);
  }

  function stationPose(i,variant=0){
    const box=stationWorldBox(i);const size=new THREE.Vector3();box.getSize(size);const center=new THREE.Vector3();box.getCenter(center);
    const rtl=document.documentElement.dir==='rtl';
    const mobileYaw=[.39,-.37,.4,-.35,.36,-.4];
    const tabletYaw=[.46,-.43,.47,-.4,.42,-.45];
    const desktopYaw=[.54,-.5,.55,-.46,.49,-.51];
    const yaws=profile.compact?mobileYaw:(profile.tablet?tabletYaw:desktopYaw);
    const elev=profile.compact?(profile.portrait?.19:.17):(profile.tablet?.21:.23);
    const arc=(variant-1)*(.045+(i%2?.006:-.006));
    const yaw=yaws[i]+arc;
    const target=center.clone();
    if(profile.compact){target.y-=size.y*(profile.portrait?.255:.19);target.x+=size.x*(i%2?.012:-.012);}else{target.x+=(rtl?1:-1)*size.x*.18;target.y-=size.y*.025;}
    const distance=fitDistance(box,target,yaw,elev,(profile.compact?1.085:1.055)*(variant===1?.985:1.015));
    const horizontal=Math.cos(elev)*distance;
    const pos=new THREE.Vector3(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
    return {pos,target,fov:profile.fov+(variant===1?-.5:.08),stage:i,overview:false};
  }

  function bridgePose(i){
    const a=stationPose(i,2),b=stationPose(i+1,0);
    const pa=centers[i],pb=centers[i+1];
    const target=new THREE.Vector3().lerpVectors(pa,pb,.5);target.y=profile.compact?.82:1.18;
    const side=i%2?-1:1;
    const pos=new THREE.Vector3().lerpVectors(a.pos,b.pos,.5);
    pos.x+=side*(profile.compact?.72:1.0);
    pos.y+=profile.compact?.82:1.08;
    pos.z+=profile.compact?1.16:1.42;
    if(profile.compact&&profile.portrait)pos.x*=.9;
    return {pos,target,fov:profile.fov+(profile.compact?.9:1.1),stage:i,overview:false,bridge:true};
  }

  function boxAt(index,position,scale){
    const local=stationBoxes[index];
    return new THREE.Box3(local.min.clone().multiplyScalar(scale).add(position),local.max.clone().multiplyScalar(scale).add(position));
  }

  function overviewPose(amount=1){
    const all=new THREE.Box3();stationBoxes.forEach((_,i)=>all.union(boxAt(i,overviewPositions[i],overviewScale)));
    const center=new THREE.Vector3();all.getCenter(center);
    const yaw=profile.compact?(profile.portrait?.03:.22):.39;
    const elev=profile.compact?(profile.portrait?.43:.36):.34;
    const target=center.clone();target.y=profile.compact?.42:.58;
    const distance=fitDistance(all,target,yaw,elev,profile.compact?1.14:1.16);
    const horizontal=Math.cos(elev)*distance;
    const finalPos=new THREE.Vector3(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
    const last=stationPose(5,2);
    return {pos:last.pos.clone().lerp(finalPos,amount),target:last.target.clone().lerp(target,amount),fov:lerp(last.fov,profile.fov+(profile.compact?1.1:.65),amount),stage:5,overview:true};
  }

  function buildKeyframes(){
    keyframes=[];
    const stageSpan=overviewStart/6;
    for(let i=0;i<6;i++){
      const start=i*stageSpan;
      keyframes.push({t:start,...stationPose(i,0)});
      keyframes.push({t:start+stageSpan*.29,...stationPose(i,1)});
      keyframes.push({t:start+stageSpan*.56,...stationPose(i,2)});
      if(i<5)keyframes.push({t:start+stageSpan*.79,...bridgePose(i)});
    }
    keyframes.push({t:overviewStart,...stationPose(5,2)});
    keyframes.push({t:overviewStart+.0425,...overviewPose(.25)});
    keyframes.push({t:overviewStart+.085,...overviewPose(.50)});
    keyframes.push({t:overviewStart+.1275,...overviewPose(.75)});
    keyframes.push({t:.97,...overviewPose(1)});
    keyframes.push({t:1,...overviewPose(1)});
    keyframes.sort((a,b)=>a.t-b.t);
  }


  function evaluateCamera(p){
    p=clamp(p);
    let i=0;while(i<keyframes.length-2&&p>keyframes[i+1].t)i++;
    const k1=keyframes[i],k2=keyframes[Math.min(i+1,keyframes.length-1)];
    const k0=keyframes[Math.max(0,i-1)],k3=keyframes[Math.min(keyframes.length-1,i+2)];
    const u=clamp((p-k1.t)/Math.max(.0001,k2.t-k1.t));
    // Cubic easing keeps the scroll response immediate while removing hard
    // velocity changes at every camera frame. The route bridge remains explicit,
    // so the walkthrough never relies on an unpredictable spline overshoot.
    const e=smooth(u);
    desiredPos.lerpVectors(k1.pos,k2.pos,e);
    desiredTarget.lerpVectors(k1.target,k2.target,e);
    const fov=lerp(k1.fov,k2.fov,e);
    const timeline=timelineInfo(p);
    return {fov,...timeline,overview:p>=overviewStart,overviewQ:clamp((p-overviewStart)/(1-overviewStart))};
  }

  function timelineInfo(p){
    if(p>=overviewStart)return {stage:5,local:1,transition:false,transitionQ:0,next:5};
    const span=overviewStart/6;
    const raw=p/span;
    const stage=clamp(Math.floor(raw),0,5);
    const local=raw-stage;
    const transition=stage<5&&local>.56;
    return {stage,local,transition,transitionQ:transition?smoother(clamp((local-.56)/.44)):0,next:Math.min(5,stage+1)};
  }

  function stageForProgress(p){return timelineInfo(p).stage;}

  function updateVisibility(state){
    const active=state.stage;
    const next=Math.min(5,active+1);
    const prev=Math.max(0,active-1);
    const overview=state.overview;
    const tq=state.transitionQ||0;
    const transitionEase=smoother(tq);
    stations.forEach((s,i)=>{
      if(overview){
        const move=smoother(clamp(state.overviewQ/.82));
        const reveal=smoother(clamp((state.overviewQ-.16)/.48));
        s.wrapper.visible=i===5||reveal>.01;
        s.wrapper.position.lerpVectors(centers[i],overviewPositions[i],move);
        s.wrapper.scale.setScalar(i===5?lerp(1,overviewScale,move):lerp(.08,overviewScale,reveal));
        // The final system view uses lightweight architectural proxies. This
        // keeps all six stations crisp and responsive on phones without six
        // full service scenes competing for the same GPU frame.
        s.detail.visible=i===5&&state.overviewQ<.34&&!profile.compact&&!profile.low;
        s.proxy.visible=!s.detail.visible;
        s.light.intensity=.14+.22*reveal;
      }else{
        const showPrev=!profile.compact&&profile.strong&&i===prev&&active>0&&state.local<.14;
        const incoming=i===next&&state.transition;
        const show=i===active||incoming||showPrev;
        s.wrapper.visible=show;
        const midpoint=tmp0.copy(centers[active]).lerp(centers[next],.5);
        let scale=1;
        if(i===active){
          s.wrapper.position.lerpVectors(centers[i],midpoint,transitionEase);
          scale=lerp(1,.24,transitionEase);
        }else if(incoming){
          s.wrapper.position.lerpVectors(midpoint,centers[i],transitionEase);
          scale=lerp(.24,1,transitionEase);
        }else{
          s.wrapper.position.copy(centers[i]);
          scale=.5;
        }
        s.wrapper.scale.setScalar(scale);

        // Mobile renders one full-detail environment at a time. During the
        // connected hand-off, the incoming station uses its clean architectural
        // proxy until it becomes active, keeping the morph fluid at phone frame rates.
        const detailAllowed=i===active||(!profile.compact&&!profile.low&&incoming);
        s.detail.visible=show&&detailAllowed;
        s.proxy.visible=show&&!s.detail.visible;
        s.light.intensity=i===active?lerp(1.42,.32,transitionEase):(i===next?lerp(.24,1.32,transitionEase):.04);
      }
      const ring=stationRings[i];
      if(ring)ring.material.opacity=overview?.34:(i===active?lerp(.82,.28,transitionEase):(i===next?lerp(.22,.78,transitionEase):.13));
      const label=stationLabels[i];
      if(label)label.material.opacity=overview?.55:(i===active?lerp(.98,.22,transitionEase):(i===next?lerp(.18,.92,transitionEase):.12));
      const halo=stationHalos[i];
      if(halo)halo.material.opacity=overview?.28:(i===active?lerp(.58,.18,transitionEase):(i===next?lerp(.12,.52,transitionEase):.08));
    });
  }

  function updateCopy(state){
    const overview=state.overview&&state.overviewQ>.68;
    const stage=state.stage;
    if(stage===activeStage&&overview===overviewCopy)return;
    activeStage=stage;overviewCopy=overview;
    const lang=document.documentElement.lang==='ar'?'ar':'en';
    copyBox?.classList.add('switching');
    setTimeout(()=>{
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
      copyBox?.classList.remove('switching');
    },55);
  }

  function readProgress(){
    if(!track||!sticky)return;
    const rect=track.getBoundingClientRect();
    const span=Math.max(1,track.offsetHeight-sticky.clientHeight);
    targetProgress=clamp(-rect.top/span);
  }

  function scheduleProgress(){
    if(progressQueued)return;progressQueued=true;
    requestAnimationFrame(()=>{progressQueued=false;readProgress();});
  }

  function resize(){
    resizeQueued=false;
    if(!renderer||!camera)return;
    profile=getProfile();
    configureOverviewLayout();
    if(root)createOverviewLinks();
    renderRatio=choosePixelRatio(profile);
    renderer.setPixelRatio(renderRatio);
    renderer.setSize(profile.w,profile.h,false);
    camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    buildKeyframes();
    readProgress();
  }

  function scheduleResize(){
    if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);
  }

  function animateScene(now,state){
    const t=now*.001;
    drawLiveTexture(now,state.stage);
    routeMarkers.forEach((m,i)=>{const u=(t*m.userData.speed+m.userData.offset)%1;m.position.copy(routeCurve.getPointAt(u));m.position.y=.38+Math.sin(t*3.1+i)*.022;m.scale.setScalar(.72+.23*Math.sin(Math.PI*u));m.material.opacity=.58+.38*Math.sin(Math.PI*u);});
    const routeFade=state.overview?1-smoother(clamp(state.overviewQ/.72)):1;
    if(routeGlow){routeGlow.material.emissiveIntensity=.38+.18*Math.sin(t*1.55);routeGlow.material.opacity=(.82+.08*Math.sin(t*1.2))*routeFade;}
    if(routeCore)routeCore.material.opacity=(.72+.22*Math.sin(t*1.8))*routeFade;
    if(overviewLinks){overviewLinks.visible=state.overview&&state.overviewQ>.38;const linkOpacity=.76*smoother(clamp((state.overviewQ-.38)/.42));overviewLinkMeshes.forEach((m,i)=>m.material.opacity=linkOpacity*(.84+.16*Math.sin(t*1.7+i*.5)));}
    scanBeams.forEach((beam,i)=>{const active=i===state.stage?1:(state.overview?.45:.08);beam.material.opacity=(i%2?.024:.03)*lerp(.5,2.8,active)*(1+.15*Math.sin(t*.8+i));beam.rotation.y=t*.018*(i%2?1:-1);});
    stationRings.forEach((ring,i)=>{const pulse=1+Math.sin(t*1.55+i*.72)*.012;ring.scale.set(pulse,pulse,pulse);});
    stationHalos.forEach((halo,i)=>{halo.rotation.y=t*(i%2?.11:-.11);const pulse=1+Math.sin(t*2.05+i*.63)*.018;halo.scale.setScalar(pulse);});
    stations.forEach((s,i)=>{if(s.detail.visible)factory?.animate?.(s.detail,t+i*.18);});
    stationLabels.forEach(label=>label.lookAt(camera.position));
    if(ambientParticles){ambientParticles.rotation.y=Math.sin(t*.09)*.018;ambientParticles.position.y=Math.sin(t*.17)*.07;}
  }

  function render(now){
    rafId=requestAnimationFrame(render);
    if(!renderer||!scene||!camera||!visible||!pageVisible)return;
    const dt=lastTime?Math.min(.05,(now-lastTime)/1000):1/60;lastTime=now;
    const rate=reduced?100:(profile.compact?15.5:17.5);
    const requested=(targetProgress-progress)*(1-Math.exp(-rate*dt));
    // Limit catch-up speed after large wheel/touch jumps. Normal scrolling still
    // tracks immediately, while fast flicks resolve as a controlled cinematic
    // move instead of skipping multiple camera frames in one render.
    const maxDelta=reduced?1:dt*(profile.compact?.58:.72);
    progress+=clamp(requested,-maxDelta,maxDelta);
    if(Math.abs(targetProgress-progress)<.00003)progress=targetProgress;
    const state=evaluateCamera(progress);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);
    if(Math.abs(camera.fov-state.fov)>.004){camera.fov=state.fov;camera.updateProjectionMatrix();}
    updateVisibility(state);
    copyBox?.classList.toggle('in-transit',Boolean(state.transition));
    updateCopy(state);animateScene(now,state);
    sticky.style.setProperty('--connected-progress',progress.toFixed(4));
    sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');
    if(indicator)indicator.style.opacity=progress>.93?'0':'1';
    renderer.render(scene,camera);
    if(!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
  }

  function resetCanvas(){
    if(!canvas?.isConnected)return;
    const clone=canvas.cloneNode(false);clone.width=1;clone.height=1;clone.style.pointerEvents='none';clone.style.touchAction='pan-y';canvas.replaceWith(clone);canvas=clone;
  }

  function bind(){
    canvas.style.pointerEvents='none';canvas.style.touchAction='pan-y';
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();sticky.classList.remove('model-active');if(fallback)fallback.style.opacity='.4';
      if(rafId){cancelAnimationFrame(rafId);rafId=0;}
      try{renderer?.dispose?.();}catch(_){}
      renderer=scene=camera=root=null;stations=[];stationBoxes=[];initialized=false;initQueued=false;resetCanvas();setTimeout(queueInit,520);
    },{once:true});
    const io=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(visible){lastTime=0;readProgress();scheduleResize();}},{rootMargin:'260px 0px',threshold:0});io.observe(sticky);
    addEventListener('scroll',scheduleProgress,{passive:true});
    addEventListener('resize',scheduleResize,{passive:true});
    addEventListener('orientationchange',()=>setTimeout(scheduleResize,180),{passive:true});
    if('ResizeObserver'in window){const ro=new ResizeObserver(scheduleResize);ro.observe(sticky);ro.observe(track);}
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;lastTime=0;});
    document.addEventListener('languagechange',()=>{activeStage=-1;overviewCopy=false;updateCopy(evaluateCamera(progress));});
  }

  function init(){
    if(initialized)return;
    initialized=true;initQueued=false;initAttempts+=1;profile=getProfile();configureOverviewLayout();
    try{
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:profile.low?'default':'high-performance',precision:profile.low?'mediump':'highp',stencil:false,preserveDrawingBuffer:false});
    }catch(_){
      try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'default',precision:'mediump',stencil:false,preserveDrawingBuffer:false});}
      catch(__){initialized=false;if(fallback)fallback.style.opacity='.48';resetCanvas();if(initAttempts<3)setTimeout(queueInit,700*initAttempts);return;}
    }
    renderRatio=choosePixelRatio(profile);
    if(Q)Q.configureRenderer(renderer,{exposure:1.12,pixelCap:renderRatio});
    else{renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;}
    renderer.setPixelRatio(renderRatio);renderer.setSize(profile.w,profile.h,false);renderer.setClearColor(0x070605,1);
    renderer.shadowMap.enabled=!profile.compact&&profile.strong;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.sortObjects=true;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x070605);scene.fog=new THREE.FogExp2(0x070605,profile.compact?.013:.0102);if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);
    scene.add(new THREE.HemisphereLight(0xf4e4c5,0x070807,.94));
    const key=new THREE.DirectionalLight(0xffe5b8,1.42);key.position.set(8,12,9);key.castShadow=renderer.shadowMap.enabled;if(key.castShadow){key.shadow.mapSize.set(1536,1536);key.shadow.camera.left=-15;key.shadow.camera.right=15;key.shadow.camera.top=15;key.shadow.camera.bottom=-15;key.shadow.bias=-.00025;key.shadow.normalBias=.026;}scene.add(key);
    const warm=new THREE.PointLight(0xe2b25a,.58,48,2);warm.position.set(8,7,5);scene.add(warm);
    const cool=new THREE.PointLight(0x70c9ba,.48,48,2);cool.position.set(-8,5,-18);scene.add(cool);

    const floorTex=makeGradientTexture();if(Q)Q.prepareTexture(floorTex,renderer);
    const floorMat=new THREE.MeshStandardMaterial({color:0x11100d,map:floorTex,roughness:.92,metalness:.06,envMapIntensity:.36});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,64),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set(0,0,-17);floor.receiveShadow=renderer.shadowMap.enabled;root.add(floor);
    const grid=new THREE.GridHelper(66,58,0x7b5826,0x211a13);grid.position.z=-17;grid.position.y=.012;grid.material.transparent=true;grid.material.opacity=.085;root.add(grid);

    liveTexture=makeLiveTexture();
    buildStations();
    createRoute(stations[0]?.materials);
    createOverviewLinks();
    createScanBeams();
    createParticles();

    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.1,180);scene.add(camera);
    buildKeyframes();
    const initial=evaluateCamera(0);camera.position.copy(desiredPos);camera.lookAt(desiredTarget);camera.fov=initial.fov;camera.updateProjectionMatrix();
    bind();readProgress();if(!rafId)rafId=requestAnimationFrame(render);
  }

  function queueInit(){
    if(initialized||initQueued)return;initQueued=true;
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:true}}));
    setTimeout(()=>{if(!initialized){try{init();}catch(error){console.error('[By Meli] Connected V12 failed:',error);initialized=false;initQueued=false;if(fallback)fallback.style.opacity='.46';if(initAttempts<3)setTimeout(queueInit,720);}}},260);
  }

  function projectionAudit(){
    if(!camera||!profile)return {initialized:false};
    camera.updateMatrixWorld(true);
    const info=timelineInfo(progress);
    const state={progress,...info,camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z},target:{x:desiredTarget.x,y:desiredTarget.y,z:desiredTarget.z},items:[]};
    const indices=progress>=overviewStart?[0,1,2,3,4,5]:[state.stage,Math.min(5,state.stage+1)];
    indices.forEach(i=>{
      const box=stationWorldBox(i);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
      boxCorners(box).forEach(p=>{const ndc=p.clone().project(camera);if(ndc.z>1)behind=true;minX=Math.min(minX,ndc.x);maxX=Math.max(maxX,ndc.x);minY=Math.min(minY,ndc.y);maxY=Math.max(maxY,ndc.y);});
      state.items.push({i,minX,maxX,minY,maxY,behind,inside:minX>=-1.04&&maxX<=1.04&&minY>=-1.04&&maxY<=1.04});
    });
    return state;
  }

  window.ByMeliConnectedV12={
    forceInit:queueInit,
    getState:projectionAudit,
    auditAt(value){
      if(!initialized)return {initialized:false};
      targetProgress=progress=clamp(value);const state=evaluateCamera(progress);camera.position.copy(desiredPos);camera.lookAt(desiredTarget);camera.fov=state.fov;camera.updateProjectionMatrix();updateVisibility(state);return projectionAudit();
    }
  };

  const bootstrap=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){bootstrap.disconnect();queueInit();}},{rootMargin:'420px 0px',threshold:0});bootstrap.observe(track);
  setTimeout(()=>{if(!initialized&&!initQueued){const r=track.getBoundingClientRect();if(r.top<innerHeight*3&&r.bottom>-innerHeight)queueInit();}},1300);
})();
