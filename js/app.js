// ==============================
// CONFIGURACIÓN DE API
// ==============================
// Endpoint público sin clave (open.er-api.com) - evita exponer credenciales en el frontend.
const API_URL = `https://open.er-api.com/v6/latest/EUR`;
const BACKUP_KEY = 'crypto_data_backups';
const MAX_BACKUPS = 5;

const NOMBRES_MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const SORT_LABELS = {
    fecha: 'Fecha',
    moneda: 'Moneda',
    eur: 'Inversión',
    comision: 'Comisión',
    cantidad: 'Cantidad',
    precio: 'Precio/U'
};

// ==============================
// CONFIGURACIÓN INICIAL
// ==============================
let compras = JSON.parse(localStorage.getItem('crypto_data')) || [];
let enUSD = false;
let tasaCambioReal = 1.0;
let editandoIndex = -1; // -1 significa que no estamos editando
let anioActivo = 'todos'; // año seleccionado en las pestañas
let filtroMoneda = ''; // texto de búsqueda por moneda
let filtroDesde = '';
let filtroHasta = '';
let sortColumn = 'fecha';
let sortDir = 'asc';
let undoData = null;
let undoTimeoutId = null;

// ==============================
// REFERENCIAS AL DOM
// ==============================
const form = document.getElementById('crypto-form');
const tableBody = document.getElementById('table-body');
const toggleCurrency = document.getElementById('currency-toggle');
const totalDisplay = document.getElementById('total-general');
const totalLabel = document.getElementById('total-label');
const yearTabs = document.getElementById('year-tabs');
const themeBtn = document.getElementById('theme-toggle');
const exportBtn = document.getElementById('export-json');
const exportCsvBtn = document.getElementById('export-csv');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-json');
const btnSubmit = form.querySelector('button[type="submit"]');
const btnCancelar = document.getElementById('btn-cancelar');
const searchInput = document.getElementById('search-moneda');
const searchCount = document.getElementById('search-count');
const filtroDesdeInput = document.getElementById('filtro-desde');
const filtroHastaInput = document.getElementById('filtro-hasta');
const limpiarFiltrosBtn = document.getElementById('limpiar-filtros');
const statsSummary = document.getElementById('stats-summary');
const spendChart = document.getElementById('spend-chart');
const chartTitle = document.getElementById('chart-title');
const backupBanner = document.getElementById('backup-banner');
const bannerExportBtn = document.getElementById('banner-export-btn');
const restoreBar = document.getElementById('restore-bar');
const restoreSelect = document.getElementById('restore-select');
const restoreBtn = document.getElementById('restore-btn');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const toastUndo = document.getElementById('toast-undo');
const sortableHeaders = document.querySelectorAll('th.sortable');
const statsDetails = document.getElementById('stats-details');

// ==============================
// FUNCIÓN PARA OBTENER TASA EN TIEMPO REAL
// ==============================
async function obtenerTasaReal() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.result === "success") {
            tasaCambioReal = data.rates.USD;
            // Guardamos la última tasa buena para poder mostrar USD correctamente
            // offline (si no, el toggle USD caería a 1:1).
            localStorage.setItem('last_rate_usd', tasaCambioReal);
            console.log(`Tasa actualizada: 1 EUR = ${tasaCambioReal} USD`);
            render();
        }
    } catch (error) {
        console.error("Error conectando con la API:", error);
    }
}

// ==============================
// DARK MODE
// ==============================
function actualizarIconoTema() {
    const esOscuro = document.body.classList.contains('dark-theme');
    themeBtn.textContent = esOscuro ? '☀️' : '🌙';
}

themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark_mode', document.body.classList.contains('dark-theme'));
    actualizarIconoTema();
    render();
});

if (localStorage.getItem('dark_mode') === 'true') {
    document.body.classList.add('dark-theme');
}
actualizarIconoTema();

