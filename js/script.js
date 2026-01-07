// URL del CSV publicado
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQJ2yQd6691oT5gGiVAH3mV0ItZZzhpIWCt7CXKbX6UqSpJy76teHK-o6hKeIYeu1p-I1NhFjNxvP0E/pub?gid=0&single=true&output=csv';

// Variables globales
let emprendimientos = [];
let emprendimientosFiltrados = [];

// Elementos del DOM
const searchInput = document.getElementById('searchInput');
const regionFilter = document.getElementById('regionFilter');
const rubroFilter = document.getElementById('rubroFilter');
const clearFiltersBtn = document.getElementById('clearFilters');
const emprendimientosGrid = document.getElementById('emprendimientosGrid');
const resultsCount = document.getElementById('resultsCount');

// Parser de CSV robusto que maneja saltos de línea dentro de comillas
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
                // Comilla doble escapada ""
                currentField += '"';
                i++;
            } else {
                // Toggle estado de comillas
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            // Fin de campo
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
            // Fin de fila
            if (char === '\r' && nextChar === '\n') {
                i++; // Saltar \n en \r\n
            }
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
    
    // Agregar última fila si existe
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        if (currentRow.some(field => field.trim())) {
            rows.push(currentRow);
        }
    }
    
    return rows;
}

// Función para cargar y parsear el CSV
async function cargarDatos() {
    try {
        resultsCount.textContent = 'Cargando emprendimientos...';
        
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        
        console.log('CSV descargado, parseando...');
        
        const rows = parseCSV(csvText);
        
        if (rows.length === 0) {
            throw new Error('No se pudieron parsear datos del CSV');
        }
        
        // Primera fila son los headers
        const headers = rows[0].map(h => h.trim());
        console.log('Headers encontrados:', headers);
        console.log('Total de filas:', rows.length);
        
        // Convertir filas a objetos
        const datos = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const obj = {};
            
            headers.forEach((header, index) => {
                obj[header] = row[index] ? row[index].trim() : '';
            });
            
            // Solo agregar si tiene nombre de emprendimiento válido (más de 3 caracteres)
            // Y que tenga al menos Región O Rubro
            if (obj.Emprendimiento && 
                obj.Emprendimiento.length > 3 && 
                (obj.Región || obj.Rubro)) {
                datos.push(obj);
            }
        }
        
        emprendimientos = datos;
        emprendimientosFiltrados = datos;
        
        console.log(`✅ Cargados ${emprendimientos.length} emprendimientos válidos`);
        if (emprendimientos.length > 0) {
            console.log('Ejemplo primer emprendimiento:', emprendimientos[0]);
        }
        
        llenarFiltros();
        renderizarEmprendimientos();
        actualizarContador();
        
    } catch (error) {
        console.error('❌ Error al cargar los datos:', error);
        mostrarError();
    }
}

// Función para llenar los filtros con opciones únicas
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
}

// Función para renderizar los emprendimientos
function renderizarEmprendimientos() {
    emprendimientosGrid.innerHTML = '';
    
    if (emprendimientosFiltrados.length === 0) {
        mostrarEstadoVacio();
        return;
    }
    
    emprendimientosFiltrados.forEach(emp => {
        const card = crearCard(emp);
        emprendimientosGrid.appendChild(card);
    });
}

// Función para formatear URL de Facebook
function formatearFacebookURL(facebook) {
    if (!facebook) return null;
    
    const fb = facebook.trim();
    
    // Si ya es una URL completa, devolverla
    if (fb.startsWith('http://') || fb.startsWith('https://')) {
        return fb;
    }
    
    // Si es solo el nombre de usuario (sin espacios), agregar www.facebook.com
    if (!fb.includes(' ') && !fb.includes('/')) {
        return `https://www.facebook.com/${fb}`;
    }
    
    // Si tiene espacios, buscar en Facebook
    return `https://www.facebook.com/search/top?q=${encodeURIComponent(fb)}`;
}

