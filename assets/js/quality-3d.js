(function(){
  'use strict';
  if(!window.THREE) return;

  function studioTexture(){
    const c=document.createElement('canvas');
    c.width=1024;c.height=512;
    const x=c.getContext('2d');
    const bg=x.createLinearGradient(0,0,0,c.height);
    bg.addColorStop(0,'#17130f');bg.addColorStop(.46,'#5f4b2d');bg.addColorStop(.54,'#2a2118');bg.addColorStop(1,'#080706');
    x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);

    // Large softboxes and warm/cool rim sources create clean highlights on metals and glass.
    const panels=[
      [105,54,155,330,'rgba(255,244,214,.95)'],
      [758,44,128,350,'rgba(238,211,155,.86)'],
      [432,70,92,270,'rgba(157,222,211,.58)']
    ];
    panels.forEach(([px,py,pw,ph,col])=>{
      const g=x.createRadialGradient(px+pw/2,py+ph/2,4,px+pw/2,py+ph/2,Math.max(pw,ph)*.72);
      g.addColorStop(0,col);g.addColorStop(.42,col.replace(/\.[0-9]+\)/,'.34)'));g.addColorStop(1,'rgba(0,0,0,0)');
      x.fillStyle=g;x.fillRect(px-pw,py-ph*.35,pw*3,ph*1.7);
    });
    const horizon=x.createLinearGradient(0,200,0,340);
    horizon.addColorStop(0,'rgba(255,224,163,0)');horizon.addColorStop(.5,'rgba(255,224,163,.27)');horizon.addColorStop(1,'rgba(255,224,163,0)');
    x.fillStyle=horizon;x.fillRect(0,170,c.width,210);

    const texture=new THREE.CanvasTexture(c);
    texture.mapping=THREE.EquirectangularReflectionMapping;
    texture.encoding=THREE.sRGBEncoding;
    texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;
    texture.needsUpdate=true;
    return texture;
  }

  function apply(renderer,scene,options){
    options=options||{};
    renderer.outputEncoding=THREE.sRGBEncoding;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=options.exposure||1.06;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.sortObjects=true;
    const environment=studioTexture();
    scene.environment=environment;
    scene.userData.byMeliStudioEnvironment=environment;
  }

  function pixelRatio(width,height,isMobile){
    const maxRatio=isMobile?2:2.15;
    const maxPixels=isMobile?2300000:5000000;
    return Math.max(1,Math.min(window.devicePixelRatio||1,maxRatio,Math.sqrt(maxPixels/Math.max(1,width*height))));
  }

  window.ByMeli3DQuality={apply,pixelRatio};
})();
