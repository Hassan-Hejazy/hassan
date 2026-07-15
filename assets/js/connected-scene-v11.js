(function(){
  'use strict';

  let canvas=document.getElementById('connectedCanvas');
  const track=document.getElementById('connectedTrack');
  if(!canvas||!track||!window.THREE)return;

  const sticky=canvas.closest('.connected-sticky');
  const fallback=sticky.querySelector('.connected-fallback');
  const copyBox=sticky.querySelector('.connected-copy');
  const title=document.getElementById('connectedTitle');
  const body=document.getElementById('connectedBody');
  const index=document.getElementById('connectedIndex');
  const rail=Array.from(document.querySelectorAll('#connectedRail span'));
  const indicator=document.getElementById('connectedScrollIndicator');
  const Q=window.BYMELI_QUALITY||null;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;

  const clamp=v=>Math.max(0,Math.min(1,v));
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

  let renderer,scene,camera,root,routeGroup,overviewLinks;
  let routeCurves=[],routeSegments=[],motionMarkers=[];
  let lightBeams=[],floorHalos=[],activeLights=[],dustField=null;
  let liveScreenTexture=null,liveScreenCanvas=null,liveScreenContext=null,lastScreenDraw=0;
  let cameraKeyLight=null,cameraFillLight=null,followSpot=null,followTarget=null;
  let stations=[];
  let stationSpheres=[];
  let stationBoxes=[];
  let normalPositions=[];
  let overviewPositions=[];
  let profile;
  let initialized=false;
  let initQueued=false;
  let initAttempts=0;
  let visible=false;
  let pageVisible=!document.hidden;
  let targetProgress=0;
  let progress=0;
  let lastTime=0;
  let currentStage=-1;
  let overviewState=false;
  let renderRatio=1,baseRenderRatio=1,frameMs=16.7,qualityFrames=0,progressReadQueued=false;
  let cameraRoll=0,desiredRoll=0,currentFov=0;

  const cameraPos=new THREE.Vector3();
  const cameraTarget=new THREE.Vector3();
  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tempA=new THREE.Vector3();
  const tempB=new THREE.Vector3();
  const tempC=new THREE.Vector3();
  const tempD=new THREE.Vector3();

  function cubicPoint(out,p0,p1,p2,p3,t){
    const inv=1-t,inv2=inv*inv,t2=t*t;
    out.set(
      inv2*inv*p0.x+3*inv2*t*p1.x+3*inv*t2*p2.x+t2*t*p3.x,
      inv2*inv*p0.y+3*inv2*t*p1.y+3*inv*t2*p2.y+t2*t*p3.y,
      inv2*inv*p0.z+3*inv2*t*p1.z+3*inv*t2*p2.z+t2*t*p3.z
    );
    return out;
  }

  const M={};
  const BASE_RADIUS=4.65;

  function getProfile(){
    const w=Math.max(1,sticky.clientWidth||innerWidth);
    const h=Math.max(1,sticky.clientHeight||innerHeight);
    const aspect=w/h;
    const mobile=w<760;
    const tablet=w>=760&&w<1100;
    const portrait=aspect<.78;
    const landscape=aspect>1.35;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const strong=memory>=6&&cores>=6;
    const low=mobile&&(memory<=3||cores<=4);
    const fov=mobile?(portrait?49:46):(tablet?(portrait?46:43):39.5);
    const vFov=THREE.MathUtils.degToRad(fov);
    const hFov=2*Math.atan(Math.tan(vFov/2)*aspect);
    const displayScale=mobile?(portrait?.91:.95):(tablet?.96:1.0);
    return {w,h,aspect,mobile,tablet,portrait,landscape,memory,cores,strong,low,fov,vFov,hFov,displayScale};
  }

  function pixelRatio(p){
    const dpr=window.devicePixelRatio||1;
    const cap=p.mobile?(p.low?1.4:(p.strong?2.2:1.88)):(p.tablet?(p.strong?2.3:2.0):(p.strong?2.6:2.25));
    const maxPixels=p.mobile?(p.low?1550000:(p.strong?3300000:2500000)):(p.tablet?(p.strong?4800000:3700000):(p.strong?7600000:5800000));
    return Math.max(1,Math.min(dpr,cap,Math.sqrt(maxPixels/Math.max(1,p.w*p.h))));
  }

  function localBoxSize(index){
    const size=new THREE.Vector3();
    stationBoxes[index].getSize(size);
    return size.multiplyScalar(stations[index].scale.x);
  }

  function stageBoxCenter(index){
    const center=new THREE.Vector3();
    stationBoxes[index].getCenter(center);
    return center.multiplyScalar(stations[index].scale.x).add(stations[index].position);
  }

  function fitStageDistance(index,yaw,elev,margin=1){
    const size=localBoxSize(index);
    const halfW=(Math.abs(Math.cos(yaw))*size.x+Math.abs(Math.sin(yaw))*size.z)*.5;
    const halfD=(Math.abs(Math.sin(yaw))*size.x+Math.abs(Math.cos(yaw))*size.z)*.5;
    const halfH=size.y*.5;
    const usableV=profile.mobile?(profile.portrait?.63:.72):(profile.tablet?.79:.86);
    const usableH=profile.mobile?(profile.portrait?.9:.92):(profile.tablet?.86:.76);
    const tanV=Math.tan(profile.vFov*.5)*usableV;
    const tanH=Math.tan(profile.hFov*.5)*usableH;
    const byHeight=halfH/Math.max(.08,tanV);
    const byWidth=halfW/Math.max(.08,tanH);
    return Math.max(profile.mobile?8.0:7.15,Math.max(byHeight,byWidth)*margin+halfD*.56+1.0);
  }

  function fitBoundsDistance(size,yaw,margin=1){
    const halfW=(Math.abs(Math.cos(yaw))*size.x+Math.abs(Math.sin(yaw))*size.z)*.5;
    const halfD=(Math.abs(Math.sin(yaw))*size.x+Math.abs(Math.cos(yaw))*size.z)*.5;
    const halfH=size.y*.5;
    const usableV=profile.mobile?(profile.portrait?.56:.68):(profile.tablet?.76:.84);
    const usableH=profile.mobile?.9:(profile.tablet?.84:.76);
    return Math.max(10,Math.max(halfH/(Math.tan(profile.vFov*.5)*usableV),halfW/(Math.tan(profile.hFov*.5)*usableH))*margin+halfD*.55+1.4);
  }

  function worldBox(index){
    const g=stations[index],local=stationBoxes[index],scale=g.scale.x;
    return new THREE.Box3(local.min.clone().multiplyScalar(scale).add(g.position),local.max.clone().multiplyScalar(scale).add(g.position));
  }

  function worldSphere(index){
    const g=stations[index],local=stationSpheres[index];
    const center=local.center.clone().applyQuaternion(g.quaternion).multiplyScalar(g.scale.x).add(g.position);
    return {center,radius:local.radius*g.scale.x};
  }

  function unionSpheres(a,b){
    if(!a)return {center:b.center.clone(),radius:b.radius};
    if(!b)return {center:a.center.clone(),radius:a.radius};
    const delta=b.center.clone().sub(a.center);
    const d=delta.length();
    if(a.radius>=d+b.radius)return {center:a.center.clone(),radius:a.radius};
    if(b.radius>=d+a.radius)return {center:b.center.clone(),radius:b.radius};
    if(d<1e-5)return {center:a.center.clone(),radius:Math.max(a.radius,b.radius)};
    const radius=(d+a.radius+b.radius)*.5;
    const center=a.center.clone().add(delta.multiplyScalar((radius-a.radius)/d));
    return {center,radius};
  }

  function visibleBounds(){
    let result=null;
    stations.forEach((g,i)=>{if(g.visible)result=unionSpheres(result,worldSphere(i));});
    return result||worldSphere(0);
  }

  function buildMaterials(){
    M.gold=new THREE.MeshPhysicalMaterial({color:0xe1ba64,metalness:.82,roughness:.16,clearcoat:.48,clearcoatRoughness:.16,emissive:0x392006,emissiveIntensity:.2,envMapIntensity:1.55});
    M.goldDark=new THREE.MeshPhysicalMaterial({color:0x7a5926,metalness:.52,roughness:.34,clearcoat:.28,clearcoatRoughness:.24,envMapIntensity:1.25});
    M.dark=new THREE.MeshStandardMaterial({color:0x211a14,metalness:.24,roughness:.48,envMapIntensity:.82});
    M.black=new THREE.MeshStandardMaterial({color:0x090806,metalness:.34,roughness:.4,envMapIntensity:.82});
    M.cream=new THREE.MeshStandardMaterial({color:0xeee2cc,roughness:.56,envMapIntensity:.5});
    M.white=new THREE.MeshStandardMaterial({color:0xf8f3e9,roughness:.62,envMapIntensity:.46});
    M.teal=new THREE.MeshStandardMaterial({color:0x68a99d,metalness:.2,roughness:.3,emissive:0x123f38,emissiveIntensity:.22,envMapIntensity:1.05});
    M.wood=new THREE.MeshStandardMaterial({color:0x674932,roughness:.7,envMapIntensity:.38});
    M.green=new THREE.MeshStandardMaterial({color:0x526f58,roughness:.72,envMapIntensity:.3});
    M.red=new THREE.MeshStandardMaterial({color:0x925142,roughness:.46,envMapIntensity:.52});
    M.screen=new THREE.MeshStandardMaterial({color:0x061210,emissive:0x87ead5,emissiveIntensity:1.72,roughness:.16,metalness:.05,envMapIntensity:.72});
    M.glass=new THREE.MeshPhysicalMaterial({color:0xd7eee8,transparent:true,opacity:.3,roughness:.035,transmission:.54,thickness:.16,envMapIntensity:1.45,depthWrite:false});
    M.route=new THREE.MeshStandardMaterial({color:0x23170b,emissive:0x6b400a,emissiveIntensity:.4,roughness:.58,metalness:.2,transparent:true,opacity:.92});
    M.line=new THREE.MeshBasicMaterial({color:0xf1cf7a,transparent:true,opacity:.9,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending});
    M.beamGold=new THREE.MeshBasicMaterial({color:0xe9bf64,transparent:true,opacity:.045,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    M.beamTeal=new THREE.MeshBasicMaterial({color:0x72d5c3,transparent:true,opacity:.038,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    M.halo=new THREE.MeshBasicMaterial({color:0xd9ae57,transparent:true,opacity:.1,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
  }

  function shadow(mesh,cast=true){
    const enabled=!profile.low&&(!profile.mobile||profile.strong);
    mesh.castShadow=cast&&enabled;
    mesh.receiveShadow=enabled;
    return mesh;
  }
  function box(g,w,h,d,x,y,z,m=M.dark){const o=shadow(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m));o.position.set(x,y,z);g.add(o);return o;}
  function cyl(g,r1,r2,h,x,y,z,m=M.gold,seg){const n=seg||(profile.low?12:(profile.mobile?(profile.strong?24:20):32));const o=shadow(new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,n),m));o.position.set(x,y,z);g.add(o);return o;}
  function sphere(g,r,x,y,z,m=M.cream,seg){const n=seg||(profile.low?12:(profile.mobile?(profile.strong?22:18):28));const o=shadow(new THREE.Mesh(new THREE.SphereGeometry(r,n,Math.max(10,n-5)),m));o.position.set(x,y,z);g.add(o);return o;}
  function screen(g,x,y,z,w,h,rot=0){
    const frame=box(g,w,h,.12,x,y,z,M.black);frame.rotation.y=rot;
    const panelMaterial=M.screen.clone();
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w*.88,h*.78),panelMaterial);
    panel.position.set(x+Math.sin(rot)*.066,y,z+Math.cos(rot)*.066);panel.rotation.y=rot;
    panel.userData.screenPhase=Math.random();g.add(panel);return panel;
  }
  function person(g,x,z,m=M.dark,s=1){cyl(g,.13*s,.16*s,.58*s,x,.59*s,z,m,10);sphere(g,.12*s,x,1.02*s,z,M.cream,12);[-.065,.065].forEach(dx=>cyl(g,.032*s,.032*s,.46*s,x+dx,.23*s,z,M.black,8));}
  function chair(g,x,z,rot=0){const c=new THREE.Group();box(c,.62,.1,.62,0,.53,0,M.cream);box(c,.62,.62,.1,0,.87,-.27,M.cream);[[-.23,-.23],[.23,-.23],[-.23,.23],[.23,.23]].forEach(([a,b])=>cyl(c,.026,.026,.5,a,.25,b,M.goldDark,8));c.position.set(x,0,z);c.rotation.y=rot;g.add(c);}
  function plant(g,x,z,s=1){cyl(g,.17*s,.26*s,.4*s,x,.2*s,z,M.black,14);for(let i=0;i<6;i++){const leaf=sphere(g,.16*s,x+(i-2.5)*.055*s,.55*s+i*.07*s,z+(i%2?.055:-.055)*s,M.green,10);leaf.scale.set(.65,1.45,.48);leaf.rotation.z=(i-2.5)*.08;}}
  function truss(g,w,d,h){[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]].forEach(([x,z])=>box(g,.15,h,.15,x,h/2,z,M.gold));box(g,w,.15,.15,0,h,-d/2,M.gold);box(g,w,.15,.15,0,h,d/2,M.gold);box(g,.15,.15,d,-w/2,h,0,M.gold);box(g,.15,.15,d,w/2,h,0,M.gold);}
  function island(g){
    const base=shadow(new THREE.Mesh(new THREE.CylinderGeometry(4.05,4.35,.28,profile.low?30:(profile.mobile?44:56)),new THREE.MeshStandardMaterial({color:0x15110d,roughness:.9})),false);base.position.y=.14;g.add(base);
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.52,3.9,profile.low?32:(profile.mobile?48:62)),new THREE.MeshBasicMaterial({color:0xd2ac58,transparent:true,opacity:.29,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.292;g.add(ring);
  }

  function booth(){
    const g=new THREE.Group();island(g);truss(g,5.45,3.65,4.15);box(g,5.05,3.42,.12,0,2.03,-1.75,M.cream);box(g,.12,3.15,2.0,-2.52,1.72,-.72,M.white);box(g,.12,3.15,2.0,2.52,1.72,-.72,M.white);screen(g,0,2.36,-1.69,2.4,1.32);box(g,2.0,.75,.72,0,.4,1.0,M.dark);box(g,2.08,.06,.8,0,.8,1.0,M.gold);[-1.75,-.58,.58,1.75].forEach((x,i)=>{box(g,.48,.55,.13,x,1.72,-1.65,i%2?M.teal:M.goldDark);sphere(g,.12,x,2.05,-1.57,i%2?M.gold:M.cream,10);});chair(g,-1.35,1.78,.12);chair(g,1.35,1.78,-.12);plant(g,-2.28,1.48,.82);plant(g,2.28,1.48,.82);person(g,-.7,2.42);person(g,.7,2.45,M.teal);return g;
  }
  function showroom(){
    const g=new THREE.Group();island(g);box(g,.15,4.05,4.3,-2.18,2.03,0,M.dark);for(let i=0;i<4;i++){box(g,.62,.075,3.65,-1.87,.82+i*.76,0,M.gold);for(let j=0;j<5;j++)sphere(g,.105,-1.78,1.05+i*.76,-1.4+j*.7,(i+j)%2?M.teal:M.cream,9);}[-1.15,0,1.15].forEach((x,i)=>{box(g,.88,.68+i*.12,.88,x,.39+i*.05,.45-i*.1,i===1?M.gold:M.cream);sphere(g,.15,x,.92+i*.15,.45-i*.1,i===1?M.cream:M.teal,11);});box(g,.075,3.15,3.5,2.22,1.63,0,M.glass);screen(g,1.42,1.58,-1.2,1.25,.72);plant(g,1.98,1.38,.78);person(g,-.62,2.05);person(g,.9,1.92,M.goldDark);return g;
  }
  function interior(){
    const g=new THREE.Group();island(g);box(g,4.45,.055,3.2,0,.32,0,M.wood);box(g,3.1,.72,.95,0,.68,-.72,M.cream);box(g,3.1,.84,.23,0,1.16,-1.08,M.cream);[-.92,0,.92].forEach((x,i)=>box(g,.57,.34,.13,x,.99,-1.2,i===1?M.gold:M.teal));chair(g,-1.68,.58,-.28);chair(g,1.68,.58,.28);plant(g,-2.18,-.24,.88);plant(g,2.18,-.08,.84);const top=new THREE.Mesh(new THREE.CylinderGeometry(.68,.68,.08,24),M.glass);top.position.set(0,.72,.58);g.add(top);cyl(g,.08,.11,.7,0,.37,.58,M.gold,14);[-1.78,1.78].forEach(x=>{cyl(g,.038,.05,1.76,x,.92,1.22,M.gold,9);sphere(g,.24,x,1.84,1.22,M.cream,14);});person(g,-1.96,1.92);person(g,1.92,1.84,M.teal);return g;
  }
  function management(){
    const g=new THREE.Group();island(g);box(g,4.55,.18,1.95,0,.77,.22,M.dark);box(g,4.35,2.55,.11,0,2.17,-1.58,M.cream);for(let i=0;i<5;i++)for(let j=0;j<3;j++)box(g,.54,.3,.05,-1.5+i*.75,2.72-j*.5,-1.52,(i+j)%3===0?M.teal:(i+j)%2?M.gold:M.red);[-1.4,0,1.4].forEach(x=>{screen(g,x,1.52,-.05,1.12,.64);box(g,.45,.028,.3,x,.9,.27,M.black);});person(g,-.96,1.45);person(g,.04,1.63,M.teal);person(g,1.05,1.4,M.goldDark);return g;
  }
  function crowd(){
    const g=new THREE.Group();island(g);box(g,4.35,.18,.18,0,3.08,-1.35,M.gold);[-2.18,2.18].forEach(x=>box(g,.16,3.08,.16,x,1.55,-1.35,M.gold));box(g,1.82,.75,.62,0,.39,-1.72,M.cream);[-.5,.5].forEach(x=>screen(g,x,.98,-1.65,.38,.24));[-1.15,0,1.15].forEach(x=>{cyl(g,.1,.125,.78,x,.4,-.94,M.goldDark,11);for(let a=0;a<3;a++){const arm=box(g,.58,.03,.03,x,.61,-.94,M.black);arm.rotation.y=a*Math.PI/3;}});for(let i=0;i<15;i++){const x=(i%5-2)*.67,z=Math.floor(i/5)*.8+.2;person(g,x,z,i%5===0?M.gold:(i%4===0?M.teal:M.dark),.86);}return g;
  }
  function av(){
    const g=new THREE.Group();island(g);box(g,4.8,.34,2.78,0,.18,-.16,M.dark);const led=box(g,4.2,2.15,.11,0,1.78,-1.43,M.screen);led.material=M.screen.clone();truss(g,5.2,2.9,3.85);[-2.15,2.15].forEach(x=>box(g,.52,1.18,.5,x,.93,-.98,M.black));box(g,2.35,.66,.88,0,.37,1.52,M.black);for(let i=-3;i<=3;i++)box(g,.06,.045,.33,i*.25,.72,1.52,i%2?M.gold:M.teal);for(let i=0;i<3;i++)box(g,1.28,.12+i*.11,.44,0,.06+i*.055,.92-i*.35,M.goldDark);person(g,-.62,2.77);person(g,.62,2.84,M.teal);return g;
  }

  function setPositions(){
    normalPositions=[
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(1.0,0,-9.2),
      new THREE.Vector3(-1.05,0,-18.4),
      new THREE.Vector3(1.05,0,-27.6),
      new THREE.Vector3(-.9,0,-36.8),
      new THREE.Vector3(0,0,-46)
    ];
    if(profile.mobile){
      overviewPositions=[
        new THREE.Vector3(-3.25,0,4.9),new THREE.Vector3(3.25,0,4.9),
        new THREE.Vector3(-3.25,0,0),new THREE.Vector3(3.25,0,0),
        new THREE.Vector3(-3.25,0,-4.9),new THREE.Vector3(3.25,0,-4.9)
      ];
    }else{
      overviewPositions=[
        new THREE.Vector3(-5.0,0,3.5),new THREE.Vector3(0,0,3.5),new THREE.Vector3(5.0,0,3.5),
        new THREE.Vector3(-5.0,0,-3.7),new THREE.Vector3(0,0,-3.7),new THREE.Vector3(5.0,0,-3.7)
      ];
    }
  }

  function createRoute(){
    routeGroup=new THREE.Group();root.add(routeGroup);
    routeCurves=[];routeSegments=[];motionMarkers=[];
    for(let i=0;i<normalPositions.length-1;i++){
      const a=normalPositions[i],b=normalPositions[i+1];
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x,.23,a.z-3.15),
        new THREE.Vector3((a.x+b.x)/2+(i%2?.58:-.58),.23,(a.z+b.z)/2),
        new THREE.Vector3(b.x,.23,b.z+3.15)
      ]);
      routeCurves.push(curve);
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,profile.low?20:(profile.mobile?(profile.strong?40:32):52),.5,profile.low?5:(profile.mobile?8:10),false),M.route.clone());
      tube.scale.y=.07;routeGroup.add(tube);
      const line=new THREE.Mesh(new THREE.TubeGeometry(curve,profile.low?20:(profile.mobile?(profile.strong?40:32):52),.024,profile.low?5:8,false),M.line.clone());
      routeGroup.add(line);
      routeSegments.push({index:i,tube,line});
      const markerCount=profile.low?1:2;
      for(let m=0;m<markerCount;m++){
        const marker=new THREE.Mesh(
          new THREE.SphereGeometry(profile.mobile?.055:.065,profile.low?8:12,profile.low?6:9),
          new THREE.MeshBasicMaterial({color:(i+m)%2?0x79d4c2:0xf0c86e,transparent:true,opacity:.9,depthWrite:false})
        );
        marker.userData={curve,offset:(m/markerCount)+i*.083,speed:.055+i*.004};
        routeGroup.add(marker);motionMarkers.push(marker);
      }
    }
  }

  function createOverviewLinks(){
    overviewLinks=new THREE.Group();overviewLinks.visible=false;root.add(overviewLinks);
    const pairs=profile.mobile?[[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[4,5]]:[[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5]];
    pairs.forEach(([a,b],i)=>{
      const pa=overviewPositions[a],pb=overviewPositions[b];
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(pa.x,.34,pa.z),
        new THREE.Vector3((pa.x+pb.x)/2,.34,(pa.z+pb.z)/2),
        new THREE.Vector3(pb.x,.34,pb.z)
      ]);
      const mesh=new THREE.Mesh(
        new THREE.TubeGeometry(curve,22,.026,6,false),
        new THREE.MeshBasicMaterial({color:i%2?0x75cbbb:0xd7ae58,transparent:true,opacity:0,depthWrite:false})
      );
      overviewLinks.add(mesh);
    });
  }

  function createLiveScreenTexture(){
    liveScreenCanvas=document.createElement('canvas');
    liveScreenCanvas.width=profile.mobile?1024:1600;
    liveScreenCanvas.height=profile.mobile?576:900;
    liveScreenContext=liveScreenCanvas.getContext('2d',{alpha:false});
    liveScreenTexture=new THREE.CanvasTexture(liveScreenCanvas);
    liveScreenTexture.wrapS=liveScreenTexture.wrapT=THREE.ClampToEdgeWrapping;
    if(Q)Q.prepareTexture(liveScreenTexture,renderer);
    M.screen.map=liveScreenTexture;
    M.screen.emissiveMap=liveScreenTexture;
    M.screen.needsUpdate=true;
    drawLiveScreen(0,0,true);
  }

  function drawLiveScreen(time,stage,force=false){
    if(!liveScreenContext||!liveScreenTexture)return;
    if(!force&&time-lastScreenDraw<72)return;
    lastScreenDraw=time;
    const c=liveScreenCanvas,x=liveScreenContext,w=c.width,h=c.height;
    const stageNames=['BUILD','DISPLAY','INTERIOR','MANAGE','FLOW','LIVE AV'];
    const t=time*.001;
    const bg=x.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#04100e');bg.addColorStop(.52,'#133f38');bg.addColorStop(1,'#251508');x.fillStyle=bg;x.fillRect(0,0,w,h);
    const glow=x.createRadialGradient(w*(.72+.08*Math.sin(t*.31)),h*.28,2,w*.72,h*.28,w*.62);glow.addColorStop(0,'rgba(117,230,207,.55)');glow.addColorStop(.42,'rgba(89,188,169,.12)');glow.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=glow;x.fillRect(0,0,w,h);
    x.strokeStyle='rgba(239,213,153,.12)';x.lineWidth=Math.max(1,w/900);const step=w/14;for(let i=0;i<=14;i++){x.beginPath();x.moveTo(i*step,0);x.lineTo(i*step,h);x.stroke()}for(let i=0;i<=8;i++){x.beginPath();x.moveTo(0,i*h/8);x.lineTo(w,i*h/8);x.stroke()}
    const scan=((t*.15)%1)*w;x.fillStyle='rgba(130,236,214,.08)';x.fillRect(scan-w*.08,0,w*.08,h);
    x.strokeStyle='rgba(239,202,118,.7)';x.lineWidth=w/320;x.strokeRect(w*.045,h*.07,w*.91,h*.86);
    x.fillStyle='#f8f0df';x.font=`800 ${Math.round(w*.092)}px Inter,Arial,sans-serif`;x.fillText('BY MELI',w*.075,h*.29);
    x.fillStyle='#e2b85f';x.font=`600 ${Math.round(w*.026)}px IBM Plex Mono,monospace`;x.fillText('CONNECTED PRODUCTION SYSTEM',w*.08,h*.39);
    x.fillStyle='rgba(247,239,222,.9)';x.font=`700 ${Math.round(w*.045)}px Inter,Arial,sans-serif`;x.fillText(stageNames[Math.max(0,Math.min(5,stage))],w*.08,h*.69);
    x.fillStyle='rgba(247,239,222,.62)';x.font=`500 ${Math.round(w*.018)}px IBM Plex Mono,monospace`;x.fillText('DESIGN  /  ENGINEER  /  BUILD  /  OPERATE',w*.08,h*.79);
    for(let i=0;i<18;i++){const active=(i+Math.floor(t*8))%6===0;x.fillStyle=active?'rgba(128,232,210,.95)':'rgba(225,181,93,.58)';x.fillRect(w*.08+i*w*.043,h*.86+(i%2)*h*.018,w*.025,h*.008)}
    liveScreenTexture.needsUpdate=true;
  }

  function makeParticleTexture(){
    const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
    const g=x.createRadialGradient(32,32,1,32,32,30);g.addColorStop(0,'rgba(255,242,207,.95)');g.addColorStop(.25,'rgba(232,191,101,.5)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,64);
    const tex=new THREE.CanvasTexture(c);tex.needsUpdate=true;return tex;
  }

  function createCinematicAtmosphere(){
    lightBeams=[];floorHalos=[];activeLights=[];
    normalPositions.forEach((p,i)=>{
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.18,2.55,7.2,profile.low?12:24,1,true),i%2?M.beamTeal.clone():M.beamGold.clone());
      beam.position.set(p.x+(i%2?.8:-.8),4.0,p.z);beam.rotation.z=i%2?.06:-.06;root.add(beam);lightBeams.push(beam);
      const halo=new THREE.Mesh(new THREE.RingGeometry(2.6,4.15,profile.low?28:52),M.halo.clone());halo.rotation.x=-Math.PI/2;halo.position.set(p.x,.305,p.z);root.add(halo);floorHalos.push(halo);
      const point=new THREE.PointLight(i%2?0x78d5c3:0xe6b95d,0,15,2);point.position.set(p.x,3.4,p.z+1.2);scene.add(point);activeLights.push(point);
    });
    const count=profile.low?90:(profile.mobile?170:340);const positions=new Float32Array(count*3);const seeds=new Float32Array(count);
    for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*18;positions[i*3+1]=.4+Math.random()*7;positions[i*3+2]=5-Math.random()*58;seeds[i]=Math.random();}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
    const material=new THREE.PointsMaterial({map:makeParticleTexture(),color:0xf2d28b,size:profile.mobile?.055:.07,transparent:true,opacity:profile.mobile?.24:.3,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true,toneMapped:false});
    dustField=new THREE.Points(geometry,material);dustField.frustumCulled=false;root.add(dustField);
    followTarget=new THREE.Object3D();scene.add(followTarget);
    followSpot=new THREE.SpotLight(0xf3d18b,1.18,26,Math.PI*.17,.64,1.6);followSpot.castShadow=false;followSpot.target=followTarget;scene.add(followSpot);
  }

  function resetCanvasForRetry(){
    if(!canvas?.isConnected)return;
    const clone=canvas.cloneNode(false);
    clone.width=1;clone.height=1;
    clone.style.pointerEvents='none';
    clone.style.touchAction='pan-y';
    canvas.replaceWith(clone);
    canvas=clone;
  }

  function init(){
    if(initialized)return;
    initialized=true;
    initQueued=false;
    profile=getProfile();
    setPositions();
    buildMaterials();
    initAttempts+=1;

    try{
      renderer=new THREE.WebGLRenderer({
        canvas,
        antialias:true,
        alpha:false,
        powerPreference:profile.low?'default':'high-performance',
        precision:profile.low?'mediump':'highp',
        stencil:false,
        preserveDrawingBuffer:false
      });
    }catch(primaryError){
      try{
        renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'default',precision:'mediump',stencil:false,preserveDrawingBuffer:false});
      }catch(secondaryError){
        initialized=false;
        initQueued=false;
        fallback.style.opacity='.42';
        resetCanvasForRetry();
        if(initAttempts<3)setTimeout(queueInit,650*initAttempts);
        return;
      }
    }

    baseRenderRatio=pixelRatio(profile);renderRatio=baseRenderRatio;
    if(Q)Q.configureRenderer(renderer,{exposure:1.16,pixelCap:renderRatio});
    else{
      renderer.outputEncoding=THREE.sRGBEncoding;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.16;
    }
    renderer.setPixelRatio(renderRatio);
    renderer.setClearColor(0x080705,1);
    const realtimeShadows=!profile.low&&(!profile.mobile||profile.strong);
    renderer.shadowMap.enabled=realtimeShadows;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.sortObjects=true;
    createLiveScreenTexture();

    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x080705);
    scene.fog=new THREE.FogExp2(0x080705,profile.mobile?.0108:.0088);
    if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);

    scene.add(new THREE.HemisphereLight(0xf8e9ca,0x0a0c0b,1.06));
    const key=new THREE.DirectionalLight(0xffe6b7,1.72);
    key.position.set(7.5,11.5,8);
    key.castShadow=realtimeShadows;
    const shadowSize=profile.low?768:(profile.mobile?(profile.strong?1280:1024):2048);
    key.shadow.mapSize.set(shadowSize,shadowSize);
    key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;
    key.shadow.bias=-.00024;key.shadow.normalBias=.024;
    scene.add(key);
    const warm=new THREE.PointLight(0xe6b45c,.82,38,2);warm.position.set(7,5.5,7);scene.add(warm);
    const teal=new THREE.PointLight(0x72d6c2,.72,38,2);teal.position.set(-7,4.8,-7);scene.add(teal);

    const floor=shadow(new THREE.Mesh(new THREE.PlaneGeometry(32,90),new THREE.MeshStandardMaterial({color:0x0d0b08,roughness:.96})),false);
    floor.rotation.x=-Math.PI/2;floor.position.z=-23;root.add(floor);
    const grid=new THREE.GridHelper(90,62,0x6d4f22,0x211a14);
    grid.position.z=-23;grid.material.transparent=true;grid.material.opacity=.085;root.add(grid);

    const makers=[booth,showroom,interior,management,crowd,av];
    stationSpheres=[];stationBoxes=[];
    stations=makers.map((maker,i)=>{
      const g=maker();
      g.updateMatrixWorld(true);
      stationBoxes[i]=new THREE.Box3().setFromObject(g);
      stationSpheres[i]=stationBoxes[i].getBoundingSphere(new THREE.Sphere());
      if(Q?.addContactShadow){Q.addContactShadow(g,renderer,4.05,profile.mobile?.34:.4,.008);}
      g.position.copy(normalPositions[i]);
      g.scale.setScalar(profile.displayScale);
      root.add(g);
      return g;
    });
    createRoute();
    createOverviewLinks();
    createCinematicAtmosphere();

    camera=new THREE.PerspectiveCamera(profile.fov,profile.w/profile.h,.1,180);
    currentFov=profile.fov;
    cameraKeyLight=new THREE.PointLight(0xffe7bd,.72,18,2);cameraKeyLight.position.set(3.8,2.8,2.4);camera.add(cameraKeyLight);
    cameraFillLight=new THREE.PointLight(0x76d5c3,.42,16,2);cameraFillLight.position.set(-3.6,1.2,1.4);camera.add(cameraFillLight);
    scene.add(camera);
    resize();
    applyNormalLayout(0,0,0);
    calculateCamera();
    cameraPos.copy(desiredPos);cameraTarget.copy(desiredTarget);
    camera.position.copy(cameraPos);camera.lookAt(cameraTarget);
    bind();
    readProgress();
    render(performance.now());
  }

  function disposeGroup(group){
    if(!group)return;
    group.traverse(o=>{
      o.geometry?.dispose?.();
      if(o.material){
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(m=>m?.dispose?.());
      }
    });
    root?.remove(group);
  }

  function resize(){
    if(!renderer||!camera)return;
    const previousMode=profile.mobile?'mobile':(profile.tablet?'tablet':'desktop');
    profile=getProfile();
    const nextMode=profile.mobile?'mobile':(profile.tablet?'tablet':'desktop');
    baseRenderRatio=pixelRatio(profile);
    renderRatio=Math.min(renderRatio||baseRenderRatio,baseRenderRatio);
    renderer.setPixelRatio(renderRatio);
    renderer.setSize(profile.w,profile.h,false);
    camera.aspect=profile.w/profile.h;
    currentFov=profile.fov;
    camera.fov=currentFov;
    camera.updateProjectionMatrix();
    if(previousMode!==nextMode){
      disposeGroup(routeGroup);disposeGroup(overviewLinks);
      setPositions();
      stations.forEach((g,i)=>{g.position.copy(normalPositions[i]);g.scale.setScalar(profile.displayScale);});
      createRoute();createOverviewLinks();
    }
    readProgress();
  }

  function readProgress(){
    const rect=track.getBoundingClientRect();
    const span=Math.max(1,track.offsetHeight-sticky.offsetHeight);
    targetProgress=clamp(-rect.top/span);
    if(indicator){
      const opacity=1-smoother(clamp((targetProgress-.012)/.095));
      indicator.style.opacity=opacity.toFixed(4);
      indicator.style.transform=`translate3d(-50%,${((1-opacity)*7).toFixed(1)}px,0)`;
    }
  }
  function scheduleReadProgress(){
    if(progressReadQueued)return;
    progressReadQueued=true;
    requestAnimationFrame(()=>{progressReadQueued=false;readProgress();});
  }

  function bind(){
    canvas.style.pointerEvents='none';
    canvas.style.touchAction='pan-y';
    canvas.addEventListener('webglcontextlost',e=>{
      e.preventDefault();
      sticky.classList.remove('model-active');fallback.style.opacity='.34';
      try{renderer?.dispose?.();}catch(_){}
      renderer=null;scene=null;camera=null;root=null;stations=[];stationSpheres=[];
      initialized=false;initQueued=false;resetCanvasForRetry();
      setTimeout(queueInit,420);
    },{once:true});

    const io=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting);
      if(visible){resize();readProgress();lastTime=0;}
    },{rootMargin:'300px 0px',threshold:0});
    io.observe(sticky);

    addEventListener('scroll',scheduleReadProgress,{passive:true});
    addEventListener('resize',()=>requestAnimationFrame(resize),{passive:true});
    addEventListener('orientationchange',()=>setTimeout(resize,160),{passive:true});
    window.visualViewport?.addEventListener('resize',()=>{
      if(Math.abs((sticky.clientWidth||innerWidth)-profile.w)>2)requestAnimationFrame(resize);
    },{passive:true});
    if('ResizeObserver'in window){const ro=new ResizeObserver(()=>requestAnimationFrame(resize));ro.observe(sticky);ro.observe(track);}
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;lastTime=0;});
    document.addEventListener('languagechange',()=>{currentStage=-1;overviewState=false;updateCopy();});
  }

  function stageFromProgress(p){
    const serviceEnd=.875;
    const overviewStart=.895;
    if(p>=overviewStart){
      return {overview:true,q:smoother(clamp((p-overviewStart)/(1-overviewStart))),stage:5,next:5,travel:0,local:1,phase:1};
    }
    const normalized=clamp(p/serviceEnd);
    const raw=normalized*6;
    const stage=Math.min(5,Math.floor(raw));
    const local=stage===5?clamp(raw-5):raw-stage;
    if(stage>=5)return {overview:false,stage:5,next:5,travel:0,local,phase:local};
    const travel=smoother(clamp((local-.44)/.52));
    return {overview:false,stage,next:stage+1,travel,local,phase:local};
  }

  function updateCopy(){
    const state=stageFromProgress(progress);
    const overview=state.overview&&state.q>.55;
    const stage=overview?5:(!state.overview&&state.next!==state.stage&&state.travel>.58?state.next:state.stage);
    if(stage===currentStage&&overview===overviewState)return;
    currentStage=stage;overviewState=overview;
    const lang=document.documentElement.lang==='ar'?'ar':'en';
    copyBox.classList.add('switching');
    setTimeout(()=>{
      if(overview){
        index.textContent='06 / 06';
        title.textContent=lang==='ar'?'منظومة تنفيذ واحدة متكاملة':'One connected delivery system';
        body.textContent=lang==='ar'?'تجتمع الخدمات الست ضمن تكوين واحد واضح يمثل رحلة التنفيذ من الفكرة حتى الافتتاح.':'All six disciplines resolve into one clear production system from concept through opening day.';
        rail.forEach(x=>x.classList.add('active'));
      }else{
        const item=copy[lang][stage];
        index.textContent=String(stage+1).padStart(2,'0')+' / 06';
        title.textContent=item[0];body.textContent=item[1];
        rail.forEach((x,i)=>x.classList.toggle('active',i===stage));
      }
      copyBox.classList.remove('switching');
    },70);
  }

  function applyNormalLayout(base,next,travel){
    const currentVisible=travel<.64;
    const nextVisible=travel>.36;
    stations.forEach((g,i)=>{
      g.position.copy(normalPositions[i]);
      g.scale.setScalar(profile.displayScale);
      if(i===base){
        g.visible=currentVisible;
        if(currentVisible)g.scale.setScalar(profile.displayScale*lerp(1,.82,smoother(clamp(travel/.64))));
      }else if(i===next){
        g.visible=nextVisible;
        if(nextVisible)g.scale.setScalar(profile.displayScale*lerp(.82,1,smoother(clamp((travel-.36)/.64))));
      }else{
        g.visible=false;
      }
    });
    routeGroup.visible=true;
    overviewLinks.visible=false;
  }

  function applyOverviewLayout(q){
    const overviewScale=profile.mobile?.37:(profile.tablet?.46:.51);
    const origin=normalPositions[5];
    stations.forEach((g,i)=>{
      const reveal=i===5?1:smoother(clamp((q-.05)/.48));
      g.visible=i===5||q>.05;
      g.position.lerpVectors(origin,overviewPositions[i],q);
      const startScale=i===5?profile.displayScale:overviewScale*.12;
      g.scale.setScalar(lerp(startScale,overviewScale,reveal));
    });
    routeGroup.visible=q<.34;
    routeGroup.traverse(o=>{if(o.material&&'opacity'in o.material){if(o.userData.baseOpacity===undefined)o.userData.baseOpacity=o.material.opacity;o.material.opacity=o.userData.baseOpacity*(1-smoother(clamp(q/.34)));}});
    overviewLinks.visible=q>.42;
    if(overviewLinks.visible)overviewLinks.traverse(o=>{if(o.material&&'opacity'in o.material)o.material.opacity=.72*smoother(clamp((q-.42)/.38));});
  }

  function stagePose(index,orbit=0){
    const yawMobile=[.22,-.20,.24,-.19,.20,-.23];
    const yawTablet=[.27,-.25,.28,-.22,.24,-.27];
    const yawDesktop=[.33,-.29,.34,-.26,.29,-.31];
    const elevMobile=[.19,.20,.205,.19,.185,.21];
    const elevTablet=[.215,.22,.23,.205,.215,.23];
    const elevDesktop=[.235,.245,.255,.225,.235,.25];
    const baseYaw=(profile.mobile?yawMobile:(profile.tablet?yawTablet:yawDesktop))[index];
    const elev=(profile.mobile?elevMobile:(profile.tablet?elevTablet:elevDesktop))[index];
    const yaw=baseYaw+orbit*(index%2?-.018:.018);
    const target=stageBoxCenter(index);
    const size=localBoxSize(index);
    if(profile.mobile||profile.portrait){
      target.y-=size.y*(profile.portrait?.27:.205);
      target.x+=size.x*(index%2?.018:-.018);
    }else{
      target.x-=size.x*.19;
      target.y-=size.y*.02;
    }
    const margin=profile.mobile?(profile.portrait?1.09:1.06):(profile.tablet?1.075:1.06);
    const distance=fitStageDistance(index,yaw,elev,margin)*(1-orbit*.012);
    const horizontal=Math.cos(elev)*distance;
    const pos=new THREE.Vector3(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
    const roll=(index%2?-.0045:.0045)*orbit;
    return {target,pos,yaw,elev,distance,roll};
  }

  function calculateCamera(){
    const state=stageFromProgress(progress);
    if(!state.overview){
      applyNormalLayout(state.stage,state.next,state.travel);
      const holdWindow=clamp(state.local/.44);
      const orbit=Math.sin(holdWindow*Math.PI)*(.55+.45*Math.sin(progress*Math.PI*4));
      const a=stagePose(state.stage,state.travel>0?0:orbit);
      if(state.stage===state.next){
        desiredTarget.copy(a.target);desiredPos.copy(a.pos);desiredRoll=a.roll;
        currentFov=lerp(currentFov,profile.fov-(profile.mobile?.35:.6)*Math.sin(holdWindow*Math.PI),.16);
      }else{
        const b=stagePose(state.next,0);
        const t=state.travel;
        const union=worldBox(state.stage).union(worldBox(state.next));
        const unionSize=new THREE.Vector3();union.getSize(unionSize);
        const unionCenter=new THREE.Vector3();union.getCenter(unionCenter);
        const midYaw=lerp(a.yaw,b.yaw,.5)+(state.stage%2?-.07:.07);
        const midElev=lerp(a.elev,b.elev,.5)+(profile.mobile?.045:.06);
        const midTarget=unionCenter.clone();
        if(profile.mobile||profile.portrait)midTarget.y-=unionSize.y*(profile.portrait?.19:.14);else midTarget.x-=unionSize.x*.08;
        const midDistance=fitBoundsDistance(unionSize,midYaw,profile.mobile?1.18:(profile.tablet?1.36:1.42));
        const midHorizontal=Math.cos(midElev)*midDistance;
        const midPos=new THREE.Vector3(midTarget.x+Math.sin(midYaw)*midHorizontal,midTarget.y+Math.sin(midElev)*midDistance,midTarget.z+Math.cos(midYaw)*midHorizontal);
        if(t<.5){const u=smoother(t*2);desiredPos.copy(a.pos).lerp(midPos,u);desiredTarget.copy(a.target).lerp(midTarget,u);}
        else{const u=smoother((t-.5)*2);desiredPos.copy(midPos).lerp(b.pos,u);desiredTarget.copy(midTarget).lerp(b.target,u);}
        desiredTarget.x+=Math.sin(Math.PI*t)*(state.stage%2?-.1:.1);
        desiredRoll=Math.sin(Math.PI*t)*(state.stage%2?.0055:-.0055)*(profile.mobile?.65:1);
        currentFov=lerp(currentFov,profile.fov+Math.sin(Math.PI*t)*(profile.mobile?.65:.95),.22);
      }
    }else{
      applyOverviewLayout(state.q);
      const bounds=new THREE.Box3();let first=true;
      stations.forEach((g,i)=>{if(!g.visible)return;const local=stationBoxes[i];const min=local.min.clone().multiplyScalar(g.scale.x).add(g.position);const max=local.max.clone().multiplyScalar(g.scale.x).add(g.position);const b=new THREE.Box3(min,max);if(first){bounds.copy(b);first=false}else bounds.union(b);});
      const size=new THREE.Vector3();bounds.getSize(size);const center=new THREE.Vector3();bounds.getCenter(center);
      const yaw=profile.mobile?0:.235;const elev=profile.mobile?(profile.portrait?.33:.29):.315;
      const target=center.clone();if(profile.mobile)target.y-=size.y*.235;else target.x-=size.x*.045;
      const distance=fitBoundsDistance(size,yaw,profile.mobile?1.075:1.025);const horizontal=Math.cos(elev)*distance;
      const overviewPos=new THREE.Vector3(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
      const last=stagePose(5,0);const q=smoother(state.q);const cameraQ=smoother(clamp(state.q*1.34));
      desiredTarget.copy(last.target).lerp(target,cameraQ);desiredPos.copy(last.pos).lerp(overviewPos,cameraQ);
      desiredRoll=lerp(0,profile.mobile?0:.004,cameraQ);currentFov=lerp(currentFov,profile.fov+(profile.mobile?.7:1.1)*cameraQ,.16);
    }
    if(camera&&Math.abs(camera.fov-currentFov)>.006){camera.fov=currentFov;camera.updateProjectionMatrix();}
  }

  function render(now){
    requestAnimationFrame(render);
    if(!renderer||!visible||!pageVisible)return;
    const dt=lastTime?Math.min(.045,(now-lastTime)/1000):1/60;lastTime=now;frameMs=frameMs*.94+(dt*1000)*.06;
    const progressGap=Math.abs(targetProgress-progress);
    const progressRate=(profile.mobile?23:26)+Math.min(24,progressGap*72);
    const progressDamping=reduced?1:(1-Math.exp(-progressRate*dt));
    progress+=(targetProgress-progress)*progressDamping;if(Math.abs(targetProgress-progress)<.000025)progress=targetProgress;
    updateCopy();calculateCamera();
    const cameraDamping=reduced?1:(1-Math.exp(-(profile.mobile?18.5:20.5)*dt));
    cameraPos.lerp(desiredPos,cameraDamping);cameraTarget.lerp(desiredTarget,cameraDamping);cameraRoll=lerp(cameraRoll,desiredRoll,cameraDamping);
    camera.position.copy(cameraPos);camera.up.set(0,1,0);camera.lookAt(cameraTarget);camera.rotateZ(cameraRoll);
    const t=now*.001;const motionState=stageFromProgress(progress);const visualStage=motionState.overview?5:(motionState.travel>.55?motionState.next:motionState.stage);
    drawLiveScreen(now,visualStage);
    routeSegments.forEach((segment,i)=>{
      const active=motionState.overview?1:(segment.index===motionState.stage?1:(segment.index===motionState.stage-1 ? .5 : .16));
      const pulse=.88+Math.sin(t*2.35+i*.72)*.12;
      segment.tube.material.opacity=lerp(.16,.92,active)*pulse;segment.tube.material.emissiveIntensity=lerp(.12,.72,active)*pulse;segment.line.material.opacity=lerp(.18,1,active)*pulse;
    });
    stations.forEach((g,i)=>{if(g.visible){const active=i===visualStage?1:.28;g.rotation.y=Math.sin(t*.2+i*.66)*.008*active;g.position.y=Math.sin(t*.56+i*.7)*.018*active;}});
    motionMarkers.forEach((marker,i)=>{const speed=marker.userData.speed*(motionState.overview?.72:1);const u=(t*speed+marker.userData.offset)%1;marker.position.copy(marker.userData.curve.getPointAt(u));marker.position.y=.34+Math.sin(t*3.4+i)*.024;marker.scale.setScalar(.78+Math.sin(t*3.7+i*.7)*.17);marker.material.opacity=.58+.36*Math.sin(Math.PI*u);});
    lightBeams.forEach((beam,i)=>{const active=i===visualStage?1:(motionState.overview?.42:.12);beam.material.opacity=(i%2?.035:.042)*lerp(.65,2.2,active)*(1+.12*Math.sin(t*.75+i));beam.rotation.y=t*.025*(i%2?1:-1);});
    floorHalos.forEach((halo,i)=>{const active=i===visualStage?1:(motionState.overview?.5:.12);halo.material.opacity=lerp(.018,.16,active)*(.86+.14*Math.sin(t*1.8+i));const pulse=1+Math.sin(t*1.2+i)*.012;halo.scale.set(pulse,pulse,pulse);});
    activeLights.forEach((light,i)=>{light.intensity=i===visualStage?1.18:(motionState.overview?.26:0);});
    if(dustField){dustField.rotation.y=Math.sin(t*.08)*.018;dustField.position.y=Math.sin(t*.18)*.08;}
    const focus=motionState.overview?cameraTarget:(normalPositions[visualStage]||normalPositions[0]);
    if(followTarget&&followSpot){tempD.copy(focus);tempD.y+=1.1;followTarget.position.lerp(tempD,.08);followSpot.position.set(followTarget.position.x+(visualStage%2?-4.5:4.5),7.8,followTarget.position.z+4.2);followSpot.intensity=motionState.overview?.55:1.12;}
    sticky.style.setProperty('--connected-progress',progress.toFixed(4));sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');
    renderer.render(scene,camera);
    if(!sticky.classList.contains('model-active')){sticky.classList.add('model-active');fallback.style.opacity='0';}
  }

  function debugState(){
    if(!camera||!profile)return {initialized:false};
    camera.updateMatrixWorld(true);
    const forward=new THREE.Vector3();
    camera.getWorldDirection(forward);
    const tanV=Math.tan(profile.vFov/2);
    const tanH=Math.tan(profile.hFov/2);
    const items=[];
    stations.forEach((g,i)=>{
      if(!g.visible)return;
      const s=worldSphere(i);
      const rel=s.center.clone().sub(camera.position);
      const depth=Math.max(.001,rel.dot(forward));
      const ndc=s.center.clone().project(camera);
      const rx=(s.radius/(depth*tanH))*profile.w/2;
      const ry=(s.radius/(depth*tanV))*profile.h/2;
      items.push({i,center:{x:s.center.x,y:s.center.y,z:s.center.z},radius:s.radius,depth,screen:{x:(ndc.x*.5+.5)*profile.w,y:(1-(ndc.y*.5+.5))*profile.h,rx,ry}});
    });
    return {
      initialized:true,
      progress,
      targetProgress,
      profile:{...profile},
      camera:{position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},target:{x:cameraTarget.x,y:cameraTarget.y,z:cameraTarget.z}},
      items
    };
  }

  window.ByMeliConnectedV11={
    getState:debugState,
    forceInit:queueInit,
    auditAt(value){
      if(!initialized)return {initialized:false};
      targetProgress=progress=clamp(value);
      updateCopy();
      calculateCamera();
      cameraPos.copy(desiredPos);cameraTarget.copy(desiredTarget);
      camera.position.copy(cameraPos);camera.lookAt(cameraTarget);
      return debugState();
    }
  };

  function queueInit(){
    if(initialized||initQueued)return;
    initQueued=true;
    // Release only service renderers that are already well outside the viewport.
    // Visible service canvases must never be destroyed while the user is viewing them.
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes',{detail:{offscreenOnly:true}}));
    setTimeout(()=>{
      if(!initialized){
        try{init();}
        catch(error){
          console.error('[By Meli] Connected scene initialization failed:',error);
          initialized=false;initQueued=false;
          fallback.style.opacity='.42';
          if(initAttempts<3)setTimeout(queueInit,650);
        }
      }
    },360);
  }

  const bootstrap=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){
      bootstrap.disconnect();
      queueInit();
    }
  },{rootMargin:'380px 0px',threshold:0});
  bootstrap.observe(track);

  setTimeout(()=>{
    if(!initialized&&!initQueued){
      const r=track.getBoundingClientRect();
      if(r.top<innerHeight*2.8&&r.bottom>-innerHeight)queueInit();
    }
  },1200);
})();
