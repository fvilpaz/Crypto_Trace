// Pruebas de la sincronización con el gist. Sin dependencias: `node --test tests/`
// Carga el js/app.js REAL en una página falsa (DOM que lo traga todo, localStorage
// en memoria) contra un gist falso al que se le puede cortar la red.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODIGO = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const ARCHIVO = 'crypto-trace.json';
const COMPRA_1 = { fecha: '2026-01-10', moneda: 'BTC', eur: 100, comision: 1, cantidad: 0.001 };
const COMPRA_2 = { fecha: '2026-02-20', moneda: 'ETH', eur: 50, comision: 0.5, cantidad: 0.02 };

// Elemento falso: recuerda lo que se le asigna y devuelve otro falso para lo demás.
function nodoFalso() {
    const props = Object.create(null);
    const nodo = new Proxy(function () {}, {
        get(_, k) {
            if (k in props) return props[k];
            if (k === Symbol.toPrimitive) return () => '';
            if (k === Symbol.iterator) return function* () {};
            if (k === 'then') return undefined;
            if (k === 'length') return 0;
            return nodo;
        },
        set(_, k, v) { props[k] = v; return true; },
        apply() { return nodo; },
    });
    return nodo;
}

// Gist falso: guarda lo último que se subió; con `conRed = false` las peticiones fallan.
function nubeFalsa(compras, updatedAt) {
    const nube = { conRed: true, contenido: JSON.stringify({ updatedAt, compras }) };
    nube.compras = () => JSON.parse(nube.contenido).compras;
    nube.fetch = async (url, opts = {}) => {
        if (!String(url).includes('api.github.com')) return { ok: false, status: 0, json: async () => ({}) };
        if (!nube.conRed) throw new TypeError('Failed to fetch');
        if (opts.method) nube.contenido = JSON.parse(opts.body).files[ARCHIVO].content;
        return { ok: true, status: 200, json: async () => ({ id: 'g1', files: { [ARCHIVO]: { content: nube.contenido } } }) };
    };
    return nube;
}

// Navegador de un aparato ya conectado al gist, con COMPRA_1 sincronizada.
function almacenConectado() {
    return new Map([
        ['cryptoTrace.sync', JSON.stringify({ token: 't', gistId: 'g1' })],
        ['crypto_data', JSON.stringify([COMPRA_1])],
        ['crypto_data_updated', '1000'],
    ]);
}

const reposo = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

// Abre la app (como abrir o recargar la pestaña) y espera a que termine el arranque.
async function abrirApp(almacen, nube) {
    const timers = new Map();
    let n = 0;
    const nodos = new Map();
    const porId = (id) => nodos.get(id) || nodos.set(id, nodoFalso()).get(id);
    const documento = nodoFalso();
    documento.getElementById = porId;
    const ctx = vm.createContext({
        document: documento, window: nodoFalso(), navigator: {},
        localStorage: {
            getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
            setItem: (k, v) => { almacen.set(k, String(v)); },
            removeItem: (k) => { almacen.delete(k); },
        },
        fetch: nube.fetch,
        setTimeout: (fn) => { timers.set(++n, fn); return n; },
        clearTimeout: (id) => { timers.delete(id); },
        console: { log() {}, warn() {}, error() {} },
        alert() {}, confirm: () => true,
    });
    vm.runInContext(CODIGO, ctx);
    await reposo();
    return {
        compras: () => JSON.parse(vm.runInContext('JSON.stringify(compras)', ctx)),
        indicador: () => porId('sync-indicator').textContent,
        async hacer(js) { vm.runInContext(js, ctx); await reposo(); },
        // Añade una compra como el formulario; la subida queda esperando sus 1,5 s.
        anadir(compra) { return this.hacer(`compras.push(${JSON.stringify(compra)}); guardarEstado();`); },
        async pasarTiempo() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await reposo(); },
        volverALaVentana() { return this.hacer('lastAutoPull = 0; autoPull();'); },
    };
}

test('control: sin nada pendiente, baja lo que cambió otro aparato', async () => {
    const nube = nubeFalsa([COMPRA_1], 1000);
    const app = await abrirApp(almacenConectado(), nube);
    nube.contenido = JSON.stringify({ updatedAt: 2000, compras: [COMPRA_1, COMPRA_2] });
    await app.volverALaVentana();
    assert.deepStrictEqual(app.compras(), [COMPRA_1, COMPRA_2]);
});

test('salir antes de que suba (1,5 s) y volver no pierde la compra', async () => {
    const nube = nubeFalsa([COMPRA_1], 1000);
    const app = await abrirApp(almacenConectado(), nube);
    await app.anadir(COMPRA_2);
    await app.volverALaVentana();
    await app.pasarTiempo();
    assert.deepStrictEqual(app.compras(), [COMPRA_1, COMPRA_2], 'en el aparato');
    assert.deepStrictEqual(nube.compras(), [COMPRA_1, COMPRA_2], 'en el gist');
});

test('una subida fallida (sin red) no se pierde al reabrir la app', async () => {
    const nube = nubeFalsa([COMPRA_1], 1000);
    const almacen = almacenConectado();
    const app = await abrirApp(almacen, nube);
    nube.conRed = false;
    await app.anadir(COMPRA_2);
    await app.pasarTiempo();
    nube.conRed = true;
    const reabierta = await abrirApp(almacen, nube);
    assert.deepStrictEqual(reabierta.compras(), [COMPRA_1, COMPRA_2], 'en el aparato');
    assert.deepStrictEqual(nube.compras(), [COMPRA_1, COMPRA_2], 'en el gist');
});

test('«Sincronizar ahora» no borra lo que estaba sin subir', async () => {
    const nube = nubeFalsa([COMPRA_1], 1000);
    const app = await abrirApp(almacenConectado(), nube);
    nube.conRed = false;
    await app.anadir(COMPRA_2);
    await app.pasarTiempo();
    nube.conRed = true;
    await app.hacer('syncPull(true).then(() => syncPush());');   // lo que hace el botón
    assert.deepStrictEqual(app.compras(), [COMPRA_1, COMPRA_2], 'en el aparato');
    assert.deepStrictEqual(nube.compras(), [COMPRA_1, COMPRA_2], 'en el gist');
});

test('el indicador no dice «Sincronizado» si la subida falló', async () => {
    const nube = nubeFalsa([COMPRA_1], 1000);
    const app = await abrirApp(almacenConectado(), nube);
    assert.strictEqual(app.indicador(), 'Sincronizado');
    nube.conRed = false;
    await app.anadir(COMPRA_2);
    await app.pasarTiempo();
    assert.notStrictEqual(app.indicador(), 'Sincronizado');
    nube.conRed = true;
    await app.volverALaVentana();
    assert.strictEqual(app.indicador(), 'Sincronizado');
});
