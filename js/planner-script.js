// ============================================
// PLANIFICADOR DE VIAJE - JAVASCRIPT
// ============================================

class TripPlanner {
    constructor() {
        this.trip = {
            id: this.generateId(),
            name: 'Mi Viaje por Jujuy',
            days: [],
            created: new Date().toISOString()
        };
        
        this.currentDayForActivity = null;
        this.elements = this.getElements();
        this.init();
    }
    
    getElements() {
        return {
            // Botón flotante
            plannerBtn: document.getElementById('tripPlannerBtn'),
            badge: document.getElementById('tripBadge'),
            
            // Modal principal
            modal: document.getElementById('tripPlannerModal'),
            closeBtn: document.getElementById('closeTripPlanner'),
            
            // Toolbar
            addDayBtn: document.getElementById('addDayBtn'),
            addFirstDayBtn: document.getElementById('addFirstDayBtn'),
            saveTripBtn: document.getElementById('saveTripBtn'),
            exportTripBtn: document.getElementById('exportTripBtn'),
            clearTripBtn: document.getElementById('clearTripBtn'),
            
            // Content
            daysContainer: document.getElementById('tripDays'),
            emptyState: document.getElementById('tripEmptyState'),
            
            // Summary
            statDays: document.getElementById('statDays'),
            statActivities: document.getElementById('statActivities'),
            statRegions: document.getElementById('statRegions'),
            statDistance: document.getElementById('statDistance'),
            statTime: document.getElementById('statTime'),
            contactsList: document.getElementById('contactsList'),
            
            // Add Activity Modal
            activityModal: document.getElementById('addActivityModal'),
            closeActivityModal: document.getElementById('closeAddActivity'),
            activitySearch: document.getElementById('activitySearch'),
            activityRegionFilter: document.getElementById('activityRegionFilter'),
            activityRubroFilter: document.getElementById('activityRubroFilter'),
            activityList: document.getElementById('activityList')
        };
    }
    
    init() {
        this.loadTrip();
        this.setupEventListeners();
        this.render();
        console.log('🗺️ Planificador de viaje inicializado');
    }
    
    setupEventListeners() {
        // Abrir/cerrar modal principal
        this.elements.plannerBtn.addEventListener('click', () => this.openModal());
        this.elements.closeBtn.addEventListener('click', () => this.closeModal());
        this.elements.modal.querySelector('.trip-planner-modal__overlay')
            .addEventListener('click', () => this.closeModal());
        
        // Agregar día
        this.elements.addDayBtn.addEventListener('click', () => this.addDay());
        this.elements.addFirstDayBtn.addEventListener('click', () => {
            this.addDay();
            this.elements.emptyState.style.display = 'none';
        });
        
        // Guardar, exportar, limpiar
        this.elements.saveTripBtn.addEventListener('click', () => this.saveTrip());
        this.elements.exportTripBtn.addEventListener('click', () => this.exportTrip());
        this.elements.clearTripBtn.addEventListener('click', () => this.clearTrip());
        
        // Modal de actividades
        this.elements.closeActivityModal.addEventListener('click', () => this.closeActivityModal());
        this.elements.activityModal.querySelector('.add-activity-modal__overlay')
            .addEventListener('click', () => this.closeActivityModal());
        
        // Filtros de actividades
        this.elements.activitySearch.addEventListener('input', (e) => this.filterActivities());
        this.elements.activityRegionFilter.addEventListener('change', () => this.filterActivities());
        this.elements.activityRubroFilter.addEventListener('change', () => this.filterActivities());
    }
    
    // ============================================
    // GESTIÓN DE DÍAS
    // ============================================
    
