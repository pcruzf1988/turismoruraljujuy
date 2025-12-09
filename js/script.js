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

// Función para crear una card de emprendimiento
function crearCard(emp) {
    const card = document.createElement('div');
    card.className = 'emprendimiento-card';
    
    const telefono = emp['Teléfono( sin guiones ni espacios: 5493884123456)'];
    const instagram = emp['Instagram (solo el usuario, sin @)'];
    const facebook = emp['Facebook (solo el nombre de usuario)'];
    const email = emp['Correo electrónico'];
    const comunidad = emp['Comunidad / Pueblo'];
    
    card.innerHTML = `
        <img 
            src="https://via.placeholder.com/400x200/DEB887/8B4513?text=${encodeURIComponent(emp.Emprendimiento)}" 
            alt="${emp.Emprendimiento}"
            class="emprendimiento-card__image"
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
                        >
                            WhatsApp
                        </a>
                    ` : ''}
                    
                    ${instagram ? `
                        <a 
                            href="https://instagram.com/${instagram}" 
                            target="_blank"
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--instagram"
                        >
                            Instagram
                        </a>
                    ` : ''}
                    
                    ${facebook ? `
                        <a 
                            href="https://facebook.com/${facebook}" 
                            target="_blank"
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--facebook"
                        >
                            Facebook
                        </a>
                    ` : ''}
                    
                    ${email ? `
                        <a 
                            href="mailto:${email}" 
                            class="emprendimiento-card__contact-btn emprendimiento-card__contact-btn--email"
                        >
                            Email
                        </a>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
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

// Inicializar la aplicación
cargarDatos();