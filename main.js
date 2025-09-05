document.addEventListener('DOMContentLoaded',()=>{
  // Burger menu
  const burger=document.getElementById('burger');
  const nav=document.getElementById('nav');
  if(burger&&nav){
    burger.addEventListener('click',()=>{
      const open=nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Hero video rotation on scroll
  const heroVideo=document.getElementById('hero-video');
  const logoVideos=[
    "https://aymred.github.io/MrFiestaWeb/media/Animaci%C3%B3n%20logo/Logo%20Mr%20Fiesta%201.mp4",
    "https://aymred.github.io/MrFiestaWeb/media/Animaci%C3%B3n%20logo/Logo%20Mr%20Fiesta%202.mp4",
    "https://aymred.github.io/MrFiestaWeb/media/Animaci%C3%B3n%20logo/Logo%20Mr%20Fiesta%203.mp4",
    "https://aymred.github.io/MrFiestaWeb/media/Animaci%C3%B3n%20logo/Logo%20Mr%20Fiesta%204.mp4"
  ];
  let idx=0,lastY=0;
  window.addEventListener('scroll',()=>{
    const y=window.pageYOffset||document.documentElement.scrollTop;
    if(y>lastY){
      const bottom=heroVideo.getBoundingClientRect().bottom;
      if(bottom<=0){ idx=(idx+1)%logoVideos.length; heroVideo.src=logoVideos[idx]; heroVideo.load(); }
    }else if(y<lastY){
      const top=heroVideo.getBoundingClientRect().top;
      if(top>0 && y===0){ idx=0; heroVideo.src=logoVideos[idx]; heroVideo.load(); }
    }
    lastY = y<=0 ? 0 : y;
  });

  // Smart play/pause for gallery videos
  const vids=document.querySelectorAll('#gallery video');
  const io=new IntersectionObserver(entries=>{
    entries.forEach(({isIntersecting,target})=>{
      if(isIntersecting){ target.play?.(); } else { target.pause?.(); }
    });
  },{threshold:.25});
  vids.forEach(v=>io.observe(v));
});