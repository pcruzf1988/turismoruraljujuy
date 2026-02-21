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

/** Parse a CSV string into array of objects */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    // Simple CSV parse (handles quoted fields)
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
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
const CSV_URL = './data/emprendimientos.csv';

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

  function commit() {
    const name = input.value.trim();
    if (name) {
      const stop = addStop(itineraryId, dayId, name);
      if (stop) {
        const list  = card.querySelector(`.stops-list[data-day-id="${dayId}"]`);
        const empty = list?.querySelector('.stops-empty');
        if (empty) empty.remove();
        if (list) list.appendChild(buildStopEl(stop, itineraryId, dayId));
        refreshDayBadge(card, itineraryId, dayId);
        refreshMeta();
      }
    }
    restoreBtn();
  }

  function restoreBtn() {
    const dayIndex = getActive()?.days.findIndex(d => d.id === dayId) ?? 0;
    addArea.innerHTML = '';
    addArea.appendChild(buildAddStopBtn(itineraryId, dayId, dayIndex + 1));
  }

  confirmBtn.addEventListener('click', commit);
  cancelBtn.addEventListener('click',  restoreBtn);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); restoreBtn(); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!addArea.contains(document.activeElement)) {
        if (input.value.trim()) commit(); else restoreBtn();
      }
    }, 160);
  });
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
let mapInstance    = null;
/** @type {google.maps.InfoWindow|null} */
let infoWindow     = null;
/** @type {google.maps.places.Autocomplete|null} */
let autocomplete   = null;
/** @type {google.maps.Marker|null} */
let searchMarker   = null;

/** All emprendimiento markers for filtering/reuse */
let emprendimientoMarkers = [];

/**
 * Called by Google Maps JS API via callback=initPlannerMap
 */
window.initPlannerMap = async function () {
  const loadingEl = document.getElementById('mapLoading');
  const errorEl   = document.getElementById('mapError');

  try {
    mapInstance = new google.maps.Map(document.getElementById('googleMap'), {
      center:            MAP_CENTER,
      zoom:              MAP_ZOOM,
      mapTypeId:         'terrain',
      disableDefaultUI:  false,
      zoomControl:       true,
      mapTypeControl:    false,
      scaleControl:      true,
      streetViewControl: false,
      rotateControl:     false,
      fullscreenControl: true,
      gestureHandling:   'greedy',
      styles: JUJUY_MAP_STYLE,
    });

    infoWindow = new google.maps.InfoWindow({ maxWidth: 290 });

    // Fade out loading
    loadingEl.classList.add('hidden');
    setTimeout(() => { loadingEl.hidden = true; }, 500);

    // Init autocomplete and load CSV
    initPlacesAutocomplete();
    await loadEmprendimientos();

  } catch (err) {
    console.error('[Planificador] Map init error:', err);
    loadingEl.hidden = true;
    errorEl.hidden   = false;
  }
};

// ─── Custom Map Style (earth tones, terrain) ───

const JUJUY_MAP_STYLE = [
  { featureType: 'water',      elementType: 'geometry',   stylers: [{ color: '#a8c8e0' }] },
  { featureType: 'landscape',  elementType: 'geometry',   stylers: [{ color: '#e8dcc0' }] },
  { featureType: 'road',       elementType: 'geometry',   stylers: [{ color: '#d4b98a' }, { lightness: 10 }] },
  { featureType: 'road',       elementType: 'labels.text.fill', stylers: [{ color: '#6b4c2a' }] },
  { featureType: 'poi.park',   elementType: 'geometry',   stylers: [{ color: '#b8d4a0' }] },
  { featureType: 'poi',        elementType: 'labels',     stylers: [{ visibility: 'simplified' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#5c3a1a' }] },
  { featureType: 'transit',    elementType: 'geometry',   stylers: [{ color: '#c8a87a' }] },
];

// ═══════════════════════════════════════════════════════════
// PLACES AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════

function initPlacesAutocomplete() {
  const input     = document.getElementById('placesSearchInput');
  const clearBtn  = document.getElementById('mapSearchClear');

  // Bias to Jujuy province
  const jujuyBounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(-24.5, -66.6),
    new google.maps.LatLng(-21.7, -64.2)
  );

  autocomplete = new google.maps.places.Autocomplete(input, {
    bounds:             jujuyBounds,
    strictBounds:       false,
    fields:             ['name', 'geometry', 'formatted_address', 'types', 'photos'],
    componentRestrictions: { country: 'ar' },
  });

  // Prevent form submit on Enter
  input.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

  // Show/hide clear button
  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value.trim();
  });

  clearBtn.addEventListener('click', () => {
    input.value     = '';
    clearBtn.hidden = true;
    if (searchMarker) { searchMarker.setMap(null); searchMarker = null; }
    infoWindow?.close();
    input.focus();
  });

  // Place selected
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    clearBtn.hidden = false;

    if (!place.geometry?.location) {
      showToast('No se encontró la ubicación.', 'error');
      return;
    }

    const loc = place.geometry.location;
    mapInstance.panTo(loc);
    mapInstance.setZoom(13);

    // Drop/move search marker
    if (searchMarker) {
      searchMarker.setPosition(loc);
    } else {
      searchMarker = new google.maps.Marker({
        position:  loc,
        map:       mapInstance,
        title:     place.name,
        icon:      buildMarkerIcon('place'),
        animation: google.maps.Animation.DROP,
        zIndex:    100,
      });
    }

    // Open popup
    const stopData = {
      name:    place.name,
      type:    'place',
      lat:     loc.lat(),
      lng:     loc.lng(),
      address: place.formatted_address || '',
    };

    openInfoWindow(searchMarker, stopData);
  });
}