// Función para convertir URL de Google Drive a enlace directo
function convertirGoogleDriveURL(url) {
    if (!url || !url.includes('drive.google.com')) {
        return url;
    }
    
    // Extraer el ID del archivo
    let fileId = null;
    
    // Formato: /file/d/ID/
    let match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
        fileId = match[1];
    }
    
    // Formato: /d/ID
    if (!fileId) {
        match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match) fileId = match[1];
    }
    
    // Formato: id=ID
    if (!fileId) {
        match = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
        if (match) fileId = match[1];
    }
    
    if (fileId) {
        // Usar thumbnail para mejor compatibilidad
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
    }
    
    return url;
}

// Función para crear una card de emprendimiento
function crearCard(emp) {
    const card = document.createElement('div');
    card.className = 'emprendimiento-card';
    
    const telefono = emp['Teléfono( sin guiones ni espacios: 5493884123456)'];
    const instagram = emp['Instagram (solo el usuario, sin @)'];
    const facebook = emp['Facebook (solo el nombre de usuario)'];
    const email = emp['Correo electrónico'];
    const comunidad = emp['Comunidad / Pueblo'];
    
    // Usar imagen real si existe, sino placeholder
    let imagenUrl = '';
    if (emp.Imagen && emp.Imagen.trim()) {
        imagenUrl = convertirGoogleDriveURL(emp.Imagen.trim());
        console.log(`📸 ${emp.Emprendimiento}:`, emp.Imagen, '→', imagenUrl);
    } else {
        imagenUrl = `https://picsum.photos/400/200?random=${Math.random()}`;
        console.log(`📸 ${emp.Emprendimiento}: Sin imagen, usando placeholder`);
    }
    
    card.innerHTML = `
        <img 
            src="${imagenUrl}" 
            alt="${emp.Emprendimiento}"
            class="emprendimiento-card__image"
            onerror="this.src='https://picsum.photos/400/200?random=${Math.random()}'"
        >
        <div class="emprendimiento-card__content">
            <div class="emprendimiento-card__header">
                <h3 class="emprendimiento-card__title">${emp.Emprendimiento}</h3>
                <div class="emprendimiento-card__tags">
                    ${emp.Región ? `<span class="emprendimiento-card__tag emprendimiento-card__tag--region">${emp.Región}</span>` : ''}
                    ${emp.Rubro ? `<span class="emprendimiento-card__tag emprendimiento-card__tag--rubro">${emp.Rubro}</span>` : ''}
                </div>
            </div>
            
            ${comunidad ? `<p class="emprendimiento-card__location">${comunidad}</p>` : ''}
            
            ${emp.Descripción ? `<p class="emprendimiento-card__description">${emp.Descripción}</p>` : ''}
            
            <div class="emprendimiento-card__footer">
                <div class="emprendimiento-card__contact">
                    ${telefono ? `
                        <a 
                            href="https://wa.me/${telefono}" 
                            target="_blank"
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--whatsapp"
                            onclick="event.stopPropagation()"
                            title="WhatsApp"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                        </a>
                    ` : ''}
                    
                    ${instagram ? `
                        <a 
                            href="https://instagram.com/${instagram}" 
                            target="_blank"
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--instagram"
                            onclick="event.stopPropagation()"
                            title="Instagram"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                        </a>
                    ` : ''}
                    
                    ${facebook ? `
                        <a 
                            href="${formatearFacebookURL(facebook)}" 
                            target="_blank"
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--facebook"
                            onclick="event.stopPropagation()"
                            title="Facebook"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                        </a>
                    ` : ''}
                    
                    ${email ? `
                        <a 
                            href="mailto:${email}" 
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--email"
                            onclick="event.stopPropagation()"
                            title="Email"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="4" width="20" height="16" rx="2"/>
                                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                            </svg>
                        </a>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    // Agregar evento click para abrir modal
    card.addEventListener('click', () => {
        abrirModal(emp);
    });
    
    return card;
}

