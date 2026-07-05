import { supabase, isSupabaseConfigured } from './supabaseClient.js';

// ==========================================================================
// LOGITRACK - CONTROL DE CONTENEDORES DE RESIDUOS Y VERIFICACIÓN DE POZAS
// Lógica de Negocio, SPA, Gráficos y SLA de 3 Días Hábiles
// ==========================================================================

// --- MOCK IMAGES (Inline SVGs base64-encoded to keep seed data lightweight and functional) ---
const MOCK_PHOTO_INSPECTOR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'><rect width='100%' height='100%' fill='%231e2530'/><circle cx='150' cy='80' r='35' fill='%234a5568'/><path d='M90 160c0-30 20-50 60-50s60 20 60 50' fill='%234a5568'/><text x='50%' y='90%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='11' fill='%23a0aec0'>FOTO DE INSPECTOR (MOCK)</text></svg>";
const MOCK_PHOTO_CONTAINER_CHAINED = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'><rect width='100%' height='100%' fill='%231e2530'/><rect x='100' y='60' width='100' height='90' rx='10' fill='%232d3748'/><circle cx='150' cy='50' r='12' fill='none' stroke='%23e53e3e' stroke-width='4'/><path d='M130 90h40M130 115h40' stroke='%23a0aec0' stroke-width='4'/><text x='50%' y='90%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='11' fill='%23e53e3e'>POZA: CONTENEDOR ENCADENADO</text></svg>";
const MOCK_PHOTO_CONTAINER_UNCHAINED = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'><rect width='100%' height='100%' fill='%231e2530'/><rect x='100' y='60' width='100' height='90' rx='10' fill='%232d3748'/><circle cx='130' cy='50' r='10' fill='none' stroke='%23cbd5e0' stroke-width='3'/><text x='50%' y='90%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='11' fill='%23e53e3e'>POZA: CONTENEDOR SIN CADENA</text></svg>";

// --- SEED MOCK DATA (Alineado con las especificaciones de planta) ---
const INITIAL_CONTAINERS = [
    {
        id: "A1-5",
        pavilion: "A1",
        number: 5,
        supervisor: "Felipe Calderón",
        inspector: "Carlos Ruiz",
        reportDate: getOffsetDateString(-1), // Reportado ayer (A tiempo)
        type: "organico",
        capacity: "1100 LT",
        chained: "SI",
        statusAdmin: "pendiente",
        photoInspector: MOCK_PHOTO_INSPECTOR,
        photoContainer: MOCK_PHOTO_CONTAINER_CHAINED,
        notes: "Contenedor en poza colocado y encadenado correctamente. Se reporta acumulación menor de orgánicos en rejillas.",
        updatedAt: getOffsetDateString(-1) + "T10:30:00Z",
        history: [
            { timestamp: getOffsetDateString(-1) + "T10:30:00Z", status: "on-time", notes: "Reporte creado. Contenedor encadenado en poza." }
        ]
    },
    {
        id: "B-20",
        pavilion: "B",
        number: 20,
        supervisor: "Pedro Infante",
        inspector: "Sofía Torres",
        reportDate: getOffsetDateString(-8), // Reportado hace 8 días (Vencido)
        type: "peligroso",
        capacity: "240 LT",
        chained: "NO",
        statusAdmin: "pendiente",
        photoInspector: MOCK_PHOTO_INSPECTOR,
        photoContainer: MOCK_PHOTO_CONTAINER_UNCHAINED,
        notes: "Se detectó contenedor de residuos peligrosos sin candado en cadena de seguridad en poza 20.",
        updatedAt: getOffsetDateString(-8) + "T09:15:00Z",
        history: [
            { timestamp: getOffsetDateString(-8) + "T09:15:00Z", status: "expired", notes: "Reporte creado. Alerta: Contenedor sin candado." }
        ]
    },
    {
        id: "C-12",
        pavilion: "C",
        number: 12,
        supervisor: "Felipe Calderón",
        inspector: "Marta Vaca",
        reportDate: getOffsetDateString(-4), // Reportado hace 4 días calendario (Vence hoy si cruza fin de semana)
        type: "aprovechable",
        capacity: "1100 LT",
        chained: "SI",
        statusAdmin: "pendiente",
        photoInspector: MOCK_PHOTO_INSPECTOR,
        photoContainer: MOCK_PHOTO_CONTAINER_CHAINED,
        notes: "Contenedor de cartón y plásticos (Aprovechables). Cadena asegurada. Tapa ligeramente floja.",
        updatedAt: getOffsetDateString(-4) + "T14:00:00Z",
        history: [
            { timestamp: getOffsetDateString(-4) + "T14:00:00Z", status: "on-time", notes: "Reporte inicial de contenedor aprovechable." }
        ]
    },
    {
        id: "D1-3",
        pavilion: "D1",
        number: 3,
        supervisor: "Ana López",
        inspector: "Marcos Luna",
        reportDate: getOffsetDateString(0), // Reportado hoy (A tiempo)
        type: "no-aprovechable",
        capacity: "240 LT",
        chained: "SI",
        statusAdmin: "pendiente",
        photoInspector: MOCK_PHOTO_INSPECTOR,
        photoContainer: MOCK_PHOTO_CONTAINER_CHAINED,
        notes: "Contenedor gris colocado en la poza. Verificado por el supervisor.",
        updatedAt: getOffsetDateString(0) + "T08:00:00Z",
        history: [
            { timestamp: getOffsetDateString(0) + "T08:00:00Z", status: "on-time", notes: "Contenedor en poza colocado y verificado." }
        ]
    }
];

// --- VARIABLES DE ESTADO ---
let containers = [];
let editingContainerId = null;
let photoInspectorBase64 = null;
let photoContainerBase64 = null;
let currentMonitoringTab = "observados";
let currentUserRole = "supervisor";
let unsavedChanges = {};

// --- DICCIONARIOS DE CONFIGURACIÓN ---
const TYPE_DICT = {
    "organico": { text: "Orgánicos (Marrón)", color: "var(--color-organico)", badgeClass: "badge-organico" },
    "aprovechable": { text: "Aprovechables (Verde)", color: "var(--color-aprovechable)", badgeClass: "badge-aprovechable" },
    "peligroso": { text: "Peligrosos (Rojo)", color: "var(--color-peligroso)", badgeClass: "badge-peligroso" },
    "no-aprovechable": { text: "No Aprovechables (Negro)", color: "var(--color-no-aprovechable)", badgeClass: "badge-no-aprovechable" }
};

const SLA_DICT = {
    "on-time": { text: "A tiempo", color: "var(--status-transit)", badgeClass: "badge-sla-on-time" },
    "warning": { text: "Urgente", color: "#f97316", badgeClass: "badge-sla-warning" },
    "due-today": { text: "Vence Hoy", color: "var(--status-customs)", badgeClass: "badge-sla-due-today" },
    "expired": { text: "Vencido", color: "var(--status-retained)", badgeClass: "badge-sla-expired" }
};

// Helper: Generar fechas relativas para que la data de prueba sea dinámica y real
function getOffsetDateString(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// ==========================================================================
// CÁLCULO DE DÍAS HÁBILES (SLA 3 DÍAS HÁBILES)
// ==========================================================================

/**
 * Calcula la fecha límite sumando 3 días hábiles. Omitiendo Sábados y Domingos.
 * Si se reporta un Sábado o Domingo, el conteo comienza el Lunes.
 */
function calculateDeadline(reportDateStr) {
    const start = new Date(reportDateStr + "T00:00:00");
    const day = start.getDay(); // 0: Dom, 1: Lun, 2: Mar, 3: Mie, 4: Jue, 5: Vie, 6: Sab
    const deadline = new Date(start);
    
    if (day === 5 || day === 6 || day === 0) {
        // Viernes, Sábado y Domingo no cuentan fines de semana -> Vence el Miércoles de la siguiente semana
        if (day === 5) deadline.setDate(start.getDate() + 5); // +5 días (Sáb, Dom, Lun, Mar, Mié)
        else if (day === 6) deadline.setDate(start.getDate() + 4); // +4 días (Dom, Lun, Mar, Mié)
        else if (day === 0) deadline.setDate(start.getDate() + 3); // +3 días (Lun, Mar, Mié)
    } else {
        // Lunes (1) -> Jueves (4) [+3 días]
        // Martes (2) -> Viernes (5) [+3 días]
        // Miércoles (3) -> Lunes de la siguiente semana [+5 días: Jue, Vie, Sáb, Dom, Lun]
        // Jueves (4) -> Martes de la siguiente semana [+5 días: Vie, Sáb, Dom, Lun, Mar]
        if (day === 1 || day === 2) {
            deadline.setDate(start.getDate() + 3);
        } else if (day === 3 || day === 4) {
            deadline.setDate(start.getDate() + 5);
        }
    }
    return deadline;
}

/**
 * Retorna el estado del SLA y días restantes en base a la fecha de hoy
 */
function getSlaInfo(reportDateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadline = calculateDeadline(reportDateStr);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);

    if (today.getTime() > deadlineDate.getTime()) {
        // Expired. Contar días hábiles de retraso
        let pastDays = 0;
        let temp = new Date(deadlineDate);
        while (temp.getTime() < today.getTime()) {
            temp.setDate(temp.getDate() + 1);
            const day = temp.getDay();
            if (day !== 0 && day !== 6) {
                pastDays++;
            }
        }
        return { key: "expired", text: `Vencido (-${pastDays}d)`, daysLeft: -pastDays, deadline: deadlineDate };
    } else if (today.getTime() === deadlineDate.getTime()) {
        return { key: "due-today", text: "Vence Hoy", daysLeft: 0, deadline: deadlineDate };
    } else {
        // On time. Contar días hábiles restantes
        let remainingDays = 0;
        let temp = new Date(today);
        while (temp.getTime() < deadlineDate.getTime()) {
            temp.setDate(temp.getDate() + 1);
            const day = temp.getDay();
            if (day !== 0 && day !== 6) {
                remainingDays++;
            }
        }
        if (remainingDays === 1) {
            return { key: "warning", text: `Urgente (${remainingDays}d)`, daysLeft: remainingDays, deadline: deadlineDate };
        }
        return { key: "on-time", text: `A tiempo (${remainingDays}d)`, daysLeft: remainingDays, deadline: deadlineDate };
    }
}

