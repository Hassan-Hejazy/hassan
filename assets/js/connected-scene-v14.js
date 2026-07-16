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
  let cameraSamples=[],stationKeyPoses=[],overviewStart=.82,overviewPositions=[],overviewScale=.56;
  let profile=null;
  let initialized=false,initQueued=false,initAttempts=0;
  let visible=false,pageVisible=!document.hidden;
  let targetProgress=0,progress=0,progressVelocity=0,lastTime=0;
  let activeStage=-1,overviewCopy=false;
  let resizeQueued=false,progressQueued=false;
  let liveCanvas=null,liveContext=null,liveTexture=null,lastLiveDraw=0;
  let renderRatio=1,basePixelRatio=1,qualityScale=1,rafId=0;
  let frameMs=16.7,qualityCheckedAt=0,startedAt=0;
  let cinemaKey=null,cinemaRim=null,dataOrbits=[],fitCamera=null;
  let copyToken=0;

  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tmp0=new THREE.Vector3(),tmp1=new THREE.Vector3(),tmp2=new THREE.Vector3();
  const corner=new THREE.Vector3();

  function getProfile(){
    const w=Math.max(1,Math.round(sticky.clientWidth||innerWidth));
    const h=Math.max(1,Math.round(sticky.clientHeight||innerHeight));
    const aspect=w/h;
    const compact=w<760||(coarse&&w<900);
    const tablet=!compact&&w<1180;
    const portrait=aspect<.88;
    const landscape=aspect>1.5;
    const short=h<620;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const low=memory<=3||cores<=4;
    const strong=memory>=6&&cores>=6;
    const tier=low?'low':(strong?'high':'balanced');
    const fov=compact?(portrait?41.5:39.5):(tablet?(portrait?40.5:38.5):37.5);
    const vFov=THREE.MathUtils.degToRad(fov);
    const hFov=2*Math.atan(Math.tan(vFov/2)*aspect);
    return {w,h,aspect,compact,tablet,portrait,landscape,short,memory,cores,low,strong,tier,fov,vFov,hFov};
  }

  function choosePixelRatio(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    let cap,budget;
    if(p.compact){
      cap=p.tier==='high'?2.45:(p.tier==='balanced'?2.08:1.58);
      budget=p.tier==='high'?4100000:(p.tier==='balanced'?2850000:1650000);
    }else if(p.tablet){
      cap=p.tier==='high'?2.4:(p.tier==='balanced'?2.05:1.58);
      budget=p.tier==='high'?5900000:(p.tier==='balanced'?4100000:2350000);
    }else{
      cap=p.tier==='high'?2.35:(p.tier==='balanced'?2.0:1.55);
      budget=p.tier==='high'?7600000:(p.tier==='balanced'?5200000:3000000);
    }
    return Math.max(1,Math.min(dpr,cap,Math.sqrt(budget/Math.max(1,p.w*p.h))));
  }

  function minimumPixelRatio(p){
    if(p.compact)return p.low?1.2:1.45;
    return p.low?1.2:1.4;
  }

  function applyPixelRatio(force=false){
    if(!renderer||!profile)return;
    const min=minimumPixelRatio(profile);
    const next=Math.max(min,basePixelRatio*qualityScale);
    if(!force&&Math.abs(next-renderRatio)<.045)return;
    renderRatio=next;
    renderer.setPixelRatio(renderRatio);
    renderer.setSize(profile.w,profile.h,false);
  }

  function monitorQuality(dt,now){
    if(!renderer||reduced)return;
    frameMs=lerp(frameMs,dt*1000,.055);
    if(now-startedAt<2600||now-qualityCheckedAt<2400)return;
    qualityCheckedAt=now;
    const minScale=Math.min(1,minimumPixelRatio(profile)/Math.max(1,basePixelRatio));
    let next=qualityScale;
    if(frameMs>24.5)next=Math.max(minScale,qualityScale-.1);
    else if(frameMs<17.2&&qualityScale<1)next=Math.min(1,qualityScale+.055);
    if(Math.abs(next-qualityScale)>.018){qualityScale=next;applyPixelRatio();}
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
    const high=profile.tier==='high';
    liveCanvas.width=profile.compact?(high?1024:768):(high?1600:1280);
    liveCanvas.height=Math.round(liveCanvas.width*9/16);
    liveContext=liveCanvas.getContext('2d',{alpha:false,desynchronized:true});
    liveTexture=new THREE.CanvasTexture(liveCanvas);
    liveTexture.wrapS=liveTexture.wrapT=THREE.ClampToEdgeWrapping;
    if(Q)Q.prepareTexture(liveTexture,renderer);
    drawLiveTexture(0,0,true);
    return liveTexture;
  }

  function drawLiveTexture(now,stage,force=false){
    if(!liveContext||!liveTexture)return;
    const interval=profile.compact?(profile.low?150:105):(profile.low?110:72);
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
    const platformMat=new THREE.MeshStandardMaterial({color:0x12100c,roughness:.82,metalness:.18,envMapIntensity:.62});
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(4.55,4.82,.3,profile.low?40:72),platformMat);
    platform.position.y=.15;platform.receiveShadow=renderer?.shadowMap?.enabled||false;wrapper.add(platform);
    if(Q)Q.addContactShadow(wrapper,renderer,4.72,profile.compact?.42:.5,.315);

    const ringMat=new THREE.MeshBasicMaterial({color:i%2?0x74cdbd:0xe0b55e,transparent:true,opacity:.52,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.92,4.38,profile.low?48:88),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=.31;wrapper.add(ring);stationRings.push(ring);

    const haloCount=profile.low?24:(profile.compact?38:54);
    const haloPositions=new Float32Array(haloCount*3);
    for(let h=0;h<haloCount;h++){const a=h/haloCount*Math.PI*2;const r=4.13+(h%3)*.035;haloPositions[h*3]=Math.cos(a)*r;haloPositions[h*3+1]=.355;haloPositions[h*3+2]=Math.sin(a)*r;}
    const haloGeometry=new THREE.BufferGeometry();haloGeometry.setAttribute('position',new THREE.BufferAttribute(haloPositions,3));
    const haloMaterial=new THREE.PointsMaterial({color:i%2?0x7bd8c6:0xf0ca73,size:profile.compact?.058:.07,transparent:true,opacity:.34,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    const halo=new THREE.Points(haloGeometry,haloMaterial);halo.frustumCulled=false;wrapper.add(halo);stationHalos.push(halo);

    const edgeMat=new THREE.MeshBasicMaterial({color:0xe9c36f,transparent:true,opacity:.72,depthWrite:false,toneMapped:false});
    const edge=new THREE.Mesh(new THREE.TorusGeometry(4.47,.032,8,profile.low?64:112),edgeMat);edge.rotation.x=Math.PI/2;edge.position.y=.32;wrapper.add(edge);

    const orbitColors=[0xe8c16b,0x78d4c2];
    for(let k=0;k<2;k++){
      const orbitMat=new THREE.MeshBasicMaterial({color:orbitColors[(i+k)%2],transparent:true,opacity:0,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
      const orbit=new THREE.Mesh(new THREE.TorusGeometry(3.25+k*.46,.018,6,profile.low?64:112),orbitMat);
      orbit.position.y=1.55+k*.65;orbit.rotation.set(Math.PI/2.35+k*.17,0,(i%2?1:-1)*(.38+k*.15));
      orbit.userData.station=i;orbit.userData.speed=(k?-.11:.085)*(i%2?1:-1);wrapper.add(orbit);dataOrbits.push(orbit);
    }

    const labelMat=new THREE.MeshBasicMaterial({map:makeLabelTexture(i+1,typeNames[i]),transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
    const label=new THREE.Mesh(new THREE.PlaneGeometry(3.65,.91),labelMat);label.position.set(0,1.05,3.88);wrapper.add(label);stationLabels.push(label);
    const beaconMat=new THREE.MeshBasicMaterial({color:i%2?0x76d2c0:0xebc66f,transparent:true,opacity:.75,depthWrite:false,toneMapped:false});
    const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,3.2,8),beaconMat);beacon.position.set(-4.05,1.9,2.4);wrapper.add(beacon);
  }

  function configureOverviewLayout(){
    if(profile.compact&&profile.portrait){
      overviewScale=.52;
      overviewPositions=[
        new THREE.Vector3(-3.08,0,5.15),new THREE.Vector3(3.08,0,5.15),
        new THREE.Vector3(-3.08,0,0),new THREE.Vector3(3.08,0,0),
        new THREE.Vector3(-3.08,0,-5.15),new THREE.Vector3(3.08,0,-5.15)
      ];
    }else if(profile.compact||profile.tablet){
      overviewScale=.52;
      overviewPositions=[
        new THREE.Vector3(-5.15,0,3.85),new THREE.Vector3(0,0,3.85),new THREE.Vector3(5.15,0,3.85),
        new THREE.Vector3(-5.15,0,-3.85),new THREE.Vector3(0,0,-3.85),new THREE.Vector3(5.15,0,-3.85)
      ];
    }else{
      overviewScale=.57;
      overviewPositions=[
        new THREE.Vector3(-5.85,0,4.15),new THREE.Vector3(0,0,4.15),new THREE.Vector3(5.85,0,4.15),
        new THREE.Vector3(-5.85,0,-4.15),new THREE.Vector3(0,0,-4.15),new THREE.Vector3(5.85,0,-4.15)
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
      gold:new THREE.MeshPhysicalMaterial({color:0xd4ad5d,metalness:.72,roughness:.22,clearcoat:.38,clearcoatRoughness:.16,envMapIntensity:1.3}),
      goldDark:new THREE.MeshStandardMaterial({color:0x765527,metalness:.52,roughness:.34,envMapIntensity:.95}),
      dark:new THREE.MeshStandardMaterial({color:0x1d1813,metalness:.3,roughness:.44,envMapIntensity:.82}),
      cream:new THREE.MeshStandardMaterial({color:0xeee1c8,roughness:.56,envMapIntensity:.58}),
      white:new THREE.MeshStandardMaterial({color:0xf8f3e9,roughness:.6,envMapIntensity:.52}),
      teal:new THREE.MeshStandardMaterial({color:0x609f92,metalness:.2,roughness:.32,envMapIntensity:.94}),
      glass:new THREE.MeshPhysicalMaterial({color:0xd2ebe5,transparent:true,opacity:.3,roughness:.05,transmission:.58,clearcoat:.35,depthWrite:false,envMapIntensity:1.25}),
      screen:new THREE.MeshStandardMaterial({map:liveTexture,emissiveMap:liveTexture,emissive:0x73cdbb,emissiveIntensity:1.28,roughness:.2}),
      red:new THREE.MeshStandardMaterial({color:0x91473b,roughness:.44})
    };
    factory?.setShadowEnabled?.(Boolean(renderer?.shadowMap?.enabled));
    stations=[];stationBoxes=[];stationLights=[];stationRings=[];stationLabels=[];stationHalos=[];dataOrbits=[];
    types.forEach((type,i)=>{
      const wrapper=new THREE.Group();wrapper.position.set(0,0,0);wrapper.userData.index=i;
      addStationPlatform(wrapper,i,fallbackMaterials);
      const detail=new THREE.Group();detail.name='detail';
      if(factory?.factories?.[type])factory.factories[type](detail,fallbackMaterials);else detail.add(makeProxy(type,fallbackMaterials));
      detail.scale.setScalar(.74);detail.position.y=.32;replaceLiveScreenMaterials(detail,fallbackMaterials);wrapper.add(detail);
      const proxy=makeProxy(type,fallbackMaterials);proxy.name='proxy';proxy.scale.setScalar(.72);proxy.position.y=.32;proxy.visible=false;wrapper.add(proxy);
      const light=new THREE.PointLight(i%2?0x72d0bf:0xe7ba60,0,15,2);light.position.set(i%2?2.8:-2.8,4.0,2.2);wrapper.add(light);stationLights.push(light);
      root.add(wrapper);wrapper.updateMatrixWorld(true);
      // Camera fitting must use the architecture itself, not the oversized platform,
      // label, route ring or decorative particles. Including those elements was the
      // main reason the previous phone and desktop views looked excessively zoomed out.
      const detailBox=new THREE.Box3().setFromObject(detail);
      const localBox=detailBox.clone();
      localBox.min.sub(new THREE.Vector3(.28,.08,.28));
      localBox.max.add(new THREE.Vector3(.28,.24,.28));
      localBox.min.y=Math.min(.16,localBox.min.y);
      wrapper.position.copy(centers[i]);wrapper.updateMatrixWorld(true);
      stationBoxes.push(localBox);stations.push({wrapper,detail,proxy,light,materials:fallbackMaterials});
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
    return boxAt(i,wrapper.position,wrapper.scale.x);
  }

  function safeFrame(){
    const rtl=document.documentElement.dir==='rtl';
    if(profile.compact&&profile.portrait)return {left:-.91,right:.91,bottom:-.28,top:.86};
    if(profile.compact&&profile.landscape)return rtl?{left:-.93,right:.12,bottom:-.79,top:.83}:{left:-.12,right:.93,bottom:-.79,top:.83};
    if(profile.tablet)return rtl?{left:-.94,right:.14,bottom:-.77,top:.85}:{left:-.14,right:.94,bottom:-.77,top:.85};
    return rtl?{left:-.95,right:.12,bottom:-.79,top:.87}:{left:-.12,right:.95,bottom:-.79,top:.87};
  }

  function cameraPosition(target,yaw,elev,distance,out=new THREE.Vector3()){
    const horizontal=Math.cos(elev)*distance;
    return out.set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
  }

  function composeTarget(box){
    const center=new THREE.Vector3();const size=new THREE.Vector3();box.getCenter(center);box.getSize(size);
    const safe=safeFrame();const cx=(safe.left+safe.right)*.5;const cy=(safe.bottom+safe.top)*.5;
    const rtl=document.documentElement.dir==='rtl';
    center.x-=cx*size.x*(profile.compact&&profile.portrait?.18:.52);
    center.y-=cy*size.y*(profile.compact?.72:.6);
    if(profile.compact&&profile.portrait)center.y-=size.y*.035;
    if(!profile.compact)center.x+=(rtl?1:-1)*size.x*.025;
    return center;
  }

  function projectedBounds(box,target,yaw,elev,distance,fov=profile.fov){
    if(!fitCamera)fitCamera=new THREE.PerspectiveCamera(fov,profile.aspect,.08,220);
    fitCamera.fov=fov;fitCamera.aspect=profile.aspect;fitCamera.near=.08;fitCamera.far=220;fitCamera.updateProjectionMatrix();
    fitCamera.position.copy(cameraPosition(target,yaw,elev,distance,tmp2));fitCamera.up.set(0,1,0);fitCamera.lookAt(target);fitCamera.updateMatrixWorld(true);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
    boxCorners(box).forEach(p=>{const ndc=p.clone().project(fitCamera);if(!Number.isFinite(ndc.x)||ndc.z>1||ndc.z<-1)behind=true;minX=Math.min(minX,ndc.x);maxX=Math.max(maxX,ndc.x);minY=Math.min(minY,ndc.y);maxY=Math.max(maxY,ndc.y);});
    return {minX,minY,maxX,maxY,behind};
  }

  function fitDistance(box,target,yaw,elev,fov=profile.fov,padding=.035){
    const safe=safeFrame();
    const frame={left:safe.left+padding,right:safe.right-padding,bottom:safe.bottom+padding,top:safe.top-padding};
    const fits=d=>{const b=projectedBounds(box,target,yaw,elev,d,fov);return !b.behind&&b.minX>=frame.left&&b.maxX<=frame.right&&b.minY>=frame.bottom&&b.maxY<=frame.top;};
    let low=2.5,high=profile.compact?8:7;
    while(!fits(high)&&high<150)high*=1.32;
    for(let i=0;i<18;i++){const mid=(low+high)*.5;if(fits(mid))high=mid;else low=mid;}
    return high*(profile.compact?1.025:1.018);
  }

  function framedPose(box,yaw,elev,fov,padding){
    const safe=safeFrame();const desiredX=(safe.left+safe.right)*.5,desiredY=(safe.bottom+safe.top)*.5;
    const target=new THREE.Vector3();box.getCenter(target);let distance=0;
    for(let pass=0;pass<7;pass++){
      distance=fitDistance(box,target,yaw,elev,fov,padding);
      const bounds=projectedBounds(box,target,yaw,elev,distance,fov);
      const currentX=(bounds.minX+bounds.maxX)*.5,currentY=(bounds.minY+bounds.maxY)*.5;
      const dir=new THREE.Vector3(Math.sin(yaw)*Math.cos(elev),Math.sin(elev),Math.cos(yaw)*Math.cos(elev)).normalize();
      const forward=dir.clone().multiplyScalar(-1);
      // Camera-local basis. `forward x worldUp` is the actual screen-right axis.
      // The previous reversed cross product pushed desktop framing farther away
      // from the requested safe frame on every correction pass.
      const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
      const camUp=new THREE.Vector3().crossVectors(right,forward).normalize();
      const halfV=Math.tan(THREE.MathUtils.degToRad(fov)*.5)*distance;const halfH=halfV*profile.aspect;
      target.addScaledVector(right,-(desiredX-currentX)*halfH);
      target.addScaledVector(camUp,-(desiredY-currentY)*halfV);
    }
    distance=fitDistance(box,target,yaw,elev,fov,padding);
    return {pos:cameraPosition(target,yaw,elev,distance,new THREE.Vector3()),target,distance};
  }

  function stationPose(i,variant=0){
    const local=variant===0?0:(variant===1?.34:.68);
    return stationPoseAt(i,local);
  }

  function stationBaseYaw(i){
    const mobile=[.56,-.52,.59,-.49,.54,-.58];
    const tablet=[.64,-.59,.66,-.56,.60,-.63];
    const desktop=[.70,-.65,.72,-.61,.66,-.69];
    return (profile.compact?mobile:(profile.tablet?tablet:desktop))[i];
  }

  function computeStationPose(i,local=0){
    const box=boxAt(i,centers[i],1);
    const phase=smoother(clamp(local/.68));
    const direction=i%2?-1:1;
    const orbit=lerp(-1,1,phase)*direction*(profile.compact?.038:.052);
    const yaw=stationBaseYaw(i)+orbit;
    const elevationProfiles=profile.compact?[.205,.215,.19,.205,.195,.21]:(profile.tablet?[.22,.235,.21,.22,.215,.225]:[.235,.245,.225,.235,.228,.238]);
    const elev=elevationProfiles[i];
    const fov=profile.fov-Math.sin(phase*Math.PI)*.3;
    const framed=framedPose(box,yaw,elev,fov,profile.compact?.026:.024);
    return {pos:framed.pos,target:framed.target,fov,stage:i,overview:false,yaw};
  }

  function stationPoseAt(i,local=0){
    const keys=stationKeyPoses[i];
    if(!keys||keys.length<3)return computeStationPose(i,local);
    const normalized=clamp(local/.68)*2;
    const segment=Math.min(1,Math.floor(normalized));
    const u=smoother(normalized-segment);
    const a=keys[segment],b=keys[segment+1];
    return {
      pos:a.pos.clone().lerp(b.pos,u),
      target:a.target.clone().lerp(b.target,u),
      fov:lerp(a.fov,b.fov,u),
      stage:i,overview:false,
      yaw:a.yaw+Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))*u
    };
  }

  function transitionPlacement(i,q){
    // Stations stay at their real route anchors. The transition is created by the
    // camera travelling between them, not by shrinking complete environments to dots.
    return {activePos:centers[i],nextPos:centers[i+1],activeScale:1,nextScale:1,ease:smoother(clamp(q))};
  }

  function transitionPose(i,q=.5){
    const t=smoother(clamp(q));
    const a=stationPoseAt(i,.68),b=stationPoseAt(i+1,0);
    const pa=centers[i],pb=centers[i+1];
    const axis=pb.clone().sub(pa);axis.y=0;axis.normalize();
    const side=new THREE.Vector3(-axis.z,0,axis.x).multiplyScalar(i%2?-1:1);
    const midTarget=pa.clone().lerp(pb,.5);midTarget.y=profile.compact?1.55:1.7;
    const midPos=midTarget.clone()
      .addScaledVector(side,profile.compact?(profile.portrait?5.15:5.9):7.15)
      .add(new THREE.Vector3(0,profile.compact?3.35:4.55,0))
      .addScaledVector(axis,-(profile.compact?.55:.85));
    const omt=1-t;
    const pos=a.pos.clone().multiplyScalar(omt*omt)
      .add(midPos.clone().multiplyScalar(2*omt*t))
      .add(b.pos.clone().multiplyScalar(t*t));
    const target=a.target.clone().multiplyScalar(omt*omt)
      .add(midTarget.clone().multiplyScalar(2*omt*t))
      .add(b.target.clone().multiplyScalar(t*t));
    const fov=lerp(a.fov,b.fov,t)+Math.sin(Math.PI*t)*(profile.compact?2.2:2.8);
    return {pos,target,fov,stage:i,overview:false,bridge:true};
  }

  function boxAt(index,position,scale){
    const local=stationBoxes[index];
    return new THREE.Box3(local.min.clone().multiplyScalar(scale).add(position),local.max.clone().multiplyScalar(scale).add(position));
  }

  function overviewCenter(){
    const c=new THREE.Vector3();overviewPositions.forEach(p=>c.add(p));return c.multiplyScalar(1/overviewPositions.length);
  }

  function overviewPlacement(i,q){
    const delay=(5-i)*.045;
    const e=i===5?smoother(clamp(q)):smoother(clamp((q-delay)/Math.max(.001,1-delay)));
    const origin=centers[5];
    const position=origin.clone().lerp(overviewPositions[i],e);
    const scale=i===5?lerp(1,overviewScale,e):lerp(.018,overviewScale,e);
    return {position,scale,reveal:i===5?1:e};
  }

  function overviewPose(amount=1){
    const all=new THREE.Box3();
    stationBoxes.forEach((_,i)=>{
      const p=overviewPlacement(i,amount);
      all.union(boxAt(i,p.position,p.scale));
    });
    const e=smoother(clamp(amount));
    const endYaw=profile.compact?(profile.portrait?.08:.24):.36;
    const startYaw=stationBaseYaw(5);
    const yaw=startYaw+Math.atan2(Math.sin(endYaw-startYaw),Math.cos(endYaw-startYaw))*e;
    const startElev=profile.compact?.21:.238;
    const endElev=profile.compact?(profile.portrait?.37:.31):.315;
    const elev=lerp(startElev,endElev,e);
    const fov=lerp(profile.fov,profile.fov+(profile.compact?.8:.5),e);
    const framed=framedPose(all,yaw,elev,fov,profile.compact?.045:.04);
    return {pos:framed.pos,target:framed.target,fov,stage:5,overview:true};
  }

  function timelineInfo(p){
    if(p>=overviewStart)return {stage:5,local:1,transition:false,transitionQ:0,next:5};
    const span=overviewStart/6;
    const raw=p/span;
    const stage=clamp(Math.floor(raw),0,5);
    const local=raw-stage;
    const transition=stage<5&&local>.68;
    return {stage,local,transition,transitionQ:transition?clamp((local-.68)/.32):0,next:Math.min(5,stage+1)};
  }

  function directCameraPose(p){
    p=clamp(p);
    if(p>=overviewStart){
      const q=clamp((p-overviewStart)/(1-overviewStart));
      return overviewPose(q);
    }
    const info=timelineInfo(p);
    return info.transition?transitionPose(info.stage,info.transitionQ):stationPoseAt(info.stage,info.local);
  }

  function buildCameraPath(){
    stationKeyPoses=types.map((_,i)=>[
      computeStationPose(i,0),
      computeStationPose(i,.34),
      computeStationPose(i,.68)
    ]);
    cameraSamples=[];
    const count=profile.low?81:(profile.compact?121:151);
    for(let i=0;i<count;i++){
      const t=i/(count-1);const pose=directCameraPose(t);
      cameraSamples.push({t,pos:pose.pos.clone(),target:pose.target.clone(),fov:pose.fov});
    }
  }

  function evaluateCamera(p){
    p=clamp(p);
    if(!cameraSamples.length){
      const pose=directCameraPose(p);desiredPos.copy(pose.pos);desiredTarget.copy(pose.target);
      const info=timelineInfo(p);return {fov:pose.fov,...info,overview:p>=overviewStart,overviewQ:clamp((p-overviewStart)/(1-overviewStart))};
    }
    const scaled=p*(cameraSamples.length-1);const i=Math.min(cameraSamples.length-2,Math.floor(scaled));const u=scaled-i;
    const a=cameraSamples[i],b=cameraSamples[i+1];
    desiredPos.lerpVectors(a.pos,b.pos,u);desiredTarget.lerpVectors(a.target,b.target,u);
    const info=timelineInfo(p);
    return {fov:lerp(a.fov,b.fov,u),...info,overview:p>=overviewStart,overviewQ:clamp((p-overviewStart)/(1-overviewStart))};
  }

  function updateVisibility(state){
    const active=state.stage,next=Math.min(5,active+1),overview=state.overview;
    const q=state.transitionQ||0;
    stations.forEach((s,i)=>{
      if(overview){
        const p=overviewPlacement(i,state.overviewQ);
        const show=i===5||p.reveal>.025;
        s.wrapper.visible=show;s.wrapper.position.copy(p.position);s.wrapper.scale.setScalar(p.scale);
        const detailAllowed=show&&!profile.low&&(!profile.compact||i===5||state.overviewQ>.78);
        s.detail.visible=detailAllowed;s.proxy.visible=show&&!detailAllowed;
        s.light.intensity=show?.18+.26*p.reveal:0;
      }else{
        const outgoing=i===active&&(!state.transition||q<.64);
        const incoming=i===next&&state.transition&&q>.36;
        const show=outgoing||incoming;
        s.wrapper.visible=show;s.wrapper.position.copy(centers[i]);s.wrapper.scale.setScalar(1);
        const fullOutgoing=outgoing&&q<.50;
        const fullIncoming=incoming&&q>.50;
        const detailAllowed=show&&(fullOutgoing||fullIncoming||(!profile.compact&&!profile.low));
        s.detail.visible=detailAllowed;s.proxy.visible=show&&!detailAllowed;
        s.light.intensity=outgoing?lerp(1.5,.28,q):(incoming?lerp(.28,1.42,q):0);
      }
      const ring=stationRings[i];if(ring)ring.material.opacity=overview?.31:(i===active?lerp(.82,.24,q):(i===next?lerp(.16,.76,q):.06));
      const label=stationLabels[i];if(label){label.visible=!profile.compact||overview;label.material.opacity=overview?.54:(i===active?lerp(.9,.18,q):(i===next?lerp(.1,.82,q):.04));}
      const halo=stationHalos[i];if(halo)halo.material.opacity=overview?.25:(i===active?lerp(.56,.16,q):(i===next?lerp(.08,.5,q):.04));
    });
    dataOrbits.forEach(o=>{const i=o.userData.station;o.material.opacity=overview?.15:(i===active?lerp(.3,.06,q):(i===next?lerp(.02,.27,q):0));});
  }

  function updateCopy(state){
    const overview=state.overview&&state.overviewQ>.66;const stage=state.stage;
    if(stage===activeStage&&overview===overviewCopy)return;
    activeStage=stage;overviewCopy=overview;const lang=document.documentElement.lang==='ar'?'ar':'en';const token=++copyToken;
    copyBox?.classList.add('switching');
    requestAnimationFrame(()=>{
      if(token!==copyToken)return;
      if(overview){
        if(index)index.textContent='06 / 06';
        if(title)title.textContent=lang==='ar'?'منظومة تنفيذ واحدة متكاملة':'One connected delivery system';
        if(body)body.textContent=lang==='ar'?'تجتمع الخدمات الست ضمن تكوين واحد واضح يمثل رحلة التنفيذ من الفكرة حتى الافتتاح.':'All six disciplines resolve into one clear production system from concept through opening day.';
        rail.forEach(x=>x.classList.add('active'));
      }else{
        const item=copy[lang][stage];if(index)index.textContent=String(stage+1).padStart(2,'0')+' / 06';if(title)title.textContent=item[0];if(body)body.textContent=item[1];rail.forEach((x,i)=>x.classList.toggle('active',i===stage));
      }
      requestAnimationFrame(()=>{if(token===copyToken)copyBox?.classList.remove('switching');});
    });
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
    resizeQueued=false;if(!renderer||!camera)return;
    profile=getProfile();configureOverviewLayout();if(root)createOverviewLinks();
    basePixelRatio=choosePixelRatio(profile);qualityScale=1;applyPixelRatio(true);
    camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    if(scene?.fog)scene.fog.density=profile.compact?.009:.0072;
    buildCameraPath();readProgress();progressVelocity=0;
    const state=evaluateCamera(progress);camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);camera.fov=state.fov;camera.updateProjectionMatrix();updateVisibility(state);
  }

  function scheduleResize(){
    if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);
  }

  function animateScene(now,state,dt){
    const t=now*.001;drawLiveTexture(now,state.stage);
    routeMarkers.forEach((m,i)=>{const u=(t*m.userData.speed+m.userData.offset)%1;m.position.copy(routeCurve.getPointAt(u));m.position.y=.38+Math.sin(t*3.1+i)*.022;m.scale.setScalar(.72+.23*Math.sin(Math.PI*u));m.material.opacity=.58+.38*Math.sin(Math.PI*u);});
    const routeFade=state.overview?1-smoother(clamp(state.overviewQ/.72)):1;
    if(routeGlow){routeGlow.material.emissiveIntensity=.42+.16*Math.sin(t*1.45);routeGlow.material.opacity=(.8+.09*Math.sin(t*1.15))*routeFade;}
    if(routeCore)routeCore.material.opacity=(.74+.2*Math.sin(t*1.7))*routeFade;
    if(overviewLinks){overviewLinks.visible=state.overview&&state.overviewQ>.34;const linkOpacity=.78*smoother(clamp((state.overviewQ-.34)/.46));overviewLinkMeshes.forEach((m,i)=>m.material.opacity=linkOpacity*(.84+.16*Math.sin(t*1.65+i*.5)));}
    scanBeams.forEach((beam,i)=>{const active=i===state.stage?1:(state.overview?.48:.06);beam.material.opacity=(i%2?.022:.028)*lerp(.5,2.9,active)*(1+.14*Math.sin(t*.76+i));beam.rotation.y=t*.016*(i%2?1:-1);});
    stationRings.forEach((ring,i)=>{const pulse=1+Math.sin(t*1.5+i*.72)*.012;ring.scale.set(pulse,pulse,pulse);});
    stationHalos.forEach((halo,i)=>{halo.rotation.y=t*(i%2?.105:-.105);const pulse=1+Math.sin(t*2+i*.63)*.017;halo.scale.setScalar(pulse);});
    dataOrbits.forEach((orbit,i)=>{orbit.rotation.y+=orbit.userData.speed*dt;orbit.rotation.z+=Math.sin(t*.38+i)*.00035*dt*60;});
    stations.forEach((s,i)=>{if(s.detail.visible)factory?.animate?.(s.detail,t+i*.18);});
    stationLabels.forEach(label=>{if(label.visible)label.lookAt(camera.position);});
    if(ambientParticles){ambientParticles.rotation.y=Math.sin(t*.09)*.018;ambientParticles.position.y=Math.sin(t*.17)*.07;}
    const focus=state.overview?overviewCenter():stations[state.stage]?.wrapper?.position||centers[state.stage];
    const lightAlpha=1-Math.exp(-6.5*dt);
    if(cinemaKey){const desired=tmp0.copy(focus).add(new THREE.Vector3(profile.compact?4.5:6.8,profile.compact?7:9.2,profile.compact?4.2:6.4));cinemaKey.position.lerp(desired,lightAlpha);cinemaKey.intensity=state.overview?.8:1.25;}
    if(cinemaRim){const desired=tmp1.copy(focus).add(new THREE.Vector3(profile.compact?-4.2:-6.4,profile.compact?4.4:5.8,-4.6));cinemaRim.position.lerp(desired,lightAlpha);cinemaRim.intensity=state.overview?.55:.82;}
  }

  function startLoop(){
    if(!rafId&&initialized&&visible&&pageVisible){lastTime=0;rafId=requestAnimationFrame(render);}
  }

  function stopLoop(){if(rafId){cancelAnimationFrame(rafId);rafId=0;}}

  function render(now){
    rafId=0;if(!renderer||!scene||!camera||!visible||!pageVisible)return;
    const dt=lastTime?Math.min(.04,(now-lastTime)/1000):1/60;lastTime=now;
    if(reduced){progress=targetProgress;progressVelocity=0;}
    else{
      // Critically damped scroll spring: responsive enough for touch swipes and
      // mouse wheels, but continuous frame-to-frame with no capped-step lag.
      const stiffness=profile.compact?78:70;
      const damping=profile.compact?17:16;
      progressVelocity+=(targetProgress-progress)*stiffness*dt;
      progressVelocity*=Math.exp(-damping*dt);
      progress+=progressVelocity*dt;
      if(Math.abs(targetProgress-progress)<.00003&&Math.abs(progressVelocity)<.00005){progress=targetProgress;progressVelocity=0;}
      progress=clamp(progress);
    }
    const state=evaluateCamera(progress);
    camera.position.copy(desiredPos);camera.up.set(0,1,0);camera.lookAt(desiredTarget);
    if(Math.abs(camera.fov-state.fov)>.004){camera.fov=state.fov;camera.updateProjectionMatrix();}
    updateVisibility(state);copyBox?.classList.toggle('in-transit',Boolean(state.transition));updateCopy(state);animateScene(now,state,dt);
    sticky.style.setProperty('--connected-progress',progress.toFixed(4));sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');if(indicator)indicator.style.opacity=progress>.94?'0':'1';
    renderer.render(scene,camera);monitorQuality(dt,now);
    if(!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
    rafId=requestAnimationFrame(render);
  }

  function resetCanvas(){
    if(!canvas?.isConnected)return;
    const clone=canvas.cloneNode(false);clone.width=1;clone.height=1;clone.style.pointerEvents='none';clone.style.touchAction='pan-y';canvas.replaceWith(clone);canvas=clone;
  }

  function bind(){
    canvas.style.pointerEvents='none';canvas.style.touchAction='pan-y';
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();sticky.classList.remove('model-active');if(fallback)fallback.style.opacity='.34';stopLoop();
      try{renderer?.dispose?.();}catch(_){}
      renderer=scene=camera=root=null;stations=[];stationBoxes=[];initialized=false;initQueued=false;resetCanvas();setTimeout(queueInit,620);
    },{once:true});
    const io=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting);
      if(visible){lastTime=0;readProgress();scheduleResize();startLoop();}else stopLoop();
    },{rootMargin:'220px 0px',threshold:0});io.observe(sticky);
    addEventListener('scroll',scheduleProgress,{passive:true});
    addEventListener('resize',scheduleResize,{passive:true});
    addEventListener('orientationchange',()=>setTimeout(scheduleResize,180),{passive:true});
    if('ResizeObserver'in window){const ro=new ResizeObserver(scheduleResize);ro.observe(sticky);ro.observe(track);}
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;lastTime=0;if(pageVisible&&visible)startLoop();else stopLoop();});
    document.addEventListener('languagechange',()=>{activeStage=-1;overviewCopy=false;updateCopy(evaluateCamera(progress));});
  }

  function init(){
    if(initialized)return;
    initialized=true;initQueued=false;initAttempts+=1;profile=getProfile();configureOverviewLayout();
    try{
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:profile.low?'default':'high-performance',precision:profile.low?'mediump':'highp',stencil:false,preserveDrawingBuffer:false,depth:true});
    }catch(_){
      try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'default',precision:'mediump',stencil:false,preserveDrawingBuffer:false,depth:true});}
      catch(__){initialized=false;if(fallback)fallback.style.opacity='.48';resetCanvas();if(initAttempts<3)setTimeout(queueInit,760*initAttempts);return;}
    }
    basePixelRatio=choosePixelRatio(profile);qualityScale=1;renderRatio=basePixelRatio;
    if(Q)Q.configureRenderer(renderer,{exposure:1.16,pixelCap:renderRatio});
    else{renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;}
    applyPixelRatio(true);renderer.setClearColor(0x070605,1);renderer.sortObjects=true;
    renderer.shadowMap.enabled=!profile.compact&&!profile.low&&profile.w>=980;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=true;

    scene=new THREE.Scene();scene.background=new THREE.Color(0x070605);scene.fog=new THREE.FogExp2(0x070605,profile.compact?.0095:.0076);if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);
    scene.add(new THREE.HemisphereLight(0xf4e4c5,0x070807,1.02));
    const key=new THREE.DirectionalLight(0xffe5b8,1.32);key.position.set(8,12,9);key.castShadow=renderer.shadowMap.enabled;
    if(key.castShadow){const size=profile.tier==='high'?2048:1536;key.shadow.mapSize.set(size,size);key.shadow.camera.left=-15;key.shadow.camera.right=15;key.shadow.camera.top=15;key.shadow.camera.bottom=-15;key.shadow.bias=-.00025;key.shadow.normalBias=.026;key.shadow.radius=3;}scene.add(key);
    const warm=new THREE.PointLight(0xe2b25a,.52,52,2);warm.position.set(8,7,5);scene.add(warm);
    const cool=new THREE.PointLight(0x70c9ba,.46,52,2);cool.position.set(-8,5,-18);scene.add(cool);
    cinemaKey=new THREE.PointLight(0xffd99d,1.25,30,1.7);cinemaKey.position.set(5,8,5);scene.add(cinemaKey);
    cinemaRim=new THREE.PointLight(0x73d3c1,.82,28,1.8);cinemaRim.position.set(-5,5,-5);scene.add(cinemaRim);

    const floorTex=makeGradientTexture();if(Q)Q.prepareTexture(floorTex,renderer);
    const floorMat=new THREE.MeshStandardMaterial({color:0x11100d,map:floorTex,roughness:.9,metalness:.07,envMapIntensity:.4});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(32,64),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set(0,0,-17);floor.receiveShadow=renderer.shadowMap.enabled;root.add(floor);
    const grid=new THREE.GridHelper(66,58,0x7b5826,0x211a13);grid.position.z=-17;grid.position.y=.012;grid.material.transparent=true;grid.material.opacity=.075;root.add(grid);

    liveTexture=makeLiveTexture();buildStations();createRoute(stations[0]?.materials);createOverviewLinks();createScanBeams();createParticles();
    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.08,220);scene.add(camera);buildCameraPath();
    const initial=evaluateCamera(0);camera.position.copy(desiredPos);camera.lookAt(desiredTarget);camera.fov=initial.fov;camera.updateProjectionMatrix();
    startedAt=performance.now();qualityCheckedAt=startedAt;frameMs=16.7;
    bind();readProgress();if(visible)startLoop();
  }

  function queueInit(){
    if(initialized||initQueued)return;initQueued=true;
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:true}}));
    setTimeout(()=>{if(!initialized){try{init();}catch(error){console.error('[By Meli] Connected V14 failed:',error);initialized=false;initQueued=false;if(fallback)fallback.style.opacity='.46';if(initAttempts<3)setTimeout(queueInit,720);}}},260);
  }

  function projectionAudit(){
    if(!camera||!profile)return {initialized:false};
    camera.updateMatrixWorld(true);const info=timelineInfo(progress);const frame=safeFrame();
    const state={initialized:true,progress,...info,profile:{w:profile.w,h:profile.h,tier:profile.tier,pixelRatio:renderRatio},frame,camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,fov:camera.fov},target:{x:desiredTarget.x,y:desiredTarget.y,z:desiredTarget.z},items:[]};
    stations.forEach((station,i)=>{
      if(!station.wrapper.visible)return;
      const box=stationWorldBox(i);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
      boxCorners(box).forEach(p=>{const ndc=p.clone().project(camera);if(!Number.isFinite(ndc.x)||ndc.z>1||ndc.z<-1)behind=true;minX=Math.min(minX,ndc.x);maxX=Math.max(maxX,ndc.x);minY=Math.min(minY,ndc.y);maxY=Math.max(maxY,ndc.y);});
      state.items.push({i,minX,maxX,minY,maxY,behind,detail:station.detail.visible,inside:!behind&&minX>=frame.left-.035&&maxX<=frame.right+.035&&minY>=frame.bottom-.035&&maxY<=frame.top+.035});
    });
    return state;
  }

  window.ByMeliConnectedV14={
    forceInit:queueInit,
    getState:projectionAudit,
    auditAt(value){
      if(!initialized)return {initialized:false};
      targetProgress=progress=clamp(value);const state=evaluateCamera(progress);camera.position.copy(desiredPos);camera.lookAt(desiredTarget);camera.fov=state.fov;camera.updateProjectionMatrix();updateVisibility(state);return projectionAudit();
    }
  };

  window.ByMeliConnectedV13=window.ByMeliConnectedV14;

  const bootstrap=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){bootstrap.disconnect();queueInit();}},{rootMargin:'420px 0px',threshold:0});bootstrap.observe(track);
  setTimeout(()=>{if(!initialized&&!initQueued){const r=track.getBoundingClientRect();if(r.top<innerHeight*3&&r.bottom>-innerHeight)queueInit();}},1300);
})();