// ═══════════════════════════════════════════════════════════
// CSV — EMPRENDIMIENTOS
// ═══════════════════════════════════════════════════════════

async function loadEmprendimientos() {
  try {
    const res  = await fetch(CSV_URL);
    if (!res.ok) { console.warn('[Planificador] CSV no encontrado:', CSV_URL); return; }
    const text = await res.text();
    const rows = parseCSV(text);
    placeEmprendimientoMarkers(rows);
  } catch (err) {
    console.warn('[Planificador] No se pudo cargar el CSV:', err.message);
    // No mostramos error al usuario — el mapa igual funciona sin los emprendimientos
  }
}

/**
 * Determine the region color from CSV row.
 * Tries common column name variations.
 */
function getRegionColor(row) {
  const regionVal = (row.region || row.Region || row.REGION || '').toLowerCase();
  if (regionVal.includes('puna'))     return REGION_COLORS.puna;
  if (regionVal.includes('quebrada')) return REGION_COLORS.quebrada;
  if (regionVal.includes('yunga'))    return REGION_COLORS.yungas;
  return REGION_COLORS.default;
}

function placeEmprendimientoMarkers(rows) {
  emprendimientoMarkers = [];

  for (const row of rows) {
    // Flexible column name support
    const latRaw  = row.lat    || row.Lat    || row.LAT    || row.latitud   || row.Latitud   || '';
    const lngRaw  = row.lng    || row.Lng    || row.LNG    || row.longitud  || row.Longitud  || row.lon || row.Lon || '';
    const nombre  = row.nombre || row.Nombre || row.NOMBRE || row.name      || row.Name      || '';
    const rubro   = row.rubro  || row.Rubro  || row.RUBRO  || row.categoria || row.categoria || '';
    const region  = row.region || row.Region || row.REGION || '';
    const tel     = row.telefono || row.Telefono || row.tel || '';
    const email   = row.email    || row.Email    || '';
    const desc    = row.descripcion || row.Descripcion || row.desc || '';

    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);

    if (!nombre || isNaN(lat) || isNaN(lng)) continue;

    const color  = getRegionColor(row);
    const marker = new google.maps.Marker({
      position:  { lat, lng },
      map:       mapInstance,
      title:     nombre,
      icon:      buildMarkerIcon('emprendimiento', color),
      zIndex:    10,
    });

    const stopData = {
      name:        nombre,
      type:        'emprendimiento',
      lat, lng,
      categoria:   rubro,
      region,
      telefono:    tel,
      email,
      descripcion: desc,
    };

    marker.addListener('click', () => openInfoWindow(marker, stopData));
    emprendimientoMarkers.push({ marker, data: stopData });
  }
}

// ─── Custom SVG Marker Icon ───

function buildMarkerIcon(type, color = '#8B4513') {
  const isEmp = type === 'emprendimiento';
  const size  = isEmp ? 34 : 30;
  // Star for emprendimientos, teardrop pin for places
  const svgStar = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 34 34">
    <circle cx="17" cy="17" r="14" fill="${color}" opacity="0.15"/>
    <circle cx="17" cy="17" r="10" fill="${color}"/>
    <path d="M17 10l2.09 4.26L24 15.27l-3.5 3.41.83 4.82L17 21.27l-4.33 2.23.83-4.82L10 15.27l4.91-.71L17 10z"
      fill="white"/>
  </svg>`;

  const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 4}" viewBox="0 0 30 36">
    <path d="M15 2C8.925 2 4 6.925 4 13c0 8.25 11 21 11 21S26 21.25 26 13c0-6.075-4.925-11-11-11z"
      fill="${color}"/>
    <circle cx="15" cy="13" r="5" fill="white"/>
  </svg>`;

  const svg = isEmp ? svgStar : svgPin;
  return {
    url:        'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(size, isEmp ? size : size + 4),
    anchor:     new google.maps.Point(size / 2, isEmp ? size / 2 : size + 4),
  };
}

