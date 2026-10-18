// Luka: tu plata real, con alguien que te avisa.
// Saldo = lo que entra − lo que gastas − lo que ahorras. Las tarjetas son las categorías de gasto.

const SUPABASE_URL = "https://nuotkljmwojymfcodgph.supabase.co";
const SUPABASE_KEY = "sb_publishable_L1ZV86fVmwvaHigXBEjADw_b67Tws9L";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = document.getElementById("app");

// Tarjetas con las que arranca cada persona, con opciones rápidas de descripción
const CATEGORIAS_BASE = [
  { nombre: "Comida", color: "#e2b13c", opciones: ["Almuerzo", "Desayuno", "Domicilio", "Mercado", "Snack", "Cena"] },
  { nombre: "Transporte", color: "#3f8f6b", opciones: ["Bus", "Gasolina", "Taxi", "Uber o DiDi", "Moto", "Parqueadero"] },
  { nombre: "Salidas", color: "#c4553b", opciones: ["Plan con amigos", "Salida con la novia", "Cine", "Rumba", "Comida afuera", "Partido"] },
  { nombre: "Compras", color: "#7a5bb5", opciones: ["Ropa", "Aseo personal", "Tecnología", "Regalo", "Cosas de la casa"] },
  { nombre: "Estudio", color: "#2a8fa8", opciones: ["Fotocopias", "Libros", "Útiles", "Curso", "Matrícula"] },
  { nombre: "Salud", color: "#b54a7f", opciones: ["Droguería", "Cita médica", "Gimnasio"] },
  { nombre: "Suscripciones", color: "#d9822b", opciones: ["Netflix", "Spotify", "Plan celular", "Internet", "Apps"] },
  { nombre: "Otros", color: "#5d7a2f", opciones: [] },
];
const COLOR_FIJOS = "#8a968f";
const COLORES_EXTRA = ["#1f8a8a", "#9a4fb5", "#b5762f", "#3f6fb5", "#6b8f2f", "#a8553f"];
const OPCIONES_INGRESO = ["Quincena", "Pago del trabajo", "Venta", "Mesada", "Regalo"];
const METODOS = ["Nequi", "Efectivo", "Tarjeta", "Daviplata", "Transferencia"];
const PAGOS_AL_MES = { mensual: 1, quincenal: 2, semanal: 52 / 12, variable: 1 };

// Letra clara u oscura según el color de la tarjeta
function letraDe(fondo = "#888888") {
  const h = fondo.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#1f1a0a" : "#ffffff";
}

const estado = {
  usuario: null,
  perfil: null,
  sobres: [],
  metas: [],
  fijos: [],
  deudas: [],
  movs: [],
  movimientos: [],
  saldo: 0,
  vista: "inicio",
  periodo: "hoy",
  bienvenida: null,
};

/* ---------- Utilidades ---------- */

const pesos = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n || 0)).toLocaleString("es-CO");
const corto = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString("es-CO") + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n)));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const redondear = (n) => Math.max(0, Math.round(n / 1000) * 1000);
const suma = (lista) => lista.reduce((t, m) => t + (m.monto || 0), 0);

// Entiende "480k", "480 mil", "1,5 millones", "1.2m", "480.000" o "480000"
function leerMonto(texto) {
  if (texto == null) return 0;
  let t = String(texto).toLowerCase().replace(/\$|\s/g, "");
  let multi = 1;
  if (/(millones|millon|millón|m)$/.test(t)) { multi = 1e6; t = t.replace(/(millones|millon|millón|m)$/, ""); }
  else if (/(mil|k|lucas|luca|lukas|luka)$/.test(t)) { multi = 1e3; t = t.replace(/(mil|k|lucas|luca|lukas|luka)$/, ""); }
  if (multi > 1) t = t.replace(",", ".");
  else t = t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * multi) : 0;
}

function toast(msj) {
  const t = document.getElementById("toast");
  t.textContent = msj;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3200);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_PLURAL = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

const hoy0 = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const sumaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const inicioDeMes = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const lunesDe = (d) => sumaDias(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
function fechaLocal(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const cuenta = (m) => m.origen !== "ajuste"; // los ajustes de saldo no cuentan en los resúmenes
const entre = (desde, hasta) => (m) => { const f = new Date(m.fecha); return f >= desde && f < hasta; };
const gastosEntre = (desde, hasta) => estado.movs.filter((m) => m.tipo === "gasto" && cuenta(m) && entre(desde, hasta)(m));
const ingresosEntre = (desde, hasta) => estado.movs.filter((m) => m.tipo === "ingreso" && cuenta(m) && entre(desde, hasta)(m));
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);

/* ---------- Datos ---------- */

async function cargarTodo() {
  const id = estado.usuario.id;
  const desde = new Date(Math.min(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), sumaDias(hoy0(), -56)));
  const [p, s, m, f, d, mv, sal] = await Promise.all([
    sb.from("perfiles").select("*").eq("id", id).maybeSingle(),
    sb.from("sobres").select("*").eq("archivado", false).neq("tipo", "ahorro").order("orden"),
    sb.from("metas").select("*").order("creado"),
    sb.from("gastos_fijos").select("*").eq("activo", true).order("dia_mes", { nullsFirst: false }),
    sb.from("deudas").select("*").order("fecha_limite", { nullsFirst: false }),
    sb.from("movimientos").select("*").gte("fecha", desde.toISOString()).order("fecha", { ascending: false }),
    sb.rpc("mi_saldo"),
  ]);
  const error = p.error || s.error || m.error || f.error || d.error || mv.error || sal.error;
  if (error) throw error;
  estado.perfil = p.data;
  estado.sobres = s.data;
  estado.metas = m.data;
  estado.fijos = f.data;
  estado.deudas = d.data;
  estado.movs = mv.data;
  estado.desde = desde;
  estado.movimientos = mv.data.filter(entre(inicioDeMes(), new Date(2999, 0)));
  estado.saldo = Number(sal.data) || 0;
}

const sobreDe = (id) => estado.sobres.find((s) => s.id === id);
const categorias = () => estado.sobres.filter((s) => s.tipo === "gasto" || s.tipo === "fijo");
const metaPorId = (id) => estado.metas.find((m) => m.id === id);
const metasActivas = () => estado.metas.filter((m) => !m.lograda);
const opcionesDe = (cat) => CATEGORIAS_BASE.find((c) => c.nombre === cat?.nombre)?.opciones || (cat?.tipo === "fijo" ? estado.fijos.map((f) => f.nombre) : []);

// Descripciones que la persona más usa en una tarjeta, más las de siempre
function descripcionesDe(cat) {
  const veces = {};
  for (const m of estado.movs) if (m.sobre_id === cat.id && m.descripcion) veces[m.descripcion] = (veces[m.descripcion] || 0) + 1;
  const usadas = Object.entries(veces).sort((a, b) => b[1] - a[1]).map(([d]) => d);
  return [...new Set([...usadas.slice(0, 4), ...opcionesDe(cat)])].slice(0, 8);
}

/* ---------- Cuentas del día ---------- */

// Próximo día de pago según cada cuánto le pagan
function proximoPago() {
  const p = estado.perfil, h = hoy0();
  const dias = (p.dias_pago || []).filter((x) => x != null);
  if (p.frecuencia === "semanal" && dias.length) {
    let d = sumaDias(h, 1);
    while (d.getDay() !== dias[0] % 7) d = sumaDias(d, 1);
    return d;
  }
  if ((p.frecuencia === "mensual" || p.frecuencia === "quincenal") && dias.length) {
    const candidatos = [];
    for (let k = 0; k < 2; k++) for (const dia of dias) {
      const fin = new Date(h.getFullYear(), h.getMonth() + k + 1, 0).getDate();
      candidatos.push(new Date(h.getFullYear(), h.getMonth() + k, Math.min(dia, fin)));
    }
    return candidatos.filter((d) => d > h).sort((a, b) => a - b)[0];
  }
  return new Date(h.getFullYear(), h.getMonth() + 1, 1);
}

// Fecha del próximo cobro de un gasto fijo (día del mes)
function proximoFijo(dia) {
  const h = hoy0();
  const fin = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
  let d = new Date(h.getFullYear(), h.getMonth(), Math.min(dia, fin));
  if (d < h) { const fin2 = new Date(h.getFullYear(), h.getMonth() + 2, 0).getDate(); d = new Date(h.getFullYear(), h.getMonth() + 1, Math.min(dia, fin2)); }
  return d;
}

function fijosPagados() {
  return new Set(estado.movimientos.filter((m) => m.tipo === "gasto").map((m) => m.descripcion));
}

// Cuánto puede gastar hoy: saldo real repartido hasta el próximo pago, sin los fijos que vienen antes
function planDelDia() {
  const h = hoy0(), pago = proximoPago();
  const dias = Math.max(1, Math.round((pago - h) / 864e5));
  const pagados = fijosPagados();
  const fijosAntes = estado.fijos.filter((f) => f.dia_mes && !pagados.has(f.nombre) && proximoFijo(f.dia_mes) < pago);
  const fijosPend = fijosAntes.reduce((t, f) => t + f.monto, 0);
  const gastadoHoy = suma(gastosEntre(h, sumaDias(h, 1)));
  const base = estado.saldo + gastadoHoy - fijosPend;
  const porDia = Math.max(0, Math.floor(base / dias / 50) * 50);
  return { pago, dias, fijosAntes, fijosPend, gastadoHoy, porDia, quedaHoy: porDia - gastadoHoy };
}

const cuandoTxt = (d) => {
  const n = Math.round((d - hoy0()) / 864e5);
  return n <= 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`;
};

/* ---------- Arranque y sesión ---------- */

sb.auth.onAuthStateChange((evento, sesion) => {
  if (evento === "PASSWORD_RECOVERY") { estado.recuperando = true; estado.usuario = sesion?.user || null; pintarNuevaClave(); return; }
  const antes = estado.usuario?.id;
  estado.usuario = sesion?.user || null;
  if (antes !== estado.usuario?.id) { estado.chat = null; estado.conexionGmail = undefined; estado.llaveGmail = null; }
  if (evento === "INITIAL_SESSION" || antes !== estado.usuario?.id) setTimeout(arrancar, 0);
});

async function arrancar() {
  if (estado.recuperando) return;
  if (!estado.usuario) { pintarEntrar(); return; }
  try {
    await cargarTodo();
  } catch (e) {
    app.innerHTML = `<section class="pantalla"><div class="aviso-error">No pude cargar tus datos. Revisa el internet y vuelve a abrir la app.</div><button class="boton" onclick="location.reload()">Intentar de nuevo</button></section>`;
    return;
  }
  if (!estado.perfil?.bienvenida_lista) empezarBienvenida();
  else pintarApp();
}

/* ---------- Entrar / crear cuenta ---------- */

function pintarEntrar(modo = "entrar", mensaje = "") {
  const crear = modo === "crear";
  app.innerHTML = `
  <section class="pantalla">
    <div class="entrar-cabeza">
      <span class="marca">Luka</span>
      <h1>Tu plata clara, con alguien que te avisa.</h1>
    </div>
    <div class="pestanas" role="tablist">
      <button role="tab" aria-selected="${!crear}" data-modo="entrar">Entrar</button>
      <button role="tab" aria-selected="${crear}" data-modo="crear">Crear cuenta</button>
    </div>
    <form id="form-entrar" class="opciones" novalidate>
      ${crear ? `<div class="campo"><label for="nombre">¿Cómo te llamas?</label><input id="nombre" autocomplete="given-name" required></div>` : ""}
      <div class="campo"><label for="correo">Correo</label><input id="correo" type="email" autocomplete="email" inputmode="email" required></div>
      <div class="campo"><label for="clave">Contraseña</label><input id="clave" type="password" autocomplete="${crear ? "new-password" : "current-password"}" minlength="6" required>
        ${crear ? `<span class="ayuda">Mínimo 6 caracteres.</span>` : ""}</div>
      ${mensaje ? `<div class="${mensaje.startsWith("✓") ? "nota" : "aviso-error"}">${esc(mensaje.replace(/^✓ /, ""))}</div>` : ""}
      <div class="acciones">
        <button class="boton" type="submit">${crear ? "Crear mi cuenta" : "Entrar"}</button>
        ${crear ? "" : `<button class="boton texto" type="button" id="olvide">Olvidé mi contraseña</button>`}
      </div>
    </form>
  </section>`;

  app.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => pintarEntrar(b.dataset.modo)));
  const olvide = document.getElementById("olvide");
  if (olvide) olvide.onclick = recuperarClave;

  document.getElementById("form-entrar").onsubmit = async (e) => {
    e.preventDefault();
    const correo = document.getElementById("correo").value.trim();
    const clave = document.getElementById("clave").value;
    const nombre = crear ? document.getElementById("nombre").value.trim() : "";
    if (crear && !nombre) return pintarEntrar(modo, "Escribe tu nombre.");
    if (!correo.includes("@")) return pintarEntrar(modo, "Ese correo no se ve bien.");
    if (clave.length < 6) return pintarEntrar(modo, "La contraseña necesita mínimo 6 caracteres.");
    const boton = e.submitter; boton.disabled = true; boton.textContent = "Un momento…";

    if (crear) {
      const { data, error } = await sb.auth.signUp({
        email: correo, password: clave,
        options: { data: { nombre }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) return pintarEntrar(modo, traducir(error));
      if (!data.session) return pintarEntrar("entrar", `✓ Listo, ${nombre}. Te mandé un correo a ${correo}: ábrelo y toca el enlace para activar la cuenta. Después entras aquí.`);
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
      if (error) return pintarEntrar(modo, traducir(error));
    }
  };
}

function traducir(error) {
  const m = (error.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("not confirmed")) return "Todavía no has activado la cuenta. Busca el correo de Luka (mira también en spam).";
  if (m.includes("already registered")) return "Ese correo ya tiene cuenta. Entra con él.";
  if (m.includes("rate limit") || m.includes("security purposes")) return "Muchos intentos seguidos. Espera unos minutos y vuelve a intentar.";
  if (m.includes("password")) return "La contraseña no sirve: usa mínimo 6 caracteres.";
  return "Algo falló: " + error.message;
}

async function recuperarClave() {
  const correo = document.getElementById("correo").value.trim();
  if (!correo.includes("@")) return pintarEntrar("entrar", "Escribe tu correo arriba y vuelve a tocar «Olvidé mi contraseña».");
  const { error } = await sb.auth.resetPasswordForEmail(correo, { redirectTo: location.origin + location.pathname });
  if (error) return pintarEntrar("entrar", traducir(error));
  pintarEntrar("entrar", `✓ Te mandé un correo a ${correo} para cambiar la contraseña.`);
}

function pintarNuevaClave(mensaje = "") {
  app.innerHTML = `
  <section class="pantalla">
    <h1>Nueva contraseña</h1>
    <form id="form-clave" class="opciones">
      <div class="campo"><label for="nueva">Escribe la nueva</label><input id="nueva" type="password" autocomplete="new-password" minlength="6" required></div>
      ${mensaje ? `<div class="aviso-error">${esc(mensaje)}</div>` : ""}
      <div class="acciones"><button class="boton" type="submit">Guardar</button></div>
    </form>
  </section>`;
  document.getElementById("form-clave").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: document.getElementById("nueva").value });
    if (error) return pintarNuevaClave(traducir(error));
    toast("Contraseña cambiada");
    estado.recuperando = false;
    arrancar();
  };
}

/* ---------- Bienvenida: 4 pasos ---------- */

const DIAS_DEFECTO = { mensual: [30], quincenal: [15, 30], semanal: [5], variable: [] };
const SUGERIDOS_FIJOS = ["Arriendo", "Plan celular", "Cuota moto", "Internet", "Servicios", "Netflix", "Spotify", "Gimnasio"];

function empezarBienvenida() {
  estado.bienvenida = {
    paso: 1,
    nombre: estado.perfil?.nombre || estado.usuario.user_metadata?.nombre || "",
    frecuencia: "quincenal",
    ingreso: 0,
    dias: [15, 30],
    fijos: [],
    meta: { nombre: "", objetivo: 0, ahorrado: 0, fecha: "", aporte: 0 },
    sinMeta: false,
    saldo: 0,
  };
  pintarBienvenida();
}

const ingresoMensual = (b) => Math.round(b.ingreso * PAGOS_AL_MES[b.frecuencia]);
const totalFijos = (b) => b.fijos.reduce((t, f) => t + (f.monto || 0), 0);

function puntos(paso) {
  return `<div class="puntos" aria-label="Paso ${paso} de 4">${[1, 2, 3, 4].map((i) => `<i class="${i === paso ? "on" : ""}"></i>`).join("")}</div>`;
}

function pintarBienvenida() {
  const b = estado.bienvenida;
  ({ 1: pasoPago, 2: pasoFijos, 3: pasoMeta, 4: pasoSaldo })[b.paso](b);
  window.scrollTo(0, 0);
}

// Selector de días de pago según la frecuencia
function selectorDias(b) {
  if (b.frecuencia === "variable") return "";
  if (b.frecuencia === "semanal") {
    return `<div class="campo"><span class="etiqueta">¿Qué día de la semana?</span><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="chip suave" data-dia-semana="${d}" aria-pressed="${b.dias[0] === d}">${DIAS[d][0].toUpperCase() + DIAS[d].slice(1, 3)}</button>`).join("")}</div></div>`;
  }
  const textos = b.dias.map((d, i) => `<input class="dia-pago" data-i="${i}" inputmode="numeric" value="${d}" aria-label="Día de pago ${i + 1}">`).join(b.frecuencia === "quincenal" ? `<span>y</span>` : "");
  return `<div class="campo"><span class="etiqueta">${b.frecuencia === "quincenal" ? "¿Qué días te pagan?" : "¿Qué día te pagan?"}</span><div class="fila-dias">${textos}<span class="sub">de cada mes</span></div></div>`;
}

