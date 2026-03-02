// ==============================
// CONFIGURACIÓN INICIAL Y CARGA DE DATOS
// ==============================
let compras = JSON.parse(localStorage.getItem('crypto_data')) || [];
let enUSD = false;
const TIPO_CAMBIO = 1.09; // Simulación: 1 EUR = 1.09 USD

// ==============================
// REFERENCIAS AL DOM
// ==============================
const form = document.getElementById('crypto-form');
const tableBody = document.getElementById('table-body');
const toggleCurrency = document.getElementById('currency-toggle');
const totalDisplay = document.getElementById('total-general');
const themeBtn = document.getElementById('theme-toggle');

// JSON Export/Import
const exportBtn = document.getElementById('export-json');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-json');

// ==============================
// DARK MODE
// ==============================
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark_mode', document.body.classList.contains('dark-theme'));
});

if (localStorage.getItem('dark_mode') === 'true') {
    document.body.classList.add('dark-theme');
}

// ==============================
// FORMATEO DE MONEDA
// ==============================
function formatMoney(valor) {
    const finalVal = enUSD ? valor * TIPO_CAMBIO : valor;
    return finalVal.toLocaleString('es-ES', { 
        style: 'currency', 
        currency: enUSD ? 'USD' : 'EUR' 
    });
}

// ==============================
// RENDER TABLA
// ==============================
function render() {
    tableBody.innerHTML = '';
    let totalEur = 0;

    compras.forEach((c, index) => {
        totalEur += c.eur;
        const precioUnitario = c.eur / c.cantidad;

        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${c.fecha}</td>
            <td><strong>${c.moneda}</strong></td>
            <td>${formatMoney(c.eur)}</td>
            <td>${c.cantidad.toFixed(6)}</td>
            <td>${formatMoney(precioUnitario)}</td>
            <td>
                <button class="btn-delete" onclick="borrarCompra(${index})">🗑️</button>
            </td>
        `;
        tableBody.appendChild(fila);
    });

    totalDisplay.innerText = formatMoney(totalEur);
}

// ==============================
// AÑADIR NUEVA COMPRA
// ==============================
form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const nuevaCompra = {
        fecha: document.getElementById('input-fecha').value,
        moneda: document.getElementById('input-moneda').value.toUpperCase(),
        eur: parseFloat(document.getElementById('input-euros').value),
        cantidad: parseFloat(document.getElementById('input-cantidad').value)
    };

    compras.push(nuevaCompra);
    localStorage.setItem('crypto_data', JSON.stringify(compras));
    form.reset();
    render();
});

// ==============================
// BORRAR COMPRA
// ==============================
window.borrarCompra = function(index) {
    if (confirm('¿Deseas eliminar este registro?')) {
        compras.splice(index, 1);
        localStorage.setItem('crypto_data', JSON.stringify(compras));
        render();
    }
};

// ==============================
// TOGGLE MONEDA
// ==============================
toggleCurrency.addEventListener('change', () => {
    enUSD = toggleCurrency.checked;
    render();
});

// ==============================
// EXPORTAR JSON
// ==============================
exportBtn.addEventListener('click', () => {
    const dataStr = JSON.stringify(compras, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "crypto_data.json";
    a.click();
    URL.revokeObjectURL(url);
});

// ==============================
// IMPORTAR JSON
// ==============================
importBtn.addEventListener('click', () => {
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
                compras = importedData;
                localStorage.setItem('crypto_data', JSON.stringify(compras));
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
});

// ==============================
// INICIALIZACIÓN
// ==============================
render();