// ==============================
// FORMATEO DE MONEDA CON TASA REAL
// ==============================
function formatMoney(valor) {
    if (isNaN(valor)) valor = 0;
    const finalVal = enUSD ? valor * tasaCambioReal : valor;

    return finalVal.toLocaleString('es-ES', {
        style: 'currency',
        currency: enUSD ? 'USD' : 'EUR'
    });
}

function gastoReal(c) {
    return c.eur + (c.comision || 0);
}

// ==============================
// PERSISTENCIA + BACKUPS AUTOMÁTICOS
// ==============================
// Escapa texto de usuario antes de meterlo en innerHTML (evita XSS al importar).
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function guardarEstado() {
    try {
        localStorage.setItem('crypto_data', JSON.stringify(compras));
    } catch (e) {
        alert('⚠️ No se pudieron guardar los datos (almacenamiento lleno). ' +
              'Exporta un backup y libera espacio.');
    }
}

function crearBackup() {
    try {
        const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
        // Copia profunda: si guardáramos la referencia, las mutaciones posteriores del array
        // (push/splice) se reflejarían también en el backup ya guardado.
        backups.unshift({ ts: Date.now(), data: JSON.parse(JSON.stringify(compras)) });
        localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_BACKUPS)));
    } catch (e) {
        // Un backup que falla no debe bloquear la operación principal (añadir/borrar).
        console.warn('No se pudo crear el backup automático:', e);
    }
}

function renderRestoreBar() {
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    if (!backups.length) {
        restoreBar.style.display = 'none';
        return;
    }
    restoreBar.style.display = 'flex';
    restoreSelect.innerHTML = backups
        .map((b, i) => `<option value="${i}">${new Date(b.ts).toLocaleString('es-ES')} (${b.data.length} registros)</option>`)
        .join('');
}

restoreBtn.addEventListener('click', () => {
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    const idx = parseInt(restoreSelect.value, 10);
    const backup = backups[idx];
    if (!backup) return;
    if (!confirm('Esto sustituirá tus datos actuales por esta copia automática. ¿Continuar?')) return;
    compras = backup.data;
    guardarEstado();
    anioActivo = 'todos';
    render();
});

// ==============================
// AVISO DE BACKUP (EXPORTACIÓN MANUAL)
// ==============================
function marcarBackupHecho() {
    localStorage.setItem('last_export_ts', Date.now().toString());
    actualizarBackupBanner();
}

// Cada cuántos días sin exportar volvemos a mostrar el aviso (~2 meses).
const DIAS_AVISO_BACKUP = 60;

function actualizarBackupBanner() {
    if (compras.length === 0) {
        backupBanner.style.display = 'none';
        return;
    }
    const last = parseInt(localStorage.getItem('last_export_ts') || '0', 10);
    // Si nunca se ha exportado, medimos desde que la app tiene datos por
    // primera vez (no desde 1970), para no avisar a alguien que acaba de empezar.
    let referencia = last;
    if (last === 0) {
        referencia = parseInt(localStorage.getItem('first_data_ts') || '0', 10);
        if (referencia === 0) {
            referencia = Date.now();
            localStorage.setItem('first_data_ts', referencia.toString());
        }
    }
    const diasDesde = (Date.now() - referencia) / (1000 * 60 * 60 * 24);
    backupBanner.style.display = diasDesde > DIAS_AVISO_BACKUP ? 'flex' : 'none';
}

bannerExportBtn.addEventListener('click', () => exportBtn.click());

// ==============================
// TOAST / DESHACER BORRADO
// ==============================
function mostrarToastDeshacer(compra, index) {
    clearTimeout(undoTimeoutId);
    undoData = { compra, index };
    toastMsg.textContent = `Compra de ${compra.moneda} eliminada`;
    toast.style.display = 'flex';
    undoTimeoutId = setTimeout(() => {
        toast.style.display = 'none';
        undoData = null;
    }, 5000);
}

toastUndo.addEventListener('click', () => {
    if (!undoData) return;
    clearTimeout(undoTimeoutId);
    compras.splice(undoData.index, 0, undoData.compra);
    guardarEstado();
    render();
    toast.style.display = 'none';
    undoData = null;
});