function pasoPago(b) {
  const frecuencias = [
    ["quincenal", "Cada quincena", "Dos pagos al mes"],
    ["mensual", "Cada mes", "Un pago al mes"],
    ["semanal", "Cada semana", "Te pagan por semana"],
    ["variable", "Varía", "Independiente o por días"],
  ];
  app.innerHTML = `
  <section class="pantalla">
    <span class="paso">Paso 1 de 4</span>
    <h1>Hola${b.nombre ? ", " + esc(b.nombre) : ""}. ¿Cada cuánto te entra plata?</h1>
    <div class="opciones">
      ${frecuencias.map(([v, t, s]) => `<button type="button" class="opcion" aria-pressed="${b.frecuencia === v}" data-frec="${v}"><span>${t}<small>${s}</small></span><span class="bolita"></span></button>`).join("")}
    </div>
    ${selectorDias(b)}
    <div class="campo">
      <label for="ingreso">${b.frecuencia === "variable" ? "¿Cuánto te entra al mes, más o menos?" : "¿Cuánto te llega en cada pago, más o menos?"}</label>
      <input id="ingreso" class="grande" inputmode="decimal" placeholder="Ej: 480.000 o 480k" value="${b.ingreso ? pesos(b.ingreso) : ""}">
      <span class="ayuda">Puedes escribir 480k o 1,2 millones.</span>
    </div>
    <div class="acciones">${puntos(1)}<button class="boton" id="seguir">Seguir</button></div>
  </section>`;

  const input = document.getElementById("ingreso");
  const leer = () => { b.ingreso = leerMonto(input.value); app.querySelectorAll(".dia-pago").forEach((el) => (b.dias[+el.dataset.i] = Math.min(31, Math.max(1, parseInt(el.value, 10) || 1)))); };
  app.querySelectorAll("[data-frec]").forEach((el) => (el.onclick = () => { leer(); b.frecuencia = el.dataset.frec; b.dias = [...DIAS_DEFECTO[b.frecuencia]]; pasoPago(b); }));
  app.querySelectorAll("[data-dia-semana]").forEach((el) => (el.onclick = () => { leer(); b.dias = [+el.dataset.diaSemana]; pasoPago(b); }));
  input.onblur = () => { b.ingreso = leerMonto(input.value); if (b.ingreso) input.value = pesos(b.ingreso); };
  document.getElementById("seguir").onclick = () => {
    leer();
    if (!b.ingreso) { toast("Escribe cuánto te entra, aunque sea un aproximado."); input.focus(); return; }
    b.paso = 2; pintarBienvenida();
  };
}

function pasoFijos(b) {
  const usados = new Set(b.fijos.map((f) => f.nombre));
  app.innerHTML = `
  <section class="pantalla">
    <span class="paso">Paso 2 de 4</span>
    <h1>¿Qué pagas fijo todos los meses?</h1>
    <p class="sub">Arriendo, plan del celular, cuotas, suscripciones. Luka los aparta antes de decirte cuánto puedes gastar.</p>
    <div class="chips">${SUGERIDOS_FIJOS.filter((n) => !usados.has(n)).map((n) => `<button type="button" class="chip" data-sug="${n}">+ ${n}</button>`).join("")}<button type="button" class="chip" data-sug="">+ Otro</button></div>
    <div class="lista-fijos">
      ${b.fijos.map((f, i) => `
      <div class="fijo">
        <label>Qué<input data-i="${i}" data-k="nombre" value="${esc(f.nombre)}" placeholder="Ej: Arriendo"></label>
        <label>Cuánto<input data-i="${i}" data-k="monto" inputmode="decimal" value="${f.monto ? pesos(f.monto) : ""}" placeholder="$"></label>
        <label>Día<input data-i="${i}" data-k="dia" inputmode="numeric" value="${f.dia || ""}" placeholder="1-31"></label>
        <button type="button" class="quitar" data-quitar="${i}" aria-label="Quitar ${esc(f.nombre)}">×</button>
      </div>`).join("")}
    </div>
    ${b.fijos.length ? `<div class="total-linea"><span>Total fijos al mes</span><span class="num" id="total-fijos">${pesos(totalFijos(b))}</span></div>` : ""}
    <div class="acciones">
      ${puntos(2)}
      <button class="boton" id="seguir">${b.fijos.length ? "Seguir" : "No pago nada fijo, seguir"}</button>
      <button class="boton texto" id="atras">Atrás</button>
    </div>
  </section>`;

  app.querySelectorAll("[data-sug]").forEach((el) => (el.onclick = () => {
    b.fijos.push({ nombre: el.dataset.sug, monto: 0, dia: "" });
    pasoFijos(b);
    const inputs = app.querySelectorAll(`[data-i="${b.fijos.length - 1}"]`);
    (el.dataset.sug ? inputs[1] : inputs[0]).focus();
  }));
  app.querySelectorAll("[data-quitar]").forEach((el) => (el.onclick = () => { b.fijos.splice(+el.dataset.quitar, 1); pasoFijos(b); }));
  app.querySelectorAll(".fijo input").forEach((el) => {
    el.oninput = () => {
      const f = b.fijos[+el.dataset.i];
      if (el.dataset.k === "nombre") f.nombre = el.value;
      if (el.dataset.k === "monto") f.monto = leerMonto(el.value);
      if (el.dataset.k === "dia") f.dia = Math.min(31, Math.max(0, parseInt(el.value, 10) || 0)) || "";
      const t = document.getElementById("total-fijos");
      if (t) t.textContent = pesos(totalFijos(b));
    };
    if (el.dataset.k === "monto") el.onblur = () => { const f = b.fijos[+el.dataset.i]; if (f.monto) el.value = pesos(f.monto); };
  });
  document.getElementById("atras").onclick = () => { b.paso = 1; pintarBienvenida(); };
  document.getElementById("seguir").onclick = () => {
    b.fijos = b.fijos.filter((f) => f.nombre.trim() || f.monto);
    if (b.fijos.some((f) => !f.nombre.trim() || !f.monto)) { toast("A cada gasto fijo ponle nombre y cuánto."); pasoFijos(b); return; }
    b.paso = 3; pintarBienvenida();
  };
}

function pasoMeta(b) {
  const m = b.meta;
  const libre = Math.max(0, ingresoMensual(b) - totalFijos(b));
  if (!m.aporte) m.aporte = redondear(libre * 0.15);
  app.innerHTML = `
  <section class="pantalla">
    <span class="paso">Paso 3 de 4</span>
    <h1>¿Para qué quieres ahorrar?</h1>
    <p class="sub">Con una meta es más fácil no gastarse todo.</p>
    <div class="chips">${["Moto", "Viaje", "Celular nuevo", "Emergencias", "Estudio"].map((n) => `<button type="button" class="chip" data-meta="${n}">${n}</button>`).join("")}</div>
    <div class="campo"><label for="meta-nombre">Mi meta</label><input id="meta-nombre" value="${esc(m.nombre)}" placeholder="Ej: Moto"></div>
    <div class="fila">
      <div class="campo"><label for="meta-obj">¿Cuánto cuesta?</label><input id="meta-obj" inputmode="decimal" value="${m.objetivo ? pesos(m.objetivo) : ""}" placeholder="Ej: 4 millones"></div>
      <div class="campo"><label for="meta-ya">¿Ya tienes algo?</label><input id="meta-ya" inputmode="decimal" value="${m.ahorrado ? pesos(m.ahorrado) : ""}" placeholder="$0"></div>
    </div>
    <div class="campo"><label for="meta-aporte">¿Cuánto le quieres meter al mes?</label><input id="meta-aporte" inputmode="decimal" value="${m.aporte ? pesos(m.aporte) : ""}" placeholder="$0">
      <span class="ayuda" id="meta-ayuda"></span></div>
    <div class="acciones">
      ${puntos(3)}
      <button class="boton" id="seguir">Seguir</button>
      <button class="boton texto" id="sin-meta">Todavía no tengo meta</button>
      <button class="boton texto" id="atras">Atrás</button>
    </div>
  </section>`;

  const leer = () => {
    m.nombre = document.getElementById("meta-nombre").value.trim();
    m.objetivo = leerMonto(document.getElementById("meta-obj").value);
    m.ahorrado = leerMonto(document.getElementById("meta-ya").value);
    m.aporte = leerMonto(document.getElementById("meta-aporte").value);
  };
  const ayuda = () => {
    leer();
    const falta = m.objetivo - m.ahorrado;
    const el = document.getElementById("meta-ayuda");
    if (falta > 0 && m.aporte > 0) { const d = new Date(); d.setMonth(d.getMonth() + Math.ceil(falta / m.aporte)); el.textContent = `Así la logras en ${MESES[d.getMonth()]} de ${d.getFullYear()}.`; }
    else el.textContent = `Te recomiendo guardar el 15 % de lo que te sobra: ${pesos(redondear(libre * 0.15))}.`;
  };
  ["meta-obj", "meta-ya", "meta-aporte"].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("input", ayuda);
    el.onblur = () => { const n = leerMonto(el.value); if (n) el.value = pesos(n); };
  });
  ayuda();
  app.querySelectorAll("[data-meta]").forEach((el) => (el.onclick = () => { leer(); m.nombre = el.dataset.meta; pasoMeta(b); document.getElementById("meta-obj").focus(); }));
  document.getElementById("atras").onclick = () => { leer(); b.paso = 2; pintarBienvenida(); };
  document.getElementById("sin-meta").onclick = () => { leer(); b.sinMeta = true; b.paso = 4; pintarBienvenida(); };
  document.getElementById("seguir").onclick = () => {
    leer();
    if (!m.nombre || !m.objetivo) { toast("Ponle nombre y cuánto cuesta, o toca «Todavía no tengo meta»."); return; }
    if (m.ahorrado >= m.objetivo) { toast("Ya tienes lo de esa meta. ¡Ponte una más grande!"); return; }
    b.sinMeta = false; b.paso = 4; pintarBienvenida();
  };
}

function pasoSaldo(b) {
  app.innerHTML = `
  <section class="pantalla">
    <span class="paso">Paso 4 de 4</span>
    <h1>¿Cuánta plata tienes hoy?</h1>
    <p class="sub">Suma lo que tienes en Nequi, en el banco y en efectivo. Desde aquí Luka lleva tu saldo real.</p>
    <div class="campo"><label for="saldo">Tengo en total</label><input id="saldo" class="grande" inputmode="decimal" value="${b.saldo ? pesos(b.saldo) : ""}" placeholder="$0"></div>
    <div class="acciones">
      ${puntos(4)}
      <button class="boton" id="listo">Empezar</button>
      <button class="boton texto" id="atras">Atrás</button>
    </div>
  </section>`;
  const input = document.getElementById("saldo");
  input.onblur = () => { b.saldo = leerMonto(input.value); if (b.saldo) input.value = pesos(b.saldo); };
  document.getElementById("atras").onclick = () => { b.saldo = leerMonto(input.value); b.paso = 3; pintarBienvenida(); };
  document.getElementById("listo").onclick = (e) => { b.saldo = leerMonto(input.value); guardarBienvenida(b, e.currentTarget); };
}

async function guardarBienvenida(b, boton) {
  boton.disabled = true; boton.textContent = "Armando tu Luka…";
  try {
    const uid = estado.usuario.id;
    // Si quedó algo de un intento anterior, se limpia
    await sb.from("metas").delete().eq("user_id", uid);
    await sb.from("gastos_fijos").delete().eq("user_id", uid);
    await sb.from("sobres").delete().eq("user_id", uid);

    const filas = CATEGORIAS_BASE.map((c, i) => ({ nombre: c.nombre, tipo: "gasto", color: c.color, presupuesto: 0, orden: c.nombre === "Otros" ? 20 : i }));
    if (b.fijos.length) filas.push({ nombre: "Fijos", tipo: "fijo", color: COLOR_FIJOS, presupuesto: 0, orden: 10 });
    const { error: e1 } = await sb.from("sobres").insert(filas);
    if (e1) throw e1;
    if (b.fijos.length) {
      const { error } = await sb.from("gastos_fijos").insert(b.fijos.map((f) => ({ nombre: f.nombre.trim(), monto: f.monto, dia_mes: f.dia || null })));
      if (error) throw error;
    }
    if (!b.sinMeta) {
      const { error } = await sb.from("metas").insert({ nombre: b.meta.nombre, objetivo: b.meta.objetivo, ahorrado: b.meta.ahorrado, aporte_mensual: b.meta.aporte });
      if (error) throw error;
    }
    if (b.saldo > 0) {
      const { error } = await sb.from("movimientos").insert({ tipo: "ingreso", monto: b.saldo, descripcion: "Lo que tenía al empezar", origen: "ajuste" });
      if (error) throw error;
    }
    const { error: e2 } = await sb.from("perfiles").update({
      nombre: b.nombre, frecuencia: b.frecuencia, ingreso_por_pago: b.ingreso, dias_pago: b.dias, bienvenida_lista: true, saldo_listo: true,
    }).eq("id", uid);
    if (e2) throw e2;

    await cargarTodo();
    estado.vista = "inicio";
    pintarApp();
    toast("¡Listo! Anota cada gasto y Luka te va avisando.");
  } catch (e) {
    boton.disabled = false; boton.textContent = "Empezar";
    toast("No se pudo guardar. Revisa el internet e intenta otra vez.");
  }
}

/* ---------- Armazón: barra de abajo y pestañas ---------- */

