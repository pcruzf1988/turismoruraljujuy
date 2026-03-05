// ============================================
// SISTEMA DE INTERNACIONALIZACIÓN (i18n)
// ============================================

class I18nManager {
    constructor() {
        this.currentLang = this.getSavedLanguage() || 'es';
        this.translations = {};
        this.initialized = false;
    }

    async init() {
        await this.loadTranslations(this.currentLang);
        this.setupLanguageSelector();
        this.applyTranslations();
        this.initialized = true;
    }

    getSavedLanguage() {
        return localStorage.getItem('language') || null;
    }

    saveLanguage(lang) {
        localStorage.setItem('language', lang);
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(`./translations/translations-${lang}.json`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.translations = await response.json();
            this.currentLang = lang;
        } catch (error) {
            if (lang !== 'es') {
                await this.loadTranslations('es');
            }
        }
    }

    async changeLanguage(lang) {
        if (lang === this.currentLang) return;
        document.body.classList.add('language-changing');
        await this.loadTranslations(lang);
        this.saveLanguage(lang);
        this.applyTranslations();
        this.updateLanguageSelector();
        if (window.ayniAssistant) {
            window.ayniAssistant.updateLanguage();
        }
        setTimeout(() => {
            document.body.classList.remove('language-changing');
        }, 500);
    }

    setupLanguageSelector() {
        const selectorBtn = document.getElementById('languageSelectorBtn');
        const dropdown = document.getElementById('languageDropdown');
        const options = document.querySelectorAll('.language-selector__option');

        if (!selectorBtn || !dropdown) return;

        selectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
            selectorBtn.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            dropdown.classList.remove('active');
            selectorBtn.classList.remove('active');
        });

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const lang = option.getAttribute('data-lang');
                this.changeLanguage(lang);
                dropdown.classList.remove('active');
                selectorBtn.classList.remove('active');
            });
        });

        this.updateLanguageSelector();
    }

    updateLanguageSelector() {
        const currentLangEl = document.getElementById('currentLanguage');
        const options = document.querySelectorAll('.language-selector__option');
        
        if (currentLangEl) {
            currentLangEl.textContent = this.currentLang.toUpperCase();
        }

        options.forEach(option => {
            const lang = option.getAttribute('data-lang');
            if (lang === this.currentLang) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.getNestedTranslation(key);
            if (translation) el.textContent = translation;
        });

        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            const translation = this.getNestedTranslation(key);
            if (translation) el.innerHTML = translation;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = this.getNestedTranslation(key);
            if (translation) el.placeholder = translation;
        });

        document.querySelectorAll('[data-i18n-option]').forEach(el => {
            const key = el.getAttribute('data-i18n-option');
            const prefix = el.getAttribute('data-i18n-option-prefix');
            const translation = this.getNestedTranslation(key);
            if (translation) {
                el.textContent = prefix ? `${prefix} ${translation}` : translation;
            }
        });
    }

    getNestedTranslation(key) {
        const keys = key.split('.');
        let value = this.translations;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return null;
            }
        }
        return value;
    }

    t(key) {
        return this.getNestedTranslation(key) || key;
    }

    getAyniTranslations() {
        return this.translations.ayni || {};
    }
}

const i18n = new I18nManager();

// ============================================
// UTILIDADES DE SEGURIDAD
// ============================================

function escapeHtml(str) {
    if (str == null || str === '') return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, (c) => map[c]);
}

function sanitizeHrefUrl(url, fallback = null) {
    if (!url || typeof url !== 'string') return fallback;
    const trimmed = url.trim();
    if (!trimmed) return fallback;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://') ||
        lower.startsWith('mailto:') || lower.startsWith('tel:')) {
        return trimmed;
    }
    return fallback;
}

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20200%22%3E%3Crect%20width%3D%22400%22%20height%3D%22200%22%20fill%3D%22%23DEB887%22%2F%3E%3C%2Fsvg%3E";

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2yQd6691oT5gGiVAH3mV0ItZZzhpIWCt7CXKbX6UqSpJy76teHK-o6hKeIYeu1p-I1NhFjNxvP0E/pub?gid=0&single=true&output=csv';

let emprendimientos = [];
let emprendimientosFiltrados = [];
let map = null;
let markersLayer = null;
let currentView = 'grid';

let currentPage = 1;
let itemsPerPage = 12;

const searchInput = document.getElementById('searchInput');
const regionFilter = document.getElementById('regionFilter');
const rubroFilter = document.getElementById('rubroFilter');
const comunidadFilter = document.getElementById('comunidadFilter');
const clearFiltersBtn = document.getElementById('clearFilters');
const emprendimientosGrid = document.getElementById('emprendimientosGrid');
const resultsCount = document.getElementById('resultsCount');
const gridViewBtn = document.getElementById('gridViewBtn');
const mapViewBtn = document.getElementById('mapViewBtn');
const mapView = document.getElementById('mapView');

const paginationControls = document.getElementById('paginationControls');
const itemsPerPageSelect = document.getElementById('itemsPerPage');
const firstPageBtn = document.getElementById('firstPage');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const lastPageBtn = document.getElementById('lastPage');
const pageInfo = document.getElementById('pageInfo');
const rangeInfo = document.getElementById('rangeInfo');

