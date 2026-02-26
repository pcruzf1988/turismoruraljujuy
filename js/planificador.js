/**
 * PLANIFICADOR DE VIAJE — JS
 * Etapa 1 + Etapa 2: Mapa Google Maps, emprendimientos CSV,
 * Places Autocomplete, día activo, agregar paradas desde el mapa.
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function esc(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str ?? '').replace(/[&<>"']/g, c => map[c]);
}

function dateAddDays(isoDate, n) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDateShort(isoDate, lang = 'es') {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  const locale = lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-GB' : 'es-AR';
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Parse a CSV string into array of objects.
 *  Versión robusta — maneja saltos de línea dentro de comillas,
 *  igual que el parser del sitio principal (script.js).
 */
function parseCSV(text) {
  const rows    = [];
  let curRow    = [];
  let curField  = '';
  let inQuotes  = false;

  for (let i = 0; i < text.length; i++) {
    const ch   = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { curField += '"'; i++; }
      else if (ch === '"')            { inQuotes = false; }
      else                            { curField += ch; }
    } else {
      if      (ch === '"')                      { inQuotes = true; }
      else if (ch === ',')                      { curRow.push(curField.trim()); curField = ''; }
      else if (ch === '\r' && next === '\n')  { curRow.push(curField.trim()); rows.push(curRow); curRow = []; curField = ''; i++; }
      else if (ch === '\n' || ch === '\r')    { curRow.push(curField.trim()); rows.push(curRow); curRow = []; curField = ''; }
      else                                      { curField += ch; }
    }
  }
  if (curField || curRow.length) { curRow.push(curField.trim()); rows.push(curRow); }

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => (h || '').trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim(); });
    return obj;
  });
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'turismo_jujuy_planner_v1';

const DAY_COLORS = [
  '#CD853F', '#C06A3A', '#7A9E6F',
  '#9280B8', '#5E8FA0', '#B07878',
];

const TITLE_PLACEHOLDER = {
  es: 'Nombre del itinerario…',
  en: 'Itinerary name…',
  fr: "Nom de l'itinéraire…",
};

// CSV path — ajustá si tu CSV está en otra ubicación
// URL del Google Sheet publicado como CSV — misma fuente que el sitio principal
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2yQd6691oT5gGiVAH3mV0ItZZzhpIWCt7CXKbX6UqSpJy76teHK-o6hKeIYeu1p-I1NhFjNxvP0E/pub?gid=0&single=true&output=csv';

// Columna exacta de coordenadas en el Google Sheet
const CSV_COORDS_COL = 'Ubicación (formato: -23.5772, -65.3969 latitud,longitud)';

// Jujuy map defaults
const MAP_CENTER = { lat: -23.08, lng: -65.50 };
const MAP_ZOOM   = 8;

// Colores de marcadores por región (coincide con el sitio principal)
const REGION_COLORS = {
  'puna':     '#D4A017',
  'quebrada': '#8B1A1A',
  'yungas':   '#4A7C59',
  'default':  '#8B4513',
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   type: 'custom'|'emprendimiento'|'place',
 *   lat?: number,
 *   lng?: number,
 *   address?: string,
 *   categoria?: string,
 *   region?: string,
 *   telefono?: string,
 *   email?: string,
 *   descripcion?: string
 * }} Stop
 *
 * @typedef {{id:string, stops:Stop[], collapsed:boolean}} Day
 *
 * @typedef {{
 *   id:string, name:string, mode:'days'|'dates',
 *   startDate:string|null, days:Day[],
 *   createdAt:number, updatedAt:number
 * }} Itinerary
 *
 * @typedef {{
 *   itineraries: Itinerary[],
 *   activeId: string|null,
 *   activeDayId: string|null,
 *   lang: string
 * }} AppState
 */

/** @type {AppState} */
let state = {
  itineraries: [],
  activeId:    null,
  activeDayId: null,
  lang:        'es',
};

// ─── Persistence ───

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.itineraries && Array.isArray(parsed.itineraries)) {
        state = { ...state, ...parsed };
      }
    }
  } catch (_) { /* ignore */ }

  if (!state.itineraries.length) createItinerary('Mi viaje a Jujuy', false);

  if (!state.activeId || !state.itineraries.find(i => i.id === state.activeId)) {
    state.activeId = state.itineraries[0].id;
  }

  // Validate activeDayId
  const it = getActive();
  if (state.activeDayId && !it?.days.find(d => d.id === state.activeDayId)) {
    state.activeDayId = it?.days[0]?.id ?? null;
  }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

// ─── Selectors ───

function getActive() {
  return state.itineraries.find(i => i.id === state.activeId) ?? null;
}

function getActiveDay() {
  const it = getActive();
  return it?.days.find(d => d.id === state.activeDayId) ?? null;
}

function totalStops(it) {
  return it.days.reduce((n, d) => n + d.stops.length, 0);
}

// ─── Mutations ───

function createItinerary(name = 'Nuevo itinerario', activate = true) {
  const it = {
    id: uid(), name,
    mode: 'days', startDate: null,
    days: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  state.itineraries.push(it);
  if (activate) { state.activeId = it.id; state.activeDayId = null; }
  saveState();
  return it;
}

function deleteItinerary(id) {
  const idx = state.itineraries.findIndex(i => i.id === id);
  if (idx === -1) return;
  state.itineraries.splice(idx, 1);
  if (state.activeId === id) {
    if (!state.itineraries.length) { createItinerary('Mi viaje a Jujuy', true); return; }
    state.activeId    = state.itineraries[Math.min(idx, state.itineraries.length - 1)].id;
    state.activeDayId = null;
  }
  saveState();
}

function renameItinerary(id, name) {
  const it = state.itineraries.find(i => i.id === id);
  if (!it) return;
  it.name = name.trim() || it.name;
  it.updatedAt = Date.now();
  saveState();
}

function addDay(itineraryId) {
  const it = state.itineraries.find(i => i.id === itineraryId);
  if (!it) return null;
  const day = { id: uid(), stops: [], collapsed: false };
  it.days.push(day);
  it.updatedAt = Date.now();
  // Auto-activate first day
  if (!state.activeDayId) state.activeDayId = day.id;
  saveState();
  return day;
}

function removeDay(itineraryId, dayId) {
  const it = state.itineraries.find(i => i.id === itineraryId);
  if (!it) return;
  const idx = it.days.findIndex(d => d.id === dayId);
  if (idx !== -1) it.days.splice(idx, 1);
  if (state.activeDayId === dayId) {
    state.activeDayId = it.days[Math.max(0, idx - 1)]?.id ?? it.days[0]?.id ?? null;
  }
  it.updatedAt = Date.now();
  saveState();
}

function setActiveDay(dayId) {
  state.activeDayId = dayId;
  saveState();
  refreshActiveDayUI();
}

function toggleCollapse(itineraryId, dayId) {
  const it  = state.itineraries.find(i => i.id === itineraryId);
  const day = it?.days.find(d => d.id === dayId);
  if (day) { day.collapsed = !day.collapsed; saveState(); }
}

/**
 * Add a stop from the sidebar text input (minimal data)
 */
function addStop(itineraryId, dayId, name) {
  const it  = state.itineraries.find(i => i.id === itineraryId);
  const day = it?.days.find(d => d.id === dayId);
  if (!day) return null;
  const stop = { id: uid(), name: name.trim(), type: 'custom' };
  day.stops.push(stop);
  it.updatedAt = Date.now();
  saveState();
  if (mapInstance && dayId === state.activeDayId) setTimeout(drawActiveRoute, 100);
  return stop;
}

/**
 * Add a stop from the map (rich data: emprendimiento or Place)
 */
function addStopFromMap(itineraryId, dayId, data) {
  const it  = state.itineraries.find(i => i.id === itineraryId);
  const day = it?.days.find(d => d.id === dayId);
  if (!day) return null;
  const stop = {
    id: uid(),
    name:       data.name,
    type:       data.type || 'place',
    lat:        data.lat,
    lng:        data.lng,
    address:    data.address   || '',
    categoria:  data.categoria || '',
    region:     data.region    || '',
    telefono:   data.telefono  || '',
    email:      data.email     || '',
    descripcion: data.descripcion || '',
  };
  day.stops.push(stop);
  it.updatedAt = Date.now();
  saveState();
  return stop;
}

function removeStop(itineraryId, dayId, stopId) {
  const it  = state.itineraries.find(i => i.id === itineraryId);
  const day = it?.days.find(d => d.id === dayId);
  if (!day) return;
  const idx = day.stops.findIndex(s => s.id === stopId);
  if (idx !== -1) day.stops.splice(idx, 1);
  it.updatedAt = Date.now();
  saveState();
  if (mapInstance && dayId === state.activeDayId) setTimeout(drawActiveRoute, 100);
}

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════

let _toastTimer = null;

function showToast(msg, type = 'default', duration = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'toast show' + (type !== 'default' ? ' toast--' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.classList.remove('show'); }, duration);
}