// Compresor de imágenes en el cliente (evita exceder límites de Supabase/Vercel)
function compressImage(file, maxWidth, maxHeight, quality, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================================================
// ==========================================================================
// PERSISTENCIA (SUPABASE / LOCALSTORAGE FALLBACK)
// ==========================================================================

async function loadData() {
    if (isSupabaseConfigured) {
        try {
            const { data, error } = await supabase
                .from('containers')
                .select('*');

            if (error) throw error;

            if (data && data.length > 0) {
                containers = data.map(c => ({
                    id: c.id,
                    pavilion: c.pavilion,
                    number: parseInt(c.number),
                    supervisor: c.supervisor,
                    inspector: c.inspector,
                    reportDate: c.report_date,
                    type: c.type,
                    capacity: c.capacity,
                    chained: c.chained,
                    statusAdmin: c.status_admin || "pendiente",
                    photoInspector: c.photo_inspector,
                    photoContainer: c.photo_container,
                    notes: c.notes || "",
                    history: c.history || [],
                    createdAt: c.created_at,
                    updatedAt: c.updated_at
                }));
            } else {
                // Si la base de datos está vacía, sembrar con los contenedores iniciales
                containers = [...INITIAL_CONTAINERS];
                await saveData();
            }
            
            updateDashboardMetrics();
            renderMonitoringPanel();
            renderHistoryTable();
            return;
        } catch (err) {
            console.error("Error al cargar desde Supabase, cargando desde localStorage:", err);
            showToast("Error al conectar con la base de datos. Cargando datos locales.", "warning");
        }
    }

    // Fallback LocalStorage
    const stored = localStorage.getItem("waste_containers");
    if (stored) {
        containers = JSON.parse(stored);
        let updated = false;
        containers.forEach(c => {
            if (!c.statusAdmin) {
                c.statusAdmin = "pendiente";
                updated = true;
            }
        });
        if (updated) saveData();
    } else {
        containers = [...INITIAL_CONTAINERS];
        saveData();
    }
}

async function saveData() {
    // Guardar en LocalStorage como respaldo local
    localStorage.setItem("waste_containers", JSON.stringify(containers));

    if (isSupabaseConfigured) {
        try {
            // Guardar masivamente (upsert) en la tabla containers
            const dbData = containers.map(c => ({
                id: c.id,
                pavilion: c.pavilion,
                number: String(c.number),
                supervisor: c.supervisor,
                inspector: c.inspector,
                report_date: c.reportDate,
                type: c.type,
                capacity: c.capacity,
                chained: c.chained,
                status_admin: c.statusAdmin,
                photo_inspector: c.photoInspector,
                photo_container: c.photoContainer,
                notes: c.notes,
                history: c.history,
                created_at: c.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));

            const { error } = await supabase
                .from('containers')
                .upsert(dbData);

            if (error) throw error;
        } catch (err) {
            console.error("Error al guardar en Supabase:", err);
            showToast("Error al guardar en la nube. Cambios guardados localmente.", "warning");
        }
    }
}

// ==========================================================================
// SISTEMA DE NAVEGACIÓN SPA & RELOJ
// ==========================================================================

function initClock() {
    const clockEl = document.getElementById("clock-time");
    if (!clockEl) return;
    
    function updateClock() {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hrs}:${mins}:${secs}`;
    }
    
    updateClock();
    setInterval(updateClock, 1000);
}

function setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-btn");
    const views = document.querySelectorAll(".app-view");
    const viewTitle = document.getElementById("current-view-title");
    const viewSubtitle = document.getElementById("current-view-subtitle");
    
    const viewMeta = {
        "reporte-contenedor": { 
            title: "Reportar Contenedor", 
            subtitle: "Registrar o actualizar información de contenedores observados en poza" 
        },
        "status-general": { 
            title: "Status General", 
            subtitle: "Resumen ejecutivo y estadísticas de cumplimiento de SLA en planta" 
        },
        "historial-contenedores": { 
            title: "Historial de Contenedores", 
            subtitle: "Búsqueda, auditoría e historial de bitácoras y fotos obligatorias" 
        }
    };

    function switchView(targetViewId) {
        // Reiniciar formulario si salimos de él sin guardar
        if (targetViewId !== "reporte-contenedor") {
            resetFormState();
        }

        views.forEach(view => {
            view.classList.remove("active");
            if (view.id === `view-${targetViewId}`) {
                view.classList.add("active");
            }
        });

        navButtons.forEach(btn => {
            btn.classList.remove("active");
            if (btn.getAttribute("data-target") === targetViewId) {
                btn.classList.add("active");
            }
        });

        if (viewMeta[targetViewId]) {
            viewTitle.textContent = viewMeta[targetViewId].title;
            viewSubtitle.textContent = viewMeta[targetViewId].subtitle;
        }

        // Actualizar título móvil centrado
        const mobileTitle = document.getElementById("mobile-title");
        if (mobileTitle) {
            if (targetViewId === "reporte-contenedor") {
                mobileTitle.textContent = "REGISTRO";
            } else if (targetViewId === "status-general") {
                mobileTitle.textContent = "ESTATUS";
            } else if (targetViewId === "historial-contenedores") {
                mobileTitle.textContent = "HISTORIAL";
            }
        }

        // Cerrar menú móvil al cambiar de vista
        const sidebar = document.getElementById("app-sidebar");
        const overlay = document.getElementById("sidebar-overlay");
        if (sidebar) sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("open");

        // Actualizar datos según la vista
        if (targetViewId === "status-general") {
            updateDashboardMetrics();
        } else if (targetViewId === "historial-contenedores") {
            renderHistoryTable();
        }
    }

    navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.getAttribute("data-target");
            switchView(target);
        });
    });

    const btnRefresh = document.getElementById("btn-refresh");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", () => {
            loadData();
            updateDashboardMetrics();
            renderHistoryTable();
            showToast("Registros y plazos recalculados correctamente.", "info");
        });
    }

    const btnSaveStatusChanges = document.getElementById("btn-save-status-changes");
    if (btnSaveStatusChanges) {
        btnSaveStatusChanges.addEventListener("click", () => {
            if (typeof window.saveAllStatusChanges === "function") {
                window.saveAllStatusChanges();
            }
        });
    }

    // Fijar fecha de reporte por defecto a hoy
    document.getElementById("input-report-date").value = new Date().toISOString().split("T")[0];

    return switchView;
}

const triggerSwitchView = setupNavigation();

// ==========================================================================
// SUBIDA DE FOTOS Y PREVISUALIZACIÓN (BASE64)
// ==========================================================================

// ==========================================================================
// REGISTRO POR LOTES (ESTADO Y CARGA DINÁMICA DE FILAS)
// ==========================================================================

let currentBatch = [];

function createEmptyBatchItem() {
    return {
        id: "",
        type: "",
        capacity: "1100 LT",
        chained: "",
        photoInspector: null,
        photoContainer: null,
        notes: ""
    };
}

function initBatch() {
    currentBatch = [createEmptyBatchItem()];
    renderBatchForm();
}

function renderBatchForm() {
    const batchContainersList = document.getElementById("batch-containers-list");
    const btnSubmitForm = document.getElementById("btn-submit-form");
    const btnAddRow = document.getElementById("btn-add-container-row");
    
    if (editingContainerId !== null) {
        btnAddRow.style.display = "none";
    } else {
        btnAddRow.style.display = "flex";
    }

    btnSubmitForm.querySelector("span").textContent = editingContainerId !== null 
        ? "Guardar Cambios" 
        : `Guardar Lote Completo (${currentBatch.length})`;

    batchContainersList.innerHTML = currentBatch.map((item, i) => {
        return `
            <div class="batch-row-card" id="batch-row-${i}">
                <div class="batch-row-header">
                    <div class="batch-row-title">
                        <i data-lucide="package"></i>
                        <span>Contenedor #${i + 1}</span>
                    </div>
                    ${(currentBatch.length > 1 && editingContainerId === null) ? `
                        <button type="button" class="btn-remove-row" onclick="removeBatchRow(${i})">
                            <i data-lucide="trash-2"></i>
                            <span>Eliminar</span>
                        </button>
                    ` : ''}
                </div>
                
                <!-- FILA 1: Código, Capacidad (Segmented), Encadenado (Segmented) -->
                <div class="batch-row-grid">
                    <!-- Código -->
                    <div class="form-group">
                        <label>Código de Contenedor <span class="required">*</span></label>
                        <div class="input-icon-wrapper">
                            <i data-lucide="tag"></i>
                            <input type="text" class="input-row-id" data-index="${i}" placeholder="Ej: A1-5 o B-20" value="${item.id}" ${editingContainerId !== null ? 'disabled' : ''} required>
                        </div>
                        <span class="error-message err-row-id">Código inválido.</span>
                    </div>

                    <!-- Capacidad (Segmented Control) -->
                    <div class="form-group">
                        <label>Capacidad <span class="required">*</span></label>
                        <div class="segmented-control">
                            <div class="segment-btn ${item.capacity === '1100 LT' ? 'active' : ''}" data-row="${i}" data-field="capacity" data-value="1100 LT">
                                <i data-lucide="package"></i>
                                <span>1100 LT</span>
                            </div>
                            <div class="segment-btn ${item.capacity === '240 LT' ? 'active' : ''}" data-row="${i}" data-field="capacity" data-value="240 LT">
                                <i data-lucide="box"></i>
                                <span>240 LT</span>
                            </div>
                        </div>
                        <span class="error-message err-row-capacity">Seleccione capacidad.</span>
                    </div>

                    <!-- ¿Dejado Encadenado? (Segmented Control) -->
                    <div class="form-group">
                        <label>¿Dejado Encadenado? <span class="required">*</span></label>
                        <div class="segmented-control">
                            <div class="segment-btn ${item.chained === 'SI' ? 'active' : ''}" data-row="${i}" data-field="chained" data-value="SI">
                                <i data-lucide="lock"></i>
                                <span>SÍ</span>
                            </div>
                            <div class="segment-btn ${item.chained === 'NO' ? 'active' : ''}" data-row="${i}" data-field="chained" data-value="NO">
                                <i data-lucide="unlock"></i>
                                <span>NO</span>
                            </div>
                        </div>
                        <span class="error-message err-row-chained">Seleccione una opción.</span>
                    </div>
                </div>

                <!-- FILA 2: Tipo de Contenedor (Selection Pills) -->
                <div class="batch-row-grid-2">
                    <div class="form-group">
                        <label>Tipo de Contenedor (Residuos) <span class="required">*</span></label>
                        <div class="selection-pills">
                            <div class="pill-card ${item.type === 'organico' ? 'active' : ''}" data-row="${i}" data-field="type" data-value="organico">
                                <i data-lucide="leaf"></i>
                                <span>Orgánicos (Marrón)</span>
                            </div>
                            <div class="pill-card ${item.type === 'aprovechable' ? 'active' : ''}" data-row="${i}" data-field="type" data-value="aprovechable">
                                <i data-lucide="recycle"></i>
                                <span>Aprovechables (Verde)</span>
                            </div>
                            <div class="pill-card ${item.type === 'peligroso' ? 'active' : ''}" data-row="${i}" data-field="type" data-value="peligroso">
                                <i data-lucide="biohazard"></i>
                                <span>Peligrosos (Rojo)</span>
                            </div>
                            <div class="pill-card ${item.type === 'no-aprovechable' ? 'active' : ''}" data-row="${i}" data-field="type" data-value="no-aprovechable">
                                <i data-lucide="trash-2"></i>
                                <span>No Aprovechables (Negro)</span>
                            </div>
                        </div>
                        <span class="error-message err-row-type" style="margin-top:4px;">Seleccione el tipo de residuo.</span>
                    </div>
                </div>

                <!-- FILA 3: Fotos y Observaciones -->
                <div class="batch-row-grid-3">
                    <!-- Foto Inspector -->
                    <div class="form-group file-group">
                        <label>Foto Inspector <span class="required">*</span></label>
                        <div class="photo-upload-box" data-row="${i}" data-field="photoInspector">
                            <i data-lucide="camera" class="upload-icon"></i>
                            <span>Foto Inspector</span>
                            <input type="file" class="input-row-file" data-row="${i}" data-field="photoInspector" accept="image/*" style="display:none;">
                            <div class="preview-img-container" style="display: ${item.photoInspector ? 'block' : 'none'};">
                                <img src="${item.photoInspector || ''}" alt="Inspector">
                                <button type="button" class="btn-remove-photo-row" data-row="${i}" data-field="photoInspector">
                                    <i data-lucide="x"></i>
                                </button>
                            </div>
                        </div>
                        <span class="error-message err-row-photo-inspector">Requerida.</span>
                    </div>

                    <!-- Foto Contenedor -->
                    <div class="form-group file-group">
                        <label>Foto en Poza <span class="required">*</span></label>
                        <div class="photo-upload-box" data-row="${i}" data-field="photoContainer">
                            <i data-lucide="camera" class="upload-icon"></i>
                            <span>Foto Poza</span>
                            <input type="file" class="input-row-file" data-row="${i}" data-field="photoContainer" accept="image/*" style="display:none;">
                            <div class="preview-img-container" style="display: ${item.photoContainer ? 'block' : 'none'};">
                                <img src="${item.photoContainer || ''}" alt="Contenedor">
                                <button type="button" class="btn-remove-photo-row" data-row="${i}" data-field="photoContainer">
                                    <i data-lucide="x"></i>
                                </button>
                            </div>
                        </div>
                        <span class="error-message err-row-photo-container">Requerida.</span>
                    </div>

                    <!-- Observaciones -->
                    <div class="form-group">
                        <label>Observaciones / Detalles de la Anomalía</label>
                        <textarea class="input-row-notes" data-index="${i}" placeholder="Tapa rota, falta de limpieza, etc...">${item.notes}</textarea>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    lucide.createIcons();
}

window.removeBatchRow = function(index) {
    if (currentBatch.length > 1) {
        currentBatch.splice(index, 1);
        renderBatchForm();
    }
};

function setupBatchFormEvents() {
    const batchContainersList = document.getElementById("batch-containers-list");

    batchContainersList.addEventListener("click", (e) => {
        const btnRemove = e.target.closest(".btn-remove-photo-row");
        if (btnRemove) {
            e.stopPropagation();
            const rowIdx = parseInt(btnRemove.getAttribute("data-row"), 10);
            const field = btnRemove.getAttribute("data-field");
            currentBatch[rowIdx][field] = null;
            renderBatchForm();
            return;
        }

        const selectCard = e.target.closest(".pill-card") || e.target.closest(".segment-btn");
        if (selectCard) {
            e.stopPropagation();
            const rowIdx = parseInt(selectCard.getAttribute("data-row"), 10);
            const field = selectCard.getAttribute("data-field");
            const value = selectCard.getAttribute("data-value");
            
            currentBatch[rowIdx][field] = value;
            
            const parent = selectCard.parentElement;
            parent.querySelectorAll(".pill-card, .segment-btn").forEach(c => {
                c.classList.remove("active");
            });
            
            selectCard.classList.add("active");
            
            const errEl = parent.nextElementSibling;
            if (errEl && errEl.classList.contains("error-message")) {
                errEl.style.display = "none";
            }
            parent.parentElement.classList.remove("invalid");
            return;
        }

        const uploadBox = e.target.closest(".photo-upload-box");
        if (uploadBox) {
            e.stopPropagation();
            const fileInput = uploadBox.querySelector(".input-row-file");
            if (fileInput) fileInput.click();
        }
    });

    batchContainersList.addEventListener("change", (e) => {
        const fileInput = e.target.closest(".input-row-file");
        if (fileInput) {
            const rowIdx = parseInt(fileInput.getAttribute("data-row"), 10);
            const field = fileInput.getAttribute("data-field");
            const file = fileInput.files[0];
            
            if (file) {
                // Compresión de imagen antes de guardar para evitar exceder límites de Supabase/Vercel (max 800px, 70% calidad)
                compressImage(file, 800, 800, 0.7, (compressedBase64) => {
                    currentBatch[rowIdx][field] = compressedBase64;
                    
                    const uploadBox = fileInput.parentElement;
                    const imgContainer = uploadBox.querySelector(".preview-img-container");
                    const img = imgContainer.querySelector("img");
                    img.src = compressedBase64;
                    imgContainer.style.display = "block";
                    
                    uploadBox.parentElement.classList.remove("invalid");
                    const errEl = uploadBox.parentElement.querySelector(".error-message");
                    if (errEl) errEl.style.display = "none";
                });
            }
        }
    });

    batchContainersList.addEventListener("input", (e) => {
        const inputId = e.target.closest(".input-row-id");
        if (inputId) {
            const idx = parseInt(inputId.getAttribute("data-index"), 10);
            currentBatch[idx].id = inputId.value;
            inputId.parentElement.parentElement.classList.remove("invalid");
            const errEl = inputId.parentElement.parentElement.querySelector(".error-message");
            if (errEl) errEl.style.display = "none";
        }

        const inputNotes = e.target.closest(".input-row-notes");
        if (inputNotes) {
            const idx = parseInt(inputNotes.getAttribute("data-index"), 10);
            currentBatch[idx].notes = inputNotes.value;
        }
    });

    document.getElementById("btn-add-container-row").addEventListener("click", () => {
        currentBatch.push(createEmptyBatchItem());
        renderBatchForm();
        showToast("Nueva fila de contenedor agregada al lote.", "info");
        
        setTimeout(() => {
            const newCard = document.getElementById(`batch-row-${currentBatch.length - 1}`);
            if (newCard) {
                newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    });
}

// ==========================================================================
// VISTA: STATUS GENERAL (DASHBOARD CUMPLIMIENTO & RESIDUOS)
// ==========================================================================

function updateDashboardMetrics() {
    renderMonitoringPanel();
}

function renderWasteDonutChart(counts) {
    const total = counts.organico + counts.aprovechable + counts.peligroso + counts["no-aprovechable"];
    const donutChart = document.getElementById("donut-chart");
    const legendEl = document.getElementById("donut-legend");
    const centerTotalText = document.getElementById("donut-total-count");

    centerTotalText.textContent = total;
    
    if (total === 0) {
        donutChart.innerHTML = `<circle cx="50" cy="50" r="38" fill="transparent" stroke="#222c3f" stroke-width="12" />`;
        legendEl.innerHTML = `<span class="text-muted">Sin reportes registrados</span>`;
        return;
    }

    const segments = [
        { name: "Orgánicos", val: counts.organico, key: "organico", color: "var(--color-organico)" },
        { name: "Aprovechables", val: counts.aprovechable, key: "aprovechable", color: "var(--color-aprovechable)" },
        { name: "Peligrosos", val: counts.peligroso, key: "peligroso", color: "var(--color-peligroso)" },
        { name: "No Aprovechables", val: counts["no-aprovechable"], key: "no-aprovechable", color: "var(--color-no-aprovechable)" }
    ];

    const r = 38;
    const circ = 2 * Math.PI * r;
    let currentOffset = 0;
    let svgHtml = "";
    let legendHtml = "";

    segments.forEach(segment => {
        if (segment.val === 0) return;
        
        const pct = (segment.val / total);
        const dashArray = pct * circ;
        const dashOffset = circ - dashArray + currentOffset;

        svgHtml += `
            <circle class="donut-segment" 
                    cx="50" 
                    cy="50" 
                    r="${r}" 
                    fill="transparent" 
                    stroke="${segment.color}" 
                    stroke-width="12" 
                    stroke-dasharray="${dashArray} ${circ - dashArray}" 
                    stroke-dashoffset="${dashOffset}" />
        `;
        currentOffset -= dashArray;

        const percentage = Math.round(pct * 100);
        legendHtml += `
            <div class="legend-item" onclick="filterByTypeFromChart('${segment.key}')">
                <div class="legend-label-box">
                    <span class="legend-color-dot" style="background-color: ${segment.color}"></span>
                    <span class="legend-name">${segment.name}</span>
                </div>
                <span class="legend-value">${segment.val} (${percentage}%)</span>
            </div>
        `;
    });

    donutChart.innerHTML = svgHtml;
    legendEl.innerHTML = legendHtml;
}

window.filterByTypeFromChart = function(typeKey) {
    document.getElementById("filter-type").value = typeKey;
    triggerSwitchView("historial-contenedores");
    filterHistory();
};

function renderSlaAlerts() {
    const alertsList = document.getElementById("recent-alerts-list");
    
    // Obtener información de SLA de contenedores activos (no resueltos)
    const activeContainers = containers.filter(c => c.statusAdmin !== "listo");
    const containerSlas = activeContainers.map(c => {
        return {
            ...c,
            sla: getSlaInfo(c.reportDate)
        };
    });

    // Ordenar: Expired primero (más antiguos retrasados primero), luego Due Today, luego On Time (menor plazo restante primero)
    containerSlas.sort((a, b) => {
        // Dar peso a los estados: expired (3), due-today (2), on-time (1)
        const weightA = a.sla.key === "expired" ? 3 : (a.sla.key === "due-today" ? 2 : 1);
        const weightB = b.sla.key === "expired" ? 3 : (b.sla.key === "due-today" ? 2 : 1);
        
        if (weightA !== weightB) {
            return weightB - weightA; // Descendente por peso
        }
        // Si tienen el mismo peso, ordenar por días restantes (menor a mayor)
        return a.sla.daysLeft - b.sla.daysLeft;
    });

    const activeAlerts = containerSlas.slice(0, 5);

    if (activeAlerts.length === 0) {
        alertsList.innerHTML = `<li class="text-muted" style="text-align:center; padding:20px;">No hay reportes de alerta.</li>`;
        return;
    }

    alertsList.innerHTML = activeAlerts.map(c => {
        let iconName = "calendar";
        let statusText = "";
        
        if (c.sla.key === "expired") {
            iconName = "alert-octagon";
            statusText = `SLA VENCIDO hace ${Math.abs(c.sla.daysLeft)} días hábiles`;
        } else if (c.sla.key === "due-today") {
            iconName = "hourglass";
            statusText = `VENCE HOY`;
        } else {
            iconName = "clock";
            statusText = `A tiempo (${c.sla.daysLeft}d restantes)`;
        }

        const limitDateFormatted = new Date(c.sla.deadline).toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short"
        });

        return `
            <li class="alert-item" data-type="${c.sla.key}">
                <div class="alert-icon-box">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="alert-info">
                    <div class="alert-item-header">
                        <span class="alert-title">Contenedor ${c.id} (${TYPE_DICT[c.type].text.split(" ")[0]})</span>
                        <span class="alert-time">Límite: ${limitDateFormatted}</span>
                    </div>
                    <p class="alert-desc"><strong>${statusText}:</strong> Reportado por ${c.inspector}. Encadenado: ${c.chained}.</p>
                </div>
            </li>
        `;
    }).join("");

    lucide.createIcons();
}

function renderMonitoringPanel() {
    const monitoringBody = document.getElementById("monitoring-table-body");
    if (!monitoringBody) return;

    // 1. Filtrar lista por la pestaña seleccionada
    let filtered = [];
    if (currentMonitoringTab === "observados") {
        filtered = containers.filter(c => c.statusAdmin === "pendiente" || c.statusAdmin === "en-reparacion" || c.statusAdmin === "no-encadenado");
    } else if (currentMonitoringTab === "presentados") {
        filtered = containers.filter(c => c.statusAdmin === "presentado");
    } else if (currentMonitoringTab === "listos") {
        filtered = containers.filter(c => c.statusAdmin === "listo");
    } else {
        filtered = containers; // todos
    }

    // Ordenar por prioridad (No Encadenado/Rojo > En reparación/Naranja > Reportado/Blanco > Presentado/Azul > Listo/Verde)
    // En caso de empate, ordenar por vencimiento SLA (los más urgentes o vencidos primero)
    function getStatusPriorityWeight(status) {
        switch (status) {
            case "no-encadenado": return 5;
            case "en-reparacion": return 4;
            case "pendiente": return 3;
            case "presentado": return 2;
            case "listo": return 1;
            default: return 0;
        }
    }

    filtered.sort((a, b) => {
        // 1. Colocar los resueltos ("listo") al final siempre
        const isListoA = a.statusAdmin === "listo" ? 1 : 0;
        const isListoB = b.statusAdmin === "listo" ? 1 : 0;
        if (isListoA !== isListoB) {
            return isListoA - isListoB; // 0 (no listo) va antes de 1 (listo)
        }
        
        // 2. Si ambos no están resueltos, ordenar por urgencia de SLA (días restantes de menor a mayor)
        if (a.statusAdmin !== "listo") {
            const slaA = getSlaInfo(a.reportDate);
            const slaB = getSlaInfo(b.reportDate);
            if (slaA.daysLeft !== slaB.daysLeft) {
                return slaA.daysLeft - slaB.daysLeft; // Los más urgentes (menos días) primero
            }
            
            // Empate de días: ordenar por peso de estado operativo
            const weightA = getStatusPriorityWeight(a.statusAdmin);
            const weightB = getStatusPriorityWeight(b.statusAdmin);
            if (weightA !== weightB) {
                return weightB - weightA;
            }
        }
        
        // 3. Si ambos están resueltos (o empate total), ordenar por fecha de modificación (más reciente primero)
        const dateA = new Date(a.updatedAt || a.reportDate);
        const dateB = new Date(b.updatedAt || b.reportDate);
        return dateB - dateA;
    });

    // 2. Calcular contadores de las pestañas
    const countObservados = containers.filter(c => c.statusAdmin === "pendiente" || c.statusAdmin === "en-reparacion" || c.statusAdmin === "no-encadenado").length;
    const countPresentados = containers.filter(c => c.statusAdmin === "presentado").length;
    const countListos = containers.filter(c => c.statusAdmin === "listo").length;
    const countTodos = containers.length;

    // Actualizar etiquetas en los botones
    const badgeObservados = document.getElementById("count-tab-observados");
    const badgePresentados = document.getElementById("count-tab-presentados");
    const badgeListos = document.getElementById("count-tab-listos");
    const badgeTodos = document.getElementById("count-tab-todos");

    if (badgeObservados) badgeObservados.textContent = countObservados;
    if (badgePresentados) badgePresentados.textContent = countPresentados;
    if (badgeListos) badgeListos.textContent = countListos;
    if (badgeTodos) badgeTodos.textContent = countTodos;

    if (filtered.length === 0) {
        monitoringBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 40px; color: var(--text-muted);">
                    <i data-lucide="info" style="width: 24px; height: 24px; margin-bottom: 8px; stroke-width: 1.5;"></i>
                    <p style="font-size: 13px; font-weight: 500;">No hay contenedores en este apartado.</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    monitoringBody.innerHTML = filtered.map(c => {
        const typeMeta = TYPE_DICT[c.type] || { text: "Otro", badgeClass: "" };
        const sla = getSlaInfo(c.reportDate);
        const slaMeta = SLA_DICT[sla.key] || { text: "SLA", badgeClass: "" };
        
        const dateObj = new Date(c.reportDate + "T00:00:00");
        const dateFormatted = dateObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
        
        const deadlineObj = new Date(sla.deadline);
        const deadlineFormatted = deadlineObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
        
        const currentStatusVal = unsavedChanges[c.id] || c.statusAdmin;
        
        let slaBadgeHtml = "";
        if (currentStatusVal === "listo") {
            slaBadgeHtml = `<span class="badge badge-sla-on-time" style="background-color: var(--status-transit-glow); border-color: var(--status-transit); color: hsl(142, 76%, 70%);">Resuelto</span>`;
        } else {
            slaBadgeHtml = `<span class="badge ${slaMeta.badgeClass}">${sla.text}</span>`;
        }

        // Icono de Alerta de Urgencia si quedan 1d o menos y no está listo
        const isUrgent = (sla.daysLeft <= 1 && currentStatusVal !== "listo");
        const urgentAlertHtml = isUrgent ? `<i data-lucide="alert-triangle" style="width:14px; height:14px; color:var(--status-retained); animation: pulse-retained 1.5s infinite; vertical-align: middle; margin-left: 6px;" title="Urgente: Plazo por vencer o vencido"></i>` : "";

        return `
            <tr class="status-row-bg val-${currentStatusVal}">
                <td style="font-weight: 700; color: var(--text-primary); font-size: 14px;">
                    <span>${c.id}</span>
                    ${urgentAlertHtml}
                </td>
                <td><span class="badge ${typeMeta.badgeClass}">${typeMeta.text}</span></td>
                <td>
                    <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${c.supervisor}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${c.inspector} (Insp.)</div>
                </td>
                <td style="font-size: 13px; color: var(--text-secondary);">${dateFormatted}</td>
                <td>
                    <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">${deadlineFormatted}</div>
                    <div>${slaBadgeHtml}</div>
                </td>
                <td>
                    <div class="photo-thumbnail-group">
                        <div class="photo-thumbnail-wrapper" onclick="openLightbox('Foto Inspector: ${c.id}', '${c.photoInspector}')" title="Ver Foto de Inspector">
                            <img src="${c.photoInspector}" class="photo-thumbnail" alt="Inspector">
                        </div>
                        <div class="photo-thumbnail-wrapper" onclick="openLightbox('Foto Contenedor Poza: ${c.id}', '${c.photoContainer}')" title="Ver Foto de Contenedor">
                            <img src="${c.photoContainer}" class="photo-thumbnail" alt="Contenedor">
                        </div>
                    </div>
                </td>
                <td class="status-cell-bg val-${currentStatusVal}">
                    <div class="status-select-wrapper">
                        <select class="status-select val-${currentStatusVal}" onchange="changeContainerAdminStatus('${c.id}', this.value)">
                            <option value="pendiente" ${currentStatusVal === "pendiente" ? "selected" : ""}>Reportado (Blanco)</option>
                            <option value="en-reparacion" ${currentStatusVal === "en-reparacion" ? "selected" : ""}>En reparación (Naranja)</option>
                            <option value="listo" ${currentStatusVal === "listo" ? "selected" : ""}>Listo (Verde)</option>
                            <option value="presentado" ${currentStatusVal === "presentado" ? "selected" : ""}>Presentado (Azul)</option>
                            <option value="no-encadenado" ${currentStatusVal === "no-encadenado" ? "selected" : ""}>No Encadenado (Rojo)</option>
                        </select>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    // Renderizar filas en la tabla de impresión en el orden solicitado: Código, Tipo, Capacidad, Supervisor, Inspector, Observación, Fecha de Observación, Fecha Límite.
    const printMonitoringBody = document.getElementById("print-monitoring-table-body");
    if (printMonitoringBody) {
        printMonitoringBody.innerHTML = filtered.map(c => {
            const typeMeta = TYPE_DICT[c.type] || { text: "Otro" };
            const typeText = typeMeta.text.split(" ")[0]; // Solo el nombre del residuo
            const sla = getSlaInfo(c.reportDate);
            
            const dateObj = new Date(c.reportDate + "T00:00:00");
            const dateFormatted = dateObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
            
            const deadlineObj = new Date(sla.deadline);
            const deadlineFormatted = deadlineObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
            
            const obs = c.notes.trim() || "Sin observaciones";
            const currentStatusVal = unsavedChanges[c.id] || c.statusAdmin;
            
            return `
                <tr class="status-row-bg val-${currentStatusVal}">
                    <td style="font-weight: bold; color: #000 !important;">${c.id}</td>
                    <td style="color: #000 !important;">${typeText}</td>
                    <td style="color: #000 !important;">${c.capacity}</td>
                    <td style="color: #000 !important;">${c.supervisor}</td>
                    <td style="color: #000 !important;">${c.inspector}</td>
                    <td style="color: #000 !important;">${obs}</td>
                    <td style="font-family: monospace; color: #000 !important;">${dateFormatted}</td>
                    <td style="font-family: monospace; font-weight: bold; color: #000 !important;">${deadlineFormatted}</td>
                </tr>
            `;
        }).join("");
    }

    lucide.createIcons();
}

window.switchMonitoringTab = function(tab) {
    currentMonitoringTab = tab;
    
    // Cambiar clase activa en los botones de pestañas
    const tabButtons = document.querySelectorAll(".monitoring-tabs .tab-btn");
    tabButtons.forEach(btn => {
        if (btn.getAttribute("data-tab") === tab) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    renderMonitoringPanel();
};

window.changeContainerAdminStatus = function(id, newStatus) {
    const idx = containers.findIndex(c => c.id === id);
    if (idx > -1) {
        const savedStatus = containers[idx].statusAdmin;
        if (savedStatus === newStatus) {
            delete unsavedChanges[id];
        } else {
            unsavedChanges[id] = newStatus;
        }
        
        // Mostrar/Ocultar botón Guardar
        const btnSaveStatusChanges = document.getElementById("btn-save-status-changes");
        if (btnSaveStatusChanges) {
            if (Object.keys(unsavedChanges).length > 0) {
                btnSaveStatusChanges.style.display = "flex";
            } else {
                btnSaveStatusChanges.style.display = "none";
            }
        }
        
        renderMonitoringPanel();
    }
};

window.saveAllStatusChanges = function() {
    const ids = Object.keys(unsavedChanges);
    if (ids.length === 0) return;

    let updatedCount = 0;
    ids.forEach(id => {
        const newStatus = unsavedChanges[id];
        const idx = containers.findIndex(c => c.id === id);
        if (idx > -1) {
            const oldStatus = containers[idx].statusAdmin;
            containers[idx].statusAdmin = newStatus;
            
            // Agregar bitácora al historial
            const timestamp = new Date().toISOString();
            let notesMsg = "";
            if (newStatus === "pendiente") notesMsg = "Estado restablecido por Coordinador a Reportado (Blanco).";
            else if (newStatus === "presentado") notesMsg = "Estado cambiado por Coordinador a Presentado (Azul).";
            else if (newStatus === "en-reparacion") notesMsg = "Estado cambiado por Coordinador a En Reparación (Naranja).";
            else if (newStatus === "listo") notesMsg = "Estado cambiado por Coordinador a Listo (Verde - Incidencia Resuelta).";
            else if (newStatus === "no-encadenado") notesMsg = "Estado cambiado por Coordinador a No Encadenado (Rojo - Alerta Activa).";

            containers[idx].history.push({
                timestamp: timestamp,
                status: getSlaInfo(containers[idx].reportDate).key,
                notes: notesMsg
            });
            updatedCount++;
        }
    });

    unsavedChanges = {}; // Vaciar cambios pendientes
    saveData();
    updateDashboardMetrics();
    
    // Ocultar botón Guardar Cambios
    const btnSaveStatusChanges = document.getElementById("btn-save-status-changes");
    if (btnSaveStatusChanges) {
        btnSaveStatusChanges.style.display = "none";
    }

    renderMonitoringPanel();
    
    // Actualizar tabla de historial si está abierta
    if (typeof renderHistoryTable === "function") {
        renderHistoryTable();
    }

    showToast(`Se guardaron los cambios de ${updatedCount} contenedor(es) correctamente.`, "success");
};

window.openLightbox = function(title, imgSrc) {
    const modal = document.getElementById("lightbox-modal");
    const img = document.getElementById("lightbox-img");
    const titleEl = document.getElementById("lightbox-title");
    
    titleEl.textContent = title;
    img.src = imgSrc;
    modal.classList.add("open");
};

// Configurar cierre del lightbox
document.getElementById("btn-close-lightbox").addEventListener("click", () => {
    document.getElementById("lightbox-modal").classList.remove("open");
});
document.getElementById("lightbox-modal").addEventListener("click", (e) => {
    if (e.target.id === "lightbox-modal") {
        document.getElementById("lightbox-modal").classList.remove("open");
    }
});

// ==========================================================================
// VISTA: REPORTE DE CONTENEDOR (LOGICA FORMULARIO)
// ==========================================================================

const reportForm = document.getElementById("report-container-form");
const inputSupervisor = document.getElementById("input-supervisor");
const inputReportDate = document.getElementById("input-report-date");
const inputInspector = document.getElementById("input-inspector");

let currentFormStep = 1;

function switchFormStep(step) {
    currentFormStep = step;
    const step1Div = document.getElementById("form-step-1");
    const step2Div = document.getElementById("form-step-2");
    const stepper1 = document.getElementById("stepper-step-1");
    const stepper2 = document.getElementById("stepper-step-2");
    const connector = document.querySelector(".step-connector");
    
    if (step === 1) {
        step1Div.style.display = "block";
        step2Div.style.display = "none";
        stepper1.classList.add("active");
        stepper2.classList.remove("active");
        connector.classList.remove("completed");
    } else {
        // Actualizar resumen en Paso 2
        document.getElementById("summary-val-supervisor").textContent = inputSupervisor.value.trim() || "-";
        document.getElementById("summary-val-inspector").textContent = inputInspector.value.trim() || "-";
        
        const reportDateVal = inputReportDate.value;
        if (reportDateVal) {
            const dateObj = new Date(reportDateVal + "T00:00:00");
            document.getElementById("summary-val-date").textContent = dateObj.toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        } else {
            document.getElementById("summary-val-date").textContent = "-";
        }
        
        step1Div.style.display = "none";
        step2Div.style.display = "block";
        stepper1.classList.add("active");
        stepper2.classList.add("active");
        connector.classList.add("completed");
        
        // Asegurarse de renderizar el lote
        renderBatchForm();
    }
}

function resetFormState() {
    reportForm.reset();
    editingContainerId = null;
    
    document.getElementById("form-card-title").textContent = "Registro de Contenedores por Lotes";
    
    // Remover validaciones
    const groups = reportForm.querySelectorAll(".form-group");
    groups.forEach(g => g.classList.remove("invalid"));
    
    // Reestablecer fecha por defecto a hoy
    inputReportDate.value = new Date().toISOString().split("T")[0];
    
    // Reiniciar lote y volver al paso 1
    initBatch();
    switchFormStep(1);
}

// Botones de Navegación del Asistente (Wizard)
document.getElementById("btn-cancel-step1").addEventListener("click", () => {
    resetFormState();
    triggerSwitchView("status-general");
});

document.getElementById("btn-next-step").addEventListener("click", () => {
    if (validateHeader()) {
        switchFormStep(2);
    } else {
        showToast("Complete los datos generales del turno para continuar.", "error");
    }
});

document.getElementById("btn-prev-step").addEventListener("click", () => {
    switchFormStep(1);
});

document.getElementById("btn-edit-header").addEventListener("click", () => {
    switchFormStep(1);
});

reportForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    if (validateForm()) {
        const supervisor = inputSupervisor.value.trim();
        const reportDate = inputReportDate.value;
        const inspector = inputInspector.value.trim();
        const timestamp = new Date().toISOString();
        
        // Guardar cada contenedor del lote
        currentBatch.forEach(item => {
            const id = item.id.trim().toUpperCase().replace(/\s+/g, '');
            const parts = id.split("-");
            const pavilion = parts[0];
            const number = parseInt(parts[1], 10);
            
            const existingIdx = containers.findIndex(c => c.id === id);
            
            if (existingIdx > -1) {
                // EDITAR CONTENEDOR EXISTENTE
                const prevChained = containers[existingIdx].chained;
                
                containers[existingIdx].supervisor = supervisor;
                containers[existingIdx].reportDate = reportDate;
                containers[existingIdx].inspector = inspector;
                containers[existingIdx].type = item.type;
                containers[existingIdx].capacity = item.capacity;
                containers[existingIdx].chained = item.chained;
                containers[existingIdx].notes = item.notes;
                containers[existingIdx].updatedAt = timestamp;
                
                // Actualizar fotos si fueron reemplazadas
                if (item.photoInspector) containers[existingIdx].photoInspector = item.photoInspector;
                if (item.photoContainer) containers[existingIdx].photoContainer = item.photoContainer;
                
                containers[existingIdx].history.push({
                    timestamp: timestamp,
                    status: getSlaInfo(reportDate).key,
                    notes: `Registro modificado por supervisor. Encadenado: ${item.chained}. Obs: ${item.notes}`
                });
            } else {
                // NUEVO REGISTRO EN EL LOTE
                const newContainer = {
                    id: id,
                    pavilion: pavilion,
                    number: number,
                    supervisor: supervisor,
                    reportDate: reportDate,
                    inspector: inspector,
                    type: item.type,
                    capacity: item.capacity,
                    chained: item.chained,
                    statusAdmin: "pendiente",
                    photoInspector: item.photoInspector,
                    photoContainer: item.photoContainer,
                    notes: item.notes,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    history: [
                        {
                            timestamp: timestamp,
                            status: getSlaInfo(reportDate).key,
                            notes: `Reporte creado en lote. Supervisor: ${supervisor}. Obs: ${item.notes}`
                        }
                    ]
                };
                containers.unshift(newContainer);
            }
        });
        
        // 1. Compilar Reporte para WhatsApp
        const dateObj = new Date(reportDate + "T00:00:00");
        const dateFormatted = dateObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
        const sla = getSlaInfo(reportDate);
        const deadlineObj = new Date(sla.deadline);
        const deadlineFormatted = deadlineObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

        // Compilar bloques por cada contenedor en el orden solicitado: Código, Tipo, Capacidad, Supervisor, Inspector, Observación, Fecha de Observación, Fecha Límite.
        let containerBlocks = "";
        currentBatch.forEach((item, index) => {
            const id = item.id.trim().toUpperCase().replace(/\s+/g, '');
            const typeMeta = TYPE_DICT[item.type];
            const typeText = typeMeta ? typeMeta.text : "Otro";
            const cap = item.capacity;
            const obs = item.notes.trim() || "Sin observaciones específicas";
            
            containerBlocks += `📦 *Contenedor ${index + 1}:*
• Código: ${id}
• Tipo: ${typeText}
• Capacidad: ${cap}
• Supervisor: ${supervisor}
• Inspector: ${inspector}
• Observación: ${obs}
• Fecha de Observación: ${dateFormatted}
• Fecha Límite: ${deadlineFormatted}\n\n`;
        });

        // Compilar mensaje completo
        const whatsappText = `✅ *REPORTE DE OBSERVACIÓN DE CONTENEDORES*

${containerBlocks}*Petroaseo S.A.*`;

        const waTextArea = document.getElementById("whatsapp-text-area");
        if (waTextArea) {
            waTextArea.value = whatsappText.trim();
        }

        const waModal = document.getElementById("whatsapp-modal");
        if (waModal) {
            waModal.classList.add("open");
        }

        saveData();
        const count = currentBatch.length;
        resetFormState();
        showToast(`Se registraron ${count} reportes exitosamente.`, "success");
        triggerSwitchView("reporte-contenedor");
    } else {
        showToast("Verifique los campos con errores en las tarjetas de contenedor.", "error");
    }
});

function validateHeader() {
    let isHeaderValid = true;
    
    // Supervisor
    const grpSupervisor = inputSupervisor.parentElement.parentElement;
    if (!inputSupervisor.value.trim()) {
        grpSupervisor.classList.add("invalid");
        isHeaderValid = false;
    } else {
        grpSupervisor.classList.remove("invalid");
    }
    
    // Fecha
    const grpDate = inputReportDate.parentElement.parentElement;
    if (!inputReportDate.value) {
        grpDate.classList.add("invalid");
        isHeaderValid = false;
    } else {
        grpDate.classList.remove("invalid");
    }
    
    // Inspector
    const grpInspector = inputInspector.parentElement.parentElement;
    if (!inputInspector.value.trim()) {
        grpInspector.classList.add("invalid");
        isHeaderValid = false;
    } else {
        grpInspector.classList.remove("invalid");
    }
    
    return isHeaderValid;
}

function validateForm() {
    // Primero validar cabecera
    let isValid = validateHeader();
    
    // Validar Contenedores del Lote
    const containerRegex = /^(A|B|C|D|A[1-6]|B[1-3]|D[1-3])-([1-9]|[12][0-9]|3[0-5])$/i;
    const usedIdsInBatch = new Set();
    
    currentBatch.forEach((item, i) => {
        const rowEl = document.getElementById(`batch-row-${i}`);
        if (!rowEl) return;
        
        rowEl.querySelectorAll(".form-group").forEach(g => g.classList.remove("invalid"));
        rowEl.querySelectorAll(".error-message").forEach(e => e.style.display = "none");
        
        // Validar ID Código
        const rawId = item.id.trim().toUpperCase().replace(/\s+/g, '');
        const grpId = rowEl.querySelector(".input-row-id").parentElement.parentElement;
        const errId = rowEl.querySelector(".err-row-id");
        
        if (!rawId) {
            grpId.classList.add("invalid");
            errId.textContent = "El código es obligatorio.";
            errId.style.display = "block";
            isValid = false;
        } else if (!containerRegex.test(rawId)) {
            grpId.classList.add("invalid");
            errId.textContent = "Formato inválido (Ej: A1-5, B-20) con número del 1 al 35.";
            errId.style.display = "block";
            isValid = false;
        } else if (usedIdsInBatch.has(rawId)) {
            grpId.classList.add("invalid");
            errId.textContent = "Este código ya fue ingresado en este lote.";
            errId.style.display = "block";
            isValid = false;
        } else {
            // Validar existencia global de ID (si no se edita ese mismo ID)
            const globalIdx = containers.findIndex(c => c.id === rawId);
            if (globalIdx > -1 && editingContainerId !== rawId) {
                grpId.classList.add("invalid");
                errId.textContent = "Esta poza / contenedor ya tiene un reporte activo.";
                errId.style.display = "block";
                isValid = false;
            } else {
                usedIdsInBatch.add(rawId);
            }
        }
        
        // Validar Tipo
        const grpType = rowEl.querySelector(".err-row-type").parentElement;
        if (!item.type) {
            grpType.classList.add("invalid");
            rowEl.querySelector(".err-row-type").style.display = "block";
            isValid = false;
        }
        
        // Validar Capacidad
        const grpCapacity = rowEl.querySelector(".err-row-capacity").parentElement;
        if (!item.capacity) {
            grpCapacity.classList.add("invalid");
            rowEl.querySelector(".err-row-capacity").style.display = "block";
            isValid = false;
        }
        
        // Validar Encadenado
        const grpChained = rowEl.querySelector(".err-row-chained").parentElement;
        if (!item.chained) {
            grpChained.classList.add("invalid");
            rowEl.querySelector(".err-row-chained").style.display = "block";
            isValid = false;
        }
        
        // Validar Foto Inspector
        const grpPhotoInsp = rowEl.querySelector(".err-row-photo-inspector").parentElement;
        if (!item.photoInspector) {
            grpPhotoInsp.classList.add("invalid");
            rowEl.querySelector(".err-row-photo-inspector").style.display = "block";
            isValid = false;
        }
        
        // Validar Foto Contenedor
        const grpPhotoCont = rowEl.querySelector(".err-row-photo-container").parentElement;
        if (!item.photoContainer) {
            grpPhotoCont.classList.add("invalid");
            rowEl.querySelector(".err-row-photo-container").style.display = "block";
            isValid = false;
        }
    });
    
    return isValid;
}

// Escuchar cambios en controles de cabecera para remover avisos de error
[inputSupervisor, inputReportDate, inputInspector].forEach(el => {
    el.addEventListener("input", () => el.parentElement.parentElement.classList.remove("invalid"));
    el.addEventListener("change", () => el.parentElement.parentElement.classList.remove("invalid"));
});

const tableBody = document.getElementById("table-body-containers");
const emptyStateEl = document.getElementById("table-empty-state");
const searchInput = document.getElementById("search-input");
const filterTypeSelect = document.getElementById("filter-type");
const filterSlaSelect = document.getElementById("filter-sla");
const btnClearFilters = document.getElementById("btn-clear-filters");

function renderHistoryTable(filteredList = null) {
    const listToRender = filteredList !== null ? filteredList : containers;
    
    if (listToRender.length === 0) {
        tableBody.innerHTML = "";
        emptyStateEl.style.display = "flex";
        return;
    }
    
    emptyStateEl.style.display = "none";
    
    tableBody.innerHTML = listToRender.map(c => {
        const typeMeta = TYPE_DICT[c.type];
        const sla = getSlaInfo(c.reportDate);
        const slaMeta = SLA_DICT[sla.key];
        
        const reportDateFormatted = new Date(c.reportDate + "T00:00:00").toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });

        // Formatear Fecha de Registro
        const regDate = c.createdAt || c.updatedAt || c.reportDate;
        let regDateFormatted = "";
        if (regDate) {
            const regDateObj = new Date(regDate);
            if (typeof regDate === "string" && regDate.includes("T") && !isNaN(regDateObj.getTime())) {
                regDateFormatted = regDateObj.toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                }) + " " + regDateObj.toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit"
                });
            } else {
                regDateFormatted = new Date((typeof regDate === "string" && regDate.includes("T") ? regDate.split("T")[0] : regDate) + "T00:00:00").toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                });
            }
        } else {
            regDateFormatted = "-";
        }

        const deadlineFormatted = new Date(sla.deadline).toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
        
        return `
            <tr id="row-${c.id}">
                <td>
                    <span class="container-id-cell">${c.id}</span>
                </td>
                <td>
                    <span class="badge ${typeMeta.badgeClass}">${typeMeta.text.split(" ")[0]}</span>
                </td>
                <td style="color:var(--text-secondary); font-weight:500;">${c.capacity}</td>
                <td style="color: ${c.chained === "SI" ? "var(--status-transit)" : "var(--status-retained)"}; font-weight:600;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="${c.chained === "SI" ? "lock" : "unlock"}" style="width:14px; height:14px;"></i>
                        <span>${c.chained}</span>
                    </div>
                </td>
                <td>
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-size:13px; font-weight:600; color:var(--text-primary);">${c.supervisor}</span>
                        <span style="font-size:11px; color:var(--text-muted);">Insp: ${c.inspector}</span>
                    </div>
                </td>
                <td style="font-size:13px; color:var(--text-secondary); font-family:monospace;">${reportDateFormatted}</td>
                <td style="font-size:13px; color:var(--text-secondary); font-family:monospace;">${regDateFormatted}</td>
                <td style="font-size:13px; color:var(--text-secondary); font-family:monospace; font-weight:600;">${deadlineFormatted}</td>
                <td>
                    <span class="badge ${slaMeta.badgeClass}">${sla.text}</span>
                </td>
                <td class="actions-col">
                    <div style="display:flex; justify-content:flex-end; gap:6px;">
                        <button class="btn-icon" onclick="openDetailsModal('${c.id}')" title="Ver Detalles y Fotos">
                            <i data-lucide="eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    
    lucide.createIcons();
}

function filterHistory() {
    const searchVal = searchInput.value.toLowerCase().trim();
    const typeVal = filterTypeSelect.value;
    const slaVal = filterSlaSelect.value;
    
    const filtered = containers.filter(c => {
        const matchesSearch = c.id.toLowerCase().includes(searchVal) ||
                             c.supervisor.toLowerCase().includes(searchVal) ||
                             c.inspector.toLowerCase().includes(searchVal);
                             
        const matchesType = typeVal === "all" || c.type === typeVal;
        
        const sla = getSlaInfo(c.reportDate);
        const matchesSla = slaVal === "all" || sla.key === slaVal;
        
        return matchesSearch && matchesType && matchesSla;
    });
    
    renderHistoryTable(filtered);
}

[searchInput, filterTypeSelect, filterSlaSelect].forEach(el => {
    el.addEventListener("input", filterHistory);
    el.addEventListener("change", filterHistory);
});

btnClearFilters.addEventListener("click", () => {
    searchInput.value = "";
    filterTypeSelect.value = "all";
    filterSlaSelect.value = "all";
    renderHistoryTable();
    showToast("Filtros de historial limpiados.", "info");
});

// ==========================================================================
// MODAL DE DETALLES Y FOTOS DE RESPALDO
// ==========================================================================

const detailModal = document.getElementById("detail-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCloseModalFooter = document.getElementById("btn-modal-close-footer");
const btnModalEdit = document.getElementById("btn-modal-edit");
let activeModalContainerId = null;

function closeModal() {
    detailModal.classList.remove("open");
    activeModalContainerId = null;
}

[btnCloseModal, btnCloseModalFooter].forEach(btn => {
    btn.addEventListener("click", closeModal);
});

detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) closeModal();
});

window.openDetailsModal = function(id) {
    const container = containers.find(c => c.id === id);
    if (!container) return;
    
    activeModalContainerId = id;
    
    const sla = getSlaInfo(container.reportDate);
    const typeMeta = TYPE_DICT[container.type];

    // Llenar campos de texto
    document.getElementById("modal-container-id").textContent = `Contenedor ${container.id}`;
    document.getElementById("modal-val-supervisor").textContent = container.supervisor;
    document.getElementById("modal-val-inspector").textContent = container.inspector;
    document.getElementById("modal-val-capacity").textContent = container.capacity;
    document.getElementById("modal-val-chained").textContent = container.chained;
    
    document.getElementById("modal-val-report-date").textContent = new Date(container.reportDate + "T00:00:00").toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
    
    // Poblar Fecha de Registro
    const regDate = container.createdAt || container.updatedAt || container.reportDate;
    const regDateObj = new Date(regDate);
    if (typeof regDate === "string" && regDate.includes("T") && !isNaN(regDateObj.getTime())) {
        document.getElementById("modal-val-registration-date").textContent = regDateObj.toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "long",
            year: "numeric"
        }) + " " + regDateObj.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit"
        });
    } else {
        document.getElementById("modal-val-registration-date").textContent = new Date((typeof regDate === "string" && regDate.includes("T") ? regDate.split("T")[0] : regDate) + "T00:00:00").toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
    }
    
    document.getElementById("modal-val-sla-deadline").textContent = new Date(sla.deadline).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    }) + ` (${sla.text})`;

    // Tipo de residuo badge
    const typeBadge = document.getElementById("modal-container-type-badge");
    typeBadge.className = `badge ${typeMeta.badgeClass}`;
    typeBadge.textContent = typeMeta.text.split(" ")[0];

    // Fotos obligatorias
    document.getElementById("modal-img-inspector").src = container.photoInspector || MOCK_PHOTO_INSPECTOR;
    document.getElementById("modal-img-container").src = container.photoContainer || MOCK_PHOTO_CONTAINER_CHAINED;

    // Bitácora
    const timelineEl = document.getElementById("container-timeline");
    const sortedLogs = [...container.history].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    timelineEl.innerHTML = sortedLogs.map(log => {
        const logDateFormatted = new Date(log.timestamp).toLocaleString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
        
        return `
            <div class="timeline-item" data-status="${log.status}">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-status-text">${SLA_DICT[log.status] ? SLA_DICT[log.status].text : 'Observado'}</span>
                        <span class="timeline-time">${logDateFormatted}</span>
                    </div>
                    <p class="timeline-notes">${log.notes}</p>
                </div>
            </div>
        `;
    }).join("");

    if (btnModalEdit) {
        btnModalEdit.style.display = currentUserRole === "admin" ? "inline-flex" : "none";
    }
    detailModal.classList.add("open");
};

