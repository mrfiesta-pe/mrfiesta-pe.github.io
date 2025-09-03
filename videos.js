
// Ruta RAW de GitHub (ya configurada)
const basePath = "https://raw.githubusercontent.com/aymred/MrFiestaWeb/main/media/";
const raw = (p) => basePath + encodeURIComponent(p).replace(/%2F/g,'/');

// Mapeo de videos por clave de servicio/paquete
window.MR_VIDEOS = {
  basico: [
    {url: raw("chicoteca basica 1.mp4"), label: "Básica 1", orientation: "vertical"},
    {url: raw("chicoteca basica 2.mp4"), label: "Básica 2", orientation: "vertical"},
    {url: raw("chicoteca basica 3.mp4"), label: "Básica 3", orientation: "vertical"}
  ],
  premiumLite: [
    {url: raw("Pista Led.mp4"), label: "Pista LED 2x2", orientation: "horizontal"}
  ],
  chicotecaCasa: [
    {url: raw("Chicoteca En Casa 1.mp4"), label: "En Casa 1", orientation: "vertical"},
    {url: raw("Chicoteca En Casa 2.mp4"), label: "En Casa 2", orientation: "vertical"},
    {url: raw("Chicoteca En Casa 4.mp4"), label: "En Casa 4", orientation: "vertical"}
  ],
  experienciaNeon: [
    {url: raw("Experiencia Neón1.mp4"), label: "Neón 1", orientation: "vertical"},
    {url: raw("Experiencia Neón2.mp4"), label: "Neón 2", orientation: "vertical"},
    {url: raw("Experiencia Neón3.mp4"), label: "Neón 3", orientation: "vertical"},
    {url: raw("Experiencia Neón4.mp4"), label: "Neón 4", orientation: "vertical"}
  ],
  ultraLed: [
    {url: raw("Chicoteca Ultra Led 4.mp4"), label: "Ultra LED 4", orientation: "vertical"},
    {url: raw("CHICOTECA ULTRA LED 5.mp4"), label: "Ultra LED 5", orientation: "vertical"},
    {url: raw("Chicoteca Ultra Led 6.mp4"), label: "Ultra LED 6", orientation: "vertical"},
    {url: raw("Chicoteca Ultra Led Provincia.mp4"), label: "Provincia", orientation: "vertical"}
  ],
  justDanceKaraoke: [
    {url: raw("Just Dance Y Karaoke 2.mp4"), label: "2 horas", orientation: "vertical"},
    {url: raw("Just Dance Y karaoke 4.mp4"), label: "4 horas", orientation: "vertical"},
    {url: raw("Just Dance Y Karaoke.mp4"), label: "General", orientation: "vertical"}
  ],
  horaLoca: [
    {url: raw("Hora loca/Hora Loca Bad Bunny Y Karol G.mp4"), label: "Bad Bunny & Karol G", orientation: "vertical"},
    {url: raw("Hora loca/Hora Loca Disco.mp4"), label: "Disco", orientation: "vertical"},
    {url: raw("Hora loca/Hora Loca Donde Estan Las Rubias.mp4"), label: "Las Rubias", orientation: "vertical"},
    {url: raw("Hora loca/Hora Loca Horizontal.mp4"), label: "Horizontal", orientation: "horizontal"},
    {url: raw("Hora loca/Hora Loca La Máscara.mp4"), label: "La Máscara", orientation: "vertical"},
    {url: raw("Hora loca/Mini Hora Loca.mp4"), label: "Mini Hora Loca", orientation: "vertical"},
    {url: raw("Hora loca/Stickman.mp4"), label: "Stickman", orientation: "vertical"}
  ],
  invitaciones: [
    {url: raw("invitaciones/Barbie(1).mp4"), label: "Barbie", orientation: "vertical"},
    {url: raw("invitaciones/Black Disco(1).mp4"), label: "Black Disco", orientation: "vertical"},
    {url: raw("invitaciones/Neón(1).mp4"), label: "Neón", orientation: "vertical"},
    {url: raw("invitaciones/Neón 2(1).mp4"), label: "Neón 2", orientation: "vertical"},
    {url: raw("invitaciones/Tiktok.mp4"), label: "TikTok", orientation: "vertical"},
    {url: raw("invitaciones/Youtube.mp4"), label: "YouTube", orientation: "vertical"}
  ],
  animacionLogo: [
    {url: raw("Animación logo/Logo Mr Fiesta 1.mp4"), label: "Logo 1", orientation: "vertical"},
    {url: raw("Animación logo/Logo Mr Fiesta 2.mp4"), label: "Logo 2", orientation: "vertical"},
    {url: raw("Animación logo/Logo Mr Fiesta 3.mp4"), label: "Logo 3", orientation: "vertical"},
    {url: raw("Animación logo/Logo Mr Fiesta 4.mp4"), label: "Logo 4", orientation: "vertical"}
  ]
};

// Renderiza cualquier <div class="video-grid" data-videos="clave">
function renderVideos(){
  document.querySelectorAll('[data-videos]').forEach(container => {
    const key = container.getAttribute('data-videos');
    const items = (window.MR_VIDEOS && window.MR_VIDEOS[key]) || [];
    items.forEach(v => {
      const card = document.createElement('div');
      card.className = 'video-card ' + ((v.orientation === 'horizontal')?'horizontal':'vertical');
      const vid = document.createElement('video');
      vid.setAttribute('playsinline','');
      vid.setAttribute('controls','');
      vid.setAttribute('preload','metadata');
      vid.src = v.url;
      const meta = document.createElement('div');
      meta.className='video-meta';
      meta.textContent = v.label || '';
      card.appendChild(vid);
      card.appendChild(meta);
      container.appendChild(card);
    });
  });
}
document.addEventListener('DOMContentLoaded', renderVideos);

// Toggle de cualquier .toggle
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.toggle');
  if(!btn) return;
  const target = document.querySelector(btn.dataset.target);
  if(target) target.classList.toggle('hidden');
});