// ═══════════════════════════════════════════════════════════
// CONFIRM MODAL
// ═══════════════════════════════════════════════════════════

const confirmOverlay   = document.getElementById('confirmOverlay');
const confirmTitleEl   = document.getElementById('confirmTitle');
const confirmTextEl    = document.getElementById('confirmText');
const confirmOkBtn     = document.getElementById('confirmOk');
const confirmCancelBtn = document.getElementById('confirmCancel');

let _confirmResolve = null;

function confirm(title, text) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    confirmTitleEl.textContent = title;
    confirmTextEl.textContent  = text;
    confirmOverlay.classList.add('open');
    confirmOverlay.setAttribute('aria-hidden', 'false');
    confirmOkBtn.focus();
  });
}

function closeConfirm(result) {
  confirmOverlay.classList.remove('open');
  confirmOverlay.setAttribute('aria-hidden', 'true');
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

confirmOkBtn.addEventListener('click',     () => closeConfirm(true));
confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
confirmOverlay.addEventListener('click',   e => { if (e.target === confirmOverlay) closeConfirm(false); });
document.addEventListener('keydown',       e => {
  if (e.key === 'Escape' && confirmOverlay.classList.contains('open')) closeConfirm(false);
});

// ═══════════════════════════════════════════════════════════
// RENDER HELPERS
// ═══════════════════════════════════════════════════════════

function getDayLabel(index, itinerary) {
  const num = `Día ${index + 1}`;
  if (itinerary.mode === 'dates' && itinerary.startDate) {
    const iso = dateAddDays(itinerary.startDate, index);
    return { num, date: formatDateShort(iso, state.lang) };
  }
  return { num, date: null };
}

function refreshMeta() {
  const it = getActive();
  document.getElementById('metaDays').textContent  = it?.days.length ?? 0;
  document.getElementById('metaStops').textContent = it ? totalStops(it) : 0;
}

function refreshSwitcherName() {
  document.getElementById('switcherName').textContent = getActive()?.name ?? '—';
}

function refreshSwitcherList() {
  const list = document.getElementById('switcherList');
  list.innerHTML = '';
  for (const it of state.itineraries) {
    const isActive = it.id === state.activeId;
    const stops    = totalStops(it);
    const meta     = `${it.days.length} día${it.days.length !== 1 ? 's' : ''} · ${stops} parada${stops !== 1 ? 's' : ''}`;
    const item     = document.createElement('div');
    item.className = 'itin-item' + (isActive ? ' active' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    item.dataset.id = it.id;
    item.innerHTML = `
      <div class="itin-item__dot" aria-hidden="true"></div>
      <div class="itin-item__info">
        <div class="itin-item__name">${esc(it.name)}</div>
        <div class="itin-item__meta">${esc(meta)}</div>
      </div>
      <button class="itin-item__delete" data-delete-id="${esc(it.id)}"
        aria-label="Eliminar itinerario ${esc(it.name)}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    item.addEventListener('click', e => {
      if (e.target.closest('[data-delete-id]')) return;
      switchItinerary(it.id);
    });
    item.querySelector('[data-delete-id]').addEventListener('click', async e => {
      e.stopPropagation();
      if (state.itineraries.length === 1) return;
      const ok = await confirm('Eliminar itinerario', `¿Eliminar "${it.name}"? Esta acción no se puede deshacer.`);
      if (ok) { deleteItinerary(it.id); render(); }
    });
    list.appendChild(item);
  }
}

function switchItinerary(id) {
  state.activeId    = id;
  state.activeDayId = getActive()?.days[0]?.id ?? null;
  saveState();
  closeSwitcherDropdown();
  render();
}

/** Update the active-day pill in the map search bar */
function refreshActiveDayUI() {
  const it  = getActive();
  const day = getActiveDay();
  const pill    = document.getElementById('activeDayPill');
  const label   = document.getElementById('activeDayLabel');
  const dot     = document.getElementById('activeDayDot');

  if (!day || !it) {
    pill.classList.add('no-day');
    label.textContent = it?.days.length ? 'Seleccioná un día' : 'Agregá un día primero';
    return;
  }

  pill.classList.remove('no-day');
  const idx   = it.days.findIndex(d => d.id === day.id);
  const color = DAY_COLORS[idx % DAY_COLORS.length];
  dot.style.background = color;
  label.textContent    = `Agregando a: Día ${idx + 1}`;

  // Highlight the active day card
  document.querySelectorAll('.day-card').forEach(card => {
    const isActive = card.dataset.dayId === day.id;
    card.classList.toggle('active-day', isActive);
    const tag = card.querySelector('.day-card__active-tag');
    if (tag) tag.style.color = isActive ? color : '';
  });

  // Dibujar ruta del día activo en el mapa
  if (mapInstance) drawActiveRoute();
}

// ═══════════════════════════════════════════════════════════
// STOP ITEM DOM BUILDER
// ═══════════════════════════════════════════════════════════

function buildStopEl(stop, itineraryId, dayId) {
  const el = document.createElement('div');
  el.className = 'stop-item' + (stop.lat ? ' has-location' : '');
  el.dataset.stopId = stop.id;
  el.setAttribute('role', 'listitem');

  const isEmp   = stop.type === 'emprendimiento';
  const isPlace = stop.type === 'place';

  // Icon per type
  let pinClass = '';
  let pinIcon  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
    <circle cx="12" cy="10" r="3"/>
    <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 14 8 14s8-8.75 8-14a8 8 0 0 0-8-8z"/>
  </svg>`;

  if (isEmp) {
    pinClass = 'type-emprendimiento';
    pinIcon  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>`;
  } else if (isPlace) {
    pinClass = 'type-place';
    pinIcon  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>`;
  }

  const subText = stop.categoria || stop.address || '';

  el.innerHTML = `
    <div class="stop-item__drag" aria-hidden="true" title="Reordenar (Etapa 3)">⠿</div>
    <div class="stop-item__pin ${pinClass}" aria-hidden="true">${pinIcon}</div>
    <div class="stop-item__info">
      <span class="stop-item__name" title="${esc(stop.name)}">${esc(stop.name)}</span>
      ${subText ? `<span class="stop-item__sub">${esc(subText)}</span>` : ''}
    </div>
    <button class="stop-item__del" aria-label="Eliminar parada ${esc(stop.name)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>`;

  // Click on stop → pan map
  el.addEventListener('click', e => {
    if (e.target.closest('.stop-item__del')) return;
    if (stop.lat && stop.lng && mapInstance) {
      mapInstance.panTo({ lat: stop.lat, lng: stop.lng });
      mapInstance.setZoom(13);
    }
  });

  el.querySelector('.stop-item__del').addEventListener('click', e => {
    e.stopPropagation();
    removeStop(itineraryId, dayId, stop.id);
    el.remove();
    const card = document.querySelector(`.day-card[data-day-id="${dayId}"]`);
    if (card) refreshDayBadge(card, itineraryId, dayId);
    refreshMeta();
    ensureStopsEmpty(card, dayId);
  });

  return el;
}

function refreshDayBadge(card, itineraryId, dayId) {
  const it  = state.itineraries.find(i => i.id === itineraryId);
  const day = it?.days.find(d => d.id === dayId);
  if (!day) return;
  const n = day.stops.length;
  const badge = card.querySelector('.day-card__badge');
  if (badge) badge.textContent = `${n} parada${n !== 1 ? 's' : ''}`;
}

function ensureStopsEmpty(card, dayId) {
  const list  = card?.querySelector(`.stops-list[data-day-id="${dayId}"]`);
  if (!list) return;
  const items = list.querySelectorAll('.stop-item');
  const empty = list.querySelector('.stops-empty');
  if (items.length === 0 && !empty) {
    const div = document.createElement('div');
    div.className = 'stops-empty';
    div.textContent = 'Sin paradas aún';
    list.appendChild(div);
  } else if (items.length > 0 && empty) {
    empty.remove();
  }
}

// ═══════════════════════════════════════════════════════════
// ADD STOP INLINE INPUT
// ═══════════════════════════════════════════════════════════

function activateAddStop(addArea, card, itineraryId, dayId) {
  addArea.innerHTML = `
    <div class="add-stop-input-row">
      <input type="text" class="add-stop-input"
        placeholder="Nombre de la parada…" maxlength="100"
        aria-label="Nombre de la nueva parada"
        autocomplete="off" spellcheck="false">
      <button class="add-stop-confirm" title="Confirmar" aria-label="Confirmar parada">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </button>
      <button class="add-stop-cancel" title="Cancelar" aria-label="Cancelar">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;

  const input      = addArea.querySelector('.add-stop-input');
  const confirmBtn = addArea.querySelector('.add-stop-confirm');
  const cancelBtn  = addArea.querySelector('.add-stop-cancel');

  input.focus();

  // Guard para evitar doble commit (blur + click simultáneos)
  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;

    const name = input.value.trim();
    if (name) {
      // Agregar inmediatamente con solo el nombre
      const stop = addStop(itineraryId, dayId, name);
      if (stop) {
        const list  = card.querySelector(`.stops-list[data-day-id="${dayId}"]`);
        const empty = list?.querySelector('.stops-empty');
        if (empty) empty.remove();
        const stopEl = buildStopEl(stop, itineraryId, dayId);
        if (list) list.appendChild(stopEl);
        refreshDayBadge(card, itineraryId, dayId);
        refreshMeta();

        // Geocodificar en segundo plano para obtener coordenadas
        geocodeStop(stop, name, stopEl, itineraryId, dayId);
      }
    }
    restoreBtn();
  }

  function restoreBtn() {
    const dayIndex = getActive()?.days.findIndex(d => d.id === dayId) ?? 0;
    addArea.innerHTML = '';
    addArea.appendChild(buildAddStopBtn(itineraryId, dayId, dayIndex + 1));
  }

  confirmBtn.addEventListener('mousedown', e => e.preventDefault()); // evita blur antes del click
  confirmBtn.addEventListener('click', commit);
  cancelBtn.addEventListener('click', restoreBtn);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); restoreBtn(); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!committed) {
        if (input.value.trim()) commit(); else restoreBtn();
      }
    }, 150);
  });
}

/**
 * Geocodifica un nombre de lugar y actualiza las coords del stop en el estado.
 * Usa Google Maps Geocoder restringiéndolo a Argentina/Jujuy.
 */
function geocodeStop(stop, name, stopEl, itineraryId, dayId) {
  if (!window.google?.maps?.Geocoder) return;

  const geocoder = new google.maps.Geocoder();
  geocoder.geocode(
    {
      address:               name + ', Jujuy, Argentina',
      componentRestrictions: { country: 'AR' },
      bounds: new google.maps.LatLngBounds(
        { lat: -24.5, lng: -66.5 },  // SW Jujuy
        { lat: -21.8, lng: -64.9 }   // NE Jujuy
      ),
    },
    (results, status) => {
      if (status !== 'OK' || !results[0]) return;

      const loc = results[0].geometry.location;
      const lat = loc.lat();
      const lng = loc.lng();

      // Actualizar stop en el estado
      const it  = state.itineraries.find(i => i.id === itineraryId);
      const day = it?.days.find(d => d.id === dayId);
      const s   = day?.stops.find(s => s.id === stop.id);
      if (!s) return;

      s.lat     = lat;
      s.lng     = lng;
      s.address = results[0].formatted_address || '';
      s.type    = 'place';
      saveState();

      // Marcar el stop-item como clickeable
      stopEl.classList.add('has-location');

      // Poner un marcador en el mapa
      if (mapInstance) {
        const marker = new google.maps.Marker({
          position: { lat, lng },
          map:      mapInstance,
          title:    name,
          icon: {
            path:        google.maps.SymbolPath.CIRCLE,
            scale:       7,
            fillColor:   '#5E8FA0',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });
        marker.addListener('click', () => openInfoWindow(marker, s));
      }

      // Redibujar ruta si este día es el activo
      if (dayId === state.activeDayId) {
        setTimeout(drawActiveRoute, 200);
      }
    }
  );
}

function buildAddStopBtn(itineraryId, dayId, dayNumber) {
  const btn = document.createElement('button');
  btn.className = 'add-stop-btn';
  btn.dataset.action  = 'add-stop';
  btn.dataset.dayId   = dayId;
  btn.setAttribute('aria-label', `Agregar parada al Día ${dayNumber}`);
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    Agregar parada`;
  return btn;
}

// ═══════════════════════════════════════════════════════════
// DAY CARD BUILDER
// ═══════════════════════════════════════════════════════════

function buildDayCard(it, day, index) {
  const isActiveDayCard = day.id === state.activeDayId;
  const color           = DAY_COLORS[index % DAY_COLORS.length];

  const card = document.createElement('div');
  card.className = 'day-card' + (day.collapsed ? ' collapsed' : '') + (isActiveDayCard ? ' active-day' : '');
  card.dataset.dayId = day.id;
  card.setAttribute('role', 'listitem');
  card.style.setProperty('--day-color', color);

  const { num, date } = getDayLabel(index, it);
  const n = day.stops.length;

  card.innerHTML = `
    <div class="day-card__header" role="button" tabindex="0"
      aria-expanded="${!day.collapsed}" aria-controls="day-body-${day.id}">
      <div class="day-card__drag" aria-hidden="true" title="Reordenar (Etapa 3)">⠿</div>
      <div class="day-card__label">
        <span class="day-card__number">${esc(num)}</span>
        ${date ? `<span class="day-card__date">${esc(date)}</span>` : ''}
      </div>
      <span class="day-card__active-tag" style="color:${color}" aria-label="Día activo para agregar paradas">Activo</span>
      <span class="day-card__badge">${n} parada${n !== 1 ? 's' : ''}</span>
      <svg class="day-card__chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
      <button class="day-card__delete-btn" data-action="del-day"
        aria-label="Eliminar ${esc(num)}" title="Eliminar día">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="day-card__body" id="day-body-${day.id}">
      <div class="stops-list" role="list" aria-label="Paradas del ${esc(num)}" data-day-id="${day.id}">
        ${day.stops.length === 0 ? '<div class="stops-empty">Sin paradas aún</div>' : ''}
      </div>
      <div class="add-stop-area" data-day-id="${day.id}"></div>
    </div>`;

  // Stops
  const stopsList = card.querySelector('.stops-list');
  for (const stop of day.stops) stopsList.appendChild(buildStopEl(stop, it.id, day.id));

  // Add-stop button
  const addArea = card.querySelector('.add-stop-area');
  addArea.appendChild(buildAddStopBtn(it.id, day.id, index + 1));

  // Header events
  const header = card.querySelector('.day-card__header');

  function handleHeaderClick(e) {
    if (e.target.closest('[data-action="del-day"]')) return;
    // Set active day on click
    setActiveDay(day.id);
    // Also toggle collapse
    toggleCollapse(it.id, day.id);
    card.classList.toggle('collapsed');
    header.setAttribute('aria-expanded', !card.classList.contains('collapsed') ? 'true' : 'false');
  }

  header.addEventListener('click', handleHeaderClick);
  header.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleHeaderClick(e); }
  });

  // Delete day
  card.querySelector('[data-action="del-day"]').addEventListener('click', async e => {
    e.stopPropagation();
    const stopCount = day.stops.length;
    const msg = stopCount > 0
      ? `¿Eliminar el ${num}? También se eliminarán sus ${stopCount} parada${stopCount !== 1 ? 's' : ''}.`
      : `¿Eliminar el ${num}?`;
    const ok = await confirm('Eliminar día', msg);
    if (!ok) return;
    removeDay(it.id, day.id);
    card.remove();
    renderDaysList();
    refreshMeta();
    updateEndDate(getActive());
    refreshActiveDayUI();
  });

  // Add-stop
  addArea.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="add-stop"]');
    if (!btn) return;
    activateAddStop(addArea, card, it.id, day.id);
  });

  return card;
}

