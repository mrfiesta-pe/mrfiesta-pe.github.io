import { db } from './services/supabase.js';
import { APPS_SCRIPT_URL } from './core/config.js';

const $ = selector => document.querySelector(selector);
const slug = new URLSearchParams(location.search).get('galeria');
let spreads = [], currentSpread = 0, albumName = '';

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value || '';
  return node.innerHTML;
}

async function cargarAlbum() {
  if (!slug) return mostrarError('No encontramos el álbum solicitado.');
  try {
    const { data: galeria, error: galeriaError } = await db.from('galerias').select('*').eq('slug', slug).single();
    if (galeriaError || !galeria) throw new Error('Galería no disponible');
    albumName = galeria.client_name;
    document.title = `${albumName} · Álbum Mr. Fiesta`;

    const { data: seleccion, error: seleccionError } = await db.from('selecciones').select('foto_id').eq('galeria_id', galeria.id);
    if (seleccionError) throw seleccionError;
    const idsSeleccionados = new Set((seleccion || []).map(item => item.foto_id));
    if (!idsSeleccionados.size) return mostrarError('Este cliente todavía no ha enviado una selección.');

    const response = await fetch(`${APPS_SCRIPT_URL}?action=obtenerFotos&folderId=${encodeURIComponent(galeria.folder_id)}`);
    const resultado = await response.json();
    if (!resultado.success) throw new Error(resultado.error || 'No se pudieron cargar las fotografías');
    const fotos = (resultado.fotos || []).filter(foto => idsSeleccionados.has(foto.id));
    if (!fotos.length) return mostrarError('No hay fotografías disponibles para componer el álbum.');
    prepararSpreads(fotos);
    $('#album-loading').classList.add('hidden');
    $('#book').classList.remove('hidden');
    $('#album-controls').classList.remove('hidden');
    renderizarSpread();
  } catch (error) {
    console.error(error);
    mostrarError('No pudimos abrir este álbum de revisión.');
  }
}

function prepararSpreads(fotos) {
  spreads = [{ tipo: 'portada' }];
  for (let index = 0; index < fotos.length; index += 2) {
    spreads.push({ tipo: 'fotos', izquierda: fotos[index], derecha: fotos[index + 1] || null });
  }
  spreads.push({ tipo: 'final' });
}

function paginaFoto(foto, numero) {
  if (!foto) return `<section class="page page-title"><div><span class="page-kicker">MR. FIESTA · ÁLBUM</span></div><div><h2>El recuerdo continúa.</h2></div><span class="page-number">—</span></section>`;
  return `<section class="page image-page"><img src="${foto.url}" alt="Fotografía seleccionada ${numero}" draggable="false"></section>`;
}

function renderizarSpread() {
  const spread = spreads[currentSpread];
  const contenedor = $('#book-spread');
  contenedor.classList.remove('is-turning');
  void contenedor.offsetWidth;
  contenedor.classList.add('is-turning');

  if (spread.tipo === 'portada') {
    contenedor.innerHTML = `<section class="page page-title"><div><span class="page-kicker">MR. FIESTA · SELECCIÓN PRIVADA</span></div><div><h1>${escapeHtml(albumName)}</h1></div><span class="page-number">Álbum de revisión</span></section><section class="page page-title"><div><span class="page-kicker">UNA HISTORIA EN IMÁGENES</span></div><div><h2>Una selección creada para recordar lo que realmente importa.</h2></div><span class="page-number">01</span></section>`;
  } else if (spread.tipo === 'final') {
    contenedor.innerHTML = `<section class="page page-title"><div><span class="page-kicker">MR. FIESTA</span></div><div><h1>Fin.</h1></div><span class="page-number">Gracias por confiar tus recuerdos.</span></section><section class="page page-title"><div><span class="page-kicker">REVISIÓN DEL ESTUDIO</span></div><div><h2>Aprueba la selección cuando esté lista para su entrega.</h2></div><span class="page-number">Álbum compuesto digitalmente</span></section>`;
  } else {
    const base = (currentSpread - 1) * 2 + 1;
    contenedor.innerHTML = paginaFoto(spread.izquierda, base) + paginaFoto(spread.derecha, base + 1);
  }
  const paginaInicio = currentSpread * 2 + 1;
  $('#page-count').textContent = `${paginaInicio} — ${Math.min(paginaInicio + 1, spreads.length * 2)}`;
  $('#page-caption').textContent = spread.tipo === 'portada' ? 'Portada' : spread.tipo === 'final' ? 'Cierre' : 'Selección del cliente';
  $('#page-bar').style.width = `${((currentSpread + 1) / spreads.length) * 100}%`;
  $('#previous-page').disabled = currentSpread === 0;
  $('#next-page').disabled = currentSpread === spreads.length - 1;
}

function mover(paso) {
  const siguiente = currentSpread + paso;
  if (siguiente < 0 || siguiente >= spreads.length) return;
  currentSpread = siguiente;
  renderizarSpread();
}

function mostrarError(texto) {
  $('#album-loading').classList.add('hidden');
  $('#album-error').textContent = texto;
  $('#album-error').classList.remove('hidden');
}

$('#previous-page').addEventListener('click', () => mover(-1));
$('#next-page').addEventListener('click', () => mover(1));
document.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') mover(-1);
  if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); mover(1); }
});
$('#fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) $('#album-stage').requestFullscreen?.();
  else document.exitFullscreen?.();
});
let inicioX = 0;
$('#book').addEventListener('touchstart', event => { inicioX = event.changedTouches[0].screenX; }, { passive: true });
$('#book').addEventListener('touchend', event => {
  const diferencia = event.changedTouches[0].screenX - inicioX;
  if (Math.abs(diferencia) > 45) mover(diferencia < 0 ? 1 : -1);
}, { passive: true });
lucide.createIcons();
cargarAlbum();