// ==============================
// GRÁFICO DE GASTO (canvas simple, sin librerías)
// ==============================
let ultimoGrafico = { labels: [], values: [], titulo: '' };

function ajustarTamanoCanvas() {
    // El canvas usa resolución real igual al ancho del contenedor, no un escalado CSS
    // (que dejaba el texto borroso y el gráfico diminuto en móvil).
    const anchoDisponible = spendChart.parentElement.clientWidth - 20;
    spendChart.width = Math.max(260, Math.round(anchoDisponible));

    // Menos alto en pantallas de poca altura (móvil en landscape) para no forzar scroll.
    if (window.innerHeight <= 420) {
        spendChart.height = 100;
    } else if (window.innerWidth <= 600) {
        spendChart.height = 140;
    } else {
        spendChart.height = 180;
    }
}

function dibujarGrafico(labels, values, titulo) {
    if (titulo !== undefined) {
        ultimoGrafico = { labels, values, titulo };
    }
    chartTitle.textContent = ultimoGrafico.titulo;

    ajustarTamanoCanvas();

    const ctx = spendChart.getContext('2d');
    const w = spendChart.width;
    const h = spendChart.height;
    ctx.clearRect(0, 0, w, h);

    if (!values.length) return;

    const isDark = document.body.classList.contains('dark-theme');
    const max = Math.max(...values, 0.01);
    const barGap = 8;
    const barWidth = (w / values.length) - barGap;
    const espacioEtiqueta = 18; // hueco reservado arriba para el importe de cada barra
    const espacioEjeX = 20; // hueco reservado abajo para el nombre del mes/año

    ctx.textAlign = 'center';

    values.forEach((v, i) => {
        const barHeight = (v / max) * (h - espacioEtiqueta - espacioEjeX);
        const x = i * (barWidth + barGap) + barGap / 2;
        const y = h - barHeight - espacioEjeX;

        ctx.fillStyle = '#2563eb';
        ctx.fillRect(x, y, barWidth, barHeight);

        // Importe encima de la barra
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = isDark ? '#f8fafc' : '#1e293b';
        ctx.fillText(formatMoney(v), x + barWidth / 2, y - 5);

        // Etiqueta del eje X (mes o año)
        ctx.font = '11px sans-serif';
        ctx.fillText(labels[i], x + barWidth / 2, h - 5);
    });
}