// Función para mostrar estado vacío
function mostrarEstadoVacio() {
    emprendimientosGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state__icon">🔍</div>
            <h3 class="empty-state__title">No se encontraron resultados</h3>
            <p class="empty-state__text">Intentá con otros filtros o términos de búsqueda</p>
        </div>
    `;
}

// Función para mostrar error
function mostrarError() {
    emprendimientosGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state__icon">⚠️</div>
            <h3 class="empty-state__title">Error al cargar los datos</h3>
            <p class="empty-state__text">Por favor, recargá la página</p>
        </div>
    `;
    resultsCount.textContent = 'Error al cargar emprendimientos';
}

// Función para actualizar el contador
function actualizarContador() {
    const total = emprendimientos.length;
    const mostrados = emprendimientosFiltrados.length;
    
    if (mostrados === total) {
        resultsCount.textContent = `Mostrando ${total} emprendimiento${total !== 1 ? 's' : ''}`;
    } else {
        resultsCount.textContent = `Mostrando ${mostrados} de ${total} emprendimiento${total !== 1 ? 's' : ''}`;
    }
}

// Función para aplicar filtros
function aplicarFiltros() {
    const searchTerm = searchInput.value.toLowerCase();
    const regionSeleccionada = regionFilter.value;
    const rubroSeleccionado = rubroFilter.value;
    
    emprendimientosFiltrados = emprendimientos.filter(emp => {
        // Filtro de búsqueda
        const matchSearch = searchTerm === '' || 
            emp.Emprendimiento.toLowerCase().includes(searchTerm) ||
            (emp.Descripción && emp.Descripción.toLowerCase().includes(searchTerm)) ||
            (emp['Comunidad / Pueblo'] && emp['Comunidad / Pueblo'].toLowerCase().includes(searchTerm));
        
        // Filtro de región
        const matchRegion = regionSeleccionada === '' || emp.Región === regionSeleccionada;
        
        // Filtro de rubro
        const matchRubro = rubroSeleccionado === '' || emp.Rubro === rubroSeleccionado;
        
        return matchSearch && matchRegion && matchRubro;
    });
    
    renderizarEmprendimientos();
    actualizarContador();
}

// Función para limpiar filtros
function limpiarFiltros() {
    searchInput.value = '';
    regionFilter.value = '';
    rubroFilter.value = '';
    aplicarFiltros();
}

// Event Listeners
searchInput.addEventListener('input', aplicarFiltros);
regionFilter.addEventListener('change', aplicarFiltros);
rubroFilter.addEventListener('change', aplicarFiltros);
clearFiltersBtn.addEventListener('click', limpiarFiltros);

// Modal
const modal = document.getElementById('modalEmprendimiento');
const modalClose = document.getElementById('modalClose');
const modalContent = document.getElementById('modalContent');
let currentSlide = 0;

