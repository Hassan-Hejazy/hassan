(function(){
  'use strict';
  const canvas=document.getElementById('connectedCanvas');
  const track=document.getElementById('connectedTrack');
  if(!canvas||!track) return;

  const sticky=canvas.closest('.connected-sticky');
  const copyBox=sticky.querySelector('.connected-copy');
  const title=document.getElementById('connectedTitle');
  const body=document.getElementById('connectedBody');
  const index=document.getElementById('connectedIndex');
  const rail=Array.from(document.querySelectorAll('#connectedRail span'));
  const fallback=sticky.querySelector('.connected-fallback');
  const scrollIndicator=document.getElementById('connectedScrollIndicator');
  const mobile=matchMedia('(max-width:760px)').matches;
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const memory=Number(navigator.deviceMemory||6);
  const cores=Number(navigator.hardwareConcurrency||6);
  const lowPower=mobile&&(memory<=4||cores<=4);
  const Q=window.BYMELI_QUALITY||null;
  const clamp=v=>Math.max(0,Math.min(1,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=v=>v*v*(3-2*v);
  const smoother=v=>v*v*v*(v*(v*6-15)+10);
  function viewportProfile(){
    const r=sticky.getBoundingClientRect();
    const w=Math.max(1,r.width),h=Math.max(1,r.height),aspect=w/h;
    const portrait=clamp((.82-aspect)/.38);
    const short=clamp((680-h)/220);
    const fov=w<700?lerp(52,57,Math.max(portrait,short*.75)):(w<1050?46:42);
    const vFov=THREE.MathUtils.degToRad(fov);
    const hFov=2*Math.atan(Math.tan(vFov/2)*aspect);
    return {w,h,aspect,portrait,short,fov,vFov,hFov};
  }
  function stageFitDistance(profile,multiplier=1){
    const radius=7.15;
    const limitingHalfAngle=Math.max(THREE.MathUtils.degToRad(8),Math.min(profile.vFov,profile.hFov)/2);
    return radius/Math.sin(limitingHalfAngle)*(mobile?lerp(1.07,1.13,profile.portrait):1.04)*multiplier;
  }
  function overviewFit(profile){
    const halfRoute=39.5;
    const halfAngle=(mobile?profile.vFov:profile.hFov)/2;
    return halfRoute/Math.max(.12,Math.tan(halfAngle))*(mobile?1.12:1.09);
  }
  function qualityRatio(w,h,overview=false){
    const dpr=window.devicePixelRatio||1;
    const compact=w<760;
    const cap=compact?(lowPower?1.35:1.75):2.1;
    const maxPixels=compact?(lowPower?1250000:2050000):4500000;
    const ratio=Math.max(1,Math.min(dpr,cap,Math.sqrt(maxPixels/Math.max(1,w*h))));
    return overview&&compact?Math.max(1,ratio*.82):ratio;
  }


  const copy={
    en:[
      ['Exhibition Stands & Pavilions','Architecture, structural systems, reception, product communication and media establish the first destination.'],
      ['Showrooms & Brand Spaces','Product hierarchy, display fixtures, consultation zones and long-life brand architecture continue the journey.'],
      ['Event Interiors & Hospitality','Lounge furniture, material warmth, lighting and guest service extend the experience beyond the exhibition stand.'],
      ['Project Management & Site Delivery','Schedules, approvals, workshop control, logistics, technical plans and live reporting connect the design to opening day.'],
      ['Crowd & Guest Operations','Registration, turnstiles, queues, staffing, wayfinding and controlled movement keep the environment calm and safe.'],
      ['Audio Visual & Live Production','Stage architecture, LED, lighting, audio, broadcast cameras, show control and audience systems complete the route.']
    ],
    ar:[
      ['أجنحة المعارض والأجنحة الوطنية','تبدأ الرحلة بالعمارة والهيكل والاستقبال وعرض المنتجات والوسائط ضمن بيئة واحدة متكاملة.'],
      ['صالات العرض ومساحات العلامات التجارية','تتواصل الرحلة من خلال ترتيب المنتجات ووحدات العرض ومناطق الاستشارة وهوية المكان طويلة الأمد.'],
      ['ديكورات الفعاليات والضيافة','يمتد أثر التجربة من خلال الأثاث ودفء المواد والإضاءة وخدمة الضيوف إلى ما بعد جناح المعرض.'],
      ['إدارة المشاريع والتنفيذ في الموقع','تربط الجداول والاعتمادات وإنتاج الورشة واللوجستيات والمخططات التقنية والتقارير بين التصميم وموعد الافتتاح.'],
      ['إدارة الحشود وتجربة الضيوف','تحافظ منصات التسجيل والبوابات والطوابير وفرق التشغيل والإرشاد على حركة سلسة وآمنة.'],
      ['الأنظمة السمعية والبصرية والإنتاج الحي','يكتمل مسار التنفيذ من خلال المسرح وشاشات LED والإضاءة والصوت وكاميرات البث وأنظمة التحكم.']
    ]
  };

  if(!window.THREE){
    canvas.style.display='none';
    fallback.style.opacity='.55';
    return;
  }

  let renderer,scene,camera,keyLight,cameraPath;
  let groups=[],routeGroups=[],sceneLights=[],progress=0,targetProgress=0,current=-1,visible=false,pageVisible=!document.hidden,dragging=false,lastX=0,touchYaw=0,targetTouchYaw=0,lastFrame=0,overviewActive=false;
  const cameraPosition=new THREE.Vector3();
  const cameraTarget=new THREE.Vector3();
  const desiredPosition=new THREE.Vector3();
  const desiredTarget=new THREE.Vector3();
  const desiredUp=new THREE.Vector3(0,1,0);
  const animated={people:[],screens:[],spots:[],rings:[],routeMarkers:[],statusLights:[],fans:[]};
  const centers=[
    new THREE.Vector3(0,0,0),
    new THREE.Vector3(2.1,0,-14.5),
    new THREE.Vector3(-2.4,0,-29),
    new THREE.Vector3(2.6,0,-43.5),
    new THREE.Vector3(-2.0,0,-58),
    new THREE.Vector3(0,0,-72.5)
  ];
  const routeCenterZ=(centers[0].z+centers[centers.length-1].z)/2;


  const M={
    gold:new THREE.MeshStandardMaterial({color:0xcda452,metalness:.56,roughness:.32,emissive:0x402a08,emissiveIntensity:.18}),
    goldDark:new THREE.MeshStandardMaterial({color:0x765827,metalness:.38,roughness:.5}),
    dark:new THREE.MeshStandardMaterial({color:0x211b15,metalness:.18,roughness:.62}),
    black:new THREE.MeshStandardMaterial({color:0x0e0c09,metalness:.24,roughness:.58}),
    cream:new THREE.MeshStandardMaterial({color:0xe8ddc6,roughness:.72}),
    white:new THREE.MeshStandardMaterial({color:0xf4efe5,roughness:.78}),
    teal:new THREE.MeshStandardMaterial({color:0x5e958a,roughness:.48,emissive:0x143b36,emissiveIntensity:.14}),
    red:new THREE.MeshStandardMaterial({color:0x87483c,roughness:.56}),
    wood:new THREE.MeshStandardMaterial({color:0x5d422d,roughness:.8}),
    green:new THREE.MeshStandardMaterial({color:0x4f6c54,roughness:.84}),
    screen:new THREE.MeshStandardMaterial({color:0x0e1715,emissive:0x78c8bb,emissiveIntensity:1.08,roughness:.42}),
    glass:new THREE.MeshPhysicalMaterial({color:0xc6ded7,transparent:true,opacity:.25,roughness:.08,transmission:.52,thickness:.2})
  };

  function sh(mesh,cast=true){mesh.castShadow=cast&&!lowPower;mesh.receiveShadow=true;return mesh}
  function box(g,w,h,d,x,y,z,m=M.dark){const o=sh(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m));o.position.set(x,y,z);g.add(o);return o}
  function cyl(g,r1,r2,h,x,y,z,m=M.gold,seg=(mobile?14:28)){const o=sh(new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg),m));o.position.set(x,y,z);g.add(o);return o}
  function sphere(g,r,x,y,z,m=M.cream,seg=(mobile?12:22)){const o=sh(new THREE.Mesh(new THREE.SphereGeometry(r,seg,Math.max(8,seg-2)),m));o.position.set(x,y,z);g.add(o);return o}
  function monitor(g,x,y,z,w,h,rotation=0){
    const frame=box(g,w,h,.11,x,y,z,M.dark);frame.rotation.y=rotation;
    const s=new THREE.Mesh(new THREE.PlaneGeometry(w*.88,h*.78),M.screen.clone());
    s.position.set(x+Math.sin(rotation)*.061,y,z+Math.cos(rotation)*.061);s.rotation.y=rotation;g.add(s);animated.screens.push(s);return s;
  }
  function person(g,x,z,m=M.dark,scale=1){
    const torso=cyl(g,.13*scale,.16*scale,.58*scale,x,.59*scale,z,m,10);
    const head=sphere(g,.12*scale,x,1*scale,z,M.cream,12);
    [-.065,.065].forEach(dx=>cyl(g,.034*scale,.034*scale,.47*scale,x+dx,.235*scale,z,M.dark,8));
    const p={torso,head,base:.59*scale,headBase:1*scale};animated.people.push(p);return p;
  }
  function chair(g,x,z,rotation=0){
    const c=new THREE.Group();
    box(c,.62,.1,.62,0,.53,0,M.cream);box(c,.62,.62,.1,0,.87,-.27,M.cream);
    [[-.23,-.23],[.23,-.23],[-.23,.23],[.23,.23]].forEach(([lx,lz])=>cyl(c,.028,.028,.5,lx,.25,lz,M.goldDark,8));
    c.position.set(x,0,z);c.rotation.y=rotation;g.add(c);return c;
  }
  function plant(g,x,z,scale=1){
    cyl(g,.18*scale,.27*scale,.42*scale,x,.21*scale,z,M.dark,14);
    for(let i=0;i<7;i++){
      const leaf=sphere(g,.16*scale,x+(i-3)*.047*scale,.5*scale+i*.074*scale,z+(i%2?.06:-.06)*scale,M.green,10);
      leaf.scale.set(.66,1.45,.48);leaf.rotation.z=(i-3)*.08;
    }
  }
  function laptop(g,x,y,z,rotation=0){
    const base=box(g,.52,.045,.36,x,y,z,M.dark);base.rotation.y=rotation;
    const lid=box(g,.52,.34,.04,x,y+.19,z-.16,M.dark);lid.rotation.x=-.18;lid.rotation.y=rotation;
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(.44,.25),M.screen.clone());screen.position.set(x,y+.19,z-.183);screen.rotation.x=-.18;screen.rotation.y=rotation;g.add(screen);animated.screens.push(screen);
  }
  function truss(g,w,d,h){
    [[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]].forEach(([x,z])=>box(g,.16,h,.16,x,h/2,z,M.gold));
    box(g,w,.16,.16,0,h,-d/2,M.gold);box(g,w,.16,.16,0,h,d/2,M.gold);box(g,.16,.16,d,-w/2,h,0,M.gold);box(g,.16,.16,d,w/2,h,0,M.gold);
  }
  function spot(g,x,y,z,targetX=0,targetZ=0,color=0xffdda4){
    const fixture=cyl(g,.11,.16,.32,x,y,z,M.dark,12);fixture.rotation.x=Math.PI/2;
    const s=new THREE.SpotLight(color,1.55,12,.36,.7,1.35);s.position.set(x,y-.08,z);s.target.position.set(targetX,.2,targetZ);g.add(s,s.target);animated.spots.push(s);return s;
  }
  function stanchion(g,x,z){cyl(g,.045,.055,.82,x,.42,z,M.goldDark,10);cyl(g,.18,.18,.045,x,.03,z,M.dark,14)}
  function cameraRig(g,x,z,rotation=0){
    const rig=new THREE.Group();box(rig,.42,.28,.5,0,1.55,0,M.dark);const lens=cyl(rig,.1,.14,.38,0,1.56,-.36,M.dark,14);lens.rotation.x=Math.PI/2;
    [-.28,0,.28].forEach((dx,i)=>{const leg=cyl(rig,.025,.035,1.35,dx*.65,.7,(i-1)*.12,M.goldDark,8);leg.rotation.z=dx*.8});
    rig.position.set(x,0,z);rig.rotation.y=rotation;g.add(rig);
  }
  function ceilingRing(g,x,y,z,r,color=0xcda452){const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.045,18,96),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.58}));ring.rotation.x=Math.PI/2;ring.position.set(x,y,z);g.add(ring);animated.rings.push(ring);return ring}
  function pedestal(g){
    const b=sh(new THREE.Mesh(new THREE.CylinderGeometry(5.3,5.8,.28,88),new THREE.MeshStandardMaterial({color:0x15110d,roughness:.88})),false);b.position.y=.14;g.add(b);
    const ring=new THREE.Mesh(new THREE.RingGeometry(4.55,5.15,96),new THREE.MeshBasicMaterial({color:0xcda452,side:THREE.DoubleSide,transparent:true,opacity:.32}));ring.rotation.x=-Math.PI/2;ring.position.y=.29;g.add(ring);
    const grid=new THREE.GridHelper(10,14,0x6e5226,0x282119);grid.material.transparent=true;grid.material.opacity=.13;grid.position.y=.3;g.add(grid);
  }
  function product(g,x,y,z,m=M.teal){box(g,.28,.42,.28,x,y,z,m);cyl(g,.07,.09,.18,x,y+.3,z,M.gold,10)}

  function booth(){
    const g=new THREE.Group();pedestal(g);truss(g,6.3,4.3,4.5);
    box(g,6,4,.12,0,2.2,-2.05,M.cream);box(g,.12,3.6,2.5,-3.05,1.95,-.82,M.white);box(g,.12,3.6,2.5,3.05,1.95,-.82,M.white);
    monitor(g,0,2.55,-1.98,2.8,1.6);box(g,4,.68,.14,0,4.05,2.02,M.gold);box(g,2.35,.9,.82,0,.47,1,M.dark);box(g,2.42,.07,.9,0,.92,1,M.gold);
    [-2.35,-1.55,1.55,2.35].forEach((x,i)=>{box(g,.58,.72,.14,x,2.05,-1.96,i%2?M.teal:M.goldDark);product(g,x,2.05,-1.78,i%2?M.gold:M.cream)});
    box(g,1.02,2.1,.1,2.42,1.18,-1.98,M.dark);box(g,.03,.24,.03,2.08,1.18,-1.9,M.gold);
    [-1.6,1.6].forEach((x,i)=>chair(g,x,1.85,i?-.16:.16));plant(g,-2.7,1.7,1.05);plant(g,2.7,1.7,1.05);
    const table=sh(new THREE.Mesh(new THREE.CylinderGeometry(.54,.54,.1,28),M.glass));table.position.set(0,.58,2.02);g.add(table);cyl(g,.08,.13,.85,0,.42,2.02,M.gold,16);
    box(g,.6,.92,.28,-2.18,.48,2.35,M.cream);box(g,.42,2.45,.2,2.55,1.23,2.15,M.teal);
    [-2.2,-.75,.75,2.2].forEach(x=>spot(g,x,4.42,1.2,x*.4,0));
    person(g,-.82,2.78,M.dark);person(g,.78,2.82,M.teal);person(g,2.2,.15,M.goldDark);
    return g;
  }

  function showroom(){
    const g=new THREE.Group();pedestal(g);box(g,.16,4.5,5.1,-2.6,2.25,0,M.dark);
    for(let i=0;i<4;i++){box(g,.72,.09,4.4,-2.25,.9+i*.85,0,M.gold);for(let j=0;j<5;j++)product(g,-2.12,1.16+i*.85,-1.75+j*.87,(i+j)%2?M.teal:M.cream)}
    [-1.45,0,1.45].forEach((x,i)=>{box(g,1,.75+i*.15,1,x,.42+i*.07,.55-i*.18,i===1?M.gold:M.cream);product(g,x,.98+i*.18,.55-i*.18,i===1?M.cream:M.teal)});
    box(g,.08,3.6,4.3,2.65,1.85,0,M.glass);const a=sh(new THREE.Mesh(new THREE.TorusGeometry(2.15,.08,10,52,Math.PI),M.gold));a.rotation.z=Math.PI/2;a.position.set(.1,3.05,1.85);g.add(a);
    box(g,1.65,.86,.7,1.62,.45,-1.42,M.dark);laptop(g,1.62,.92,-1.42,Math.PI);box(g,1.1,.26,.1,1.62,2.92,-1.62,M.gold);box(g,1.05,1.65,.05,2.32,1.58,.95,M.glass);
    [-2,-.7,.7,2].forEach(x=>spot(g,x,4.02,1.45,x*.35,.1));person(g,-.7,2.38,M.dark);person(g,1.2,2.12,M.goldDark);person(g,2.05,-.35,M.teal);
    return g;
  }

  function interior(){
    const g=new THREE.Group();pedestal(g);box(g,5.2,.06,3.9,0,.34,0,new THREE.MeshStandardMaterial({color:0x624c36,roughness:.95}));
    box(g,3.6,.82,1.1,0,.74,-.9,M.cream);box(g,3.6,1,.28,0,1.3,-1.3,M.cream);[-1.1,0,1.1].forEach((x,i)=>box(g,.7,.42,.16,x,1.12,-1.43,i===1?M.gold:M.teal));
    const top=sh(new THREE.Mesh(new THREE.CylinderGeometry(.82,.82,.1,28),M.glass));top.position.set(0,.82,.68);g.add(top);cyl(g,.1,.14,.85,0,.44,.68,M.gold);
    chair(g,-2,.6,-.34);chair(g,2,.6,.34);plant(g,-2.65,-.45,1.08);plant(g,2.65,-.12,1.02);
    [-2.25,2.25].forEach(x=>{cyl(g,.045,.06,2.05,x,1.08,1.48,M.gold,10);cyl(g,.28,.46,.48,x,2.06,1.48,M.cream,18);const l=new THREE.PointLight(0xffdda2,1.35,5);l.position.set(x,2,1.4);g.add(l)});
    ceilingRing(g,0,3.68,.35,1.18);ceilingRing(g,0,3.49,.35,.72,0x78c8bb);
    [-1.35,0,1.35].forEach((x,i)=>box(g,.86,1.18,.07,x,2.32,-1.53,i===1?M.gold:M.teal));[-1.68,1.68].forEach(x=>cyl(g,.3,.36,.4,x,.22,-.05,M.goldDark,18));
    cyl(g,.2,.2,.3,.92,.98,.68,M.goldDark,14);cyl(g,.045,.052,.21,-.92,.98,.68,M.cream,10);
    person(g,-2.42,2.35,M.dark);person(g,2.32,2.22,M.teal);return g;
  }

  function management(){
    const g=new THREE.Group();pedestal(g);box(g,5.4,.22,2.4,0,.9,.2,M.dark);[-2.25,2.25].forEach(x=>[-.75,1.15].forEach(z=>box(g,.11,1,.11,x,.5,z,M.gold)));
    box(g,5.1,2.9,.12,0,2.45,-2,M.cream);for(let i=0;i<5;i++)for(let j=0;j<3;j++)box(g,.66,.36,.06,-1.8+i*.9,3.05-j*.6,-1.93,(i+j)%3===0?M.teal:(i+j)%2?M.gold:M.red);
    [-1.75,0,1.75].forEach(x=>{monitor(g,x,1.75,-.08,1.4,.85);laptop(g,x,1.04,.25)});
    for(let i=0;i<5;i++){const plan=box(g,.6,.018,.4,-1.65+i*.82,1.04,.74,i%2?M.white:M.cream);plan.rotation.y=(i-2)*.05}
    [-2.5,2.5].forEach((x,i)=>{box(g,.8,.7,.8,x,.36,1.85,i?M.goldDark:M.dark);box(g,.15,.36,.11,x,1.18,.58,M.dark);cyl(g,.012,.012,.28,x,1.5,.58,M.goldDark,6)});
    box(g,1.3,.52,.05,1.98,2.52,-1.92,M.red);box(g,.42,.17,.3,-2.05,1.04,.1,M.cream);
    person(g,-1.2,1.62,M.dark);person(g,.05,1.82,M.teal);person(g,1.3,1.55,M.goldDark);return g;
  }

  function crowd(){
    const g=new THREE.Group();pedestal(g);box(g,5.1,.22,.22,0,3.55,-1.7,M.gold);[-2.55,2.55].forEach(x=>box(g,.2,3.55,.2,x,1.78,-1.7,M.gold));
    [-1.7,-.55,.55,1.7].forEach(x=>{box(g,.06,.78,3.9,x,.42,.75,M.dark);for(let z=-1;z<2.8;z+=1.18)stanchion(g,x,z)});
    box(g,2.2,.92,.72,0,.47,-2.15,M.cream);[-.62,.62].forEach(x=>monitor(g,x,1.18,-2.05,.48,.32));
    [-1.52,0,1.52].forEach(x=>{cyl(g,.12,.15,.92,x,.47,-1.25,M.goldDark,14);for(let a=0;a<3;a++){const arm=box(g,.75,.035,.035,x,.72,-1.25,M.dark);arm.rotation.y=a*Math.PI/3}});
    monitor(g,0,3.05,-1.62,2.35,.68);box(g,.9,.27,.07,0,3.96,-1.62,M.teal);box(g,.84,.74,.5,2.12,.38,-2.12,M.dark);
    const people=[];for(let i=0;i<24;i++){const x=(i%6-2.5)*.7,z=Math.floor(i/6)*.88-.1;people.push(person(g,x,z,i%5===0?M.gold:(i%4===0?M.teal:M.dark),.94))}
    // Three moving floor routes inside the guest operation scene.
    [-1.38,0,1.38].forEach((lane,laneIndex)=>{
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(lane,.32,3.25),new THREE.Vector3(lane*.85,.32,1.85),new THREE.Vector3(lane*.55,.32,.45),new THREE.Vector3(lane*.25,.32,-.8),new THREE.Vector3(0,.32,-2.72)]);
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,46,.028,7,false),new THREE.MeshBasicMaterial({color:laneIndex===1?0x78c8bb:0xcda452,transparent:true,opacity:.46}));g.add(tube);
      for(let k=0;k<3;k++){const marker=sphere(g,.065,0,.38,0,laneIndex===1?M.teal:M.gold,10);marker.userData={curve,offset:k/3+laneIndex*.08};animated.routeMarkers.push(marker)}
    });
    return g;
  }

  function av(){
    const g=new THREE.Group();pedestal(g);box(g,5.7,.42,3.3,0,.22,-.25,M.dark);const led=box(g,5,2.6,.12,0,2.05,-1.75,M.screen);animated.screens.push(led);truss(g,6.2,3.5,4.25);
    [-2.65,2.65].forEach(x=>box(g,.65,1.45,.6,x,1.18,-1.25,M.black));box(g,2.8,.85,1.05,0,.45,1.9,M.black);for(let i=-3;i<=3;i++){box(g,.075,.055,.42,i*.3,.9,1.9,i%2?M.gold:M.teal);cyl(g,.04,.04,.08,i*.3,.95,1.66,M.cream,9)}
    for(let i=-2;i<=2;i++)spot(g,i*1.12,3.95,.95,i*.3,-.3,i%2?0xcda452:0x6fc2b5);
    for(let i=0;i<3;i++)box(g,1.55,.16+i*.14,.54,0,.08+i*.07,1.22-i*.43,M.goldDark);
    box(g,.7,1.15,.56,-1.58,.58,-.22,M.cream);const mic=cyl(g,.018,.018,.46,-1.58,1.38,-.22,M.dark,8);mic.rotation.z=-.3;
    cameraRig(g,2.35,2.4,-2.5);for(let i=-2;i<=2;i++)for(let j=0;j<2;j++)chair(g,i*1.02,2.92+j*.86,Math.PI);
    [-2.25,-1.1,0,1.1,2.25].forEach(x=>box(g,.055,.024,2.35,x,.31,1.38,M.goldDark));monitor(g,-2.25,1.9,1.98,.82,.46,.08);monitor(g,2.12,2.12,-1.32,1.15,.75,-.12);
    person(g,-.78,3.4,M.dark);person(g,.78,3.52,M.teal);return g;
  }

  function addRoute(a,b,routeIndex){
    const routeGroup=new THREE.Group();
    routeGroup.userData.routeIndex=routeIndex;
    const mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(.5);
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(a.x,0.24,a.z-4.6),
      new THREE.Vector3(mid.x+(routeIndex%2?1.2:-1.2),0.24,mid.z),
      new THREE.Vector3(b.x,0.24,b.z+4.6)
    ]);
    const tubular=mobile?42:74;
    const floor=new THREE.Mesh(new THREE.TubeGeometry(curve,tubular,1.08,mobile?6:10,false),new THREE.MeshStandardMaterial({color:0x20170c,emissive:0x382407,emissiveIntensity:.32,roughness:.78}));floor.scale.y=.07;routeGroup.add(floor);
    const centerLine=new THREE.Mesh(new THREE.TubeGeometry(curve,tubular,.035,mobile?5:8,false),new THREE.MeshBasicMaterial({color:routeIndex%2?0x78c8bb:0xcda452,transparent:true,opacity:.62}));routeGroup.add(centerLine);

    const portalCount=mobile?2:3;
    for(let j=1;j<=portalCount;j++){
      const t=j/(portalCount+1),pos=curve.getPointAt(t),tan=curve.getTangentAt(t),angle=Math.atan2(tan.x,tan.z);
      const portal=new THREE.Group();box(portal,3.7,.15,.15,0,3.65,0,M.gold);[-1.85,1.85].forEach(x=>box(portal,.13,3.65,.13,x,1.82,0,M.gold));
      portal.position.copy(pos);portal.rotation.y=angle;routeGroup.add(portal);
      if(j===Math.ceil(portalCount/2)){const sign=monitor(routeGroup,pos.x,2.86,pos.z,1.65,.58,angle);sign.userData.routeIndex=routeIndex}
    }

    const postCount=mobile?5:8;
    for(let j=1;j<=postCount;j++){
      const t=j/(postCount+1),pos=curve.getPointAt(t),tan=curve.getTangentAt(t),angle=Math.atan2(tan.x,tan.z);
      [-1.22,1.22].forEach((offset,n)=>{
        const normal=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));
        const px=pos.x+normal.x*offset,pz=pos.z+normal.z*offset;
        cyl(routeGroup,.052,.075,.4,px,.2,pz,n?M.teal:M.gold,mobile?8:10);
        if(!mobile&&j%3===0){const light=new THREE.PointLight(n?0x6fc4b6:0xffd98f,.18,3.4);light.position.set(px,.36,pz);routeGroup.add(light);animated.statusLights.push(light);}
      });
      if(j%2===0){const arrow=new THREE.Mesh(new THREE.ConeGeometry(.12,.28,3),new THREE.MeshBasicMaterial({color:routeIndex%2?0x78c8bb:0xcda452,transparent:true,opacity:.7}));arrow.position.copy(pos);arrow.position.y=.32;arrow.rotation.x=Math.PI/2;arrow.rotation.z=-angle;routeGroup.add(arrow)}
    }

    [-.72,.72].forEach(offset=>{
      const points=[],steps=mobile?28:48;for(let s=0;s<=steps;s++){const pos=curve.getPointAt(s/steps),tan=curve.getTangentAt(s/steps),angle=Math.atan2(tan.x,tan.z),normal=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle));points.push(new THREE.Vector3(pos.x+normal.x*offset,.13,pos.z+normal.z*offset))}
      const channel=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x8e6b2d,transparent:true,opacity:.42}));routeGroup.add(channel);
    });

    const markerCount=mobile?3:5;
    for(let k=0;k<markerCount;k++){
      const marker=sphere(routeGroup,.075,0,.38,0,routeIndex%2?M.teal:M.gold,mobile?8:10);marker.userData={curve,offset:k/markerCount+routeIndex*.055,routeIndex};animated.routeMarkers.push(marker);
    }
    scene.add(routeGroup);routeGroups.push(routeGroup);
  }

  function init(){
    try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:lowPower?'default':'high-performance',precision:'highp',stencil:false,preserveDrawingBuffer:false})}catch(e){canvas.style.display='none';fallback.style.opacity='.55';return}
    if(Q)Q.configureRenderer(renderer,{exposure:1.10,pixelCap:mobile?(lowPower?1.55:1.9):2.25});else{renderer.setPixelRatio(Math.min(devicePixelRatio||1,2.2));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.10;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;}
    if(Q){const tex=Q.prepareTexture(Q.makeScreenTexture('CONNECTED PRODUCTION ROUTE'),renderer);M.screen.map=tex;M.screen.emissiveMap=tex;M.screen.needsUpdate=true;}
    scene=new THREE.Scene();scene.background=new THREE.Color(0x0d0b08);scene.fog=new THREE.FogExp2(0x0d0b08,.017);if(Q)Q.studioEnvironment(scene);
    scene.add(new THREE.HemisphereLight(0xf0deba,0x14110d,1.05));
    keyLight=new THREE.DirectionalLight(0xffe9bc,1.23);keyLight.position.set(8,12,7);if(Q)Q.tuneShadow(keyLight,mobile?(lowPower?512:1024):Q.shadowMapSize,16);else{keyLight.castShadow=true;keyLight.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);keyLight.shadow.camera.left=-16;keyLight.shadow.camera.right=16;keyLight.shadow.camera.top=16;keyLight.shadow.camera.bottom=-16}scene.add(keyLight);
    const teal=new THREE.PointLight(0x66b7ab,.48,44);teal.position.set(-8,5,8);scene.add(teal);

    const floor=new THREE.Mesh(new THREE.PlaneGeometry(38,96),new THREE.MeshStandardMaterial({color:0x0f0d0a,roughness:.93}));floor.rotation.x=-Math.PI/2;floor.position.set(0,0,routeCenterZ);floor.receiveShadow=true;scene.add(floor);
    const grid=new THREE.GridHelper(92,64,0x6d5125,0x211b15);grid.position.z=routeCenterZ;grid.material.transparent=true;grid.material.opacity=.10;scene.add(grid);if(Q&&!lowPower&&!mobile)Q.addContactShadow(scene,renderer,15.5,.28,.012);

    const makers=[booth,showroom,interior,management,crowd,av];
    groups=makers.map((fn,i)=>{
      const g=fn();g.position.copy(centers[i]);scene.add(g);
      const halo=ceilingRing(g,0,4.72,0,4.22,i%2?0x71c2b5:0xcda452);halo.material.opacity=.18;
      // Service marker and perimeter accent pylons.
      [-4.15,4.15].forEach((x,n)=>{box(g,.18,2.15,.18,x,1.08,2.8,n?M.teal:M.gold);sphere(g,.12,x,2.28,2.8,n?M.teal:M.gold,10)});
      return g;
    });
    for(let i=0;i<centers.length-1;i++)addRoute(centers[i],centers[i+1],i);

    // A restrained field of particles reinforces depth without distracting from the models.
    const count=mobile?0:110,positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*25;positions[i*3+1]=1+Math.random()*8;positions[i*3+2]=-92+Math.random()*100}
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const particles=new THREE.Points(pg,new THREE.PointsMaterial({color:0xcda452,size:.035,transparent:true,opacity:.28,depthWrite:false}));scene.add(particles);animated.fans.push(particles);

    scene.traverse(o=>{if(o.isPointLight||o.isSpotLight)sceneLights.push(o)});
    cameraPath=new THREE.CatmullRomCurve3(centers.map(c=>new THREE.Vector3(c.x,1.72,c.z)),false,'catmullrom',.18);
    camera=new THREE.PerspectiveCamera(mobile?55:42,1,.1,240);resize();
    const profile=viewportProfile(),d=stageFitDistance(profile,1.02),start=centers[0];
    cameraPosition.set(start.x,start.y+2.1,start.z+d);cameraTarget.set(start.x,1.72,start.z);camera.position.copy(cameraPosition);camera.lookAt(cameraTarget);
    bind();sticky.classList.add('model-active');update();render();
  }

  function resize(){
    if(!renderer)return;
    const profile=viewportProfile(),w=profile.w,h=profile.h;
    renderer.setPixelRatio(qualityRatio(w,h,overviewActive));
    renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.fov=profile.fov;camera.updateProjectionMatrix();
  }
  function bind(){
    canvas.style.touchAction='pan-y';
    canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture?.(e.pointerId)});
    canvas.addEventListener('pointermove',e=>{if(!dragging)return;targetTouchYaw+=(e.clientX-lastX)*.004;lastX=e.clientX});
    ['pointerup','pointercancel'].forEach(k=>canvas.addEventListener(k,e=>{dragging=false;try{canvas.releasePointerCapture?.(e.pointerId)}catch(_){}}));
    const visibilityObserver=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible){requestAnimationFrame(resize);setTimeout(resize,120)}},{rootMargin:'240px 0px',threshold:0});
    visibilityObserver.observe(sticky);
    window.addEventListener('resize',resize,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(resize,140),{passive:true});
    window.visualViewport?.addEventListener('resize',resize,{passive:true});
    if('ResizeObserver' in window){const ro=new ResizeObserver(()=>resize());ro.observe(sticky);}
    window.addEventListener('scroll',update,{passive:true});
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden});
    document.addEventListener('languagechange',()=>{current=-1;setCopy(Math.min(5,Math.floor(clamp(progress/.865)*6)),progress>.90)});
  }

  let overviewState=false;
  function setCopy(i,overview=false){
    if(i===current&&overview===overviewState)return;
    current=i;overviewState=overview;
    const lang=document.documentElement.lang==='ar'?'ar':'en';
    copyBox?.classList.add('switching');
    requestAnimationFrame(()=>{
      if(overview){
        index.textContent='06 / 06';
        title.textContent=lang==='ar'?'منظومة تنفيذ واحدة متكاملة':'One connected delivery system';
        body.textContent=lang==='ar'?'تجتمع العمارة والتصنيع والتشغيل والأنظمة التقنية وحركة الضيوف ضمن مسار واحد من الفكرة حتى يوم الافتتاح.':'Architecture, fabrication, operations, technology and guest movement now read as one production route from concept to opening day.';
        rail.forEach(x=>x.classList.add('active'));
      }else{
        const item=copy[lang][i];index.textContent=String(i+1).padStart(2,'0')+' / 06';title.textContent=item[0];body.textContent=item[1];rail.forEach((x,n)=>x.classList.toggle('active',n===i));
      }
      requestAnimationFrame(()=>copyBox?.classList.remove('switching'));
    });
  }
  function update(){
    const viewportH=window.visualViewport?.height||innerHeight;
    const r=track.getBoundingClientRect(),span=Math.max(1,r.height-viewportH);
    targetProgress=clamp(-r.top/span);
    if(scrollIndicator){
      const fade=1-smoother(clamp((targetProgress-.012)/.14));
      scrollIndicator.style.opacity=fade.toFixed(3);
      scrollIndicator.style.transform=`translate3d(-50%,${((1-fade)*8).toFixed(1)}px,0)`;
    }
    const i=Math.min(5,Math.floor(clamp(targetProgress/.865)*6));
    setCopy(i,targetProgress>.90);
  }

  function objectVisible(o){
    let n=o;
    while(n){if(n.visible===false)return false;n=n.parent;}
    return true;
  }

  function render(now=performance.now()){
    const minFrame=mobile?(lowPower?30:20):0;
    if(minFrame&&now-lastFrame<minFrame){requestAnimationFrame(render);return;}
    const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):1/60;
    lastFrame=now;
    if(renderer&&visible&&pageVisible){
      const progressEase=1-Math.exp(-(mobile?8.0:10.5)*dt);
      progress+= (targetProgress-progress)*progressEase;
      if(Math.abs(targetProgress-progress)<.00008)progress=targetProgress;
      targetTouchYaw*=Math.exp(-4.8*dt);
      touchYaw+=(targetTouchYaw-touchYaw)*(1-Math.exp(-7.5*dt));
      const p=progress,t=now*.001,profile=viewportProfile();
      const overviewStart=.865;
      if(p<overviewStart){
        const travel=smoother(clamp(p/overviewStart));
        const raw=travel*5;
        const base=Math.min(5,Math.floor(raw));
        const next=Math.min(5,base+1);
        const target=cameraPath.getPointAt(travel);
        target.y=1.72+profile.portrait*.08;
        const angle=(mobile?.035:.10)+Math.sin(travel*Math.PI)* (mobile?.04:.12)+touchYaw*(mobile?.35:.75);
        const distance=stageFitDistance(profile,1.015+Math.sin(travel*Math.PI)*.015);
        const elevation=mobile?.072:.105;
        const horizontal=Math.cos(elevation)*distance;
        desiredPosition.set(target.x+Math.sin(angle)*horizontal,target.y+Math.sin(elevation)*distance,target.z+Math.cos(angle)*horizontal);
        desiredTarget.copy(target);
        desiredUp.set(0,1,0);
        groups.forEach((g,i)=>{g.visible=i===base||i===next||i===base-1});
        routeGroups.forEach((g,i)=>{g.visible=i===base||i===base-1});
        if(overviewActive){
          overviewActive=false;
          renderer.shadowMap.enabled=true;
          if(keyLight)keyLight.castShadow=!lowPower;
          sceneLights.forEach(l=>l.visible=true);
          resize();
        }
      }else{
        const q=smoother(clamp((p-overviewStart)/(1-overviewStart)));
        groups.forEach(g=>g.visible=true);routeGroups.forEach(g=>g.visible=true);
        if(!overviewActive){
          overviewActive=true;
          if(mobile){renderer.shadowMap.enabled=false;if(keyLight)keyLight.castShadow=false;sceneLights.forEach(l=>l.visible=false);}
          resize();
        }
        const last=centers[5];
        const closeTarget=new THREE.Vector3(last.x,1.72,last.z);
        const closeDistance=stageFitDistance(profile,1.02),closeElevation=mobile?.072:.105,closeAngle=mobile?.04:.12;
        const closeHorizontal=Math.cos(closeElevation)*closeDistance;
        const closePos=new THREE.Vector3(closeTarget.x+Math.sin(closeAngle)*closeHorizontal,closeTarget.y+Math.sin(closeElevation)*closeDistance,closeTarget.z+Math.cos(closeAngle)*closeHorizontal);
        const overviewDistance=overviewFit(profile);
        const overviewPos=new THREE.Vector3(0,overviewDistance,routeCenterZ+.01);
        const overviewTarget=new THREE.Vector3(0,.55,routeCenterZ);
        desiredPosition.lerpVectors(closePos,overviewPos,q);
        desiredTarget.lerpVectors(closeTarget,overviewTarget,q);
        const targetUp=mobile?new THREE.Vector3(0,0,-1):new THREE.Vector3(1,0,0);
        desiredUp.lerpVectors(new THREE.Vector3(0,1,0),targetUp,q).normalize();
      }
      const cameraEase=1-Math.exp(-(mobile?11.5:13.5)*dt);
      cameraPosition.lerp(desiredPosition,cameraEase);
      cameraTarget.lerp(desiredTarget,cameraEase);
      camera.position.copy(cameraPosition);
      camera.up.lerp(desiredUp,cameraEase).normalize();
      camera.lookAt(cameraTarget);

      const exit=smoother(clamp((p-.965)/.035));
      sticky.style.setProperty('--connected-exit',exit.toFixed(4));

      groups.forEach((g,i)=>{if(g.visible)g.rotation.y=Math.sin(t*.22+i)*.017});
      animated.people.forEach((o,n)=>{if(!objectVisible(o.torso))return;const bob=Math.sin(t*1.25+n*.55)*.018;o.torso.position.y=o.base+bob;o.head.position.y=o.headBase+bob});
      animated.screens.forEach((s,i)=>{if(objectVisible(s))s.material.emissiveIntensity=1.04+Math.sin(t*2.4+i*.72)*.12});
      animated.spots.forEach((s,i)=>{if(s.visible&&objectVisible(s))s.intensity=1.35+Math.sin(t*1.8+i*.72)*.30});
      animated.rings.forEach((r,i)=>{if(objectVisible(r))r.rotation.z=t*(i%2?-.016:.014)});
      animated.statusLights.forEach((l,i)=>{if(objectVisible(l))l.intensity=.20+Math.sin(t*2+i*.37)*.06});
      animated.routeMarkers.forEach((marker,i)=>{if(!objectVisible(marker))return;const u=(t*(reduce?0:.072)+marker.userData.offset)%1,pos=marker.userData.curve.getPointAt(u);marker.position.copy(pos);marker.position.y=.38+Math.sin(t*3.5+i)*.02});
      animated.fans.forEach((f,i)=>{if(objectVisible(f))f.rotation.y=t*.008*(i%2?1:-1)});
      renderer.render(scene,camera);
    }
    requestAnimationFrame(render);
  }


  if('IntersectionObserver' in window){
    const bootstrap=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){bootstrap.disconnect();init();}
    },{rootMargin:'800px 0px',threshold:0});
    bootstrap.observe(track);
  }else{init();}
})();
