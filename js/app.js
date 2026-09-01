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
let sortDir = 'desc'; // por defecto, las compras más recientes primero
let undoData = null;
let undoTimeoutId = null;
let storeVersion = parseInt(localStorage.getItem('crypto_data_updated'), 10) || 0; // marca de tiempo para el sync (gana el más reciente)

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
const coinQuick = document.getElementById('coin-quick');
const coinQuickChips = document.getElementById('coin-quick-chips');
const coinDatalist = document.getElementById('coin-datalist');
const inputMoneda = document.getElementById('input-moneda');

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
    themeBtn.textContent = esOscuro ? '🌙' : '☀️';
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

// ==============================
// LOGOS DE MONEDA (CoinGecko, con caché y fallback monograma)
// ==============================
// Mapa "BTC" -> URL del logo. Persistido: las URLs cambian rarísimo.
let logoCache = JSON.parse(localStorage.getItem('coin_logos') || '{}');
// Símbolos ya intentados en esta sesión (éxito o fallo) para no repetir peticiones
// ni entrar en bucle render -> fetch -> render.
const logosPedidos = new Set();
let ultimoIntentoLogos = 0; // freno para no machacar la API si render() se dispara seguido

// Color estable por ticker (hash -> hue) para el monograma de fallback.
function colorMonograma(moneda) {
    let h = 0;
    for (let i = 0; i < moneda.length; i++) h = (h * 31 + moneda.charCodeAt(i)) % 360;
    return `hsl(${h}, 55%, 45%)`;
}

// Devuelve el HTML del icono: <img> del logo si lo tenemos (con fallback a
// monograma vía onerror), o directamente el monograma si aún no hay URL.
function iconoActivo(moneda) {
    const key = String(moneda).toUpperCase();
    const iniciales = escapeHtml(key.slice(0, 3));
    const monoAbierto = (display) =>
        `<span class="coin-ic-mono" style="display:${display};background:${colorMonograma(key)}">${iniciales}</span>`;

    const url = logoCache[key];
    if (url) {
        return `<span class="coin-ic">` +
            `<img src="${escapeHtml(url)}" alt="" loading="lazy" class="coin-ic-img" ` +
            `onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` +
            monoAbierto('none') +
            `</span>`;
    }
    return `<span class="coin-ic">${monoAbierto('flex')}</span>`;
}

// Pide a CoinGecko solo los símbolos que faltan (una llamada). Se auto-cura: al
// añadir/importar una moneda nueva, el siguiente render() la detecta y la pide.
async function refrescarLogosSiHaceFalta() {
    const symbols = [...new Set(compras.map((c) => (c.moneda || '').toUpperCase()).filter(Boolean))]
        .filter((s) => !(s in logoCache) && !logosPedidos.has(s));

    if (!symbols.length || !navigator.onLine) return;
    // Freno: render() puede dispararse seguido (búsqueda, orden...). Evita machacar
    // la API y, si hubo fallo (429/red), da margen antes de reintentar.
    if (Date.now() - ultimoIntentoLogos < 8000) return;
    ultimoIntentoLogos = Date.now();
    symbols.forEach((s) => logosPedidos.add(s));

    try {
        const lista = symbols.map((s) => s.toLowerCase()).join(',');
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&symbols=${lista}&include_tokens=top`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error('respuesta no válida');

        let hayNuevos = false;
        data.forEach((item) => {
            const sym = (item.symbol || '').toUpperCase();
            if (sym && item.image && !(sym in logoCache)) {
                logoCache[sym] = item.image;
                hayNuevos = true;
            }
        });

        // Segundo intento por ID para los que no resolvieron por símbolo
        // (p. ej. escribiste "BIT2ME" y el id en CoinGecko es "bit2me", símbolo B2M).
        const faltan = symbols.filter((s) => !(s in logoCache));
        if (faltan.length) {
            const ids = faltan.map((s) => s.toLowerCase()).join(',');
            const resp2 = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&ids=${ids}`);
            if (resp2.ok) {
                const data2 = await resp2.json();
                if (Array.isArray(data2)) {
                    data2.forEach((item) => {
                        const key = (item.id || '').toUpperCase();
                        if (key && item.image && !(key in logoCache)) {
                            logoCache[key] = item.image;
                            hayNuevos = true;
                        }
                    });
                }
            }
        }

        if (hayNuevos) {
            localStorage.setItem('coin_logos', JSON.stringify(logoCache));
            render();
        }
    } catch (e) {
        // Fallo (rate limit 429, red caída...): olvidamos que se pidieron para
        // reintentar en la siguiente interacción (respetando el freno). Mientras,
        // se ven los monogramas. No es crítico.
        symbols.forEach((s) => logosPedidos.delete(s));
        console.warn('No se pudieron obtener logos de CoinGecko (se reintentará):', e);
    }
}