// Abrir modal
function abrirModal(emprendimiento) {
    currentSlide = 0;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Crear contenido del modal
    const telefono = emprendimiento['Teléfono( sin guiones ni espacios: 5493884123456)'];
    const instagram = emprendimiento['Instagram (solo el usuario, sin @)'];
    const facebook = emprendimiento['Facebook (solo el nombre de usuario)'];
    const email = emprendimiento['Correo electrónico'];
    const web = emprendimiento['Web'];
    const comunidad = emprendimiento['Comunidad / Pueblo'];
    const infoAtencion = emprendimiento['Info / Atención / Condiciones de reserva'];
    
    // Recopilar todas las imágenes disponibles
    const imagenes = [
        emprendimiento.Imagen,
        emprendimiento.Imagen2,
        emprendimiento.Imagen3,
        emprendimiento.Imagen4
    ].filter(img => img && img.trim()).map(img => convertirGoogleDriveURL(img.trim()));
    
    // Si no hay imágenes, usar placeholder
    if (imagenes.length === 0) {
        imagenes.push(`https://picsum.photos/800/400?random=${Math.random()}`);
    }
    
    modalContent.innerHTML = `
        <!-- Galería de imágenes -->
        <div class="modal__gallery">
            <div class="modal__gallery-track" id="galleryTrack">
                ${imagenes.map(img => `
                    <img 
                        src="${img}" 
                        alt="${emprendimiento.Emprendimiento}"
                        class="modal__gallery-image"
                        onerror="this.src='https://picsum.photos/800/400?random=${Math.random()}'"
                    >
                `).join('')}
            </div>
            
            ${imagenes.length > 1 ? `
                <div class="modal__gallery-nav">
                    <button class="modal__gallery-btn" id="prevBtn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                    <button class="modal__gallery-btn" id="nextBtn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                </div>
                
                <div class="modal__gallery-dots">
                    ${imagenes.map((_, index) => `
                        <button class="modal__gallery-dot ${index === 0 ? 'active' : ''}" data-slide="${index}"></button>
                    `).join('')}
                </div>
            ` : ''}
        </div>
        
        <!-- Información -->
        <div class="modal__info">
            <div class="modal__header">
                <h2 class="modal__title">${emprendimiento.Emprendimiento}</h2>
                <div class="modal__tags">
                    ${emprendimiento.Región ? `<span class="modal__tag modal__tag--region">${emprendimiento.Región}</span>` : ''}
                    ${emprendimiento.Rubro ? `<span class="modal__tag modal__tag--rubro">${emprendimiento.Rubro}</span>` : ''}
                </div>
                ${comunidad ? `<p class="modal__location">${comunidad}</p>` : ''}
            </div>
            
            ${emprendimiento.Descripción ? `
                <div class="modal__section">
                    <h3 class="modal__section-title">Descripción</h3>
                    <p class="modal__section-content">${emprendimiento.Descripción}</p>
                </div>
            ` : ''}
            
            ${infoAtencion ? `
                <div class="modal__section">
                    <h3 class="modal__section-title">Información y Condiciones</h3>
                    <p class="modal__section-content">${infoAtencion}</p>
                </div>
            ` : ''}
            
            <!-- Botones de contacto -->
            <div class="modal__contacts">
                ${telefono ? `
                    <a href="https://wa.me/${telefono}" target="_blank" class="modal__contact-btn modal__contact-btn--whatsapp" title="WhatsApp">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        <span>WhatsApp</span>
                    </a>
                ` : ''}
                
                ${instagram ? `
                    <a href="https://instagram.com/${instagram}" target="_blank" class="modal__contact-btn modal__contact-btn--instagram" title="Instagram">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                        <span>Instagram</span>
                    </a>
                ` : ''}
                
                ${facebook ? `
                    <a href="${formatearFacebookURL(facebook)}" target="_blank" class="modal__contact-btn modal__contact-btn--facebook" title="Facebook">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                        <span>Facebook</span>
                    </a>
                ` : ''}
                
                ${email ? `
                    <a href="mailto:${email}" class="modal__contact-btn modal__contact-btn--email" title="Email">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2"/>
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                        </svg>
                        <span>Email</span>
                    </a>
                ` : ''}
                
                ${web ? `
                    <a href="${web}" target="_blank" class="modal__contact-btn modal__contact-btn--web" title="Sitio Web">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="2" y1="12" x2="22" y2="12"/>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                        <span>Sitio Web</span>
                    </a>
                ` : ''}
            </div>
        </div>
    `;
    
    // Configurar navegación de galería si hay múltiples imágenes
    if (imagenes.length > 1) {
        setupGalleryNavigation(imagenes.length);
    }
}

// Configurar navegación de galería
function setupGalleryNavigation(totalImages) {
    const track = document.getElementById('galleryTrack');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const dots = document.querySelectorAll('.modal__gallery-dot');
    
    function updateGallery() {
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
        
        // Actualizar dots
        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentSlide);
        });
        
        // Actualizar botones
        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === totalImages - 1;
    }
    
    prevBtn.addEventListener('click', () => {
        if (currentSlide > 0) {
            currentSlide--;
            updateGallery();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentSlide < totalImages - 1) {
            currentSlide++;
            updateGallery();
        }
    });
    
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            updateGallery();
        });
    });
}

// Cerrar modal
function cerrarModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

modalClose.addEventListener('click', cerrarModal);
modal.querySelector('.modal__overlay').addEventListener('click', cerrarModal);

// Cerrar con ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
        cerrarModal();
    }
});

// Inicializar la aplicación
cargarDatos();