// ═══════════════════════════════════════════════════════════
// DAYS LIST RENDER
// ═══════════════════════════════════════════════════════════

function renderDaysList() {
  const container = document.getElementById('daysList');
  container.innerHTML = '';
  const it = getActive();

  if (!it || it.days.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'days-empty';
    empty.innerHTML = `
      <div class="days-empty__icon" aria-hidden="true">📅</div>
      <p class="days-empty__text">Agregá tu primer día para comenzar a planificar tu viaje por Jujuy</p>`;
    container.appendChild(empty);
    document.getElementById('addDayBtn').classList.add('pulsing');
    return;
  }

  document.getElementById('addDayBtn').classList.remove('pulsing');
  for (let i = 0; i < it.days.length; i++) {
    container.appendChild(buildDayCard(it, it.days[i], i));
  }
}

// ═══════════════════════════════════════════════════════════
// END DATE
// ═══════════════════════════════════════════════════════════

function updateEndDate(it) {
  const display = document.getElementById('endDateDisplay');
  if (!display || !it) return;
  if (!it.startDate || it.days.length === 0) { display.textContent = '—'; return; }
  display.textContent = formatDateShort(dateAddDays(it.startDate, it.days.length - 1), state.lang);
}

// ═══════════════════════════════════════════════════════════
// FULL RENDER
// ═══════════════════════════════════════════════════════════