    addDay() {
        const dayNumber = this.trip.days.length + 1;
        const newDay = {
            id: this.generateId(),
            number: dayNumber,
            title: `Día ${dayNumber}`,
            date: null,
            activities: []
        };
        
        this.trip.days.push(newDay);
        this.render();
        this.updateBadge();
        
        // Auto-scroll al nuevo día
        setTimeout(() => {
            const dayCards = this.elements.daysContainer.querySelectorAll('.trip-day');
            if (dayCards.length > 0) {
                dayCards[dayCards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }
    
    removeDay(dayId) {
        if (!confirm('¿Estás seguro de eliminar este día?')) return;
        
        this.trip.days = this.trip.days.filter(d => d.id !== dayId);
        
        // Renumerar días
        this.trip.days.forEach((day, index) => {
            day.number = index + 1;
            if (!day.title.includes('Día')) {
                // Solo renumerar si no tiene título personalizado
            } else {
                day.title = `Día ${index + 1}`;
            }
        });
        
        this.render();
        this.updateBadge();
    }
    
    updateDayTitle(dayId, newTitle) {
        const day = this.trip.days.find(d => d.id === dayId);
        if (day) {
            day.title = newTitle;
        }
    }
    
    // ============================================
    // GESTIÓN DE ACTIVIDADES
    // ============================================
    
    openActivityModal(dayId) {
        this.currentDayForActivity = dayId;
        this.elements.activityModal.classList.add('active');
        this.populateActivityFilters();
        this.filterActivities();
    }
    
    closeActivityModal() {
        this.elements.activityModal.classList.remove('active');
        this.currentDayForActivity = null;
        this.elements.activitySearch.value = '';
        this.elements.activityRegionFilter.value = '';
        this.elements.activityRubroFilter.value = '';
    }
    
    populateActivityFilters() {
        // Llenar filtros de región
        const regiones = [...new Set(emprendimientos.map(e => e.Región))].filter(r => r).sort();
        this.elements.activityRegionFilter.innerHTML = '<option value="">Todas las regiones</option>';
        regiones.forEach(region => {
            const option = document.createElement('option');
            option.value = region;
            option.textContent = region;
            this.elements.activityRegionFilter.appendChild(option);
        });
        
        // Llenar filtros de rubro
        const rubros = [...new Set(emprendimientos.map(e => e.Rubro))].filter(r => r).sort();
        this.elements.activityRubroFilter.innerHTML = '<option value="">Todas las categorías</option>';
        rubros.forEach(rubro => {
            const option = document.createElement('option');
            option.value = rubro;
            option.textContent = rubro;
            this.elements.activityRubroFilter.appendChild(option);
        });
    }
    
    filterActivities() {
        const searchTerm = this.elements.activitySearch.value.toLowerCase();
        const selectedRegion = this.elements.activityRegionFilter.value;
        const selectedRubro = this.elements.activityRubroFilter.value;
        
        const filtered = emprendimientos.filter(emp => {
            const matchSearch = !searchTerm || 
                emp.Emprendimiento.toLowerCase().includes(searchTerm) ||
                (emp.Descripción && emp.Descripción.toLowerCase().includes(searchTerm));
            
            const matchRegion = !selectedRegion || emp.Región === selectedRegion;
            const matchRubro = !selectedRubro || emp.Rubro === selectedRubro;
            
            return matchSearch && matchRegion && matchRubro;
        });
        
        this.renderActivityList(filtered);
    }
    
    renderActivityList(activities) {
        if (activities.length === 0) {
            this.elements.activityList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #999;">
                    No se encontraron emprendimientos
                </div>
            `;
            return;
        }
        
        this.elements.activityList.innerHTML = activities.map(emp => {
            let imageUrl = 'https://picsum.photos/80/80?random=' + Math.random();
            if (emp.Imagen && emp.Imagen.trim()) {
                imageUrl = convertirGoogleDriveURL(emp.Imagen.trim());
            }
            
            return `
                <div class="activity-item" data-emp-id="${emprendimientos.indexOf(emp)}">
                    <img src="${imageUrl}" alt="${emp.Emprendimiento}" class="activity-item__image"
                         onerror="this.src='https://picsum.photos/80/80?random=${Math.random()}'">
                    <div class="activity-item__content">
                        <h4 class="activity-item__name">${emp.Emprendimiento}</h4>
                        <div class="activity-item__meta">
                            ${emp.Región ? `<span class="activity-item__tag activity-item__tag--region">${emp.Región}</span>` : ''}
                            ${emp.Rubro ? `<span class="activity-item__tag activity-item__tag--rubro">${emp.Rubro}</span>` : ''}
                        </div>
                        ${emp.Descripción ? `<p class="activity-item__description">${emp.Descripción}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Event listeners para items
        this.elements.activityList.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', () => {
                const empIndex = parseInt(item.getAttribute('data-emp-id'));
                this.addActivityToDay(empIndex);
            });
        });
    }
    
    addActivityToDay(empIndex) {
        const emprendimiento = emprendimientos[empIndex];
        const day = this.trip.days.find(d => d.id === this.currentDayForActivity);
        
        if (!day) return;
        
        // Verificar si ya está agregado
        if (day.activities.some(a => a.emprendimientoIndex === empIndex)) {
            alert('Este emprendimiento ya está en el día');
            return;
        }
        
        const activity = {
            id: this.generateId(),
            emprendimientoIndex: empIndex,
            time: null,
            notes: ''
        };
        
        day.activities.push(activity);
        this.closeActivityModal();
        this.render();
        this.updateBadge();
    }
    
    removeActivity(dayId, activityId) {
        const day = this.trip.days.find(d => d.id === dayId);
        if (!day) return;
        
        day.activities = day.activities.filter(a => a.id !== activityId);
        this.render();
        this.updateBadge();
    }
    
    // ============================================
    // CÁLCULOS
    // ============================================
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        // Fórmula Haversine para calcular distancia entre coordenadas
        const R = 6371; // Radio de la Tierra en km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance;
    }
    
    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }
    
    calculateDayStats(day) {
        let totalDistance = 0;
        
        for (let i = 1; i < day.activities.length; i++) {
            const prevEmp = emprendimientos[day.activities[i - 1].emprendimientoIndex];
            const currEmp = emprendimientos[day.activities[i].emprendimientoIndex];
            
            const prevCoords = parsearCoordenadas(prevEmp['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)']);
            const currCoords = parsearCoordenadas(currEmp['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)']);
            
            if (prevCoords && currCoords) {
                const distance = this.calculateDistance(
                    prevCoords[0], prevCoords[1],
                    currCoords[0], currCoords[1]
                );
                totalDistance += distance;
            }
        }
        
        const estimatedTime = totalDistance * 1.5; // Aproximadamente 1.5 min por km (velocidad promedio 40 km/h)
        
        return {
            distance: totalDistance,
            time: estimatedTime
        };
    }
    
    calculateTripStats() {
        let totalActivities = 0;
        let totalDistance = 0;
        let totalTime = 0;
        const regionsSet = new Set();
        
        this.trip.days.forEach(day => {
            totalActivities += day.activities.length;
            
            const stats = this.calculateDayStats(day);
            totalDistance += stats.distance;
            totalTime += stats.time;
            
            day.activities.forEach(activity => {
                const emp = emprendimientos[activity.emprendimientoIndex];
                if (emp.Región) {
                    regionsSet.add(emp.Región);
                }
            });
        });
        
        return {
            days: this.trip.days.length,
            activities: totalActivities,
            regions: regionsSet.size,
            distance: totalDistance,
            time: totalTime
        };
    }
    
    // ============================================
    // RENDERIZADO
    // ============================================
    
    render() {
        this.renderDays();
        this.renderSummary();
    }
    
    renderDays() {
        if (this.trip.days.length === 0) {
            this.elements.emptyState.style.display = 'block';
            return;
        }
        
        this.elements.emptyState.style.display = 'none';
        
        this.elements.daysContainer.innerHTML = this.trip.days.map(day => {
            const stats = this.calculateDayStats(day);
            
            return `
                <div class="trip-day" data-day-id="${day.id}">
                    <div class="trip-day__header">
                        <div class="trip-day__header-left">
                            <div class="trip-day__number">${day.number}</div>
                            <h3 class="trip-day__title">
                                <input type="text" value="${day.title}" 
                                       onblur="tripPlanner.updateDayTitle('${day.id}', this.value)"
                                       onkeypress="if(event.key==='Enter') this.blur()">
                            </h3>
                            <div class="trip-day__subtitle">
                                <span>📍 ${day.activities.length} actividades</span>
                                <span>🚗 ${stats.distance.toFixed(1)} km</span>
                                <span>⏱️ ~${Math.round(stats.time)} min</span>
                            </div>
                        </div>
                        <div class="trip-day__actions">
                            <button class="trip-day__btn trip-day__btn--delete" 
                                    onclick="tripPlanner.removeDay('${day.id}')">
                                Eliminar día
                            </button>
                        </div>
                    </div>
                    
                    <div class="trip-day__activities">
                        ${this.renderActivities(day)}
                    </div>
                    
                    <button class="trip-day__add-activity" 
                            onclick="tripPlanner.openActivityModal('${day.id}')">
                        + Agregar actividad
                    </button>
                </div>
            `;
        }).join('');
    }
    
    renderActivities(day) {
        if (day.activities.length === 0) {
            return '<div class="trip-day__empty">Sin actividades. Hacé click en "Agregar actividad" para comenzar.</div>';
        }
        
        return day.activities.map((activity, index) => {
            const emp = emprendimientos[activity.emprendimientoIndex];
            
            // Calcular distancia desde actividad anterior
            let distanceInfo = '';
            if (index > 0) {
                const prevEmp = emprendimientos[day.activities[index - 1].emprendimientoIndex];
                const prevCoords = parsearCoordenadas(prevEmp['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)']);
                const currCoords = parsearCoordenadas(emp['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)']);
                
                if (prevCoords && currCoords) {
                    const distance = this.calculateDistance(
                        prevCoords[0], prevCoords[1],
                        currCoords[0], currCoords[1]
                    );
                    const time = Math.round(distance * 1.5);
                    distanceInfo = `
                        <div class="trip-activity__distance">
                            🚗 ${distance.toFixed(1)} km (~${time} min)
                        </div>
                    `;
                }
            }
            
            const icon = this.getRubroIcon(emp.Rubro);
            
            return `
                <div class="trip-activity">
                    <div class="trip-activity__icon">${icon}</div>
                    <div class="trip-activity__content">
                        <div class="trip-activity__header">
                            <div class="trip-activity__name">${emp.Emprendimiento}</div>
                            <button class="trip-activity__delete" 
                                    onclick="tripPlanner.removeActivity('${day.id}', '${activity.id}')">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="trip-activity__meta">
                            ${emp.Región ? `<span class="trip-activity__tag">${emp.Región}</span>` : ''}
                            ${emp.Rubro ? `<span class="trip-activity__tag">${emp.Rubro}</span>` : ''}
                            ${emp['Comunidad / Pueblo'] ? `<span class="trip-activity__tag">${emp['Comunidad / Pueblo']}</span>` : ''}
                        </div>
                        ${distanceInfo}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderSummary() {
        const stats = this.calculateTripStats();
        
        this.elements.statDays.textContent = stats.days;
        this.elements.statActivities.textContent = stats.activities;
        this.elements.statRegions.textContent = stats.regions;
        this.elements.statDistance.textContent = stats.distance.toFixed(1);
        this.elements.statTime.textContent = (stats.time / 60).toFixed(1);
        
        // Renderizar contactos
        this.renderContacts();
    }
    
    renderContacts() {
        const contacts = [];
        const seen = new Set();
        
        this.trip.days.forEach(day => {
            day.activities.forEach(activity => {
                const emp = emprendimientos[activity.emprendimientoIndex];
                const phone = emp['Teléfono( sin guiones ni espacios: 5493884123456)'];
                
                if (phone && !seen.has(phone)) {
                    seen.add(phone);
                    contacts.push({
                        name: emp.Emprendimiento,
                        phone: phone,
                        email: emp['Correo electrónico']
                    });
                }
            });
        });
        
        if (contacts.length === 0) {
            this.elements.contactsList.innerHTML = `
                <p class="trip-planner-summary__contacts-empty">
                    Agregá actividades para ver los contactos
                </p>
            `;
            return;
        }
        
        this.elements.contactsList.innerHTML = contacts.map(contact => `
            <div class="trip-planner-summary__contact">
                <div class="trip-planner-summary__contact-name">${contact.name}</div>
                <div class="trip-planner-summary__contact-phone">
                    📞 <a href="https://wa.me/${contact.phone}" target="_blank">${contact.phone}</a>
                </div>
            </div>
        `).join('');
    }
    
    // ============================================
    // UTILIDADES
    // ============================================
    
    getRubroIcon(rubro) {
        const icons = {
            'Alojamiento': '🏠',
            'Gastronomía': '🍽️',
            'Paseos a caballo': '🐴',
            'Guías': '🧭',
            'Artesanía': '🎨',
            'Experiencia rural': '🌾'
        };
        return icons[rubro] || '📍';
    }
    
    generateId() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    }
    
    updateBadge() {
        const totalActivities = this.trip.days.reduce((sum, day) => sum + day.activities.length, 0);
        this.elements.badge.textContent = totalActivities;
        
        if (totalActivities > 0) {
            this.elements.badge.classList.add('active');
        } else {
            this.elements.badge.classList.remove('active');
        }
    }
    
    // ============================================
    // MODAL
    // ============================================
    
    openModal() {
        this.elements.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    closeModal() {
        this.elements.modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // ============================================
    // PERSISTENCIA
    // ============================================
    
    saveTrip() {
        localStorage.setItem('jujuy_trip', JSON.stringify(this.trip));
        alert('✅ Viaje guardado correctamente');
    }
    
    loadTrip() {
        const saved = localStorage.getItem('jujuy_trip');
        if (saved) {
            try {
                this.trip = JSON.parse(saved);
                console.log('📂 Viaje cargado desde localStorage');
            } catch (e) {
                console.error('Error al cargar viaje:', e);
            }
        }
    }
    
    clearTrip() {
        if (!confirm('¿Estás seguro de eliminar todo el viaje? Esta acción no se puede deshacer.')) {
            return;
        }
        
        this.trip = {
            id: this.generateId(),
            name: 'Mi Viaje por Jujuy',
            days: [],
            created: new Date().toISOString()
        };
        
        localStorage.removeItem('jujuy_trip');
        this.render();
        this.updateBadge();
    }
    
    // ============================================
    // EXPORTAR
    // ============================================
    
    exportTrip() {
        const stats = this.calculateTripStats();
        
        let html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.trip.name}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
        }
        h1 { color: #8B4513; }
        h2 { color: #D2691E; border-bottom: 2px solid #DEB887; padding-bottom: 10px; }
        .stats {
            background: #F5F5DC;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .day {
            margin: 30px 0;
            page-break-inside: avoid;
        }
        .activity {
            margin: 15px 0 15px 20px;
            padding: 10px;
            border-left: 4px solid #D2691E;
            background: #FAFAFA;
        }
        .contact {
            margin: 10px 0;
            padding: 10px;
            background: #F0F0F0;
        }
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <h1>🗺️ ${this.trip.name}</h1>
    
    <div class="stats">
        <h3>📊 Resumen del Viaje</h3>
        <p><strong>Duración:</strong> ${stats.days} días</p>
        <p><strong>Actividades:</strong> ${stats.activities}</p>
        <p><strong>Regiones:</strong> ${stats.regions}</p>
        <p><strong>Distancia total:</strong> ${stats.distance.toFixed(1)} km</p>
        <p><strong>Tiempo de viaje:</strong> ~${(stats.time / 60).toFixed(1)} horas</p>
    </div>
    
    <h2>📅 Itinerario</h2>
`;
        
        this.trip.days.forEach(day => {
            const dayStats = this.calculateDayStats(day);
            
            html += `
    <div class="day">
        <h3>Día ${day.number}: ${day.title}</h3>
        <p><em>${day.activities.length} actividades | ${dayStats.distance.toFixed(1)} km | ~${Math.round(dayStats.time)} min de viaje</em></p>
`;
            
            day.activities.forEach((activity, index) => {
                const emp = emprendimientos[activity.emprendimientoIndex];
                
                html += `
        <div class="activity">
            <strong>${index + 1}. ${emp.Emprendimiento}</strong><br>
            <em>${emp.Región || ''} ${emp.Rubro ? '• ' + emp.Rubro : ''}</em><br>
`;
                
                if (index > 0) {
                    const prevEmp = emprendimientos[day.activities[index - 1].emprendimientoIndex];
                    const prevCoords = parsearCoordenadas(prevEmp['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)']);
                    const currCoords = parsearCoordenadas(emp['Ubicación (formato: -23.5772, -65.3969 latitud,longitud)']);
                    
                    if (prevCoords && currCoords) {
                        const distance = this.calculateDistance(
                            prevCoords[0], prevCoords[1],
                            currCoords[0], currCoords[1]
                        );
                        html += `            <small>🚗 ${distance.toFixed(1)} km desde actividad anterior</small><br>`;
                    }
                }
                
                const phone = emp['Teléfono( sin guiones ni espacios: 5493884123456)'];
                if (phone) {
                    html += `            <small>📞 ${phone}</small><br>`;
                }
                
                html += `        </div>\n`;
            });
            
            html += `    </div>\n`;
        });
        
        html += `
    <h2>📞 Contactos para Reservar</h2>
`;
        
        const contacts = [];
        const seen = new Set();
        
        this.trip.days.forEach(day => {
            day.activities.forEach(activity => {
                const emp = emprendimientos[activity.emprendimientoIndex];
                const phone = emp['Teléfono( sin guiones ni espacios: 5493884123456)'];
                
                if (phone && !seen.has(phone)) {
                    seen.add(phone);
                    contacts.push({
                        name: emp.Emprendimiento,
                        phone: phone,
                        email: emp['Correo electrónico']
                    });
                }
            });
        });
        
        contacts.forEach(contact => {
            html += `
    <div class="contact">
        <strong>${contact.name}</strong><br>
        📞 <a href="https://wa.me/${contact.phone}">${contact.phone}</a>
        ${contact.email ? `<br>📧 ${contact.email}` : ''}
    </div>
`;
        });
        
        html += `
    <p class="no-print" style="margin-top: 40px; text-align: center;">
        <button onclick="window.print()">🖨️ Imprimir</button>
    </p>
</body>
</html>
`;
        
        // Abrir en nueva ventana
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================

let tripPlanner;

// Esperar a que el DOM esté listo Y los emprendimientos cargados
document.addEventListener('DOMContentLoaded', () => {
    // Esperar a que emprendimientos esté disponible
    const checkEmprendimientos = setInterval(() => {
        if (typeof emprendimientos !== 'undefined' && emprendimientos.length > 0) {
            clearInterval(checkEmprendimientos);
            tripPlanner = new TripPlanner();
            console.log('✅ Planificador listo con', emprendimientos.length, 'emprendimientos');
        }
    }, 100);
});
