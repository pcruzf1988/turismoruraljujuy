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
                        >
                            WhatsApp
                        </a>
                    ` : ''}
                    
                    ${instagram ? `
                        <a 
                            href="https://instagram.com/${instagram}" 
                            target="_blank"
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--instagram"
                            onclick="event.stopPropagation()"
                        >
                            Instagram
                        </a>
                    ` : ''}
                    
                    ${facebook ? `
                        <a 
                            href="${formatearFacebookURL(facebook)}" 
                            target="_blank"
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--facebook"
                            onclick="event.stopPropagation()"
                        >
                            Facebook
                        </a>
                    ` : ''}
                    
                    ${email ? `
                        <a 
                            href="mailto:${email}" 
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--email"
                            onclick="event.stopPropagation()"
                        >
                            Email
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
                    <a href="https://wa.me/${telefono}" target="_blank" class="modal__contact-btn modal__contact-btn--whatsapp">
                        WhatsApp
                    </a>
                ` : ''}
                
                ${instagram ? `
                    <a href="https://instagram.com/${instagram}" target="_blank" class="modal__contact-btn modal__contact-btn--instagram">
                        Instagram
                    </a>
                ` : ''}
                
                ${facebook ? `
                    <a href="${formatearFacebookURL(facebook)}" target="_blank" class="modal__contact-btn modal__contact-btn--facebook">
                        Facebook
                    </a>
                ` : ''}
                
                ${email ? `
                    <a href="mailto:${email}" class="modal__contact-btn modal__contact-btn--email">
                        Email
                    </a>
                ` : ''}
                
                ${web ? `
                    <a href="${web}" target="_blank" class="modal__contact-btn modal__contact-btn--web">
                        Sitio Web
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