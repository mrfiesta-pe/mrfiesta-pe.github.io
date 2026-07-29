import { db as _supabase } from './services/supabase.js';
import { APPS_SCRIPT_URL } from './core/config.js';

let listaClientesGlobal = [];
let seleccionesPorGaleria = {};
const $ = selector => document.querySelector(selector);

function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value ?? ''; return node.innerHTML; }
function toast(texto) { const item = document.createElement('div'); item.className = 'toast'; item.textContent = texto; $('#toast-stack').append(item); setTimeout(() => item.remove(), 3600); }

async function cargarClientes() {
  const [{ data, error }, { data: selecciones }] = await Promise.all([
    _supabase.from('galerias').select('*').order('id', { ascending: false }),
    _supabase.from('selecciones').select('galeria_id')
  ]);
  if (error) { $('#lista-galerias').innerHTML = '<div class="empty">No se pudieron cargar las galerías.</div>'; toast(error.message); return; }
  seleccionesPorGaleria = (selecciones || []).reduce((resultado, fila) => { resultado[fila.galeria_id] = (resultado[fila.galeria_id] || 0) + 1; return resultado; }, {});
  listaClientesGlobal = data || [];
  actualizarKpis();
  renderizarGalerias();
}

function actualizarKpis() {
  const total = listaClientesGlobal.length;
  const aprobadas = listaClientesGlobal.filter(item => item.aprobado === true).length;
  $('#kpi-total').textContent = total;
  $('#kpi-pendientes').textContent = total - aprobadas;
  $('#kpi-aprobadas').textContent = aprobadas;
  $('#kpi-selecciones').textContent = Object.values(seleccionesPorGaleria).reduce((suma, cantidad) => suma + cantidad, 0);
}

function renderizarGalerias() {
  const texto = $('#buscador').value.toLowerCase();
  const filtro = $('#filtro-estado').value;
  const galerias = listaClientesGlobal.filter(item => item.client_name.toLowerCase().includes(texto) && (filtro === 'todos' || (filtro === 'aprobado' ? item.aprobado === true : item.aprobado !== true)));
  const lista = $('#lista-galerias');
  if (!galerias.length) { lista.innerHTML = '<div class="empty">No encontramos galerías con esos filtros.</div>'; return; }
  lista.innerHTML = '';
  galerias.forEach(item => {
    const aprobado = item.aprobado === true;
    const seleccionadas = seleccionesPorGaleria[item.id] || 0;
    const album = seleccionadas ? `<a class="album-review" href="album.html?galeria=${encodeURIComponent(item.slug)}" target="_blank" title="Ver álbum de revisión"><i data-lucide="book-open" size="14"></i></a>` : '';
    const card = document.createElement('article');
    card.className = 'gallery-card';
    card.innerHTML = `<div class="card-art"><span>${aprobado ? 'Entrega lista' : 'Selección privada'}</span></div><h3 class="card-title">${escapeHtml(item.client_name)}</h3><div class="card-slug">?galeria=${escapeHtml(item.slug)}</div><div class="card-data"><span class="pill">${seleccionadas} seleccionadas</span><span class="pill">Límite ${item.limite_fotos || 100}</span><span class="pill ${aprobado ? 'approved' : 'pending'}">${aprobado ? 'Descarga activa' : 'Pendiente'}</span></div><div class="card-actions"><a href="index.html?galeria=${encodeURIComponent(item.slug)}" target="_blank" title="Ver galería"><i data-lucide="external-link" size="14"></i></a>${album}<button data-action="limit" title="Editar límite"><i data-lucide="sliders-horizontal" size="14"></i></button><button data-action="watermark" title="Marca de agua"><i data-lucide="${item.con_marca_agua !== false ? 'shield-check' : 'shield-off'}" size="14"></i></button><button data-action="approval" class="approve">${aprobado ? 'Bloquear' : 'Aprobar'}</button><button data-action="delete" class="danger" title="Eliminar"><i data-lucide="trash-2" size="14"></i></button></div>`;
    card.querySelector('[data-action="limit"]').onclick = () => cambiarLimite(item.id, item.limite_fotos || 100);
    card.querySelector('[data-action="watermark"]').onclick = () => toggleMarcaAgua(item.id, item.con_marca_agua !== false);
    card.querySelector('[data-action="approval"]').onclick = () => toggleAprobacion(item.id, aprobado);
    card.querySelector('[data-action="delete"]').onclick = () => eliminarCliente(item.id);
    lista.append(card);
  });
  lucide.createIcons();
}