function guardarEstado() {
    try {
        storeVersion = Date.now();
        localStorage.setItem('crypto_data', JSON.stringify(compras));
        localStorage.setItem('crypto_data_updated', String(storeVersion));
    } catch (e) {
        alert('⚠️ No se pudieron guardar los datos (almacenamiento lleno). ' +
              'Exporta un backup y libera espacio.');
    }
    syncSchedulePush();   // si el sync está activo, sube al gist (debounced)
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
    const emptyEl = document.getElementById('restore-empty');
    if (emptyEl) emptyEl.style.display = backups.length ? 'none' : 'block';
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
    // Si el sync está activo, tus datos ya están a salvo en la nube: sin aviso.
    let syncActivo = false;
    try { syncActivo = !!JSON.parse(localStorage.getItem('cryptoTrace.sync') || '{}').token; } catch {}
    if (compras.length === 0 || syncActivo) {
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
        const delta = comp.actual - comp.anterior;
        const flecha = comp.pct >= 0 ? '↑' : '↓';
        const rangoTxt = comp.esAnioActual ? 'hasta hoy' : 'año completo';
        const etiquetaDiff = delta >= 0 ? 'Invertido de más' : 'Invertido de menos';
        comparisonHtml = `
            <div class="stats-comparison">
                <div class="cmp-toplbl">Inversión acumulada · ${rangoTxt}</div>
                <div class="cmp-row cur"><span class="cmp-yr">${anioActivo}</span><span class="cmp-val">${formatMoney(comp.actual)}</span></div>
                <div class="cmp-row prev"><span class="cmp-yr">${comp.anioAnterior}</span><span class="cmp-val">${formatMoney(comp.anterior)}</span></div>
                <div class="cmp-divider"></div>
                <div class="cmp-row diff"><span class="cmp-yr">${etiquetaDiff}</span><span class="cmp-val">${formatMoney(Math.abs(delta))} <span class="cmp-pill">${flecha} ${Math.abs(Math.round(comp.pct))}%</span></span></div>
            </div>`;
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
                    <div class="asset-chip-top"><span class="asset-chip-name">${iconoActivo(moneda)}<strong>${escapeHtml(moneda)}</strong></span><span class="asset-chip-pct">${pct}%</span></div>
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
// SELECCIÓN RÁPIDA DE MONEDA (chips recurrentes + autocompletado)
// ==============================
function renderSeleccionRapida() {
    // Cuenta compras por moneda para ordenar por recurrencia.
    const conteo = new Map();
    compras.forEach((c) => {
        const m = (c.moneda || '').toUpperCase();
        if (m) conteo.set(m, (conteo.get(m) || 0) + 1);
    });

    if (conteo.size === 0) {
        coinQuick.style.display = 'none';
        coinQuickChips.innerHTML = '';
        coinDatalist.innerHTML = '';
        return;
    }

    // Datalist: todas las monedas conocidas (autocompletado al teclear).
    coinDatalist.innerHTML = [...conteo.keys()].sort()
        .map((m) => `<option value="${escapeHtml(m)}"></option>`).join('');

    // Chips: las más recurrentes primero (empate -> alfabético), top 8.
    const top = [...conteo.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([m]) => m);

    coinQuick.style.display = 'flex';
    coinQuickChips.innerHTML = top
        .map((m) => `<button type="button" class="coin-quick-chip" data-moneda="${escapeHtml(m)}">${iconoActivo(m)}<span>${escapeHtml(m)}</span></button>`)
        .join('');

    coinQuickChips.querySelectorAll('.coin-quick-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            inputMoneda.value = btn.dataset.moneda;
            // Salta al importe para seguir metiendo la compra sin buscar el campo.
            document.getElementById('input-euros').focus();
        });
    });
}

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
        fila.cells[1].innerHTML = `<span class="coin-cell">${iconoActivo(c.moneda)}<strong>${escapeHtml(c.moneda)}</strong></span>`;
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
    renderSeleccionRapida();
    refrescarLogosSiHaceFalta();
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