function render() {
  const it = getActive();

  const titleEl = document.getElementById('itineraryTitle');
  if (titleEl && document.activeElement !== titleEl) {
    titleEl.textContent = it?.name ?? '';
    titleEl.setAttribute('data-placeholder', TITLE_PLACEHOLDER[state.lang] ?? TITLE_PLACEHOLDER.es);
  }

  refreshSwitcherName();

  if (it) {
    document.querySelectorAll('.mode-toggle__btn').forEach(btn => {
      btn.classList.toggle('mode-toggle__btn--active', btn.dataset.mode === it.mode);
    });
    document.getElementById('dateRangeRow').hidden = it.mode !== 'dates';
    const si = document.getElementById('startDateInput');
    if (si && it.startDate) si.value = it.startDate;
    updateEndDate(it);
  }

  renderDaysList();
  refreshMeta();
  refreshActiveDayUI();
}

// ═══════════════════════════════════════════════════════════
// SWITCHER DROPDOWN
// ═══════════════════════════════════════════════════════════

const switcherTrigger  = document.getElementById('switcherTrigger');
const switcherDropdown = document.getElementById('switcherDropdown');

function openSwitcherDropdown()  {
  refreshSwitcherList();
  switcherDropdown.classList.add('open');
  switcherTrigger.setAttribute('aria-expanded', 'true');
}

function closeSwitcherDropdown() {
  switcherDropdown.classList.remove('open');
  switcherTrigger.setAttribute('aria-expanded', 'false');
}

switcherTrigger.addEventListener('click', e => {
  e.stopPropagation();
  switcherDropdown.classList.contains('open') ? closeSwitcherDropdown() : openSwitcherDropdown();
});

document.addEventListener('click',   e => { if (!e.target.closest('#itinerarySwitcher')) closeSwitcherDropdown(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && switcherDropdown.classList.contains('open')) {
    closeSwitcherDropdown();
    switcherTrigger.focus();
  }
});

// ═══════════════════════════════════════════════════════════
// GOOGLE MAPS — CORE
// ═══════════════════════════════════════════════════════════

/** @type {google.maps.Map|null} */
let mapInstance  = null;
/** @type {google.maps.InfoWindow|null} */
let infoWindow   = null;

/** All emprendimiento markers */
let emprendimientoMarkers = [];

/**
 * Callback invocado por Google Maps JS API al cargarse.
 * Nombre registrado en: &callback=initPlannerMap
 */
window.initPlannerMap = function () {
  const loadingEl = document.getElementById('mapLoading');
  const errorEl   = document.getElementById('mapError');

  try {
    mapInstance = new google.maps.Map(document.getElementById('googleMap'), {
      center:            MAP_CENTER,
      zoom:              MAP_ZOOM,
      gestureHandling:   'greedy',
    });

    infoWindow = new google.maps.InfoWindow({ maxWidth: 280 });

    // Ocultar loading
    loadingEl.style.display = 'none';

    // Cargar emprendimientos desde Google Sheets
    loadEmprendimientos();

  } catch (err) {
    console.error('[Mapa] Error:', err);
    loadingEl.hidden  = true;
    errorEl.hidden    = false;
    const el = document.getElementById('mapErrorText');
    if (el) el.textContent = err.name + ': ' + err.message;
  }
};

