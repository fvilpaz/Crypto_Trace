// ==============================
// CONFIGURACIÓN DE API
// ==============================
// Tu clave API activa
const API_KEY = '5e1be3db14885125382b9d17'; 
const API_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/EUR`;

// ==============================
// CONFIGURACIÓN INICIAL Y CARGA DE DATOS
// ==============================
let compras = JSON.parse(localStorage.getItem('crypto_data')) || [];
let enUSD = false;
let tasaCambioReal = 1.0; // Se actualizará con la API

// ==============================
// REFERENCIAS AL DOM
// ==============================
const form = document.getElementById('crypto-form');
const tableBody = document.getElementById('table-body');
const toggleCurrency = document.getElementById('currency-toggle');
const totalDisplay = document.getElementById('total-general');
const themeBtn = document.getElementById('theme-toggle');
const exportBtn = document.getElementById('export-json');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-json');

// ==============================
// FUNCIÓN PARA OBTENER TASA EN TIEMPO REAL
// ==============================
async function obtenerTasaReal() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        if (data.result === "success") {
            tasaCambioReal = data.conversion_rates.USD;
            console.log(`Tasa actualizada: 1 EUR = ${tasaCambioReal} USD`);
            render(); // Actualizamos la vista con la tasa nueva
        }
    } catch (error) {
        console.error("Error conectando con la API:", error);
    }
}

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
// FORMATEO DE MONEDA CON TASA REAL
// ==============================
function formatMoney(valor) {
    if (isNaN(valor)) valor = 0;
    // Usamos la tasaCambioReal obtenida de la API
    const finalVal = enUSD ? valor * tasaCambioReal : valor;
    
    return finalVal.toLocaleString('es-ES', { 
        style: 'currency', 
        currency: enUSD ? 'USD' : 'EUR' 
    });
}

// ==============================
// RENDER TABLA (SEGURO)
// ==============================
function render() {
    tableBody.innerHTML = '';
    let totalEur = 0;

    compras.forEach((c, index) => {
        totalEur += c.eur; 
        const precioUnitario = c.cantidad > 0 ? (c.eur / c.cantidad) : 0;

        const fila = document.createElement('tr');
        
        // SEGURIDAD: Uso de textContent para prevenir XSS
        fila.innerHTML = `
            <td></td>
            <td><strong></strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;
        
        fila.cells[0].textContent = c.fecha;
        fila.cells[1].textContent = c.moneda;
        fila.cells[2].textContent = formatMoney(c.eur);
        fila.cells[3].textContent = c.cantidad.toFixed(6);
        fila.cells[4].textContent = formatMoney(precioUnitario);
        
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-delete';
        btnDelete.textContent = '🗑️';
        btnDelete.onclick = () => borrarCompra(index);
        fila.cells[5].appendChild(btnDelete);

        tableBody.appendChild(fila);
    });

    totalDisplay.textContent = formatMoney(totalEur);
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
// EXPORTAR/IMPORTAR JSON
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
obtenerTasaReal(); // Llamamos a la API al abrir
render(); // Render inicial
