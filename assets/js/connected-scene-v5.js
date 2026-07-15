(function(){
  'use strict';

  const canvas=document.getElementById('connectedCanvas');
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
  let stations=[];
  let stationSpheres=[];
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

  const cameraPos=new THREE.Vector3();
  const cameraTarget=new THREE.Vector3();
  const desiredPos=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const tempA=new THREE.Vector3();
  const tempB=new THREE.Vector3();

  const M={};
  const BASE_RADIUS=4.65;

  function getProfile(){
    const w=Math.max(1,sticky.clientWidth||innerWidth);
    const h=Math.max(1,sticky.clientHeight||innerHeight);
    const aspect=w/h;
    const mobile=w<760;
    const tablet=w>=760&&w<1100;
    const portrait=aspect<.78;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const low=mobile&&(memory<=4||cores<=4);
    const fov=mobile?(portrait?58:54):(tablet?47:43);
    const vFov=THREE.MathUtils.degToRad(fov);
    const hFov=2*Math.atan(Math.tan(vFov/2)*aspect);
    const displayScale=mobile?.72:(tablet?.82:.92);
    return {w,h,aspect,mobile,tablet,portrait,low,fov,vFov,hFov,displayScale};
  }

  function pixelRatio(p){
    const dpr=window.devicePixelRatio||1;
    const strong=Number(navigator.deviceMemory||6)>=6&&Number(navigator.hardwareConcurrency||6)>=6;
    const cap=p.mobile?(p.low?1.65:(strong?2.2:1.95)):(p.tablet?(strong?2.25:2.0):(strong?2.5:2.2));
    const maxPixels=p.mobile?(p.low?1900000:(strong?3600000:2700000)):(p.tablet?(strong?5200000:4000000):(strong?7200000:5400000));
    return Math.max(1,Math.min(dpr,cap,Math.sqrt(maxPixels/Math.max(1,p.w*p.h))));
  }

  function fitDistance(scale,margin=1.08){
    const half=Math.max(THREE.MathUtils.degToRad(10),Math.min(profile.vFov,profile.hFov)/2);
    return Math.max(profile.mobile?12.5:9.2,(BASE_RADIUS*scale/Math.sin(half))*margin);
  }

  function fitSphereDistance(radius,margin=1.1){
    const half=Math.max(THREE.MathUtils.degToRad(10),Math.min(profile.vFov,profile.hFov)/2);
    return Math.max(profile.mobile?12.5:9.0,(Math.max(.1,radius)/Math.sin(half))*margin);
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
    M.gold=new THREE.MeshStandardMaterial({color:0xd2ac58,metalness:.62,roughness:.27,emissive:0x2b1905,emissiveIntensity:.18});
    M.goldDark=new THREE.MeshStandardMaterial({color:0x765724,metalness:.38,roughness:.5});
    M.dark=new THREE.MeshStandardMaterial({color:0x211b16,metalness:.18,roughness:.58});
    M.black=new THREE.MeshStandardMaterial({color:0x0c0a08,metalness:.24,roughness:.52});
    M.cream=new THREE.MeshStandardMaterial({color:0xe9dfcb,roughness:.68});
    M.white=new THREE.MeshStandardMaterial({color:0xf5f0e8,roughness:.76});
    M.teal=new THREE.MeshStandardMaterial({color:0x619b90,roughness:.4,emissive:0x113a34,emissiveIntensity:.16});
    M.wood=new THREE.MeshStandardMaterial({color:0x62452f,roughness:.8});
    M.green=new THREE.MeshStandardMaterial({color:0x4d6c53,roughness:.82});
    M.red=new THREE.MeshStandardMaterial({color:0x884b3d,roughness:.56});
    M.screen=new THREE.MeshStandardMaterial({color:0x0a1715,emissive:0x76cbbb,emissiveIntensity:1.15,roughness:.32});
    M.glass=new THREE.MeshPhysicalMaterial({color:0xcce6df,transparent:true,opacity:.23,roughness:.08,transmission:.38});
    M.route=new THREE.MeshStandardMaterial({color:0x25190d,emissive:0x50320a,emissiveIntensity:.32,roughness:.74,transparent:true,opacity:.9});
    M.line=new THREE.MeshBasicMaterial({color:0xe1ba61,transparent:true,opacity:.78,depthWrite:false});
  }

  function shadow(mesh,cast=true){mesh.castShadow=cast&&!profile.low;mesh.receiveShadow=true;return mesh;}
  function box(g,w,h,d,x,y,z,m=M.dark){const o=shadow(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m));o.position.set(x,y,z);g.add(o);return o;}
  function cyl(g,r1,r2,h,x,y,z,m=M.gold,seg){const n=seg||(profile.mobile?16:22);const o=shadow(new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,n),m));o.position.set(x,y,z);g.add(o);return o;}
  function sphere(g,r,x,y,z,m=M.cream,seg){const n=seg||(profile.mobile?14:18);const o=shadow(new THREE.Mesh(new THREE.SphereGeometry(r,n,Math.max(9,n-4)),m));o.position.set(x,y,z);g.add(o);return o;}
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
    const base=shadow(new THREE.Mesh(new THREE.CylinderGeometry(4.05,4.35,.28,profile.mobile?36:52),new THREE.MeshStandardMaterial({color:0x15110d,roughness:.9})),false);base.position.y=.14;g.add(base);
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.52,3.9,profile.mobile?40:58),new THREE.MeshBasicMaterial({color:0xd2ac58,transparent:true,opacity:.29,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.292;g.add(ring);
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
      new THREE.Vector3(1.15,0,-10),
      new THREE.Vector3(-1.2,0,-20),
      new THREE.Vector3(1.25,0,-30),
      new THREE.Vector3(-1.05,0,-40),
      new THREE.Vector3(0,0,-50)
    ];
    if(profile.mobile){
      overviewPositions=[
        new THREE.Vector3(-3.4,0,5.1),new THREE.Vector3(3.4,0,5.1),
        new THREE.Vector3(-3.4,0,0),new THREE.Vector3(3.4,0,0),
        new THREE.Vector3(-3.4,0,-5.1),new THREE.Vector3(3.4,0,-5.1)
      ];
    }else{
      overviewPositions=[
        new THREE.Vector3(-5.2,0,3.6),new THREE.Vector3(0,0,3.6),new THREE.Vector3(5.2,0,3.6),
        new THREE.Vector3(-5.2,0,-3.8),new THREE.Vector3(0,0,-3.8),new THREE.Vector3(5.2,0,-3.8)
      ];
    }
  }

  function createRoute(){
    routeGroup=new THREE.Group();root.add(routeGroup);
    for(let i=0;i<normalPositions.length-1;i++){
      const a=normalPositions[i],b=normalPositions[i+1];
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x,.23,a.z-3.55),
        new THREE.Vector3((a.x+b.x)/2+(i%2?.72:-.72),.23,(a.z+b.z)/2),
        new THREE.Vector3(b.x,.23,b.z+3.55)
      ]);
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,profile.mobile?28:44,.58,profile.mobile?6:8,false),M.route.clone());tube.scale.y=.08;routeGroup.add(tube);
      const line=new THREE.Mesh(new THREE.TubeGeometry(curve,profile.mobile?28:44,.028,6,false),M.line.clone());routeGroup.add(line);
    }
  }

  function createOverviewLinks(){
    overviewLinks=new THREE.Group();overviewLinks.visible=false;root.add(overviewLinks);
    const pairs=profile.mobile?[[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[4,5]]:[[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5]];
    pairs.forEach(([a,b],i)=>{
      const pa=overviewPositions[a],pb=overviewPositions[b];
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(pa.x,.34,pa.z),new THREE.Vector3((pa.x+pb.x)/2,.34,(pa.z+pb.z)/2),new THREE.Vector3(pb.x,.34,pb.z)]);
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,22,.026,6,false),new THREE.MeshBasicMaterial({color:i%2?0x75cbbb:0xd7ae58,transparent:true,opacity:.7,depthWrite:false}));overviewLinks.add(mesh);
    });
  }

  function updateQualityTexture(){
    if(!Q?.makeScreenTexture)return;
    const tex=Q.prepareTexture(Q.makeScreenTexture('CONNECTED PRODUCTION SYSTEM'),renderer);
    M.screen.map=tex;M.screen.emissiveMap=tex;M.screen.needsUpdate=true;
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
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:profile.low?'default':'high-performance',precision:'highp',stencil:false,preserveDrawingBuffer:false});
    }catch(primaryError){
      try{
        renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true,powerPreference:'default',precision:'mediump',stencil:false,preserveDrawingBuffer:false});
      }catch(secondaryError){
        initialized=false;
        initQueued=false;
        fallback.style.opacity='.44';
        if(initAttempts<4)setTimeout(queueInit,650*initAttempts);
        return;
      }
    }

    if(Q)Q.configureRenderer(renderer,{exposure:1.16,pixelCap:pixelRatio(profile)});
    else{
      renderer.outputEncoding=THREE.sRGBEncoding;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.16;
    }
    renderer.setPixelRatio(pixelRatio(profile));
    renderer.shadowMap.enabled=!profile.low;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    updateQualityTexture();

    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x090806);
    scene.fog=new THREE.FogExp2(0x090806,.019);
    if(Q)Q.studioEnvironment(scene);
    root=new THREE.Group();scene.add(root);

    scene.add(new THREE.HemisphereLight(0xf2e1bd,0x11100e,1.2));
    const key=new THREE.DirectionalLight(0xffecc5,1.48);key.position.set(7.5,11.5,8);key.castShadow=!profile.low;key.shadow.mapSize.set(profile.mobile?1024:2048,profile.mobile?1024:2048);key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;key.shadow.bias=-.00028;key.shadow.normalBias=.026;scene.add(key);
    const warm=new THREE.PointLight(0xd9ab57,.58,32);warm.position.set(7,5,6);scene.add(warm);
    const teal=new THREE.PointLight(0x6ec5b7,.5,32);teal.position.set(-7,4.5,-7);scene.add(teal);

    const floor=shadow(new THREE.Mesh(new THREE.PlaneGeometry(32,94),new THREE.MeshStandardMaterial({color:0x0e0c09,roughness:.95})),false);floor.rotation.x=-Math.PI/2;floor.position.z=-27;root.add(floor);
    const grid=new THREE.GridHelper(92,64,0x6d4f22,0x211a14);grid.position.z=-27;grid.material.transparent=true;grid.material.opacity=.1;root.add(grid);

    const makers=[booth,showroom,interior,management,crowd,av];
    stationSpheres=[];
    stations=makers.map((maker,i)=>{
      const g=maker();
      g.updateMatrixWorld(true);
      stationSpheres[i]=new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere());
      g.position.copy(normalPositions[i]);
      g.scale.setScalar(profile.displayScale);
      root.add(g);
      return g;
    });
    createRoute();
    createOverviewLinks();

    camera=new THREE.PerspectiveCamera(profile.fov,profile.w/profile.h,.1,180);
    resize();
    setInitialCamera();
    bind();
    readProgress();
    render(performance.now());
  }

  function setInitialCamera(){
    const target=normalPositions[0].clone().add(new THREE.Vector3(0,profile.mobile?.9:1.55,0));
    const d=fitDistance(profile.displayScale,1.08);
    const yaw=profile.mobile?.105:.2;
    const elev=profile.mobile?.16:.17;
    const horizontal=Math.cos(elev)*d;
    cameraTarget.copy(target);
    cameraPos.set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*d,target.z+Math.cos(yaw)*horizontal);
    desiredTarget.copy(cameraTarget);desiredPos.copy(cameraPos);
    camera.position.copy(cameraPos);camera.lookAt(cameraTarget);
  }

  function resize(){
    if(!renderer||!camera)return;
    const wasMobile=profile.mobile;
    profile=getProfile();
    renderer.setPixelRatio(pixelRatio(profile));
    renderer.setSize(profile.w,profile.h,false);
    camera.aspect=profile.w/profile.h;
    camera.fov=profile.fov;
    camera.updateProjectionMatrix();
    if(wasMobile!==profile.mobile){
      setPositions();
      stations.forEach((g,i)=>{g.position.copy(normalPositions[i]);g.scale.setScalar(profile.displayScale);});
    }
    readProgress();
  }

  function readProgress(){
    const rect=track.getBoundingClientRect();
    const span=Math.max(1,track.offsetHeight-sticky.offsetHeight);
    targetProgress=clamp(-rect.top/span);
    if(indicator){
      const opacity=1-smoother(clamp((targetProgress-.015)/.105));
      indicator.style.opacity=opacity.toFixed(4);
      indicator.style.transform=`translate3d(-50%,${((1-opacity)*8).toFixed(1)}px,0)`;
    }
  }

  function bind(){
    canvas.style.pointerEvents='none';
    canvas.style.touchAction='auto';
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();sticky.classList.remove('model-active');fallback.style.opacity='.34';});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());

    const io=new IntersectionObserver(entries=>{
      visible=entries.some(e=>e.isIntersecting);
      if(visible){resize();readProgress();}
    },{rootMargin:'280px 0px',threshold:0});
    io.observe(sticky);

    addEventListener('scroll',readProgress,{passive:true});
    addEventListener('resize',()=>requestAnimationFrame(resize),{passive:true});
    addEventListener('orientationchange',()=>setTimeout(resize,150),{passive:true});
    window.visualViewport?.addEventListener('resize',()=>{if(Math.abs((sticky.clientWidth||innerWidth)-profile.w)>2)requestAnimationFrame(resize);},{passive:true});
    if('ResizeObserver'in window){const ro=new ResizeObserver(()=>requestAnimationFrame(resize));ro.observe(sticky);ro.observe(track);}
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;lastTime=0;});
    document.addEventListener('languagechange',()=>{currentStage=-1;overviewState=false;updateCopy();});
  }

  function updateCopy(){
    const overview=progress>.90;
    const stage=Math.min(5,Math.floor(clamp(progress/.84)*6));
    if(stage===currentStage&&overview===overviewState)return;
    currentStage=stage;overviewState=overview;
    const lang=document.documentElement.lang==='ar'?'ar':'en';
    copyBox.classList.remove('switching');
    if(overview){
      index.textContent='06 / 06';
      title.textContent=lang==='ar'?'منظومة تنفيذ واحدة متكاملة':'One connected delivery system';
      body.textContent=lang==='ar'?'تجتمع الخدمات الست ضمن تكوين واحد واضح يمثل رحلة التنفيذ من الفكرة حتى الافتتاح.':'All six disciplines resolve into one clear production system from concept through opening day.';
      rail.forEach(x=>x.classList.add('active'));
    }else{
      const item=copy[lang][stage];
      index.textContent=String(stage+1).padStart(2,'0')+' / 06';
      title.textContent=item[0];
      body.textContent=item[1];
      rail.forEach((x,i)=>x.classList.toggle('active',i===stage));
    }
  }

  function applyNormalLayout(base,next,local){
    const hasTransition=base!==next&&local>0;
    const a=normalPositions[base],b=normalPositions[next];
    const midpoint=tempA.copy(a).add(b).multiplyScalar(.5);
    const direction=tempB.copy(b).sub(a).normalize();
    const nearA=midpoint.clone().addScaledVector(direction,-2.15);
    const nearB=midpoint.clone().addScaledVector(direction,2.15);
    stations.forEach((g,i)=>{
      const isBase=i===base&&(!hasTransition||local<.86);
      const isNext=i===next&&hasTransition&&local>.14;
      g.visible=isBase||isNext||(base===next&&i===base);
      if(i===base&&hasTransition){
        g.position.lerpVectors(a,nearA,smooth(local));
        g.scale.setScalar(profile.displayScale*lerp(1,.93,smooth(local)));
      }else if(i===next&&hasTransition){
        g.position.lerpVectors(nearB,b,smooth(local));
        g.scale.setScalar(profile.displayScale*lerp(.93,1,smooth(local)));
      }else{
        g.position.copy(normalPositions[i]);
        g.scale.setScalar(profile.displayScale);
      }
    });
    routeGroup.visible=true;
    overviewLinks.visible=false;
  }

  function applyOverviewLayout(q){
    const overviewScale=profile.mobile?.43:(profile.tablet?.51:.56);
    const origin=normalPositions[5];
    stations.forEach((g,i)=>{
      const reveal=i===5?1:smoother(clamp((q-.04)/.45));
      g.visible=i===5||q>.04;
      g.position.lerpVectors(origin,overviewPositions[i],q);
      const startScale=i===5?profile.displayScale:overviewScale*.12;
      g.scale.setScalar(lerp(startScale,overviewScale,reveal));
    });
    routeGroup.visible=q<.32;
    routeGroup.traverse(o=>{if(o.material&&'opacity'in o.material){if(o.userData.baseOpacity===undefined)o.userData.baseOpacity=o.material.opacity;o.material.opacity=o.userData.baseOpacity*(1-smoother(clamp(q/.32)));}});
    overviewLinks.visible=q>.48;
    if(overviewLinks.visible)overviewLinks.traverse(o=>{if(o.material&&'opacity'in o.material)o.material.opacity=.7*smoother(clamp((q-.48)/.38));});
  }

  function calculateCamera(){
    const overviewStart=.84;
    if(progress<overviewStart){
      const stageFloat=clamp(progress/overviewStart)*6;
      const base=Math.min(5,Math.floor(stageFloat));
      const phase=stageFloat-base;
      const next=Math.min(5,base+1);
      const local=base===next?0:smoother(clamp((phase-.64)/.36));
      applyNormalLayout(base,next,local);

      const bounds=visibleBounds();
      desiredTarget.copy(bounds.center);
      if(profile.mobile){
        desiredTarget.y-=bounds.radius*.29;
      }else{
        desiredTarget.x-=bounds.radius*.24;
        desiredTarget.y-=bounds.radius*.06;
      }

      const transitionExtra=1+Math.sin(local*Math.PI)*(profile.mobile?.05:.04);
      const margin=(profile.mobile?.96:.82)*transitionExtra;
      const d=fitSphereDistance(bounds.radius,margin);
      const routeProgress=clamp(progress/overviewStart);
      const yaw=(profile.mobile?.075:.22)+Math.sin(routeProgress*Math.PI*1.45)*(profile.mobile?.018:.035);
      const elev=profile.mobile?.16:.18;
      const horizontal=Math.cos(elev)*d;
      desiredPos.set(
        desiredTarget.x+Math.sin(yaw)*horizontal,
        desiredTarget.y+Math.sin(elev)*d,
        desiredTarget.z+Math.cos(yaw)*horizontal
      );
    }else{
      const q=smoother(clamp((progress-overviewStart)/(1-overviewStart)));
      applyOverviewLayout(q);
      const bounds=visibleBounds();
      desiredTarget.copy(bounds.center);
      if(profile.mobile){
        desiredTarget.y-=bounds.radius*.22;
      }else{
        desiredTarget.x-=bounds.radius*.08;
        desiredTarget.y-=bounds.radius*.08;
      }
      const d=fitSphereDistance(bounds.radius,profile.mobile?.76:.78);
      const yaw=lerp(profile.mobile?.075:.22,profile.mobile?.08:.34,q);
      const elev=lerp(profile.mobile?.16:.18,profile.mobile?.62:.48,q);
      const horizontal=Math.cos(elev)*d;
      desiredPos.set(
        desiredTarget.x+Math.sin(yaw)*horizontal,
        desiredTarget.y+Math.sin(elev)*d,
        desiredTarget.z+Math.cos(yaw)*horizontal
      );
    }
  }

  function render(now){
    requestAnimationFrame(render);
    if(!renderer||!visible||!pageVisible)return;

    readProgress();
    const dt=lastTime?Math.min(.045,(now-lastTime)/1000):1/60;
    lastTime=now;
    const progressDamping=reduced?1:(1-Math.exp(-(profile.mobile?16:18)*dt));
    progress+=(targetProgress-progress)*progressDamping;
    if(Math.abs(targetProgress-progress)<.00005)progress=targetProgress;

    updateCopy();
    calculateCamera();

    const cameraDamping=reduced?1:(1-Math.exp(-(profile.mobile?17:19)*dt));
    cameraPos.lerp(desiredPos,cameraDamping);
    cameraTarget.lerp(desiredTarget,cameraDamping);
    camera.position.copy(cameraPos);
    camera.up.set(0,1,0);
    camera.lookAt(cameraTarget);

    const t=now*.001;
    stations.forEach((g,i)=>{if(g.visible)g.rotation.y=Math.sin(t*.22+i*.66)*.013;});
    sticky.style.setProperty('--connected-exit','0');

    renderer.render(scene,camera);
    if(!sticky.classList.contains('model-active')){
      sticky.classList.add('model-active');
      fallback.style.opacity='0';
    }
  }

  function queueInit(){
    if(initialized||initQueued)return;
    initQueued=true;
    document.dispatchEvent(new CustomEvent('bymeli:release-service-scenes'));
    // Give mobile browsers time to return the released WebGL contexts before
    // requesting the connected renderer. This avoids the fallback-only state.
    setTimeout(()=>{
      if(!initialized) init();
    },420);
  }

  const bootstrap=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){
      bootstrap.disconnect();
      queueInit();
    }
  },{rootMargin:'750px 0px',threshold:0});
  bootstrap.observe(track);

  setTimeout(()=>{
    if(!initialized&&!initQueued){
      const r=track.getBoundingClientRect();
      if(r.top<innerHeight*2.5&&r.bottom>-innerHeight)queueInit();
    }
  },1300);
})();
