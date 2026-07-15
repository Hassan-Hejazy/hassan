(function(){
  'use strict';
  const root=document.documentElement;
  const clamp=v=>Math.max(0,Math.min(1,v));
  let language=(new URLSearchParams(location.search).get('lang')||localStorage.getItem('bymeli-language')||'en')==='ar'?'ar':'en';

  const preloader=document.getElementById('preloader');
  const preloaderBar=document.getElementById('preloaderBar');
  const preloaderPercent=document.getElementById('preloaderPercent');
  let preloadValue=0;
  let preloadTarget=86;
  let preloadFinished=false;
  let preloadLast=performance.now();

  function paintPreloader(){
    if(preloaderBar) preloaderBar.style.transform=`scaleX(${Math.min(1,preloadValue/100).toFixed(4)})`;
    if(preloaderPercent) preloaderPercent.textContent=String(Math.round(preloadValue)).padStart(2,'0');
  }

  function animatePreloader(now){
    const delta=Math.min(48,now-preloadLast);
    preloadLast=now;
    const distance=preloadTarget-preloadValue;
    preloadValue+=distance*Math.min(.12,delta*.0036);
    if(distance>1.2) preloadValue+=delta*.012;
    preloadValue=Math.min(preloadTarget,preloadValue);
    paintPreloader();
    if(!preloadFinished || preloadValue<99.8) requestAnimationFrame(animatePreloader);
  }

  function finishPreloader(){
    if(preloadFinished) return;
    preloadFinished=true;
    preloadTarget=100;
    const reveal=()=>{
      if(preloadValue<99.4){requestAnimationFrame(reveal);return;}
      preloadValue=100;
      paintPreloader();
      setTimeout(()=>{
        preloader?.classList.add('done');
        document.body.classList.add('site-ready');
      },180);
    };
    requestAnimationFrame(reveal);
  }

  paintPreloader();
  requestAnimationFrame(animatePreloader);
  window.addEventListener('load',finishPreloader,{once:true});
  setTimeout(finishPreloader,3200);

  const header=document.getElementById('siteHeader');
  const menuToggle=document.getElementById('menuToggle');
  const mobileNav=document.getElementById('mobileNav');
  const mobileMenuClose=document.getElementById('mobileMenuClose');
  const megaTrigger=document.getElementById('megaTrigger');
  const megaMenu=document.getElementById('megaMenu');
  const langToggle=document.getElementById('langToggle');
  const translatable=Array.from(document.querySelectorAll('[data-en][data-ar]'));

  function setLanguage(lang){
    language=lang;
    localStorage.setItem('bymeli-language',lang);
    root.lang=lang;root.dir=lang==='ar'?'rtl':'ltr';
    translatable.forEach(el=>{const value=el.getAttribute(`data-${lang}`);if(value!==null)el.textContent=value});
    document.querySelectorAll('.wecan-cutout-text,.wecan-edge,.wecan-solid-text').forEach(el=>el.setAttribute('textLength',lang==='ar'?'980':'1230'));
    langToggle.textContent=lang==='en'?'AR':'EN';
    updateBuildCopy(true);
    renderPortfolio(activeFilter);
    document.dispatchEvent(new CustomEvent('languagechange',{detail:{lang}}));
  }
  langToggle.addEventListener('click',()=>setLanguage(language==='en'?'ar':'en'));

  let megaCloseTimer=0;
  function toggleMega(force){
    if(!megaMenu||!megaTrigger)return;
    const open=typeof force==='boolean'?force:!megaMenu.classList.contains('open');
    megaMenu.classList.toggle('open',open);
    header.classList.toggle('mega-open',open);
    megaTrigger.setAttribute('aria-expanded',open?'true':'false');
    megaMenu.setAttribute('aria-hidden',open?'false':'true');
  }
  function scheduleMegaClose(){clearTimeout(megaCloseTimer);megaCloseTimer=setTimeout(()=>toggleMega(false),160)}
  if(megaTrigger&&megaMenu){
    megaTrigger.addEventListener('click',e=>{e.stopPropagation();toggleMega()});
    megaTrigger.addEventListener('mouseenter',()=>{clearTimeout(megaCloseTimer);if(innerWidth>1020)toggleMega(true)});
    megaMenu.addEventListener('mouseenter',()=>clearTimeout(megaCloseTimer));
    megaTrigger.addEventListener('mouseleave',scheduleMegaClose);
    megaMenu.addEventListener('mouseleave',scheduleMegaClose);
    megaMenu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>toggleMega(false)));
  }

  function toggleMenu(force){
    const open=typeof force==='boolean'?force:!mobileNav.classList.contains('open');
    mobileNav.classList.toggle('open',open);
    menuToggle.classList.toggle('open',open);
    menuToggle.setAttribute('aria-expanded',open?'true':'false');
    mobileNav.setAttribute('aria-hidden',open?'false':'true');
    document.body.classList.toggle('lock',open);
    if(open)toggleMega(false);
  }
  menuToggle.addEventListener('click',()=>toggleMenu());
  mobileMenuClose?.addEventListener('click',()=>toggleMenu(false));
  mobileNav.addEventListener('click',e=>{if(e.target===mobileNav)toggleMenu(false)});
  mobileNav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>toggleMenu(false)));
  document.addEventListener('click',e=>{if(megaMenu?.classList.contains('open')&&!header.contains(e.target))toggleMega(false)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){toggleMega(false);if(mobileNav.classList.contains('open'))toggleMenu(false)}});


  function scrollToHash(hash){
    const id=(hash||'').replace(/^.*#/,'');
    if(!id)return;
    const target=document.getElementById(id);
    if(!target)return;
    const headerOffset=(document.querySelector('.premium-header-shell')?.getBoundingClientRect().height||78)+18;
    const top=window.pageYOffset+target.getBoundingClientRect().top-headerOffset;
    window.scrollTo({top,behavior:'smooth'});
  }
  document.querySelectorAll('a[href*="#"]').forEach(link=>{
    link.addEventListener('click',e=>{
      const href=link.getAttribute('href')||'';
      if(!href.includes('#'))return;
      const url=new URL(href,window.location.href);
      if(url.pathname.replace(/\/$/,'')!==window.location.pathname.replace(/\/$/,'')) return;
      if(!url.hash) return;
      const target=document.getElementById(url.hash.slice(1));
      if(!target) return;
      e.preventDefault();
      history.replaceState(null,'',url.hash);
      scrollToHash(url.hash);
      toggleMega(false);
      if(mobileNav?.classList.contains('open'))toggleMenu(false);
    },{passive:false});
  });
  if(window.location.hash){window.addEventListener('load',()=>setTimeout(()=>scrollToHash(window.location.hash),220),{once:true});}

  const heroSlides=Array.from(document.querySelectorAll('.hero-slide'));let heroIndex=0;
  setInterval(()=>{if(!heroSlides.length)return;heroSlides[heroIndex].classList.remove('active');heroIndex=(heroIndex+1)%heroSlides.length;heroSlides[heroIndex].classList.add('active')},4600);

  const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in');revealObserver.unobserve(entry.target)}}),{threshold:.12,rootMargin:'0px 0px -40px'});
  document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));

  const scrollProgressBar=document.getElementById('siteScrollProgress');
  const heroBg=document.querySelector('.hero-bg');
  let motionRows=Array.from(document.querySelectorAll('.service-row'));
  let motionCards=[];
  const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function refreshMotionTargets(){motionRows=Array.from(document.querySelectorAll('.service-row'));motionCards=Array.from(document.querySelectorAll('.portfolio-card'))}
  function updateMotion(){
    const pageMax=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    if(scrollProgressBar)scrollProgressBar.style.transform=`scaleX(${clamp(scrollY/pageMax).toFixed(4)})`;
    if(reducedMotion)return;
    if(heroBg){const y=Math.min(82,scrollY*.105);heroBg.style.transform=`translate3d(0,${y.toFixed(1)}px,0) scale(1.055)`;}
    motionRows.forEach((row,i)=>{const r=row.getBoundingClientRect(),center=r.top+r.height*.5,ratio=clamp((center-innerHeight*.15)/(innerHeight*.85));const shift=(ratio-.5)*(i%2?12:-12);row.style.setProperty('--row-shift',`${shift.toFixed(2)}px`)});
    motionCards.forEach((card,i)=>{const r=card.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;const ratio=clamp((r.top+r.height*.5)/innerHeight);card.style.setProperty('--card-parallax',`${((ratio-.5)*(i%3===0?12:8)).toFixed(2)}px`)});
  }
  const sectionLinks=Array.from(document.querySelectorAll('.premium-nav a[href*="#"],.mega-trigger'));
  const sectionMap={manufacturing:'index.html#manufacturing',services:'mega',connected:'index.html#connected',portfolio:'index.html#portfolio'};
  const activeObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;sectionLinks.forEach(link=>link.classList.remove('active'));const key=sectionMap[entry.target.id];if(key==='mega')megaTrigger?.classList.add('active');else document.querySelector(`.premium-nav a[href="${key}"]`)?.classList.add('active')}),{rootMargin:'-38% 0px -52% 0px',threshold:0});
  ['manufacturing','services','connected','portfolio'].forEach(id=>{const el=document.getElementById(id);if(el)activeObserver.observe(el)});

  const buildTrack=document.getElementById('buildTrack');
  const buildCanvas=document.getElementById('buildCanvas');
  const buildTitle=document.getElementById('buildTitle');
  const buildBody=document.getElementById('buildBody');
  const buildCounter=document.getElementById('buildCounter');
  const buildRail=Array.from(document.querySelectorAll('#buildRail span'));
  let buildProgress=0,buildStage=-1,buildReady=false;
  const buildCopy={
    en:[
      ['Site & Footprint','The exact footprint, service points and circulation lines are mapped before the first structural element is installed.'],
      ['Steel Structure','Columns, trusses and bracing rise into the structural frame that carries every wall, sign, screen and lighting point.'],
      ['Cladding, Graphics & Wallpaper','Wall panels, printed graphics and branded wall coverings are fixed into place to give the booth its final architectural identity.'],
      ['Lighting, Screens & AV','Lighting, rented display screens and technical systems are integrated, tested and tuned for the visitor experience.'],
      ['Furniture, Gifts & Handover','Furniture, styling items, branded gifts and final detailing complete the stand before testing, cleaning and handover.']
    ],
    ar:[
      ['الموقع وتحديد المساحة','نحدّد أبعاد المساحة ونقاط الخدمات ومسارات الحركة بدقة قبل تركيب أول عنصر إنشائي.'],
      ['الهيكل الإنشائي','ترتفع الأعمدة والجسور والتدعيمات لتشكيل الهيكل الذي يحمل الجدران واللافتات والشاشات ونقاط الإضاءة.'],
      ['التكسية والجرافيكس وورق الجدران','نثبت ألواح الجدران والجرافيكس المطبوعة وورق الجدران المخصص لتظهر الهوية النهائية للجناح بصورة واضحة ومهنية.'],
      ['الإضاءة والشاشات والأنظمة التقنية','ندمج الإضاءة والشاشات المؤجرة والأنظمة التقنية، ثم نشغّلها ونختبرها ونضبطها بما يخدم تجربة الزائر.'],
      ['الأثاث والهدايا والتسليم','نضيف الأثاث والتنسيق والهدايا الدعائية والتفاصيل النهائية، ثم نختبر الجناح وننظفه ونسلّمه جاهزاً للاستقبال.']
    ]
  };

  function initBuild(){
    if(window.THREE&&window.BuildScene&&buildCanvas){
      buildReady=window.BuildScene.init(buildCanvas);
      if(buildReady)buildCanvas.parentElement.classList.add('model-active');
    }
  }
  function updateBuildCopy(force=false){
    const stage=Math.min(4,Math.floor(buildProgress*5));
    if(stage===buildStage&&!force)return;buildStage=stage;
    const item=buildCopy[language][stage];buildTitle.textContent=item[0];buildBody.textContent=item[1];buildCounter.textContent=String(stage+1).padStart(2,'0')+' / 05';buildRail.forEach((x,i)=>x.classList.toggle('active',i===stage));
  }
  function updateBuild(){
    if(!buildTrack)return;const r=buildTrack.getBoundingClientRect(),span=Math.max(1,r.height-innerHeight);buildProgress=clamp(-r.top/span);if(buildReady)window.BuildScene.update(buildProgress);updateBuildCopy();
  }

  const portfolioData=[
    {img:'assets/img/av-console.jpg',cat:'production',en:'AV Control',ar:'غرفة التحكم الفني',bodyEn:'Technical control, cueing and live media operation behind the event experience.',bodyAr:'التحكم الفني وإدارة الإشارات وتشغيل الوسائط الحية خلف تجربة الفعالية.'},
    {img:'assets/img/av-stage.jpg',cat:'production',en:'Stage Experience',ar:'تجهيز المسرح',bodyEn:'Stage, LED, lighting and audience energy aligned within one live production environment.',bodyAr:'يتكامل المسرح وشاشات LED والإضاءة وتفاعل الجمهور داخل منظومة إنتاج حي واحدة.'},
    {img:'assets/img/booth-build-1.jpg',cat:'stands',en:'Custom Booth Build',ar:'تنفيذ جناح مخصص',bodyEn:'A custom exhibition environment combining structure, brand visibility and visitor function.',bodyAr:'جناح مخصص يجمع بين الهيكل ووضوح العلامة وتجربة الزائر.'},
    {img:'assets/img/booth-build-2.jpg',cat:'stands',en:'Pavilion Delivery',ar:'تنفيذ جناح',bodyEn:'A completed pavilion with clear display, hospitality and circulation zones.',bodyAr:'جناح مكتمل يضم مناطق واضحة للعرض والضيافة ومسارات الحركة.'},
    {img:'assets/img/crowd.jpg',cat:'events',en:'Guest Flow',ar:'حركة الضيوف',bodyEn:'High-footfall guest movement managed through controlled entry and floor operations.',bodyAr:'إدارة حركة أعداد كبيرة من الضيوف من خلال دخول منظم وتشغيل ميداني دقيق.'},
    {img:'assets/img/decor-lounge.jpg',cat:'interiors',en:'Event Lounge',ar:'صالة ضيافة',bodyEn:'A guest-facing lounge composed around comfort, hospitality and visual warmth.',bodyAr:'صالة ضيافة مصممة حول الراحة وحسن الاستقبال ودفء التفاصيل.'},
    {img:'assets/img/decor-office.jpg',cat:'interiors',en:'Branded Interior',ar:'مساحة داخلية للعلامة',bodyEn:'An interior environment where materials, furniture and brand tone work as one system.',bodyAr:'مساحة داخلية تتكامل فيها المواد والأثاث وهوية العلامة ضمن تصميم واحد.'},
    {img:'assets/img/hero-lounge.jpg',cat:'events',en:'Hospitality Arrival',ar:'استقبال الضيافة',bodyEn:'A refined arrival and reception moment supporting the wider event identity.',bodyAr:'تجربة وصول واستقبال راقية تعكس هوية الفعالية منذ اللحظة الأولى.'},
    {img:'assets/img/pm-outdoor.jpg',cat:'production',en:'Project Operations',ar:'إدارة عمليات المشروع',bodyEn:'The coordination environment connecting teams, logistics and on-site delivery.',bodyAr:'منظومة تنسيق تربط فرق العمل واللوجستيات والتنفيذ في الموقع.'},
    {img:'assets/img/pm-stage.jpg',cat:'production',en:'Stage Coordination',ar:'تنسيق المسرح',bodyEn:'Production planning and stage readiness developed around the live program.',bodyAr:'تخطيط الإنتاج وتجهيز المسرح وفق متطلبات البرنامج الحي.'},
    {img:'assets/img/port-catalonia.jpg',cat:'interiors',en:'Executive Brand Space',ar:'مساحة راقية للعلامة',bodyEn:'A premium brand environment balancing reception, privacy and material quality.',bodyAr:'مساحة راقية توازن بين الاستقبال والخصوصية وجودة المواد.'},
    {img:'assets/img/port-chandelier.jpg',cat:'interiors',en:'Executive Reception',ar:'استقبال تنفيذي',bodyEn:'Lighting, finishes and proportion create a polished executive arrival.',bodyAr:'تصنع الإضاءة والتشطيبات المدروسة تجربة استقبال تنفيذية متكاملة.'},
    {img:'assets/img/port-jaawdah.jpg',cat:'stands',en:'Jaawdah Pavilion',ar:'جناح جودة',bodyEn:'A bold branded pavilion built around strong visibility and product communication.',bodyAr:'جناح بهوية قوية يضمن وضوح العلامة وسهولة تقديم المنتجات.'},
    {img:'assets/img/port-jewelry.jpg',cat:'showrooms',en:'Jewellery Display',ar:'عرض مجوهرات',bodyEn:'A refined retail display environment for premium product presentation.',bodyAr:'بيئة عرض راقية صُممت لإبراز المنتجات الفاخرة بأفضل صورة.'},
    {img:'assets/img/port-mawaduna.jpg',cat:'stands',en:'Mawaduna Brand Space',ar:'مساحة موادنا',bodyEn:'An immersive pavilion layout organizing product categories and visitor movement.',bodyAr:'تخطيط متكامل للجناح ينظم فئات المنتجات ومسارات الزوار.'},
    {img:'assets/img/port-render.jpg',cat:'production',en:'3D Concept Development',ar:'تطوير التصور ثلاثي الأبعاد',bodyEn:'Pre-production visualization aligning spatial strategy, design and technical planning.',bodyAr:'تصور قبل التنفيذ يربط التخطيط المكاني بالتصميم والمتطلبات التقنية.'},
    {img:'assets/img/port-samer.jpg',cat:'interiors',en:'VIP Lounge',ar:'صالة كبار الشخصيات',bodyEn:'A quieter hospitality setting using premium material and controlled lighting.',bodyAr:'صالة ضيافة هادئة بمواد راقية وإضاءة مدروسة.'},
    {img:'assets/img/port-samer2.jpg',cat:'events',en:'Luxury Installation',ar:'تنفيذ فاخر',bodyEn:'A large immersive environment where architecture, lighting and visitor emotion align.',bodyAr:'بيئة غامرة تتكامل فيها العمارة والإضاءة وتجربة الزائر.'},
    {img:'assets/img/port-stand1.jpg',cat:'stands',en:'Feature Architecture',ar:'عنصر معماري مميز',bodyEn:'A strong architectural feature designed for recall, visibility and hall presence.',bodyAr:'عنصر معماري واضح ومميز يعزز حضور العلامة داخل القاعة.'},
    {img:'assets/img/port-stand2.jpg',cat:'showrooms',en:'Branded Display Corridor',ar:'ممر عرض للعلامة',bodyEn:'A guided branded pathway balancing product rhythm and spatial navigation.',bodyAr:'مسار عرض موجه يوازن بين ترتيب المنتجات وسهولة التنقل.'},
    {img:'assets/img/showroom-1.jpg',cat:'showrooms',en:'Showroom Identity',ar:'هوية صالة عرض',bodyEn:'A showroom using a strong visual identity to organize product and customer movement.',bodyAr:'صالة عرض بهوية بصرية واضحة تنظم المنتجات ومسارات العملاء.'},
    {img:'assets/img/showroom-2.jpg',cat:'showrooms',en:'Feature Display Wall',ar:'جدار عرض مميز',bodyEn:'A focused display wall integrated into a wider retail environment.',bodyAr:'جدار عرض رئيسي متكامل مع بيئة صالة العرض.'},
    {img:'assets/img/showroom-3.jpg',cat:'showrooms',en:'Showroom Journey',ar:'رحلة صالة العرض',bodyEn:'A wider spatial composition connecting walls, product zones and circulation.',bodyAr:'تكوين مكاني يربط الجدران ومناطق المنتجات ومسارات الحركة.'}
  ];
  const curatedRemovals=new Set(['assets/img/av-console.jpg','assets/img/av-stage.jpg','assets/img/crowd.jpg','assets/img/port-jewelry.jpg']);
  const galleryData=portfolioData.filter(item=>!curatedRemovals.has(item.img));
  const catLabel={en:{stands:'Stands',showrooms:'Showrooms',events:'Events',interiors:'Interiors',production:'Production'},ar:{stands:'الأجنحة',showrooms:'صالات العرض',events:'الفعاليات',interiors:'الديكورات',production:'الإنتاج'}};
  const grid=document.getElementById('portfolioGrid');const filters=Array.from(document.querySelectorAll('#portfolioFilters button'));let activeFilter='all';let visibleItems=[];let lightboxIndex=0;
  function cardClass(i){if(i%9===0||i%9===6)return'wide';if(i%7===4)return'tall';return''}
  function renderPortfolio(filter='all'){
    activeFilter=filter;visibleItems=galleryData.filter(x=>filter==='all'||x.cat===filter);
    grid.innerHTML=visibleItems.map((item,i)=>`<article class="portfolio-card ${cardClass(i)}" data-index="${i}" tabindex="0" role="button" aria-label="${language==='ar'?item.ar:item.en}"><div class="portfolio-image-wrap"><img src="${item.img}" data-original-src="${item.img}" alt="${language==='ar'?item.ar:item.en}" loading="eager" decoding="async"></div><div class="portfolio-meta"><span>${String(i+1).padStart(2,'0')} / ${catLabel[language][item.cat]}</span><h3>${language==='ar'?item.ar:item.en}</h3></div></article>`).join('');
    grid.querySelectorAll('.portfolio-card').forEach(card=>{
      const image=card.querySelector('img');
      image.addEventListener('load',()=>card.classList.add('image-ready'),{once:true});
      image.addEventListener('error',()=>{
        card.classList.add('image-error');
        if(!image.dataset.fallbackApplied){image.dataset.fallbackApplied='true';image.src='assets/img/hero-lounge.jpg';}
      });
      if(image.complete&&image.naturalWidth>0)card.classList.add('image-ready');
      const open=()=>openLightbox(Number(card.dataset.index));
      card.addEventListener('click',open);
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
    });
    refreshMotionTargets();
    updateMotion();
  }
  filters.forEach(btn=>btn.addEventListener('click',()=>{filters.forEach(b=>b.classList.toggle('active',b===btn));renderPortfolio(btn.dataset.filter)}));

  const lightbox=document.getElementById('lightbox'),lbImage=document.getElementById('lightboxImage'),lbCategory=document.getElementById('lightboxCategory'),lbTitle=document.getElementById('lightboxTitle'),lbBody=document.getElementById('lightboxBody'),lbCount=document.getElementById('lightboxCount');
  function updateLightbox(){const item=visibleItems[lightboxIndex];if(!item)return;lbImage.onerror=()=>{lbImage.onerror=null;lbImage.src='assets/img/hero-lounge.jpg'};lbImage.src=item.img;lbImage.alt=language==='ar'?item.ar:item.en;lbCategory.textContent=catLabel[language][item.cat];lbTitle.textContent=language==='ar'?item.ar:item.en;lbBody.textContent=language==='ar'?item.bodyAr:item.bodyEn;lbCount.textContent=String(lightboxIndex+1).padStart(2,'0')+' / '+String(visibleItems.length).padStart(2,'0')}
  function openLightbox(i){lightboxIndex=i;updateLightbox();lightbox.classList.add('open');lightbox.setAttribute('aria-hidden','false');document.body.classList.add('lock')}
  function closeLightbox(){lightbox.classList.remove('open');lightbox.setAttribute('aria-hidden','true');document.body.classList.remove('lock')}
  function stepLightbox(delta){lightboxIndex=(lightboxIndex+delta+visibleItems.length)%visibleItems.length;updateLightbox()}
  document.getElementById('lightboxClose').addEventListener('click',closeLightbox);document.getElementById('lightboxPrev').addEventListener('click',()=>stepLightbox(-1));document.getElementById('lightboxNext').addEventListener('click',()=>stepLightbox(1));lightbox.addEventListener('click',e=>{if(e.target===lightbox)closeLightbox()});window.addEventListener('keydown',e=>{if(!lightbox.classList.contains('open'))return;if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')stepLightbox(language==='ar'?1:-1);if(e.key==='ArrowRight')stepLightbox(language==='ar'?-1:1)});
  let swipeStart=0;lightbox.addEventListener('touchstart',e=>{swipeStart=e.touches[0].clientX},{passive:true});lightbox.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-swipeStart;if(Math.abs(dx)>55)stepLightbox(dx>0?-1:1)},{passive:true});

  const wecanTrack=document.getElementById('wecanTrack');
  const range=(value,start,end)=>clamp((value-start)/(end-start));
  const smoothstep=value=>value*value*(3-2*value);
  function updateWecan(){
    if(!wecanTrack)return;
    const r=wecanTrack.getBoundingClientRect(),span=Math.max(1,r.height-innerHeight),p=clamp(-r.top/span);
    root.style.setProperty('--wecan-p',p.toFixed(4));

    // Stage 1: solid white WE CAN. Stage 2: the white fill dissolves and
    // the image becomes visible through the letter portal. Stage 3: the
    // portal expands to full frame and reveals the final project statement.
    const solidFade=smoothstep(range(p,.045,.225));
    const portalReveal=smoothstep(range(p,.12,.39));
    const maskExpansion=smoothstep(range(p,.27,.73));
    const maskScale=1+maskExpansion*9.7;
    const maskOpacity=1-smoothstep(range(p,.70,.84));
    const outlineIn=smoothstep(range(p,.12,.24));
    const outlineOut=1-smoothstep(range(p,.49,.73));
    const finalOpacity=smoothstep(range(p,.77,.95));
    const openingOpacity=1-smoothstep(range(p,.12,.31));
    const hintOpacity=(1-smoothstep(range(p,.10,.27)))*.76;
    const imageOpacity=.84+portalReveal*.16;
    const imageScale=1.13-smoothstep(range(p,.12,.78))*.13;
    const imageY=(1-portalReveal)*1.6-smoothstep(range(p,.38,.82))*.65;

    root.style.setProperty('--wecan-solid-opacity',(1-solidFade).toFixed(4));
    root.style.setProperty('--wecan-solid-scale',(1+solidFade*.055).toFixed(4));
    root.style.setProperty('--wecan-solid-blur',(solidFade*4.5).toFixed(2)+'px');
    root.style.setProperty('--wecan-reveal-progress',portalReveal.toFixed(4));
    root.style.setProperty('--wecan-image-opacity',imageOpacity.toFixed(4));
    root.style.setProperty('--wecan-image-scale',imageScale.toFixed(4));
    root.style.setProperty('--wecan-image-y',imageY.toFixed(3)+'%');
    root.style.setProperty('--wecan-mask-scale',maskScale.toFixed(4));
    root.style.setProperty('--wecan-mask-opacity',maskOpacity.toFixed(4));
    root.style.setProperty('--wecan-outline-opacity',(outlineIn*outlineOut*.82).toFixed(4));
    root.style.setProperty('--wecan-opening-opacity',openingOpacity.toFixed(4));
    root.style.setProperty('--wecan-final-opacity',finalOpacity.toFixed(4));
    root.style.setProperty('--wecan-final-y',((1-finalOpacity)*44).toFixed(2)+'px');
    root.style.setProperty('--wecan-final-rotate',((1-finalOpacity)*7).toFixed(2)+'deg');
    root.style.setProperty('--wecan-hint-opacity',hintOpacity.toFixed(4));
  }
  document.addEventListener('languagechange',updateWecan);

  const form=document.getElementById('contactForm'),formStatus=document.getElementById('formStatus');
  form.addEventListener('submit',e=>{e.preventDefault();const d=new FormData(form),name=String(d.get('name')||'').trim(),company=String(d.get('company')||'').trim(),email=String(d.get('email')||'').trim(),phone=String(d.get('phone')||'').trim(),message=String(d.get('message')||'').trim();if(!name||!email||!message){formStatus.textContent=language==='ar'?'فضلاً، عبّئ الاسم والبريد الإلكتروني ونبذة المشروع.':'Please complete the name, email and project brief.';return}const lines=language==='ar'?['السلام عليكم فريق باي ملي،',`الاسم: ${name}`,company?`الشركة: ${company}`:null,`البريد الإلكتروني: ${email}`,phone?`الهاتف: ${phone}`:null,`تفاصيل المشروع: ${message}`].filter(Boolean):['Hello By Meli,',`Name: ${name}`,company?`Company: ${company}`:null,`Email: ${email}`,phone?`Phone: ${phone}`:null,`Project brief: ${message}`].filter(Boolean);formStatus.textContent=language==='ar'?'جارٍ فتح واتساب...':'Opening WhatsApp...';window.open(`https://wa.me/966599699226?text=${encodeURIComponent(lines.join('\n'))}`,'_blank','noopener')});

  let scrollTicking=false;
  function updateScroll(){header.classList.toggle('scrolled',scrollY>18);updateBuild();updateWecan();if(!scrollTicking){scrollTicking=true;requestAnimationFrame(()=>{updateMotion();scrollTicking=false})}}
  addEventListener('scroll',updateScroll,{passive:true});addEventListener('resize',()=>{refreshMotionTargets();updateBuild();updateWecan();updateMotion()});
  document.getElementById('year').textContent=new Date().getFullYear();
  renderPortfolio('all');setLanguage(language);
  setTimeout(initBuild,50);updateScroll();
})();