window.editContainer = function(id) {
    const container = containers.find(c => c.id === id);
    if (!container) return;
    
    editingContainerId = id;
    closeModal();
    
    // Cargar datos en los campos de cabecera
    inputSupervisor.value = container.supervisor;
    inputReportDate.value = container.reportDate;
    inputInspector.value = container.inspector;
    
    // Cargar lote con un único ítem
    currentBatch = [
        {
            id: container.id,
            type: container.type,
            capacity: container.capacity,
            chained: container.chained,
            photoInspector: container.photoInspector,
            photoContainer: container.photoContainer,
            notes: container.notes
        }
    ];
    
    // Cambiar títulos
    document.getElementById("form-card-title").textContent = `Editar Registro del Contenedor ${container.id}`;
    renderBatchForm();
    triggerSwitchView("reporte-contenedor");
};

if (btnModalEdit) {
    btnModalEdit.addEventListener("click", () => {
        if (activeModalContainerId) {
            editContainer(activeModalContainerId);
        }
    });
}

window.confirmDeleteContainer = function(id) {
    if (confirm(`¿Desea eliminar el reporte del contenedor ${id}? Esta acción no se puede deshacer.`)) {
        containers = containers.filter(c => c.id !== id);
        saveData();
        renderHistoryTable();
        showToast(`Reporte ${id} eliminado satisfactoriamente.`, "warning");
    }
};