async function cambiarLimite(id, actual) { const valor = prompt('Nuevo límite de fotografías:', actual); if (valor === null || !Number.isInteger(Number(valor)) || Number(valor) < 1) return; const { error } = await _supabase.from('galerias').update({ limite_fotos: parseInt(valor) }).eq('id', id); if (error) toast(error.message); else { toast('Límite actualizado.'); cargarClientes(); } }
async function toggleMarcaAgua(id, actual) { const { error } = await _supabase.from('galerias').update({ con_marca_agua: !actual }).eq('id', id); if (error) toast(error.message); else { toast(!actual ? 'Marca de agua activada.' : 'Marca de agua desactivada.'); cargarClientes(); } }
async function toggleAprobacion(id, actual) { if (!confirm(actual ? '¿Bloquear temporalmente la descarga?' : '¿Aprobar la selección y habilitar la descarga?')) return; const { error } = await _supabase.from('galerias').update({ aprobado: !actual }).eq('id', id); if (error) toast(error.message); else { toast(!actual ? 'Descarga habilitada.' : 'Descarga bloqueada.'); cargarClientes(); } }
async function eliminarCliente(id) { if (!confirm('¿Eliminar este registro de la base de datos? Esta acción no borra su carpeta de Drive.')) return; const { error } = await _supabase.from('galerias').delete().eq('id', id); if (error) toast(error.message); else { toast('Galería eliminada.'); cargarClientes(); } }
function abrirModal() { $('#modal-cliente').classList.add('open'); $('#modal-cliente').setAttribute('aria-hidden', 'false'); $('#nombreCliente').focus(); }
function cerrarModal() { $('#modal-cliente').classList.remove('open'); $('#modal-cliente').setAttribute('aria-hidden', 'true'); }
async function crearClienteAutomatico(evento) { evento.preventDefault(); const nombre = $('#nombreCliente').value.trim(); const limite = parseInt($('#limiteFotos').value) || 100; const conMarca = $('#conMarcaAgua').checked; const slug = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'); if (!nombre) return; const boton = $('#btn-guardar'); boton.textContent = 'Creando…'; boton.disabled = true; try { const respuesta = await fetch(`${APPS_SCRIPT_URL}?action=crearCarpeta&nombre=${encodeURIComponent(nombre)}`); const resultado = await respuesta.json(); if (!resultado.success) { toast(`No se creó la carpeta: ${resultado.error}`); return; } const { error } = await _supabase.from('galerias').insert([{ client_name: nombre, slug, folder_id: resultado.folderId, limite_fotos: limite, aprobado: false, con_marca_agua: conMarca }]); if (error) toast(`No se guardó: ${error.message}`); else { cerrarModal(); evento.target.reset(); $('#limiteFotos').value = 100; $('#conMarcaAgua').checked = true; toast('Galería creada y lista para usar.'); cargarClientes(); } } catch (error) { console.error(error); toast('No se pudo conectar con el servidor.'); } finally { boton.innerHTML = '<i data-lucide="plus" size="17"></i> Crear galería'; boton.disabled = false; lucide.createIcons(); } }

$('#abrir-modal').onclick = abrirModal;
$('#cerrar-modal').onclick = cerrarModal;
$('#modal-cliente').addEventListener('click', evento => { if (evento.target === $('#modal-cliente')) cerrarModal(); });
$('#form-nuevo-cliente').addEventListener('submit', crearClienteAutomatico);
$('#buscador').addEventListener('input', renderizarGalerias);
$('#filtro-estado').addEventListener('change', renderizarGalerias);
lucide.createIcons();
cargarClientes();
