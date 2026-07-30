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
let editingReportId = null;
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
                .select('report_id,id,pavilion,number,supervisor,inspector,report_date,type,capacity,chained,status_admin,notes,history,created_at,updated_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                containers = data.map(c => ({
                    reportId: c.report_id || c.reportId || generateUUID(),
                    id: c.id,
                    pavilion: c.pavilion,
                    number: parseInt(c.number),
                    supervisor: c.supervisor,
                    inspector: c.inspector,
                    reportDate: c.report_date || c.reportDate,
                    type: c.type,
                    capacity: c.capacity,
                    chained: c.chained,
                    statusAdmin: c.status_admin || c.statusAdmin || "pendiente",
                    photoInspector: c.photo_inspector || c.photoInspector,
                    photoContainer: c.photo_container || c.photoContainer,
                    notes: c.notes || "",
                    history: c.history || [],
                    createdAt: c.created_at || c.createdAt,
                    updatedAt: c.updated_at || c.updatedAt
                })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            } else {
                // Si la base de datos está vacía, sembrar con los contenedores iniciales
                containers = INITIAL_CONTAINERS.map(c => ({
                    ...c,
                    reportId: c.reportId || generateUUID()
                })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                await saveData();
            }
            
            updateDashboardMetrics();
            renderMonitoringPanel();
            renderHistoryTable();
            return;
        } catch (err) {
            console.error("Error al cargar desde Supabase:", err);
            const errMsg = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
            showToast(`Error al cargar datos (Supabase): ${errMsg}`, "error");
        }
    }

    // Fallback LocalStorage
    try {
        const stored = localStorage.getItem("waste_containers");
        if (stored) {
            containers = JSON.parse(stored);
            let updated = false;
            containers.forEach(c => {
                if (!c.statusAdmin) {
                    c.statusAdmin = "pendiente";
                    updated = true;
                }
                if (!c.reportId) {
                    c.reportId = generateUUID();
                    updated = true;
                }
            });
            containers.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            if (updated) saveData();
        } else {
            containers = INITIAL_CONTAINERS.map(c => ({
                ...c,
                reportId: c.reportId || generateUUID()
            })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            saveData();
        }
    } catch (e) {
        console.error("Error de lectura en LocalStorage:", e);
        containers = INITIAL_CONTAINERS.map(c => ({
            ...c,
            reportId: c.reportId || generateUUID()
        })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
}

async function saveData() {
    // Guardar en LocalStorage como respaldo local (con try-catch para evitar que un QuotaExceededError rompa el flujo de Supabase)
    try {
        localStorage.setItem("waste_containers", JSON.stringify(containers));
    } catch (e) {
        console.warn("Límite de espacio en LocalStorage superado. Los datos se guardarán directamente en Supabase:", e);
    }

    if (isSupabaseConfigured) {
        try {
            // Guardar masivamente (upsert) en la tabla containers
            const dbData = containers.map(c => {
                const row = {
                    report_id: c.reportId,
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
                    notes: c.notes,
                    history: c.history,
                    created_at: c.createdAt || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                // Incluir fotos solo si están presentes en memoria (evita sobrescribir con null las fotos no cargadas)
                if (c.photoInspector !== undefined && c.photoInspector !== null) {
                    row.photo_inspector = c.photoInspector;
                }
                if (c.photoContainer !== undefined && c.photoContainer !== null) {
                    row.photo_container = c.photoContainer;
                }
                
                return row;
            });

            const { error } = await supabase
                .from('containers')
                .upsert(dbData);

            if (error) throw error;
        } catch (err) {
            console.error("Error al guardar en Supabase:", err);
            const errMsg = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
            showToast(`Error al guardar en la nube: ${errMsg}`, "error");
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
        "modulo-taller": {
            title: "Área de Reparaciones",
            subtitle: "Gestión técnica de mantenimiento, reparación de contenedores y evidencia"
        },
        "gestion-usuarios": {
            title: "Gestión de Cuentas",
            subtitle: "Administración de usuarios, asignación de roles y accesos al sistema"
        },
        "historial-contenedores": { 
            title: "Historial de Contenedores", 
            subtitle: "Búsqueda, auditoría e historial de bitácoras y fotos obligatorias" 
        },
        "dashboard": {
            title: "Dashboard Operativo",
            subtitle: "Métricas clave de desempeño, tiempos de atención y administración de datos"
        }
    };

    function switchView(targetViewId) {
        // Bloquear acceso a vistas privilegiadas según el rol activo
        if (currentUserRole !== "admin" && targetViewId === "gestion-usuarios") {
            targetViewId = "reporte-contenedor";
        }
        if (currentUserRole !== "admin" && currentUserRole !== "taller" && targetViewId === "modulo-taller") {
            targetViewId = "reporte-contenedor";
        }
        if (currentUserRole !== "admin" && targetViewId === "dashboard") {
            targetViewId = currentUserRole === "taller" ? "modulo-taller" : "reporte-contenedor";
        }

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
            } else if (targetViewId === "modulo-taller") {
                mobileTitle.textContent = "TALLER";
            } else if (targetViewId === "gestion-usuarios") {
                mobileTitle.textContent = "USUARIOS";
            } else if (targetViewId === "historial-contenedores") {
                mobileTitle.textContent = "HISTORIAL";
            } else if (targetViewId === "dashboard") {
                mobileTitle.textContent = "DASHBOARD";
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
        } else if (targetViewId === "modulo-taller") {
            renderTallerModule();
        } else if (targetViewId === "gestion-usuarios") {
            renderUsersTable();
        } else if (targetViewId === "historial-contenedores") {
            renderHistoryTable();
        } else if (targetViewId === "dashboard") {
            if (typeof window.renderDashboard === "function") window.renderDashboard();
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
let isSubmittingBatch = false;

function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function createEmptyBatchItem() {
    return {
        reportId: generateUUID(),
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
    
    if (editingReportId !== null) {
        btnAddRow.style.display = "none";
    } else {
        btnAddRow.style.display = "flex";
    }

    btnSubmitForm.querySelector("span").textContent = editingReportId !== null 
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
                    ${(currentBatch.length > 1 && editingReportId === null) ? `
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
                            <input type="text" class="input-row-id" data-index="${i}" placeholder="Ej: A1-5 o B-20" value="${item.id}" ${editingReportId !== null ? 'disabled' : ''} required>
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

    // 1. En Status General, solo se muestran los contenedores observados en proceso activo (excluye presentados/culminados)
    let filtered = containers.filter(c => c.statusAdmin !== "presentado");

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
        
        const currentStatusVal = unsavedChanges[c.reportId] || c.statusAdmin;
        
        let slaBadgeHtml = "";
        if (currentStatusVal === "listo") {
            slaBadgeHtml = `<span class="badge badge-sla-on-time" style="background-color: var(--status-transit-glow); border-color: var(--status-transit); color: hsl(142, 76%, 70%);">Resuelto</span>`;
        } else {
            slaBadgeHtml = `<span class="badge ${slaMeta.badgeClass}">${sla.text}</span>`;
        }

        // Icono de Alerta de Urgencia si quedan 1d o menos y no está listo
        const isUrgent = (sla.daysLeft <= 1 && currentStatusVal !== "listo");
        const urgentAlertHtml = isUrgent ? `<i data-lucide="alert-triangle" style="width:14px; height:14px; color:var(--status-retained); animation: pulse-retained 1.5s infinite; vertical-align: middle; margin-left: 6px;" title="Urgente: Plazo por vencer o vencido"></i>` : "";
        const observationText = c.notes.trim() || "Sin observaciones";

        return `
            <tr class="status-row-bg val-${currentStatusVal}">
                <!-- 1. Contenedor -->
                <td style="font-weight: 700; color: var(--text-primary); font-size: 14px;">
                    <span>${c.id}</span>
                    ${urgentAlertHtml}
                </td>
                <!-- 2. Tipo -->
                <td><span class="badge ${typeMeta.badgeClass}">${typeMeta.text}</span></td>
                <!-- 3. Capacidad -->
                <td style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">${c.capacity}</td>
                <!-- 4. Reportado por -->
                <td style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${c.supervisor}</td>
                <!-- 5. Inspector -->
                <td style="font-size: 12px; color: var(--text-muted);">${c.inspector} (Insp.)</td>
                <!-- 6. Observación -->
                <td style="font-size: 12px; color: var(--text-secondary); max-width: 200px; word-wrap: break-word; white-space: normal;">${observationText}</td>
                <!-- 7. Fecha de reporte -->
                <td style="font-size: 13px; color: var(--text-secondary);">${dateFormatted}</td>
                <!-- 8. Fecha vencimiento -->
                <td>
                    <div style="font-weight: 600; font-size: 13px; color: var(--text-primary); margin-bottom: 4px;">${deadlineFormatted}</div>
                    <div>${slaBadgeHtml}</div>
                </td>
                <!-- 9. Fotos -->
                <td>
                    <div class="photo-thumbnail-group">
                        <div class="photo-placeholder-wrapper" data-report-id="${c.reportId}" data-field="photoInspector" onclick="openLightboxOnDemand('${c.reportId}', 'photoInspector')" title="Ver Foto del Inspector">
                            <i data-lucide="user" style="width: 14px; height: 14px;"></i>
                        </div>
                        <div class="photo-placeholder-wrapper" data-report-id="${c.reportId}" data-field="photoContainer" onclick="openLightboxOnDemand('${c.reportId}', 'photoContainer')" title="Ver Foto del Contenedor">
                            <i data-lucide="image" style="width: 14px; height: 14px;"></i>
                        </div>
                    </div>
                </td>
                <!-- 10. Estado Operativo -->
                <td class="status-cell-bg val-${currentStatusVal}">
                    ${currentUserRole === "admin" ? `
                    <div class="status-select-wrapper">
                        <select class="status-select val-${currentStatusVal}" onchange="changeContainerAdminStatus('${c.reportId}', this.value)">
                            <option value="pendiente" ${currentStatusVal === "pendiente" ? "selected" : ""}>1. Reportado (Blanco)</option>
                            <option value="en-reparacion" ${currentStatusVal === "en-reparacion" ? "selected" : ""}>2. En Reparación (Naranja)</option>
                            <option value="listo" ${currentStatusVal === "listo" ? "selected" : ""}>3. Reparado (Verde)</option>
                            <option value="presentado" ${currentStatusVal === "presentado" ? "selected" : ""}>4. Presentado (Azul - Culminado)</option>
                            <option value="no-encadenado" ${currentStatusVal === "no-encadenado" ? "selected" : ""}>Alerta: No Encadenado (Rojo)</option>
                        </select>
                    </div>
                    ` : `
                    <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start;">
                        <span class="badge ${
                            currentStatusVal === 'pendiente' ? 'badge-sla-pending' :
                            currentStatusVal === 'en-reparacion' ? 'badge-sla-warning' :
                            currentStatusVal === 'listo' ? 'badge-sla-on-time' :
                            currentStatusVal === 'presentado' ? 'badge-sla-on-time' : 'badge-sla-expired'
                        }">
                            ${
                                currentStatusVal === 'pendiente' ? '1. Reportado' :
                                currentStatusVal === 'en-reparacion' ? '2. En Reparación' :
                                currentStatusVal === 'listo' ? '3. Reparado' :
                                currentStatusVal === 'presentado' ? '4. Presentado (Culminado)' : 'No Encadenado'
                            }
                        </span>
                        ${currentStatusVal !== "presentado" ? `
                        <button class="btn btn-secondary" onclick="markAsPresentado('${c.reportId}')" style="padding: 4px 8px; font-size: 11px; color: var(--status-transit); border-color: rgba(34, 197, 94, 0.4); display: inline-flex; align-items: center; gap: 4px; border-radius: 6px;" title="Marcar como Presentado en Poza">
                            <i data-lucide="check-circle-2" style="width: 13px; height: 13px;"></i>
                            <span>Marcar Presentado</span>
                        </button>
                        ` : ''}
                    </div>
                    `}
                </td>
            </tr>
        `;
    }).join("");

    lucide.createIcons();
    lazyLoadTableThumbnails();
}

async function lazyLoadTableThumbnails() {
    const placeholders = document.querySelectorAll(".photo-placeholder-wrapper");
    
    placeholders.forEach(async el => {
        const reportId = el.getAttribute("data-report-id");
        const field = el.getAttribute("data-field");
        const container = containers.find(c => c.reportId === reportId);
        if (!container) return;

        // Si ya está cargada la imagen en memoria, renderizarla de inmediato
        if (container[field]) {
            el.innerHTML = `<img src="${container[field]}" class="photo-thumbnail" alt="Preview">`;
            return;
        }

        // Si no está en memoria y Supabase está configurado, la cargamos en segundo plano
        if (isSupabaseConfigured) {
            try {
                const dbField = field === 'photoInspector' ? 'photo_inspector' : 'photo_container';
                const { data, error } = await supabase
                    .from('containers')
                    .select(dbField)
                    .eq('report_id', reportId)
                    .single();

                if (error) throw error;

                const base64Photo = data[dbField];
                if (base64Photo) {
                    // Guardar en memoria caché
                    container[field] = base64Photo;
                    // Reemplazar el icono por la miniatura real
                    el.innerHTML = `<img src="${base64Photo}" class="photo-thumbnail" alt="Preview">`;
                } else {
                    // Si no tiene foto, mostrar un icono de vacío/cancelado
                    el.innerHTML = `<i data-lucide="slash" style="width: 14px; height: 14px; color: var(--text-muted);"></i>`;
                    if (window.lucide) window.lucide.createIcons();
                }
            } catch (err) {
                console.error("Error al lazy-cargar la miniatura:", err);
                el.innerHTML = `<i data-lucide="alert-circle" style="width: 14px; height: 14px; color: var(--status-retained);"></i>`;
                if (window.lucide) window.lucide.createIcons();
            }
        } else {
            // Si está offline o no configurado
            el.innerHTML = `<i data-lucide="slash" style="width: 14px; height: 14px; color: var(--text-muted);"></i>`;
            if (window.lucide) window.lucide.createIcons();
        }
    });
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

window.changeContainerAdminStatus = function(reportId, newStatus) {
    const idx = containers.findIndex(c => c.reportId === reportId);
    if (idx > -1) {
        const savedStatus = containers[idx].statusAdmin;
        if (savedStatus === newStatus) {
            delete unsavedChanges[reportId];
        } else {
            unsavedChanges[reportId] = newStatus;
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
    const reportIds = Object.keys(unsavedChanges);
    if (reportIds.length === 0) return;

    let updatedCount = 0;
    reportIds.forEach(reportId => {
        const newStatus = unsavedChanges[reportId];
        const idx = containers.findIndex(c => c.reportId === reportId);
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

window.openLightboxOnDemand = async function(reportId, field) {
    const container = containers.find(c => c.reportId === reportId);
    if (!container) return;

    const label = container.id || reportId;

    // Si ya está en memoria (o es mock), abrir directamente
    if (container[field]) {
        openLightbox(field === 'photoInspector' ? `Foto Inspector: ${label}` : `Foto Contenedor: ${label}`, container[field]);
        return;
    }

    if (!isSupabaseConfigured) {
        showToast("Imagen no disponible en modo local (Límite superado).", "warning");
        return;
    }

    // Mostrar loader/toast mientras descarga
    showToast("Cargando imagen desde la base de datos...", "info");

    try {
        const { data, error } = await supabase
            .from('containers')
            .select(field === 'photoInspector' ? 'photo_inspector' : 'photo_container')
            .eq('report_id', reportId)
            .single();

        if (error) throw error;

        const base64Photo = field === 'photoInspector' ? data.photo_inspector : data.photo_container;
        if (!base64Photo) {
            showToast("Este contenedor no cuenta con imagen de evidencia.", "warning");
            return;
        }

        // Guardar en caché local de memoria
        container[field] = base64Photo;
        
        // Abrir Lightbox
        openLightbox(field === 'photoInspector' ? `Foto Inspector: ${label}` : `Foto Contenedor: ${label}`, base64Photo);
    } catch (err) {
        console.error("Error al cargar imagen bajo demanda:", err);
        showToast("Error al cargar la imagen desde la nube.", "error");
    }
};

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
    editingReportId = null;
    isSubmittingBatch = false;
    
    const btnSubmit = document.getElementById("btn-submit-form");
    if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.style.pointerEvents = "auto";
        btnSubmit.style.opacity = "1";
    }
    
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
    
    if (isSubmittingBatch) return;
    
    if (validateForm()) {
        isSubmittingBatch = true;
        
        const btnSubmit = document.getElementById("btn-submit-form");
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.style.pointerEvents = "none";
            btnSubmit.style.opacity = "0.6";
        }

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
            
            const existingIdx = editingReportId !== null ? containers.findIndex(c => c.reportId === editingReportId) : -1;
            
            if (existingIdx > -1) {
                // EDITAR REGISTRO EXISTENTE
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
                    reportId: item.reportId || generateUUID(),
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
        editingReportId = null;

        // 1. Guardar localmente de inmediato y enviar sincronización a Supabase en segundo plano
        saveData().catch(err => console.error("Error al guardar en Supabase:", err));
        
        // 2. Compilar Reporte para WhatsApp
        const dateObj = new Date(reportDate + "T00:00:00");
        const dateFormatted = dateObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
        const sla = getSlaInfo(reportDate);
        const deadlineObj = new Date(sla.deadline);
        const deadlineFormatted = deadlineObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

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
            <tr id="row-${c.reportId}">
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
                        <button class="btn-icon" onclick="openDetailsModal('${c.reportId}')" title="Ver Detalles y Fotos">
                            <i data-lucide="eye"></i>
                        </button>
                        ${c.statusAdmin !== "presentado" ? `
                        <button class="btn-icon" onclick="markAsPresentado('${c.reportId}')" title="Marcar como Presentado (Supervisor)" style="color: var(--status-transit); border-color: rgba(34, 197, 94, 0.3);">
                            <i data-lucide="check-circle-2"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    
    lucide.createIcons();
}

let activeSupervisorPhotoBase64 = null;

window.markAsPresentado = function(reportId) {
    const container = containers.find(c => c.reportId === reportId);
    if (!container) return;

    document.getElementById("present-report-id").value = reportId;
    document.getElementById("present-container-code").textContent = `${container.id} (${container.capacity})`;
    document.getElementById("supervisor-present-notes").value = "";
    
    activeSupervisorPhotoBase64 = null;
    const previewContainer = document.getElementById("supervisor-photo-preview-container");
    const photoLabel = document.getElementById("supervisor-photo-label");
    if (previewContainer) previewContainer.style.display = "none";
    if (photoLabel) photoLabel.textContent = "Haga clic para subir foto de evidencia";

    const modal = document.getElementById("supervisor-present-modal");
    if (modal) modal.classList.add("open");
};

function closeSupervisorPresentModal() {
    const modal = document.getElementById("supervisor-present-modal");
    if (modal) modal.classList.remove("open");
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
const btnModalDelete = document.getElementById("btn-modal-delete");
let activeModalReportId = null;

function closeModal() {
    detailModal.classList.remove("open");
    activeModalReportId = null;
}

[btnCloseModal, btnCloseModalFooter].forEach(btn => {
    btn.addEventListener("click", closeModal);
});

detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) closeModal();
});

window.openDetailsModal = async function(reportId) {
    const container = containers.find(c => c.reportId === reportId);
    if (!container) return;
    
    activeModalReportId = reportId;
    
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

    // Fotos obligatorias con cargador asíncrono
    const imgInspEl = document.getElementById("modal-img-inspector");
    const imgContEl = document.getElementById("modal-img-container");
    
    const loadingSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'><rect width='100%' height='100%' fill='%231e2530'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%23a0aec0'>Cargando imagen...</text></svg>";
    imgInspEl.src = loadingSvg;
    imgContEl.src = loadingSvg;

    if (container.photoInspector || container.photoContainer) {
        imgInspEl.src = container.photoInspector || MOCK_PHOTO_INSPECTOR;
        imgContEl.src = container.photoContainer || MOCK_PHOTO_CONTAINER_CHAINED;
    } else if (isSupabaseConfigured) {
        try {
            const { data, error } = await supabase
                .from('containers')
                .select('photo_inspector, photo_container')
                .eq('report_id', reportId)
                .single();

            if (error) throw error;

            container.photoInspector = data.photo_inspector || container.photoInspector;
            container.photoContainer = data.photo_container || container.photoContainer;

            imgInspEl.src = container.photoInspector || MOCK_PHOTO_INSPECTOR;
            imgContEl.src = container.photoContainer || MOCK_PHOTO_CONTAINER_CHAINED;
        } catch (err) {
            console.error("Error al cargar fotos de detalles:", err);
            imgInspEl.src = MOCK_PHOTO_INSPECTOR;
            imgContEl.src = MOCK_PHOTO_CONTAINER_CHAINED;
        }
    } else {
        imgInspEl.src = MOCK_PHOTO_INSPECTOR;
        imgContEl.src = MOCK_PHOTO_CONTAINER_CHAINED;
    }

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
    if (btnModalDelete) {
        btnModalDelete.style.display = currentUserRole === "admin" ? "inline-flex" : "none";
    }
    detailModal.classList.add("open");
};

window.editContainer = function(reportId) {
    const container = containers.find(c => c.reportId === reportId);
    if (!container) return;
    
    editingReportId = reportId;
    closeModal();
    
    // Cargar datos en los campos de cabecera
    inputSupervisor.value = container.supervisor;
    inputReportDate.value = container.reportDate;
    inputInspector.value = container.inspector;
    
    // Cargar lote con un único ítem
    currentBatch = [
        {
            reportId: container.reportId,
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
        if (activeModalReportId) {
            editContainer(activeModalReportId);
        }
    });
}

if (btnModalDelete) {
    btnModalDelete.addEventListener("click", () => {
        if (activeModalReportId) {
            confirmDeleteContainer(activeModalReportId);
        }
    });
}

window.confirmDeleteContainer = function(reportId) {
    const container = containers.find(c => c.reportId === reportId);
    const label = container ? container.id : reportId;
    if (confirm(`¿Desea eliminar el reporte del contenedor ${label}? Esta acción no se puede deshacer.`)) {
        if (isSupabaseConfigured) {
            supabase
                .from('containers')
                .delete()
                .eq('report_id', reportId)
                .then(({ error }) => {
                    if (error) {
                        console.error("Error al eliminar de Supabase:", error);
                        showToast("Error al eliminar en la nube.", "error");
                    }
                });
        }
        containers = containers.filter(c => c.reportId !== reportId);
        saveData();
        closeModal();
        renderMonitoringPanel();
        renderHistoryTable();
        if (typeof renderTallerModule === "function") renderTallerModule();
        if (typeof window.renderDashboard === "function") window.renderDashboard();
        showToast(`Reporte ${label} eliminado satisfactoriamente.`, "warning");
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

// ==========================================================================
// GESTIÓN DE USUARIOS Y AUTENTICACIÓN MULTI-ROL (ADMIN / TALLER / GUEST)
// ==========================================================================

let appUsers = [];
let currentAuthUser = null;
let currentTallerTab = "todas";
let activeRepairPhotoBase64 = null;

const DEFAULT_USERS = [
    {
        id: "usr-admin-default",
        username: "admin",
        fullName: "Administrador de Planta",
        role: "admin",
        passwordHash: "admin123",
        isActive: true,
        createdAt: "2026-07-01T00:00:00.000Z"
    },
    {
        id: "usr-taller-default",
        username: "taller1",
        fullName: "Área de Reparaciones (Taller)",
        role: "taller",
        passwordHash: "taller123",
        isActive: true,
        createdAt: "2026-07-01T00:00:00.000Z"
    }
];

async function loadAppUsers() {
    if (isSupabaseConfigured) {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('*');

            if (!error && data && data.length > 0) {
                appUsers = data.map(u => ({
                    id: u.id,
                    username: u.username,
                    fullName: u.full_name || u.fullName,
                    role: u.role,
                    passwordHash: u.password_hash || u.passwordHash,
                    isActive: u.is_active !== undefined ? u.is_active : true,
                    createdAt: u.created_at || new Date().toISOString()
                }));
                localStorage.setItem("waste_app_users", JSON.stringify(appUsers));
                return;
            }
        } catch (e) {
            console.warn("Tabla app_users no disponible aún en Supabase. Usando respaldo local:", e);
        }
    }

    try {
        const local = localStorage.getItem("waste_app_users");
        if (local) {
            appUsers = JSON.parse(local);
        } else {
            appUsers = [...DEFAULT_USERS];
            localStorage.setItem("waste_app_users", JSON.stringify(appUsers));
        }
    } catch (e) {
        appUsers = [...DEFAULT_USERS];
    }
}

async function saveAppUserToDB(userObj) {
    // Guardar en array local
    const idx = appUsers.findIndex(u => u.id === userObj.id);
    if (idx > -1) {
        appUsers[idx] = userObj;
    } else {
        appUsers.unshift(userObj);
    }
    
    try {
        localStorage.setItem("waste_app_users", JSON.stringify(appUsers));
    } catch (e) {
        console.warn("Error al guardar usuarios en localStorage:", e);
    }

    if (isSupabaseConfigured) {
        try {
            await supabase.from('app_users').upsert({
                id: userObj.id,
                username: userObj.username,
                full_name: userObj.fullName,
                role: userObj.role,
                password_hash: userObj.passwordHash,
                is_active: userObj.isActive,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            console.warn("No se pudo sincronizar usuario con Supabase app_users:", e);
        }
    }
}

window.renderUsersTable = function() {
    const tbody = document.getElementById("table-body-users");
    if (!tbody) return;

    if (appUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 30px; color: var(--text-muted);">
                    No hay usuarios registrados en el sistema.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = appUsers.map(u => {
        const roleBadge = u.role === "admin"
            ? `<span class="badge" style="background-color: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3);">Administrador</span>`
            : `<span class="badge" style="background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);">Taller / Reparaciones</span>`;

        const statusBadge = u.isActive
            ? `<span class="badge badge-sla-on-time">Activo</span>`
            : `<span class="badge badge-sla-expired" style="background-color: rgba(148, 163, 184, 0.15); color: #94a3b8; border-color: rgba(148, 163, 184, 0.3);">Inactivo</span>`;

        const dateFormatted = new Date(u.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

        return `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${u.fullName}</td>
                <td style="font-family: monospace; color: var(--text-secondary);">${u.username}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td style="font-size: 13px; color: var(--text-muted);">${dateFormatted}</td>
                <td class="actions-col">
                    <div style="display:flex; justify-content:flex-end; gap:6px;">
                        <button class="btn-icon" onclick="openEditUserModal('${u.id}')" title="Editar Usuario">
                            <i data-lucide="edit-3"></i>
                        </button>
                        <button class="btn-icon" onclick="toggleUserStatus('${u.id}')" title="${u.isActive ? 'Desactivar Cuenta' : 'Activar Cuenta'}">
                            <i data-lucide="${u.isActive ? 'user-x' : 'user-check'}"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    if (window.lucide) window.lucide.createIcons();
};

window.openCreateUserModal = function() {
    document.getElementById("editing-user-id").value = "";
    document.getElementById("user-fullname").value = "";
    document.getElementById("user-username").value = "";
    document.getElementById("user-role").value = "taller";
    document.getElementById("user-password").value = "";
    document.getElementById("user-password").required = true;
    document.getElementById("user-active").checked = true;
    document.getElementById("user-modal-title").innerHTML = `<i data-lucide="user-plus" style="color: var(--primary); vertical-align: middle; margin-right: 8px;"></i>Crear Nuevo Usuario`;

    const modal = document.getElementById("user-form-modal");
    if (modal) modal.classList.add("open");
    if (window.lucide) window.lucide.createIcons();
};

window.openEditUserModal = function(userId) {
    const u = appUsers.find(user => user.id === userId);
    if (!u) return;

    document.getElementById("editing-user-id").value = u.id;
    document.getElementById("user-fullname").value = u.fullName;
    document.getElementById("user-username").value = u.username;
    document.getElementById("user-role").value = u.role;
    document.getElementById("user-password").value = "";
    document.getElementById("user-password").required = false;
    document.getElementById("user-active").checked = u.isActive;
    document.getElementById("user-modal-title").innerHTML = `<i data-lucide="edit-3" style="color: var(--primary); vertical-align: middle; margin-right: 8px;"></i>Editar Usuario (${u.username})`;

    const modal = document.getElementById("user-form-modal");
    if (modal) modal.classList.add("open");
    if (window.lucide) window.lucide.createIcons();
};

window.toggleUserStatus = async function(userId) {
    const u = appUsers.find(user => user.id === userId);
    if (!u) return;

    u.isActive = !u.isActive;
    await saveAppUserToDB(u);
    renderUsersTable();
    showToast(`Cuenta ${u.username} ${u.isActive ? 'activada' : 'desactivada'} correctamente.`, "info");
};

// ==========================================================================
// MÓDULO DE TALLER / ÁREA DE REPARACIONES
// ==========================================================================

window.switchTallerTab = function(tab) {
    currentTallerTab = tab;
    
    const buttons = document.querySelectorAll("[data-taller-tab]");
    buttons.forEach(btn => {
        if (btn.getAttribute("data-taller-tab") === tab) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    renderTallerModule();
};

window.renderTallerModule = function() {
    const cardsContainer = document.getElementById("taller-cards-container");
    const emptyState = document.getElementById("taller-empty-state");
    const searchInput = document.getElementById("search-taller-input");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    if (!cardsContainer) return;

    // Conteo para las pestañas de taller
    const pendingContainers = containers.filter(c => c.statusAdmin === "pendiente" || c.statusAdmin === "no-encadenado");
    const procesoContainers = containers.filter(c => c.statusAdmin === "en-reparacion");
    const urgentContainers = containers.filter(c => {
        if (c.statusAdmin === "listo" || c.statusAdmin === "presentado") return false;
        const sla = getSlaInfo(c.reportDate);
        return sla.daysLeft <= 1 || sla.key === "expired";
    });
    const finishedContainers = containers.filter(c => c.statusAdmin === "listo" || c.statusAdmin === "presentado");

    const elPendientes = document.getElementById("count-taller-pendientes");
    const elUrgentes = document.getElementById("count-taller-urgentes");
    const elProceso = document.getElementById("count-taller-proceso");
    const elFinalizadas = document.getElementById("count-taller-finalizadas");

    if (elPendientes) elPendientes.textContent = pendingContainers.length;
    if (elUrgentes) elUrgentes.textContent = urgentContainers.length;
    if (elProceso) elProceso.textContent = procesoContainers.length;
    if (elFinalizadas) elFinalizadas.textContent = finishedContainers.length;

    // Filtrar según pestaña seleccionada
    let filtered = [];
    if (currentTallerTab === "pendientes") {
        filtered = containers.filter(c => c.statusAdmin === "pendiente" || c.statusAdmin === "no-encadenado" || c.statusAdmin === "en-reparacion");
    } else if (currentTallerTab === "urgentes") {
        filtered = urgentContainers;
    } else if (currentTallerTab === "en-proceso") {
        filtered = procesoContainers;
    } else if (currentTallerTab === "finalizadas") {
        filtered = finishedContainers;
    }

    // Filtrar por búsqueda
    if (query) {
        filtered = filtered.filter(c => 
            c.id.toLowerCase().includes(query) ||
            c.supervisor.toLowerCase().includes(query) ||
            c.notes.toLowerCase().includes(query)
        );
    }

    // Ordenar por prioridad (1. Urgencia SLA / Vencido, 2. En reparación, 3. Por Reparar, 4. Fecha más reciente)
    filtered.sort((a, b) => {
        const slaA = getSlaInfo(a.reportDate);
        const slaB = getSlaInfo(b.reportDate);
        
        const rankA = (slaA.daysLeft <= 1 || slaA.key === 'expired') ? 1 : (a.statusAdmin === 'en-reparacion' ? 2 : 3);
        const rankB = (slaB.daysLeft <= 1 || slaB.key === 'expired') ? 1 : (b.statusAdmin === 'en-reparacion' ? 2 : 3);
        
        if (rankA !== rankB) return rankA - rankB;
        return new Date(b.reportDate) - new Date(a.reportDate);
    });

    if (filtered.length === 0) {
        cardsContainer.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    cardsContainer.innerHTML = filtered.map(c => {
        const typeMeta = TYPE_DICT[c.type] || { text: "Otro", badgeClass: "" };
        const sla = getSlaInfo(c.reportDate);
        const statusMeta = {
            "pendiente": { text: "1. Reportado", badgeClass: "badge-sla-pending" },
            "en-reparacion": { text: "2. En Reparación", badgeClass: "badge-sla-warning" },
            "listo": { text: "3. Reparado", badgeClass: "badge-sla-on-time" },
            "presentado": { text: "4. Presentado (Culminado)", badgeClass: "badge-sla-on-time" },
            "no-encadenado": { text: "Alerta: No Encadenado", badgeClass: "badge-sla-expired" }
        }[c.statusAdmin] || { text: c.statusAdmin, badgeClass: "" };

        const dateObj = new Date(c.reportDate + "T00:00:00");
        const dateFormatted = dateObj.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

        const isUrgent = (sla.daysLeft <= 1 && c.statusAdmin !== "listo" && c.statusAdmin !== "presentado");
        const urgentBadge = isUrgent ? `<span class="badge badge-sla-expired" style="font-size: 10px; padding: 2px 6px; animation: pulse-retained 1.5s infinite;">🔥 URGENTE (${sla.text})</span>` : "";

        // Determinación de la clase de acento para la tarjeta
        let accentClass = "accent-status-pending";
        if (isUrgent) {
            accentClass = "accent-priority-urgent";
        } else if (c.statusAdmin === "en-reparacion") {
            accentClass = "accent-status-repairing";
        } else if (c.statusAdmin === "listo" || c.statusAdmin === "presentado") {
            accentClass = "accent-status-resolved";
        }

        return `
            <div class="taller-card ${accentClass}">
                <div class="taller-card-inner">
                    <div class="taller-card-header">
                        <div class="card-id-wrapper">
                            <span class="card-id">${c.id}</span>
                            ${urgentBadge}
                        </div>
                        <div class="card-type-wrapper">
                            <span class="badge ${typeMeta.badgeClass}">${typeMeta.text}</span>
                        </div>
                    </div>
                    
                    <div class="taller-card-body">
                        <div class="taller-card-info-row">
                            <span class="info-label"><i data-lucide="package" style="width: 14px; height: 14px;"></i> Capacidad:</span>
                            <span class="info-value">${c.capacity}</span>
                        </div>
                        <div class="taller-card-info-row">
                            <span class="info-label"><i data-lucide="user" style="width: 14px; height: 14px;"></i> Supervisor:</span>
                            <span class="info-value" style="font-weight: 600;">${c.supervisor}</span>
                        </div>
                        <div class="taller-card-info-row">
                            <span class="info-label"><i data-lucide="user-check" style="width: 14px; height: 14px;"></i> Inspector:</span>
                            <span class="info-value">${c.inspector}</span>
                        </div>
                        <div class="taller-card-info-row">
                            <span class="info-label"><i data-lucide="calendar" style="width: 14px; height: 14px;"></i> Reportado:</span>
                            <span class="info-value font-mono">${dateFormatted}</span>
                        </div>
                        <div class="taller-card-info-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                            <span class="info-label">Estado Actual:</span>
                            <span class="badge ${statusMeta.badgeClass}">${statusMeta.text}</span>
                        </div>
                    </div>

                    <div class="taller-card-footer">
                        <div class="taller-card-evidences">
                            <div class="photo-placeholder-wrapper" data-report-id="${c.reportId}" data-field="photoInspector" onclick="openLightboxOnDemand('${c.reportId}', 'photoInspector')" title="Ver Foto Inspector">
                                <i data-lucide="user" style="width: 13px; height: 13px;"></i>
                                <span>Insp.</span>
                            </div>
                            <div class="photo-placeholder-wrapper" data-report-id="${c.reportId}" data-field="photoContainer" onclick="openLightboxOnDemand('${c.reportId}', 'photoContainer')" title="Ver Foto Contenedor">
                                <i data-lucide="wrench" style="width: 13px; height: 13px;"></i>
                                <span>Taller</span>
                            </div>
                        </div>
                        <div class="taller-card-actions">
                            <button class="btn-icon" onclick="openDetailsModal('${c.reportId}')" title="Ver Historial y Bitácora Completa">
                                <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="openRepairModal('${c.reportId}')" style="padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; background-color: var(--primary);">
                                <i data-lucide="wrench" style="width: 13px; height: 13px;"></i>
                                <span>Reparar</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    if (window.lucide) window.lucide.createIcons();
    lazyLoadTableThumbnails();
};

window.openRepairModal = function(reportId) {
    const c = containers.find(item => item.reportId === reportId);
    if (!c) return;

    document.getElementById("repair-report-id").value = reportId;
    document.getElementById("repair-modal-container-code").textContent = `${c.id} (${c.capacity})`;
    
    const typeMeta = TYPE_DICT[c.type] || { text: "Residuo", badgeClass: "" };
    const badgeEl = document.getElementById("repair-modal-type-badge");
    if (badgeEl) {
        badgeEl.textContent = typeMeta.text;
        badgeEl.className = `badge ${typeMeta.badgeClass}`;
    }

    const selectStatus = document.getElementById("repair-status-select");
    if (selectStatus) {
        selectStatus.value = c.statusAdmin === "listo" ? "listo" : "en-reparacion";
    }

    document.getElementById("repair-notes-text").value = "";
    activeRepairPhotoBase64 = null;
    
    const imgPreviewContainer = document.getElementById("repair-photo-preview-container");
    if (imgPreviewContainer) imgPreviewContainer.style.display = "none";
    const photoLabel = document.getElementById("repair-photo-label");
    if (photoLabel) photoLabel.textContent = "Tomar / Cargar Foto de Reparación";

    const modal = document.getElementById("repair-action-modal");
    if (modal) modal.classList.add("open");
    if (window.lucide) window.lucide.createIcons();
};

window.downloadTableImage = function() {
    const tableContainer = document.getElementById("status-table-container");
    if (!tableContainer) return;

    if (typeof html2canvas === "undefined") {
        showToast("Cargando motor de captura de imagen. Espere 2 segundos e intente nuevamente.", "error");
        return;
    }

    showToast("Generando captura en HD de la tabla de status...", "info");

    const originalStyle = tableContainer.getAttribute("style") || "";
    
    // Configurar temporalmente para capturar el 100% del ancho del elemento sin recortes
    tableContainer.style.overflow = "visible";
    tableContainer.style.width = "auto";
    tableContainer.style.maxWidth = "none";
    tableContainer.style.position = "absolute";
    tableContainer.style.left = "-9999px";
    
    html2canvas(tableContainer, {
        backgroundColor: "#0d1117", // Fondo oscuro premium
        scale: 2, // Ultra HD
        useCORS: true,
        logging: false
    }).then(canvas => {
        tableContainer.setAttribute("style", originalStyle);
        
        const link = document.createElement("a");
        link.download = `reporte_tabla_status_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        showToast("Captura de imagen descargada con éxito.", "success");
    }).catch(err => {
        console.error("Error al exportar a imagen:", err);
        tableContainer.setAttribute("style", originalStyle);
        showToast("No se pudo generar la imagen de la tabla.", "error");
    });
};

window.renderDashboard = function() {
    const observedCountEl = document.getElementById("dashboard-observed-count");
    const repairedCountEl = document.getElementById("dashboard-repaired-count");
    const avgTimeEl = document.getElementById("dashboard-avg-time");
    const slaRateEl = document.getElementById("dashboard-sla-rate");
    const residueTableBody = document.getElementById("dashboard-residue-table");

    if (!observedCountEl) return;

    // 1. Contenedores Observados Activos (pendiente, en-reparacion, no-encadenado)
    const observedContainers = containers.filter(c => c.statusAdmin === "pendiente" || c.statusAdmin === "en-reparacion" || c.statusAdmin === "no-encadenado");
    observedCountEl.textContent = observedContainers.length;

    // 2. Contenedores Reparados Totales (listo, presentado)
    const repairedContainers = containers.filter(c => c.statusAdmin === "listo" || c.statusAdmin === "presentado");
    repairedCountEl.textContent = repairedContainers.length;

    // 3. Calcular tiempo promedio de reparación y tasa de cumplimiento SLA
    let totalDurationMs = 0;
    let resolvedCount = 0;
    let slaOnTimeCount = 0;

    repairedContainers.forEach(c => {
        let tStart = null;
        let tEnd = null;

        // Buscar en el historial los timestamps
        if (c.history && Array.isArray(c.history)) {
            // Primer log de creación / reporte
            const startLog = c.history.find(h => h.status === "pendiente" || h.status === "no-encadenado");
            if (startLog && startLog.timestamp) {
                tStart = new Date(startLog.timestamp);
            }
            // Primer log de listo
            const endLog = c.history.find(h => h.status === "listo");
            if (endLog && endLog.timestamp) {
                tEnd = new Date(endLog.timestamp);
            }
        }

        // Fallback si no hay historial detallado (ej. registros migrados)
        if (!tStart) {
            tStart = new Date(c.createdAt || c.reportDate);
        }
        if (!tEnd) {
            tEnd = new Date(c.updatedAt || c.reportDate);
        }

        const durationMs = tEnd.getTime() - tStart.getTime();
        if (durationMs > 0) {
            totalDurationMs += durationMs;
            resolvedCount++;

            // Verificar cumplimiento SLA
            const urgent = (c.type === "peligrosa" || c.chained === "NO");
            const limitHours = urgent ? 24 : 72; // 1 día o 3 días
            const durationHours = durationMs / (1000 * 60 * 60);

            if (durationHours <= limitHours) {
                slaOnTimeCount++;
            }
        }
    });

    // Renderizar Promedio
    if (resolvedCount > 0) {
        const avgHours = totalDurationMs / resolvedCount / (1000 * 60 * 60);
        if (avgHours < 24) {
            avgTimeEl.textContent = `${avgHours.toFixed(1)}h`;
        } else {
            const avgDays = avgHours / 24;
            avgTimeEl.textContent = `${avgDays.toFixed(1)}d`;
        }
        
        // SLA Rate
        const slaPercent = (slaOnTimeCount / resolvedCount) * 100;
        slaRateEl.textContent = `${slaPercent.toFixed(1)}%`;
    } else {
        avgTimeEl.textContent = "0.0h";
        slaRateEl.textContent = "100%";
    }

    // 4. Resumen por tipo de residuo
    const residueCounts = {
        "organico": { observed: 0, repaired: 0, label: "Orgánicos (Marrón)" },
        "aprovechable": { observed: 0, repaired: 0, label: "Aprovechables (Verde)" },
        "no-aprovechable": { observed: 0, repaired: 0, label: "No Aprovechables (Negro)" },
        "peligrosa": { observed: 0, repaired: 0, label: "Peligrosos (Rojo)" },
        "no-encadenado": { observed: 0, repaired: 0, label: "Alerta: No Encadenado" }
    };

    containers.forEach(c => {
        let key = c.type;
        if (c.statusAdmin === "no-encadenado") {
            key = "no-encadenado";
        }
        if (residueCounts[key]) {
            if (c.statusAdmin === "listo" || c.statusAdmin === "presentado") {
                residueCounts[key].repaired++;
            } else {
                residueCounts[key].observed++;
            }
        }
    });

    if (residueTableBody) {
        residueTableBody.innerHTML = Object.keys(residueCounts).map(k => {
            const item = residueCounts[k];
            const total = item.observed + item.repaired;
            return `
                <tr>
                    <td style="font-weight: 600;">${item.label}</td>
                    <td style="color: ${item.observed > 0 ? 'var(--status-retained)' : 'inherit'}; font-weight: ${item.observed > 0 ? 'bold' : 'normal'};">${item.observed}</td>
                    <td style="color: var(--status-transit);">${item.repaired}</td>
                    <td style="font-weight: 600;">${total}</td>
                </tr>
            `;
        }).join("");
    }
    
    if (window.lucide) window.lucide.createIcons();
};

// ==========================================================================
// CONTROLADOR DE ROLES Y SESIONES
// ==========================================================================

window.switchUserRole = function(role, userObj = null) {
    currentUserRole = role;
    if (userObj) {
        currentAuthUser = userObj;
        localStorage.setItem("waste_auth_session", JSON.stringify(userObj));
    }

    const authBtn = document.getElementById("btn-admin-auth");
    const authIcon = document.getElementById("admin-auth-icon");
    const authText = document.getElementById("admin-auth-text");

    const btnStatusGeneral = document.getElementById("btn-status-general");
    const btnModuloTaller = document.getElementById("btn-modulo-taller");
    const btnGestionUsuarios = document.getElementById("btn-gestion-usuarios");
    const btnDashboard = document.getElementById("btn-dashboard");
 
    const liStatus = btnStatusGeneral ? btnStatusGeneral.closest("li") : null;
    const liTaller = btnModuloTaller ? btnModuloTaller.closest("li") : null;
    const liUsuarios = btnGestionUsuarios ? btnGestionUsuarios.closest("li") : null;
    const liDashboard = btnDashboard ? btnDashboard.closest("li") : null;
    const maintenanceCard = document.getElementById("dashboard-maintenance-card");
 
    const avatarEl = document.querySelector(".sidebar-footer .user-avatar");
    const nameEl = document.querySelector(".sidebar-footer .user-name");
    const roleEl = document.querySelector(".sidebar-footer .user-role");
 
    if (role === "admin") {
        if (liStatus) liStatus.style.display = "block";
        if (liTaller) liTaller.style.display = "block";
        if (liUsuarios) liUsuarios.style.display = "block";
        if (liDashboard) liDashboard.style.display = "block";
        if (maintenanceCard) maintenanceCard.style.display = "block";
 
        if (authText) authText.textContent = "Cerrar Sesión";
        if (authIcon) {
            authIcon.setAttribute("data-lucide", "log-out");
            authIcon.style.color = "var(--status-transit)";
        }
        if (authBtn) {
            authBtn.style.borderColor = "var(--status-transit)";
            authBtn.style.color = "var(--status-transit)";
        }
 
        if (avatarEl) avatarEl.textContent = "AD";
        if (nameEl) nameEl.textContent = currentAuthUser ? currentAuthUser.fullName : "Coordinador General";
        if (roleEl) roleEl.textContent = "Administrador de Planta";
 
    } else if (role === "taller") {
        if (liStatus) liStatus.style.display = "none";
        if (liTaller) liTaller.style.display = "block";
        if (liUsuarios) liUsuarios.style.display = "none";
        if (liDashboard) liDashboard.style.display = "none";
        if (maintenanceCard) maintenanceCard.style.display = "none";
 
        if (authText) authText.textContent = "Cerrar Sesión";
        if (authIcon) {
            authIcon.setAttribute("data-lucide", "log-out");
            authIcon.style.color = "var(--status-retained)";
        }
        if (authBtn) {
            authBtn.style.borderColor = "var(--status-retained)";
            authBtn.style.color = "var(--status-retained)";
        }
 
        if (avatarEl) avatarEl.textContent = "TL";
        if (nameEl) nameEl.textContent = currentAuthUser ? currentAuthUser.fullName : "Taller de Reparaciones";
        if (roleEl) roleEl.textContent = "Área de Mantenimiento";
 
        // Si taller está en dashboard, sacarlo
        const activeNavBtn = document.querySelector(".nav-btn.active");
        if (activeNavBtn) {
            const target = activeNavBtn.getAttribute("data-target");
            if (target === "dashboard" || target === "gestion-usuarios" || target === "status-general") {
                triggerSwitchView("modulo-taller");
            }
        }
 
    } else {
        // Rol Guest / Público / Supervisor
        if (liStatus) liStatus.style.display = "block";
        if (liTaller) liTaller.style.display = "none";
        if (liUsuarios) liUsuarios.style.display = "none";
        if (liDashboard) liDashboard.style.display = "none";
        if (maintenanceCard) maintenanceCard.style.display = "none";
 
        if (authText) authText.textContent = "Acceso de Usuario";
        if (authIcon) {
            authIcon.setAttribute("data-lucide", "shield-check");
            authIcon.style.color = "var(--text-secondary)";
        }
        if (authBtn) {
            authBtn.style.borderColor = "var(--border-color)";
            authBtn.style.color = "var(--text-secondary)";
        }
 
        if (avatarEl) avatarEl.textContent = "SP";
        if (nameEl) nameEl.textContent = "Supervisor de Turno";
        if (roleEl) roleEl.textContent = "Control de Planta";
 
        // Si estaba en una vista privilegiada (como taller, usuarios o dashboard), devolverlo a reporte
        const activeNavBtn = document.querySelector(".nav-btn.active");
        if (activeNavBtn) {
            const target = activeNavBtn.getAttribute("data-target");
            if (target === "gestion-usuarios" || target === "modulo-taller" || target === "dashboard") {
                triggerSwitchView("reporte-contenedor");
            }
        }
    }

    if (window.lucide) window.lucide.createIcons();
    renderHistoryTable();
};

function logoutUser() {
    currentAuthUser = null;
    localStorage.removeItem("waste_auth_session");
    switchUserRole("supervisor");
    showToast("Sesión cerrada correctamente.", "info");
}

// ==========================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Forzar la eliminación de la barra de pestañas vieja de Status General en el DOM (protección de cache de HTML)
    const oldStatusTabs = document.querySelector("#view-status-general .monitoring-tabs");
    if (oldStatusTabs) {
        oldStatusTabs.remove();
    }

    loadData();
    await loadAppUsers();
    initClock();
    setupBatchFormEvents();
    initBatch();
    
    // Verificar sesión guardada
    try {
        const savedSession = localStorage.getItem("waste_auth_session");
        if (savedSession) {
            const parsed = JSON.parse(savedSession);
            const validUser = appUsers.find(u => u.username === parsed.username && u.isActive);
            if (validUser) {
                currentAuthUser = validUser;
                switchUserRole(validUser.role, validUser);
            } else {
                switchUserRole("supervisor");
            }
        } else {
            switchUserRole("supervisor");
        }
    } catch (e) {
        switchUserRole("supervisor");
    }
    
    // Configurar modal de WhatsApp (Copiar y Cerrar)
    const btnCopyWa = document.getElementById("btn-copy-whatsapp");
    if (btnCopyWa) {
        btnCopyWa.addEventListener("click", () => {
            const waTextArea = document.getElementById("whatsapp-text-area");
            if (waTextArea) {
                waTextArea.select();
                waTextArea.setSelectionRange(0, 99999);
                
                const completeCopy = () => {
                    const modal = document.getElementById("whatsapp-modal");
                    if (modal) modal.classList.remove("open");
                    resetFormState();
                    showToast("Reporte guardado en base de datos y copiado al portapapeles.", "success");
                    triggerSwitchView("reporte-contenedor");
                };

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(waTextArea.value)
                        .then(completeCopy)
                        .catch(() => {
                            document.execCommand("copy");
                            completeCopy();
                        });
                } else {
                    document.execCommand("copy");
                    completeCopy();
                }
            }
        });
    }

    // Configuración de Autenticación General (Login Modal)
    const btnAdminAuth = document.getElementById("btn-admin-auth");
    if (btnAdminAuth) {
        btnAdminAuth.addEventListener("click", () => {
            if (currentUserRole === "admin" || currentUserRole === "taller") {
                logoutUser();
            } else {
                const modal = document.getElementById("admin-login-modal");
                const errorMsg = document.getElementById("admin-login-error");
                const userInput = document.getElementById("admin-username");
                const pwdInput = document.getElementById("admin-password");
                if (errorMsg) errorMsg.style.display = "none";
                if (userInput) userInput.value = "";
                if (pwdInput) pwdInput.value = "";
                if (modal) modal.classList.add("open");
                if (userInput) userInput.focus();
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
            const userInput = document.getElementById("admin-username");
            const pwdInput = document.getElementById("admin-password");
            const errorMsg = document.getElementById("admin-login-error");

            const usernameVal = userInput ? userInput.value.trim().toLowerCase() : "";
            const pwdVal = pwdInput ? pwdInput.value : "";

            const foundUser = appUsers.find(u => u.username.toLowerCase() === usernameVal && u.passwordHash === pwdVal && u.isActive);

            if (foundUser) {
                switchUserRole(foundUser.role, foundUser);
                closeAdminModal();
                showToast(`Bienvenido ${foundUser.fullName}. Sesión iniciada como ${foundUser.role === 'admin' ? 'Administrador' : 'Área de Reparaciones'}.`, "success");
                if (foundUser.role === "admin") {
                    triggerSwitchView("status-general");
                } else if (foundUser.role === "taller") {
                    triggerSwitchView("modulo-taller");
                }
            } else {
                if (errorMsg) errorMsg.style.display = "block";
            }
        });
    }

    // Modal Crear / Editar Usuario (Admin)
    const btnOpenCreateUser = document.getElementById("btn-open-create-user");
    if (btnOpenCreateUser) {
        btnOpenCreateUser.addEventListener("click", () => {
            openCreateUserModal();
        });
    }

    const closeUserModal = () => {
        const modal = document.getElementById("user-form-modal");
        if (modal) modal.classList.remove("open");
    };

    const btnCloseUserModal = document.getElementById("btn-close-user-modal");
    const btnCancelUserModal = document.getElementById("btn-cancel-user-modal");
    const userModalEl = document.getElementById("user-form-modal");

    if (btnCloseUserModal) btnCloseUserModal.addEventListener("click", closeUserModal);
    if (btnCancelUserModal) btnCancelUserModal.addEventListener("click", closeUserModal);
    if (userModalEl) {
        userModalEl.addEventListener("click", (e) => {
            if (e.target.id === "user-form-modal") closeUserModal();
        });
    }

    const formUser = document.getElementById("user-form");
    if (formUser) {
        formUser.addEventListener("submit", async (e) => {
            e.preventDefault();
            const editId = document.getElementById("editing-user-id").value;
            const fullName = document.getElementById("user-fullname").value.trim();
            const username = document.getElementById("user-username").value.trim().toLowerCase();
            const role = document.getElementById("user-role").value;
            const password = document.getElementById("user-password").value;
            const isActive = document.getElementById("user-active").checked;

            if (editId) {
                // Editar usuario existente
                const existing = appUsers.find(u => u.id === editId);
                if (existing) {
                    existing.fullName = fullName;
                    existing.username = username;
                    existing.role = role;
                    existing.isActive = isActive;
                    if (password) existing.passwordHash = password;

                    await saveAppUserToDB(existing);
                    showToast(`Usuario ${username} actualizado correctamente.`, "success");
                }
            } else {
                // Verificar duplicados
                if (appUsers.some(u => u.username.toLowerCase() === username)) {
                    showToast("El nombre de usuario ya existe. Elija otro.", "error");
                    return;
                }

                const newUser = {
                    id: "usr-" + generateUUID(),
                    username: username,
                    fullName: fullName,
                    role: role,
                    passwordHash: password,
                    isActive: isActive,
                    createdAt: new Date().toISOString()
                };

                await saveAppUserToDB(newUser);
                showToast(`Usuario ${username} creado exitosamente.`, "success");
            }

            closeUserModal();
            renderUsersTable();
        });
    }

    // Modal de Reparaciones (Taller)
    const closeRepairModal = () => {
        const modal = document.getElementById("repair-action-modal");
        if (modal) modal.classList.remove("open");
    };

    const btnCloseRepair = document.getElementById("btn-close-repair-modal");
    const btnCloseRepairFooter = document.getElementById("btn-close-repair-modal-footer");
    const repairModalEl = document.getElementById("repair-action-modal");

    if (btnCloseRepair) btnCloseRepair.addEventListener("click", closeRepairModal);
    if (btnCloseRepairFooter) btnCloseRepairFooter.addEventListener("click", closeRepairModal);
    if (repairModalEl) {
        repairModalEl.addEventListener("click", (e) => {
            if (e.target.id === "repair-action-modal") closeRepairModal();
        });
    }

    // Cargar Foto en Reparación
    const btnTriggerRepairPhoto = document.getElementById("btn-trigger-repair-photo");
    const inputRepairPhoto = document.getElementById("repair-photo-input");
    if (btnTriggerRepairPhoto && inputRepairPhoto) {
        btnTriggerRepairPhoto.addEventListener("click", () => inputRepairPhoto.click());
        inputRepairPhoto.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                const base64 = await compressImage(file);
                activeRepairPhotoBase64 = base64;
                const imgPreview = document.getElementById("repair-photo-img-preview");
                const previewContainer = document.getElementById("repair-photo-preview-container");
                const photoLabel = document.getElementById("repair-photo-label");

                if (imgPreview && previewContainer) {
                    imgPreview.src = base64;
                    previewContainer.style.display = "block";
                }
                if (photoLabel) photoLabel.textContent = "Foto Adjunta ✓ (Cambiar)";
            }
        });
    }

    // Formulario Guardar Reparación
    const formRepairAction = document.getElementById("repair-action-form");
    if (formRepairAction) {
        formRepairAction.addEventListener("submit", (e) => {
            e.preventDefault();
            const reportId = document.getElementById("repair-report-id").value;
            const newStatus = document.getElementById("repair-status-select").value;
            const notes = document.getElementById("repair-notes-text").value.trim();

            const idx = containers.findIndex(c => c.reportId === reportId);
            if (idx > -1) {
                containers[idx].statusAdmin = newStatus;
                if (activeRepairPhotoBase64) {
                    containers[idx].photoContainer = activeRepairPhotoBase64;
                }

                const timestamp = new Date().toISOString();
                const userName = currentAuthUser ? currentAuthUser.fullName : "Área de Reparaciones";
                containers[idx].history.push({
                    timestamp: timestamp,
                    status: newStatus,
                    notes: `Trabajo técnico finalizado en Taller por [${userName}]: ${notes}`
                });

                saveData();
                closeRepairModal();
                renderTallerModule();
                updateDashboardMetrics();

                // Compilar reporte formateado para WhatsApp de Taller
                const c = containers[idx];
                const typeMeta = TYPE_DICT[c.type] || { text: "Residuo" };
                const statusLabel = newStatus === "listo" ? "Listo (Reparación Finalizada)" : "En Proceso de Reparación";
                const dateFormatted = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

                const waText = `🛠️ *REPORTE DE REPARACIÓN Y MANTENIMIENTO - TALLER*

📦 *Contenedor:* ${c.id}
• Tipo: ${typeMeta.text}
• Capacidad: ${c.capacity}
• Estado Técnico: ${statusLabel}
• Técnico Responsable: ${userName}
• Detalles de Trabajo: ${notes}
• Fecha de Trabajo: ${dateFormatted}

*Petroaseo S.A. - Área de Mantenimiento y Taller*`;

                const waTextArea = document.getElementById("whatsapp-text-area");
                if (waTextArea) {
                    waTextArea.value = waText.trim();
                }

                const waModal = document.getElementById("whatsapp-modal");
                if (waModal) {
                    waModal.classList.add("open");
                }

                showToast(`Reparación registrada para contenedor ${c.id}. Copie el reporte para WhatsApp.`, "success");
            }
        });
    }

    // Formulario Presentar Contenedor (Supervisor)
    const btnCloseSupervisorPresent = document.getElementById("btn-close-supervisor-present");
    const btnCancelSupervisorPresent = document.getElementById("btn-cancel-supervisor-present");
    const modalSupervisorPresent = document.getElementById("supervisor-present-modal");

    if (btnCloseSupervisorPresent) btnCloseSupervisorPresent.addEventListener("click", closeSupervisorPresentModal);
    if (btnCancelSupervisorPresent) btnCancelSupervisorPresent.addEventListener("click", closeSupervisorPresentModal);
    if (modalSupervisorPresent) {
        modalSupervisorPresent.addEventListener("click", (e) => {
            if (e.target.id === "supervisor-present-modal") closeSupervisorPresentModal();
        });
    }

    const inputSupervisorPhoto = document.getElementById("input-supervisor-present-photo");
    if (inputSupervisorPhoto) {
        inputSupervisorPhoto.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                const base64 = await compressImage(file, 800, 0.7);
                activeSupervisorPhotoBase64 = base64;
                const imgPreview = document.getElementById("supervisor-photo-preview");
                const previewContainer = document.getElementById("supervisor-photo-preview-container");
                const photoLabel = document.getElementById("supervisor-photo-label");
                if (imgPreview && previewContainer) {
                    imgPreview.src = base64;
                    previewContainer.style.display = "block";
                }
                if (photoLabel) photoLabel.textContent = "Foto Adjunta ✓ (Cambiar)";
            }
        });
    }

    const formSupervisorPresent = document.getElementById("supervisor-present-form");
    if (formSupervisorPresent) {
        formSupervisorPresent.addEventListener("submit", (e) => {
            e.preventDefault();
            const reportId = document.getElementById("present-report-id").value;
            const notes = document.getElementById("supervisor-present-notes").value.trim();

            const idx = containers.findIndex(c => c.reportId === reportId);
            if (idx > -1) {
                containers[idx].statusAdmin = "presentado";
                if (activeSupervisorPhotoBase64) {
                    containers[idx].photoContainer = activeSupervisorPhotoBase64;
                }

                const timestamp = new Date().toISOString();
                const userName = currentAuthUser ? currentAuthUser.fullName : "Supervisor";
                containers[idx].history.push({
                    timestamp: timestamp,
                    status: "presentado",
                    notes: `Contenedor presentado en poza por [${userName}]. Evidencia adjunta. ${notes ? 'Obs: ' + notes : ''}`
                });

                saveData();
                closeSupervisorPresentModal();
                renderMonitoringPanel();
                renderHistoryTable();
                updateDashboardMetrics();
                if (typeof renderTallerModule === "function") renderTallerModule();

                showToast(`Contenedor ${containers[idx].id} presentado en poza y culminado con éxito.`, "success");
            }
        });
    }

    // Búsqueda en vivo en Taller
    const searchTallerInput = document.getElementById("search-taller-input");
    if (searchTallerInput) {
        searchTallerInput.addEventListener("input", () => {
            renderTallerModule();
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

    // ==========================================================================
    // BACKUPS Y OPERACIONES DE MANTENIMIENTO (ADMIN ONLY)
    // ==========================================================================
    
    window.downloadJSONBackup = function(type) {
        let dataToDownload = [];
        let filename = "";

        if (type === "all") {
            dataToDownload = containers;
            filename = `petroaseo_respaldo_total_${new Date().toISOString().split('T')[0]}.json`;
        } else {
            dataToDownload = containers.filter(c => c.statusAdmin !== "presentado");
            filename = `petroaseo_contenedores_observados_${new Date().toISOString().split('T')[0]}.json`;
        }

        const blob = new Blob([JSON.stringify(dataToDownload, null, 4)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("Archivo de respaldo JSON descargado con éxito.", "success");
    };

    let activeMaintenanceType = null;
    let maintenanceRequiredPhraseText = "";

    window.openMaintenanceConfirmModal = function(type) {
        activeMaintenanceType = type;
        const phraseEl = document.getElementById("maintenance-required-phrase");
        const warningTextEl = document.getElementById("maintenance-warning-text");
        const phraseInput = document.getElementById("input-maintenance-confirm-phrase");
        const executeBtn = document.getElementById("btn-confirm-maintenance-execute");

        if (phraseInput) phraseInput.value = "";
        if (executeBtn) executeBtn.disabled = true;

        if (type === "history") {
            maintenanceRequiredPhraseText = "ELIMINAR HISTORIAL";
            if (warningTextEl) warningTextEl.textContent = "¡CUIDADO! Se eliminarán permanentemente todos los registros históricos de contenedores resueltos (estado '4. Presentado'). Esta acción no afectará a los contenedores observados activos.";
        } else if (type === "status") {
            maintenanceRequiredPhraseText = "ELIMINAR STATUS";
            if (warningTextEl) warningTextEl.textContent = "¡CUIDADO! Se eliminarán permanentemente todos los contenedores observados activos del Status General (estados '1. Reportado', '2. En Reparación', '3. Reparado', 'No Encadenado'). Esta acción vaciará el tablero activo.";
        } else {
            maintenanceRequiredPhraseText = "RESTABLECER TODO";
            if (warningTextEl) warningTextEl.textContent = "¡ADVERTENCIA CRÍTICA! Se borrará TODA la base de datos de contenedores en planta, incluyendo activos, historial de bitácoras y registros. El sistema quedará en blanco.";
        }

        if (phraseEl) phraseEl.textContent = maintenanceRequiredPhraseText;
        
        const modal = document.getElementById("maintenance-confirm-modal");
        if (modal) modal.classList.add("open");
    };

    window.closeMaintenanceConfirmModal = function() {
        const modal = document.getElementById("maintenance-confirm-modal");
        if (modal) modal.classList.remove("open");
        activeMaintenanceType = null;
    };

    const btnCloseMaint = document.getElementById("btn-close-maintenance-modal");
    const btnCancelMaint = document.getElementById("btn-cancel-maintenance");
    if (btnCloseMaint) btnCloseMaint.addEventListener("click", window.closeMaintenanceConfirmModal);
    if (btnCancelMaint) btnCancelMaint.addEventListener("click", window.closeMaintenanceConfirmModal);

    const maintPhraseInput = document.getElementById("input-maintenance-confirm-phrase");
    const maintExecuteBtn = document.getElementById("btn-confirm-maintenance-execute");
    if (maintPhraseInput && maintExecuteBtn) {
        maintPhraseInput.addEventListener("input", (e) => {
            const val = e.target.value.trim().toUpperCase();
            maintExecuteBtn.disabled = (val !== maintenanceRequiredPhraseText);
        });
    }

    if (maintExecuteBtn) {
        maintExecuteBtn.addEventListener("click", async () => {
            if (!activeMaintenanceType) return;

            showToast("Procesando operación en Supabase...", "info");
            maintExecuteBtn.disabled = true;

            try {
                if (activeMaintenanceType === "history") {
                    if (isSupabaseConfigured) {
                        const { error } = await supabase
                            .from('containers')
                            .delete()
                            .eq('status_admin', 'presentado');
                        if (error) throw error;
                    }
                    containers = containers.filter(c => c.statusAdmin !== "presentado");
                    showToast("Historial resuelto eliminado con éxito.", "success");
                } else if (activeMaintenanceType === "status") {
                    if (isSupabaseConfigured) {
                        const { error } = await supabase
                            .from('containers')
                            .delete()
                            .neq('status_admin', 'presentado');
                        if (error) throw error;
                    }
                    containers = containers.filter(c => c.statusAdmin === "presentado");
                    showToast("Contenedores observados activos eliminados.", "success");
                } else if (activeMaintenanceType === "all") {
                    if (isSupabaseConfigured) {
                        const { error } = await supabase
                            .from('containers')
                            .delete()
                            .neq('id', 'vaciar_db_dummy_key');
                        if (error) throw error;
                    }
                    containers = [];
                    showToast("Base de datos de contenedores vaciada.", "success");
                }

                saveData();
                window.closeMaintenanceConfirmModal();
                updateDashboardMetrics();
                renderMonitoringPanel();
                renderHistoryTable();
                if (typeof renderTallerModule === "function") renderTallerModule();
                if (typeof window.renderDashboard === "function") window.renderDashboard();

            } catch (err) {
                console.error("Error de mantenimiento:", err);
                showToast("Error al ejecutar mantenimiento en Supabase.", "error");
                maintExecuteBtn.disabled = false;
            }
        });
    }

    updateDashboardMetrics();
    lucide.createIcons();
});