const paginationControlsBottom = document.getElementById('paginationControlsBottom');
const firstPageBtnBottom = document.getElementById('firstPageBottom');
const prevPageBtnBottom = document.getElementById('prevPageBottom');
const nextPageBtnBottom = document.getElementById('nextPageBottom');
const lastPageBtnBottom = document.getElementById('lastPageBottom');
const pageInfoBottom = document.getElementById('pageInfoBottom');
const rangeInfoBottom = document.getElementById('rangeInfoBottom');

// ============================================
// PARSER CSV
// ============================================

function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            if (currentField || currentRow.length > 0) {
                currentRow.push(currentField);
                if (currentRow.some(field => field.trim())) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
            }
        } else {
            currentField += char;
        }
    }
    
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        if (currentRow.some(field => field.trim())) {
            rows.push(currentRow);
        }
    }
    
    return rows;
}

const CSV_REQUIRED_HEADERS = ['Emprendimiento'];

// ============================================
// CARGA DE DATOS
// ============================================

async function cargarDatos() {
    try {
        if (resultsCount) resultsCount.textContent = i18n.t('views.loading');

        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error(`Error de red: ${response.status} ${response.statusText}`);
        const csvText = await response.text();
        const rows = parseCSV(csvText);

        if (rows.length < 2) throw new Error('El CSV está vacío o no tiene filas de datos');

        const headers = rows[0].map(h => (h || '').trim());
        const missingHeaders = CSV_REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (missingHeaders.length > 0) throw new Error(`Faltan columnas: ${missingHeaders.join(', ')}`);

        const datos = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] ? row[index].trim() : '';
            });
            if (obj.Emprendimiento && obj.Emprendimiento.length > 3 && (obj.Región || obj.Rubro)) {
                datos.push(obj);
            }
        }

        emprendimientos = datos;
        emprendimientosFiltrados = datos;

        llenarFiltros();
        renderizarEmprendimientos();
        actualizarContador();
        
    } catch (error) {
        mostrarError();
    }
}

// ============================================
// FILTROS
// ============================================

function llenarFiltros() {
    const regiones = [...new Set(emprendimientos.map(e => e.Región))].filter(r => r).sort();
    const rubros = [...new Set(emprendimientos.map(e => e.Rubro))].filter(r => r).sort();
    
    regiones.forEach(region => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        regionFilter.appendChild(option);
    });
    
    rubros.forEach(rubro => {
        const option = document.createElement('option');
        option.value = rubro;
        option.textContent = rubro;
        rubroFilter.appendChild(option);
    });

    actualizarFiltroComunidades();
}

function actualizarFiltroComunidades() {
    const regionSeleccionada = regionFilter.value;
    const rubroSeleccionado = rubroFilter.value;
    
    let emprendimientosFiltradosTemp = emprendimientos;
    if (regionSeleccionada) emprendimientosFiltradosTemp = emprendimientosFiltradosTemp.filter(e => e.Región === regionSeleccionada);
    if (rubroSeleccionado) emprendimientosFiltradosTemp = emprendimientosFiltradosTemp.filter(e => e.Rubro === rubroSeleccionado);
    
    const comunidades = [...new Set(emprendimientosFiltradosTemp.map(e => e['Comunidad / Pueblo']))].filter(r => r).sort();
    const comunidadActual = comunidadFilter.value;
    
    comunidadFilter.innerHTML = `<option value="">${i18n.t('filters.allCommunities')}</option>`;
    
    comunidades.forEach(comunidad => {
        const option = document.createElement('option');
        option.value = comunidad;
        option.textContent = comunidad;
        comunidadFilter.appendChild(option);
    });
    
    if (comunidades.includes(comunidadActual)) {
        comunidadFilter.value = comunidadActual;
    } else {
        comunidadFilter.value = '';
    }
}

// ============================================
// RENDERIZADO
// ============================================

function renderizarEmprendimientos() {
    emprendimientosGrid.innerHTML = '';
    
    if (emprendimientosFiltrados.length === 0) {
        mostrarEstadoVacio();
        ocultarPaginacion();
        return;
    }
    
    let emprendimientosAMostrar;
    
    if (itemsPerPage === 'all') {
        emprendimientosAMostrar = emprendimientosFiltrados;
        ocultarPaginacion();
    } else {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        emprendimientosAMostrar = emprendimientosFiltrados.slice(startIndex, endIndex);
        actualizarPaginacion();
    }
    
    emprendimientosAMostrar.forEach(emp => {
        const card = crearCard(emp);
        emprendimientosGrid.appendChild(card);
    });
}

// ============================================
// PAGINACIÓN
// ============================================

function calcularTotalPaginas() {
    if (itemsPerPage === 'all') return 1;
    return Math.ceil(emprendimientosFiltrados.length / itemsPerPage);
}