// ═══════════════════════════════════════════════════════════
// CSV — EMPRENDIMIENTOS DESDE GOOGLE SHEETS
// ═══════════════════════════════════════════════════════════

function parsearCoordsGSheet(ubicacion) {
  if (!ubicacion || typeof ubicacion !== 'string') return null;
  const parts = ubicacion.split(',').map(c => c.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  return (!isNaN(lat) && !isNaN(lng)) ? { lat, lng } : null;
}

async function loadEmprendimientos() {
  try {
    const res  = await fetch(CSV_URL);
    if (!res.ok) { console.warn('[CSV] No encontrado:', CSV_URL); return; }
    const text = await res.text();
    const rows = parseCSV(text);
    placeEmprendimientoMarkers(rows);
  } catch (err) {
    console.warn('[CSV] Error al cargar:', err.message);
  }
}

function getRegionColor(row) {
  const r = (row['Región'] || '').toLowerCase();
  if (r.includes('puna'))     return REGION_COLORS.puna;
  if (r.includes('quebrada')) return REGION_COLORS.quebrada;
  if (r.includes('yunga'))    return REGION_COLORS.yungas;
  return REGION_COLORS.default;
}

function placeEmprendimientoMarkers(rows) {
  emprendimientoMarkers = [];
  for (const row of rows) {
    const nombre  = row['Emprendimiento'] || '';
    const rubro   = row['Rubro']          || '';
    const region  = row['Región']         || '';
    const tel     = row['Teléfono( sin guiones ni espacios: 5493884123456)'] || row['Teléfono'] || row['Telefono'] || '';
    const email   = row['Correo electrónico'] || row['Email'] || row['Correo'] || '';
    const desc    = row['Descripción']    || row['Descripcion'] || '';
    const coords  = parsearCoordsGSheet(row[CSV_COORDS_COL] || '');

    if (!nombre || nombre.length < 3 || !coords) continue;

    const { lat, lng } = coords;
    const color  = getRegionColor(row);

    // Marcador simple — sin ícono SVG personalizado para evitar errores
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map:      mapInstance,
      title:    nombre,
    });

    const stopData = {
      name: nombre, type: 'emprendimiento',
      lat, lng, categoria: rubro, region,
      telefono: tel, email, descripcion: desc,
    };

    marker.addListener('click', () => openInfoWindow(marker, stopData));
    emprendimientoMarkers.push({ marker, data: stopData });
  }
  console.log(`[Mapa] ${emprendimientoMarkers.length} emprendimientos cargados`);
}

// ═══════════════════════════════════════════════════════════
// INFO WINDOW (POPUP AL HACER CLICK EN MARCADOR)
// ═══════════════════════════════════════════════════════════