function parsearCsv(texto) {
    const lineas = texto.trim().split(/\r?\n/).filter(l => l.trim() !== '');
    if (lineas.length === 0) return [];
    const cabeceras = lineas[0].split(',').map(h => h.trim().toLowerCase());
    const idx = {
        fecha: cabeceras.indexOf('fecha'),
        moneda: cabeceras.indexOf('moneda'),
        eur: cabeceras.indexOf('euros'),
        comision: cabeceras.indexOf('comision'),
        cantidad: cabeceras.indexOf('cantidad')
    };
    const filas = lineas.slice(1).map(linea => {
        const valores = linea.split(',');
        const compra = { fecha: '', moneda: '', eur: 0, comision: 0, cantidad: 0 };
        if (idx.fecha >= 0) compra.fecha = (valores[idx.fecha] || '').trim();
        if (idx.moneda >= 0) compra.moneda = (valores[idx.moneda] || '').trim();
        if (idx.eur >= 0) compra.eur = parseFloat(valores[idx.eur]) || 0;
        if (idx.comision >= 0) compra.comision = parseFloat(valores[idx.comision]) || 0;
        if (idx.cantidad >= 0) compra.cantidad = parseFloat(valores[idx.cantidad]) || 0;
        return compra;
    });
    // Un CSV válido debe tener cabeceras reconocidas
    if (idx.fecha < 0 && idx.eur < 0) throw new Error('CSV inválido');
    return filas;
}

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
            const nombre = (file.name || '').toLowerCase();
            const esCsv = nombre.endsWith('.csv');
            const importedData = esCsv
                ? parsearCsv(e.target.result)
                : JSON.parse(e.target.result);
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
            alert("Error leyendo el archivo ❌");
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

// ==============================
// SYNC ENTRE DISPOSITIVOS (Gist privado de GitHub)
// ==============================
// El "perfil" = un token de GitHub (solo permiso gists) guardado en ESTE
// navegador. Tus compras viven en un gist privado y se sincronizan solas.
// Usa un archivo distinto al del portafolio para no colisionar con el mismo token.
const SYNC_KEY = 'cryptoTrace.sync';
const GIST_FILE = 'crypto-trace.json';
let pushTimer = null;

const getSync = () => {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; }
    catch { return {}; }
};
const setSync = (obj) => localStorage.setItem(SYNC_KEY, JSON.stringify(obj));
const syncEnabled = () => !!getSync().token;
const gistHeaders = (token) => ({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
});

// Estado que viaja al gist (mismo dato que el export JSON: las compras).
function buildSyncState() {
    return {
        schema: 'crypto-trace', version: 1,
        exportedAt: new Date().toISOString(),
        updatedAt: storeVersion,   // gana el más reciente al resolver conflictos
        compras,
    };
}

// Aplica un estado bajado del gist SIN volver a empujarlo (evita ping-pong).
function applyRemote(data) {
    if (!data || !Array.isArray(data.compras)) throw new Error('No es un backup de CryptoTrace (falta compras).');
    compras = data.compras;
    storeVersion = data.updatedAt || Date.now();
    localStorage.setItem('crypto_data', JSON.stringify(compras));
    localStorage.setItem('crypto_data_updated', String(storeVersion));
}

function updateSyncStatus(kind, msg) {
    const el = document.getElementById('sync-status');
    if (el) {
        const cfg = getSync();
        const when = cfg.lastSync ? new Date(cfg.lastSync).toLocaleTimeString('es-ES') : '';
        el.className = `sync-status ${kind}`;
        el.textContent = kind === 'ok' ? `Sincronizado ${when ? '· ' + when : ''}`
            : kind === 'error' ? `Error de sync: ${msg || ''}`
            : kind === 'working' ? 'Sincronizando…'
            : '';
    }
    const dot = document.getElementById('sync-btn');
    if (dot) dot.classList.toggle('sync-on', syncEnabled());
}

function syncSchedulePush() {
    if (!syncEnabled()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { syncPush(); }, 1500);
}