function actualizarPaginacion() {
    const totalPages = calcularTotalPaginas();
    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, emprendimientosFiltrados.length);
    const total = emprendimientosFiltrados.length;
    const pageText = `${i18n.t('pagination.page')} ${currentPage} ${i18n.t('pagination.of')} ${totalPages}`;
    const rangeText = `${startIndex}-${endIndex} ${i18n.t('pagination.of')} ${total}`;
    const canGoPrev = currentPage > 1;
    const canGoNext = currentPage < totalPages;

    if (paginationControls) paginationControls.style.display = 'flex';
    if (paginationControlsBottom && currentView === 'grid') paginationControlsBottom.style.display = 'flex';

    const centerControls = paginationControls?.querySelector('.pagination-controls__center');
    const rightControls = paginationControls?.querySelector('.pagination-controls__right');
    if (centerControls) centerControls.style.display = 'flex';
    if (rightControls) rightControls.style.display = 'flex';

    [pageInfo, pageInfoBottom].forEach(el => { if (el) el.textContent = pageText; });
    [rangeInfo, rangeInfoBottom].forEach(el => { if (el) el.textContent = rangeText; });

    [firstPageBtn, prevPageBtn, firstPageBtnBottom, prevPageBtnBottom].forEach(el => { if (el) el.disabled = !canGoPrev; });
    [nextPageBtn, lastPageBtn, nextPageBtnBottom, lastPageBtnBottom].forEach(el => { if (el) el.disabled = !canGoNext; });
}

function ocultarPaginacion() {
    if (paginationControls) paginationControls.style.display = 'flex';
    
    const centerControls = paginationControls?.querySelector('.pagination-controls__center');
    const rightControls = paginationControls?.querySelector('.pagination-controls__right');
    if (centerControls) centerControls.style.display = 'none';
    if (rightControls) rightControls.style.display = 'none';
    if (paginationControlsBottom) paginationControlsBottom.style.display = 'none';
}