function openInfoWindow(marker, stopData) {
  const it        = getActive();
  const activeDay = getActiveDay();
  const dayIdx    = it?.days.findIndex(d => d.id === activeDay?.id) ?? -1;
  const dayLabel  = dayIdx >= 0 ? `Día ${dayIdx + 1}` : null;

  const alreadyAdded = activeDay?.stops.some(
    s => s.name === stopData.name && Math.abs((s.lat ?? 0) - (stopData.lat ?? 0)) < 0.0001
  );

  const isEmp = stopData.type === 'emprendimiento';

  let btnHTML = '';
  if (alreadyAdded) {
    btnHTML = `<button style="width:100%;padding:8px;background:#7A9E6F;color:#fff;border:none;border-radius:8px;font-size:0.82rem;font-weight:700;cursor:default">✓ Ya agregado</button>`;
  } else if (dayLabel) {
    btnHTML = `<button id="popupAddBtn" style="width:100%;padding:8px;background:#8B4513;color:#fff;border:none;border-radius:8px;font-size:0.82rem;font-weight:700;cursor:pointer">+ Agregar a ${esc(dayLabel)}</button>`;
  } else {
    btnHTML = `<p style="font-size:0.75rem;color:#888;text-align:center;margin:4px 0 0">Seleccioná un día en el panel para agregar</p>`;
  }

  // Construir links de contacto clicables
  const tel    = stopData.telefono || '';
  const email  = stopData.email    || '';
  const waNum  = tel.replace(/\D/g, '');
  const waLink = waNum ? `https://wa.me/${waNum.replace(/^0/, '')}` : null;

  const contactHTML = (tel || email) ? `
    <div style="display:flex;gap:5px;margin:8px 0 4px;flex-wrap:wrap">
      ${waLink
        ? `<a href="${waLink}" target="_blank" rel="noopener"
            style="display:inline-flex;align-items:center;gap:4px;background:#25D366;color:#fff;
                   text-decoration:none;border-radius:20px;padding:4px 10px;font-size:0.72rem;font-weight:600">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp</a>`
        : (tel ? `<a href="tel:${esc(tel)}" style="display:inline-flex;align-items:center;gap:4px;background:#eee;color:#333;text-decoration:none;border-radius:20px;padding:4px 10px;font-size:0.72rem;font-weight:600">📞 ${esc(tel)}</a>` : '')}
      ${email ? `<a href="mailto:${esc(email)}" style="display:inline-flex;align-items:center;gap:4px;background:#eee;color:#333;text-decoration:none;border-radius:20px;padding:4px 10px;font-size:0.72rem;font-weight:600">✉️ Email</a>` : ''}
    </div>` : '';

  const content = `
    <div style="font-family:'DM Sans',sans-serif;min-width:210px;max-width:270px;padding:4px">
      <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.6px;
                  color:${isEmp ? '#8B3A0F' : '#2E6A80'};margin-bottom:5px">
        ${isEmp ? '⭐ Emprendimiento' : '📍 Lugar'}
      </div>
      <div style="font-size:0.95rem;font-weight:700;color:#2D1205;line-height:1.3;margin-bottom:3px">
        ${esc(stopData.name)}
      </div>
      ${stopData.categoria ? `<div style="font-size:0.72rem;color:#A0522D;margin-bottom:1px">${esc(stopData.categoria)}</div>` : ''}
      ${stopData.region    ? `<div style="font-size:0.68rem;color:#aaa">📍 ${esc(stopData.region)}</div>` : ''}
      ${stopData.descripcion ? `<p style="font-size:0.76rem;color:#555;line-height:1.55;margin:7px 0 4px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(stopData.descripcion)}</p>` : ''}
      ${contactHTML}
      <div style="margin-top:10px">${btnHTML}</div>
    </div>`;

  infoWindow.setContent(content);
  infoWindow.open({ anchor: marker, map: mapInstance });

  google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
    const btn = document.getElementById('popupAddBtn');
    if (!btn || !activeDay || alreadyAdded) return;

    btn.addEventListener('click', () => {
      const stop = addStopFromMap(it.id, activeDay.id, stopData);
      if (!stop) return;

      const card    = document.querySelector(`.day-card[data-day-id="${activeDay.id}"]`);
      const list    = card?.querySelector(`.stops-list[data-day-id="${activeDay.id}"]`);
      const emptyEl = list?.querySelector('.stops-empty');
      if (emptyEl) emptyEl.remove();
      if (list) list.appendChild(buildStopEl(stop, it.id, activeDay.id));
      if (card) refreshDayBadge(card, it.id, activeDay.id);
      refreshMeta();

      btn.style.background = '#7A9E6F';
      btn.textContent      = '✓ Agregado';
      btn.disabled         = true;

      const idx = it.days.findIndex(d => d.id === activeDay.id);
      showToast(`${stopData.name} agregado al Día ${idx + 1}`, 'success');
    });
  });
}

// ═══════════════════════════════════════════════════════════
// COMPARTIR / EXPORTAR ITINERARIO
// ═══════════════════════════════════════════════════════════

/**
 * Genera el HTML completo del itinerario para imprimir o compartir.
 * Incluye: días, paradas, contactos, disclaimer.
 */
/**
 * Para un stop guardado en el estado, intenta completar los datos de contacto
 * buscando el emprendimiento correspondiente en los marcadores cargados del CSV.
 * Útil cuando el stop fue agregado antes de que se corrigieran las columnas.
 */
function enrichStopContact(stop) {
  if (stop.telefono || stop.email) return stop; // ya tiene datos
  if (!emprendimientoMarkers?.length)           return stop; // mapa no cargado

  const match = emprendimientoMarkers.find(({ data }) => {
    if (data.name === stop.name) return true;
    if (stop.lat && stop.lng && data.lat && data.lng) {
      return Math.abs(data.lat - stop.lat) < 0.0002 && Math.abs(data.lng - stop.lng) < 0.0002;
    }
    return false;
  });

  if (!match) return stop;
  return {
    ...stop,
    telefono:   match.data.telefono   || stop.telefono   || '',
    email:      match.data.email      || stop.email      || '',
    descripcion: match.data.descripcion || stop.descripcion || '',
    categoria:  match.data.categoria  || stop.categoria  || '',
    region:     match.data.region     || stop.region     || '',
  };
}

function buildItineraryHTML(it) {
  const DAY_COLORS_PRINT = ['#8B4513','#2E6A80','#5A7A3A','#7B5EA7','#C07840','#3A7A6A'];

  const days = it.days.map((day, idx) => {
    const color    = DAY_COLORS_PRINT[idx % DAY_COLORS_PRINT.length];
    const dayLabel = `Día ${idx + 1}`;
    const stops    = day.stops.map(enrichStopContact);
    const rd       = routeData[day.id]; // segmentos de ruta si están disponibles

    // Resumen de distancia total del día (si existe)
    const dayDistSummary = rd
      ? `<span style="font-size:0.8rem;opacity:0.85">🛣️ ${rd.totalDist}${rd.totalTime !== '—' ? ' · ⏱️ ' + rd.totalTime : ''} en ruta</span>`
      : '';

    const stopsHTML = stops.length === 0
      ? '<p style="color:#aaa;font-size:0.85rem;font-style:italic">Sin paradas</p>'
      : stops.map((stop, si) => {
          const waNum      = (stop.telefono || '').replace(/\D/g, '');
          const waLink     = waNum ? `https://wa.me/${waNum.replace(/^0/, '')}` : null;
          const hasContact = stop.telefono || stop.email;

          // Segmento de ruta hacia la siguiente parada
          const seg         = rd?.segments?.[si];
          const travelBlock = (seg && si < stops.length - 1) ? `
            <div style="display:flex;align-items:center;gap:8px;margin:10px 0 4px;
                        padding:7px 10px;background:#f5f0eb;border-radius:8px">
              <span style="font-size:1rem">🚗</span>
              <div>
                <span style="font-size:0.75rem;font-weight:600;color:#6B3A1F">${seg.distance}</span>
                ${seg.duration !== '—' ? `<span style="font-size:0.72rem;color:#999"> · ${seg.duration} de viaje</span>` : ''}
              </div>
            </div>` : '';

          return `
          <div style="padding:16px 0;${si < stops.length - 1 ? '' : ''}">
            <div style="display:flex;gap:12px;align-items:flex-start">
              <div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;flex-shrink:0;
                          display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;margin-top:2px">${si + 1}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:1rem;font-weight:700;color:#2D1205;margin-bottom:2px">${esc(stop.name)}</div>
                ${stop.categoria ? `<div style="font-size:0.75rem;color:#A0522D;margin-bottom:1px">${esc(stop.categoria)} <em style="color:#bbb;font-style:italic;font-size:0.7rem">(el tiempo de permanencia depende de la actividad a realizar)</em></div>` : '<div style="font-size:0.7rem;color:#bbb;font-style:italic;margin-bottom:1px">El tiempo de permanencia depende de la actividad a realizar</div>'}
                ${stop.region    ? `<div style="font-size:0.72rem;color:#999;margin-bottom:4px">📍 ${esc(stop.region)}</div>` : ''}
                ${stop.descripcion ? `<p style="font-size:0.79rem;color:#555;line-height:1.55;margin:5px 0 6px;
                  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(stop.descripcion)}</p>` : ''}
                ${hasContact ? `
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px solid #f0ebe4">
                  ${stop.telefono ? `<span style="font-size:0.78rem;color:#444;font-weight:500">📞 ${esc(stop.telefono)}</span>` : ''}
                  ${stop.email   ? `<span style="font-size:0.78rem;color:#444;font-weight:500">✉️ ${esc(stop.email)}</span>` : ''}
                  ${waLink       ? `<span style="font-size:0.78rem;color:#128C7E;font-weight:600">💬 WhatsApp disponible</span>` : ''}
                </div>` : `<div style="font-size:0.72rem;color:#ccc;margin-top:4px;font-style:italic">Sin datos de contacto registrados</div>`}
              </div>
            </div>
            ${travelBlock}
            ${si < stops.length - 1 ? `<div style="border-bottom:1px solid #f0ebe4;margin-top:4px"></div>` : ''}
          </div>`;
        }).join('');

    return `
    <div style="break-inside:avoid;margin-bottom:28px;border:1px solid #e8ddd4;border-radius:12px;overflow:hidden">
      <div style="background:${color};color:#fff;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1rem;font-weight:700">${dayLabel}</span>
          <span style="font-size:0.8rem;opacity:0.85">${stops.length} parada${stops.length !== 1 ? 's' : ''}</span>
        </div>
        ${dayDistSummary}
      </div>
      <div style="padding:4px 18px 10px">${stopsHTML}</div>
    </div>`;
  }).join('');

  const totalStops = it.days.reduce((acc, d) => acc + d.stops.length, 0);
  const now        = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Itinerario: ${esc(it.name)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: #FAF7F4;
      color: #2D1205;
      line-height: 1.5;
    }
    .page { max-width: 680px; margin: 0 auto; padding: 40px 24px 60px; }
    .header { text-align: center; margin-bottom: 36px; padding-bottom: 28px; border-bottom: 2px solid #e8ddd4; }
    .header__logo { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 2px;
                    color: #A0522D; margin-bottom: 10px; }
    .header__title { font-family: 'Cormorant Garamond', serif; font-size: 2.4rem;
                     font-weight: 700; color: #2D1205; line-height: 1.2; margin-bottom: 8px; }
    .header__meta  { font-size: 0.82rem; color: #888; }
    .disclaimer {
      background: #FFF8F0; border: 1px solid #F0C080; border-radius: 10px;
      padding: 16px 20px; margin-bottom: 32px;
      font-size: 0.8rem; color: #7A4A10; line-height: 1.6;
    }
    .disclaimer strong { display: block; margin-bottom: 4px; font-size: 0.85rem; }
    @media print {
      body { background: #fff; }
      .page { padding: 20px; }
      .no-print { display: none !important; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header__logo">Turismo Rural Jujuy · Secretaría de Economía Popular</div>
    <h1 class="header__title">${esc(it.name)}</h1>
    <div class="header__meta">
      ${it.days.length} día${it.days.length !== 1 ? 's' : ''} · ${totalStops} parada${totalStops !== 1 ? 's' : ''} · Generado el ${now}
    </div>
  </div>

  <!-- Disclaimer -->
  <div class="disclaimer">
    <strong>⚠️ Importante: este es un itinerario de planificación</strong>
    Este documento es una guía de viaje armada con el Planificador de Turismo Rural Jujuy.
    <strong>No constituye una reserva confirmada.</strong>
    Para realizar y confirmar cada actividad, es imprescindible <strong>contactar directamente a cada emprendimiento</strong>
    y coordinar disponibilidad, fechas y condiciones con ellos.
    Los datos de contacto figuran en cada parada a continuación.
  </div>

  <!-- Days -->
  ${days}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e8ddd4;text-align:center;font-size:0.72rem;color:#bbb">
    Planificador de Turismo Rural Jujuy · turismoruraljujuy.com.ar
  </div>

</div>

<!-- Botón imprimir (no se imprime) -->
<div class="no-print" style="position:fixed;bottom:24px;right:24px">
  <button onclick="window.print()" style="
    background:#8B4513;color:#fff;border:none;border-radius:8px;
    padding:12px 22px;font-family:'DM Sans',sans-serif;font-size:0.9rem;
    font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.2)">
    🖨️ Guardar / Imprimir PDF
  </button>
</div>

</body>
</html>`;
}

/** Abre el itinerario en una nueva pestaña listo para imprimir / guardar como PDF */
function openItineraryPrint() {
  const it = getActive();
  if (!it) return;
  if (it.days.length === 0 || it.days.every(d => d.stops.length === 0)) {
    showToast('Agregá al menos una parada antes de exportar', 'error');
    return;
  }
  const html = buildItineraryHTML(it);
  const win  = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

/** Arma un texto plano del itinerario y abre WhatsApp Web para compartirlo */
function shareItineraryWhatsApp() {
  const it = getActive();
  if (!it) return;

  let text = `*${it.name}*\n_Itinerario de viaje — Turismo Rural Jujuy_\n\n`;

  it.days.forEach((day, idx) => {
    const rd = routeData[day.id];
    text += `*Día ${idx + 1}*`;
    if (rd) text += ` — 🛣️ ${rd.totalDist}${rd.totalTime !== '—' ? ' · ⏱️ ' + rd.totalTime + ' en ruta' : ''}`;
    text += '\n';
    if (day.stops.length === 0) {
      text += '  Sin paradas\n';
    } else {
      day.stops.map(enrichStopContact).forEach((stop, si) => {
        text += `  ${si + 1}. *${stop.name}*`;
        if (stop.categoria) text += ` _(${stop.categoria})_`;
        text += '\n';
        text += `     _(El tiempo de permanencia depende de la actividad a realizar)_\n`;
        if (stop.telefono) text += `     📞 ${stop.telefono}\n`;
        if (stop.email)    text += `     ✉️ ${stop.email}\n`;
        // Distancia a la siguiente parada
        const seg = rd?.segments?.[si];
        if (seg && si < day.stops.length - 1) {
          text += `     🚗 Hasta la siguiente parada: ${seg.distance}`;
          if (seg.duration !== '—') text += ` · ${seg.duration} de viaje`;
          text += '\n';
        }
      });
    }
    text += '\n';
  });

  text += '⚠️ *Importante:* este itinerario no es una reserva confirmada. Contactá a cada emprendimiento para coordinar disponibilidad y realizar la reserva.\n\n';
  text += '_Generado con el Planificador de Turismo Rural Jujuy — turismoruraljujuy.com.ar_';

  const encoded = encodeURIComponent(text);
  window.open(`https://wa.me/?text=${encoded}`, '_blank');
}

// Wire up the buttons
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnPrintItinerary')?.addEventListener('click', openItineraryPrint);
  document.getElementById('btnShareItinerary')?.addEventListener('click', openItineraryPrint); // También abre la vista de impresión
  document.getElementById('btnWhatsAppItinerary')?.addEventListener('click', shareItineraryWhatsApp);
});


// ═══════════════════════════════════════════════════════════
// RUTAS — RECORRIDO DEL DÍA EN EL MAPA
// ═══════════════════════════════════════════════════════════

const routeRenderers = {};
const routePolylines = [];
/** Almacena segmentos de distancia por dayId para usar en exportar/compartir */
const routeData = {};

function drawActiveRoute() {
  if (!mapInstance) return;
  clearAllRoutes();
  const day = getActiveDay();
  if (!day) return;
  const stops = day.stops.filter(s => s.lat && s.lng);
  if (stops.length < 2) return;

  const it    = getActive();
  const idx   = it?.days.findIndex(d => d.id === day.id) ?? 0;
  const color = DAY_COLORS[idx % DAY_COLORS.length];

  const origin      = { lat: stops[0].lat, lng: stops[0].lng };
  const destination = { lat: stops[stops.length-1].lat, lng: stops[stops.length-1].lng };
  const waypoints   = stops.slice(1, -1).map(s => ({ location: { lat: s.lat, lng: s.lng }, stopover: true }));

  const renderer = new google.maps.DirectionsRenderer({
    map:             mapInstance,
    suppressMarkers: true,
    polylineOptions: { strokeColor: color, strokeWeight: 4, strokeOpacity: 0.8 },
  });
  routeRenderers[day.id] = renderer;

  new google.maps.DirectionsService().route({
    origin, destination, waypoints,
    travelMode: google.maps.TravelMode.DRIVING,
    region:     'AR',
  }, (result, status) => {
    if (status === 'OK') {
      renderer.setDirections(result);
      showRouteDistances(result, stops, color);
    } else {
      console.warn('[Ruta] DirectionsService:', status, '— usando línea recta');
      drawFallbackRoute(stops, color);
    }
  });
}

function drawFallbackRoute(stops, color) {
  const path = stops.map(s => ({ lat: s.lat, lng: s.lng }));
  const poly = new google.maps.Polyline({
    path, map: mapInstance,
    strokeColor: color, strokeWeight: 3, strokeOpacity: 0.7,
    icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 }, offset: '100%' }],
  });
  routePolylines.push(poly);
  showFallbackDistances(stops, color);
}