const ICONOS = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>',
  tarjetas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="3"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>',
  movimientos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  metas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5" fill="currentColor"/></svg>',
};
// Íconos de las sugerencias
const SIMBOLOS = {
  ahorro: '<path d="M12 3v18M7 8h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"/>',
  calendario: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  sube: '<path d="M4 17l6-6 4 4 6-7M15 8h5v5"/>',
  baja: '<path d="M4 7l6 6 4-4 6 7M15 16h5v-5"/>',
  alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  hormiga: '<circle cx="8" cy="12" r="2.5"/><circle cx="14" cy="12" r="3"/><path d="M17 12h3M10 9l-2-3M14 9l1-3M10 15l-2 3M15 15l1 3"/>',
  lapiz: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  meta: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  bien: '<path d="M5 12l4 4 10-10"/>',
  billete: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
};
const simbolo = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SIMBOLOS[k]}</svg>`;

function barra() {
  const b = (v, t) => `<button data-vista="${v}" ${estado.vista === v || (v === "tarjetas" && ["tarjeta", "ajustar"].includes(estado.vista)) ? 'aria-current="page"' : ""}>${ICONOS[v]}${t}</button>`;
  return `<div class="barra"><nav aria-label="Secciones">${b("inicio", "Inicio")}${b("tarjetas", "Tarjetas")}<button class="luka" data-vista="luka" aria-label="Hablar con Luka" ${estado.vista === "luka" ? 'aria-current="page"' : ""}>L</button>${b("movimientos", "Movimientos")}${b("metas", "Metas")}</nav></div>`;
}

function pintarApp() {
  const vistas = {
    inicio: vistaInicio, tarjetas: vistaTarjetas, tarjeta: vistaTarjeta, ajustar: vistaAjustar,
    movimientos: vistaMovimientos, metas: vistaMetas, yo: vistaYo, luka: vistaLuka, gmail: vistaGmail,
  };
  if (!vistas[estado.vista]) estado.vista = "inicio";
  app.innerHTML = vistas[estado.vista]() + barra();
  app.querySelectorAll("[data-vista]").forEach((el) => (el.onclick = () => ir(el.dataset.vista)));
  app.querySelectorAll("[data-anotar]").forEach((el) => (el.onclick = () => abrirAnotar({ sobre_id: el.dataset.anotar || null, tipo: el.dataset.tipo })));
  enganches[estado.vista]?.();
}

function ir(vista, extra = {}) {
  Object.assign(estado, extra);
  estado.vista = vista;
  pintarApp();
  window.scrollTo(0, 0);
}

const enganches = {
  inicio: engancharInicio, tarjetas: engancharTarjetas, tarjeta: engancharTarjeta, ajustar: engancharAjustar,
  movimientos: engancharMovimientos, metas: engancharMetas, yo: engancharYo, luka: engancharLuka, gmail: engancharGmail,
};

/* ---------- Sugerencias con reglas fijas ---------- */

function sugerencias() {
  const h = hoy0(), ahora = new Date();
  const lista = [];
  const plan = planDelDia();
  const mesIni = inicioDeMes(), mesAntIni = new Date(h.getFullYear(), h.getMonth() - 1, 1);
  const finVentanaAnt = new Date(h.getFullYear(), h.getMonth() - 1, Math.min(h.getDate() + 1, new Date(h.getFullYear(), h.getMonth(), 0).getDate() + 1));

  if (!estado.perfil.saldo_listo) lista.push({ icono: "billete", tono: "verde", titulo: "¿Cuánta plata tienes?", texto: "Así calculo lo que puedes gastar", accion: "Poner saldo", data: 'data-poner-saldo="1"' });

  // Pagos que se vienen
  const pagados = fijosPagados();
  for (const f of estado.fijos.filter((x) => x.dia_mes && !pagados.has(x.nombre))) {
    const d = proximoFijo(f.dia_mes);
    if ((d - h) / 864e5 <= 3) lista.push({ icono: "calendario", tono: "amarillo", titulo: `${f.nombre} ${cuandoTxt(d)}`, texto: pesos(f.monto), accion: "Ya lo pagué", data: `data-pagar-fijo="${f.id}"` });
  }
  for (const d of estado.deudas.filter((x) => !x.pagada && x.fecha_limite)) {
    const f = new Date(d.fecha_limite + "T00:00:00");
    if ((f - h) / 864e5 <= 5) lista.push({ icono: "alerta", tono: "rojo", titulo: `Deuda: ${d.descripcion}`, texto: `${pesos(d.monto)} · vence ${cuandoTxt(f)}`, accion: "Pagar", data: `data-pagar-deuda="${d.id}"` });
  }

  // Ahorro inteligente: le entró plata y no ha guardado nada desde entonces
  const meta = metasActivas()[0];
  const ingreso = estado.movs.find((m) => m.tipo === "ingreso" && cuenta(m));
  if (meta && ingreso && (ahora - new Date(ingreso.fecha)) / 864e5 <= 3 && !estado.movs.some((m) => m.tipo === "abono" && new Date(m.fecha) >= new Date(ingreso.fecha))) {
    const porPago = meta.aporte_mensual ? meta.aporte_mensual / PAGOS_AL_MES[estado.perfil.frecuencia] : ingreso.monto * 0.15;
    const guardar = Math.min(redondear(porPago), meta.objetivo - meta.ahorrado, Math.max(0, redondear(estado.saldo * 0.5)));
    if (guardar >= 1000) lista.push({ icono: "ahorro", tono: "verde", titulo: `Guarda ${pesos(guardar)}`, texto: `para ${meta.nombre}`, accion: "Guardar", data: `data-guardar="${meta.id}:${guardar}"` });
  }

  if (plan.quedaHoy < 0) lista.push({ icono: "alerta", tono: "rojo", titulo: `Hoy te pasaste ${pesos(-plan.quedaHoy)}`, texto: "Mañana tendrás un poco menos" });

  // Tarjetas que suben o bajan contra el mes pasado a esta misma fecha
  const comp = categorias().map((c) => {
    const este = suma(gastosEntre(mesIni, sumaDias(h, 1)).filter((m) => m.sobre_id === c.id));
    const antes = suma(gastosEntre(mesAntIni, finVentanaAnt).filter((m) => m.sobre_id === c.id));
    return { c, este, antes, dif: este - antes };
  });
  const sube = comp.filter((x) => x.este >= 20000 && x.antes > 0 && x.este >= x.antes * 1.25).sort((a, b) => b.dif - a.dif)[0];
  if (sube) lista.push({ icono: "sube", tono: "rojo", titulo: `${sube.c.nombre} ↑${pct(sube.este, sube.antes)} %`, texto: "vs. el mes pasado a esta fecha", data: `data-ir-tarjeta="${sube.c.id}"` });
  const baja = comp.filter((x) => x.antes >= 20000 && x.este <= x.antes * 0.75).sort((a, b) => a.dif - b.dif)[0];
  if (baja) lista.push({ icono: "baja", tono: "verde", titulo: `${baja.c.nombre} ↓${-pct(baja.este, baja.antes)} %`, texto: "¡Vas mejor que el mes pasado!", data: `data-ir-tarjeta="${baja.c.id}"` });

  // Topes
  for (const c of categorias().filter((x) => x.presupuesto > 0)) {
    const g = suma(gastosEntre(mesIni, sumaDias(h, 1)).filter((m) => m.sobre_id === c.id));
    if (g >= c.presupuesto * 0.8) lista.push({ icono: "alerta", tono: g > c.presupuesto ? "rojo" : "amarillo", titulo: `${c.nombre} al ${Math.round((g / c.presupuesto) * 100)} %`, texto: `de tu tope de ${pesos(c.presupuesto)}`, data: `data-ir-tarjeta="${c.id}"` });
  }

  // Gastos hormiga
  const hormiga = estado.movimientos.filter((m) => m.tipo === "gasto" && cuenta(m) && m.monto <= 10000);
  if (hormiga.length >= 6) lista.push({ icono: "hormiga", tono: "amarillo", titulo: `Gastos hormiga: ${pesos(suma(hormiga))}`, texto: `${hormiga.length} gastos pequeños este mes` });

  // El día de la semana más caro (con al menos 3 semanas de datos)
  const gastos8 = gastosEntre(sumaDias(h, -56), sumaDias(h, 1));
  if (gastos8.length >= 10 && (h - new Date(gastos8[gastos8.length - 1].fecha)) / 864e5 >= 21) {
    const porDiaSem = [0, 0, 0, 0, 0, 0, 0];
    gastos8.forEach((m) => (porDiaSem[new Date(m.fecha).getDay()] += m.monto));
    const max = Math.max(...porDiaSem), prom = porDiaSem.reduce((a, b) => a + b, 0) / 7;
    if (max >= prom * 1.6) { const d = porDiaSem.indexOf(max); lista.push({ icono: "calendario", tono: "amarillo", titulo: `Los ${DIAS_PLURAL[d]} gastas más`, texto: "Ojo ese día" }); }
  }

  // Meta casi lista
  for (const m of metasActivas()) if (m.ahorrado >= m.objetivo * 0.9) lista.push({ icono: "meta", tono: "verde", titulo: `¡Casi logras ${m.nombre}!`, texto: `Te faltan ${pesos(Math.max(0, m.objetivo - m.ahorrado))}`, data: 'data-vista="metas"' });

  // No ha anotado nada hoy
  if (ahora.getHours() >= 17 && !estado.movs.some((m) => new Date(m.creado) >= h && cuenta(m))) lista.push({ icono: "lapiz", tono: "verde", titulo: "¿Qué gastaste hoy?", texto: "Cuéntale a Luka", data: 'data-vista="luka"' });

  if (!lista.length) lista.push(estado.movs.some(cuenta)
    ? { icono: "bien", tono: "verde", titulo: "Vas bien", texto: "Sigue anotando y te doy más consejos" }
    : { icono: "lapiz", tono: "verde", titulo: "Anota tu primer gasto", texto: "Toca «Gasto» o háblale a Luka" });
  return lista.slice(0, 6);
}

/* ---------- Inicio ---------- */

function anillo(valor, total, color) {
  const r = 30, c = 2 * Math.PI * r;
  const p = total > 0 ? Math.min(1, Math.max(0, valor / total)) : valor > 0 ? 1 : 0;
  return `<svg class="anillo" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="8"/><circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 36 36)"/></svg>`;
}

function mini(m) {
  const c = sobreDe(m.sobre_id);
  const color = m.tipo === "ingreso" ? "var(--verde)" : c?.color || "#c9d3cd";
  return `<div class="mini-mov"><i style="background:${color}"></i><span>${esc(m.descripcion || c?.nombre || "Ingreso")}</span><b class="num ${m.tipo === "ingreso" ? "entra" : ""}">${m.tipo === "ingreso" ? "+" : "−"}${pesos(m.monto)}</b></div>`;
}

function resumenHoy() {
  const h = hoy0(), man = sumaDias(h, 1);
  const g = gastosEntre(h, man), i = ingresosEntre(h, man);
  return `
    <div class="baldosas">
      <div class="baldosa"><span>Gastaste</span><b class="num">${pesos(suma(g))}</b></div>
      <div class="baldosa"><span>Te entró</span><b class="num entra">${pesos(suma(i))}</b></div>
    </div>
    ${[...i, ...g].length ? `<div class="minis">${[...i, ...g].slice(0, 5).map(mini).join("")}</div>` : `<p class="sub centro">Nada anotado hoy.</p>`}`;
}

function resumenSemana() {
  const h = hoy0(), lun = lunesDe(h);
  const dias = [...Array(7)].map((_, k) => { const d = sumaDias(lun, k); return { d, total: suma(gastosEntre(d, sumaDias(d, 1))) }; });
  const max = Math.max(1, ...dias.map((x) => x.total));
  const total = dias.reduce((t, x) => t + x.total, 0);
  const diasPasados = Math.round((h - lun) / 864e5) + 1;
  const antes = suma(gastosEntre(sumaDias(lun, -7), sumaDias(lun, -7 + diasPasados)));
  const p = pct(total, antes);
  return `
    <div class="barras" role="img" aria-label="Gastos de esta semana por día">
      ${dias.map((x) => `<div class="barra-dia ${x.d.getTime() === h.getTime() ? "hoy" : x.d > h ? "futuro" : ""}">
        <span class="valor">${x.total ? corto(x.total) : ""}</span>
        <i style="height:${Math.max(4, (x.total / max) * 100)}%"></i>
        <span class="dia">${"DLMMJVS"[x.d.getDay()]}</span></div>`).join("")}
    </div>
    <div class="baldosas">
      <div class="baldosa"><span>Esta semana</span><b class="num">${pesos(total)}</b></div>
      <div class="baldosa"><span>vs. semana pasada</span><b class="num ${antes ? (p > 0 ? "sube" : "entra") : ""}">${antes ? (p > 0 ? "↑" : "↓") + Math.abs(p) + " %" : "—"}</b></div>
    </div>`;
}

function resumenMes() {
  const h = hoy0(), ini = inicioDeMes(), man = sumaDias(h, 1);
  const g = gastosEntre(ini, man), i = ingresosEntre(ini, man);
  const ahorro = suma(estado.movs.filter((m) => m.tipo === "abono" && entre(ini, man)(m))) - suma(estado.movs.filter((m) => m.tipo === "retiro" && entre(ini, man)(m)));
  const porCat = categorias().map((c) => ({ c, total: suma(g.filter((m) => m.sobre_id === c.id)) })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  const gastado = suma(g);
  const antes = suma(gastosEntre(new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth() - 1, h.getDate() + 1)));
  const p = pct(gastado, antes);
  return `
    <div class="baldosas tres">
      <div class="baldosa"><span>Entró</span><b class="num entra">${pesos(suma(i))}</b></div>
      <div class="baldosa"><span>Gastaste</span><b class="num">${pesos(gastado)}</b></div>
      <div class="baldosa"><span>Ahorraste</span><b class="num">${pesos(ahorro)}</b></div>
    </div>
    ${porCat.length ? `<div class="cats">${porCat.slice(0, 5).map((x) => `
      <button class="cat-fila" data-ir-tarjeta="${x.c.id}"><span class="cat-nom"><i style="background:${x.c.color}"></i>${esc(x.c.nombre)}</span><span class="num">${pesos(x.total)}</span>
        <span class="cat-barra"><i style="width:${Math.round((x.total / porCat[0].total) * 100)}%;background:${x.c.color}"></i></span></button>`).join("")}</div>` : `<p class="sub centro">Todavía no hay gastos este mes.</p>`}
    ${antes ? `<p class="comparar ${p > 0 ? "sube" : "entra"}">${p > 0 ? "↑" : "↓"} ${Math.abs(p)} % vs. ${MESES[(h.getMonth() + 11) % 12]} a esta fecha</p>` : ""}`;
}

function vistaInicio() {
  const d = new Date();
  const nombre = estado.perfil?.nombre?.split(" ")[0] || "";
  const plan = planDelDia();
  const etiqueta = plan.quedaHoy < 0 ? "Hoy te pasaste" : plan.gastadoHoy ? "Hoy te quedan" : "Hoy puedes gastar";
  const sugs = sugerencias();
  const metas = metasActivas().slice(0, 3);
  const periodos = [["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"]];
  return `
  <section class="pantalla inicio home">
    <header class="home-cab">
      <div><span class="saludo">Hola${nombre ? ", " + esc(nombre) : ""}</span><span class="fecha">${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}</span></div>
      <button class="avatar" data-vista="yo" aria-label="Mi cuenta">${esc((nombre || "Y")[0].toUpperCase())}</button>
    </header>

    <div class="hero ${plan.quedaHoy < 0 ? "rojo" : ""}">
      <div class="hero-txt">
        <span class="eti">${etiqueta}</span>
        <span class="cifra">${pesos(Math.abs(plan.quedaHoy))}</span>
        <span class="chips-hero"><span>Tienes ${pesos(estado.saldo)}</span><span>Pago ${cuandoTxt(plan.pago)}</span></span>
      </div>
      <div class="hero-anillo">${anillo(plan.gastadoHoy, plan.porDia, plan.quedaHoy < 0 ? "#ffd2c7" : "#ffffff")}<small>${plan.porDia ? Math.min(999, Math.round((plan.gastadoHoy / plan.porDia) * 100)) : 0} %</small></div>
    </div>

    <div class="rapidas">
      <button class="rapida" data-anotar data-tipo="gasto"><span>−</span>Gasto</button>
      <button class="rapida" data-anotar data-tipo="ingreso"><span>+</span>Me entró plata</button>
    </div>

    <div class="sugs" aria-label="Sugerencias">
      ${sugs.map((s) => `
      <article class="sug ${s.tono}" ${s.data && !s.accion ? s.data + ' role="button" tabindex="0"' : ""}>
        <span class="sug-ico">${simbolo(s.icono)}</span>
        <b>${esc(s.titulo)}</b>
        <span class="sug-txt">${esc(s.texto)}</span>
        ${s.accion ? `<button class="sug-btn" ${s.data}>${s.accion}</button>` : ""}
      </article>`).join("")}
    </div>

    <section class="resumen">
      <div class="seg" role="tablist">${periodos.map(([v, t]) => `<button role="tab" data-periodo="${v}" aria-selected="${estado.periodo === v}">${t}</button>`).join("")}</div>
      ${{ hoy: resumenHoy, semana: resumenSemana, mes: resumenMes }[estado.periodo]()}
    </section>

    ${metas.length ? `<section class="metas-mini">
      ${metas.map((m) => `<button class="meta-mini" data-vista="metas">${anillo(m.ahorrado, m.objetivo, "var(--azul)")}<span><b>${esc(m.nombre)}</b><small>${Math.min(100, Math.round((m.ahorrado / m.objetivo) * 100))} % · ${pesos(m.ahorrado)}</small></span></button>`).join("")}
    </section>` : ""}
  </section>`;
}