function irAPagina(numeroPagina) {
    const totalPages = calcularTotalPaginas();
    if (numeroPagina < 1) currentPage = 1;
    else if (numeroPagina > totalPages) currentPage = totalPages;
    else currentPage = numeroPagina;
    
    renderizarEmprendimientos();
    
    const emprendimientosSection = document.getElementById('emprendimientos');
    if (emprendimientosSection) {
        emprendimientosSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function cambiarItemsPorPagina(valor) {
    if (valor === 'all') {
        itemsPerPage = 'all';
    } else {
        itemsPerPage = parseInt(valor);
    }
    currentPage = 1;
    renderizarEmprendimientos();
}

// ============================================
// UTILIDADES
// ============================================

function formatearFacebookURL(facebook) {
    if (!facebook) return null;
    const fb = facebook.trim();
    if (fb.startsWith('http://') || fb.startsWith('https://')) return fb;
    if (!fb.includes(' ') && !fb.includes('/')) return `https://www.facebook.com/${fb}`;
    return `https://www.facebook.com/search/top?q=${encodeURIComponent(fb)}`;
}

function convertirGoogleDriveURL(url) {
    if (!url || !url.includes('drive.google.com')) return url;
    
    let fileId = null;
    let match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (match) fileId = match[1];
    if (!fileId) { match = url.match(/\/d\/([a-zA-Z0-9-_]+)/); if (match) fileId = match[1]; }
    if (!fileId) { match = url.match(/[?&]id=([a-zA-Z0-9-_]+)/); if (match) fileId = match[1]; }
    
    if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
    return url;
}

// ============================================
// CARDS
// ============================================

function crearCard(emp) {
    const card = document.createElement('div');
    card.className = 'emprendimiento-card';
    
    const telefono = (emp['Teléfono( sin guiones ni espacios: 5493884123456)'] || '').replace(/\D/g, '');
    const instagram = (emp['Instagram (solo el usuario, sin @)'] || '').replace(/[^a-zA-Z0-9_.]/g, '');
    const facebook = emp['Facebook (solo el nombre de usuario)'];
    const email = emp['Correo electrónico'];
    const comunidad = emp['Comunidad / Pueblo'];
    
    let imagenUrl = PLACEHOLDER_IMAGE;
    if (emp.Imagen && emp.Imagen.trim()) {
        const url = convertirGoogleDriveURL(emp.Imagen.trim());
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) imagenUrl = url;
    }
    
    const nombre = escapeHtml(emp.Emprendimiento || '');
    
    card.innerHTML = `
    <div class="emprendimiento-card__image-container">
        <img 
            data-src="${escapeHtml(imagenUrl)}" 
            src="${PLACEHOLDER_IMAGE}"
            alt="${nombre}"
            class="emprendimiento-card__image lazy-load"
            loading="lazy"
        >
        <div class="emprendimiento-card__badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="16"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <span>${escapeHtml(i18n.t('cards.viewMore'))}</span>
        </div>
    </div>
    <div class="emprendimiento-card__content">
        <div class="emprendimiento-card__header">
            <h3 class="emprendimiento-card__title">${nombre}</h3>
            <div class="emprendimiento-card__tags">
                ${emp.Región ? `<span class="emprendimiento-card__tag emprendimiento-card__tag--region">${escapeHtml(emp.Región)}</span>` : ''}
                ${emp.Rubro ? `<span class="emprendimiento-card__tag emprendimiento-card__tag--rubro">${escapeHtml(emp.Rubro)}</span>` : ''}
            </div>
        </div>
        ${comunidad ? `<p class="emprendimiento-card__location">${escapeHtml(comunidad)}</p>` : ''}
        ${emp.Descripción ? `<p class="emprendimiento-card__description">${escapeHtml(emp.Descripción)}</p>` : ''}
        <div class="emprendimiento-card__footer">
            <div class="emprendimiento-card__contact">
                ${telefono ? `
                    <a href="https://wa.me/${telefono}" target="_blank" class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--whatsapp" onclick="event.stopPropagation()" title="WhatsApp">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </a>` : ''}
                ${instagram ? `
                    <a href="https://instagram.com/${instagram}" target="_blank" class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--instagram" onclick="event.stopPropagation()" title="Instagram">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                    </a>` : ''}
                ${facebook ? `
                    <a href="${formatearFacebookURL(facebook)}" target="_blank" class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--facebook" onclick="event.stopPropagation()" title="Facebook">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </a>` : ''}
                ${email ? `
                    <a href="mailto:${escapeHtml(email)}" class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--email" onclick="event.stopPropagation()" title="Email">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </a>` : ''}
            </div>
        </div>
    </div>
    `;
    
    card.addEventListener('click', () => abrirModal(emp));
    return card;
}

function mostrarEstadoVacio() {
    emprendimientosGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state__icon">🔍</div>
            <h3 class="empty-state__title">${i18n.t('cards.noResults')}</h3>
            <p class="empty-state__text">${i18n.t('cards.noResultsText')}</p>
        </div>
    `;
}

function mostrarError() {
    emprendimientosGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state__icon">⚠️</div>
            <h3 class="empty-state__title">${i18n.t('cards.error')}</h3>
            <p class="empty-state__text">${i18n.t('cards.errorText')}</p>
        </div>
    `;
    resultsCount.textContent = i18n.t('cards.error');
}

function actualizarContador() {
    const total = emprendimientos.length;
    const mostrados = emprendimientosFiltrados.length;
    const countText = i18n.t('cards.resultsCount');
    
    if (mostrados === total) {
        resultsCount.textContent = `${i18n.t('pagination.showing')} ${total} ${countText}`;
    } else {
        resultsCount.textContent = `${i18n.t('pagination.showing')} ${mostrados} ${i18n.t('pagination.of')} ${total} ${countText}`;
    }
}

function aplicarFiltros() {
    const searchTerm = searchInput.value.toLowerCase();
    const regionSeleccionada = regionFilter.value;
    const rubroSeleccionado = rubroFilter.value;
    const comunidadSeleccionada = comunidadFilter.value;
    
    emprendimientosFiltrados = emprendimientos.filter(emp => {
        const matchSearch = searchTerm === '' || 
            emp.Emprendimiento.toLowerCase().includes(searchTerm) ||
            (emp.Descripción && emp.Descripción.toLowerCase().includes(searchTerm)) ||
            (emp['Comunidad / Pueblo'] && emp['Comunidad / Pueblo'].toLowerCase().includes(searchTerm));
        const matchRegion = regionSeleccionada === '' || emp.Región === regionSeleccionada;
        const matchRubro = rubroSeleccionado === '' || emp.Rubro === rubroSeleccionado;
        const matchComunidad = comunidadSeleccionada === '' || emp['Comunidad / Pueblo'] === comunidadSeleccionada;
        return matchSearch && matchRegion && matchRubro && matchComunidad;
    });
    
    currentPage = 1;
    renderizarEmprendimientos();
    actualizarContador();
    actualizarMarcadores();
}

function limpiarFiltros() {
    searchInput.value = '';
    regionFilter.value = '';
    rubroFilter.value = '';
    comunidadFilter.value = '';
    actualizarFiltroComunidades();
    aplicarFiltros();
}

searchInput.addEventListener('input', aplicarFiltros);
regionFilter.addEventListener('change', () => { actualizarFiltroComunidades(); aplicarFiltros(); });
rubroFilter.addEventListener('change', () => { actualizarFiltroComunidades(); aplicarFiltros(); });
comunidadFilter.addEventListener('change', aplicarFiltros);
clearFiltersBtn.addEventListener('click', limpiarFiltros);

// ============================================
// MODAL
// ============================================

const modal = document.getElementById('modalEmprendimiento');
const modalClose = document.getElementById('modalClose');
const modalContent = document.getElementById('modalContent');
let currentSlide = 0;
let lastFocusedElement = null;

function abrirModal(emprendimiento) {
    currentSlide = 0;
    lastFocusedElement = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    
    const telefono = emprendimiento['Teléfono( sin guiones ni espacios: 5493884123456)'];
    const instagram = emprendimiento['Instagram (solo el usuario, sin @)'];
    const facebook = emprendimiento['Facebook (solo el nombre de usuario)'];
    const email = emprendimiento['Correo electrónico'];
    const comunidad = emprendimiento['Comunidad / Pueblo'];
    const infoAtencion = emprendimiento['Info / Atención / Condiciones de reserva'];
    const ubicacion = emprendimiento['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)'];
    const coords = parsearCoordenadas(ubicacion);
    
    const imagenes = [
        emprendimiento.Imagen,
        emprendimiento.Imagen2,
        emprendimiento.Imagen3,
        emprendimiento.Imagen4
    ]
        .filter(img => img && img.trim())
        .map(img => convertirGoogleDriveURL(img.trim()))
        .filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));
    
    if (imagenes.length === 0) imagenes.push(PLACEHOLDER_IMAGE);
    
    const webUrl = sanitizeHrefUrl(emprendimiento.Web);
    const nombreModal = escapeHtml(emprendimiento.Emprendimiento || '');
    const regionModal = escapeHtml(emprendimiento.Región || '');
    const rubroModal = escapeHtml(emprendimiento.Rubro || '');
    const comunidadModal = escapeHtml(emprendimiento['Comunidad / Pueblo'] || '');
    const descripcionModal = escapeHtml(emprendimiento.Descripción || '');
    const infoModal = escapeHtml(emprendimiento['Info / Atención / Condiciones de reserva'] || '');
    
    modalContent.innerHTML = `
        <div class="modal__gallery">
            <div class="modal__gallery-track" id="galleryTrack">
                ${imagenes.map(img => {
                    const safeImg = (img.startsWith('data:')) ? img : escapeHtml(img);
                    return `<img src="${safeImg}" alt="${nombreModal}" class="modal__gallery-image" onerror="this.src='${PLACEHOLDER_IMAGE.replace(/'/g, "\\'")}'">`;
                }).join('')}
            </div>
            ${imagenes.length > 1 ? `
                <div class="modal__gallery-nav">
                    <button class="modal__gallery-btn" id="prevBtn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button class="modal__gallery-btn" id="nextBtn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
                <div class="modal__gallery-dots">
                    ${imagenes.map((_, index) => `<button class="modal__gallery-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>`).join('')}
                </div>
            ` : ''}
        </div>
        <div class="modal__info">
            <div class="modal__header">
                <h2 id="modalTitle" class="modal__title">${nombreModal}</h2>
                <div class="modal__tags">
                    ${emprendimiento.Región ? `<span class="modal__tag modal__tag--region">${regionModal}</span>` : ''}
                    ${emprendimiento.Rubro ? `<span class="modal__tag modal__tag--rubro">${rubroModal}</span>` : ''}
                </div>
                ${comunidad ? `<p class="modal__location">${comunidadModal}</p>` : ''}
            </div>
            ${emprendimiento.Descripción ? `
                <div class="modal__section">
                    <h3 class="modal__section-title">${escapeHtml(i18n.t('modal.description'))}</h3>
                    <p class="modal__section-content">${descripcionModal}</p>
                </div>
            ` : ''}
            ${infoAtencion ? `
                <div class="modal__section">
                    <h3 class="modal__section-title">${escapeHtml(i18n.t('modal.infoConditions'))}</h3>
                    <p class="modal__section-content">${infoModal}</p>
                </div>
            ` : ''}
            <div class="modal__contacts">
                ${telefono ? `
                    <a href="https://wa.me/${telefono}" target="_blank" rel="noopener noreferrer" class="modal__contact-btn modal__contact-btn--whatsapp" title="WhatsApp">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        <span>WhatsApp</span>
                    </a>` : ''}
                ${instagram ? `
                    <a href="https://instagram.com/${instagram}" target="_blank" rel="noopener noreferrer" class="modal__contact-btn modal__contact-btn--instagram" title="Instagram">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        <span>Instagram</span>
                    </a>` : ''}
                ${facebook ? `
                    <a href="${escapeHtml(formatearFacebookURL(facebook) || '')}" target="_blank" rel="noopener noreferrer" class="modal__contact-btn modal__contact-btn--facebook" title="Facebook">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        <span>Facebook</span>
                    </a>` : ''}
                ${email ? `
                    <a href="mailto:${escapeHtml(email)}" class="modal__contact-btn modal__contact-btn--email" title="Email">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        <span>Email</span>
                    </a>` : ''}
                ${webUrl ? `
                    <a href="${escapeHtml(webUrl)}" target="_blank" rel="noopener noreferrer" class="modal__contact-btn modal__contact-btn--web" title="${escapeHtml(i18n.t('modal.website'))}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        <span>${i18n.t('modal.website')}</span>
                    </a>` : ''}
                ${coords ? `
                    <a href="https://www.google.com/maps/search/?api=1&query=${coords[0]},${coords[1]}" target="_blank" rel="noopener noreferrer" class="modal__contact-btn modal__contact-btn--maps" title="${escapeHtml(i18n.t('modal.howToGet'))}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-4.198 0-8 3.403-8 7.602 0 4.198 3.469 9.21 8 16.398 4.531-7.188 8-12.2 8-16.398 0-4.199-3.801-7.602-8-7.602zm0 11c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3z"/></svg>
                        <span>${i18n.t('modal.howToGet')}</span>
                    </a>` : ''}
            </div>
        </div>
    `;
    
    if (imagenes.length > 1) setupGalleryNavigation(imagenes.length);
    setTimeout(() => { if (modalClose) modalClose.focus(); }, 100);
}

function setupGalleryNavigation(totalImages) {
    const track = document.getElementById('galleryTrack');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const dots = document.querySelectorAll('.modal__gallery-dot');
    
    function updateGallery() {
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
        dots.forEach((dot, index) => dot.classList.toggle('active', index === currentSlide));
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === totalImages - 1;
    }
    
    prevBtn.addEventListener('click', () => { if (currentSlide > 0) { currentSlide--; updateGallery(); } });
    nextBtn.addEventListener('click', () => { if (currentSlide < totalImages - 1) { currentSlide++; updateGallery(); } });
    dots.forEach((dot, index) => { dot.addEventListener('click', () => { currentSlide = index; updateGallery(); }); });
}

function cerrarModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusedElement && lastFocusedElement.focus) lastFocusedElement.focus();
}