function clearAllRoutes() {
  Object.values(routeRenderers).forEach(r => r.setMap(null));
  Object.keys(routeRenderers).forEach(k => delete routeRenderers[k]);
  routePolylines.forEach(p => p.setMap(null));
  routePolylines.length = 0;
  document.getElementById('routeInfoPanel')?.remove();
  // No borramos routeData — se mantiene para exportar aunque se limpie el mapa
}

function showRouteDistances(result, stops, color) {
  const legs = result.routes[0]?.legs ?? [];
  const segments = legs.map((leg, i) => ({
    from: stops[i]?.name ?? '—', to: stops[i+1]?.name ?? '—',
    distance: leg.distance?.text ?? '—', duration: leg.duration?.text ?? '—',
  }));
  const totalDist = legs.reduce((acc, l) => acc + (l.distance?.value ?? 0), 0);
  const totalTime = legs.reduce((acc, l) => acc + (l.duration?.value ?? 0), 0);
  // Guardar para exportar/compartir
  const day = getActiveDay();
  if (day) routeData[day.id] = { segments, totalDist: formatDistance(totalDist), totalTime: formatDuration(totalTime) };
  renderRoutePanel(segments, formatDistance(totalDist), formatDuration(totalTime), color);
}

function showFallbackDistances(stops, color) {
  const segments = [];
  let totalDist  = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const d = haversineKm(stops[i], stops[i+1]);
    totalDist += d;
    segments.push({ from: stops[i].name, to: stops[i+1].name, distance: d.toFixed(1) + ' km (aprox.)', duration: '—' });
  }
  // Guardar para exportar/compartir
  const day = getActiveDay();
  if (day) routeData[day.id] = { segments, totalDist: totalDist.toFixed(1) + ' km', totalTime: '—' };
  renderRoutePanel(segments, totalDist.toFixed(1) + ' km', '—', color);
}