function engancharInicio() {
  app.querySelectorAll("[data-periodo]").forEach((b) => (b.onclick = () => { estado.periodo = b.dataset.periodo; pintarApp(); }));
  engancharSugerencias(app);
}

// Botones que pueden salir en sugerencias y otras pantallas
function engancharSugerencias(raiz) {
  raiz.querySelectorAll("[data-ir-tarjeta]").forEach((el) => (el.onclick = () => ir("tarjeta", { tarjetaAbierta: el.dataset.irTarjeta })));
  raiz.querySelectorAll("[data-poner-saldo]").forEach((el) => (el.onclick = abrirSaldo));
  raiz.querySelectorAll("[data-pagar-fijo]").forEach((el) => (el.onclick = () => pagarFijo(estado.fijos.find((f) => f.id === el.dataset.pagarFijo), el)));
  raiz.querySelectorAll("[data-pagar-deuda]").forEach((el) => (el.onclick = () => pagarDeuda(estado.deudas.find((d) => d.id === el.dataset.pagarDeuda), el)));
  raiz.querySelectorAll("[data-guardar]").forEach((el) => (el.onclick = async () => {
    const [id, monto] = el.dataset.guardar.split(":");
    const meta = metaPorId(id);
    el.disabled = true;
    const ok = await guardarMovimiento({ tipo: "abono", monto: +monto, meta_id: id, descripcion: `Ahorro para ${meta.nombre}` });
    if (ok) { pintarApp(); toast(`Guardado. Llevas ${pesos(metaPorId(id).ahorrado)} para ${meta.nombre}.`); } else el.disabled = false;
  }));
  raiz.querySelectorAll(".sug[role=button]").forEach((el) => (el.onkeydown = (e) => { if (e.key === "Enter") el.click(); }));
}

async function pagarFijo(f, boton) {
  if (!f) return;
  const cat = estado.sobres.find((s) => s.tipo === "fijo") || categorias().find((s) => s.nombre === "Otros");
  if (boton) boton.disabled = true;
  const ok = await guardarMovimiento({ tipo: "gasto", monto: f.monto, sobre_id: cat?.id || null, descripcion: f.nombre });
  if (ok) { pintarApp(); toast(`${f.nombre} pagado`); } else if (boton) boton.disabled = false;
}

async function pagarDeuda(d, boton) {
  if (!d) return;
  const cat = categorias().find((s) => s.nombre === "Otros") || categorias()[0];
  if (boton) boton.disabled = true;
  const ok = await guardarMovimiento({ tipo: "gasto", monto: d.monto, sobre_id: cat?.id || null, descripcion: `Pago: ${d.descripcion}` });
  if (!ok) { if (boton) boton.disabled = false; return; }
  await sb.from("deudas").update({ pagada: true, fecha_pago: fechaLocal(new Date()) }).eq("id", d.id);
  await cargarTodo();
  pintarApp();
  toast("Deuda pagada");
}

// Poner o corregir el saldo real: se guarda como ajuste, no cuenta como gasto ni ingreso
function abrirSaldo() {
  abrirHoja(`
    <h2>¿Cuánta plata tienes hoy?</h2>
    <p class="sub">Suma Nequi, banco y efectivo. Luka ahora cree que tienes ${pesos(estado.saldo)}.</p>
    ${campoMonto("sa-monto", "Tengo en total", 0)}
    <div class="acciones"><button class="boton" id="sa-ok">Guardar</button><button class="boton texto" data-cerrar>Cancelar</button></div>`,
    (hoja) => {
      const input = formatearAlSalir(hoja, "sa-monto");
      setTimeout(() => input.focus(), 250);
      hoja.querySelector("#sa-ok").onclick = async (e) => {
        const real = leerMonto(input.value);
        e.currentTarget.disabled = true;
        const dif = real - estado.saldo;
        if (dif) {
          const { error } = await sb.from("movimientos").insert({ tipo: dif > 0 ? "ingreso" : "gasto", monto: Math.abs(dif), descripcion: "Ajuste de saldo", origen: "ajuste" });
          if (error) { toast("No se pudo guardar."); e.currentTarget.disabled = false; return; }
        }
        await sb.from("perfiles").update({ saldo_listo: true }).eq("id", estado.usuario.id);
        await cargarTodo();
        cerrarHoja();
        pintarApp();
        toast(`Listo: tienes ${pesos(estado.saldo)}`);
      };
    });
}

/* ---------- Tarjetas (categorías) ---------- */

function datosTarjeta(c) {
  const h = hoy0(), ini = inicioDeMes();
  const g = gastosEntre(ini, sumaDias(h, 1)).filter((m) => m.sobre_id === c.id);
  const antes = suma(gastosEntre(new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth() - 1, h.getDate() + 1)).filter((m) => m.sobre_id === c.id));
  return { lista: g, total: suma(g), antes };
}

function vistaTarjetas() {
  const cats = categorias();
  const alto = 104, paso = 58;
  const mes = MESES[new Date().getMonth()];
  return `
  <section class="pantalla inicio">
    <div class="titulo-fila"><h1>Tarjetas</h1><button class="chip" data-vista="ajustar">Ajustar</button></div>
    <p class="sub">Lo que llevas gastado en ${mes}, por tarjeta. Toca una para ver el detalle.</p>
    <div class="billetera" style="height:${alto + paso * (cats.length - 1)}px">
      ${cats.map((c, i) => {
        const d = datosTarjeta(c);
        const p = pct(d.total, d.antes);
        const detalle = c.presupuesto > 0
          ? `${Math.round((d.total / c.presupuesto) * 100)} % de tu tope de ${pesos(c.presupuesto)}`
          : `${d.lista.length} ${d.lista.length === 1 ? "gasto" : "gastos"}${d.antes ? ` · ${p > 0 ? "↑" : "↓"}${Math.abs(p)} % vs. ${MESES[(new Date().getMonth() + 11) % 12]}` : ""}`;
        return `<button class="tarjeta" data-ir-tarjeta="${c.id}" style="top:${i * paso}px;--c:${c.color};--t:${letraDe(c.color)}" aria-label="${esc(c.nombre)}: ${pesos(d.total)} este mes">
          <span class="arriba"><span class="nombre">${esc(c.nombre)}</span><span class="monto">${pesos(d.total)}</span></span>
          ${c.presupuesto > 0 ? `<span class="tope"><i style="width:${Math.min(100, Math.round((d.total / c.presupuesto) * 100))}%"></i></span>` : ""}
          <span class="de">${detalle}</span>
        </button>`;
      }).join("")}
    </div>
  </section>`;
}

function engancharTarjetas() { engancharSugerencias(app); }

function filaMovimiento(m) {
  const s = sobreDe(m.sobre_id);
  const f = new Date(m.fecha);
  let titulo = m.descripcion || (m.tipo === "ingreso" ? "Ingreso" : "Gasto");
  let sub = [s?.nombre, m.metodo].filter(Boolean).join(" · ");
  let signo = "−", clase = "";
  if (m.tipo === "ingreso") { signo = "+"; clase = "entra"; sub = [m.origen === "ajuste" ? "Ajuste de saldo" : "Ingreso", m.metodo].filter(Boolean).join(" · "); }
  if (m.tipo === "abono") { signo = ""; clase = "pasa"; titulo = m.descripcion || `Ahorro para ${metaPorId(m.meta_id)?.nombre || "tu meta"}`; sub = "Ahorro"; }
  if (m.tipo === "retiro") { signo = "+"; clase = "pasa"; titulo = m.descripcion || "Sacado del ahorro"; sub = "Ahorro"; }
  if (m.tipo === "traslado") { signo = ""; clase = "pasa"; sub = "Movida entre tarjetas"; }
  if (m.origen === "ajuste" && m.tipo === "gasto") sub = "Ajuste de saldo";
  const color = m.tipo === "ingreso" ? "var(--verde)" : m.tipo === "abono" || m.tipo === "retiro" ? "var(--azul)" : s?.color || "#c9d3cd";
  const hora = fechaLocal(f) === fechaLocal(new Date(m.creado)) ? `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}` : "";
  return `<button class="mov" data-mov="${m.id}">
    <i style="background:${color}"></i>
    <span class="txt">${esc(titulo)}<small>${esc(sub)}${hora ? (sub ? " · " : "") + hora : ""}</small></span>
    <span class="num ${clase}">${signo}${pesos(m.monto)}</span>
  </button>`;
}

function engancharFilas() {
  app.querySelectorAll("[data-mov]").forEach((el) => (el.onclick = () => {
    const m = estado.movs.find((x) => x.id === el.dataset.mov) || estado.movsMes?.find((x) => x.id === el.dataset.mov);
    if (m) abrirAnotar(m);
  }));
}