modalClose.addEventListener('click', cerrarModal);
modal.querySelector('.modal__overlay').addEventListener('click', cerrarModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) cerrarModal();
});

// ============================================
// MAPA INTERACTIVO
// ============================================

function parsearCoordenadas(ubicacion) {
    if (!ubicacion || typeof ubicacion !== 'string') return null;
    const coords = ubicacion.split(',').map(c => c.trim());
    if (coords.length === 2) {
        const lat = parseFloat(coords[0]);
        const lng = parseFloat(coords[1]);
        if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
    return null;
}

function inicializarMapa() {
    const mapContainer = document.getElementById('map');
    mapContainer.style.height = '600px';
    mapContainer.style.width = '100%';
    
    map = L.map('map', { center: [-23.8, -65.5], zoom: 9, minZoom: 7, maxZoom: 16, zoomControl: true, scrollWheelZoom: true });
    
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 16 }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB', maxZoom: 16, subdomains: 'abcd' }).addTo(map);
    
    markersLayer = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            let size = count >= 10 ? 'large' : count >= 5 ? 'medium' : 'small';
            return L.divIcon({ html: `<div><span>${count}</span></div>`, className: `marker-cluster marker-cluster-${size}`, iconSize: L.point(40, 40) });
        }
    });
    
    map.addLayer(markersLayer);
    actualizarMarcadores();
}