function renderRoutePanel(segments, totalDist, totalTime, color) {
  document.getElementById('routeInfoPanel')?.remove();
  const day    = getActiveDay();
  const it     = getActive();
  const dayIdx = it?.days.findIndex(d => d.id === day?.id) ?? 0;

  const panel  = document.createElement('div');
  panel.id     = 'routeInfoPanel';
  panel.style.cssText = [
    'position:absolute', 'bottom:32px', 'right:12px', 'z-index:40',
    'background:rgba(255,252,248,0.96)', 'backdrop-filter:blur(12px)',
    'border:1px solid rgba(139,90,43,0.15)', 'border-radius:14px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.14)', 'padding:14px 16px',
    'max-width:260px', 'max-height:60vh', 'overflow-y:auto',
    "font-family:'DM Sans',sans-serif",
  ].join(';');

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block"></span>
        <span style="font-size:0.78rem;font-weight:700;color:#3D1F05">Día ${dayIdx + 1} — Recorrido</span>
      </div>
      <button onclick="document.getElementById('routeInfoPanel').remove()"
        style="background:none;border:none;cursor:pointer;color:#aaa;font-size:1.1rem;line-height:1;padding:0 2px">×</button>
    </div>
    <div style="font-size:0.7rem;color:#888;margin-bottom:10px;display:flex;gap:12px">
      <span>🛣️ ${totalDist}</span>
      ${totalTime !== '—' ? `<span>⏱️ ${totalTime}</span>` : ''}
    </div>
    ${segments.map((seg, i) => `
      <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;padding-bottom:8px;
                  ${i < segments.length - 1 ? 'border-bottom:1px solid rgba(0,0,0,0.06)' : ''}">
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:2px">
          <span style="width:6px;height:6px;border-radius:50%;background:${color};display:block"></span>
          <span style="width:1px;height:14px;background:${color};opacity:0.4;display:block"></span>
          <span style="width:6px;height:6px;border-radius:50%;background:${color};display:block"></span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.72rem;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(seg.from)}</div>
          <div style="font-size:0.68rem;color:#aaa;margin:1px 0">${seg.distance}${seg.duration !== '—' ? ' · ' + seg.duration : ''}</div>
          <div style="font-size:0.72rem;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(seg.to)}</div>
        </div>
      </div>`).join('')}`;

  document.getElementById('mapArea')?.appendChild(panel);
}

function haversineKm(a, b) {
  const R    = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h    = Math.sin(dLat/2)**2 +
    Math.cos(a.lat * Math.PI/180) * Math.cos(b.lat * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function formatDistance(m) {
  return m >= 1000 ? (m/1000).toFixed(1) + ' km' : m + ' m';
}

function formatDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}


// ═══════════════════════════════════════════════════════════
// EVENT LISTENERS — SIDEBAR
// ═══════════════════════════════════════════════════════════

// ─ Itinerary Title ─
const titleEl = document.getElementById('itineraryTitle');

titleEl.addEventListener('input', () => {
  const it = getActive();
  if (!it) return;
  const name = titleEl.textContent.trim();
  if (name) { renameItinerary(it.id, name); refreshSwitcherName(); }
});

titleEl.addEventListener('blur', () => {
  const it = getActive();
  if (it && !titleEl.textContent.trim()) titleEl.textContent = it.name;
});

titleEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
});

titleEl.addEventListener('paste', e => {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ');
  document.execCommand('insertText', false, text);
});

// ─ New Itinerary ─
document.getElementById('newItineraryBtn').addEventListener('click', () => {
  createItinerary('Nuevo itinerario', true);
  closeSwitcherDropdown();
  render();
  setTimeout(() => {
    titleEl.focus();
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }, 80);
});

// ─ Mode Toggle ─
document.querySelectorAll('.mode-toggle__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const it = getActive();
    if (!it) return;
    it.mode = btn.dataset.mode;
    it.updatedAt = Date.now();
    saveState();
    document.querySelectorAll('.mode-toggle__btn').forEach(b => {
      b.classList.toggle('mode-toggle__btn--active', b.dataset.mode === it.mode);
    });
    document.getElementById('dateRangeRow').hidden = it.mode !== 'dates';
    renderDaysList();
    updateEndDate(it);
  });
});

// ─ Start Date ─
document.getElementById('startDateInput').addEventListener('change', e => {
  const it = getActive();
  if (!it) return;
  it.startDate = e.target.value || null;
  it.updatedAt = Date.now();
  saveState();
  renderDaysList();
  updateEndDate(it);
});

// ─ Add Day ─
document.getElementById('addDayBtn').addEventListener('click', () => {
  const it = getActive();
  if (!it) return;
  const day = addDay(it.id);
  if (!day) return;

  const container = document.getElementById('daysList');
  const empty     = container.querySelector('.days-empty');
  if (empty) empty.remove();

  const idx  = it.days.length - 1;
  const card = buildDayCard(it, day, idx);
  container.appendChild(card);
  document.getElementById('addDayBtn').classList.remove('pulsing');
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);

  refreshMeta();
  updateEndDate(it);
  // Auto-set as active day
  setActiveDay(day.id);
});

// ─ Mobile Sidebar ─
const sidebarEl    = document.getElementById('sidebar');
const plannerEl    = document.getElementById('planner');
const mobileToggle = document.getElementById('mobileSidebarToggle');

mobileToggle.addEventListener('click', () => {
  const open = sidebarEl.classList.toggle('open');
  plannerEl.classList.toggle('sidebar-open', open);
  mobileToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

plannerEl.addEventListener('click', e => {
  if (
    window.innerWidth <= 768 &&
    sidebarEl.classList.contains('open') &&
    !sidebarEl.contains(e.target) &&
    !mobileToggle.contains(e.target)
  ) {
    sidebarEl.classList.remove('open');
    plannerEl.classList.remove('sidebar-open');
    mobileToggle.setAttribute('aria-expanded', 'false');
  }
});

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  render();
});