// ==============================
// COMPARATIVA AÑO ANTERIOR
// ==============================
function calcularComparativaAnual() {
    const anioNum = Number(anioActivo);
    if (anioActivo === 'todos' || isNaN(anioNum)) return null;

    const anioAnterior = String(anioNum - 1);
    const hoy = new Date();
    const esAnioActual = anioNum === hoy.getFullYear();
    const cutoff = esAnioActual
        ? `${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
        : '12-31';

    const totalHastaCutoff = (anio) => compras
        .filter((c) => (c.fecha || '').startsWith(anio) && (c.fecha || '').slice(5, 10) <= cutoff)
        .reduce((s, c) => s + gastoReal(c), 0);

    const actual = totalHastaCutoff(anioActivo);
    const anterior = totalHastaCutoff(anioAnterior);

    if (anterior <= 0) return null;

    const pct = ((actual - anterior) / anterior) * 100;
    return { anioAnterior, actual, anterior, pct, esAnioActual };
}

// ==============================
// COSTE MEDIO Y FRECUENCIA DE COMPRA
// ==============================
function calcularFrecuenciaDias(lista) {
    if (lista.length < 2) return null;
    const fechas = lista.map((c) => new Date(c.fecha)).sort((a, b) => a - b);
    const spanDias = (fechas[fechas.length - 1] - fechas[0]) / (1000 * 60 * 60 * 24);
    return spanDias / (lista.length - 1);
}

// ==============================
// RESUMEN POR ACTIVO + MEDIA MENSUAL + COMPARATIVA
// ==============================
function renderStats(comprasDelAnio) {
    if (!comprasDelAnio.length) {
        statsSummary.innerHTML = '<div class="stats-line">Sin compras en este periodo.</div>';
        dibujarGrafico([], [], '');
        return;
    }

    const totalAnio = comprasDelAnio.reduce((s, c) => s + gastoReal(c), 0);

    const porMoneda = new Map();
    const mesesSet = new Set();
    comprasDelAnio.forEach((c) => {
        porMoneda.set(c.moneda, (porMoneda.get(c.moneda) || 0) + gastoReal(c));
        mesesSet.add((c.fecha || '').slice(0, 7));
    });

    const mediaMensual = totalAnio / (mesesSet.size || 1);
    const costeMedio = totalAnio / comprasDelAnio.length;
    const frecuencia = calcularFrecuenciaDias(comprasDelAnio);
    const frecuenciaTxt = frecuencia === null ? '—' : `cada ${Math.round(frecuencia)} días`;

    const comp = calcularComparativaAnual();
    let comparisonHtml = '';
    if (comp) {
        const signo = comp.pct >= 0 ? '+' : '';
        const clase = comp.pct >= 0 ? 'up' : 'down';
        const rangoTxt = comp.esAnioActual ? 'hasta hoy' : 'año completo';
        comparisonHtml = `<div class="stats-comparison ${clase}">📊 vs ${comp.anioAnterior} (${rangoTxt}): <strong>${signo}${comp.pct.toFixed(1)}%</strong> (${formatMoney(comp.actual)} vs ${formatMoney(comp.anterior)})</div>`;
    }

    const maxPct = Math.max(...[...porMoneda.values()].map((v) => v / totalAnio));

    const chips = [...porMoneda.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([moneda, total]) => {
            const fraccion = total / totalAnio;
            const pct = (fraccion * 100).toFixed(1);
            const anchoBarra = maxPct > 0 ? (fraccion / maxPct) * 100 : 0;
            return `
                <div class="asset-chip">
                    <div class="asset-chip-top"><strong>${escapeHtml(moneda)}</strong><span class="asset-chip-pct">${pct}%</span></div>
                    <div>${formatMoney(total)}</div>
                    <div class="asset-chip-bar"><div class="asset-chip-bar-fill" style="width:${anchoBarra}%"></div></div>
                </div>
            `;
        })
        .join('');

    statsSummary.innerHTML = `
        ${comparisonHtml}
        <div class="kpi-grid">
            <div class="kpi-tile">
                <div class="kpi-ic b"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg></div>
                <div><div class="kpi-lab">Media mensual</div><div class="kpi-val">${formatMoney(mediaMensual)}</div></div>
            </div>
            <div class="kpi-tile">
                <div class="kpi-ic v"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8Z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg></div>
                <div><div class="kpi-lab">Coste medio</div><div class="kpi-val">${formatMoney(costeMedio)}</div></div>
            </div>
            <div class="kpi-tile">
                <div class="kpi-ic a"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
                <div><div class="kpi-lab">Frecuencia</div><div class="kpi-val">${frecuenciaTxt}</div></div>
            </div>
        </div>
        <div class="asset-chips-wrapper">
            <div class="asset-chips">${chips}</div>
        </div>
    `;

    // Datos del gráfico: por año si estamos en "todos", por mes si hay un año activo
    let labels, values, titulo;
    if (anioActivo === 'todos') {
        const porAnio = new Map();
        comprasDelAnio.forEach((c) => {
            const a = (c.fecha || '').slice(0, 4);
            porAnio.set(a, (porAnio.get(a) || 0) + gastoReal(c));
        });
        const anios = [...porAnio.keys()].sort();
        labels = anios;
        values = anios.map((a) => porAnio.get(a));
        titulo = 'Gasto por año';
    } else {
        const porMes = new Map();
        comprasDelAnio.forEach((c) => {
            const m = (c.fecha || '').slice(5, 7);
            porMes.set(m, (porMes.get(m) || 0) + gastoReal(c));
        });
        const meses = [...porMes.keys()].sort();
        labels = meses.map((m) => NOMBRES_MES[parseInt(m, 10) - 1] || m);
        values = meses.map((m) => porMes.get(m));
        titulo = `Gasto por mes en ${anioActivo}`;
    }
    dibujarGrafico(labels, values, titulo);
}

// ==============================
// ORDEN DE LA TABLA
// ==============================
function valorOrden(c, col) {
    switch (col) {
        case 'fecha': return c.fecha || '';
        case 'moneda': return c.moneda || '';
        case 'eur': return c.eur;
        case 'comision': return c.comision || 0;
        case 'cantidad': return c.cantidad;
        case 'precio': return c.cantidad > 0 ? gastoReal(c) / c.cantidad : 0;
        default: return c.fecha || '';
    }
}

function actualizarCabecerasOrden() {
    sortableHeaders.forEach((th) => {
        const col = th.dataset.sort;
        const flecha = col === sortColumn ? ` <span class="sort-arrow">${sortDir === 'asc' ? '▲' : '▼'}</span>` : '';
        th.innerHTML = SORT_LABELS[col] + flecha;
    });
}

sortableHeaders.forEach((th) => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (sortColumn === col) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortColumn = col;
            sortDir = 'asc';
        }
        render();
    });
});

// ==============================
// RENDER TABLA (CON EDITAR Y BORRAR)
// ==============================
function getAniosDisponibles() {
    const set = new Set(compras.map(c => (c.fecha || '').slice(0, 4)).filter(Boolean));
    return [...set].sort();
}

function renderTabs(anios) {
    yearTabs.innerHTML = '';

    const opciones = [...anios, 'todos'];
    opciones.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'year-tab' + (opt === anioActivo ? ' active' : '');
        btn.textContent = opt === 'todos' ? 'Todos' : opt;
        btn.onclick = () => {
            anioActivo = opt;
            render();
        };
        yearTabs.appendChild(btn);
    });
}

function render() {
    const anios = getAniosDisponibles();

    // Si el año activo ya no existe (se borró la última compra de ese año), cae a "todos"
    if (anioActivo !== 'todos' && !anios.includes(anioActivo)) {
        anioActivo = anios.length ? anios[anios.length - 1] : 'todos';
    }

    renderTabs(anios);
    actualizarCabecerasOrden();
    renderRestoreBar();

    // Compras del año activo (con su índice real en el array, para editar/borrar)
    const comprasAnio = compras
        .map((c, index) => ({ c, index }))
        .filter(({ c }) => anioActivo === 'todos' || (c.fecha || '').slice(0, 4) === anioActivo);

    renderStats(comprasAnio.map(({ c }) => c));

    // Filtros de búsqueda por moneda y rango de fechas (no afectan al total/resumen, solo a la tabla visible)
    const termino = filtroMoneda.trim().toUpperCase();
    const comprasVisibles = comprasAnio
        .filter(({ c }) => {
            if (termino && !c.moneda.toUpperCase().includes(termino)) return false;
            if (filtroDesde && c.fecha < filtroDesde) return false;
            if (filtroHasta && c.fecha > filtroHasta) return false;
            return true;
        })
        .sort((a, b) => {
            const va = valorOrden(a.c, sortColumn);
            const vb = valorOrden(b.c, sortColumn);
            const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return sortDir === 'asc' ? cmp : -cmp;
        });

    const hayFiltros = Boolean(termino || filtroDesde || filtroHasta);
    searchCount.textContent = hayFiltros
        ? `${comprasVisibles.length} resultado${comprasVisibles.length === 1 ? '' : 's'}`
        : '';

    tableBody.innerHTML = '';

    comprasVisibles.forEach(({ c, index }) => {
        const comision = c.comision || 0;
        const gasto = gastoReal(c);
        const precioUnitario = c.cantidad > 0 ? (gasto / c.cantidad) : 0;

        const fila = document.createElement('tr');

        fila.innerHTML = `
            <td></td>
            <td><strong></strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td class="action-cells"></td>
        `;

        fila.cells[0].textContent = c.fecha;
        fila.cells[1].textContent = c.moneda;
        fila.cells[2].textContent = formatMoney(c.eur);
        fila.cells[3].textContent = formatMoney(comision);
        fila.cells[4].textContent = parseFloat(c.cantidad).toFixed(6);
        fila.cells[5].textContent = formatMoney(precioUnitario);

        // --- BOTONES ACCIONES ---
        const actionsContainer = fila.cells[6];

        // Botón Editar
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn-delete';
        btnEdit.style.background = '#3b82f6'; // Azul editar
        btnEdit.style.marginRight = '5px';
        btnEdit.textContent = '✏️';
        btnEdit.onclick = () => iniciarEdicion(index);

        // Botón Borrar
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-delete';
        btnDelete.textContent = '🗑️';
        btnDelete.onclick = () => borrarCompra(index);

        actionsContainer.appendChild(btnEdit);
        actionsContainer.appendChild(btnDelete);

        tableBody.appendChild(fila);
    });

    const totalAnioCompleto = comprasAnio.reduce((s, { c }) => s + gastoReal(c), 0);
    totalLabel.textContent = anioActivo === 'todos' ? 'Inversión Total:' : `Inversión Total ${anioActivo}:`;
    totalDisplay.textContent = formatMoney(totalAnioCompleto);

    actualizarBackupBanner();
}

// ==============================
// BÚSQUEDA POR MONEDA Y RANGO DE FECHAS
// ==============================
searchInput.addEventListener('input', () => {
    filtroMoneda = searchInput.value;
    render();
});

filtroDesdeInput.addEventListener('change', () => {
    filtroDesde = filtroDesdeInput.value;
    render();
});

filtroHastaInput.addEventListener('change', () => {
    filtroHasta = filtroHastaInput.value;
    render();
});

limpiarFiltrosBtn.addEventListener('click', () => {
    filtroMoneda = '';
    filtroDesde = '';
    filtroHasta = '';
    searchInput.value = '';
    filtroDesdeInput.value = '';
    filtroHastaInput.value = '';
    render();
});

// Atajo de teclado "/" para enfocar la búsqueda
document.addEventListener('keydown', (e) => {
    if (e.key !== '/') return;
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    searchInput.focus();
});

// ==============================
// LÓGICA EDICIÓN
// ==============================
function iniciarEdicion(index) {
    editandoIndex = index;
    const compra = compras[index];

    // Rellenar formulario
    document.getElementById('input-fecha').value = compra.fecha;
    document.getElementById('input-moneda').value = compra.moneda;
    document.getElementById('input-euros').value = compra.eur;
    document.getElementById('input-comision').value = compra.comision || 0;
    document.getElementById('input-cantidad').value = compra.cantidad;

    // Cambiar texto botón y mostrar cancelar
    btnSubmit.textContent = 'Actualizar';
    btnCancelar.style.display = 'inline-block';
}

function cancelarEdicion() {
    editandoIndex = -1;
    form.reset();
    btnSubmit.textContent = 'Añadir';
    btnCancelar.style.display = 'none';
}

btnCancelar.addEventListener('click', cancelarEdicion);

// ==============================
// AÑADIR/ACTUALIZAR COMPRA
// ==============================
function existeDuplicado(fecha, moneda, ignorarIndex) {
    return compras.some((c, i) => i !== ignorarIndex && c.fecha === fecha && c.moneda === moneda);
}

form.addEventListener('submit', (e) => {
    e.preventDefault();

    const nuevaCompra = {
        fecha: document.getElementById('input-fecha').value,
        moneda: document.getElementById('input-moneda').value.toUpperCase(),
        eur: parseFloat(document.getElementById('input-euros').value),
        comision: parseFloat(document.getElementById('input-comision').value) || 0,
        cantidad: parseFloat(document.getElementById('input-cantidad').value)
    };

    if (existeDuplicado(nuevaCompra.fecha, nuevaCompra.moneda, editandoIndex)) {
        const continuar = confirm(`Ya existe una compra de ${nuevaCompra.moneda} en ${nuevaCompra.fecha}. ¿Añadir de todas formas?`);
        if (!continuar) return;
    }

    crearBackup();

    if (editandoIndex === -1) {
        // Modo Añadir
        compras.push(nuevaCompra);
    } else {
        // Modo Editar
        compras[editandoIndex] = nuevaCompra;
        cancelarEdicion();
    }

    guardarEstado();
    form.reset();
    render();
});

// ==============================
// BORRAR COMPRA (con deshacer)
// ==============================
function borrarCompra(index) {
    crearBackup();
    const [compraEliminada] = compras.splice(index, 1);
    guardarEstado();
    render();
    mostrarToastDeshacer(compraEliminada, index);
    if (editandoIndex === index) cancelarEdicion(); // Si borras lo que editas, cancela
}

// ==============================
// TOGGLE MONEDA
// ==============================
toggleCurrency.addEventListener('change', () => {
    enUSD = toggleCurrency.checked;
    render();
});

// ==============================
// EXPORTAR/IMPORTAR JSON Y CSV
// ==============================
function descargarArchivo(contenido, nombre, tipo) {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
}

exportBtn.addEventListener('click', () => {
    descargarArchivo(JSON.stringify(compras, null, 2), 'crypto_data.json', 'application/json');
    marcarBackupHecho();
});

exportCsvBtn.addEventListener('click', () => {
    const header = 'Fecha,Moneda,Euros,Comision,Cantidad\n';
    const filas = compras
        .map(c => `${c.fecha},${c.moneda},${c.eur},${c.comision || 0},${c.cantidad}`)
        .join('\n');
    descargarArchivo(header + filas, 'crypto_data.csv', 'text/csv');
    marcarBackupHecho();
});

importBtn.addEventListener('click', () => {
    if (compras.length > 0) {
        const continuar = confirm('Esto sustituirá todos tus datos actuales por los del archivo. Exporta antes si quieres guardar una copia. ¿Continuar?');
        if (!continuar) return;
    }
    importInput.click();
});

importInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (Array.isArray(importedData)) {
                crearBackup();
                compras = importedData;
                guardarEstado();
                // Importar un archivo significa que ya tienes una copia de tus
                // datos: cuenta como backup para no avisar en este dispositivo.
                marcarBackupHecho();
                anioActivo = 'todos';
                render();
                alert("Datos importados correctamente ✅");
            } else {
                alert("Formato inválido ❌");
            }
        } catch (err) {
            alert("Error leyendo el archivo JSON ❌");
        }
    };
    reader.readAsText(file);
    importInput.value = '';
});

// Mientras <details> está cerrado, el canvas no tiene ancho real que medir;
// al reabrirlo hay que recalcularlo y redibujar.
statsDetails.addEventListener('toggle', () => {
    if (statsDetails.open) {
        dibujarGrafico(ultimoGrafico.labels, ultimoGrafico.values);
    }
});

// ==============================
// REDIBUJAR GRÁFICO AL ROTAR / REDIMENSIONAR
// ==============================
let resizeTimeoutId = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeoutId);
    resizeTimeoutId = setTimeout(() => {
        dibujarGrafico(ultimoGrafico.labels, ultimoGrafico.values);
    }, 150);
});

// ==============================
// PWA: SERVICE WORKER
// ==============================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
            console.warn('No se pudo registrar el service worker:', err);
        });
    });
}

// ==============================
// INICIALIZACIÓN
// ==============================
// Sembramos la última tasa conocida para que el toggle USD funcione offline
// mientras (o si falla) la API responde.
tasaCambioReal = parseFloat(localStorage.getItem('last_rate_usd')) || 1.0;
obtenerTasaReal();
render();
