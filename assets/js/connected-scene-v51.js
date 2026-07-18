(function(){
  'use strict';

  const canvas=document.getElementById('connectedCanvas');
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
  const Q=window.BYMELI_QUALITY||null;
  const factory=window.ByMeliServiceFactory||null;
  if(!factory)return;

  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>t*t*(3-2*t);
  const smoother=t=>t*t*t*(t*(t*6-15)+10);
  const WORLD_UP=new THREE.Vector3(0,1,0);

  const TYPES=['booth','showroom','interior','management','crowd','av'];
  const COPY={
    en:[
      ['Exhibition Stands & Pavilions','Architecture, fabrication, media and hospitality begin as one controlled environment.'],
      ['Showrooms & Brand Spaces','Product display, consultation and brand architecture are presented from the customer-facing side.'],
      ['Event Interiors & Hospitality','Furniture, material warmth and lighting transform space into a complete guest experience.'],
      ['Project Management & Site Delivery','Approvals, planning, logistics and site control move the concept toward opening day.'],
      ['Crowd & Guest Operations','Registration, movement, staffing and wayfinding keep every guest journey clear and composed.'],
      ['Audio Visual & Live Production','Stage, LED, sound, lighting and show control complete the live environment.'],
      ['One Partner. Every Environment.','From concept and fabrication to guest operations and live production, every discipline arrives as one controlled delivery system.']
    ],
    ar:[
      ['أجنحة المعارض والأجنحة الوطنية','تبدأ العمارة والتصنيع والوسائط والضيافة ضمن بيئة تنفيذ واحدة ومنضبطة.'],
      ['صالات العرض ومساحات العلامات التجارية','تظهر المنتجات والاستشارات وهوية المكان من الزاوية المفتوحة والمواجهة للعميل.'],
      ['ديكورات الفعاليات والضيافة','تحول الخامات والأثاث والإضاءة المساحة إلى تجربة متكاملة للضيوف.'],
      ['إدارة المشاريع والتنفيذ في الموقع','تنقل الاعتمادات والجداول واللوجستيات وإدارة الموقع الفكرة إلى يوم الافتتاح.'],
      ['إدارة الحشود وتجربة الضيوف','تنظم التسجيل والحركة والفرق والإرشاد رحلة الضيف بهدوء ووضوح.'],
      ['الأنظمة السمعية والبصرية والإنتاج الحي','تكتمل البيئة من خلال المسرح والشاشات والصوت والإضاءة والتحكم.'],
      ['شريك واحد لكل بيئة','من الفكرة والتصنيع إلى تشغيل الضيوف والإنتاج الحي، تصل جميع التخصصات ضمن منظومة تنفيذ واحدة.']
    ]
  };

  const VIEW={
    phonePortrait:[
      {yaw:.52,elev:.205,focusY:.018,compY:-.055},
      {yaw:.38,elev:.195,focusY:.022,compY:-.052},
      {yaw:.48,elev:.176,focusY:.040,compY:-.050},
      {yaw:.46,elev:.205,focusY:.028,compY:-.052},
      {yaw:.40,elev:.176,focusY:.048,compY:-.046},
      {yaw:.50,elev:.198,focusY:.038,compY:-.050}
    ],
    phoneLandscape:[
      {yaw:.55,elev:.220,focusY:.016,compY:-.020},
      {yaw:.41,elev:.210,focusY:.020,compY:-.018},
      {yaw:.51,elev:.192,focusY:.036,compY:-.016},
      {yaw:.49,elev:.220,focusY:.026,compY:-.018},
      {yaw:.43,elev:.188,focusY:.044,compY:-.014},
      {yaw:.53,elev:.212,focusY:.034,compY:-.016}
    ],
    tablet:[
      {yaw:.58,elev:.232,focusY:.014,compY:.000},
      {yaw:.44,elev:.222,focusY:.018,compY:.000},
      {yaw:.54,elev:.204,focusY:.034,compY:.004},
      {yaw:.52,elev:.232,focusY:.024,compY:.000},
      {yaw:.46,elev:.198,focusY:.040,compY:.006},
      {yaw:.56,elev:.224,focusY:.032,compY:.002}
    ],
    desktop:[
      {yaw:.60,elev:.242,focusY:.012,compY:.002},
      {yaw:.46,elev:.232,focusY:.018,compY:.002},
      {yaw:.56,elev:.212,focusY:.032,compY:.006},
      {yaw:.54,elev:.244,focusY:.024,compY:.002},
      {yaw:.48,elev:.204,focusY:.038,compY:.008},
      {yaw:.58,elev:.232,focusY:.030,compY:.004}
    ]
  };

  const SEGMENTS=[];
  const SERVICE_HOLD=.10;
  const SERVICE_TRANSITION=.035;
  const FINAL_TRANSITION=.055;
  const FINAL_HOLD=1-(SERVICE_HOLD*6+SERVICE_TRANSITION*5+FINAL_TRANSITION);
  let cursor=0;
  for(let i=0;i<6;i++){
    SEGMENTS.push({type:'service',stage:i,start:cursor,end:cursor+SERVICE_HOLD});cursor+=SERVICE_HOLD;
    if(i<5){SEGMENTS.push({type:'transition',stage:i,next:i+1,start:cursor,end:cursor+SERVICE_TRANSITION});cursor+=SERVICE_TRANSITION;}
  }
  SEGMENTS.push({type:'finalTransition',stage:5,next:6,start:cursor,end:cursor+FINAL_TRANSITION});cursor+=FINAL_TRANSITION;
  SEGMENTS.push({type:'finale',stage:6,start:cursor,end:1});

  let renderer=null,scene=null,camera=null,world=null,serviceStage=null,finale=null;
  let keyLight=null,fillLight=null,rimLight=null,topLight=null;
  let profile=null,models=[],modelBoxes=[],servicePoses=[],finalPose=null;
  let activeStage=-1,initialized=false,initQueued=false,visible=false,pageVisible=!document.hidden;
  let raf=0,resizeQueued=false,progress=0,targetProgress=0,trackStart=0,trackSpan=1;
  let idleFrames=0;
  let lastFrame=0,lastScrollAt=0,lastY=window.scrollY||0,copyStage=-1,lastMode='',renderDirty=true;
  let finaleBeams=[],finaleHeads=[],finaleScreen=null,finaleGlow=null;
  let observer=null,resizeObserver=null;

  const fitCamera=new THREE.PerspectiveCamera(34,1,.08,180);
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpC=new THREE.Vector3();

  function getProfile(){
    const w=Math.max(1,Math.round(sticky.clientWidth||innerWidth));
    const h=Math.max(1,Math.round(sticky.clientHeight||innerHeight));
    const aspect=w/h;
    const compact=w<760||(matchMedia('(pointer:coarse)').matches&&w<900);
    const tablet=!compact&&w<1180;
    const portrait=aspect<.88;
    const landscape=aspect>1.46;
    const memory=Number(navigator.deviceMemory||6);
    const cores=Number(navigator.hardwareConcurrency||6);
    const low=memory<=3||cores<=4;
    const high=memory>=6&&cores>=6;
    const tier=low?'low':(high?'high':'balanced');
    const fov=compact?(portrait?30.6:(landscape?32.1:31.4)):(tablet?32.6:32.2);
    return {w,h,aspect,compact,tablet,portrait,landscape,memory,cores,low,high,tier,fov};
  }

  function stablePixelRatio(p){
    const dpr=Math.max(1,window.devicePixelRatio||1);
    let budget,cap,min;
    if(p.compact){
      budget=p.high?1750000:(p.low?820000:1260000);
      cap=p.high?2.00:(p.low?1.35:1.70);
      min=p.low?1.00:1.20;
    }else if(p.tablet){
      budget=p.high?2850000:(p.low?1500000:2150000);
      cap=p.high?1.95:(p.low?1.35:1.70);
      min=p.low?1.00:1.18;
    }else{
      budget=p.high?4200000:(p.low?2350000:3200000);
      cap=p.high?1.90:(p.low?1.35:1.72);
      min=p.low?1.00:1.15;
    }
    return Math.max(min,Math.min(dpr,cap,Math.sqrt(budget/Math.max(1,p.w*p.h))));
  }

  function createRenderer(){
    try{return new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,premultipliedAlpha:false,powerPreference:'high-performance',precision:'highp',stencil:false,preserveDrawingBuffer:false,depth:true});}
    catch(_){
      try{return new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'default',precision:'mediump',stencil:false,preserveDrawingBuffer:false,depth:true});}
      catch(__){return null;}
    }
  }

  function applyRendererProfile(){
    const ratio=stablePixelRatio(profile);
    renderer.setPixelRatio(ratio);
    renderer.setSize(profile.w,profile.h,false);
    renderer.setClearColor(0x070605,1);
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.18;
    renderer.physicallyCorrectLights=true;
    renderer.shadowMap.enabled=!profile.low&&!profile.compact;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=false;
  }

  function roundedPlatform(width,depth,height,radius,material){
    const shape=new THREE.Shape();
    const x=-width/2,y=-depth/2,w=width,h=depth,r=Math.min(radius,width/2,depth/2);
    shape.moveTo(x+r,y);
    shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
    shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);
    shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelThickness:.055,bevelSize:.055,bevelSegments:2,curveSegments:12});
    geo.rotateX(Math.PI/2);geo.translate(0,height/2,0);
    return new THREE.Mesh(geo,material);
  }

  function makeCanvasTexture(){
    const c=document.createElement('canvas');c.width=1600;c.height=900;
    const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,1600,900);g.addColorStop(0,'#07100e');g.addColorStop(.55,'#123c31');g.addColorStop(1,'#151006');x.fillStyle=g;x.fillRect(0,0,1600,900);
    const glow=x.createRadialGradient(1180,200,10,1180,200,700);glow.addColorStop(0,'rgba(104,205,183,.38)');glow.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=glow;x.fillRect(0,0,1600,900);
    x.strokeStyle='rgba(219,183,101,.26)';x.lineWidth=2;for(let i=0;i<14;i++){x.beginPath();x.moveTo(70+i*110,0);x.lineTo(70+i*110,900);x.stroke();}
    x.fillStyle='#f6efe2';x.font='800 112px Inter,Arial,sans-serif';x.fillText('BY MELI',92,190);
    x.fillStyle='#d9b66b';x.font='600 34px IBM Plex Mono,monospace';x.fillText('ONE PARTNER / EVERY ENVIRONMENT',96,252);
    x.fillStyle='rgba(246,239,226,.86)';x.font='500 44px Inter,Arial,sans-serif';x.fillText('DESIGN  •  BUILD  •  DELIVER  •  OPERATE',96,704);
    const services=['BUILD','DISPLAY','INTERIOR','MANAGE','FLOW','LIVE AV'];
    services.forEach((s,i)=>{x.fillStyle=i%2?'rgba(102,196,178,.88)':'rgba(217,182,107,.92)';x.fillRect(96+i*235,768,170,8);x.fillStyle='rgba(246,239,226,.72)';x.font='600 22px IBM Plex Mono,monospace';x.fillText(s,96+i*235,820);});
    const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy?.()||1);tex.needsUpdate=true;return tex;
  }

  function buildWorld(){
    scene=new THREE.Scene();scene.background=new THREE.Color(0x070605);scene.fog=new THREE.FogExp2(0x070605,.017);
    if(Q)Q.studioEnvironment(scene);
    world=new THREE.Group();scene.add(world);

    const floor=new THREE.Mesh(new THREE.PlaneGeometry(90,90),new THREE.MeshStandardMaterial({color:0x080706,roughness:.84,metalness:.09}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.21;floor.receiveShadow=renderer.shadowMap.enabled;world.add(floor);

    const inset=new THREE.Mesh(new THREE.PlaneGeometry(34,28),new THREE.MeshPhysicalMaterial({color:0x0f0d0a,roughness:.52,metalness:.22,clearcoat:.22,clearcoatRoughness:.42}));
    inset.rotation.x=-Math.PI/2;inset.position.y=-.205;inset.receiveShadow=renderer.shadowMap.enabled;world.add(inset);

    const brassMat=new THREE.MeshStandardMaterial({color:0xb68e42,roughness:.32,metalness:.92});
    [[0,-12,30,.09],[0,12,30,.09],[-15,0,.09,24],[15,0,.09,24]].forEach(([x,z,w,d])=>{
      const strip=new THREE.Mesh(new THREE.BoxGeometry(w,.018,d),brassMat);strip.position.set(x,-.19,z);world.add(strip);
    });

    const backdropMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x1a1712)},bottom:{value:new THREE.Color(0x050504)}},vertexShader:'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 v;uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp((normalize(v).y+1.0)*.5,0.0,1.0);gl_FragColor=vec4(mix(bottom,top,smoothstep(.10,.92,h)),1.0);}'});
    const dome=new THREE.Mesh(new THREE.SphereGeometry(36,profile.low?28:56,profile.low?18:32),backdropMat);dome.position.y=4;world.add(dome);

    serviceStage=new THREE.Group();serviceStage.name='service-stage';world.add(serviceStage);
    const stone=new THREE.MeshPhysicalMaterial({color:0x17130f,roughness:.38,metalness:.22,clearcoat:.32,clearcoatRoughness:.26});
    const topMat=new THREE.MeshPhysicalMaterial({color:0x242019,roughness:.48,metalness:.18,clearcoat:.18,clearcoatRoughness:.36});
    const base=roundedPlatform(12.8,8.8,.34,.34,stone);base.position.y=-.18;base.castShadow=true;base.receiveShadow=true;serviceStage.add(base);
    const top=roundedPlatform(11.9,7.9,.10,.28,topMat);top.position.y=.02;top.castShadow=true;top.receiveShadow=true;serviceStage.add(top);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(11.4,.035,.045),brassMat);trim.position.set(0,.095,3.55);serviceStage.add(trim);
    const trim2=trim.clone();trim2.position.z=-3.55;serviceStage.add(trim2);
    const trim3=new THREE.Mesh(new THREE.BoxGeometry(.045,.035,6.9),brassMat);trim3.position.set(-5.45,.095,0);serviceStage.add(trim3);
    const trim4=trim3.clone();trim4.position.x=5.45;serviceStage.add(trim4);
    if(Q)Q.addContactShadow(serviceStage,renderer,7.4,.34,.11);

    factory.setShadowEnabled(renderer.shadowMap.enabled);
    const materials=factory.createMaterials(renderer);
    TYPES.forEach((type,i)=>{
      const group=new THREE.Group();group.name='connected-'+type;group.visible=false;group.position.y=.16;
      factory.factories[type](group,materials);
      group.updateMatrixWorld(true);
      group.traverse(obj=>{
        if(!obj.isMesh)return;
        if(obj.material&&obj.material.transparent)obj.castShadow=false;
        else obj.castShadow=renderer.shadowMap.enabled;
        obj.receiveShadow=renderer.shadowMap.enabled;
      });
      serviceStage.add(group);models.push(group);modelBoxes.push(new THREE.Box3().setFromObject(group).expandByScalar(.08));
    });

    finale=buildFinale();world.add(finale);finale.visible=false;

    scene.add(new THREE.HemisphereLight(0xf3e5ca,0x14100c,1.18));
    keyLight=new THREE.DirectionalLight(0xffe7b8,2.05);keyLight.position.set(7.8,10.8,8.6);keyLight.castShadow=renderer.shadowMap.enabled;
    if(renderer.shadowMap.enabled){
      const s=profile.compact?1024:2048;keyLight.shadow.mapSize.set(s,s);keyLight.shadow.camera.left=-11;keyLight.shadow.camera.right=11;keyLight.shadow.camera.top=10;keyLight.shadow.camera.bottom=-10;keyLight.shadow.camera.near=.4;keyLight.shadow.camera.far=36;keyLight.shadow.bias=-.00022;keyLight.shadow.normalBias=.025;keyLight.shadow.radius=3;
    }
    scene.add(keyLight,keyLight.target);
    fillLight=new THREE.PointLight(0x75c8b9,.64,30,2);fillLight.position.set(-7,4.8,6);scene.add(fillLight);
    rimLight=new THREE.PointLight(0xd2a957,.72,30,2);rimLight.position.set(7,5,-6);scene.add(rimLight);
    topLight=new THREE.PointLight(0xffe8bd,.36,22,2);topLight.position.set(0,8,0);scene.add(topLight);
  }

  function buildFinale(){
    const g=new THREE.Group();g.name='event-finale';
    const dark=new THREE.MeshPhysicalMaterial({color:0x15120e,roughness:.35,metalness:.25,clearcoat:.28,clearcoatRoughness:.22});
    const gold=new THREE.MeshPhysicalMaterial({color:0xc49b4e,roughness:.25,metalness:.90,clearcoat:.34,clearcoatRoughness:.16});
    const cream=new THREE.MeshStandardMaterial({color:0xf1eadc,roughness:.54,metalness:.03});
    const stage=roundedPlatform(13.4,7.8,.42,.38,dark);stage.position.y=-.10;stage.castShadow=true;stage.receiveShadow=true;g.add(stage);
    const runway=roundedPlatform(4.6,7.2,.18,.22,cream);runway.position.set(0,.14,2.8);runway.castShadow=true;runway.receiveShadow=true;g.add(runway);
    const screenTex=makeCanvasTexture();
    const screenMat=new THREE.MeshStandardMaterial({color:0x091511,map:screenTex,emissive:0x23483d,emissiveMap:screenTex,emissiveIntensity:1.15,roughness:.20,metalness:.06});
    const screen=new THREE.Mesh(new THREE.BoxGeometry(8.8,3.7,.16),screenMat);screen.position.set(0,2.35,-2.82);screen.castShadow=true;g.add(screen);finaleScreen=screen;
    const screenFrame=new THREE.Mesh(new THREE.BoxGeometry(9.25,4.1,.22),gold);screenFrame.position.set(0,2.35,-2.96);g.add(screenFrame);screenFrame.renderOrder=-1;
    screen.renderOrder=1;

    const trussY=5.35,trussZ=.25;
    const topTruss=new THREE.Mesh(new THREE.BoxGeometry(11.2,.14,.14),gold);topTruss.position.set(0,trussY,trussZ);g.add(topTruss);
    [-5.45,5.45].forEach(x=>{const tower=new THREE.Mesh(new THREE.BoxGeometry(.14,5.25,.14),gold);tower.position.set(x,2.7,trussZ);g.add(tower);});

    finaleBeams=[];finaleHeads=[];
    const beamMat=()=>new THREE.MeshBasicMaterial({color:0xf0d6a0,transparent:true,opacity:.13,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    [-4.0,-1.35,1.35,4.0].forEach((x,i)=>{
      const head=new THREE.Group();head.position.set(x,5.05,.35);
      const fixture=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.42,20),dark);fixture.rotation.z=Math.PI/2;head.add(fixture);
      const beam=new THREE.Mesh(new THREE.ConeGeometry(i%2?1.15:1.35,6.1,28,1,true),beamMat());beam.position.set(0,-3.05,0);beam.rotation.x=Math.PI;beam.userData.base=.12+(i%2)*.025;head.add(beam);
      head.rotation.x=-1.15;head.rotation.z=(i<2?-1:1)*(.12+i*.025);g.add(head);finaleHeads.push(head);finaleBeams.push(beam);
    });

    const audienceMat=new THREE.MeshStandardMaterial({color:0x211d18,roughness:.82,metalness:.05});
    for(let row=0;row<3;row++)for(let col=0;col<8;col++){
      const p=new THREE.Group();
      const torso=new THREE.Mesh(new THREE.CylinderGeometry(.10,.13,.48,12),audienceMat);torso.position.y=.34;p.add(torso);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.095,14,10),audienceMat);head.position.y=.68;p.add(head);
      p.position.set((col-3.5)*.72,.20,4.65+row*.68);p.rotation.y=(col-3.5)*-.025;g.add(p);
    }
    finaleGlow=new THREE.Mesh(new THREE.CircleGeometry(5.8,96),new THREE.MeshBasicMaterial({color:0xd8b66a,transparent:true,opacity:.08,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}));
    finaleGlow.rotation.x=-Math.PI/2;finaleGlow.position.y=.13;g.add(finaleGlow);
    if(Q)Q.addContactShadow(g,renderer,8.2,.38,.12);
    return g;
  }

  function cameraPosition(target,yaw,elev,distance,out){
    const horizontal=Math.cos(elev)*distance;
    return (out||new THREE.Vector3()).set(target.x+Math.sin(yaw)*horizontal,target.y+Math.sin(elev)*distance,target.z+Math.cos(yaw)*horizontal);
  }

  function safeFrame(){
    const rtl=document.documentElement.dir==='rtl';
    if(profile.compact&&profile.portrait)return {left:-.94,right:.94,bottom:-.10,top:.72};
    if(profile.compact&&profile.landscape)return rtl?{left:-.94,right:-.02,bottom:-.70,top:.80}:{left:.02,right:.94,bottom:-.70,top:.80};
    if(profile.compact)return {left:-.94,right:.94,bottom:-.16,top:.75};
    if(profile.tablet)return rtl?{left:-.94,right:.18,bottom:-.72,top:.85}:{left:-.18,right:.94,bottom:-.72,top:.85};
    return rtl?{left:-.94,right:.31,bottom:-.76,top:.87}:{left:-.31,right:.94,bottom:-.76,top:.87};
  }

  function boxCorners(box){
    const a=box.min,b=box.max;return [
      new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(a.x,a.y,b.z),new THREE.Vector3(a.x,b.y,a.z),new THREE.Vector3(a.x,b.y,b.z),
      new THREE.Vector3(b.x,a.y,a.z),new THREE.Vector3(b.x,a.y,b.z),new THREE.Vector3(b.x,b.y,a.z),new THREE.Vector3(b.x,b.y,b.z)
    ];
  }

  function projectedBounds(box,target,yaw,elev,distance,fov){
    fitCamera.fov=fov;fitCamera.aspect=profile.aspect;fitCamera.near=.08;fitCamera.far=180;fitCamera.updateProjectionMatrix();
    fitCamera.position.copy(cameraPosition(target,yaw,elev,distance,tmpC));fitCamera.up.set(0,1,0);fitCamera.lookAt(target);fitCamera.updateMatrixWorld(true);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
    boxCorners(box).forEach(point=>{const n=point.clone().project(fitCamera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
    return {minX,minY,maxX,maxY,behind};
  }

  function fitDistance(box,target,yaw,elev,fov,padding){
    const safe=safeFrame();
    const frame={left:safe.left+padding,right:safe.right-padding,bottom:safe.bottom+padding,top:safe.top-padding};
    const fits=d=>{const b=projectedBounds(box,target,yaw,elev,d,fov);return !b.behind&&b.minX>=frame.left&&b.maxX<=frame.right&&b.minY>=frame.bottom&&b.maxY<=frame.top;};
    let low=1.1,high=4;while(!fits(high)&&high<160)high*=1.26;
    for(let i=0;i<26;i++){const mid=(low+high)/2;if(fits(mid))high=mid;else low=mid;}
    return high*1.004;
  }

  function framedPose(box,yaw,elev,fov,padding,composition,focusTarget){
    const safe=safeFrame();
    const desiredX=(safe.left+safe.right)/2+(composition?.x||0);
    const desiredY=(safe.bottom+safe.top)/2+(composition?.y||0);
    const target=focusTarget?focusTarget.clone():box.getCenter(new THREE.Vector3());
    let distance=0;
    for(let pass=0;pass<8;pass++){
      distance=fitDistance(box,target,yaw,elev,fov,padding);
      const b=projectedBounds(box,target,yaw,elev,distance,fov);
      const currentX=(b.minX+b.maxX)/2,currentY=(b.minY+b.maxY)/2;
      const pos=cameraPosition(target,yaw,elev,distance,tmpA);
      const forward=target.clone().sub(pos).normalize();
      const right=new THREE.Vector3().crossVectors(forward,WORLD_UP).normalize();
      const up=new THREE.Vector3().crossVectors(right,forward).normalize();
      const halfV=Math.tan(THREE.MathUtils.degToRad(fov)*.5)*distance;
      const halfH=halfV*profile.aspect;
      target.addScaledVector(right,-(desiredX-currentX)*halfH);
      target.addScaledVector(up,-(desiredY-currentY)*halfV);
    }
    distance=fitDistance(box,target,yaw,elev,fov,padding);
    return {pos:cameraPosition(target,yaw,elev,distance,new THREE.Vector3()),target,distance,fov};
  }

  function viewPreset(i){
    if(profile.compact&&profile.portrait)return VIEW.phonePortrait[i];
    if(profile.compact)return VIEW.phoneLandscape[i];
    if(profile.tablet)return VIEW.tablet[i];
    return VIEW.desktop[i];
  }

  function buildPoses(){
    servicePoses=[];
    models.forEach((model,i)=>{
      model.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(model).expandByScalar(.06);
      modelBoxes[i]=box;
      const size=box.getSize(new THREE.Vector3());
      const preset=viewPreset(i);
      const focus=box.getCenter(new THREE.Vector3());focus.y+=size.y*preset.focusY;
      const pose=framedPose(box,preset.yaw,preset.elev,profile.fov,profile.compact?.002:.008,{x:0,y:preset.compY},focus);
      servicePoses.push(pose);
    });
    finale.updateMatrixWorld(true);
    const finalBox=new THREE.Box3().setFromObject(finale).expandByScalar(.16);
    const portrait=profile.compact&&profile.portrait;
    const yaw=portrait?.04:(profile.compact?.08:.11);
    const elev=portrait?.42:(profile.compact?.36:.31);
    const focus=new THREE.Vector3(0,1.55,-.10);
    finalPose=framedPose(finalBox,yaw,elev,profile.fov+(portrait?1.2:.4),profile.compact?.012:.018,{x:0,y:portrait?.015:.005},focus);
  }

  function timeline(p){
    p=clamp(p);
    for(const seg of SEGMENTS){
      if(p<=seg.end+1e-8){return Object.assign({},seg,{q:clamp((p-seg.start)/(seg.end-seg.start))});}
    }
    return Object.assign({},SEGMENTS[SEGMENTS.length-1],{q:1});
  }

  function setVisibleStage(stage,mode){
    if(activeStage===stage&&lastMode===mode)return;
    activeStage=stage;lastMode=mode;
    models.forEach((m,i)=>m.visible=i===stage&&stage<6);
    finale.visible=stage===6;
    if(renderer.shadowMap.enabled){renderer.shadowMap.needsUpdate=true;}
    renderDirty=true;
  }

  function servicePoseAt(stage,u){
    const base=servicePoses[stage];
    const orbit=(profile.compact?.006:.012)*(u-.5);
    const elevWave=Math.sin(Math.PI*u)*(profile.compact?.003:.005);
    const preset=viewPreset(stage);
    const box=modelBoxes[stage];
    const focus=base.target.clone();
    const pose=framedPose(box,preset.yaw+orbit,preset.elev+elevWave,base.fov,profile.compact?.002:.008,{x:0,y:preset.compY},focus);
    const dolly=1-Math.sin(Math.PI*u)*(profile.compact?.004:.007);
    pose.pos.sub(pose.target).multiplyScalar(dolly).add(pose.target);
    return pose;
  }

  function transitionPose(fromStage,toStage,q){
    // Editorial camera cut: the active environment stays fixed while the
    // camera retreats into a brief dark cut, then approaches the next scene.
    // This prevents transitional clipping and removes the feeling that the
    // models themselves are being dragged by the page scroll.
    const outgoing=q<.5;
    const base=outgoing?(fromStage<6?servicePoseAt(fromStage,1):finalPose):(toStage<6?servicePoseAt(toStage,0):finalPose);
    const u=outgoing?smoother(clamp(q/.5)):smoother(clamp((q-.5)/.5));
    const retreat=outgoing?u:1-u;
    const target=base.target.clone();
    const direction=base.pos.clone().sub(base.target).normalize();
    const pos=base.pos.clone().addScaledVector(direction,retreat*(profile.compact?.74:1.12));
    pos.y+=retreat*(profile.compact?.20:.32);
    return {pos,target,fov:base.fov+retreat*(profile.compact?.65:.90)};
  }

  function updateCopy(stage,finaleMode=false){
    const id=finaleMode?6:stage;
    if(copyStage===id)return;copyStage=id;
    const lang=document.documentElement.lang==='ar'?'ar':'en';
    const item=COPY[lang][id];
    if(index)index.textContent=finaleMode?'POWER / 01':String(stage+1).padStart(2,'0')+' / 06';
    if(title)title.textContent=item[0];
    if(body)body.textContent=item[1];
    rail.forEach((r,i)=>r.classList.toggle('active',finaleMode||i===stage));
  }

  function applyState(state,now){
    let pose=null,veil=0,stageForCopy=0,finaleMode=false;
    if(state.type==='service'){
      setVisibleStage(state.stage,'service');
      pose=servicePoseAt(state.stage,smoother(state.q));
      stageForCopy=state.stage;updateCopy(stageForCopy,false);
      serviceStage.visible=true;
    }else if(state.type==='transition'){
      const switchPoint=.5;
      const visibleStage=state.q<switchPoint?state.stage:state.next;
      setVisibleStage(visibleStage,'transition');
      pose=transitionPose(state.stage,state.next,state.q);
      stageForCopy=visibleStage;updateCopy(stageForCopy,false);
      veil=Math.pow(Math.sin(Math.PI*clamp((state.q-.35)/.30)),8)*.82;
      serviceStage.visible=true;
    }else if(state.type==='finalTransition'){
      const switchPoint=.56;
      if(state.q<switchPoint){setVisibleStage(5,'finalTransition');serviceStage.visible=true;finale.visible=false;}
      else{setVisibleStage(6,'finalTransition');serviceStage.visible=false;finale.visible=true;}
      pose=transitionPose(5,6,state.q);
      updateCopy(state.q<switchPoint?5:6,state.q>=switchPoint);
      veil=Math.pow(Math.sin(Math.PI*clamp((state.q-.38)/.28)),8)*.88;
    }else{
      setVisibleStage(6,'finale');serviceStage.visible=false;finale.visible=true;pose=finalPose;finaleMode=true;updateCopy(6,true);
    }
    sticky.style.setProperty('--connected-transition',veil.toFixed(4));
    if(copyBox)copyBox.classList.toggle('in-transit',state.type==='transition'||state.type==='finalTransition');
    if(indicator)indicator.style.opacity=progress>.94?'0':'1';
    return pose;
  }

  function updateLights(state){
    const finaleMode=state.type==='finale'||(state.type==='finalTransition'&&state.q>.55);
    const dim=(state.type==='transition'||state.type==='finalTransition')?1-Math.pow(Math.sin(Math.PI*state.q),6)*.46:1;
    keyLight.intensity=(finaleMode?1.55:2.05)*dim;
    fillLight.intensity=(finaleMode?.46:.64)*dim;
    rimLight.intensity=(finaleMode?.95:.72)*dim;
    topLight.intensity=(finaleMode?.58:.36)*dim;
    keyLight.target.position.set(0,finaleMode?1.6:1.5,finaleMode?-.4:0);keyLight.target.updateMatrixWorld();
  }

  function animateFinale(now){
    const t=now*.001;
    finaleHeads.forEach((head,i)=>{head.rotation.z=(i<2?-1:1)*(.14+Math.sin(t*.48+i*.8)*.035);head.rotation.x=-1.15+Math.sin(t*.56+i*.65)*.035;});
    finaleBeams.forEach((beam,i)=>{beam.material.opacity=(beam.userData.base||.12)*(.76+.24*Math.sin(t*1.1+i));});
    if(finaleScreen)finaleScreen.material.emissiveIntensity=1.12+Math.sin(t*.82)*.035;
    if(finaleGlow)finaleGlow.material.opacity=.07+.025*Math.sin(t*1.2);
  }

  function measureTrack(){
    const rect=track.getBoundingClientRect();
    trackStart=rect.top+(window.scrollY||window.pageYOffset||0);
    trackSpan=Math.max(1,track.offsetHeight-sticky.clientHeight);
  }

  function readProgress(){
    const y=window.scrollY||window.pageYOffset||0;
    if(y!==lastY){lastY=y;lastScrollAt=performance.now();idleFrames=0;renderDirty=true;}
    targetProgress=clamp((y-trackStart)/trackSpan);
    progress=targetProgress;
    document.body.classList.toggle('connected-scene-active',y>=trackStart-sticky.clientHeight*.08&&y<=trackStart+trackSpan+sticky.clientHeight*.08);
  }

  function render(now){
    raf=0;
    if(!initialized||!visible||!pageVisible)return;
    readProgress();
    const state=timeline(progress);
    const pose=applyState(state,now);
    updateLights(state);
    if(pose){
      camera.position.copy(pose.pos);camera.up.set(0,1,0);camera.lookAt(pose.target);
      if(Math.abs(camera.fov-pose.fov)>.001){camera.fov=pose.fov;camera.updateProjectionMatrix();}
    }
    const scrollActive=(now-lastScrollAt)<130;
    if(state.type==='finale'&&scrollActive)animateFinale(now);
    sticky.style.setProperty('--connected-progress-pct',(progress*100).toFixed(2)+'%');
    renderer.render(scene,camera);
    renderDirty=false;
    if(!sticky.classList.contains('model-active')){sticky.classList.add('model-active');if(fallback)fallback.style.opacity='0';}
    if(scrollActive||state.type==='finale'||idleFrames<2){
      idleFrames++;
      raf=requestAnimationFrame(render);
    }
  }

  function startLoop(){idleFrames=0;if(!raf&&initialized&&visible&&pageVisible)raf=requestAnimationFrame(render);}
  function stopLoop(){if(raf){cancelAnimationFrame(raf);raf=0;}}

  function resize(){
    resizeQueued=false;if(!initialized)return;
    profile=getProfile();applyRendererProfile();camera.aspect=profile.aspect;camera.fov=profile.fov;camera.updateProjectionMatrix();
    measureTrack();buildPoses();readProgress();renderDirty=true;startLoop();
  }
  function scheduleResize(){if(resizeQueued)return;resizeQueued=true;requestAnimationFrame(resize);}

  function init(){
    if(initialized)return;
    profile=getProfile();renderer=createRenderer();if(!renderer)return;
    applyRendererProfile();
    camera=new THREE.PerspectiveCamera(profile.fov,profile.aspect,.08,180);scene=null;models=[];modelBoxes=[];
    buildWorld();scene.add(camera);buildPoses();measureTrack();readProgress();
    initialized=true;canvas.style.display='block';
    bind();startLoop();
  }

  function bind(){
    if(observer)return;
    window.addEventListener('scroll',()=>{readProgress();startLoop();},{passive:true});
    window.addEventListener('wheel',startLoop,{passive:true});
    window.addEventListener('touchmove',startLoop,{passive:true});
    window.addEventListener('resize',scheduleResize,{passive:true});
    window.visualViewport&&window.visualViewport.addEventListener('resize',scheduleResize,{passive:true});
    document.addEventListener('visibilitychange',()=>{pageVisible=!document.hidden;if(pageVisible&&visible)startLoop();else stopLoop();});
    observer=new IntersectionObserver(entries=>{
      const e=entries[entries.length-1];visible=Boolean(e&&e.isIntersecting);
      document.dispatchEvent(new CustomEvent('bymeli:connected-scene-state',{detail:{active:visible,phase:visible?'active':'idle'}}));
      if(visible)startLoop();else stopLoop();
    },{threshold:.01,rootMargin:'180px 0px'});observer.observe(track);
    if('ResizeObserver'in window){resizeObserver=new ResizeObserver(scheduleResize);resizeObserver.observe(sticky);}
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopLoop();},{once:true});
    canvas.addEventListener('webglcontextrestored',()=>location.reload(),{once:true});
  }

  function forceInit(){
    if(initialized)return;
    if(initQueued)return;initQueued=true;
    requestAnimationFrame(()=>{initQueued=false;init();});
  }

  function auditAt(value){
    if(!initialized)return {initialized:false};
    const state=timeline(value);progress=targetProgress=clamp(value);const pose=applyState(state,performance.now());
    if(pose){camera.position.copy(pose.pos);camera.lookAt(pose.target);camera.fov=pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
    const safe=safeFrame();
    let box=null;
    if(state.type==='finale'||(state.type==='finalTransition'&&state.q>.55))box=new THREE.Box3().setFromObject(finale);
    else{const s=state.type==='transition'?(state.q<.5?state.stage:state.next):state.stage;box=modelBoxes[s];}
    const corners=boxCorners(box);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,behind=false;
    corners.forEach(point=>{const n=point.clone().project(camera);if(!Number.isFinite(n.x)||n.z>1||n.z<-1)behind=true;minX=Math.min(minX,n.x);maxX=Math.max(maxX,n.x);minY=Math.min(minY,n.y);maxY=Math.max(maxY,n.y);});
    return {initialized:true,progress:value,state,profile:{w:profile.w,h:profile.h,pixelRatio:stablePixelRatio(profile),tier:profile.tier},bounds:{minX,maxX,minY,maxY},safe,behind,inside:!behind&&minX>=safe.left-.03&&maxX<=safe.right+.03&&minY>=safe.bottom-.03&&maxY<=safe.top+.03};
  }

  function renderAt(value){
    const r=auditAt(value);if(initialized)renderer.render(scene,camera);return r;
  }

  window.ByMeliConnectedV51={forceInit,renderAt,auditAt,getState:()=>({initialized,progress,target:targetProgress,profile:profile?{w:profile.w,h:profile.h,pixelRatio:stablePixelRatio(profile),tier:profile.tier}:null})};
  for(const v of [49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25,24,20])window['ByMeliConnectedV'+v]=window.ByMeliConnectedV50;

  const io=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){io.disconnect();forceInit();}
  },{rootMargin:'900px 0px',threshold:0});io.observe(track);
  setTimeout(forceInit,1800);
})();
