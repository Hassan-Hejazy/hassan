(function(){
  'use strict';
  const canvas=document.getElementById('wecanSceneCanvas');
  const layer=document.getElementById('wecan3dLayer');
  if(!canvas||!layer)return;
  let progress=0;
  window.WeCanScene={update(value){progress=Math.max(0,Math.min(1,value||0));}};
  if(!window.THREE)return;

  const mobile=matchMedia('(max-width:760px)').matches;
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  let renderer,scene,camera,world,visible=true,dragging=false,lastX=0,targetYaw=0,yaw=0;
  const animated={screens:[],lights:[],people:[],rings:[],beams:[]};
  const M={
    gold:new THREE.MeshStandardMaterial({color:0xcda452,metalness:.62,roughness:.3,emissive:0x4a2f08,emissiveIntensity:.18}),
    goldDark:new THREE.MeshStandardMaterial({color:0x765721,metalness:.45,roughness:.5}),
    dark:new THREE.MeshStandardMaterial({color:0x17130f,metalness:.2,roughness:.64}),
    black:new THREE.MeshStandardMaterial({color:0x090806,metalness:.3,roughness:.5}),
    cream:new THREE.MeshStandardMaterial({color:0xeee2cb,roughness:.74}),
    white:new THREE.MeshStandardMaterial({color:0xf7f2e9,roughness:.78}),
    teal:new THREE.MeshStandardMaterial({color:0x67a69a,roughness:.42,metalness:.16,emissive:0x153e38,emissiveIntensity:.18}),
    screen:new THREE.MeshStandardMaterial({color:0x0b1413,emissive:0x7fd2c3,emissiveIntensity:1.15,roughness:.36}),
    glass:new THREE.MeshPhysicalMaterial({color:0xbdded7,transparent:true,opacity:.25,transmission:.62,thickness:.22,roughness:.07}),
    wood:new THREE.MeshStandardMaterial({color:0x6c4a2f,roughness:.72})
  };
  const sh=(o,cast=true)=>{o.castShadow=cast&&!mobile;o.receiveShadow=true;return o};
  function box(g,w,h,d,x,y,z,m=M.dark){const o=sh(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m));o.position.set(x,y,z);g.add(o);return o}
  function cyl(g,r1,r2,h,x,y,z,m=M.gold,seg=18){const o=sh(new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg),m));o.position.set(x,y,z);g.add(o);return o}
  function plane(g,w,h,x,y,z,m,ry=0){const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);o.position.set(x,y,z);o.rotation.y=ry;g.add(o);return o}
  function truss(g,w,d,h,x=0,z=0){[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]].forEach(([px,pz])=>box(g,.15,h,.15,x+px,h/2,z+pz,M.gold));box(g,w,.15,.15,x,h,z-d/2,M.gold);box(g,w,.15,.15,x,h,z+d/2,M.gold);box(g,.15,.15,d,x-w/2,h,z,M.gold);box(g,.15,.15,d,x+w/2,h,z,M.gold);for(let i=-2;i<=2;i++){const brace=box(g,.055,.055,d,x+i*w/5,h,z,M.goldDark);brace.rotation.x=Math.PI/2}}
  function monitor(g,x,y,z,w,h,ry=0){const frame=box(g,w,h,.12,x,y,z,M.black);frame.rotation.y=ry;const scr=plane(g,w*.88,h*.78,x,y,z+.066,M.screen,ry);animated.screens.push(scr);return scr}
  function chair(g,x,z,ry=0,material=M.cream){const c=new THREE.Group();box(c,.68,.12,.68,0,.53,0,material);box(c,.68,.7,.12,0,.9,-.28,material);[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]].forEach(([lx,lz])=>cyl(c,.03,.03,.52,lx,.26,lz,M.goldDark,8));c.position.set(x,0,z);c.rotation.y=ry;g.add(c);return c}
  function plant(g,x,z,s=1){cyl(g,.2,.3,.45,x,.23,z,M.dark,16);for(let i=0;i<8;i++){const leaf=sh(new THREE.Mesh(new THREE.SphereGeometry(.17,12,9),new THREE.MeshStandardMaterial({color:i%2?0x45634d:0x58785f,roughness:.82})));leaf.scale.set(.62*s,1.55*s,.45*s);leaf.position.set(x+(i-3.5)*.05*s,.57+i*.065*s,z+(i%2?.06:-.06));leaf.rotation.z=(i-3.5)*.07;g.add(leaf)}}
  function person(g,x,z,color=M.dark,scale=1){const torso=cyl(g,.13*scale,.17*scale,.62*scale,x,.64*scale,z,color,10);const head=sh(new THREE.Mesh(new THREE.SphereGeometry(.125*scale,14,10),M.cream));head.position.set(x,1.08*scale,z);g.add(head);[-.07,.07].forEach(dx=>cyl(g,.034*scale,.034*scale,.5*scale,x+dx,.25*scale,z,M.dark,8));const p={torso,head,base:.64*scale,headBase:1.08*scale};animated.people.push(p);return p}
  function arch(g,x,z,r=2.4){const a=sh(new THREE.Mesh(new THREE.TorusGeometry(r,.085,12,64,Math.PI),M.gold));a.rotation.z=Math.PI/2;a.position.set(x,3.25,z);g.add(a);return a}
  function addBeam(g,x,z,color=0xffdf9f){const beam=new THREE.Mesh(new THREE.CylinderGeometry(.06,.78,4.8,16,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));beam.position.set(x,2.25,z);g.add(beam);animated.beams.push(beam);const light=new THREE.SpotLight(color,2.2,18,.36,.66,1.4);light.position.set(x,5.2,z+1.8);light.target.position.set(x,.1,z-.4);g.add(light,light.target);animated.lights.push(light)}

  function buildWorld(){
    world=new THREE.Group();scene.add(world);
    const floor=sh(new THREE.Mesh(new THREE.CylinderGeometry(10.4,10.8,.34,72),new THREE.MeshStandardMaterial({color:0x11100d,roughness:.92,metalness:.05})),false);floor.position.y=.17;world.add(floor);
    const outer=new THREE.Mesh(new THREE.RingGeometry(8.4,9.65,72),new THREE.MeshBasicMaterial({color:0xcda452,side:THREE.DoubleSide,transparent:true,opacity:.2}));outer.rotation.x=-Math.PI/2;outer.position.y=.35;world.add(outer);animated.rings.push(outer);
    const grid=new THREE.GridHelper(22,30,0x735626,0x211a13);grid.material.transparent=true;grid.material.opacity=.17;grid.position.y=.36;world.add(grid);

    // Main exhibition architecture
    truss(world,10.8,6.6,6.2,0,-1.1);
    box(world,9.8,5.25,.18,0,2.8,-4.3,M.cream);
    box(world,.18,4.7,4.2,-5.3,2.5,-2.2,M.white);box(world,.18,4.7,4.2,5.3,2.5,-2.2,M.white);
    monitor(world,0,3.2,-4.18,4.8,2.7);
    box(world,6.8,.8,.2,0,5.55,2.15,M.gold);
    box(world,3.2,1.05,1.05,0,.55,1.05,M.dark);box(world,3.3,.08,1.12,0,1.07,1.05,M.gold);
    [-2.35,2.35].forEach(x=>{chair(world,x,1.9,x<0?-.2:.2);plant(world,x*1.7,1.7,1.1)});
    const loungeTable=sh(new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.1,30),M.glass));loungeTable.position.set(0,.68,2.35);world.add(loungeTable);cyl(world,.1,.16,.95,0,.48,2.35,M.gold,16);

    // Showroom wing
    box(world,.16,4.6,5.3,-7.0,2.3,-.25,M.dark);
    for(let y=1.0;y<4.1;y+=.92){box(world,.82,.09,4.5,-6.55,y,0,M.gold);for(let z=-1.8;z<=1.8;z+=.9){box(world,.34,.48,.32,-6.35,y+.26,z,(Math.round(z*10)+Math.round(y*10))%2?M.teal:M.cream)}}
    [-4.8,-3.55,-2.3].forEach((x,i)=>box(world,1.05,.7+i*.18,1.05,x,.38+i*.09,-.75,i===1?M.gold:M.white));arch(world,-4.0,1.4,2.15);

    // Hospitality wing
    box(world,4.4,.08,3.7,5.4,.39,-.2,new THREE.MeshStandardMaterial({color:0x5f4935,roughness:.96}));
    box(world,3.4,.86,1.05,5.5,.78,-1.05,M.cream);box(world,3.4,1.02,.28,5.5,1.38,-1.43,M.cream);
    [4.5,5.5,6.5].forEach((x,i)=>box(world,.72,.42,.16,x,1.15,-1.52,i===1?M.gold:M.teal));chair(world,3.8,.75,-.38);chair(world,7.2,.75,.38);
    const sideTable=sh(new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,.09,28),M.glass));sideTable.position.set(5.5,.8,.65);world.add(sideTable);cyl(world,.09,.14,.9,5.5,.45,.65,M.gold,14);plant(world,7.6,-1.45,.95);

    // Project control desk
    box(world,5.6,.22,2.1,0,.92,-.65,M.dark);[-1.85,0,1.85].forEach(x=>monitor(world,x,1.8,-.82,1.4,.85));
    box(world,4.9,2.6,.13,0,2.65,-2.95,M.white);for(let i=0;i<5;i++)for(let j=0;j<3;j++)box(world,.62,.34,.05,-1.7+i*.85,3.25-j*.54,-2.87,(i+j)%3===0?M.teal:(i+j)%2?M.gold:M.wood);

    // AV / stage details
    box(world,5.4,.38,2.7,0,.25,-5.6,M.dark);monitor(world,0,2.35,-6.9,4.5,2.45);[-3.0,3.0].forEach(x=>box(world,.65,1.5,.62,x,1.2,-5.8,M.black));
    box(world,3.0,.82,1.0,0,.45,5.0,M.black);for(let i=-4;i<=4;i++){box(world,.07,.055,.42,i*.29,.89,5.0,i%2?M.gold:M.teal);cyl(world,.045,.045,.08,i*.29,.94,4.76,M.cream,10)}
    [-3.4,-1.7,0,1.7,3.4].forEach((x,i)=>addBeam(world,x,-3.6,i%2?0x77cbbd:0xffdfa2));

    // Crowd route and people
    const routeMat=new THREE.MeshStandardMaterial({color:0x4b3717,emissive:0x5c3b07,emissiveIntensity:.42,roughness:.65});
    box(world,2.2,.12,12.5,0,.42,.1,routeMat);box(world,9.5,.12,1.5,0,.425,3.55,routeMat);
    for(let i=0;i<20;i++){const x=(i%5-2)*.72,z=Math.floor(i/5)*1.02+.2;person(world,x,z,i%6===0?M.gold:(i%5===0?M.teal:M.dark),.92)}
    [-1.7,-.55,.55,1.7].forEach(x=>{box(world,.06,.72,3.9,x,.72,3.8,M.goldDark);for(let z=2.5;z<5.5;z+=1){cyl(world,.052,.052,.8,x,.76,z,M.goldDark,10)}});

    // Floating brand rings and wayfinding
    [2.7,3.35,4.0].forEach((r,i)=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.035,8,80),new THREE.MeshBasicMaterial({color:i===1?0x75c7bb:0xcda452,transparent:true,opacity:.22}));ring.rotation.x=Math.PI/2;ring.position.set(0,4.85-i*.18,-.4);world.add(ring);animated.rings.push(ring)});
    [-8.0,8.0].forEach((x,i)=>{box(world,.18,3.8,.18,x,1.9,2.7,M.gold);box(world,1.5,.55,.12,x,3.55,2.7,M.gold);monitor(world,x,2.55,2.62,1.25,.72,0)});
  }

  function init(){
    try{renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,alpha:true,powerPreference:'high-performance'})}catch(e){return}
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.15:1.65));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=!mobile;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x080704);scene.fog=new THREE.FogExp2(0x080704,.023);
    scene.add(new THREE.HemisphereLight(0xf1dfbd,0x100d09,1.05));const key=new THREE.DirectionalLight(0xffe9bd,1.2);key.position.set(9,13,9);if(!mobile){key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-18;key.shadow.camera.right=18;key.shadow.camera.top=18;key.shadow.camera.bottom=-18}scene.add(key);const rim=new THREE.PointLight(0x69bcaf,.55,40);rim.position.set(-10,6,8);scene.add(rim);
    buildWorld();camera=new THREE.PerspectiveCamera(mobile?53:43,1,.1,120);resize();bind();layer.classList.add('model-active');render();
  }
  function resize(){if(!renderer||!camera)return;const r=layer.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<700?53:43;camera.updateProjectionMatrix()}
  function bind(){canvas.style.touchAction='pan-y';canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture?.(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!dragging)return;targetYaw+=(e.clientX-lastX)*.0045;lastX=e.clientX});['pointerup','pointercancel'].forEach(k=>canvas.addEventListener(k,e=>{dragging=false;try{canvas.releasePointerCapture?.(e.pointerId)}catch(_){}}));addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>visible=!document.hidden)}
  function render(){
    if(renderer&&visible){const t=performance.now()*.001;targetYaw*=.94;yaw+=(targetYaw-yaw)*.08;const q=Math.max(0,Math.min(1,(progress-.73)/.27));const eased=q*q*(3-2*q);const radius=mobile?14.8:13.2;const angle=.35+yaw+eased*.28;camera.position.set(Math.sin(angle)*radius,5.1+eased*2.8,Math.cos(angle)*radius+1.2-eased*3.5);camera.lookAt(0,1.9-eased*.2,-.8-eased*1.4);world.rotation.y=Math.sin(t*.2)*.025;
      animated.screens.forEach((s,i)=>s.material.emissiveIntensity=1.05+Math.sin(t*2.7+i*.8)*.18);animated.lights.forEach((l,i)=>l.intensity=1.7+Math.sin(t*2+i)*.55);animated.beams.forEach((b,i)=>b.material.opacity=.08+Math.sin(t*1.5+i*.8)*.035);animated.people.forEach((p,i)=>{const bob=Math.sin(t*1.25+i*.52)*.025;p.torso.position.y=p.base+bob;p.head.position.y=p.headBase+bob});animated.rings.forEach((r,i)=>{r.rotation.z=t*(i%2?-.035:.028)});renderer.render(scene,camera)}requestAnimationFrame(render)
  }
  const observer=new IntersectionObserver(entries=>{entries.forEach(e=>visible=e.isIntersecting)},{threshold:.03});observer.observe(layer);init();
})();