// ==========================================================================
// TOAST NOTIFICATIONS
// ==========================================================================

function showToast(message, type = "success") {
    const toastContainer = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let iconName = "check-circle-2";
    if (type === "error") iconName = "alert-circle";
    if (type === "warning") iconName = "trash-2";
    if (type === "info") iconName = "info";
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.classList.add("show");
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

window.switchUserRole = function(role) {
    currentUserRole = role;
    localStorage.setItem("waste_user_role", role);
    
    const authBtn = document.getElementById("btn-admin-auth");
    const authIcon = document.getElementById("admin-auth-icon");
    const authText = document.getElementById("admin-auth-text");

    const btnStatusGeneral = document.getElementById("btn-status-general");
    const containerStatusGeneral = btnStatusGeneral ? btnStatusGeneral.closest("li") : null;

    const avatarEl = document.querySelector(".sidebar-footer .user-avatar");
    const nameEl = document.querySelector(".sidebar-footer .user-name");
    const roleEl = document.querySelector(".sidebar-footer .user-role");

    if (role === "supervisor") {
        if (containerStatusGeneral) containerStatusGeneral.style.display = "none";
        
        if (authText) authText.textContent = "Acceso Admin";
        if (authIcon) {
            authIcon.setAttribute("data-lucide", "shield-alert");
            authIcon.style.color = "var(--text-secondary)";
        }
        if (authBtn) {
            authBtn.style.borderColor = "var(--border-color)";
            authBtn.style.color = "var(--text-secondary)";
        }

        // Redirigir a reporte si estaba en la vista administrativa
        const activeNavBtn = document.querySelector(".nav-btn.active");
        if (activeNavBtn && activeNavBtn.getAttribute("data-target") === "status-general") {
            triggerSwitchView("reporte-contenedor");
        }

        if (avatarEl) avatarEl.textContent = "SP";
        if (nameEl) nameEl.textContent = "Supervisor de Turno";
        if (roleEl) roleEl.textContent = "Control de Planta";
    } else {
        if (containerStatusGeneral) containerStatusGeneral.style.display = "block";

        if (authText) authText.textContent = "Salir de Admin";
        if (authIcon) {
            authIcon.setAttribute("data-lucide", "shield-check");
            authIcon.style.color = "var(--status-transit)";
        }
        if (authBtn) {
            authBtn.style.borderColor = "var(--status-transit)";
            authBtn.style.color = "var(--status-transit)";
        }

        if (avatarEl) avatarEl.textContent = "AD";
        if (nameEl) nameEl.textContent = "Coordinador General";
        if (roleEl) roleEl.textContent = "Administrador de Planta";
    }
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    renderHistoryTable();
};

// ==========================================================================
// INICIALIZACIÓN
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    loadData();
    initClock();
    setupBatchFormEvents();
    initBatch();
    
    // Iniciar con el rol guardado (por defecto Supervisor)
    const savedRole = localStorage.getItem("waste_user_role") || "supervisor";
    switchUserRole(savedRole);
    
    // Configurar modal de WhatsApp (Copiar y Cerrar)
    const btnCopyWa = document.getElementById("btn-copy-whatsapp");
    if (btnCopyWa) {
        btnCopyWa.addEventListener("click", () => {
            const waTextArea = document.getElementById("whatsapp-text-area");
            if (waTextArea) {
                waTextArea.select();
                waTextArea.setSelectionRange(0, 9999);
                navigator.clipboard.writeText(waTextArea.value)
                    .then(() => {
                        showToast("Reporte copiado al portapapeles.", "success");
                    })
                    .catch(() => {
                        document.execCommand("copy");
                        showToast("Reporte copiado al portapapeles.", "success");
                    });
            }
        });
    }

    const closeWaModal = () => {
        const modal = document.getElementById("whatsapp-modal");
        if (modal) modal.classList.remove("open");
        triggerSwitchView("reporte-contenedor");
    };

    const btnCloseWa = document.getElementById("btn-close-whatsapp");
    const btnCloseWaFooter = document.getElementById("btn-close-whatsapp-footer");
    const waModalEl = document.getElementById("whatsapp-modal");

    if (btnCloseWa) btnCloseWa.addEventListener("click", closeWaModal);
    if (btnCloseWaFooter) btnCloseWaFooter.addEventListener("click", closeWaModal);
    if (waModalEl) {
        waModalEl.addEventListener("click", (e) => {
            if (e.target.id === "whatsapp-modal") closeWaModal();
        });
    }

    // Configuración de Autenticación de Administrador
    const btnAdminAuth = document.getElementById("btn-admin-auth");
    if (btnAdminAuth) {
        btnAdminAuth.addEventListener("click", () => {
            if (currentUserRole === "admin") {
                switchUserRole("supervisor");
                showToast("Sesión de administrador cerrada.", "info");
            } else {
                const modal = document.getElementById("admin-login-modal");
                const errorMsg = document.getElementById("admin-login-error");
                const pwdInput = document.getElementById("admin-password");
                if (errorMsg) errorMsg.style.display = "none";
                if (pwdInput) pwdInput.value = "";
                if (modal) modal.classList.add("open");
                if (pwdInput) pwdInput.focus();
            }
        });
    }

    const closeAdminModal = () => {
        const modal = document.getElementById("admin-login-modal");
        if (modal) modal.classList.remove("open");
    };

    const btnCloseAdmin = document.getElementById("btn-close-admin-login");
    const btnCloseAdminFooter = document.getElementById("btn-close-admin-login-footer");
    const adminModalEl = document.getElementById("admin-login-modal");

    if (btnCloseAdmin) btnCloseAdmin.addEventListener("click", closeAdminModal);
    if (btnCloseAdminFooter) btnCloseAdminFooter.addEventListener("click", closeAdminModal);
    if (adminModalEl) {
        adminModalEl.addEventListener("click", (e) => {
            if (e.target.id === "admin-login-modal") closeAdminModal();
        });
    }

    const formAdminLogin = document.getElementById("admin-login-form");
    if (formAdminLogin) {
        formAdminLogin.addEventListener("submit", (e) => {
            e.preventDefault();
            const pwdInput = document.getElementById("admin-password");
            const errorMsg = document.getElementById("admin-login-error");
            const pwd = pwdInput ? pwdInput.value : "";

            if (pwd === "admin123" || pwd === "petroaseo2026") {
                switchUserRole("admin");
                closeAdminModal();
                showToast("Sesión de administrador iniciada.", "success");
            } else {
                if (errorMsg) errorMsg.style.display = "block";
                if (pwdInput) {
                    pwdInput.value = "";
                    pwdInput.focus();
                }
            }
        });
    }

    // Controladores de Menú Móvil (Abrir / Cerrar Drawer)
    const btnMobileMenu = document.getElementById("btn-mobile-menu");
    const sidebarEl = document.getElementById("app-sidebar");
    const overlayEl = document.getElementById("sidebar-overlay");

    if (btnMobileMenu && sidebarEl && overlayEl) {
        btnMobileMenu.addEventListener("click", () => {
            sidebarEl.classList.toggle("open");
            overlayEl.classList.toggle("open");
        });

        overlayEl.addEventListener("click", () => {
            sidebarEl.classList.remove("open");
            overlayEl.classList.remove("open");
        });
    }

    updateDashboardMetrics();
    lucide.createIcons();
});
