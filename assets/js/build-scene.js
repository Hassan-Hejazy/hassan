/* ==========================================================================
   BUILD SCENE — scroll-driven realistic booth build.
   Stages: footprint -> steel -> cladding -> lighting/media -> furnished finish.
   ========================================================================== */
window.BuildScene = (function(){
  let renderer, scene, camera, clock, canvas;
  let W = 0, H = 0, progress = 0, ready = false;

  let rootGroup, environmentGroup;
  let floorGrid, floorPlane, floorGlow, footprintLine, footprintCorners = [];
  let uprights = [], roofBeams = [], braces = [], canopySlats = [];
  let panels = [], accentPanels = [];
  let spotRigs = [], pointLights = [], glowSprites = [], lightBeams = [];
  let screenMesh, headerSign, headerAccent, screenGlow, wallpaperPanel, rentalTvScreen, rentalTvGlow;
  let furniture = [], decor = [], softGoods = [];
  let buildProps = [], finalDetails = [], hangingFeatures = [], glassRails = [], giftProps = [];

  const GOLD = 0xD9A94C;
  const GOLD_DIM = 0x6E5222;
  const GOLD_SOFT = 0xE7C778;
  const TEAL = 0x7FCBBD;
  const DARK = 0x16110C;
  const spanX = 6.1, spanZ = 3.45, height = 4.9;

  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function smooth(v){ return v*v*(3-2*v); }
  function seg(p,a,b){ return clamp01((p-a)/(b-a)); }

  function setShadow(mesh, cast, receive){
    mesh.castShadow = !!cast;
    mesh.receiveShadow = !!receive;
    return mesh;
  }

  function makeGlowTexture(cssColor){
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0, cssColor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,s,s);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function makeTextTexture(lines, opts={}){
    const width = opts.width || 1024;
    const heightPx = opts.height || 512;
    const bg = opts.bg || 'rgba(0,0,0,0)';
    const color = opts.color || '#f7eed3';
    const accent = opts.accent || '#d9a94c';
    const align = opts.align || 'center';
    const c = document.createElement('canvas');
    c.width = width; c.height = heightPx;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,width,heightPx);
    if(opts.border){
      ctx.strokeStyle = 'rgba(217,169,76,0.55)';
      ctx.lineWidth = 5;
      ctx.strokeRect(12,12,width-24,heightPx-24);
    }
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const x = align === 'left' ? 84 : align === 'right' ? width - 84 : width/2;
    const entries = Array.isArray(lines) ? lines : [lines];
    const gap = heightPx / (entries.length + 1);
    entries.forEach((line, idx)=>{
      const isHero = idx === 0;
      ctx.fillStyle = isHero ? color : accent;
      ctx.font = `${isHero ? 700 : 500} ${isHero ? Math.round(heightPx*0.32) : Math.round(heightPx*0.12)}px Inter, Arial, sans-serif`;
      ctx.fillText(line, x, gap*(idx+1) + (idx>0? heightPx*0.08 : 0));
    });
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }


  function makeWallpaperTexture(){
    const c=document.createElement('canvas'); c.width=1024; c.height=1024;
    const ctx=c.getContext('2d');
    const g=ctx.createLinearGradient(0,0,1024,1024);
    g.addColorStop(0,'#17120f'); g.addColorStop(.55,'#3f2b18'); g.addColorStop(1,'#11181a');
    ctx.fillStyle=g; ctx.fillRect(0,0,1024,1024);
    for(let i=0;i<8;i++){
      ctx.strokeStyle=`rgba(236,216,169,${0.08 + i*0.01})`;
      ctx.lineWidth=2; ctx.strokeRect(40+i*24,40+i*24,944-i*48,944-i*48);
    }
    ctx.fillStyle='rgba(127,203,189,.16)'; ctx.fillRect(84,130,856,150);
    ctx.fillStyle='#f6efdf'; ctx.font='700 92px Inter, Arial, sans-serif'; ctx.textAlign='left';
    ctx.fillText('BY MELI',104,224);
    ctx.fillStyle='#e3bf68'; ctx.font='500 28px Inter, Arial, sans-serif';
    ctx.fillText('EXHIBITIONS  ·  EVENTS  ·  PRODUCTION',108,268);
    ctx.fillStyle='rgba(255,255,255,.86)'; ctx.font='700 64px Inter, Arial, sans-serif';
    ctx.fillText('WALLPAPER',104,438);
    ctx.fillText('GRAPHICS',104,520);
    ctx.fillText('GIFTS',104,602);
    ctx.fillStyle='rgba(255,255,255,.72)'; ctx.font='400 26px Inter, Arial, sans-serif';
    ctx.fillText('Printed wall coverings, branded graphics and giveaway support.',108,680);
    const tex=new THREE.CanvasTexture(c); tex.needsUpdate=true; return tex;
  }

  function makeAdTexture(){
    const c=document.createElement('canvas'); c.width=1600; c.height=900;
    const ctx=c.getContext('2d');
    const g=ctx.createLinearGradient(0,0,1600,900);
    g.addColorStop(0,'#071314'); g.addColorStop(.58,'#102020'); g.addColorStop(1,'#19130d');
    ctx.fillStyle=g; ctx.fillRect(0,0,1600,900);
    ctx.fillStyle='rgba(127,203,189,.24)'; ctx.fillRect(0,0,1600,180);
    ctx.fillStyle='#f5ead1'; ctx.font='700 110px Inter, Arial, sans-serif';
    ctx.fillText('BY MELI',110,170);
    ctx.fillStyle='#e1b75f'; ctx.font='600 44px Inter, Arial, sans-serif';
    ctx.fillText('EXHIBITION BOOTHS',110,315);
    ctx.fillText('SHOWROOMS',110,390);
    ctx.fillText('EVENT PRODUCTION',110,465);
    ctx.fillStyle='rgba(255,255,255,.78)'; ctx.font='400 34px Inter, Arial, sans-serif';
    ctx.fillText('Printed graphics  ·  TV rental  ·  furniture rental',110,590);
    ctx.fillText('Wallpaper application  ·  branded gifts',110,645);
    ctx.strokeStyle='rgba(236,216,169,.35)'; ctx.lineWidth=4; ctx.strokeRect(76,74,1448,752);
    const tex=new THREE.CanvasTexture(c); tex.needsUpdate=true; return tex;
  }

  function createBeam(length, thickness, axis='x', material){
    const geo = axis === 'y'
      ? new THREE.BoxGeometry(thickness, length, thickness)
      : axis === 'z'
      ? new THREE.BoxGeometry(thickness, thickness, length)
      : new THREE.BoxGeometry(length, thickness, thickness);
    const m = setShadow(new THREE.Mesh(geo, material), true, true);
    if(axis === 'y'){
      m.scale.y = 0.001;
    } else if(axis === 'x'){
      m.scale.x = 0.001;
    } else {
      m.scale.z = 0.001;
    }
    return m;
  }

  function addEnvironment(){
    environmentGroup = new THREE.Group();
    scene.add(environmentGroup);

    const floorMat = new THREE.MeshStandardMaterial({ color:0x0F0D0A, roughness:0.92, metalness:0.05 });
    floorPlane = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(44, 30), floorMat), false, true);
    floorPlane.rotation.x = -Math.PI/2;
    floorPlane.position.y = -0.005;
    environmentGroup.add(floorPlane);

    const glowMat = new THREE.MeshBasicMaterial({ color:0x2A2111, transparent:true, opacity:0.55 });
    floorGlow = new THREE.Mesh(new THREE.CircleGeometry(8.2, 48), glowMat);
    floorGlow.rotation.x = -Math.PI/2;
    floorGlow.position.y = 0.01;
    rootGroup.add(floorGlow);

    floorGrid = new THREE.GridHelper(32, 24, GOLD_DIM, 0x2A2620);
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.10;
    environmentGroup.add(floorGrid);

    // distant wall cards to create depth
    const wallMat = new THREE.MeshBasicMaterial({ color:0x16120e, transparent:true, opacity:0.45, side:THREE.DoubleSide });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(36, 16), wallMat);
    backWall.position.set(0, 6.2, -13.5);
    environmentGroup.add(backWall);

    const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), wallMat.clone());
    sideWall.position.set(14, 6.2, 0);
    sideWall.rotation.y = -Math.PI/2;
    environmentGroup.add(sideWall);

    const sideWall2 = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), wallMat.clone());
    sideWall2.position.set(-14, 6.2, 0);
    sideWall2.rotation.y = Math.PI/2;
    environmentGroup.add(sideWall2);

    const pts = [
      [-spanX,0,-spanZ],[spanX,0,-spanZ],[spanX,0,spanZ],[-spanX,0,spanZ],[-spanX,0,-spanZ]
    ].map(p=> new THREE.Vector3(p[0], p[1] + 0.025, p[2]));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    footprintLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color:GOLD_SOFT, transparent:true, opacity:0, depthTest:false }));
    rootGroup.add(footprintLine);

    const cornerGeo = new THREE.RingGeometry(0.09, 0.15, 20);
    footprintCorners = pts.slice(0,4).map(pt=>{
      const ring = new THREE.Mesh(cornerGeo, new THREE.MeshBasicMaterial({ color:GOLD_SOFT, transparent:true, opacity:0, side:THREE.DoubleSide }));
      ring.position.copy(pt);
      ring.rotation.x = -Math.PI/2;
      rootGroup.add(ring);
      return ring;
    });
  }

  function addFrame(){
    const beamMat = new THREE.MeshStandardMaterial({ color:0xB99B58, metalness:0.65, roughness:0.35, emissive:0x1d1307, emissiveIntensity:0.18 });
    const colPos = [
      [-spanX,-spanZ],[spanX,-spanZ],[-spanX,spanZ],[spanX,spanZ],[-spanX*0.22,-spanZ],[spanX*0.22,-spanZ]
    ];
    colPos.forEach(([x,z])=>{
      const col = createBeam(height, 0.18, 'y', beamMat);
      col.position.set(x, 0, z);
      rootGroup.add(col);
      uprights.push({ mesh:col, axis:'y' });
    });

    const topY = height - 0.08;
    const beamDefs = [
      { pos:[0, topY, -spanZ], len:spanX*2, axis:'x' },
      { pos:[0, topY, spanZ], len:spanX*2, axis:'x' },
      { pos:[-spanX, topY, 0], len:spanZ*2, axis:'z' },
      { pos:[spanX, topY, 0], len:spanZ*2, axis:'z' },
      { pos:[0, topY, 0], len:spanZ*2, axis:'z' },
      { pos:[0, topY, -spanZ*0.1], len:spanX*1.8, axis:'x' },
    ];
    beamDefs.forEach(d=>{
      const beam = createBeam(d.len, 0.16, d.axis, beamMat);
      beam.position.set(d.pos[0], d.pos[1], d.pos[2]);
      rootGroup.add(beam);
      roofBeams.push({ mesh:beam, axis:d.axis });
    });

    // arch/fascia beam
    const curve = new THREE.EllipseCurve(0, height-0.06, spanX*0.60, 1.45, Math.PI, 2*Math.PI, false, 0);
    const archPts = curve.getPoints(36).map(p=> new THREE.Vector3(p.x, p.y, -spanZ-0.04));
    const archGeo = new THREE.BufferGeometry().setFromPoints(archPts);
    const arch = new THREE.Line(archGeo, new THREE.LineBasicMaterial({ color:GOLD_SOFT, transparent:true, opacity:0 }));
    rootGroup.add(arch);
    braces.push({ type:'line', mesh:arch });

    const braceDefs = [
      [[-spanX,0,-spanZ],[0,height*0.88,-spanZ]],
      [[spanX,0,-spanZ],[0,height*0.88,-spanZ]],
      [[-spanX,0,spanZ],[0,height*0.72,spanZ]],
      [[spanX,0,spanZ],[0,height*0.72,spanZ]],
    ];
    braceDefs.forEach(([a,b])=>{
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color:GOLD_DIM, transparent:true, opacity:0 }));
      rootGroup.add(line);
      braces.push({ type:'line', mesh:line });
    });

    // canopy slats for more dimensional roof
    for(let i=-2; i<=2; i++){
      const slat = createBeam(spanZ*2-0.24, 0.08, 'z', new THREE.MeshStandardMaterial({ color:0x4C3C1A, metalness:0.28, roughness:0.65 }));
      slat.position.set(i*1.22, height-0.24, 0);
      rootGroup.add(slat);
      canopySlats.push({ mesh:slat, axis:'z' });
    }
  }

  function addPanels(){
    const panelMat = new THREE.MeshStandardMaterial({ color:0x5F4520, roughness:0.55, metalness:0.22, emissive:0x20150a, emissiveIntensity:0.12, transparent:true, opacity:0 });
    const accentMat = new THREE.MeshStandardMaterial({ color:0xD2A73B, roughness:0.42, metalness:0.35, emissive:0x50340a, emissiveIntensity:0.22, transparent:true, opacity:0 });
    const defs = [
      { size:[spanX*2-0.28, height-0.45, 0.10], pos:[0,height*0.5,-spanZ], rot:[0,0,0] },
      { size:[0.10, height-0.45, spanZ*2-0.2], pos:[-spanX,height*0.5,0], rot:[0,0,0] },
      { size:[0.10, height-0.45, spanZ*2-0.2], pos:[spanX,height*0.5,0], rot:[0,0,0] },
    ];
    defs.forEach((d, idx)=>{
      const geo = new THREE.BoxGeometry(d.size[0], d.size[1], d.size[2]);
      const mesh = setShadow(new THREE.Mesh(geo, panelMat.clone()), true, true);
      mesh.position.set(...d.pos);
      mesh.userData.baseY = d.pos[1];
      rootGroup.add(mesh);
      panels.push(mesh);

      if(idx === 0){
        const trim = setShadow(new THREE.Mesh(new THREE.BoxGeometry(spanX*2-0.28, 0.22, 0.16), accentMat.clone()), true, true);
        trim.position.set(0, height-0.08, -spanZ+0.01);
        trim.userData.baseY = trim.position.y;
        rootGroup.add(trim);
        accentPanels.push(trim);
      }
    });

    // fascia sign with WE CAN
    const signTex = makeTextTexture(['WE CAN'], { width:1400, height:320, bg:'rgba(10,10,10,0.82)', color:'#f7eed3', accent:'#d9a94c', border:true });
    const signMat = new THREE.MeshStandardMaterial({ map:signTex, transparent:true, opacity:0, emissive:0xA77C1E, emissiveIntensity:0.18, metalness:0.08, roughness:0.5 });
    headerSign = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.06), signMat), false, true);
    headerSign.position.set(0, height-0.16, spanZ+0.14);
    rootGroup.add(headerSign);

    headerAccent = setShadow(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 0.14), accentMat.clone()), true, true);
    headerAccent.position.set(0, height+0.40, spanZ+0.04);
    rootGroup.add(headerAccent);

    const wallpaperTex = makeWallpaperTexture();
    const wallpaperMat = new THREE.MeshStandardMaterial({ map: wallpaperTex, color:0xffffff, roughness:0.62, metalness:0.08, transparent:true, opacity:0, emissive:0x1f1510, emissiveIntensity:0.14, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
    wallpaperPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.9), wallpaperMat);
    wallpaperPanel.position.set(-spanX + 0.12, 2.0, 0.08);
    wallpaperPanel.rotation.y = Math.PI/2;
    wallpaperPanel.renderOrder = 3;
    rootGroup.add(wallpaperPanel);
  }

  function addLighting(){
    const glowTexGold = makeGlowTexture('rgba(247,224,174,0.92)');
    const glowTexTeal = makeGlowTexture('rgba(127,203,189,0.85)');
    const rigPositions = [
      [-spanX*0.62,height+0.16,-spanZ*0.1],
      [ spanX*0.62,height+0.16,-spanZ*0.1],
      [ 0,height+0.12,spanZ*0.55],
    ];
    rigPositions.forEach((p, i)=>{
      const head = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.14,0.28,14), new THREE.MeshStandardMaterial({ color:0x111111, metalness:0.82, roughness:0.3 })), true, true);
      head.rotation.x = Math.PI/2;
      head.position.set(p[0], p[1]+0.22, p[2]);
      rootGroup.add(head);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.95, 3.4, 16, 1, true),
        new THREE.MeshBasicMaterial({ color:i===2 ? TEAL : 0xFFE6A6, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide })
      );
      beam.position.set(p[0], height*0.6, p[2]);
      beam.scale.y = 0.001;
      rootGroup.add(beam);
      lightBeams.push(beam);

      const pl = new THREE.PointLight(i===2 ? TEAL : 0xFFE3A0, 0, 8.5, 2.0);
      pl.position.set(p[0], p[1]-0.45, p[2]);
      scene.add(pl);
      pointLights.push(pl);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:i===2 ? glowTexTeal : glowTexGold, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
      sprite.position.copy(pl.position);
      sprite.scale.set(i===2 ? 3.4 : 2.8, i===2 ? 3.4 : 2.8, 1);
      rootGroup.add(sprite);
      glowSprites.push(sprite);

      spotRigs.push({ head, restY:p[1]+0.22, dropY:height+1.35, beam });
    });

    const screenTex = makeTextTexture(['WE CAN'], { width:1400, height:780, bg:'rgba(5,20,20,1)', color:'#efffff', accent:'#7fcbbd' });
    const screenMat = new THREE.MeshStandardMaterial({ color:0x0b0e0f, map:screenTex, emissive:TEAL, emissiveIntensity:0, metalness:0.1, roughness:0.55, transparent:true, opacity:0, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1 });
    screenMesh = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.08), screenMat), false, false);
    screenMesh.position.set(0, height*0.54, -spanZ+0.18);
    rootGroup.add(screenMesh);

    screenGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTexTeal, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
    screenGlow.position.copy(screenMesh.position);
    screenGlow.scale.set(5.1, 5.1, 1);
    rootGroup.add(screenGlow);

    const adTex = makeAdTexture();
    const tvFrame = setShadow(new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 0.12), new THREE.MeshStandardMaterial({ color:0x111214, roughness:0.38, metalness:0.18, transparent:true, opacity:0 })), true, true);
    tvFrame.position.set(2.72, -0.24, -0.28); rootGroup.add(tvFrame); finalDetails.push({ mesh:tvFrame, targetY:1.95, emissive:false });
    const tvStem = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), new THREE.MeshStandardMaterial({ color:0x0f1011, roughness:0.4, metalness:0.22, transparent:true, opacity:0 })), true, true);
    tvStem.position.set(2.72, -0.24, -0.28); rootGroup.add(tvStem); finalDetails.push({ mesh:tvStem, targetY:0.82, emissive:false });
    const tvBase = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.42,0.08,18), new THREE.MeshStandardMaterial({ color:0x1a1b1d, roughness:0.54, metalness:0.14, transparent:true, opacity:0 })), true, true);
    tvBase.position.set(2.72, -0.24, -0.28); rootGroup.add(tvBase); finalDetails.push({ mesh:tvBase, targetY:0.04, emissive:false });
    rentalTvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.62, .92), new THREE.MeshStandardMaterial({ map:adTex, color:0xffffff, emissive:0x6dbeb1, emissiveIntensity:0, roughness:0.24, metalness:0.02, transparent:true, opacity:0, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }));
    rentalTvScreen.position.set(2.72, -0.24, -0.205); rentalTvScreen.renderOrder = 4; rootGroup.add(rentalTvScreen); finalDetails.push({ mesh:rentalTvScreen, targetY:1.95, emissive:true, maxEmissive:1.35 });
    rentalTvGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTexTeal, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending }));
    rentalTvGlow.position.set(2.72, 1.95, -0.14); rentalTvGlow.scale.set(2.6, 2.1, 1); rootGroup.add(rentalTvGlow);
  }


  function addRealism(){
    const darkMat = new THREE.MeshStandardMaterial({ color:0x1A1511, roughness:0.68, metalness:0.18, transparent:true, opacity:0 });
    const woodMat = new THREE.MeshStandardMaterial({ color:0x5E4528, roughness:0.72, metalness:0.06, transparent:true, opacity:0 });
    const goldMat = new THREE.MeshStandardMaterial({ color:GOLD, roughness:0.34, metalness:0.36, emissive:0x7b5a16, emissiveIntensity:0, transparent:true, opacity:0 });
    const glassMat = new THREE.MeshStandardMaterial({ color:0xd9efe8, roughness:0.04, metalness:0.12, transparent:true, opacity:0, transmission:0.35 });
    const creamMat = new THREE.MeshStandardMaterial({ color:0xF3E6CD, roughness:0.55, metalness:0.05, transparent:true, opacity:0 });
    const tealMat = new THREE.MeshStandardMaterial({ color:TEAL, roughness:0.42, metalness:0.14, transparent:true, opacity:0 });

    // construction-stage realism props
    const pallet = setShadow(new THREE.Mesh(new THREE.BoxGeometry(1.2,0.18,0.88), woodMat.clone()), true, true);
    pallet.position.set(4.6,-0.26,-1.6); rootGroup.add(pallet); buildProps.push({ mesh:pallet, show:[0.16,0.64], targetY:0.09 });
    [0,1,2].forEach(i=>{
      const stack = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.98,0.08,0.62), creamMat.clone()), true, true);
      stack.position.set(4.58,-0.28,-1.62); rootGroup.add(stack); buildProps.push({ mesh:stack, show:[0.22+i*0.03,0.72], targetY:0.18 + i*0.1 });
    });
    const toolbox = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.72,0.36,0.38), darkMat.clone()), true, true);
    toolbox.position.set(-4.65,-0.28,-1.95); rootGroup.add(toolbox); buildProps.push({ mesh:toolbox, show:[0.2,0.70], targetY:0.18 });
    const ladderMat = new THREE.MeshStandardMaterial({ color:0xC89B45, roughness:0.45, metalness:0.28, transparent:true, opacity:0 });
    const ladder = new THREE.Group();
    const legL = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.08,2.4,0.08), ladderMat), true, true); legL.position.set(-0.18,1.2,0);
    const legR = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.08,2.4,0.08), ladderMat), true, true); legR.position.set(0.18,1.2,0);
    ladder.add(legL); ladder.add(legR);
    for(let i=0;i<6;i++){ const rung=setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.42,0.06,0.06), ladderMat), true, true); rung.position.set(0,0.35+i*0.32,0); ladder.add(rung); }
    ladder.position.set(5.0,-0.26,0.95); ladder.rotation.z=-0.28; rootGroup.add(ladder); buildProps.push({ mesh:ladder, show:[0.26,0.76], targetY:0 });

    // glass guard / edge rails
    [[-5.15,0.0],[5.15,0.0]].forEach(([x,z])=>{
      const rail = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.08,1.35,2.2), glassMat.clone()), false, true);
      rail.position.set(x, -0.2, z); rootGroup.add(rail); glassRails.push({ mesh:rail, targetY:0.68 });
      const base = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.16,0.14,2.24), darkMat.clone()), true, true);
      base.position.set(x, -0.2, z); rootGroup.add(base); finalDetails.push({ mesh:base, targetY:0.07, emissive:false });
    });

    // product display pedestals and niche shelves
    [[3.6,1.6],[-3.65,1.45]].forEach(([x,z],idx)=>{
      const plinth = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.72,1.05,0.72), idx===0 ? darkMat.clone() : woodMat.clone()), true, true);
      plinth.position.set(x,-0.24,z); rootGroup.add(plinth); finalDetails.push({ mesh:plinth, targetY:0.53, emissive:false });
      const cap = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.78,0.05,0.78), goldMat.clone()), true, true);
      cap.position.set(x,-0.24,z); rootGroup.add(cap); finalDetails.push({ mesh:cap, targetY:1.07, emissive:true });
      const object = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.28,16), idx===0 ? tealMat.clone() : creamMat.clone()), true, true);
      object.position.set(x,-0.24,z); rootGroup.add(object); finalDetails.push({ mesh:object, targetY:1.25, emissive:false });
    });
    const nicheBack = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.16,2.15,1.95), darkMat.clone()), true, true);
    nicheBack.position.set(-spanX+0.22, -0.24, 0.0); rootGroup.add(nicheBack); finalDetails.push({ mesh:nicheBack, targetY:1.08, emissive:false });
    for(let i=0;i<3;i++){
      const shelf = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.34,0.06,1.55), woodMat.clone()), true, true);
      shelf.position.set(-spanX+0.48,-0.24,0); rootGroup.add(shelf); finalDetails.push({ mesh:shelf, targetY:0.55 + i*0.55, emissive:false });
    }

    // lounge seating with backs
    [[2.55,-0.9],[3.45,-0.15]].forEach(([x,z])=>{
      const seat = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.72,0.32,0.72), creamMat.clone()), true, true);
      seat.position.set(x,-0.24,z); rootGroup.add(seat); finalDetails.push({ mesh:seat, targetY:0.24, emissive:false });
      const back = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.72,0.52,0.12), creamMat.clone()), true, true);
      back.position.set(x,-0.24,z-0.3); rootGroup.add(back); finalDetails.push({ mesh:back, targetY:0.62, emissive:false });
    });

    // reception monitor and brochure holder
    const monitorStem = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.06,0.24,0.06), darkMat.clone()), true, true);
    monitorStem.position.set(0,-0.24,1.05); rootGroup.add(monitorStem); finalDetails.push({ mesh:monitorStem, targetY:0.95, emissive:false });
    const monitor = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.72,0.42,0.04), new THREE.MeshStandardMaterial({ color:0x0D1113, roughness:0.34, metalness:0.12, emissive:TEAL, emissiveIntensity:0, transparent:true, opacity:0 })), false, false);
    monitor.position.set(0,-0.24,1.02); rootGroup.add(monitor); finalDetails.push({ mesh:monitor, targetY:1.22, emissive:true, maxEmissive:1.1 });
    const brochure = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.34,0.56,0.22), glassMat.clone()), false, true);
    brochure.position.set(-1.45,-0.24,1.22); brochure.rotation.y = 0.25; rootGroup.add(brochure); finalDetails.push({ mesh:brochure, targetY:0.34, emissive:false });

    [[-0.42,1.38],[0.0,1.52],[0.42,1.3]].forEach(([x,z],i)=>{
      const box=setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.22,0.16,0.22), i===1 ? goldMat.clone() : creamMat.clone()), true, true);
      box.position.set(x,-0.24,z); rootGroup.add(box); giftProps.push({ mesh:box, targetY:0.98 + i*0.03 });
    });

    // suspended decorative halo rings
    [0,1].forEach(i=>{
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54 + i*0.24, 0.025, 12, 56), new THREE.MeshStandardMaterial({ color:0xF1D797, emissive:GOLD, emissiveIntensity:0, roughness:0.28, metalness:0.42, transparent:true, opacity:0 }));
      ring.rotation.x = Math.PI/2; ring.position.set(-2.1 + i*1.0, -0.24, -0.3); rootGroup.add(ring); hangingFeatures.push({ mesh:ring, targetY:3.35 + i*0.28 });
    });
  }

  function addFurniture(){
    const darkMat = new THREE.MeshStandardMaterial({ color:0x1C1813, roughness:0.64, metalness:0.2, transparent:true, opacity:0 });
    const goldMat = new THREE.MeshStandardMaterial({ color:GOLD, roughness:0.35, metalness:0.4, emissive:GOLD, emissiveIntensity:0, transparent:true, opacity:0 });

    const desk = setShadow(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.92, 0.78), darkMat.clone()), true, true);
    desk.position.set(0, -0.18, 1.42);
    rootGroup.add(desk);
    furniture.push({ mesh:desk, targetY:0.46 });

    const deskGlow = setShadow(new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.08, 0.82), goldMat.clone()), true, true);
    deskGlow.position.set(0, 0.1, 1.42);
    rootGroup.add(deskGlow);
    furniture.push({ mesh:deskGlow, targetY:0.86, isTrim:true });

    const table = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.58,0.72,0.08,18), darkMat.clone()), true, true);
    table.position.set(-2.28, -0.2, 1.7);
    rootGroup.add(table);
    furniture.push({ mesh:table, targetY:0.82 });

    const tableStem = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,0.7,14), darkMat.clone()), true, true);
    tableStem.position.set(-2.28, -0.2, 1.7);
    rootGroup.add(tableStem);
    furniture.push({ mesh:tableStem, targetY:0.35 });

    [-3.1,-2.28,-1.46].forEach(x=>{
      const stool = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.18,0.56,14), darkMat.clone()), true, true);
      stool.position.set(x, -0.2, 2.42);
      rootGroup.add(stool);
      furniture.push({ mesh:stool, targetY:0.28 });
    });

    // decor planters
    const potMat = new THREE.MeshStandardMaterial({ color:0x2A241D, roughness:0.68, metalness:0.15, transparent:true, opacity:0 });
    const leafMat = new THREE.MeshStandardMaterial({ color:0x415F4D, roughness:0.82, metalness:0.02, transparent:true, opacity:0 });
    [[4.15,2.35],[-4.15,2.15]].forEach(([x,z])=>{
      const pot = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.28,0.42,14), potMat.clone()), true, true);
      pot.position.set(x,-0.2,z);
      rootGroup.add(pot);
      decor.push({ mesh:pot, targetY:0.21, isLeaf:false });
      for(let i=0;i<5;i++){
        const leaf = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.18 + i*0.015, 12, 10), leafMat.clone()), true, true);
        leaf.scale.set(0.8, 1.35, 0.62);
        leaf.position.set(x + (i-2)*0.05, -0.2, z + (i%2?0.08:-0.08));
        rootGroup.add(leaf);
        decor.push({ mesh:leaf, targetY:0.58 + i*0.08, isLeaf:true });
      }
    });

    // carpet under final set
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.4), new THREE.MeshStandardMaterial({ color:0x1A1712, roughness:0.92, metalness:0.01, transparent:true, opacity:0 }));
    carpet.rotation.x = -Math.PI/2;
    carpet.position.set(0, 0.009, 0.7);
    rootGroup.add(carpet);
    softGoods.push(carpet);
  }

  function init(cvs){
    canvas = cvs;
    if(!canvas || typeof THREE === 'undefined') return false;
    const parent = canvas.parentElement;
    W = parent.clientWidth; H = parent.clientHeight;

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
    } catch(err) {
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.sortObjects = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x120E0A, 0.028);

    camera = new THREE.PerspectiveCamera(W < 720 ? 52 : 42, W / H, 0.1, 100);

    scene.add(new THREE.HemisphereLight(0xE7D3A6, 0x1A1711, 1.0));
    const sun = new THREE.DirectionalLight(0xfff0c8, 1.18);
    sun.position.set(6.2, 9.6, 7.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    scene.add(sun);

    rootGroup = new THREE.Group();
    scene.add(rootGroup);

    addEnvironment();
    addFrame();
    addPanels();
    addLighting();
    addFurniture();
    addRealism();

    clock = new THREE.Clock();
    ready = true;
    canvas.parentElement.classList.add('model-active');
    renderLoop();

    window.addEventListener('resize', resize);
    return true;
  }

  function resize(){
    if(!canvas || !renderer || !camera) return;
    const parent = canvas.parentElement;
    W = parent.clientWidth;
    H = parent.clientHeight;
    if(W === 0 || H === 0) return;
    camera.aspect = W/H;
    camera.fov = W < 720 ? 52 : 42;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
  }

  function update(p){ progress = clamp01(p); }

  function applyProgress(){
    const p = progress;

    // Stage 1 — footprint and site glow
    const s1 = smooth(seg(p, 0, 0.18));
    floorGrid.material.opacity = 0.06 + s1 * 0.14;
    floorGlow.material.opacity = 0.28 + s1 * 0.3;
    footprintLine.material.opacity = s1 * 0.95;
    footprintCorners.forEach((ring, i)=>{
      const local = clamp01((s1 - i*0.12) / (1 - i*0.06));
      ring.material.opacity = local * 0.92;
      ring.scale.setScalar(0.86 + local*0.18);
    });

    // Stage 2 — steel structure
    const s2 = smooth(seg(p, 0.14, 0.42));
    uprights.forEach((item, i)=>{
      const local = clamp01((s2 - i*0.05) / (1 - i*0.025));
      item.mesh.scale.y = Math.max(0.001, local);
      item.mesh.position.y = (height * local) / 2;
    });
    roofBeams.forEach((item, i)=>{
      const local = clamp01((smooth(seg(p, 0.24 + i*0.015, 0.46 + i*0.015))));
      if(item.axis === 'x') item.mesh.scale.x = Math.max(0.001, local);
      if(item.axis === 'z') item.mesh.scale.z = Math.max(0.001, local);
      item.mesh.material.opacity = 0.5 + local*0.5;
      item.mesh.material.transparent = true;
    });
    canopySlats.forEach((item, i)=>{
      const local = clamp01((smooth(seg(p, 0.30 + i*0.02, 0.5 + i*0.02))));
      item.mesh.scale.z = Math.max(0.001, local);
      item.mesh.material.transparent = true;
      item.mesh.material.opacity = local;
    });
    braces.forEach((item, i)=>{
      const local = smooth(seg(p, 0.26 + i*0.02, 0.52 + i*0.02));
      item.mesh.material.opacity = item.type === 'line' ? local * (i===0 ? 0.95 : 0.48) : local;
    });

    // Stage 3 — cladding and fascia
    const s3 = smooth(seg(p, 0.4, 0.66));
    panels.forEach((panel, i)=>{
      const local = clamp01((s3 - i*0.12) / (1 - i*0.08));
      panel.material.opacity = local * 0.96;
      panel.position.y = panel.userData.baseY - (1-local) * 0.75;
      panel.scale.setScalar(1);
    });
    accentPanels.forEach((panel, i)=>{
      const local = clamp01((smooth(seg(p, 0.5 + i*0.02, 0.74 + i*0.02))));
      panel.material.opacity = panel.material.opacity !== undefined ? local * 0.95 : local;
    });
    if(headerSign){
      const local = smooth(seg(p, 0.5, 0.72));
      headerSign.material.opacity = local;
      headerSign.position.y = lerp(height-0.55, height-0.18, local);
    }
    if(headerAccent){
      const local = smooth(seg(p, 0.54, 0.76));
      headerAccent.material.opacity = local;
      headerAccent.position.y = lerp(height+0.15, height+0.40, local);
    }

    // Stage 4 — light, media, energy
    const s4 = smooth(seg(p, 0.62, 0.88));
    const time = performance.now() * 0.001;
    spotRigs.forEach((rig, i)=>{
      const local = clamp01((s4 - i*0.1) / (1 - i*0.06));
      rig.head.position.y = lerp(rig.dropY, rig.restY, local);
      rig.beam.material.opacity = local * (i===2 ? 0.18 : 0.14);
      rig.beam.scale.y = Math.max(0.001, local);
      rig.beam.rotation.x = Math.PI;
      rig.beam.position.y = lerp(height+0.2, height*0.58, local);
    });
    pointLights.forEach((pl, i)=>{
      const local = clamp01((s4 - i*0.1) / (1 - i*0.06));
      const pulse = 0.86 + Math.sin(time*2.0 + i*0.9) * 0.12;
      pl.intensity = local * (i===2 ? 2.1 : 2.55) * pulse;
      glowSprites[i].material.opacity = local * (i===2 ? 0.48 : 0.68) * pulse;
    });
    if(screenMesh){
      const flicker = 0.9 + Math.sin(time*8.5) * 0.08;
      screenMesh.material.opacity = clamp01(s4 * 1.15);
      screenMesh.material.emissiveIntensity = s4 * 1.75 * flicker;
      screenGlow.material.opacity = s4 * 0.38 * flicker;
      screenMesh.position.y = lerp(height*0.5 - 0.2, height*0.54, s4);
    }

    // Stage 5 — furniture and finish
    const s5 = smooth(seg(p, 0.82, 1));
    furniture.forEach((item, i)=>{
      const local = clamp01((s5 - i*0.06) / (1 - i*0.04));
      item.mesh.material.opacity = local;
      item.mesh.position.y = lerp(-0.28, item.targetY, local);
      if(item.isTrim){ item.mesh.material.emissiveIntensity = local * 0.9; }
    });
    softGoods.forEach((item, i)=>{
      const local = clamp01((s5 - i*0.04) / (1 - i*0.03));
      item.material.opacity = local * 0.88;
    });
    decor.forEach((item, i)=>{
      const local = clamp01((s5 - i*0.025) / (1 - i*0.02));
      item.mesh.material.opacity = local * (item.isLeaf ? 1 : 0.95);
      item.mesh.position.y = lerp(-0.25, item.targetY, local);
      if(item.isLeaf) item.mesh.rotation.z = Math.sin(time*1.2 + i) * 0.03;
    });

    if(wallpaperPanel){
      const w = smooth(seg(p, 0.52, 0.78));
      wallpaperPanel.material.opacity = w * 0.98;
      wallpaperPanel.material.emissiveIntensity = 0.10 + w * 0.22;
      wallpaperPanel.position.x = lerp(-spanX + 0.03, -spanX + 0.12, w);
    }

    giftProps.forEach((item,i)=>{
      const local = clamp01((s5 - i*0.03) / (1 - i*0.02));
      item.mesh.material.opacity = local;
      item.mesh.position.y = lerp(-0.24, item.targetY, local);
      item.mesh.rotation.y = Math.sin(time*0.8 + i) * 0.08;
    });

    if(rentalTvGlow){
      const glow = smooth(seg(p, 0.8, 1.0)) * (0.88 + Math.sin(time*2.4)*0.08);
      rentalTvGlow.material.opacity = glow * 0.32;
      rentalTvGlow.position.y = 1.95 + Math.sin(time*1.1)*0.02;
    }

    const buildTime = smooth(seg(p, 0.18, 0.62));
    const buildFade = 1.0 - smooth(seg(p, 0.74, 0.96));
    buildProps.forEach((item, i)=>{
      const local = clamp01((buildTime - i*0.03) / (1 - i*0.02)) * buildFade;
      if(item.mesh.material){
        if(Array.isArray(item.mesh.material)) item.mesh.material.forEach(m=>{ if('opacity' in m){ m.opacity = local * 0.95; m.transparent = true; } });
        else if('opacity' in item.mesh.material){ item.mesh.material.opacity = local * 0.95; item.mesh.material.transparent = true; }
      }
      item.mesh.position.y = lerp(-0.3, item.targetY, local);
      item.mesh.rotation.y = (item.mesh.rotation.y || 0) + Math.sin(time*0.45 + i)*0.0008;
    });

    finalDetails.forEach((item, i)=>{
      const local = clamp01((s5 - i*0.028) / (1 - i*0.018));
      if(item.mesh.material){
        if(Array.isArray(item.mesh.material)) item.mesh.material.forEach(m=>{ if('opacity' in m){ m.opacity = local; m.transparent = true; } if(item.emissive && 'emissiveIntensity' in m){ m.emissiveIntensity = local * (item.maxEmissive || 0.72); } });
        else {
          if('opacity' in item.mesh.material){ item.mesh.material.opacity = local; item.mesh.material.transparent = true; }
          if(item.emissive && 'emissiveIntensity' in item.mesh.material){ item.mesh.material.emissiveIntensity = local * (item.maxEmissive || 0.72); }
        }
      }
      item.mesh.position.y = lerp(-0.26, item.targetY, local);
    });

    glassRails.forEach((item, i)=>{
      const local = clamp01((s5 - i*0.03) / (1 - i*0.02));
      item.mesh.material.opacity = local * 0.28;
      item.mesh.position.y = lerp(-0.24, item.targetY, local);
    });

    hangingFeatures.forEach((item, i)=>{
      const local = clamp01((s5 - i*0.04) / (1 - i*0.03));
      item.mesh.material.opacity = local * 0.95;
      item.mesh.material.emissiveIntensity = local * 1.15;
      item.mesh.position.y = lerp(-0.2, item.targetY, local);
      item.mesh.rotation.z = Math.sin(time*0.75 + i) * 0.03;
    });

    // overall booth motion / camera path
    const cam = cameraForProgress(p);
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);

    rootGroup.rotation.y = lerp(-0.34, 0.16, smooth(p));
    rootGroup.position.y = Math.sin(time*0.6) * 0.02;
    floorGlow.scale.setScalar(1 + s5*0.03 + Math.sin(time*0.9)*0.008);
  }

  function cameraForProgress(p){
    const isMobile = W < 720;
    const keys = isMobile
      ? [
          { t:0.00, pos:[0.4, 2.0, 12.4], look:[0,0.7,0] },
          { t:0.22, pos:[1.8, 2.6, 11.1], look:[0,1.8,0] },
          { t:0.52, pos:[4.8, 3.4, 10.0], look:[0,2.4,0.1] },
          { t:0.74, pos:[5.6, 3.0, 11.4], look:[0,2.5,0.5] },
          { t:1.00, pos:[3.2, 2.5, 12.8], look:[0,2.2,0.8] }
        ]
      : [
          { t:0.00, pos:[0.2, 1.7, 12.0], look:[0,0.6,0] },
          { t:0.18, pos:[2.3, 2.2, 10.7], look:[0,1.5,0] },
          { t:0.42, pos:[4.8, 3.0, 9.5], look:[0,2.3,0] },
          { t:0.66, pos:[6.1, 3.45, 10.4], look:[0,2.7,0.2] },
          { t:0.86, pos:[5.0, 3.0, 11.7], look:[0,2.5,0.8] },
          { t:1.00, pos:[3.25, 2.55, 12.9], look:[0,2.15,1.0] }
        ];
    let a = keys[0], b = keys[keys.length-1];
    for(let i=0; i<keys.length-1; i++){
      if(p >= keys[i].t && p <= keys[i+1].t){ a = keys[i]; b = keys[i+1]; break; }
    }
    const span = (b.t - a.t) || 1;
    const local = smooth(clamp01((p - a.t) / span));
    return {
      pos:[ lerp(a.pos[0], b.pos[0], local), lerp(a.pos[1], b.pos[1], local), lerp(a.pos[2], b.pos[2], local) ],
      look:[ lerp(a.look[0], b.look[0], local), lerp(a.look[1], b.look[1], local), lerp(a.look[2], b.look[2], local) ]
    };
  }

  function renderLoop(){
    if(!ready) return;
    applyProgress();
    renderer.render(scene, camera);
    requestAnimationFrame(renderLoop);
  }

  function setLang(){ /* reserved; text panels intentionally stay in English as requested */ }

  return { init, update, resize, setLang };
})();
