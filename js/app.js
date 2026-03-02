// Configuración inicial y carga de datos
let compras = JSON.parse(localStorage.getItem('crypto_data')) || [];
let enUSD = false;
const TIPO_CAMBIO = 1.09; // Simulación: 1 EUR = 1.09 USD

// Referencias al DOM
const form = document.getElementById('crypto-form');
const tableBody = document.getElementById('table-body');
const toggleCurrency = document.getElementById('currency-toggle');
const totalDisplay = document.getElementById('total-general');
const themeBtn = document.getElementById('theme-toggle');

// 1. Lógica de Dark Mode
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('dark_mode', document.body.classList.contains('dark-theme'));
});

// Comprobar preferencia de tema al cargar
if (localStorage.getItem('dark_mode') === 'true') {
    document.body.classList.add('dark-theme');
}

// 2. Función para formatear el dinero según la moneda seleccionada
function formatMoney(valor) {
    const finalVal = enUSD ? valor * TIPO_CAMBIO : valor;
    const simbolo = enUSD ? '$' : '€';
    return finalVal.toLocaleString('es-ES', { 
        style: 'currency', 
        currency: enUSD ? 'USD' : 'EUR' 
    });
}

// 3. Función principal para dibujar la tabla
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

// 4. Añadir nueva compra
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

// 5. Borrar compra
window.borrarCompra = function(index) {
    if (confirm('¿Deseas eliminar este registro?')) {
        compras.splice(index, 1);
        localStorage.setItem('crypto_data', JSON.stringify(compras));
        render();
    }
};

// 6. Toggle de Moneda
toggleCurrency.addEventListener('change', () => {
    enUSD = toggleCurrency.checked;
    render();
});

// Inicialización
render();