function obtenerIconoPorRubroYRegion(rubro, region) {
    const rubroLower = rubro ? rubro.toLowerCase() : '';
    const regionLower = region ? region.toLowerCase() : '';
    
    let tipoRubro = 'experiencia';
    if (rubroLower.includes('alojamiento') || rubroLower.includes('hospedaje')) tipoRubro = 'alojamiento';
    else if (rubroLower.includes('artesanía') || rubroLower.includes('artesano')) tipoRubro = 'artesania';
    else if (rubroLower.includes('caballo') || rubroLower.includes('paseo')) tipoRubro = 'caballo';
    else if (rubroLower.includes('gastronom') || rubroLower.includes('comida')) tipoRubro = 'gastronomia';
    else if (rubroLower.includes('guía') || rubroLower.includes('guia')) tipoRubro = 'guia';
    else if (rubroLower.includes('experiencia')) tipoRubro = 'experiencia';
    
    let colorRegion = 'bordo';
    if (regionLower.includes('puna')) colorRegion = 'amarillo';
    else if (regionLower.includes('yungas')) colorRegion = 'verde';
    else if (regionLower.includes('quebrada')) colorRegion = 'bordo';
    
    return `./assets/${tipoRubro}-${colorRegion}.png`;
}

function crearIconoPersonalizado(rubro, region) {
    return L.icon({ iconUrl: obtenerIconoPorRubroYRegion(rubro, region), iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -40], className: 'custom-marker-icon' });
}

function actualizarMarcadores() {
    if (!map || !markersLayer) return;
    markersLayer.clearLayers();
    
    emprendimientosFiltrados.forEach((emprendimiento, index) => {
        const coords = parsearCoordenadas(emprendimiento['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)']);
        if (coords) {
            const marker = L.marker(coords, { icon: crearIconoPersonalizado(emprendimiento.Rubro, emprendimiento.Región) });
            
            let imagenUrl = PLACEHOLDER_IMAGE;
            if (emprendimiento.Imagen && emprendimiento.Imagen.trim()) {
                const url = convertirGoogleDriveURL(emprendimiento.Imagen.trim());
                if (url && (url.startsWith('http://') || url.startsWith('https://'))) imagenUrl = url;
            }
            
            const nombrePopup = escapeHtml(emprendimiento.Emprendimiento || '');
            const regionPopup = escapeHtml(emprendimiento.Región || '');
            const rubroPopup = escapeHtml(emprendimiento.Rubro || '');
            
            const popupContent = `
                <div class="map-popup">
                    <img src="${escapeHtml(imagenUrl)}" alt="${nombrePopup}" class="map-popup__image" onerror="this.src='${PLACEHOLDER_IMAGE.replace(/'/g, "\\'")}'" >
                    <h4 class="map-popup__title">${nombrePopup}</h4>
                    <div class="map-popup__tags">
                        ${emprendimiento.Región ? `<span class="map-popup__tag">${regionPopup}</span>` : ''}
                        ${emprendimiento.Rubro ? `<span class="map-popup__tag">${rubroPopup}</span>` : ''}
                    </div>
                    <button class="map-popup__btn" onclick="window.abrirModalDesdeIndex(${index})">${escapeHtml(i18n.t('modal.viewDetails'))}</button>
                </div>
            `;
            
            marker.bindPopup(popupContent, { maxWidth: 250, className: 'custom-popup' });
            markersLayer.addLayer(marker);
        }
    });
    
    if (markersLayer.getLayers().length > 0) {
        map.fitBounds(markersLayer.getBounds(), { padding: [50, 50], maxZoom: 15 });
    }
}