async function syncPush() {
    const cfg = getSync();
    if (!cfg.token) return;
    updateSyncStatus('working');
    const content = JSON.stringify(buildSyncState(), null, 2);
    try {
        const url = cfg.gistId ? `https://api.github.com/gists/${cfg.gistId}` : 'https://api.github.com/gists';
        const res = await fetch(url, {
            method: cfg.gistId ? 'PATCH' : 'POST',
            headers: gistHeaders(cfg.token),
            body: JSON.stringify({
                description: 'CryptoTrace (sync)', public: false,
                files: { [GIST_FILE]: { content } },
            }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const gist = await res.json();
        setSync({ ...cfg, gistId: gist.id, lastSync: Date.now() });
        updateSyncStatus('ok');
    } catch (e) {
        updateSyncStatus('error', e.message);
    }
}

async function syncPull() {
    const cfg = getSync();
    if (!cfg.token || !cfg.gistId) return;
    updateSyncStatus('working');
    try {
        const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, { headers: gistHeaders(cfg.token) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const gist = await res.json();
        const file = gist.files?.[GIST_FILE];
        if (!file) { updateSyncStatus('ok'); return; }
        const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
        const data = JSON.parse(content);
        if ((data.updatedAt || 0) > storeVersion) {
            applyRemote(data);
            anioActivo = 'todos';
            render();
        }
        setSync({ ...cfg, lastSync: Date.now() });
        updateSyncStatus('ok');
    } catch (e) {
        updateSyncStatus('error', e.message);
    }
}

// Conectar: guarda el token, busca un gist existente con nuestro archivo
// (para enganchar un segundo dispositivo) o crea uno nuevo con lo local.
async function syncConnect(token) {
    setSync({ token, gistId: null });
    updateSyncStatus('working');
    try {
        const res = await fetch('https://api.github.com/gists?per_page=100', { headers: gistHeaders(token) });
        if (res.status === 401) throw new Error('Token inválido (401).');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const gists = await res.json();
        const found = gists.find(g => g.files && g.files[GIST_FILE]);
        if (found) {
            setSync({ token, gistId: found.id });
            await syncPull();          // ya había datos en la nube → los bajamos
        } else {
            // Primer dispositivo: sello una versión real para que el segundo la baje.
            if (!storeVersion) {
                storeVersion = Date.now();
                localStorage.setItem('crypto_data_updated', String(storeVersion));
            }
            await syncPush();
        }
        return true;
    } catch (e) {
        updateSyncStatus('error', e.message);
        throw e;
    }
}

function syncDisconnect() {
    localStorage.removeItem(SYNC_KEY);
    clearTimeout(pushTimer);
    updateSyncStatus('');
}

function openSyncModal() {
    const cfg = getSync();
    const connected = !!cfg.token;
    const ov = document.createElement('div');
    ov.className = 'sync-ov';
    ov.innerHTML = `
        <div class="sync-box">
            <div class="sync-head">
                <h3>Sincronización entre dispositivos</h3>
                <button type="button" class="sync-x" aria-label="Cerrar">&times;</button>
            </div>
            <p class="sync-desc">Guarda tus compras en un <strong>gist privado</strong> de GitHub para tenerlas iguales en todos tus dispositivos. Necesitas un token con permiso <strong>solo de gists</strong>. <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">Crear token</a>.</p>
            ${connected ? `
                <div id="sync-status" class="sync-status ok"></div>
                <div class="sync-actions">
                    <button type="button" id="sync-now-btn" class="sync-primary">Sincronizar ahora</button>
                    <button type="button" id="sync-disconnect-btn" class="sync-secondary">Desconectar</button>
                </div>
            ` : `
                <label class="sync-label">Token de GitHub</label>
                <input type="password" id="sync-token" placeholder="ghp_..." autocomplete="off" class="sync-input">
                <div id="sync-status" class="sync-status"></div>
                <div class="sync-actions">
                    <button type="button" id="sync-connect-btn" class="sync-primary">Conectar</button>
                    <button type="button" class="sync-secondary sync-x">Cancelar</button>
                </div>
            `}
        </div>`;
    document.body.appendChild(ov);
    updateSyncStatus(connected ? 'ok' : '');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => {
        if (e.target === ov || e.target.closest('.sync-x')) close();
    });
    const connectBtn = ov.querySelector('#sync-connect-btn');
    if (connectBtn) connectBtn.addEventListener('click', async () => {
        const token = ov.querySelector('#sync-token').value.trim();
        if (!token) { updateSyncStatus('error', 'Pega tu token.'); return; }
        try { await syncConnect(token); close(); openSyncModal(); }
        catch { /* el estado ya muestra el error */ }
    });
    const nowBtn = ov.querySelector('#sync-now-btn');
    if (nowBtn) nowBtn.addEventListener('click', async () => { await syncPull(); await syncPush(); });
    const disconnectBtn = ov.querySelector('#sync-disconnect-btn');
    if (disconnectBtn) disconnectBtn.addEventListener('click', () => { syncDisconnect(); close(); });
}

const syncBtnEl = document.getElementById('sync-btn');
if (syncBtnEl) syncBtnEl.addEventListener('click', openSyncModal);
updateSyncStatus(syncEnabled() ? 'ok' : '');
if (syncEnabled()) syncPull();   // al arrancar, baja lo último de la nube