function vistaTarjeta() {
  const c = sobreDe(estado.tarjetaAbierta);
  if (!c) { estado.vista = "tarjetas"; return vistaTarjetas(); }
  const d = datosTarjeta(c);
  const h = hoy0();
  const top = Object.entries(d.lista.reduce((r, m) => { const k = m.descripcion || "Sin descripción"; r[k] = (r[k] || 0) + m.monto; return r; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const p = pct(d.total, d.antes);
  const promedio = d.total / h.getDate();
  return `
  <section class="pantalla inicio">
    <button class="volver" data-vista="tarjetas">← Tarjetas</button>
    <div class="abierta" style="--c:${c.color};--t:${letraDe(c.color)}">
      <div class="arriba"><span>${esc(c.nombre)}</span><span>${MESES[h.getMonth()]}</span></div>
      <span class="monto">${pesos(d.total)}</span>
      ${c.presupuesto > 0 ? `<div class="barrita"><i style="width:${Math.min(100, Math.round((d.total / c.presupuesto) * 100))}%"></i></div><small>${pesos(Math.max(0, c.presupuesto - d.total))} libres de tu tope de ${pesos(c.presupuesto)}</small>` : `<small>${d.lista.length} ${d.lista.length === 1 ? "gasto" : "gastos"} · ${pesos(promedio)} por día en promedio</small>`}
    </div>
    <div class="baldosas">
      <div class="baldosa"><span>${MESES[(h.getMonth() + 11) % 12]} a esta fecha</span><b class="num">${pesos(d.antes)}</b></div>
      <div class="baldosa"><span>Diferencia</span><b class="num ${d.antes ? (p > 0 ? "sube" : "entra") : ""}">${d.antes ? (p > 0 ? "↑" : "↓") + Math.abs(p) + " %" : "—"}</b></div>
    </div>
    ${top.length ? `<div class="campo"><span class="etiqueta">En lo que más gastas aquí</span><div class="top-desc">${top.map(([k, v]) => `<span><b>${esc(k)}</b>${pesos(v)}</span>`).join("")}</div></div>` : ""}
    <div class="fila">
      <button class="boton" data-anotar="${c.id}">Anotar aquí</button>
      <button class="boton claro" id="tope">${c.presupuesto > 0 ? "Cambiar tope" : "Ponerle tope"}</button>
    </div>
    <h3 class="titulo-lista">Este mes</h3>
    <div class="lista-movs">${d.lista.length ? d.lista.map(filaMovimiento).join("") : `<p class="sub vacio-lista">Todavía no hay gastos en esta tarjeta.</p>`}</div>
  </section>`;
}

function engancharTarjeta() {
  const c = sobreDe(estado.tarjetaAbierta);
  engancharFilas();
  document.getElementById("tope").onclick = () => abrirHoja(`
    <h2>Tope para ${esc(c.nombre)}</h2>
    <p class="sub">Es opcional. Si lo pones, Luka te avisa cuando vayas por el 80 %.</p>
    ${campoMonto("to-monto", "Máximo al mes", c.presupuesto)}
    <div class="acciones"><button class="boton" id="to-ok">Guardar</button>${c.presupuesto ? `<button class="boton claro" id="to-quitar">Quitar tope</button>` : ""}<button class="boton texto" data-cerrar>Cancelar</button></div>`,
    (hoja) => {
      const input = formatearAlSalir(hoja, "to-monto");
      const guardar = async (valor) => {
        const { error } = await sb.from("sobres").update({ presupuesto: valor }).eq("id", c.id);
        if (error) return toast("No se pudo guardar.");
        await cargarTodo(); cerrarHoja(); pintarApp(); toast(valor ? "Tope guardado" : "Tope quitado");
      };
      hoja.querySelector("#to-ok").onclick = () => guardar(leerMonto(input.value));
      const quitar = hoja.querySelector("#to-quitar");
      if (quitar) quitar.onclick = () => guardar(0);
    });
}

function vistaAjustar() {
  return `
  <section class="pantalla inicio">
    <button class="volver" data-vista="tarjetas">← Tarjetas</button>
    <h1>Ajustar tarjetas</h1>
    <p class="sub">Cámbiales el nombre, ponles un tope opcional o crea tarjetas nuevas.</p>
    <div class="lista-ajuste">
      ${categorias().map((x) => `
      <div class="ajuste" style="--c:${x.color}">
        <i></i>
        <input data-nombre="${x.id}" value="${esc(x.nombre)}" aria-label="Nombre de la tarjeta">
        <input data-presu="${x.id}" class="num" inputmode="decimal" value="${x.presupuesto ? pesos(x.presupuesto) : ""}" placeholder="Sin tope" aria-label="Tope de ${esc(x.nombre)}">
        ${x.tipo === "fijo" ? "<span></span>" : `<button class="quitar" data-archivar="${x.id}" aria-label="Quitar ${esc(x.nombre)}">×</button>`}
      </div>`).join("")}
    </div>
    <button class="boton claro" id="nueva-tarjeta">+ Nueva tarjeta</button>
    <div class="acciones"><button class="boton" id="guardar-ajuste">Guardar</button></div>
  </section>`;
}

function engancharAjustar() {
  app.querySelectorAll("[data-presu]").forEach((el) => (el.onblur = () => { const n = leerMonto(el.value); el.value = n ? pesos(n) : ""; }));
  app.querySelectorAll("[data-archivar]").forEach((b) => (b.onclick = async () => {
    if (!b.dataset.seguro) { b.dataset.seguro = "1"; b.textContent = "¿?"; toast("Toca otra vez para quitarla. Sus gastos se quedan."); return; }
    await sb.from("sobres").update({ archivado: true }).eq("id", b.dataset.archivar);
    await cargarTodo(); pintarApp();
  }));
  document.getElementById("nueva-tarjeta").onclick = async () => {
    const usados = new Set(estado.sobres.map((x) => x.color));
    const color = COLORES_EXTRA.find((c) => !usados.has(c)) || COLORES_EXTRA[0];
    const { error } = await sb.from("sobres").insert({ nombre: "Nueva", tipo: "gasto", color, presupuesto: 0, orden: 15 });
    if (error) return toast("No se pudo crear.");
    await cargarTodo(); pintarApp();
    const inputs = app.querySelectorAll("[data-nombre]");
    const ultimo = [...inputs].find((i) => i.value === "Nueva");
    ultimo?.select();
  };
  document.getElementById("guardar-ajuste").onclick = async (e) => {
    e.currentTarget.disabled = true;
    const res = await Promise.all(categorias().map((x) => sb.from("sobres").update({
      nombre: (app.querySelector(`[data-nombre="${x.id}"]`).value.trim() || x.nombre).slice(0, 30),
      presupuesto: leerMonto(app.querySelector(`[data-presu="${x.id}"]`).value),
    }).eq("id", x.id)));
    if (res.some((r) => r.error)) { toast("No se pudo guardar todo."); e.currentTarget.disabled = false; return; }
    await cargarTodo();
    toast("Tarjetas guardadas");
    ir("tarjetas");
  };
}

/* ---------- Anotar (hoja que sube) ---------- */

// Palabras que delatan la tarjeta de un gasto
const PISTAS = {
  Comida: /almuerzo|desayuno|cena|comida|corrientazo|rappi|domicilio|mercado|d1|ara|olimpica|olímpica|éxito|exito|tinto|caf[eé]|perro|hamburguesa|pizza|empanada|arepa|fruta|panader|snack|gaseosa|pollo|restaurante|onces|merienda/,
  Transporte: /gasolina|bus|buseta|transmetro|taxi|uber|didi|indriver|picap|moto|parqueadero|peaje|pasaje|metro|sitp|tanqueo/,
  Salidas: /cine|rumba|cerveza|trago|discoteca|bar\b|fiesta|concierto|partido|estadio|salida|paseo|playa|plan|novia/,
  Compras: /ropa|zapato|tenis|camisa|aseo|champ|desodorante|regalo|tecnolog|cargador|audífono|audifono|celular nuevo/,
  Estudio: /fotocopia|libro|útil|util|cuaderno|curso|matr[ií]cula|universidad|impresi/,
  Salud: /droguer|medicina|pastilla|cita|m[eé]dico|gimnasio|gym|odont/,
  Suscripciones: /netflix|spotify|disney|hbo|prime|youtube|plan celular|internet|icloud|app/,
};

function sobrePorPista(texto) {
  const t = (texto || "").toLowerCase();
  for (const c of categorias()) if (c.tipo === "fijo" && estado.fijos.some((f) => f.nombre.toLowerCase() === t)) return c.id;
  for (const [nombre, re] of Object.entries(PISTAS)) {
    if (re.test(t)) { const s = categorias().find((x) => x.nombre === nombre); if (s) return s.id; }
  }
  return null;
}

async function guardarMovimiento(fila, id = null) {
  const q = id ? sb.from("movimientos").update(fila).eq("id", id) : sb.from("movimientos").insert(fila);
  const { error } = await q;
  if (error) { toast("No se pudo guardar. Revisa el internet."); return false; }
  await cargarTodo();
  return true;
}

function campoMonto(id, etiqueta, valor, ayuda = "") {
  return `<div class="campo"><label for="${id}">${etiqueta}</label><input id="${id}" class="grande" inputmode="decimal" value="${valor ? pesos(valor) : ""}" placeholder="$0" autocomplete="off">${ayuda ? `<span class="ayuda" id="${id}-ayuda">${ayuda}</span>` : ""}</div>`;
}
function formatearAlSalir(hoja, id) {
  const el = hoja.querySelector("#" + id);
  el.onblur = () => { const n = leerMonto(el.value); if (n) el.value = pesos(n); };
  return el;
}

function abrirAnotar(previo = {}) {
  const editando = !!previo.id;
  if (["traslado", "abono", "retiro"].includes(previo.tipo) || previo.origen === "ajuste") {
    const titulos = { traslado: "Movida entre tarjetas", abono: "Ahorro para una meta", retiro: "Plata sacada del ahorro" };
    return abrirHoja(`
      <h2>${previo.origen === "ajuste" ? "Ajuste de saldo" : titulos[previo.tipo]}</h2>
      <p class="sub">${esc(previo.descripcion)} · ${pesos(previo.monto)}</p>
      <div class="acciones"><button class="boton peligro" id="borrar">Deshacer</button><button class="boton texto" data-cerrar>Cerrar</button></div>`,
      (hoja) => engancharBorrar(hoja, previo));
  }
  const f = {
    tipo: previo.tipo || "gasto",
    monto: previo.monto || 0,
    descripcion: previo.descripcion || "",
    sobre_id: previo.sobre_id || null,
    metodo: previo.metodo || "Nequi",
    fecha: previo.fecha ? fechaLocal(new Date(previo.fecha)) : fechaLocal(new Date()),
    elegidoAMano: !!previo.sobre_id,
  };
  const hoy = fechaLocal(new Date());
  const ayer = fechaLocal(sumaDias(hoy0(), -1));
  const miPago = estado.perfil.ingreso_por_pago;

  const chipsDescripcion = () => {
    if (f.tipo === "ingreso") return [
      ...(miPago ? [`<button type="button" class="chip" data-desc="Quincena" data-monto="${miPago}">Mi pago · ${pesos(miPago)}</button>`] : []),
      ...OPCIONES_INGRESO.map((o) => `<button type="button" class="chip suave" data-desc="${esc(o)}" aria-pressed="${f.descripcion === o}">${esc(o)}</button>`),
    ].join("");
    const cat = sobreDe(f.sobre_id);
    if (!cat) return `<span class="sub">Escoge primero la tarjeta y te muestro opciones.</span>`;
    const ops = descripcionesDe(cat);
    return ops.length ? ops.map((o) => `<button type="button" class="chip suave" data-desc="${esc(o)}" aria-pressed="${f.descripcion === o}">${esc(o)}</button>`).join("") : `<span class="sub">Escribe abajo qué fue.</span>`;
  };

  abrirHoja(`
    <div class="pestanas" role="tablist">
      <button role="tab" type="button" aria-selected="${f.tipo === "gasto"}" data-tipo="gasto">Gasto</button>
      <button role="tab" type="button" aria-selected="${f.tipo === "ingreso"}" data-tipo="ingreso">Me entró plata</button>
    </div>
    <div class="campo">
      <label for="a-monto">¿Cuánto?</label>
      <input id="a-monto" class="grande" inputmode="decimal" placeholder="Ej: 15k" value="${f.monto ? pesos(f.monto) : ""}" autocomplete="off">
    </div>
    <div class="campo" id="bloque-sobre" ${f.tipo === "ingreso" ? "hidden" : ""}>
      <span class="etiqueta">¿En qué tarjeta?</span>
      <div class="chips-sobre">${categorias().map((x) => `<button type="button" class="chip-sobre" data-sobre="${x.id}" style="--c:${x.color};--t:${letraDe(x.color)}" aria-pressed="${x.id === f.sobre_id}">${esc(x.nombre)}</button>`).join("")}</div>
    </div>
    <div class="campo">
      <span class="etiqueta" id="eti-desc">${f.tipo === "gasto" ? "¿Qué fue?" : "¿De dónde?"}</span>
      <div class="chips" id="chips-desc">${chipsDescripcion()}</div>
      <input id="a-desc" placeholder="${f.tipo === "gasto" ? "O escribe otra cosa" : "O escribe de dónde"}" value="${esc(f.descripcion)}" autocomplete="off" aria-labelledby="eti-desc">
    </div>
    <div class="campo">
      <span class="etiqueta">¿Cómo?</span>
      <div class="chips">${METODOS.map((m) => `<button type="button" class="chip suave" data-metodo="${m}" aria-pressed="${m === f.metodo}">${m}</button>`).join("")}</div>
    </div>
    <div class="campo">
      <span class="etiqueta">¿Cuándo?</span>
      <div class="chips">
        <button type="button" class="chip suave" data-fecha="${hoy}" aria-pressed="${f.fecha === hoy}">Hoy</button>
        <button type="button" class="chip suave" data-fecha="${ayer}" aria-pressed="${f.fecha === ayer}">Ayer</button>
        <input id="a-fecha" type="date" value="${f.fecha}" max="${hoy}" aria-label="Otra fecha">
      </div>
    </div>
    <div class="aviso-error" id="a-error" hidden></div>
    <div class="acciones">
      <button class="boton" id="a-guardar">${editando ? "Guardar cambios" : "Anotar"}</button>
      ${editando ? `<button class="boton peligro" id="borrar">Borrar</button>` : ""}
      <button class="boton texto" data-cerrar>Cancelar</button>
    </div>`,
    (hoja) => {
      const $ = (id) => hoja.querySelector("#" + id);
      const pintarChips = () => {
        $("chips-desc").innerHTML = chipsDescripcion();
        hoja.querySelectorAll("[data-desc]").forEach((b) => (b.onclick = () => {
          f.descripcion = b.dataset.desc; $("a-desc").value = f.descripcion;
          if (b.dataset.monto && !leerMonto($("a-monto").value)) { f.monto = +b.dataset.monto; $("a-monto").value = pesos(f.monto); }
          hoja.querySelectorAll("[data-desc]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        }));
      };
      const marcarSobre = () => hoja.querySelectorAll("[data-sobre]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sobre === f.sobre_id)));
      pintarChips();
      hoja.querySelectorAll("[data-tipo]").forEach((b) => (b.onclick = () => {
        f.tipo = b.dataset.tipo;
        f.monto = leerMonto($("a-monto").value); f.descripcion = "";
        $("a-desc").value = "";
        hoja.querySelectorAll("[data-tipo]").forEach((t) => t.setAttribute("aria-selected", String(t === b)));
        $("bloque-sobre").hidden = f.tipo === "ingreso";
        $("eti-desc").textContent = f.tipo === "gasto" ? "¿Qué fue?" : "¿De dónde?";
        $("a-desc").placeholder = f.tipo === "gasto" ? "O escribe otra cosa" : "O escribe de dónde";
        pintarChips();
      }));
      $("a-monto").oninput = () => { f.monto = leerMonto($("a-monto").value); };
      $("a-monto").onblur = () => { if (f.monto) $("a-monto").value = pesos(f.monto); };
      $("a-desc").oninput = () => {
        f.descripcion = $("a-desc").value;
        if (f.tipo === "gasto" && !f.elegidoAMano) { const p = sobrePorPista(f.descripcion); if (p && p !== f.sobre_id) { f.sobre_id = p; marcarSobre(); } }
      };
      hoja.querySelectorAll("[data-sobre]").forEach((b) => (b.onclick = () => { f.sobre_id = b.dataset.sobre; f.elegidoAMano = true; marcarSobre(); pintarChips(); }));
      hoja.querySelectorAll("[data-metodo]").forEach((b) => (b.onclick = () => { f.metodo = b.dataset.metodo; hoja.querySelectorAll("[data-metodo]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
      const marcarFecha = () => hoja.querySelectorAll("[data-fecha]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.fecha === f.fecha)));
      hoja.querySelectorAll("[data-fecha]").forEach((b) => (b.onclick = () => { f.fecha = b.dataset.fecha; $("a-fecha").value = f.fecha; marcarFecha(); }));
      $("a-fecha").onchange = () => { f.fecha = $("a-fecha").value || hoy; marcarFecha(); };
      $("a-guardar").onclick = async () => {
        const err = $("a-error");
        f.monto = leerMonto($("a-monto").value);
        f.descripcion = $("a-desc").value.trim();
        f.descripcion = f.descripcion.charAt(0).toUpperCase() + f.descripcion.slice(1);
        if (f.tipo === "gasto" && !f.sobre_id) f.sobre_id = sobrePorPista(f.descripcion);
        const falta = !f.monto ? "Escribe cuánto fue." : f.tipo === "gasto" && !f.sobre_id ? "Escoge en qué tarjeta va." : "";
        if (falta) { err.textContent = falta; err.hidden = false; return; }
        $("a-guardar").disabled = true;
        const cuando = f.fecha === hoy ? (editando && fechaLocal(new Date(previo.fecha)) === hoy ? previo.fecha : new Date().toISOString()) : new Date(f.fecha + "T12:00:00").toISOString();
        const fila = { tipo: f.tipo, monto: f.monto, descripcion: f.descripcion || (f.tipo === "gasto" ? sobreDe(f.sobre_id).nombre : "Ingreso"), metodo: f.metodo, sobre_id: f.tipo === "gasto" ? f.sobre_id : null, fecha: cuando };
        const ok = await guardarMovimiento(fila, previo.id || null);
        if (!ok) { $("a-guardar").disabled = false; return; }
        cerrarHoja();
        estado.movsMes = null;
        pintarApp();
        const plan = planDelDia();
        if (editando) toast("Cambios guardados");
        else if (f.tipo === "ingreso") toast(`Anotado. Ahora tienes ${pesos(estado.saldo)}.`);
        else toast(plan.quedaHoy >= 0 ? `Anotado. Hoy te quedan ${pesos(plan.quedaHoy)}.` : `Anotado. Hoy te pasaste ${pesos(-plan.quedaHoy)}.`);
      };
      if (editando) engancharBorrar(hoja, previo);
      if (!editando) setTimeout(() => $("a-monto").focus(), 250);
    });
}

function engancharBorrar(hoja, previo) {
  const b = hoja.querySelector("#borrar");
  b.onclick = async () => {
    if (!b.dataset.seguro) { b.dataset.seguro = "1"; b.textContent = "¿Seguro? Toca otra vez"; return; }
    b.disabled = true;
    const { error } = await sb.from("movimientos").delete().eq("id", previo.id);
    if (error) { toast("No se pudo borrar."); b.disabled = false; return; }
    await cargarTodo();
    cerrarHoja();
    estado.movsMes = null;
    pintarApp();
    toast("Borrado");
  };
}

function abrirHoja(html, enganchar) {
  cerrarHoja(true);
  const fondo = document.createElement("div");
  fondo.className = "fondo-hoja";
  fondo.innerHTML = `<div class="hoja" role="dialog" aria-modal="true" aria-label="Anotar"><div class="agarre"></div>${html}</div>`;
  document.body.appendChild(fondo);
  document.body.classList.add("con-hoja");
  requestAnimationFrame(() => fondo.classList.add("visible"));
  fondo.addEventListener("click", (e) => { if (e.target === fondo || e.target.closest("[data-cerrar]")) cerrarHoja(); });
  const teclaEsc = (e) => { if (e.key === "Escape") cerrarHoja(); };
  document.addEventListener("keydown", teclaEsc);
  fondo._esc = teclaEsc;
  enganchar(fondo.querySelector(".hoja"));
}

function cerrarHoja(ya = false) {
  const fondo = document.querySelector(".fondo-hoja");
  if (!fondo) return;
  document.removeEventListener("keydown", fondo._esc);
  document.body.classList.remove("con-hoja");
  if (ya) return fondo.remove();
  fondo.classList.remove("visible");
  setTimeout(() => fondo.remove(), 220);
}

/* ---------- Movimientos ---------- */

function vistaMovimientos() {
  const mes = estado.mesVisto || inicioDeMes();
  const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
  const enRango = mes >= (estado.desde || inicioDeMes());
  const lista = enRango ? estado.movs.filter(entre(mes, fin)) : estado.movsMes;
  const esActual = mes.getTime() === inicioDeMes().getTime();
  const filtro = estado.filtroMov || "todo";
  if (!lista) return `<section class="pantalla inicio"><p class="sub">Cargando…</p></section>`;
  const vis = lista.filter((m) => filtro === "todo" || m.tipo === filtro || (filtro === "ahorro" && (m.tipo === "abono" || m.tipo === "retiro")));
  const gastos = suma(lista.filter((m) => m.tipo === "gasto" && cuenta(m)));
  const ingresos = suma(lista.filter((m) => m.tipo === "ingreso" && cuenta(m)));

  const grupos = {};
  for (const m of vis) { const d = new Date(m.fecha); (grupos[fechaLocal(d)] ||= { d, items: [] }).items.push(m); }
  const hoy = fechaLocal(new Date()), ayer = fechaLocal(sumaDias(hoy0(), -1));
  const titulo = (k, d) => (k === hoy ? "Hoy" : k === ayer ? "Ayer" : `${DIAS[d.getDay()]} ${d.getDate()}`);

  return `
  <section class="pantalla inicio">
    <div class="mes-nav">
      <button class="flechita" id="mes-ant" aria-label="Mes anterior">‹</button>
      <h1>${MESES[mes.getMonth()][0].toUpperCase() + MESES[mes.getMonth()].slice(1)}${mes.getFullYear() !== new Date().getFullYear() ? " " + mes.getFullYear() : ""}</h1>
      <button class="flechita" id="mes-sig" aria-label="Mes siguiente" ${esActual ? "disabled" : ""}>›</button>
    </div>
    <div class="baldosas">
      <div class="baldosa"><span>Te entró</span><b class="num entra">${pesos(ingresos)}</b></div>
      <div class="baldosa"><span>Gastaste</span><b class="num">${pesos(gastos)}</b></div>
    </div>
    <div class="chips" role="tablist">
      ${[["todo", "Todo"], ["gasto", "Gastos"], ["ingreso", "Ingresos"], ["ahorro", "Ahorro"]].map(([v, t]) => `<button class="chip suave" role="tab" data-filtro="${v}" aria-pressed="${filtro === v}">${t}</button>`).join("")}
    </div>
    ${vis.length ? Object.entries(grupos).map(([k, g]) => `<div class="dia">${titulo(k, g.d)}</div><div class="lista-movs">${g.items.map(filaMovimiento).join("")}</div>`).join("")
      : `<div class="vacio-chico"><p class="sub">${lista.length ? "Nada con ese filtro." : "Todavía no hay nada anotado este mes."}</p>${esActual ? `<button class="boton" data-anotar>Anotar el primero</button>` : ""}</div>`}
  </section>`;
}

function engancharMovimientos() {
  const mes = estado.mesVisto || inicioDeMes();
  const cambiar = async (delta) => {
    const nuevo = new Date(mes.getFullYear(), mes.getMonth() + delta, 1);
    estado.mesVisto = nuevo;
    estado.movsMes = null;
    pintarApp();
    if (nuevo < estado.desde) {
      const fin = new Date(nuevo.getFullYear(), nuevo.getMonth() + 1, 1);
      const { data, error } = await sb.from("movimientos").select("*").gte("fecha", nuevo.toISOString()).lt("fecha", fin.toISOString()).order("fecha", { ascending: false });
      if (error) { toast("No pude cargar ese mes."); return; }
      estado.movsMes = data;
      if (estado.vista === "movimientos") pintarApp();
    }
  };
  document.getElementById("mes-ant").onclick = () => cambiar(-1);
  document.getElementById("mes-sig").onclick = () => cambiar(1);
  app.querySelectorAll("[data-filtro]").forEach((b) => (b.onclick = () => { estado.filtroMov = b.dataset.filtro; pintarApp(); }));
  engancharFilas();
}

/* ---------- Metas y deudas ---------- */

// Cuándo se cumple una meta al ritmo del aporte mensual
function proyeccion(m) {
  const falta = m.objetivo - m.ahorrado;
  if (falta <= 0) return { texto: "¡Ya la tienes completa!", listo: true };
  if (!m.aporte_mensual) return { texto: "Ponle cuánto al mes y te digo cuándo llegas." };
  const meses = Math.ceil(falta / m.aporte_mensual);
  const d = new Date(); d.setMonth(d.getMonth() + meses);
  let texto = `Llegas en ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  if (m.fecha_objetivo) {
    const [a, mes] = m.fecha_objetivo.split("-").map(Number);
    const hoy = new Date();
    const quedan = Math.max(1, (a - hoy.getFullYear()) * 12 + (mes - 1 - hoy.getMonth()));
    texto += d <= new Date(a, mes - 1, 28) ? ", a tiempo." : `. Para ${MESES[mes - 1]} necesitas ${pesos(Math.ceil(falta / quedan / 1000) * 1000)} al mes.`;
  } else texto += ".";
  return { texto };
}

function vistaMetas() {
  const activas = metasActivas();
  const logradas = estado.metas.filter((m) => m.lograda);
  const pendientes = estado.deudas.filter((d) => !d.pagada);
  const tieneEmergencias = estado.metas.some((m) => /emergencia/i.test(m.nombre));
  const gastoMes = Math.round(suma(gastosEntre(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), inicioDeMes())) || estado.perfil.ingreso_por_pago * PAGOS_AL_MES[estado.perfil.frecuencia]);
  const ahorradoTotal = activas.reduce((t, m) => t + m.ahorrado, 0);
  return `
  <section class="pantalla inicio">
    <h1>Metas</h1>
    ${activas.length ? `<div class="baldosas"><div class="baldosa"><span>Ahorrado</span><b class="num">${pesos(ahorradoTotal)}</b></div><div class="baldosa"><span>Tienes libre</span><b class="num">${pesos(estado.saldo)}</b></div></div>` : ""}
    ${activas.map((m) => {
      const p = proyeccion(m);
      const pc = Math.min(100, Math.round((m.ahorrado / m.objetivo) * 100));
      return `
      <article class="meta">
        <div class="meta-cab"><div class="meta-anillo">${anillo(m.ahorrado, m.objetivo, "var(--azul)")}<span class="num">${pc}%</span></div>
          <div><h2>${esc(m.nombre)}</h2><span class="sub"><b class="num">${pesos(m.ahorrado)}</b> de ${pesos(m.objetivo)}</span></div></div>
        <p class="sub">${p.texto}</p>
        <div class="fila">
          ${p.listo ? `<button class="boton" data-lograda="${m.id}">¡La logré!</button>` : `<button class="boton" data-abonar="${m.id}">Guardar plata</button>`}
          <button class="boton claro" data-sacar="${m.id}" ${m.ahorrado ? "" : "disabled"}>Sacar</button>
          <button class="boton claro icono" data-editar-meta="${m.id}" aria-label="Editar ${esc(m.nombre)}">✎</button>
        </div>
      </article>`;
    }).join("") || `<p class="sub">No tienes metas todavía. Con una meta es más fácil no gastarse todo.</p>`}
    ${!tieneEmergencias && gastoMes ? `<div class="sug verde ancha"><span class="sug-ico">${simbolo("meta")}</span><b>Fondo de emergencias</b><span class="sug-txt">Lo ideal es tener guardado un mes de gastos: ${pesos(gastoMes)}.</span><button class="sug-btn" id="crear-emergencias">Crear</button></div>` : ""}
    <button class="boton claro" id="nueva-meta">+ Nueva meta</button>

    <div class="titulo-fila"><h2>Deudas</h2><button class="chip" id="nueva-deuda">+ Deuda</button></div>
    ${pendientes.length ? `<div class="lista-movs">${pendientes.map((d) => {
      const f = d.fecha_limite ? new Date(d.fecha_limite + "T00:00:00") : null;
      return `<div class="mov deuda"><i style="background:var(--error)"></i><button class="txt" data-editar-deuda="${d.id}">${esc(d.descripcion)}<small>${f ? `Vence ${cuandoTxt(f)}` : "Sin fecha"}</small></button><span class="num">${pesos(d.monto)}</span><button class="chip" data-pagar-deuda="${d.id}">Pagar</button></div>`;
    }).join("")}</div>` : `<p class="sub">No debes nada. Si le debes a alguien o tienes una cuota, anótala y te aviso antes de que venza.</p>`}

    ${logradas.length ? `<h3 class="titulo-lista">Metas logradas</h3><div class="lista-movs">${logradas.map((m) => `<div class="mov"><i style="background:var(--verde)"></i><span class="txt">${esc(m.nombre)}<small>${pesos(m.objetivo)}</small></span><span class="num entra">✓</span></div>`).join("")}</div>` : ""}
  </section>`;
}

function engancharMetas() {
  app.querySelectorAll("[data-abonar]").forEach((b) => (b.onclick = () => abrirAbono(metaPorId(b.dataset.abonar))));
  app.querySelectorAll("[data-sacar]").forEach((b) => (b.onclick = () => abrirRetiro(metaPorId(b.dataset.sacar))));
  app.querySelectorAll("[data-editar-meta]").forEach((b) => (b.onclick = () => abrirMeta(metaPorId(b.dataset.editarMeta))));
  app.querySelectorAll("[data-editar-deuda]").forEach((b) => (b.onclick = () => abrirDeuda(estado.deudas.find((d) => d.id === b.dataset.editarDeuda))));
  app.querySelectorAll("[data-lograda]").forEach((b) => (b.onclick = async () => {
    const m = metaPorId(b.dataset.lograda);
    b.disabled = true;
    await sb.from("metas").update({ lograda: true }).eq("id", m.id);
    await cargarTodo();
    pintarApp();
    toast(`¡Felicitaciones! Lograste «${m.nombre}».`);
  }));
  document.getElementById("nueva-meta").onclick = () => abrirMeta();
  document.getElementById("nueva-deuda").onclick = () => abrirDeuda();
  const em = document.getElementById("crear-emergencias");
  if (em) em.onclick = () => {
    const gastoMes = Math.round(suma(gastosEntre(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), inicioDeMes())) || estado.perfil.ingreso_por_pago * PAGOS_AL_MES[estado.perfil.frecuencia]);
    abrirMeta({ nombre: "Fondo de emergencias", objetivo: redondear(gastoMes) });
  };
  engancharSugerencias(app);
}

function abrirAbono(meta) {
  const sugerido = Math.min(redondear((meta.aporte_mensual || 0) / PAGOS_AL_MES[estado.perfil.frecuencia]), meta.objetivo - meta.ahorrado, Math.max(0, estado.saldo));
  abrirHoja(`
    <h2>Guardar para ${esc(meta.nombre)}</h2>
    <p class="sub">Llevas ${pesos(meta.ahorrado)} de ${pesos(meta.objetivo)}. Tienes ${pesos(estado.saldo)} libres.</p>
    ${campoMonto("ab-monto", "¿Cuánto guardas?", sugerido)}
    <div class="aviso-error" id="ab-error" hidden></div>
    <div class="acciones"><button class="boton" id="ab-ok">Guardar</button><button class="boton texto" data-cerrar>Cancelar</button></div>`,
    (hoja) => {
      const monto = formatearAlSalir(hoja, "ab-monto");
      hoja.querySelector("#ab-ok").onclick = async (e) => {
        const n = leerMonto(monto.value), err = hoja.querySelector("#ab-error");
        const falta = !n ? "Escribe cuánto vas a guardar." : n > Math.max(0, estado.saldo) ? `Solo tienes ${pesos(Math.max(0, estado.saldo))} libres.` : "";
        if (falta) { err.textContent = falta; err.hidden = false; return; }
        e.currentTarget.disabled = true;
        const ok = await guardarMovimiento({ tipo: "abono", monto: n, meta_id: meta.id, descripcion: `Ahorro para ${meta.nombre}` });
        if (!ok) { e.currentTarget.disabled = false; return; }
        cerrarHoja();
        pintarApp();
        const m = metaPorId(meta.id);
        toast(m.ahorrado >= m.objetivo ? `¡Completaste «${m.nombre}»!` : `Guardado. Llevas ${pesos(m.ahorrado)} de ${pesos(m.objetivo)}.`);
      };
    });
}

function abrirRetiro(meta) {
  abrirHoja(`
    <h2>Sacar de ${esc(meta.nombre)}</h2>
    <p class="sub">Tienes ${pesos(meta.ahorrado)} guardados. Lo que saques vuelve a tu saldo para gastarlo.</p>
    ${campoMonto("re-monto", "¿Cuánto?", 0)}
    <div class="aviso-error" id="re-error" hidden></div>
    <div class="acciones"><button class="boton" id="re-ok">Sacar</button><button class="boton texto" data-cerrar>Cancelar</button></div>`,
    (hoja) => {
      const monto = formatearAlSalir(hoja, "re-monto");
      hoja.querySelector("#re-ok").onclick = async (e) => {
        const n = leerMonto(monto.value), err = hoja.querySelector("#re-error");
        const falta = !n ? "Escribe cuánto vas a sacar." : n > meta.ahorrado ? `Solo tienes ${pesos(meta.ahorrado)} en la meta.` : "";
        if (falta) { err.textContent = falta; err.hidden = false; return; }
        e.currentTarget.disabled = true;
        const ok = await guardarMovimiento({ tipo: "retiro", monto: n, meta_id: meta.id, descripcion: `Sacado de ${meta.nombre}` });
        if (!ok) { e.currentTarget.disabled = false; return; }
        cerrarHoja();
        pintarApp();
        toast(`Listo: ${pesos(n)} volvieron a tu saldo.`);
      };
    });
}

function abrirMeta(meta = null) {
  const editando = !!meta?.id;
  const m = { nombre: meta?.nombre || "", objetivo: meta?.objetivo || 0, ahorrado: meta?.ahorrado || 0, fecha: meta?.fecha_objetivo?.slice(0, 7) || "", aporte: meta?.aporte_mensual || 0 };
  abrirHoja(`
    <h2>${editando ? "Editar meta" : "Nueva meta"}</h2>
    <div class="campo"><label for="me-nombre">¿Para qué?</label><input id="me-nombre" value="${esc(m.nombre)}" placeholder="Ej: Moto, viaje, celular" autocomplete="off"></div>
    <div class="fila">
      ${campoMonto("me-obj", "¿Cuánto cuesta?", m.objetivo)}
      ${editando ? "" : campoMonto("me-ya", "¿Ya tienes algo?", m.ahorrado)}
    </div>
    <div class="campo"><label for="me-fecha">¿Para cuándo? <span class="sub">(opcional)</span></label><input id="me-fecha" type="month" value="${esc(m.fecha)}"></div>
    ${campoMonto("me-aporte", "¿Cuánto le quieres meter al mes?", m.aporte, "Luka te recuerda guardarlo cuando te entre plata.")}
    <div class="aviso-error" id="me-error" hidden></div>
    <div class="acciones">
      <button class="boton" id="me-ok">${editando ? "Guardar" : "Crear meta"}</button>
      ${editando ? `<button class="boton peligro" id="me-borrar">Borrar meta</button>` : ""}
      <button class="boton texto" data-cerrar>Cancelar</button>
    </div>`,
    (hoja) => {
      const $ = (id) => hoja.querySelector("#" + id);
      ["me-obj", "me-ya", "me-aporte"].forEach((id) => $(id) && formatearAlSalir(hoja, id));
      const sugerir = () => {
        const obj = leerMonto($("me-obj").value), ya = $("me-ya") ? leerMonto($("me-ya").value) : m.ahorrado, f = $("me-fecha").value;
        const ayuda = $("me-aporte-ayuda");
        if (obj && f) {
          const [a, mes] = f.split("-").map(Number), hoy = new Date();
          const meses = Math.max(1, (a - hoy.getFullYear()) * 12 + (mes - 1 - hoy.getMonth()));
          ayuda.textContent = `Para llegar a tiempo necesitas ${pesos(Math.ceil((obj - ya) / meses / 1000) * 1000)} al mes.`;
        } else ayuda.textContent = "Luka te recuerda guardarlo cuando te entre plata.";
      };
      ["me-obj", "me-ya", "me-fecha"].forEach((id) => $(id) && $(id).addEventListener("input", sugerir));
      sugerir();
      $("me-ok").onclick = async (e) => {
        const nombre = $("me-nombre").value.trim(), objetivo = leerMonto($("me-obj").value), aporte = leerMonto($("me-aporte").value);
        const ya = $("me-ya") ? leerMonto($("me-ya").value) : 0, fecha = $("me-fecha").value;
        const falta = !nombre ? "Ponle nombre a la meta." : !objetivo ? "Escribe cuánto cuesta." : "";
        if (falta) { $("me-error").textContent = falta; $("me-error").hidden = false; return; }
        e.currentTarget.disabled = true;
        const datos = { nombre, objetivo, aporte_mensual: aporte, fecha_objetivo: fecha ? fecha + "-01" : null };
        const { error } = editando ? await sb.from("metas").update(datos).eq("id", meta.id) : await sb.from("metas").insert({ ...datos, ahorrado: ya });
        if (error) { $("me-error").textContent = "No se pudo guardar. Revisa el internet."; $("me-error").hidden = false; e.currentTarget.disabled = false; return; }
        await cargarTodo();
        cerrarHoja();
        estado.vista = "metas";
        pintarApp();
        toast(editando ? "Meta guardada" : "Meta creada");
      };
      const borrar = $("me-borrar");
      if (borrar) borrar.onclick = async () => {
        if (!borrar.dataset.seguro) { borrar.dataset.seguro = "1"; borrar.textContent = meta.ahorrado ? `Lo ahorrado (${pesos(meta.ahorrado)}) vuelve a tu saldo. Toca otra vez` : "¿Seguro? Toca otra vez"; return; }
        borrar.disabled = true;
        if (meta.ahorrado) await sb.from("movimientos").insert({ tipo: "retiro", monto: meta.ahorrado, meta_id: meta.id, descripcion: `Sacado de ${meta.nombre}` });
        await sb.from("metas").delete().eq("id", meta.id);
        await cargarTodo();
        cerrarHoja();
        pintarApp();
        toast("Meta borrada");
      };
    });
}

function abrirDeuda(deuda = null) {
  const editando = !!deuda;
  abrirHoja(`
    <h2>${editando ? "Editar deuda" : "Nueva deuda"}</h2>
    <div class="campo"><label for="de-desc">¿Qué debes?</label><input id="de-desc" value="${esc(deuda?.descripcion || "")}" placeholder="Ej: Cuota del celular, préstamo de Juan" autocomplete="off"></div>
    ${campoMonto("de-monto", "¿Cuánto?", deuda?.monto || 0)}
    <div class="campo"><label for="de-fecha">¿Para cuándo? <span class="sub">(opcional)</span></label><input id="de-fecha" type="date" value="${deuda?.fecha_limite || ""}"></div>
    <div class="aviso-error" id="de-error" hidden></div>
    <div class="acciones">
      <button class="boton" id="de-ok">Guardar</button>
      ${editando ? `<button class="boton peligro" id="de-borrar">Borrar</button>` : ""}
      <button class="boton texto" data-cerrar>Cancelar</button>
    </div>`,
    (hoja) => {
      const $ = (id) => hoja.querySelector("#" + id);
      formatearAlSalir(hoja, "de-monto");
      $("de-ok").onclick = async (e) => {
        const datos = { descripcion: $("de-desc").value.trim(), monto: leerMonto($("de-monto").value), fecha_limite: $("de-fecha").value || null };
        if (!datos.descripcion || !datos.monto) { $("de-error").textContent = "Escribe qué debes y cuánto."; $("de-error").hidden = false; return; }
        e.currentTarget.disabled = true;
        const { error } = editando ? await sb.from("deudas").update(datos).eq("id", deuda.id) : await sb.from("deudas").insert(datos);
        if (error) { toast("No se pudo guardar."); e.currentTarget.disabled = false; return; }
        await cargarTodo(); cerrarHoja(); pintarApp(); toast("Deuda guardada");
      };
      const borrar = $("de-borrar");
      if (borrar) borrar.onclick = async () => {
        if (!borrar.dataset.seguro) { borrar.dataset.seguro = "1"; borrar.textContent = "¿Seguro? Toca otra vez"; return; }
        await sb.from("deudas").delete().eq("id", deuda.id);
        await cargarTodo(); cerrarHoja(); pintarApp(); toast("Deuda borrada");
      };
    });
}

/* ---------- Yo ---------- */

function vistaYo() {
  const p = estado.perfil;
  const frec = { mensual: "Cada mes", quincenal: "Cada quincena", semanal: "Cada semana", variable: "Varía" }[p.frecuencia];
  const dias = p.frecuencia === "semanal" ? (p.dias_pago[0] != null ? "los " + DIAS_PLURAL[p.dias_pago[0]] : "") : p.dias_pago.length ? "días " + p.dias_pago.join(" y ") : "";
  return `
  <section class="pantalla inicio">
    <button class="volver" data-vista="inicio">← Inicio</button>
    <h1>${esc(p.nombre || "Tú")}</h1>
    <div>
      <div class="yo-dato"><span>Correo</span><span>${esc(estado.usuario.email)}</span></div>
      <div class="yo-dato"><span>Te pagan</span><span>${frec}${dias ? ", " + dias : ""}</span></div>
      <div class="yo-dato"><span>${p.frecuencia === "variable" ? "Al mes" : "Por pago"}</span><span class="num">${pesos(p.ingreso_por_pago)}</span></div>
      <div class="yo-dato"><span>Saldo</span><span class="num">${pesos(estado.saldo)}</span></div>
    </div>
    <div class="fila"><button class="boton claro" id="editar-pago">Mi pago</button><button class="boton claro" id="corregir-saldo">Corregir saldo</button></div>
    <div class="titulo-fila"><h2>Gastos fijos</h2><button class="chip" id="nuevo-fijo">+ Fijo</button></div>
    ${estado.fijos.length ? `<div class="lista-movs">${estado.fijos.map((f) => `<button class="mov" data-fijo="${f.id}"><i style="background:${COLOR_FIJOS}"></i><span class="txt">${esc(f.nombre)}<small>${f.dia_mes ? "día " + f.dia_mes : "sin día"}</small></span><span class="num">${pesos(f.monto)}</span></button>`).join("")}</div>` : `<p class="sub">No tienes gastos fijos.</p>`}
    <h2 class="titulo-lista">Avisos</h2>
    <div id="caja-avisos" class="caja-avisos"><p class="sub">Revisando…</p></div>
    <button class="boton claro" id="ir-gmail">Conectar Gmail del banco</button>
    <button class="boton texto" id="salir">Cerrar sesión</button>
  </section>`;
}

function engancharYo() {
  document.getElementById("salir").onclick = () => sb.auth.signOut();
  document.getElementById("ir-gmail").onclick = () => ir("gmail");
  document.getElementById("corregir-saldo").onclick = abrirSaldo;
  document.getElementById("editar-pago").onclick = abrirPago;
  document.getElementById("nuevo-fijo").onclick = () => abrirFijo();
  app.querySelectorAll("[data-fijo]").forEach((b) => (b.onclick = () => abrirFijo(estado.fijos.find((f) => f.id === b.dataset.fijo))));
  pintarAvisos();
}

function abrirPago() {
  const b = { frecuencia: estado.perfil.frecuencia, dias: [...estado.perfil.dias_pago], ingreso: estado.perfil.ingreso_por_pago };
  if (!b.dias.length) b.dias = [...DIAS_DEFECTO[b.frecuencia]];
  const pintar = (hoja) => {
    hoja.querySelector("#pago-cuerpo").innerHTML = `
      <div class="chips">${[["quincenal", "Quincena"], ["mensual", "Mes"], ["semanal", "Semana"], ["variable", "Varía"]].map(([v, t]) => `<button type="button" class="chip suave" data-frec="${v}" aria-pressed="${b.frecuencia === v}">${t}</button>`).join("")}</div>
      ${selectorDias(b)}
      ${campoMonto("pa-monto", b.frecuencia === "variable" ? "¿Cuánto te entra al mes?" : "¿Cuánto te llega en cada pago?", b.ingreso)}`;
    formatearAlSalir(hoja, "pa-monto");
    const leer = () => { b.ingreso = leerMonto(hoja.querySelector("#pa-monto").value); hoja.querySelectorAll(".dia-pago").forEach((el) => (b.dias[+el.dataset.i] = Math.min(31, Math.max(1, parseInt(el.value, 10) || 1)))); };
    hoja.querySelectorAll("[data-frec]").forEach((el) => (el.onclick = () => { leer(); b.frecuencia = el.dataset.frec; b.dias = [...DIAS_DEFECTO[b.frecuencia]]; pintar(hoja); }));
    hoja.querySelectorAll("[data-dia-semana]").forEach((el) => (el.onclick = () => { leer(); b.dias = [+el.dataset.diaSemana]; pintar(hoja); }));
    hoja._leer = leer;
  };
  abrirHoja(`<h2>Mi pago</h2><div id="pago-cuerpo" class="opciones"></div>
    <div class="acciones"><button class="boton" id="pa-ok">Guardar</button><button class="boton texto" data-cerrar>Cancelar</button></div>`,
    (hoja) => {
      pintar(hoja);
      hoja.querySelector("#pa-ok").onclick = async () => {
        hoja._leer();
        const { error } = await sb.from("perfiles").update({ frecuencia: b.frecuencia, dias_pago: b.dias, ingreso_por_pago: b.ingreso }).eq("id", estado.usuario.id);
        if (error) return toast("No se pudo guardar.");
        await cargarTodo(); cerrarHoja(); pintarApp(); toast("Guardado");
      };
    });
}

function abrirFijo(fijo = null) {
  abrirHoja(`
    <h2>${fijo ? "Editar gasto fijo" : "Nuevo gasto fijo"}</h2>
    <div class="campo"><label for="fi-nombre">¿Qué es?</label><input id="fi-nombre" value="${esc(fijo?.nombre || "")}" placeholder="Ej: Arriendo, plan celular" autocomplete="off"></div>
    <div class="fila">${campoMonto("fi-monto", "¿Cuánto?", fijo?.monto || 0)}
      <div class="campo"><label for="fi-dia">Día del mes</label><input id="fi-dia" inputmode="numeric" value="${fijo?.dia_mes || ""}" placeholder="1-31"></div></div>
    <div class="acciones"><button class="boton" id="fi-ok">Guardar</button>${fijo ? `<button class="boton peligro" id="fi-borrar">Borrar</button>` : ""}<button class="boton texto" data-cerrar>Cancelar</button></div>`,
    (hoja) => {
      const $ = (id) => hoja.querySelector("#" + id);
      formatearAlSalir(hoja, "fi-monto");
      $("fi-ok").onclick = async () => {
        const datos = { nombre: $("fi-nombre").value.trim(), monto: leerMonto($("fi-monto").value), dia_mes: Math.min(31, parseInt($("fi-dia").value, 10) || 0) || null };
        if (!datos.nombre || !datos.monto) return toast("Escribe qué es y cuánto.");
        const { error } = fijo ? await sb.from("gastos_fijos").update(datos).eq("id", fijo.id) : await sb.from("gastos_fijos").insert(datos);
        if (error) return toast("No se pudo guardar.");
        if (!estado.sobres.some((s) => s.tipo === "fijo")) await sb.from("sobres").insert({ nombre: "Fijos", tipo: "fijo", color: COLOR_FIJOS, presupuesto: 0, orden: 10 });
        await cargarTodo(); cerrarHoja(); pintarApp(); toast("Gasto fijo guardado");
      };
      const borrar = $("fi-borrar");
      if (borrar) borrar.onclick = async () => {
        if (!borrar.dataset.seguro) { borrar.dataset.seguro = "1"; borrar.textContent = "¿Seguro? Toca otra vez"; return; }
        await sb.from("gastos_fijos").update({ activo: false }).eq("id", fijo.id);
        await cargarTodo(); cerrarHoja(); pintarApp(); toast("Gasto fijo borrado");
      };
    });
}

/* ---------- Avisos en el celular ---------- */

const AVISOS_URL = "https://nuotkljmwojymfcodgph.supabase.co/functions/v1/luka-avisos";
const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function base64AUint8(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function estadoAvisos() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return esIphone && !instalada ? "instalar" : "no-soporta";
  if (Notification.permission === "denied") return "bloqueados";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "activos" : "apagados";
}

async function activarAvisos() {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") { toast("Sin permiso no te puedo avisar. Actívalo en los ajustes del navegador."); return false; }
  const { publica } = await (await fetch(AVISOS_URL)).json();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64AUint8(publica) });
  const j = sub.toJSON();
  const { error } = await sb.from("suscripciones").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
  if (error) { toast("No pude guardar el celular para los avisos."); return false; }
  return true;
}

async function apagarAvisos() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await sb.from("suscripciones").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
}

async function pintarAvisos() {
  const caja = document.getElementById("caja-avisos");
  if (!caja) return;
  const est = await estadoAvisos();
  const p = estado.perfil;
  const textos = {
    instalar: "En iPhone los avisos solo funcionan con Luka instalada: toca Compartir y luego «Agregar a inicio». Después abre Luka desde el ícono y vuelve aquí.",
    "no-soporta": "Este navegador no deja recibir avisos. Prueba con Chrome en Android o instalando Luka en el iPhone.",
    bloqueados: "Bloqueaste los avisos de Luka. Actívalos en los ajustes del navegador para este sitio.",
  };
  caja.innerHTML = textos[est] ? `<p class="sub">${textos[est]}</p>` : `
    <button class="boton ${est === "activos" ? "claro" : ""}" id="interruptor-avisos">${est === "activos" ? "Apagar avisos en este celular" : "Activar avisos en este celular"}</button>
    ${est === "activos" ? `
      ${[["aviso_manana", "Cuánto puedo gastar, a las 7 a. m."], ["aviso_noche", "Recordarme anotar, a las 9 p. m."], ["aviso_sobres", "Cuando una tarjeta se esté acabando"]].map(([k, t]) => `
        <label class="interruptor"><span>${t}</span><input type="checkbox" data-pref="${k}" ${p[k] ? "checked" : ""}></label>`).join("")}
      <button class="boton texto" id="prueba-aviso">Mandarme un aviso de prueba</button>` : ""}`;
  const b = document.getElementById("interruptor-avisos");
  if (b) b.onclick = async () => {
    b.disabled = true;
    if (est === "activos") { await apagarAvisos(); toast("Avisos apagados"); }
    else if (await activarAvisos()) toast("¡Listo! Te voy a avisar.");
    pintarAvisos();
  };
  caja.querySelectorAll("[data-pref]").forEach((c) => (c.onchange = async () => {
    const { error } = await sb.from("perfiles").update({ [c.dataset.pref]: c.checked }).eq("id", estado.usuario.id);
    if (error) { c.checked = !c.checked; toast("No se pudo guardar."); return; }
    estado.perfil[c.dataset.pref] = c.checked;
  }));
  const prueba = document.getElementById("prueba-aviso");
  if (prueba) prueba.onclick = async () => {
    prueba.disabled = true;
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(AVISOS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ tipo: "prueba" }) }).then((x) => x.json()).catch(() => ({}));
    toast(r.enviados ? "Aviso enviado. Debe llegarte en segundos." : "No pude mandar el aviso. Apaga y vuelve a activar los avisos.");
    prueba.disabled = false;
  };
}

/* ---------- Gmail del banco (Apps Script de cada persona) ---------- */

const CODIGO_SCRIPT = `// Luka: lee las alertas de tu banco en Gmail y las anota en Luka.
// Solo puede LEER correos (no enviar ni borrar) y solo busca correos de bancos.
// A Luka solo le manda el asunto y el texto de esas alertas.
const LUKA_LLAVE = "__LLAVE__";
const LUKA_URL = "https://nuotkljmwojymfcodgph.supabase.co/functions/v1/luka-gmail";
const BUSQUEDA = "{from:nu.com.co from:bancolombia from:notificacionesbancolombia.com from:nequi from:daviplata from:davivienda from:bbva from:bancodebogota from:avvillas from:bancopopular from:colpatria from:scotiabankcolpatria from:lulobank from:bancofalabella from:itau from:bancocajasocial from:rappipay from:movii} -category:promotions newer_than:2d";

function activar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("revisar").timeBased().everyMinutes(15).create();
  revisar();
  Logger.log("Listo: Luka va a revisar tus alertas cada 15 minutos.");
}

function gmail(ruta) {
  var r = UrlFetchApp.fetch("https://gmail.googleapis.com/gmail/v1/users/me/" + ruta, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() } });
  return JSON.parse(r.getContentText());
}

function textoDe(parte) {
  if (!parte) return "";
  var datos = parte.body && parte.body.data ? Utilities.newBlob(Utilities.base64DecodeWebSafe(parte.body.data)).getDataAsString("UTF-8") : "";
  if (parte.mimeType === "text/plain" && datos) return datos;
  if (parte.parts) for (var i = 0; i < parte.parts.length; i++) { var t = textoDe(parte.parts[i]); if (t) return t; }
  if (parte.mimeType === "text/html" && datos) return datos.replace(/<style[\\s\\S]*?<\\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return "";
}

function revisar() {
  var props = PropertiesService.getScriptProperties();
  var vistos = JSON.parse(props.getProperty("vistos") || "[]");
  var lista = gmail("messages?maxResults=25&q=" + encodeURIComponent(BUSQUEDA)).messages || [];
  var alertas = [];
  lista.forEach(function (m) {
    if (vistos.indexOf(m.id) >= 0) return;
    var c = gmail("messages/" + m.id + "?format=full");
    var h = function (n) { var x = (c.payload.headers || []).filter(function (y) { return y.name.toLowerCase() === n; })[0]; return x ? x.value : ""; };
    alertas.push({ id: m.id, fecha: new Date(Number(c.internalDate)).toISOString(), de: h("from"), asunto: h("subject"), texto: (textoDe(c.payload) || c.snippet || "").slice(0, 3000) });
  });
  var r = UrlFetchApp.fetch(LUKA_URL, { method: "post", contentType: "application/json", payload: JSON.stringify({ llave: LUKA_LLAVE, alertas: alertas }), muteHttpExceptions: true });
  if (r.getResponseCode() === 200) props.setProperty("vistos", JSON.stringify(vistos.concat(alertas.map(function (a) { return a.id; })).slice(-300)));
  else Logger.log("Luka respondió: " + r.getContentText());
}
`;

const MANIFIESTO_SCRIPT = `{
  "timeZone": "America/Bogota",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
`;

async function huellaTexto(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function haceCuanto(fecha) {
  const min = Math.round((Date.now() - new Date(fecha)) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function vistaGmail() {
  if (estado.conexionGmail === undefined) {
    sb.from("conexiones_gmail").select("ultima_vez,total,creado").maybeSingle().then(({ data }) => { estado.conexionGmail = data || null; if (estado.vista === "gmail") pintarApp(); });
    return `<section class="pantalla inicio"><p class="sub">Cargando…</p></section>`;
  }
  const c = estado.conexionGmail, llave = estado.llaveGmail;
  const estadoTxt = !c ? "" : c.ultima_vez
    ? `<div class="nota verde"><b>Conectado</b>Última revisión ${haceCuanto(c.ultima_vez)}. Luka ha anotado ${c.total} ${c.total === 1 ? "movimiento" : "movimientos"} de tu correo.</div>`
    : `<div class="nota"><b>Esperando la primera revisión</b>Si ya hiciste los pasos y ejecutaste «activar», en unos minutos aparece aquí como conectado.</div>`;
  return `
  <section class="pantalla inicio">
    <button class="volver" data-vista="yo">← Yo</button>
    <h1>Gmail del banco</h1>
    <p class="sub">Luka puede anotar sola los pagos que te llegan como alerta al correo (Nu, Bancolombia, Nequi, Davivienda y otros). Funciona con un pequeño programa que instalas en tu propio Gmail: solo puede leer, y solo le manda a Luka las alertas del banco.</p>
    ${estadoTxt}
    ${llave ? `
      <ol class="pasos">
        <li>Hazlo desde un <b>computador</b>, con la cuenta de Gmail donde te llegan las alertas del banco.</li>
        <li>Abre <a href="https://script.new" target="_blank" rel="noopener">script.new</a>. Arriba, cámbiale el nombre a <b>Luka</b>.</li>
        <li>Borra lo que hay en el editor y pega el <b>Código 1</b>.
          <div class="codigo"><button class="chip" data-copiar="codigo">Copiar código 1</button><pre id="codigo">${esc(CODIGO_SCRIPT.replace("__LLAVE__", llave))}</pre></div></li>
        <li>En el menú de la izquierda toca el engranaje <b>Configuración del proyecto</b> y marca <b>«Mostrar el archivo de manifiesto appsscript.json en el editor»</b>.</li>
        <li>Vuelve al <b>Editor</b> (el ícono <code>&lt;&gt;</code>), abre <b>appsscript.json</b>, borra todo y pega el <b>Código 2</b>.
          <div class="codigo"><button class="chip" data-copiar="manifiesto">Copiar código 2</button><pre id="manifiesto">${esc(MANIFIESTO_SCRIPT)}</pre></div></li>
        <li>Guarda con <b>Ctrl + S</b>. Abre de nuevo <b>Código.gs</b>, arriba escoge la función <b>activar</b> y toca <b>Ejecutar</b>.</li>
        <li>Google te pide permiso: <b>Revisar permisos</b> → tu cuenta → <b>Configuración avanzada</b> → <b>Ir a Luka (no seguro)</b> → <b>Permitir</b>. Dice «no seguro» porque el programa es tuyo y Google no lo revisó; solo puede leer tus correos.</li>
        <li>¡Listo! Cada 15 minutos Luka revisa tus alertas y te avisa en el chat lo que anotó.</li>
      </ol>
      <p class="sub">Este código es solo tuyo: no se lo pases a nadie. Si sales de esta pantalla ya no se vuelve a mostrar, pero puedes generar uno nuevo.</p>`
    : `<button class="boton" id="generar-gmail">${c ? "Generar código nuevo" : "Conectar mi Gmail"}</button>
       ${c ? `<p class="sub">Generar un código nuevo apaga el anterior: te tocaría pegar el código 1 otra vez en tu script.</p>` : ""}`}
    ${c ? `<button class="boton texto" id="desconectar-gmail">Desconectar Gmail</button>` : ""}
  </section>`;
}

function engancharGmail() {
  const gen = document.getElementById("generar-gmail");
  if (gen) gen.onclick = async () => {
    gen.disabled = true;
    const llave = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await sb.from("conexiones_gmail").upsert({ user_id: estado.usuario.id, llave_hash: await huellaTexto(llave), ultima_vez: null, total: estado.conexionGmail?.total || 0 });
    if (error) { toast("No pude crear el código. Intenta otra vez."); gen.disabled = false; return; }
    estado.llaveGmail = llave;
    estado.conexionGmail = { ultima_vez: null, total: estado.conexionGmail?.total || 0 };
    pintarApp();
  };
  app.querySelectorAll("[data-copiar]").forEach((b) => (b.onclick = async () => {
    const pre = document.getElementById(b.dataset.copiar);
    try { await navigator.clipboard.writeText(pre.textContent); toast("Copiado"); }
    catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Quedó seleccionado: cópialo con Ctrl + C"); }
  }));
  const des = document.getElementById("desconectar-gmail");
  if (des) des.onclick = async () => {
    if (!des.dataset.seguro) { des.dataset.seguro = "1"; des.textContent = "Luka deja de leer tus alertas. Toca otra vez"; return; }
    await sb.from("conexiones_gmail").delete().eq("user_id", estado.usuario.id);
    estado.conexionGmail = null; estado.llaveGmail = null;
    pintarApp();
    toast("Gmail desconectado. Si quieres, borra también el script en script.google.com.");
  };
}

/* ---------- Chat con Luka ---------- */

const LUKA_CHAT_URL = "https://qzszwuiehdjndzqfbvsw.supabase.co/functions/v1/luka-chat";
const SUGERENCIAS = ["Gasté 15k en almuerzo", "¿Cuánto puedo gastar hoy?", "¿En qué se me va la plata?"];

async function cargarChat() {
  const { data, error } = await sb.from("mensajes").select("*").order("creado", { ascending: false }).limit(40);
  estado.chat = error ? [] : data.reverse();
}

async function guardarMensaje(rol, texto, extra = {}) {
  const local = { id: "tmp-" + Math.random().toString(36).slice(2), rol, texto, extra, creado: new Date().toISOString() };
  estado.chat.push(local);
  const { data } = await sb.from("mensajes").insert({ rol, texto, extra }).select().single();
  if (data) Object.assign(local, data);
  return local;
}

function burbuja(m, i) {
  if (m.rol === "yo") return `<div class="msg yo">${esc(m.texto)}</div>`;
  const x = m.extra || {};
  const tarjetas = (x.tarjetas || []).map((t) => `<div class="mini" style="--c:${t.color};--t:${letraDe(t.color)}"><span>${esc(t.nombre)} · ${esc(t.descripcion)}</span><span class="num">${t.tipo === "ingreso" ? "+" : "−"}${pesos(t.monto)}</span></div>`).join("");
  const lineas = (x.lineas || []).map((l) => `<span class="linea">${esc(l)}</span>`).join("");
  const mover = (x.mover || []).filter((p) => p.hecho).map((p) => `<span class="hecho">Movidos ${pesos(p.monto)} de ${esc(p.de)} a ${esc(p.a)}</span>`).join("");
  const botones = i === estado.chat.length - 1 ? (x.botones || []).map((b) => `<button class="chip suave" data-decir="${esc(b)}">${esc(b)}</button>`).join("") : "";
  const globo = m.texto || lineas ? `<div class="msg luka">${esc(m.texto)}${m.texto && lineas ? "<br>" : ""}${lineas}</div>` : "";
  return `${m.texto.endsWith(":") ? globo + tarjetas : tarjetas + globo}${mover || botones ? `<div class="chips acciones-msg">${mover}${botones}</div>` : ""}`;
}

function vistaLuka() {
  if (!estado.chat) {
    cargarChat().then(() => { if (estado.vista === "luka") pintarApp(); });
    return `<section class="pantalla chat"><p class="sub">Cargando…</p></section>`;
  }
  const vacio = !estado.chat.length;
  return `
  <section class="chat">
    <header class="chat-cabeza"><span class="av">L</span><div>Luka<small>anota lo que gastas y responde tus dudas</small></div></header>
    <div class="msgs" id="msgs">
      ${vacio ? `<div class="msg luka">¡Hola${estado.perfil?.nombre ? ", " + esc(estado.perfil.nombre.split(" ")[0]) : ""}! Cuéntame en qué gastaste, como se lo dirías a un amigo: "gasté 12 en un perro y 32 en gasolina". También puedes preguntarme si te alcanza para algo.</div>
        <div class="chips acciones-msg">${SUGERENCIAS.map((s) => `<button class="chip suave" data-decir="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : estado.chat.map(burbuja).join("")}
      ${estado.pensando ? `<div class="msg luka pensando" aria-label="Luka está escribiendo"><i></i><i></i><i></i></div>` : ""}
    </div>
    <form class="redactar" id="redactar">
      <button type="button" class="mas" data-anotar aria-label="Anotar con formulario">+</button>
      <input id="texto-chat" placeholder="Escribe lo que gastaste o pregunta…" autocomplete="off" maxlength="600" ${estado.pensando ? "disabled" : ""}>
      <button type="submit" class="enviar" aria-label="Enviar" ${estado.pensando ? "disabled" : ""}>↑</button>
    </form>
  </section>`;
}

function engancharLuka() {
  const msgs = document.getElementById("msgs");
  if (!msgs) return;
  msgs.scrollTop = msgs.scrollHeight;
  window.scrollTo(0, document.body.scrollHeight);
  const input = document.getElementById("texto-chat");
  document.getElementById("redactar").onsubmit = (e) => { e.preventDefault(); decir(input.value); };
  app.querySelectorAll("[data-decir]").forEach((b) => (b.onclick = () => decir(b.dataset.decir)));
  if (!estado.pensando && matchMedia("(pointer: fine)").matches) input.focus();
}

// Busca la tarjeta por nombre; si no, por pistas; si no, Otros o la primera de gasto
function tarjetaPorNombre(nombre, descripcion) {
  const n = (nombre || "").trim().toLowerCase();
  const exacta = estado.sobres.find((s) => s.tipo !== "ahorro" && s.nombre.toLowerCase() === n);
  if (exacta) return exacta;
  const porPista = sobreDe(sobrePorPista(descripcion));
  if (porPista) return porPista;
  return estado.sobres.find((s) => s.nombre === "Otros") || estado.sobres.find((s) => s.tipo === "gasto");
}

async function decir(texto) {
  texto = (texto || "").trim();
  if (!texto || estado.pensando) return;
  const historial = estado.chat.slice(-10).map((m) => ({ rol: m.rol, texto: [m.texto, ...(m.extra?.lineas || [])].filter(Boolean).join(" ") }));
  await guardarMensaje("yo", texto);
  estado.pensando = true;
  pintarApp();

  let r;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const resp = await fetch(LUKA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ mensaje: texto, historial, resumen: resumenParaLuka() }),
    });
    r = await resp.json();
    if (!resp.ok) throw new Error(r.error || "error");
  } catch (e) {
    estado.pensando = false;
    await guardarMensaje("luka", e.message && e.message !== "Failed to fetch" && e.message !== "error" ? e.message : "No pude conectarme. Revisa el internet e intenta otra vez.");
    pintarApp();
    return;
  }

  // Anotar lo que la persona contó
  const hoy = fechaLocal(new Date());
  const tarjetas = [], filas = [];
  for (const a of r.anotar || []) {
    const s = a.tipo === "gasto" ? tarjetaPorNombre(a.sobre, a.descripcion) : null;
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(a.fecha || "") && a.fecha <= hoy ? a.fecha : hoy;
    filas.push({
      tipo: a.tipo, monto: a.monto, descripcion: a.descripcion || "", metodo: METODOS.includes(a.metodo) ? a.metodo : "",
      sobre_id: s?.id || null, origen: "chat",
      fecha: fecha === hoy ? new Date().toISOString() : new Date(fecha + "T12:00:00").toISOString(),
    });
    tarjetas.push({ nombre: s ? s.nombre : "Ingreso", color: s ? s.color : "#1f7a55", descripcion: a.descripcion || "", monto: a.monto, tipo: a.tipo });
  }
  const lineas = [];
  if (filas.length) {
    const { error } = await sb.from("movimientos").insert(filas);
    if (error) {
      estado.pensando = false;
      await guardarMensaje("luka", "Entendí, pero no pude guardar. Revisa el internet e intenta otra vez.");
      pintarApp();
      return;
    }
    await cargarTodo();
    const plan = planDelDia(), ini = inicioDeMes(), man = sumaDias(hoy0(), 1);
    for (const id of [...new Set(filas.filter((f) => f.sobre_id).map((f) => f.sobre_id))]) {
      const x = sobreDe(id);
      lineas.push(`Llevas ${pesos(suma(gastosEntre(ini, man).filter((m) => m.sobre_id === id)))} en ${x.nombre} este mes.`);
    }
    if (filas.some((f) => f.tipo === "gasto")) lineas.push(plan.quedaHoy >= 0 ? `Hoy te quedan ${pesos(plan.quedaHoy)}.` : `Hoy te pasaste ${pesos(-plan.quedaHoy)}.`);
    if (filas.some((f) => f.tipo === "ingreso")) lineas.push(`Ahora tienes ${pesos(estado.saldo)}.`);
  }

  const textoLuka = r.respuesta || (filas.length ? (filas.length === 1 ? "Listo, anotado." : `Listo, anoté ${filas.length}.`) : "");
  estado.pensando = false;
  await guardarMensaje("luka", textoLuka, { tarjetas, lineas, botones: r.botones || [] });
  pintarApp();
}

// Lo que Luka necesita saber de tu plata, con las cuentas ya hechas aquí
function resumenParaLuka() {
  const h = hoy0(), ini = inicioDeMes(), man = sumaDias(h, 1);
  const iniAnt = new Date(h.getFullYear(), h.getMonth() - 1, 1);
  const plan = planDelDia();
  const g = gastosEntre(ini, man), gAnt = gastosEntre(iniAnt, ini);
  const lun = lunesDe(h);
  return [
    `Saldo disponible ahora: ${pesos(estado.saldo)}.`,
    `Próximo pago: ${fechaLocal(plan.pago)} (${cuandoTxt(plan.pago)}), de unos ${pesos(estado.perfil.ingreso_por_pago)}. Le pagan: ${estado.perfil.frecuencia}.`,
    `Puede gastar por día hasta el pago: ${pesos(plan.porDia)}. Hoy gastó ${pesos(plan.gastadoHoy)}; ${plan.quedaHoy >= 0 ? `le quedan ${pesos(plan.quedaHoy)} hoy` : `se pasó ${pesos(-plan.quedaHoy)} hoy`}.`,
    `Fijos pendientes antes del pago: ${plan.fijosAntes.map((f) => `${f.nombre} ${pesos(f.monto)} (día ${f.dia_mes})`).join(", ") || "ninguno"}.`,
    `Esta semana gastó ${pesos(suma(gastosEntre(lun, man)))}. Este mes: entró ${pesos(suma(ingresosEntre(ini, man)))} y gastó ${pesos(suma(g))}. El mes pasado gastó ${pesos(suma(gAnt))} en total.`,
    `Gastado este mes por tarjeta: ${categorias().map((c) => `${c.nombre} ${pesos(suma(g.filter((m) => m.sobre_id === c.id)))}${c.presupuesto ? ` (tope ${pesos(c.presupuesto)})` : ""} [mes pasado ${pesos(suma(gAnt.filter((m) => m.sobre_id === c.id)))}]`).join("; ")}.`,
    `Metas: ${metasActivas().map((m) => `${m.nombre}: ${pesos(m.ahorrado)} de ${pesos(m.objetivo)}, aporta ${pesos(m.aporte_mensual)} al mes`).join("; ") || "ninguna"}.`,
    `Deudas pendientes: ${estado.deudas.filter((d) => !d.pagada).map((d) => `${d.descripcion} ${pesos(d.monto)}${d.fecha_limite ? ` vence ${d.fecha_limite}` : ""}`).join("; ") || "ninguna"}.`,
  ].join("\n");
}
/* ---------- Al volver a la app ---------- */

// Traer lo nuevo (por ejemplo, lo que Luka anotó desde el correo)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !estado.usuario || !estado.perfil?.bienvenida_lista) return;
  if (document.querySelector(".fondo-hoja") || estado.pensando || estado.vista === "ajustar") return;
  try { await cargarTodo(); } catch { return; }
  estado.chat = null;
  estado.conexionGmail = undefined;
  if (!document.querySelector(".fondo-hoja")) pintarApp();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