window.abrirModalDesdeIndex = function(index) {
    const emprendimiento = emprendimientosFiltrados[parseInt(index, 10)];
    if (emprendimiento) abrirModal(emprendimiento);
};

function cambiarVista(vista) {
    currentView = vista;
    
    if (vista === 'grid') {
        emprendimientosGrid.style.display = 'grid';
        mapView.style.display = 'none';
        if (paginationControls && emprendimientosFiltrados.length > 0) paginationControls.style.display = 'flex';
        if (paginationControlsBottom && itemsPerPage !== 'all' && emprendimientosFiltrados.length > 0) paginationControlsBottom.style.display = 'flex';
        gridViewBtn.classList.add('view-toggle__btn--active');
        mapViewBtn.classList.remove('view-toggle__btn--active');
    } else {
        emprendimientosGrid.style.display = 'none';
        mapView.style.display = 'block';
        if (paginationControls) paginationControls.style.display = 'none';
        if (paginationControlsBottom) paginationControlsBottom.style.display = 'none';
        gridViewBtn.classList.remove('view-toggle__btn--active');
        mapViewBtn.classList.add('view-toggle__btn--active');
        
        if (!map) {
            mapView.style.display = 'block';
            const container = document.getElementById('map');
            container.style.height = '600px';
            container.style.width = '100%';
            container.offsetHeight;
            inicializarMapa();
            setTimeout(() => { map.invalidateSize(); }, 50);
        } else {
            setTimeout(() => {
                map.invalidateSize();
                if (markersLayer && markersLayer.getLayers().length > 0) {
                    map.fitBounds(markersLayer.getBounds(), { padding: [50, 50], maxZoom: 15 });
                }
            }, 100);
        }
    }
}

if (gridViewBtn) gridViewBtn.addEventListener('click', () => cambiarVista('grid'));
if (mapViewBtn) mapViewBtn.addEventListener('click', () => cambiarVista('map'));

// ============================================
// EVENT LISTENERS PAGINACIÓN
// ============================================

if (itemsPerPageSelect) itemsPerPageSelect.addEventListener('change', (e) => cambiarItemsPorPagina(e.target.value));
if (firstPageBtn) firstPageBtn.addEventListener('click', () => irAPagina(1));
if (prevPageBtn) prevPageBtn.addEventListener('click', () => irAPagina(currentPage - 1));
if (nextPageBtn) nextPageBtn.addEventListener('click', () => irAPagina(currentPage + 1));
if (lastPageBtn) lastPageBtn.addEventListener('click', () => irAPagina(calcularTotalPaginas()));
if (firstPageBtnBottom) firstPageBtnBottom.addEventListener('click', () => irAPagina(1));
if (prevPageBtnBottom) prevPageBtnBottom.addEventListener('click', () => irAPagina(currentPage - 1));
if (nextPageBtnBottom) nextPageBtnBottom.addEventListener('click', () => irAPagina(currentPage + 1));
if (lastPageBtnBottom) lastPageBtnBottom.addEventListener('click', () => irAPagina(calcularTotalPaginas()));

// ============================================
// INICIALIZACIÓN PAGINACIÓN
// ============================================

if (paginationControls) {
    paginationControls.style.display = 'flex';
    const centerControls = paginationControls.querySelector('.pagination-controls__center');
    const rightControls = paginationControls.querySelector('.pagination-controls__right');
    if (centerControls) centerControls.style.display = 'none';
    if (rightControls) rightControls.style.display = 'none';
}

// ============================================
// LAZY LOADING
// ============================================

function initLazyLoading() {
    const lazyImages = document.querySelectorAll('img.lazy-load');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const realSrc = img.getAttribute('data-src');
                    if (realSrc) {
                        const tempImg = new Image();
                        tempImg.onload = () => { img.src = realSrc; img.classList.add('loaded'); };
                        tempImg.onerror = () => { img.src = PLACEHOLDER_IMAGE; img.classList.add('loaded'); };
                        tempImg.src = realSrc;
                    }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '50px' });
        
        lazyImages.forEach(img => imageObserver.observe(img));
    } else {
        lazyImages.forEach(img => {
            const realSrc = img.getAttribute('data-src');
            if (realSrc) img.src = realSrc;
        });
    }
}

const renderizarEmprendimientosOriginal = renderizarEmprendimientos;
renderizarEmprendimientos = function() {
    renderizarEmprendimientosOriginal();
    setTimeout(() => { initLazyLoading(); }, 0);
};

// ============================================
// ASISTENTE VIRTUAL AYNI
// ============================================

