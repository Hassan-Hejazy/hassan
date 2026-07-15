(function(){
  'use strict';
  if(!window.THREE) return;
  const coarse=matchMedia('(pointer:coarse)').matches;
  const compact=matchMedia('(max-width:760px)').matches;
  const dpr=Math.max(1,window.devicePixelRatio||1);
  const memory=Number(navigator.deviceMemory||8);
  const cores=Number(navigator.hardwareConcurrency||8);
  const strong=memory>=6&&cores>=6;
  const pixelCap=compact?(strong?2.15:1.85):(strong?2.65:2.25);
  const shadowMapSize=compact?(strong?1536:1024):(strong?2048:1536);

  function configureRenderer(renderer,options={}){
    renderer.setPixelRatio(Math.min(dpr,options.pixelCap||pixelCap));
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=options.exposure||1.08;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.autoUpdate=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.sortObjects=true;
    renderer.autoClear=true;
    if(renderer.capabilities&&renderer.capabilities.isWebGL2){try{const gl=renderer.getContext();gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.BROWSER_DEFAULT_WEBGL)}catch(_){}}
    return renderer;
  }

  function prepareTexture(texture,renderer){
    if(!texture) return texture;
    const max=renderer&&renderer.capabilities?renderer.capabilities.getMaxAnisotropy():8;
    texture.anisotropy=Math.min(max||1,16);
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;
    texture.encoding=THREE.sRGBEncoding;
    texture.needsUpdate=true;
    return texture;
  }

  function studioEnvironment(scene){
    const palette=[
      ['#f4dfb2','#5e4320'],['#dec18a','#17120d'],['#91c8bd','#101815'],
      ['#d7aa58','#261b0d'],['#eee3cb','#2a2118'],['#6e9e95','#0b0d0c']
    ];
    const faces=palette.map(([a,b],i)=>{
      const c=document.createElement('canvas');c.width=c.height=256;
      const x=c.getContext('2d');const g=x.createRadialGradient(i%2?70:190,70,4,128,128,220);
      g.addColorStop(0,a);g.addColorStop(.35,b);g.addColorStop(1,'#050403');x.fillStyle=g;x.fillRect(0,0,256,256);
      const lg=x.createLinearGradient(0,0,256,256);lg.addColorStop(0,'rgba(255,255,255,.18)');lg.addColorStop(.48,'rgba(255,255,255,0)');lg.addColorStop(1,'rgba(217,169,76,.12)');x.fillStyle=lg;x.fillRect(0,0,256,256);
      return c;
    });
    const cube=new THREE.CubeTexture(faces);cube.encoding=THREE.sRGBEncoding;cube.needsUpdate=true;scene.environment=cube;return cube;
  }

  function makeContactShadow(size=1024){
    const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
    const g=x.createRadialGradient(size/2,size/2,size*.02,size/2,size/2,size*.49);
    g.addColorStop(0,'rgba(0,0,0,.64)');g.addColorStop(.35,'rgba(0,0,0,.34)');g.addColorStop(.72,'rgba(0,0,0,.09)');g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g;x.fillRect(0,0,size,size);return new THREE.CanvasTexture(c);
  }

  function addContactShadow(parent,renderer,radius=7,opacity=.46,y=.012){
    const tex=prepareTexture(makeContactShadow(compact?768:1024),renderer);
    const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity,depthWrite:false,toneMapped:false});
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2),mat);plane.rotation.x=-Math.PI/2;plane.position.y=y;plane.renderOrder=1;parent.add(plane);return plane;
  }

  function tuneShadow(light,size=shadowMapSize,extent=12){
    if(!light) return light;light.castShadow=true;light.shadow.mapSize.set(size,size);light.shadow.camera.left=-extent;light.shadow.camera.right=extent;light.shadow.camera.top=extent;light.shadow.camera.bottom=-extent;light.shadow.bias=-.00025;light.shadow.normalBias=.028;light.shadow.radius=3;return light;
  }

  function makeScreenTexture(label='BY MELI / LIVE PRODUCTION'){
    const c=document.createElement('canvas');c.width=compact?1280:2048;c.height=compact?720:1152;const x=c.getContext('2d');
    const sx=c.width/2048,sy=c.height/1152;x.scale(sx,sy);
    const bg=x.createLinearGradient(0,0,2048,1152);bg.addColorStop(0,'#061110');bg.addColorStop(.55,'#163632');bg.addColorStop(1,'#1b1208');x.fillStyle=bg;x.fillRect(0,0,2048,1152);
    const glow=x.createRadialGradient(1450,290,10,1450,290,920);glow.addColorStop(0,'rgba(112,214,195,.48)');glow.addColorStop(.55,'rgba(112,214,195,.08)');glow.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=glow;x.fillRect(0,0,2048,1152);
    x.strokeStyle='rgba(236,216,169,.13)';x.lineWidth=2;for(let i=0;i<=16;i++){x.beginPath();x.moveTo(i*128,0);x.lineTo(i*128,1152);x.stroke()}for(let i=0;i<=9;i++){x.beginPath();x.moveTo(0,i*128);x.lineTo(2048,i*128);x.stroke()}
    x.strokeStyle='rgba(232,197,117,.62)';x.lineWidth=5;x.strokeRect(74,74,1900,1004);
    x.fillStyle='#f6eedc';x.font='800 170px Inter,Arial,sans-serif';x.fillText('BY MELI',124,290);
    x.fillStyle='#d9ae56';x.font='600 48px IBM Plex Mono,monospace';x.fillText(label,132,390);
    x.fillStyle='rgba(246,238,220,.88)';x.font='500 58px Inter,Arial,sans-serif';x.fillText('DESIGN  /  BUILD  /  DELIVER',132,850);
    for(let i=0;i<22;i++){x.fillStyle=i%3===0?'rgba(217,174,86,.72)':'rgba(108,204,187,.58)';x.fillRect(132+i*72,940+(i%2)*24,42,9)}
    const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.needsUpdate=true;return tex;
  }

  window.BYMELI_QUALITY={compact,coarse,strong,pixelCap,shadowMapSize,configureRenderer,prepareTexture,studioEnvironment,addContactShadow,tuneShadow,makeScreenTexture};
})();
