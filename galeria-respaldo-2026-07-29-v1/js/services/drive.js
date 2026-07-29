import { APPS_SCRIPT_URL } from '../core/config.js';

export async function obtenerFotos(folderId) {
  const response = await fetch(`${APPS_SCRIPT_URL}?action=obtenerFotos&folderId=${encodeURIComponent(folderId)}`);
  return response.json();
}

export async function crearCarpeta(nombre) {
  const response = await fetch(`${APPS_SCRIPT_URL}?action=crearCarpeta&nombre=${encodeURIComponent(nombre)}`);
  return response.json();
}

export async function procesarSeleccion(folderId, ids) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'procesarSeleccion', folderId, ids })
  });
  return response.json();
}