class AyniAssistant {
    constructor() {
        this.button = document.getElementById('ayniButton');
        this.chat = document.getElementById('ayniChat');
        this.closeBtn = document.getElementById('ayniClose');
        this.messagesContainer = document.getElementById('ayniMessages');
        this.input = document.getElementById('ayniInput');
        this.sendBtn = document.getElementById('ayniSend');
        this.badge = document.getElementById('ayniBadge');
        this.suggestionsContainer = document.getElementById('ayniSuggestions');
        
        this.isOpen = false;
        this.isTyping = false;
        this.messageQueue = [];
        this.conversationHistory = [];
        
        this.toggle = this.toggle.bind(this);
        this.close = this.close.bind(this);
        this.handleSend = this.handleSend.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleSuggestion = this.handleSuggestion.bind(this);
        
        this.init();
    }
    
    init() {
        this.button.addEventListener('click', this.toggle);
        this.closeBtn.addEventListener('click', this.close);
        this.sendBtn.addEventListener('click', this.handleSend);
        this.input.addEventListener('keypress', this.handleKeyPress);
        
        const suggestions = this.suggestionsContainer.querySelectorAll('.ayni-assistant__suggestion');
        suggestions.forEach(suggestion => suggestion.addEventListener('click', this.handleSuggestion));
        
        setTimeout(() => { this.showBadge(1); }, 3000);
    }
    
    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }
    
    open() {
        this.isOpen = true;
        this.chat.classList.add('active');
        this.button.classList.add('active');
        this.hideBadge();
        setTimeout(() => { this.input.focus(); }, 300);
        setTimeout(() => { this.button.classList.remove('active'); }, 500);
    }
    
    close() {
        this.isOpen = false;
        this.chat.classList.remove('active');
    }
    
    handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSend();
        }
    }
    
    handleSend() {
        const message = this.input.value.trim();
        if (message && !this.isTyping) {
            this.sendMessage(message);
            this.input.value = '';
        }
    }
    
    handleSuggestion(e) {
        const messageKey = e.currentTarget.getAttribute('data-message-key');
        if (messageKey) {
            const ayniT = i18n.getAyniTranslations();
            const message = ayniT.suggestions?.[messageKey] || messageKey;
            this.sendMessage(message);
            this.hideSuggestions();
        }
    }
    
    async sendMessage(text) {
        this.addMessage(text, 'user');
        this.hideSuggestions();
        this.showTyping();
        this.conversationHistory.push({ role: 'user', content: text });

        try {
            const response = await fetch('https://ayni-worker.pcruzf1988.workers.dev', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: this.conversationHistory }),
            });

            const data = await response.json();
            const assistantText = data.content?.[0]?.text || 
                'No pude obtener una respuesta en este momento. Intentá de nuevo 🙏';

            this.conversationHistory.push({ role: 'assistant', content: assistantText });
            this.hideTyping();
            this.addMessage(assistantText, 'assistant');

        } catch (error) {
            this.hideTyping();
            this.addMessage('Tuve un problema de conexión. Por favor, intentá de nuevo en un momento 🙏', 'assistant');
        }
    }
    
    addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ayni-assistant__message ayni-assistant__message--${type}`;

        const time = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        const bubble = document.createElement('div');
        bubble.className = 'ayni-assistant__message-bubble';
        bubble.innerHTML = this.renderMarkdown(text);

        const timeEl = document.createElement('div');
        timeEl.className = 'ayni-assistant__message-time';
        timeEl.textContent = time;

        const wrapper = document.createElement('div');
        wrapper.appendChild(bubble);
        wrapper.appendChild(timeEl);

        if (type === 'assistant') {
            const avatar = document.createElement('img');
            avatar.src = './assets/Ayni.png';
            avatar.alt = 'Ayni';
            avatar.className = 'ayni-assistant__message-avatar';
            messageDiv.appendChild(avatar);
        }

        messageDiv.appendChild(wrapper);
        this.messagesContainer.appendChild(messageDiv);

        if (type === 'user') {
            this.scrollToBottom();
        } else {
            messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    renderMarkdown(text) {
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        return escaped
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, 
                '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#8B2500;font-weight:600;text-decoration:underline;">$1</a>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }
    
    showTyping() {
        this.isTyping = true;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ayni-assistant__typing';
        typingDiv.id = 'ayniTyping';
        typingDiv.innerHTML = `
            <img src="./assets/Ayni.png" alt="Ayni" class="ayni-assistant__message-avatar">
            <div class="ayni-assistant__typing-bubble">
                <div class="ayni-assistant__typing-dot"></div>
                <div class="ayni-assistant__typing-dot"></div>
                <div class="ayni-assistant__typing-dot"></div>
            </div>
        `;
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }
    
    hideTyping() {
        this.isTyping = false;
        const typingDiv = document.getElementById('ayniTyping');
        if (typingDiv) typingDiv.remove();
    }
    
    updateLanguage() {
        const welcomeText = document.querySelector('.ayni-assistant__welcome-text');
        if (welcomeText) {
            const ayniT = i18n.getAyniTranslations();
            welcomeText.innerHTML = ayniT.welcome || '';
        }
    }
    
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    showBadge(count) {
        this.badge.textContent = count;
        this.badge.classList.remove('hidden');
    }
    
    hideBadge() {
        this.badge.classList.add('hidden');
    }
    
    hideSuggestions() {
        this.suggestionsContainer.classList.add('hidden');
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    await cargarDatos();
    window.ayniAssistant = new AyniAssistant();
});