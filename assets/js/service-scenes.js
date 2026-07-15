(function(){
  'use strict';

  const canvases = Array.from(document.querySelectorAll('.service-canvas[data-scene]'));
  if(!canvases.length) return;

  function fallback(canvas){
    const frame = canvas.closest('.canvas-frame');
    if(!frame) return;
    canvas.style.display = 'none';
    frame.classList.add('webgl-fallback','ready');
    frame.style.backgroundImage = `url('${frame.dataset.fallback || ''}')`;
  }

  if(!window.THREE){
    canvases.forEach(fallback);
    return;
  }

  const mobile = matchMedia('(max-width: 760px)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function shadow(mesh, enabled=true){
    mesh.castShadow = enabled && !mobile;
    mesh.receiveShadow = enabled;
    return mesh;
  }

  function addChair(group, materials, x, z, rotation=0){
    const { cream, gold } = materials;
    const chair = new THREE.Group();
    const seat = shadow(new THREE.Mesh(new THREE.BoxGeometry(.62,.1,.62), cream));
    seat.position.y = .52;
    const back = shadow(new THREE.Mesh(new THREE.BoxGeometry(.62,.62,.1), cream));
    back.position.set(0,.86,-.26);
    const legGeo = new THREE.CylinderGeometry(.032,.032,.5,8);
    [[-.23,-.23],[.23,-.23],[-.23,.23],[.23,.23]].forEach(([lx,lz])=>{
      const leg = shadow(new THREE.Mesh(legGeo,gold));
      leg.position.set(lx,.25,lz);
      chair.add(leg);
    });
    chair.add(seat,back);
    chair.position.set(x,0,z);
    chair.rotation.y = rotation;
    group.add(chair);
    return chair;
  }

  function addPlant(group, materials, x, z, scale=1){
    const pot = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.18,.27,.42,16), materials.dark));
    pot.position.set(x,.21,z);
    group.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({color:0x496653,roughness:.82});
    for(let i=0;i<7;i++){
      const leaf = shadow(new THREE.Mesh(new THREE.SphereGeometry(.16,12,10),leafMat));
      leaf.scale.set(.7*scale,1.5*scale,.48*scale);
      leaf.position.set(x+(i-3)*.048*scale,.52+i*.075*scale,z+(i%2?.06:-.06));
      leaf.rotation.z=(i-3)*.08;
      group.add(leaf);
    }
  }

  function addPerson(group, materials, x, z, color){
    const mat = color || materials.dark;
    const torso = shadow(new THREE.Mesh(new THREE.CylinderGeometry(.14,.17,.62,10),mat));
    torso.position.set(x,.62,z);
    const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(.125,14,12),materials.cream));
    head.position.set(x,1.05,z);
    const legMat = materials.dark;
    [-.07,.07].forEach(dx=>{
      const leg=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.48,8),legMat));
      leg.position.set(x+dx,.24,z);
      group.add(leg);
    });
    group.add(torso,head);
    return {torso,head,baseY:.62};
  }

  function addMonitor(group, materials, x, y, z, w, h, rotation=0){
    const frame=shadow(new THREE.Mesh(new THREE.BoxGeometry(w,h,.12),materials.dark));
    frame.position.set(x,y,z);frame.rotation.y=rotation;group.add(frame);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(w*.88,h*.79),materials.screen);
    screen.position.set(x,y,z+.066);screen.rotation.y=rotation;group.add(screen);
    return screen;
  }

  function addTruss(group, materials, width, depth, height){
    const positions=[[-width/2,-depth/2],[width/2,-depth/2],[-width/2,depth/2],[width/2,depth/2]];
    positions.forEach(([x,z])=>{
      const c=shadow(new THREE.Mesh(new THREE.BoxGeometry(.16,height,.16),materials.gold));
      c.position.set(x,height/2,z);group.add(c);
    });
    [[0,-depth/2,width,.16,.16],[0,depth/2,width,.16,.16]].forEach(([x,z,w,h,d])=>{
      const b=shadow(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),materials.gold));b.position.set(x,height,z);group.add(b);
    });
    [[-width/2,0,.16,.16,depth],[width/2,0,.16,.16,depth]].forEach(([x,z,w,h,d])=>{
      const b=shadow(new THREE.Mesh(new THREE.BoxGeometry(w,h,d),materials.gold));b.position.set(x,height,z);group.add(b);
    });
  }

  function addSpotFixture(group,m,x,y,z,targetX=0,targetZ=0,color=0xffdda4){
    const fixture=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,.32,12),m.dark));
    fixture.position.set(x,y,z);fixture.rotation.x=Math.PI/2;group.add(fixture);
    const spot=new THREE.SpotLight(color,1.45,12,.36,.7,1.35);spot.position.set(x,y-.08,z);spot.target.position.set(targetX,.2,targetZ);group.add(spot,spot.target);
    return spot;
  }

  function addLaptop(group,m,x,y,z,rotation=0){
    const base=shadow(new THREE.Mesh(new THREE.BoxGeometry(.52,.045,.36),m.dark));base.position.set(x,y,z);base.rotation.y=rotation;group.add(base);
    const lid=shadow(new THREE.Mesh(new THREE.BoxGeometry(.52,.34,.04),m.dark));lid.position.set(x,y+.19,z-.16);lid.rotation.x=-.18;lid.rotation.y=rotation;group.add(lid);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(.44,.25),m.screen);screen.position.set(x,y+.19,z-.183);screen.rotation.x=-.18;screen.rotation.y=rotation;group.add(screen);return screen;
  }

  function addStanchion(group,m,x,z){
    const post=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.82,10),m.goldDark));post.position.set(x,.42,z);group.add(post);
    const base=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.045,14),m.dark));base.position.set(x,.03,z);group.add(base);return post;
  }

  function addCameraRig(group,m,x,z,rotation=0){
    const tripod=new THREE.Group();
    const head=shadow(new THREE.Mesh(new THREE.BoxGeometry(.42,.28,.5),m.dark));head.position.y=1.55;tripod.add(head);
    const lens=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.1,.14,.38,14),m.dark));lens.rotation.x=Math.PI/2;lens.position.set(0,1.56,-.36);tripod.add(lens);
    [-.28,0,.28].forEach((dx,i)=>{const leg=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,1.35,8),m.goldDark));leg.position.set(dx*.65,.7,(i-1)*.12);leg.rotation.z=dx*.8;tripod.add(leg);});
    tripod.position.set(x,0,z);tripod.rotation.y=rotation;group.add(tripod);return tripod;
  }

  function addCeilingRing(group,m,x,y,z,r){
    const ring=shadow(new THREE.Mesh(new THREE.TorusGeometry(r,.045,10,48),m.gold));ring.rotation.x=Math.PI/2;ring.position.set(x,y,z);group.add(ring);return ring;
  }

  function createMaterials(){
    return {
      gold:new THREE.MeshStandardMaterial({color:0xcda452,metalness:.55,roughness:.32,emissive:0x3e2a0a,emissiveIntensity:.16}),
      goldDark:new THREE.MeshStandardMaterial({color:0x80612b,metalness:.4,roughness:.48}),
      dark:new THREE.MeshStandardMaterial({color:0x211b15,metalness:.18,roughness:.62}),
      cream:new THREE.MeshStandardMaterial({color:0xeadfc7,metalness:.04,roughness:.74}),
      white:new THREE.MeshStandardMaterial({color:0xf7f2e8,metalness:.02,roughness:.78}),
      teal:new THREE.MeshStandardMaterial({color:0x5d9589,metalness:.15,roughness:.48,emissive:0x153d38,emissiveIntensity:.12}),
      glass:new THREE.MeshPhysicalMaterial({color:0xc5ddd7,transparent:true,opacity:.26,roughness:.08,metalness:.02,transmission:.56,thickness:.25}),
      screen:new THREE.MeshStandardMaterial({color:0x101715,emissive:0x79cbbd,emissiveIntensity:1.05,roughness:.45}),
      red:new THREE.MeshStandardMaterial({color:0x8c3c31,roughness:.55})
    };
  }

  function baseScene(scene){
    const materials=createMaterials();
    scene.background=new THREE.Color(0x12100d);
    scene.fog=new THREE.FogExp2(0x12100d,.035);
    scene.add(new THREE.HemisphereLight(0xf1dfbd,0x15110d,1.1));
    const key=new THREE.DirectionalLight(0xffedc7,1.25);key.position.set(7,11,8);
    if(!mobile){key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-12;key.shadow.camera.right=12;key.shadow.camera.top=12;key.shadow.camera.bottom=-12;}
    scene.add(key);
    const rim=new THREE.PointLight(0x67b9ac,.55,28);rim.position.set(-7,4,6);scene.add(rim);
    const floor=shadow(new THREE.Mesh(new THREE.CylinderGeometry(6.3,6.6,.28,56),new THREE.MeshStandardMaterial({color:0x17130f,roughness:.9,metalness:.05})),false);
    floor.position.y=.14;scene.add(floor);
    const ring=new THREE.Mesh(new THREE.RingGeometry(4.8,5.65,52),new THREE.MeshBasicMaterial({color:0xcda452,side:THREE.DoubleSide,transparent:true,opacity:.28}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.29;scene.add(ring);
    const grid=new THREE.GridHelper(14,18,0x6f5326,0x282119);grid.material.transparent=true;grid.material.opacity=.15;grid.position.y=.295;scene.add(grid);
    return materials;
  }

  function createBooth(group,m){
    addTruss(group,m,6.6,4.6,4.7);
    const back=shadow(new THREE.Mesh(new THREE.BoxGeometry(6.25,4.15,.14),m.cream));back.position.set(0,2.25,-2.18);group.add(back);
    const side1=shadow(new THREE.Mesh(new THREE.BoxGeometry(.14,3.7,2.5),m.white));side1.position.set(-3.18,1.95,-.85);group.add(side1);
    const side2=shadow(new THREE.Mesh(new THREE.BoxGeometry(.14,3.7,2.5),m.white));side2.position.set(3.18,1.95,-.85);group.add(side2);
    addMonitor(group,m,0,2.62,-2.09,3.05,1.72);
    const fascia=shadow(new THREE.Mesh(new THREE.BoxGeometry(4.4,.72,.16),m.gold));fascia.position.set(0,4.18,2.18);group.add(fascia);
    const counter=shadow(new THREE.Mesh(new THREE.BoxGeometry(2.5,.95,.9),m.dark));counter.position.set(0,.48,1.05);group.add(counter);
    const counterTrim=shadow(new THREE.Mesh(new THREE.BoxGeometry(2.58,.08,.96),m.gold));counterTrim.position.set(0,.92,1.05);group.add(counterTrim);
    addChair(group,m,-1.65,1.8,-.18);addChair(group,m,1.65,1.8,.18);
    addPlant(group,m,-2.6,1.72,1.05);addPlant(group,m,2.6,1.72,1.05);
    const table=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.54,.54,.1,28),m.glass));table.position.set(0,.58,2.02);group.add(table);
    const tableStem=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.08,.13,.85,16),m.gold));tableStem.position.set(0,.42,2.02);group.add(tableStem);
    // Detailed display niches, service door, lighting track and visitor scale.
    [-2.35,-1.55,1.55,2.35].forEach((x,i)=>{const niche=shadow(new THREE.Mesh(new THREE.BoxGeometry(.58,.72,.16),i%2?m.teal:m.goldDark));niche.position.set(x,2.05,-2.02);group.add(niche);const product=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,.42,14),m.cream));product.position.set(x,2.08,-1.88);group.add(product);});
    const storage=shadow(new THREE.Mesh(new THREE.BoxGeometry(1.05,2.15,.12),m.dark));storage.position.set(2.45,1.2,-2.05);group.add(storage);
    const handle=shadow(new THREE.Mesh(new THREE.BoxGeometry(.035,.24,.035),m.gold));handle.position.set(2.1,1.2,-1.96);group.add(handle);
    const spots=[-2.2,-.75,.75,2.2].map(x=>addSpotFixture(group,m,x,4.45,1.25,x*.4,0));
    const people=[addPerson(group,m,-.85,2.75,m.dark),addPerson(group,m,.85,2.85,m.teal)];
    const brochureRack=shadow(new THREE.Mesh(new THREE.BoxGeometry(.6,.9,.28),m.cream));brochureRack.position.set(-2.15,.48,2.35);group.add(brochureRack);const brandTotem=shadow(new THREE.Mesh(new THREE.BoxGeometry(.42,2.5,.22),m.teal));brandTotem.position.set(2.55,1.25,2.18);group.add(brandTotem);group.userData.people=people;group.userData.spots=spots;group.userData.screen=group.children.find(o=>o.material===m.screen);
  }

  function createShowroom(group,m){
    const spine=shadow(new THREE.Mesh(new THREE.BoxGeometry(.18,4.7,5.6),m.dark));spine.position.set(-2.75,2.35,0);group.add(spine);
    for(let i=0;i<4;i++){
      const shelf=shadow(new THREE.Mesh(new THREE.BoxGeometry(.78,.1,4.8),m.gold));shelf.position.set(-2.35,.95+i*.92,0);group.add(shelf);
      for(let j=0;j<5;j++){
        const product=shadow(new THREE.Mesh(new THREE.BoxGeometry(.32,.45,.3),j%2?m.teal:m.cream));product.position.set(-2.2,1.2+i*.92,-1.8+j*.9);group.add(product);
      }
    }
    const platform=shadow(new THREE.Mesh(new THREE.BoxGeometry(5.5,.2,3.7),m.white));platform.position.set(.1,.12,.25);group.add(platform);
    [-1.55,0,1.55].forEach((x,i)=>{const p=shadow(new THREE.Mesh(new THREE.BoxGeometry(1.05,.8+i*.18,1.05),i===1?m.gold:m.cream));p.position.set(x,.42+i*.09,.55-i*.18);group.add(p);});
    const glass=shadow(new THREE.Mesh(new THREE.BoxGeometry(.08,3.8,4.6),m.glass),false);glass.position.set(2.85,1.95,0);group.add(glass);
    const arch=shadow(new THREE.Mesh(new THREE.TorusGeometry(2.35,.09,12,64,Math.PI),m.gold));arch.rotation.z=Math.PI/2;arch.position.set(.1,3.25,1.95);group.add(arch);
    const bench=shadow(new THREE.Mesh(new THREE.BoxGeometry(2.4,.5,.7),m.dark));bench.position.set(.55,.27,-1.1);group.add(bench);
    // Product spotlighting, consultation counter, detailed merchandise and visitors.
    for(let i=-2;i<=2;i++){const vial=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,.48,14),i%2?m.gold:m.teal));vial.position.set(i*.58,.78,.48+Math.abs(i)*.12);group.add(vial);}
    const consult=shadow(new THREE.Mesh(new THREE.BoxGeometry(1.65,.86,.7),m.dark));consult.position.set(1.7,.45,-1.45);group.add(consult);addLaptop(group,m,1.7,.92,-1.45,Math.PI);
    const spots=[-2,-.7,.7,2].map(x=>addSpotFixture(group,m,x,4.05,1.5,x*.35,.1,0xffdda4));
    const signage=shadow(new THREE.Mesh(new THREE.BoxGeometry(1.1,.26,.1),m.gold));signage.position.set(1.7,2.95,-1.65);group.add(signage);const mirror=shadow(new THREE.Mesh(new THREE.BoxGeometry(1.15,1.7,.05),m.glass),false);mirror.position.set(2.35,1.6,.95);group.add(mirror);const people=[addPerson(group,m,-.75,2.35,m.dark),addPerson(group,m,1.25,2.15,m.goldDark)];group.userData.people=people;group.userData.spots=spots;
  }

  function createInterior(group,m){
    const rug=shadow(new THREE.Mesh(new THREE.BoxGeometry(5.6,.07,4.25),new THREE.MeshStandardMaterial({color:0x66503a,roughness:.96})));rug.position.y=.34;group.add(rug);
    const sofa=shadow(new THREE.Mesh(new THREE.BoxGeometry(3.9,.9,1.2),m.cream));sofa.position.set(0,.78,-1.05);group.add(sofa);
    const sofaBack=shadow(new THREE.Mesh(new THREE.BoxGeometry(3.9,1.15,.3),m.cream));sofaBack.position.set(0,1.45,-1.48);group.add(sofaBack);
    [-1.2,0,1.2].forEach(x=>{const cushion=shadow(new THREE.Mesh(new THREE.BoxGeometry(.78,.45,.18),x===0?m.gold:m.teal));cushion.position.set(x,1.15,-1.55);cushion.rotation.x=-.15;group.add(cushion);});
    const table=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.92,.92,.11,34),m.glass));table.position.set(0,.85,.75);group.add(table);
    const stem=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.1,.16,1,18),m.gold));stem.position.set(0,.5,.75);group.add(stem);
    addChair(group,m,-2.05,.65,-.38);addChair(group,m,2.05,.65,.38);
    addPlant(group,m,-2.65,-.45,1.15);addPlant(group,m,2.65,-.1,1.05);
    [-2.3,2.3].forEach(x=>{const lampStand=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,2.1,10),m.gold));lampStand.position.set(x,1.1,1.6);group.add(lampStand);const shade=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.28,.46,.5,18),m.cream));shade.position.set(x,2.12,1.6);group.add(shade);const light=new THREE.PointLight(0xffdca3,1.5,5);light.position.set(x,2.05,1.5);group.add(light);});
    // Sculptural ceiling lights, side tables, artwork and guest figures.
    addCeilingRing(group,m,0,3.75,.4,1.25);addCeilingRing(group,m,0,3.55,.4,.78);
    [-1.75,1.75].forEach(x=>{const side=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.3,.36,.42,18),m.goldDark));side.position.set(x,.23,-.05);group.add(side);});
    [-1.4,0,1.4].forEach((x,i)=>{const art=shadow(new THREE.Mesh(new THREE.BoxGeometry(.9,1.25,.08),i===1?m.gold:m.teal));art.position.set(x,2.35,-1.63);group.add(art);});
    const refreshments=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.32,16),m.goldDark));refreshments.position.set(.95,.98,.72);group.add(refreshments);const candle=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,.22,10),m.cream));candle.position.set(-.95,.98,.72);group.add(candle);const people=[addPerson(group,m,-2.5,2.4,m.dark),addPerson(group,m,2.35,2.25,m.teal)];group.userData.people=people;
  }

  function createManagement(group,m){
    const table=shadow(new THREE.Mesh(new THREE.BoxGeometry(5.7,.24,2.55),m.dark));table.position.set(0,.92,.25);group.add(table);
    const legs=[[-2.4,-.7],[2.4,-.7],[-2.4,1.15],[2.4,1.15]];legs.forEach(([x,z])=>{const leg=shadow(new THREE.Mesh(new THREE.BoxGeometry(.12,1,.12),m.gold));leg.position.set(x,.5,z);group.add(leg);});
    const board=shadow(new THREE.Mesh(new THREE.BoxGeometry(5.4,3.05,.14),m.cream));board.position.set(0,2.55,-2.1);group.add(board);
    for(let i=0;i<5;i++) for(let j=0;j<3;j++){const card=shadow(new THREE.Mesh(new THREE.BoxGeometry(.72,.4,.065),(i+j)%3===0?m.teal:(i+j)%2?m.gold:m.red));card.position.set(-1.9+i*.95,3.2-j*.65,-2.01);group.add(card);}
    [-1.9,0,1.9].forEach(x=>addMonitor(group,m,x,1.82,-.15,1.5,.92));
    addChair(group,m,-1.8,1.65,.12);addChair(group,m,0,1.65,0);addChair(group,m,1.8,1.65,-.12);
    [-2.7,2.7].forEach((x,i)=>{const crate=shadow(new THREE.Mesh(new THREE.BoxGeometry(.85,.75,.85),i?m.goldDark:m.dark));crate.position.set(x,.38,1.9);group.add(crate);});
    // Laptops, printed plans, radios and project team members.
    [-1.8,0,1.8].forEach(x=>addLaptop(group,m,x,1.08,.25,0));
    for(let i=0;i<5;i++){const plan=shadow(new THREE.Mesh(new THREE.BoxGeometry(.62,.018,.42),i%2?m.white:m.cream));plan.position.set(-1.7+i*.82,1.06,.75);plan.rotation.y=(i-2)*.05;group.add(plan);}
    [-2.45,2.45].forEach(x=>{const radio=shadow(new THREE.Mesh(new THREE.BoxGeometry(.16,.38,.12),m.dark));radio.position.set(x,1.2,.6);group.add(radio);const antenna=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.3,6),m.goldDark));antenna.position.set(x,1.53,.6);group.add(antenna);});
    const gantt=shadow(new THREE.Mesh(new THREE.BoxGeometry(1.35,.55,.05),m.red));gantt.position.set(2.08,2.55,-2.01);group.add(gantt);const fileStack=shadow(new THREE.Mesh(new THREE.BoxGeometry(.42,.18,.3),m.cream));fileStack.position.set(-2.1,1.07,.1);group.add(fileStack);const people=[addPerson(group,m,-1.25,1.65,m.dark),addPerson(group,m,.1,1.85,m.teal),addPerson(group,m,1.35,1.55,m.goldDark)];group.userData.people=people;
  }

  function createCrowd(group,m){
    const archTop=shadow(new THREE.Mesh(new THREE.BoxGeometry(5.4,.24,.24),m.gold));archTop.position.set(0,3.75,-1.85);group.add(archTop);
    [-2.7,2.7].forEach(x=>{const col=shadow(new THREE.Mesh(new THREE.BoxGeometry(.22,3.75,.22),m.gold));col.position.set(x,1.88,-1.85);group.add(col);});
    [-1.8,-.6,.6,1.8].forEach(x=>{const rail=shadow(new THREE.Mesh(new THREE.BoxGeometry(.07,.8,4.3),m.dark));rail.position.set(x,.42,.8);group.add(rail);for(let z=-1;z<2.8;z+=1.2){const post=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.86,10),m.goldDark));post.position.set(x,.43,z);group.add(post);}});
    const people=[];
    for(let i=0;i<24;i++){
      const x=(i%6-2.5)*.72,z=Math.floor(i/6)*.88-.35;
      people.push(addPerson(group,m,x,z,i%5===0?m.gold:(i%4===0?m.teal:m.dark)));
    }
    const counter=shadow(new THREE.Mesh(new THREE.BoxGeometry(2.2,.92,.72),m.cream));counter.position.set(0,.47,-2.15);group.add(counter);
    // Registration tablets, access turnstiles, signage and more operational detail.
    [-.62,.62].forEach(x=>{const tablet=addMonitor(group,m,x,1.18,-2.05,.48,.32);tablet.material.emissiveIntensity=1.15;});
    [-1.55,0,1.55].forEach(x=>{const turn=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.12,.15,.92,14),m.goldDark));turn.position.set(x,.47,-1.25);group.add(turn);for(let a=0;a<3;a++){const arm=shadow(new THREE.Mesh(new THREE.BoxGeometry(.75,.035,.035),m.dark));arm.position.set(x,.72,-1.25);arm.rotation.y=a*Math.PI/3;group.add(arm);}});
    [-2.35,-1.2,1.2,2.35].forEach(x=>addStanchion(group,m,x,2.75));
    addMonitor(group,m,0,3.15,-1.72,2.4,.72);

    // Animated floor-flow system: three illuminated routes guide guests
    // from the queue lanes through registration and beyond the entry arch.
    const flowMarkers=[];
    const flowColors=[0xd8ad58,0x69c1b4,0xd8ad58];
    [-1.45,0,1.45].forEach((lane,laneIndex)=>{
      const points=[
        new THREE.Vector3(lane,.325,3.4),
        new THREE.Vector3(lane*.92,.325,2.0),
        new THREE.Vector3(lane*.72,.325,.6),
        new THREE.Vector3(lane*.45,.325,-.7),
        new THREE.Vector3(lane*.18,.325,-1.45),
        new THREE.Vector3(0,.325,-2.78)
      ];
      const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.35);
      const routeMat=new THREE.MeshBasicMaterial({color:flowColors[laneIndex],transparent:true,opacity:.44});
      const route=new THREE.Mesh(new THREE.TubeGeometry(curve,52,.035,8,false),routeMat);
      group.add(route);
      for(let i=0;i<4;i++){
        const marker=new THREE.Mesh(
          new THREE.SphereGeometry(.07,12,10),
          new THREE.MeshBasicMaterial({color:flowColors[laneIndex],transparent:true,opacity:.96})
        );
        marker.userData={curve,offset:(i/4)+(laneIndex*.075)};
        group.add(marker);flowMarkers.push(marker);
      }
      // Direction arrows make the route readable even when animation is paused.
      [.18,.43,.68,.88].forEach((at,arrowIndex)=>{
        const pos=curve.getPointAt(at),tangent=curve.getTangentAt(at);
        const arrow=new THREE.Mesh(
          new THREE.ConeGeometry(.12,.28,3),
          new THREE.MeshBasicMaterial({color:flowColors[laneIndex],transparent:true,opacity:.72})
        );
        arrow.position.copy(pos);arrow.position.y=.35;
        arrow.rotation.x=Math.PI/2;
        arrow.rotation.z=-Math.atan2(tangent.z,tangent.x)-Math.PI/2;
        group.add(arrow);
      });
    });
    const exitSign=shadow(new THREE.Mesh(new THREE.BoxGeometry(.92,.28,.08),m.teal));exitSign.position.set(0,4.05,-1.7);group.add(exitSign);const staffDesk=shadow(new THREE.Mesh(new THREE.BoxGeometry(.86,.76,.5),m.dark));staffDesk.position.set(2.18,.39,-2.15);group.add(staffDesk);group.userData.people=people;
    group.userData.flowMarkers=flowMarkers;
  }

  function createAV(group,m){
    const stage=shadow(new THREE.Mesh(new THREE.BoxGeometry(6,.46,3.6),m.dark));stage.position.set(0,.24,-.35);group.add(stage);
    const led=shadow(new THREE.Mesh(new THREE.BoxGeometry(5.2,2.85,.14),m.screen));led.position.set(0,2.18,-1.95);group.add(led);
    addTruss(group,m,6.5,3.8,4.5);
    const beams=[];
    for(let i=-2;i<=2;i++){
      const spot=new THREE.SpotLight(i%2?0xcda452:0x69c1b4,2.3,20,.34,.65,1.4);spot.position.set(i*1.25,4.15,1.25);spot.target.position.set(i*.35,.2,-.35);group.add(spot,spot.target);beams.push(spot);
      const fixture=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.13,.18,.34,12),m.dark));fixture.position.set(i*1.25,4.25,1.25);fixture.rotation.x=Math.PI/2;group.add(fixture);
    }
    [-2.8,2.8].forEach(x=>{const speaker=shadow(new THREE.Mesh(new THREE.BoxGeometry(.72,1.55,.65),m.dark));speaker.position.set(x,1.3,-1.45);group.add(speaker);});
    const console=shadow(new THREE.Mesh(new THREE.BoxGeometry(3,.9,1.15),m.dark));console.position.set(0,.48,2.05);group.add(console);
    for(let i=-3;i<=3;i++){const fader=shadow(new THREE.Mesh(new THREE.BoxGeometry(.08,.06,.45),i%2?m.gold:m.teal));fader.position.set(i*.32,.97,2.05);group.add(fader);}
    // Stage stairs, podium, broadcast camera, cable runs and audience seating.
    for(let i=0;i<3;i++){const step=shadow(new THREE.Mesh(new THREE.BoxGeometry(1.6,.16+i*.15,.55),m.goldDark));step.position.set(0,.08+i*.075,1.25-i*.45);group.add(step);}
    const podium=shadow(new THREE.Mesh(new THREE.BoxGeometry(.72,1.18,.58),m.cream));podium.position.set(-1.65,.6,-.25);podium.rotation.z=-.04;group.add(podium);const mic=shadow(new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.48,8),m.dark));mic.position.set(-1.65,1.4,-.25);mic.rotation.z=-.3;group.add(mic);
    addCameraRig(group,m,2.4,2.45,-2.55);
    for(let i=-2;i<=2;i++)for(let j=0;j<2;j++)addChair(group,m,i*1.05,3.0+j*.9,Math.PI,m.dark);
    [-2.35,-1.15,0,1.15,2.35].forEach(x=>{const cable=shadow(new THREE.Mesh(new THREE.BoxGeometry(.06,.025,2.4),m.goldDark),false);cable.position.set(x,.32,1.45);group.add(cable);});
    const confidenceMonitor=addMonitor(group,m,-2.35,1.95,2.05,.84,.48,Math.PI/18);confidenceMonitor.material.emissiveIntensity=1.18;const sideScreen=addMonitor(group,m,2.15,2.18,-1.4,1.2,.8,-Math.PI/10);sideScreen.material.emissiveIntensity=1.12;const people=[addPerson(group,m,-.8,3.45,m.dark),addPerson(group,m,.8,3.55,m.teal)];group.userData.people=people;group.userData.beams=beams;group.userData.led=led;
  }

  const factories={booth:createBooth,showroom:createShowroom,interior:createInterior,management:createManagement,crowd:createCrowd,av:createAV};

  function initCanvas(canvas){
    const frame=canvas.closest('.canvas-frame');
    let renderer,scene,camera,root,materials,observer,resizeObserver;
    let visible=false,initialized=false,dragging=false,startX=0,startY=0,lastX=0,lastY=0,yaw=.55,pitch=.24,targetYaw=.55,targetPitch=.24,auto=0;
    const type=canvas.dataset.scene;

    function initialize(){
      if(initialized) return;
      initialized=true;
      try{
        renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,alpha:true,powerPreference:'high-performance'});
      }catch(e){fallback(canvas);return;}
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.25:1.65));
      renderer.outputEncoding=THREE.sRGBEncoding;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.06;
      renderer.shadowMap.enabled=!mobile;
      renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      scene=new THREE.Scene();
      materials=baseScene(scene);
      root=new THREE.Group();scene.add(root);
      (factories[type]||factories.booth)(root,materials);
      camera=new THREE.PerspectiveCamera(mobile?48:42,1,.1,80);
      resize();
      bindInteraction();
      frame.classList.add('ready');
      render();
    }

    function resize(){
      if(!renderer||!camera) return;
      const r=frame.getBoundingClientRect();
      const w=Math.max(1,r.width),h=Math.max(1,r.height);
      renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<680?50:42;camera.updateProjectionMatrix();
    }

    function bindInteraction(){
      canvas.addEventListener('pointerdown',e=>{dragging=true;startX=lastX=e.clientX;startY=lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);});
      canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;targetYaw+=dx*.006;targetPitch=Math.max(-.02,Math.min(.62,targetPitch+dy*.0038));});
      const end=e=>{dragging=false;try{canvas.releasePointerCapture?.(e.pointerId);}catch(_){}};
      canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')dragging=false;});
    }

    function animateDetails(t){
      if(root.userData.people){root.userData.people.forEach((p,i)=>{const bob=Math.sin(t*1.45+i*.55)*.026;p.torso.position.y=p.baseY+bob;p.head.position.y=1.05+bob;});}
      if(root.userData.beams){root.userData.beams.forEach((b,i)=>b.intensity=1.8+Math.sin(t*2.1+i*.8)*.55);}
      if(root.userData.led){root.userData.led.material.emissiveIntensity=1.05+Math.sin(t*3.6)*.18;}
      if(root.userData.screen){root.userData.screen.material.emissiveIntensity=1+Math.sin(t*3)*.1;}
      if(root.userData.flowMarkers){
        root.userData.flowMarkers.forEach((marker,i)=>{
          const u=(t*.105+marker.userData.offset)%1;
          const pos=marker.userData.curve.getPointAt(u);
          marker.position.copy(pos);
          marker.position.y=.37+Math.sin(t*4+i)*.025;
          marker.scale.setScalar(.82+Math.sin(t*5+i*.8)*.18);
        });
      }
    }

    function render(){
      if(!initialized||!renderer||!scene||!camera) return;
      if(visible){
        const t=performance.now()*.001;
        if(!dragging&&!reduce){auto+=.0016;targetYaw+=Math.sin(t*.33)*.00035;}
        yaw+=(targetYaw-yaw)*.07;pitch+=(targetPitch-pitch)*.07;
        const radius=mobile?10.1:9.1;
        camera.position.set(Math.sin(yaw)*radius,3.15+pitch*2.1,Math.cos(yaw)*radius);
        camera.lookAt(0,1.65,0);
        root.rotation.y=Math.sin(t*.28)*.035;
        animateDetails(t);
        renderer.render(scene,camera);
      }
      requestAnimationFrame(render);
    }

    observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        visible=entry.isIntersecting;
        if(visible&&!initialized) initialize();
      });
    },{threshold:.08,rootMargin:'120px'});
    observer.observe(frame);
    resizeObserver=new ResizeObserver(()=>resize());resizeObserver.observe(frame);
  }

  canvases.forEach(initCanvas);
})();