// ═══════════════════════════════════════════════════════════
// INFO WINDOW (POPUP)
// ═══════════════════════════════════════════════════════════

function openInfoWindow(marker, stopData) {
  const it       = getActive();
  const activeDay = getActiveDay();

  const isEmp  = stopData.type === 'emprendimiento';
  const tagCls = isEmp ? 'tag-emprendimiento' : 'tag-place';
  const tagTxt = isEmp ? '⭐ Emprendimiento' : '📍 Lugar';

  // Check if already in active day
  const alreadyAdded = activeDay?.stops.some(
    s => s.name === stopData.name && Math.abs((s.lat ?? 0) - (stopData.lat ?? 0)) < 0.0001
  );

  const dayIdx   = it?.days.findIndex(d => d.id === activeDay?.id) ?? -1;
  const dayLabel = dayIdx >= 0 ? `Día ${dayIdx + 1}` : null;

  const btnLabel  = alreadyAdded
    ? '✓ Ya agregado'
    : dayLabel
      ? `Agregar a ${dayLabel}`
      : 'Seleccioná un día primero';

  const noDayMsg = !activeDay
    ? `<p class="map-popup__no-day">Creá o seleccioná un día en el panel</p>`
    : '';

  const metaRows = [
    stopData.categoria ? `<div class="map-popup__meta-row">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h7"/>
      </svg>
      <span>${esc(stopData.categoria)}</span>
    </div>` : '',
    stopData.telefono ? `<div class="map-popup__meta-row">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91A16 16 0 0 0 13 14.83l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2.02z"/>
      </svg>
      <span>${esc(stopData.telefono)}</span>
    </div>` : '',
    stopData.address ? `<div class="map-popup__meta-row">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      <span>${esc(stopData.address)}</span>
    </div>` : '',
  ].filter(Boolean).join('');

  const content = `
    <div class="map-popup">
      <div class="map-popup__header">
        <div class="map-popup__tag ${tagCls}">${tagTxt}</div>
        <h2 class="map-popup__name">${esc(stopData.name)}</h2>
        ${stopData.region ? `<p class="map-popup__sub">${esc(stopData.region)}</p>` : ''}
      </div>
      <div class="map-popup__body">
        ${stopData.descripcion ? `<p class="map-popup__desc">${esc(stopData.descripcion)}</p>` : ''}
        ${metaRows ? `<div class="map-popup__meta">${metaRows}</div>` : ''}
        <button class="map-popup__add-btn ${alreadyAdded ? 'added' : ''}"
          id="popupAddBtn"
          ${!activeDay || alreadyAdded ? 'disabled' : ''}
          aria-label="${esc(btnLabel)}">
          ${alreadyAdded
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Ya agregado'
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ${esc(btnLabel)}`
          }
        </button>
        ${noDayMsg}
      </div>
    </div>`;

  infoWindow.setContent(content);
  infoWindow.open({ anchor: marker, map: mapInstance });

  // Wire up add button after DOM insertion
  google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
    const btn = document.getElementById('popupAddBtn');
    if (!btn || alreadyAdded || !activeDay) return;

    btn.addEventListener('click', () => {
      const stop = addStopFromMap(it.id, activeDay.id, stopData);
      if (!stop) return;

      // Update sidebar
      const card     = document.querySelector(`.day-card[data-day-id="${activeDay.id}"]`);
      const list     = card?.querySelector(`.stops-list[data-day-id="${activeDay.id}"]`);
      const emptyEl  = list?.querySelector('.stops-empty');
      if (emptyEl) emptyEl.remove();
      if (list) list.appendChild(buildStopEl(stop, it.id, activeDay.id));
      if (card) refreshDayBadge(card, it.id, activeDay.id);
      refreshMeta();

      // Feedback
      btn.classList.add('added');
      btn.disabled = true;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Agregado';
      const idx = it.days.findIndex(d => d.id === activeDay.id);
      showToast(`${stopData.name} agregado al Día ${idx + 1}`, 'success');
    });
  });
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