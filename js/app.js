// ==============================
// CONFIGURACIÓN DE API
// ==============================
const API_KEY = '5e1be3db14885125382b9d17'; 
const API_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/EUR`;

// ==============================
// CONFIGURACIÓN INICIAL
// ==============================
let compras = JSON.parse(localStorage.getItem('crypto_data')) || [];
let enUSD = false;
let tasaCambioReal = 1.0; 
let editandoIndex = -1; // -1 significa que no estamos editando

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
const btnSubmit = form.querySelector('button[type="submit"]');
const btnCancelar = document.getElementById('btn-cancelar');

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
            render(); 
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
    const finalVal = enUSD ? valor * tasaCambioReal : valor;
    
    return finalVal.toLocaleString('es-ES', { 
        style: 'currency', 
        currency: enUSD ? 'USD' : 'EUR' 
    });
}

// ==============================
// RENDER TABLA (CON EDITAR Y BORRAR)
// ==============================
function render() {
    tableBody.innerHTML = '';
    let totalEur = 0;

    compras.forEach((c, index) => {
        totalEur += c.eur; 
        const precioUnitario = c.cantidad > 0 ? (c.eur / c.cantidad) : 0;

        const fila = document.createElement('tr');
        
        fila.innerHTML = `
            <td></td>
            <td><strong></strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td class="action-cells"></td>
        `;
        
        fila.cells[0].textContent = c.fecha;
        fila.cells[1].textContent = c.moneda;
        fila.cells[2].textContent = formatMoney(c.eur);
        fila.cells[3].textContent = parseFloat(c.cantidad).toFixed(6);
        fila.cells[4].textContent = formatMoney(precioUnitario);
        
        // --- BOTONES ACCIONES ---
        const actionsContainer = fila.cells[5];
        
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

    totalDisplay.textContent = formatMoney(totalEur);
}

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
form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const nuevaCompra = {
        fecha: document.getElementById('input-fecha').value,
        moneda: document.getElementById('input-moneda').value.toUpperCase(),
        eur: parseFloat(document.getElementById('input-euros').value),
        cantidad: parseFloat(document.getElementById('input-cantidad').value)
    };

    if (editandoIndex === -1) {
        // Modo Añadir
        compras.push(nuevaCompra);
    } else {
        // Modo Editar
        compras[editandoIndex] = nuevaCompra;
        cancelarEdicion();
    }
    
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
        if (editandoIndex === index) cancelarEdicion(); // Si borras lo que editas, cancela
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
obtenerTasaReal(); 
render();
