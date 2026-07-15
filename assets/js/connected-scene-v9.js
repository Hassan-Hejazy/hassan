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
    const cap=p.mobile?(p.low?1.35:(p.strong?2.0:1.72)):(p.tablet?(p.strong?2.08:1.82):(p.strong?2.3:2.02));
    const maxPixels=p.mobile?(p.low?1450000:(p.strong?2850000:2200000)):(p.tablet?(p.strong?4100000:3300000):(p.strong?6200000:4800000));
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
    M.gold=new THREE.MeshPhysicalMaterial({color:0xd9b460,metalness:.76,roughness:.2,clearcoat:.38,clearcoatRoughness:.2,emissive:0x2e1a05,emissiveIntensity:.18,envMapIntensity:1.35});
    M.goldDark=new THREE.MeshPhysicalMaterial({color:0x765724,metalness:.44,roughness:.42,clearcoat:.2,clearcoatRoughness:.3,envMapIntensity:1.05});
    M.dark=new THREE.MeshStandardMaterial({color:0x211b16,metalness:.2,roughness:.54,envMapIntensity:.7});
    M.black=new THREE.MeshStandardMaterial({color:0x0c0a08,metalness:.28,roughness:.48,envMapIntensity:.68});
    M.cream=new THREE.MeshStandardMaterial({color:0xe9dfcb,roughness:.64,envMapIntensity:.38});
    M.white=new THREE.MeshStandardMaterial({color:0xf5f0e8,roughness:.7,envMapIntensity:.36});
    M.teal=new THREE.MeshStandardMaterial({color:0x619b90,metalness:.16,roughness:.36,emissive:0x113a34,emissiveIntensity:.16,envMapIntensity:.9});
    M.wood=new THREE.MeshStandardMaterial({color:0x62452f,roughness:.76,envMapIntensity:.3});
    M.green=new THREE.MeshStandardMaterial({color:0x4d6c53,roughness:.78,envMapIntensity:.22});
    M.red=new THREE.MeshStandardMaterial({color:0x884b3d,roughness:.52,envMapIntensity:.4});
    M.screen=new THREE.MeshStandardMaterial({color:0x081513,emissive:0x78d2c1,emissiveIntensity:1.42,roughness:.22,envMapIntensity:.55});
    M.glass=new THREE.MeshPhysicalMaterial({color:0xcce6df,transparent:true,opacity:.24,roughness:.06,transmission:.42,thickness:.18,envMapIntensity:1.25});
    M.route=new THREE.MeshStandardMaterial({color:0x25190d,emissive:0x50320a,emissiveIntensity:.32,roughness:.68,metalness:.12,transparent:true,opacity:.9});
    M.line=new THREE.MeshBasicMaterial({color:0xe8c46e,transparent:true,opacity:.82,depthWrite:false,toneMapped:false});
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
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w*.88,h*.78),M.screen.clone());
    panel.position.set(x+Math.sin(rot)*.066,y,z+Math.cos(rot)*.066);panel.rotation.y=rot;g.add(panel);return panel;
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

  function updateQualityTexture(){
    if(!Q?.makeScreenTexture)return;
    const tex=Q.prepareTexture(Q.makeScreenTexture('CONNECTED PRODUCTION SYSTEM'),renderer);
    M.screen.map=tex;M.screen.emissiveMap=tex;M.screen.needsUpdate=true;
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
        if(initAttempts<5)setTimeout(queueInit,420*initAttempts);
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
    updateQualityTexture();

    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x080705);
    scene.fog=new THREE.FogExp2(0x080705,profile.mobile?.013:.0108);
    if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);

    scene.add(new THREE.HemisphereLight(0xf4e4c4,0x0f0e0c,1.18));
    const key=new THREE.DirectionalLight(0xffedc8,1.5);
    key.position.set(7.5,11.5,8);
    key.castShadow=realtimeShadows;
    const shadowSize=profile.low?768:(profile.mobile?(profile.strong?1280:1024):2048);
    key.shadow.mapSize.set(shadowSize,shadowSize);
    key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;
    key.shadow.bias=-.00024;key.shadow.normalBias=.024;
    scene.add(key);
    const warm=new THREE.PointLight(0xd9ad5b,.72,36);warm.position.set(7,5.5,7);scene.add(warm);
    const teal=new THREE.PointLight(0x72c9bb,.62,36);teal.position.set(-7,4.8,-7);scene.add(teal);

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

    camera=new THREE.PerspectiveCamera(profile.fov,profile.w/profile.h,.1,180);
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
    camera.fov=profile.fov;
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
    const overviewStart=.89;
    if(p>=overviewStart){
      return {overview:true,q:smoother(clamp((p-overviewStart)/(1-overviewStart))),stage:5,next:5,travel:0,phase:1};
    }
    const raw=clamp(p/overviewStart)*5.6;
    if(raw>=5)return {overview:false,stage:5,next:5,travel:0,phase:clamp(raw-5)};
    const stage=Math.min(4,Math.floor(raw));
    const phase=raw-stage;
    const travel=smoother(clamp((phase-.20)/.72));
    return {overview:false,stage,next:stage+1,travel,phase};
  }

  function updateCopy(){
    const state=stageFromProgress(progress);
    const overview=state.overview&&state.q>.55;
    const stage=overview?5:state.stage;
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
    const currentVisible=travel<.58;
    const nextVisible=travel>.42;
    stations.forEach((g,i)=>{
      g.position.copy(normalPositions[i]);
      g.scale.setScalar(profile.displayScale);
      if(i===base){
        g.visible=currentVisible;
        if(currentVisible)g.scale.setScalar(profile.displayScale*lerp(1,.965,smoother(clamp(travel/.58))));
      }else if(i===next){
        g.visible=nextVisible;
        if(nextVisible)g.scale.setScalar(profile.displayScale*lerp(.965,1,smoother(clamp((travel-.42)/.58))));
      }else{
        g.visible=false;
      }
    });
    routeGroup.visible=true;
    overviewLinks.visible=false;
  }

  function applyOverviewLayout(q){
    const overviewScale=profile.mobile?.43:(profile.tablet?.5:.55);
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

  function stagePose(index){
    const yawMobile=[.16,-.14,.18,-.14,.14,-.17];
    const yawTablet=[.21,-.19,.22,-.17,.18,-.21];
    const yawDesktop=[.27,-.23,.28,-.20,.22,-.25];
    const elevMobile=[.145,.15,.16,.145,.14,.16];
    const elevDesktop=[.18,.19,.20,.175,.18,.195];
    const yaw=(profile.mobile?yawMobile:(profile.tablet?yawTablet:yawDesktop))[index];
    const elev=(profile.mobile?elevMobile:elevDesktop)[index];
    const target=stageBoxCenter(index);
    const size=localBoxSize(index);
    if(profile.mobile||profile.portrait){
      target.y-=size.y*(profile.portrait?.245:.18);
    }else{
      target.x-=size.x*.18;
      target.y-=size.y*.025;
    }
    const distance=fitStageDistance(index,yaw,elev,profile.mobile?1.025:1.0);
    const horizontal=Math.cos(elev)*distance;
    const pos=new THREE.Vector3(
      target.x+Math.sin(yaw)*horizontal,
      target.y+Math.sin(elev)*distance,
      target.z+Math.cos(yaw)*horizontal
    );
    return {target,pos,yaw,elev,distance};
  }

  function calculateCamera(){
    const state=stageFromProgress(progress);
    if(!state.overview){
      applyNormalLayout(state.stage,state.next,state.travel);
      const a=stagePose(state.stage);
      if(state.stage===state.next){
        desiredTarget.copy(a.target);
        desiredPos.copy(a.pos);
      }else{
        const b=stagePose(state.next);
        const t=state.travel;
        const lift=profile.mobile?.72:1.02;
        tempA.copy(b.pos).sub(a.pos);
        tempB.copy(a.pos).addScaledVector(tempA,.30);tempB.y+=lift;
        tempC.copy(b.pos).addScaledVector(tempA,-.30);tempC.y+=lift;
        cubicPoint(desiredPos,a.pos,tempB,tempC,b.pos,t);

        tempA.copy(b.target).sub(a.target);
        tempB.copy(a.target).addScaledVector(tempA,.34);tempB.y+=profile.mobile?.10:.16;
        tempC.copy(b.target).addScaledVector(tempA,-.34);tempC.y+=profile.mobile?.10:.16;
        cubicPoint(desiredTarget,a.target,tempB,tempC,b.target,t);
        const side=state.stage%2?-.10:.10;
        desiredTarget.x+=Math.sin(Math.PI*t)*side;
      }
    }else{
      applyOverviewLayout(state.q);
      const bounds=new THREE.Box3();
      let first=true;
      stations.forEach((g,i)=>{
        if(!g.visible)return;
        const local=stationBoxes[i];
        const min=local.min.clone().multiplyScalar(g.scale.x).add(g.position);
        const max=local.max.clone().multiplyScalar(g.scale.x).add(g.position);
        const b=new THREE.Box3(min,max);
        if(first){bounds.copy(b);first=false;}else bounds.union(b);
      });
      const size=new THREE.Vector3();bounds.getSize(size);
      const center=new THREE.Vector3();bounds.getCenter(center);
      const yaw=profile.mobile?.05:.22;
      const elev=profile.mobile?(profile.portrait?.34:.28):.31;
      const target=center.clone();
      if(profile.mobile)target.y-=size.y*.22;else target.x-=size.x*.04;
      const distance=fitBoundsDistance(size,yaw,profile.mobile?1.06:1.02);
      const horizontal=Math.cos(elev)*distance;
      const overviewPos=new THREE.Vector3(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
      const last=stagePose(5);
      const q=smoother(state.q);
      desiredTarget.copy(last.target).lerp(target,q);
      desiredPos.copy(last.pos).lerp(overviewPos,q);
    }
  }

  function render(now){
    requestAnimationFrame(render);
    if(!renderer||!visible||!pageVisible)return;

    const dt=lastTime?Math.min(.05,(now-lastTime)/1000):1/60;
    lastTime=now;
    frameMs=frameMs*.94+(dt*1000)*.06;

    const progressGap=Math.abs(targetProgress-progress);
    const progressRate=(profile.mobile?17.5:19.5)+Math.min(18,progressGap*55);
    const progressDamping=reduced?1:(1-Math.exp(-progressRate*dt));
    progress+=(targetProgress-progress)*progressDamping;
    if(Math.abs(targetProgress-progress)<.00004)progress=targetProgress;

    updateCopy();
    calculateCamera();

    const cameraDamping=reduced?1:(1-Math.exp(-(profile.mobile?15.5:17.5)*dt));
    cameraPos.lerp(desiredPos,cameraDamping);
    cameraTarget.lerp(desiredTarget,cameraDamping);
    camera.position.copy(cameraPos);
    camera.up.set(0,1,0);
    camera.lookAt(cameraTarget);

    const t=now*.001;
    const motionState=stageFromProgress(progress);
    routeSegments.forEach((segment,i)=>{
      const active=motionState.overview ? 1 : (segment.index===motionState.stage ? 1 : (segment.index===motionState.stage-1 ? .48 : .18));
      const pulse=.88+Math.sin(t*2.2+i*.72)*.12;
      segment.tube.material.opacity=lerp(.22,.9,active)*pulse;
      segment.tube.material.emissiveIntensity=lerp(.16,.62,active)*pulse;
      segment.line.material.opacity=lerp(.24,.96,active)*pulse;
    });
    stations.forEach((g,i)=>{if(g.visible){g.rotation.y=Math.sin(t*.16+i*.66)*.006;g.position.y=Math.sin(t*.48+i*.7)*.012;}});
    motionMarkers.forEach((marker,i)=>{
      const u=(t*marker.userData.speed+marker.userData.offset)%1;
      marker.position.copy(marker.userData.curve.getPointAt(u));
      marker.position.y=.33+Math.sin(t*3.2+i)*.018;
      marker.scale.setScalar(.82+Math.sin(t*3.5+i*.7)*.13);
    });
    renderer.render(scene,camera);
    if(!sticky.classList.contains('model-active')){
      sticky.classList.add('model-active');
      fallback.style.opacity='0';
    }
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

  window.ByMeliConnectedV6={
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
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes'));
    setTimeout(()=>{if(!initialized)init();},280);
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
