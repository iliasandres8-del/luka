// Luka: plata en sobres, con alguien que te avisa.
// Parte 1: cuentas, bienvenida (ingreso, fijos, meta y reparto en sobres) e inicio con la billetera.

const SUPABASE_URL = "https://nuotkljmwojymfcodgph.supabase.co";
const SUPABASE_KEY = "sb_publishable_L1ZV86fVmwvaHigXBEjADw_b67Tws9L";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const app = document.getElementById("app");

// Colores de cada sobre: fondo y letra
const COLORES = {
  Comida: ["#e2b13c", "#2a1e05"],
  Transporte: ["#3f8f6b", "#f2fff8"],
  Salidas: ["#c4553b", "#fff3ef"],
  Ahorro: ["#2f4fb5", "#eef2ff"],
  Fijos: ["#8a968f", "#ffffff"],
  Otros: ["#7a5bb5", "#f6f1ff"],
};
const letraDe = (fondo) => (Object.values(COLORES).find(([c]) => c === fondo) || [fondo, "#ffffff"])[1];

// Cuántos pagos hay en un mes según la frecuencia
const PAGOS_AL_MES = { mensual: 1, quincenal: 2, semanal: 52 / 12, variable: 1 };

const estado = {
  usuario: null,
  perfil: null,
  sobres: [],
  metas: [],
  fijos: [],
  movimientos: [],
  vista: "inicio",
  bienvenida: null,
};

/* ---------- Utilidades ---------- */

const pesos = (n) => "$" + Math.round(n || 0).toLocaleString("es-CO");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const redondear = (n) => Math.max(0, Math.round(n / 1000) * 1000);

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

function inicioDeMes(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function diasQuedan(d = new Date()) {
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return fin - d.getDate() + 1; // incluye hoy
}

/* ---------- Datos ---------- */

async function cargarTodo() {
  const id = estado.usuario.id;
  const desde = inicioDeMes().toISOString();
  const [p, s, m, f, mv] = await Promise.all([
    sb.from("perfiles").select("*").eq("id", id).maybeSingle(),
    sb.from("sobres").select("*").eq("archivado", false).order("orden"),
    sb.from("metas").select("*").eq("lograda", false).order("creado"),
    sb.from("gastos_fijos").select("*").eq("activo", true).order("dia_mes", { nullsFirst: false }),
    sb.from("movimientos").select("*").gte("fecha", desde).order("fecha", { ascending: false }),
  ]);
  const error = p.error || s.error || m.error || f.error || mv.error;
  if (error) throw error;
  estado.perfil = p.data;
  estado.sobres = s.data;
  estado.metas = m.data;
  estado.fijos = f.data;
  estado.movimientos = mv.data;
}

// Lo que queda en cada sobre este mes: presupuesto − gastos + lo que le pasaron − lo que sacaron
function saldos() {
  const r = {};
  for (const s of estado.sobres) r[s.id] = s.presupuesto;
  for (const m of estado.movimientos) {
    if (m.tipo === "gasto" && m.sobre_id in r) r[m.sobre_id] -= m.monto;
    if (m.tipo === "traslado") {
      if (m.sobre_id in r) r[m.sobre_id] -= m.monto;
      if (m.sobre_destino_id in r) r[m.sobre_destino_id] += m.monto;
    }
  }
  return r;
}

/* ---------- Arranque y sesión ---------- */

sb.auth.onAuthStateChange((evento, sesion) => {
  if (evento === "PASSWORD_RECOVERY") { estado.recuperando = true; estado.usuario = sesion?.user || null; pintarNuevaClave(); return; }
  const antes = estado.usuario?.id;
  estado.usuario = sesion?.user || null;
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
      <h1>Tu plata en sobres, con alguien que te avisa.</h1>
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

function empezarBienvenida() {
  estado.bienvenida = {
    paso: 1,
    nombre: estado.perfil?.nombre || estado.usuario.user_metadata?.nombre || "",
    frecuencia: estado.perfil?.frecuencia || "quincenal",
    ingreso: estado.perfil?.ingreso_por_pago || 0,
    fijos: [],
    meta: { nombre: "", objetivo: 0, ahorrado: 0, fecha: "" },
    sinMeta: false,
    reparto: null,
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
  const pasos = { 1: pasoIngreso, 2: pasoFijos, 3: pasoMeta, 4: pasoReparto };
  pasos[b.paso](b);
  window.scrollTo(0, 0);
}

function pasoIngreso(b) {
  const frecuencias = [
    ["mensual", "Cada mes", "Te pagan una vez al mes"],
    ["quincenal", "Cada quincena", "Dos pagos al mes"],
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
    <div class="campo">
      <label for="ingreso">${b.frecuencia === "variable" ? "¿Cuánto te entra al mes, más o menos?" : "¿Cuánto te llega en cada pago, más o menos?"}</label>
      <input id="ingreso" class="grande" inputmode="decimal" placeholder="Ej: 480.000 o 480k" value="${b.ingreso ? pesos(b.ingreso) : ""}">
      <span class="ayuda" id="ayuda-ingreso">${b.ingreso && b.frecuencia !== "mensual" && b.frecuencia !== "variable" ? "Al mes son " + pesos(ingresoMensual(b)) : "Puedes escribir 480k o 1,2 millones."}</span>
    </div>
    <div class="acciones">
      ${puntos(1)}
      <button class="boton" id="seguir">Seguir</button>
    </div>
  </section>`;

  app.querySelectorAll("[data-frec]").forEach((el) => (el.onclick = () => { b.frecuencia = el.dataset.frec; b.ingreso = leerMonto(document.getElementById("ingreso").value); pasoIngreso(b); }));
  const input = document.getElementById("ingreso");
  input.oninput = () => {
    b.ingreso = leerMonto(input.value);
    const ayuda = document.getElementById("ayuda-ingreso");
    ayuda.textContent = b.ingreso ? (b.frecuencia === "mensual" || b.frecuencia === "variable" ? pesos(b.ingreso) + " al mes" : pesos(b.ingreso) + " por pago · al mes son " + pesos(ingresoMensual(b))) : "Puedes escribir 480k o 1,2 millones.";
  };
  input.onblur = () => { if (b.ingreso) input.value = pesos(b.ingreso); };
  document.getElementById("seguir").onclick = () => {
    if (!b.ingreso) { toast("Escribe cuánto te entra, aunque sea un aproximado."); input.focus(); return; }
    b.paso = 2; pintarBienvenida();
  };
}

const SUGERIDOS_FIJOS = ["Arriendo", "Plan celular", "Cuota moto", "Internet", "Servicios", "Netflix", "Spotify", "Gimnasio"];

function pasoFijos(b) {
  const usados = new Set(b.fijos.map((f) => f.nombre));
  app.innerHTML = `
  <section class="pantalla">
    <span class="paso">Paso 2 de 4</span>
    <h1>¿Qué pagas fijo todos los meses?</h1>
    <p class="sub">Arriendo, plan del celular, cuotas, suscripciones. Si no pagas nada fijo, sigue.</p>
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
  app.innerHTML = `
  <section class="pantalla">
    <span class="paso">Paso 3 de 4</span>
    <h1>¿Para qué quieres ahorrar?</h1>
    <p class="sub">Una moto, un viaje, un celular, un fondo para emergencias. Con una meta es más fácil no gastarse todo.</p>
    <div class="chips">${["Moto", "Viaje", "Celular nuevo", "Emergencias", "Estudio"].map((n) => `<button type="button" class="chip" data-meta="${n}">${n}</button>`).join("")}</div>
    <div class="campo"><label for="meta-nombre">Mi meta</label><input id="meta-nombre" value="${esc(m.nombre)}" placeholder="Ej: Moto"></div>
    <div class="fila">
      <div class="campo"><label for="meta-obj">¿Cuánto cuesta?</label><input id="meta-obj" inputmode="decimal" value="${m.objetivo ? pesos(m.objetivo) : ""}" placeholder="Ej: 4 millones"></div>
      <div class="campo"><label for="meta-ya">¿Ya tienes algo?</label><input id="meta-ya" inputmode="decimal" value="${m.ahorrado ? pesos(m.ahorrado) : ""}" placeholder="$0"></div>
    </div>
    <div class="campo"><label for="meta-fecha">¿Para cuándo la quieres? <span class="sub">(opcional)</span></label><input id="meta-fecha" type="month" value="${esc(m.fecha)}"></div>
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
    m.fecha = document.getElementById("meta-fecha").value;
  };
  app.querySelectorAll("[data-meta]").forEach((el) => (el.onclick = () => { leer(); m.nombre = el.dataset.meta; pasoMeta(b); document.getElementById("meta-obj").focus(); }));
  ["meta-obj", "meta-ya"].forEach((id) => { const el = document.getElementById(id); el.onblur = () => { const n = leerMonto(el.value); if (n) el.value = pesos(n); }; });
  document.getElementById("atras").onclick = () => { leer(); b.paso = 2; pintarBienvenida(); };
  document.getElementById("sin-meta").onclick = () => { leer(); b.sinMeta = true; b.reparto = null; b.paso = 4; pintarBienvenida(); };
  document.getElementById("seguir").onclick = () => {
    leer();
    if (!m.nombre || !m.objetivo) { toast("Ponle nombre y cuánto cuesta, o toca «Todavía no tengo meta»."); return; }
    if (m.ahorrado >= m.objetivo) { toast("Ya tienes lo de esa meta. ¡Ponte una más grande!"); return; }
    b.sinMeta = false; b.reparto = null; b.paso = 4; pintarBienvenida();
  };
}

// Reparto que propone Luka: primero ahorro, y lo demás entre comida, transporte, salidas y otros
function proponerReparto(b) {
  const libre = Math.max(0, ingresoMensual(b) - totalFijos(b));
  let ahorro = redondear(libre * (b.sinMeta ? 0.10 : 0.20));
  if (!b.sinMeta && b.meta.fecha) {
    const [a, mes] = b.meta.fecha.split("-").map(Number);
    const hoy = new Date();
    const meses = Math.max(1, (a - hoy.getFullYear()) * 12 + (mes - 1 - hoy.getMonth()));
    const necesita = redondear((b.meta.objetivo - b.meta.ahorrado) / meses);
    ahorro = Math.min(redondear(libre * 0.4), Math.max(ahorro, necesita));
  }
  const resto = libre - ahorro;
  const r = { Comida: redondear(resto * 0.45), Transporte: redondear(resto * 0.2), Salidas: redondear(resto * 0.2) };
  r.Otros = Math.max(0, resto - r.Comida - r.Transporte - r.Salidas);
  r.Ahorro = ahorro;
  return r;
}

function proyeccionMeta(b, ahorroMes) {
  if (b.sinMeta) return "";
  const falta = b.meta.objetivo - b.meta.ahorrado;
  if (ahorroMes <= 0) return `Sin ahorrar nada al mes no llegas a tu meta «${esc(b.meta.nombre)}».`;
  const meses = Math.ceil(falta / ahorroMes);
  const d = new Date(); d.setMonth(d.getMonth() + meses);
  let texto = `Ahorrando ${pesos(ahorroMes)} al mes, tu meta «${esc(b.meta.nombre)}» se cumple en <strong>${MESES[d.getMonth()]} de ${d.getFullYear()}</strong>`;
  if (b.meta.fecha) {
    const [a, m] = b.meta.fecha.split("-").map(Number);
    const quiere = new Date(a, m - 1, 28);
    texto += d <= quiere ? ", a tiempo para lo que querías." : `, después de lo que querías (${MESES[m - 1]} de ${a}). Súbele al ahorro o mueve la fecha.`;
  } else texto += ".";
  return texto;
}

function pasoReparto(b) {
  if (!b.reparto) b.reparto = proponerReparto(b);
  const libre = Math.max(0, ingresoMensual(b) - totalFijos(b));
  const nombres = ["Comida", "Transporte", "Salidas", "Otros", "Ahorro"];
  const etiqueta = (n) => (n === "Ahorro" && !b.sinMeta ? `Ahorro · ${esc(b.meta.nombre)}` : n);
  const fijosMal = totalFijos(b) > ingresoMensual(b);

  app.innerHTML = `
  <section class="pantalla">
    <span class="paso">Paso 4 de 4</span>
    <h1>Así te propongo repartir ${pesos(libre)} al mes</h1>
    <p class="sub">Es lo que te queda después de los fijos (${pesos(totalFijos(b))}). Mueve las barras si quieres otra cosa.</p>
    ${fijosMal ? `<div class="aviso-error">Tus gastos fijos son más que lo que te entra. Revisa el paso 2 o el ingreso del paso 1.</div>` : ""}
    <div class="reparto">
      ${nombres.map((n) => `
      <div class="sobre-reparto" style="--c:${COLORES[n][0]}">
        <div class="cab"><span><i style="background:${COLORES[n][0]}"></i>${etiqueta(n)}</span><span class="num" id="v-${n}">${pesos(b.reparto[n])}</span></div>
        <input type="range" min="0" max="${Math.max(libre, 1000)}" step="1000" value="${b.reparto[n]}" data-sobre="${n}" aria-label="${n}">
      </div>`).join("")}
    </div>
    <div class="saldo-reparto" id="saldo"></div>
    <div class="nota" id="proyeccion" ${b.sinMeta ? "hidden" : ""}></div>
    <div class="acciones">
      ${puntos(4)}
      <button class="boton" id="listo">Me sirve, empezar</button>
      <button class="boton texto" id="reiniciar">Volver a lo que propuso Luka</button>
      <button class="boton texto" id="atras">Atrás</button>
    </div>
  </section>`;

  const actualizar = () => {
    const usado = nombres.reduce((t, n) => t + b.reparto[n], 0);
    const queda = libre - usado;
    const saldo = document.getElementById("saldo");
    saldo.className = "saldo-reparto" + (queda < 0 ? " malo" : "");
    saldo.innerHTML = queda < 0 ? `<span>Te pasaste</span><span class="num">${pesos(-queda)}</span>` : `<span>${queda ? "Sin repartir (va a Otros)" : "Todo repartido"}</span><span class="num">${pesos(queda)}</span>`;
    document.getElementById("listo").disabled = queda < 0;
    document.getElementById("proyeccion").innerHTML = proyeccionMeta(b, b.reparto.Ahorro);
  };
  app.querySelectorAll("[data-sobre]").forEach((el) => (el.oninput = () => {
    b.reparto[el.dataset.sobre] = +el.value;
    document.getElementById("v-" + el.dataset.sobre).textContent = pesos(+el.value);
    actualizar();
  }));
  actualizar();
  document.getElementById("reiniciar").onclick = () => { b.reparto = proponerReparto(b); pasoReparto(b); };
  document.getElementById("atras").onclick = () => { b.paso = 3; pintarBienvenida(); };
  document.getElementById("listo").onclick = (e) => guardarBienvenida(b, libre, e.currentTarget);
}

async function guardarBienvenida(b, libre, boton) {
  boton.disabled = true; boton.textContent = "Armando tu billetera…";
  try {
    const r = { ...b.reparto };
    const usado = Object.values(r).reduce((t, n) => t + n, 0);
    r.Otros += Math.max(0, libre - usado);

    // Si ya había empezado antes, se borra lo de la bienvenida anterior
    await sb.from("metas").delete().eq("user_id", estado.usuario.id);
    await sb.from("gastos_fijos").delete().eq("user_id", estado.usuario.id);
    await sb.from("sobres").delete().eq("user_id", estado.usuario.id);

    const orden = ["Comida", "Transporte", "Salidas", "Otros", "Ahorro"];
    const filas = orden.filter((n) => n !== "Otros" || r.Otros > 0).map((n, i) => ({
      nombre: n === "Ahorro" && !b.sinMeta ? b.meta.nombre : n,
      tipo: n === "Ahorro" ? "ahorro" : "gasto",
      color: COLORES[n][0],
      presupuesto: r[n],
      orden: i,
    }));
    if (b.fijos.length) filas.push({ nombre: "Fijos", tipo: "fijo", color: COLORES.Fijos[0], presupuesto: totalFijos(b), orden: 99 });
    const { data: sobres, error: e1 } = await sb.from("sobres").insert(filas).select();
    if (e1) throw e1;

    if (b.fijos.length) {
      const { error } = await sb.from("gastos_fijos").insert(b.fijos.map((f) => ({ nombre: f.nombre.trim(), monto: f.monto, dia_mes: f.dia || null })));
      if (error) throw error;
    }
    if (!b.sinMeta) {
      const ahorro = sobres.find((s) => s.tipo === "ahorro");
      const { error } = await sb.from("metas").insert({
        nombre: b.meta.nombre, objetivo: b.meta.objetivo, ahorrado: b.meta.ahorrado,
        fecha_objetivo: b.meta.fecha ? b.meta.fecha + "-01" : null, sobre_id: ahorro?.id,
      });
      if (error) throw error;
    }
    const { error: e2 } = await sb.from("perfiles").update({
      nombre: b.nombre, frecuencia: b.frecuencia, ingreso_por_pago: b.ingreso, bienvenida_lista: true,
    }).eq("id", estado.usuario.id);
    if (e2) throw e2;

    await cargarTodo();
    estado.vista = "inicio";
    pintarApp();
    toast("¡Listo! Esta es tu billetera.");
  } catch (e) {
    boton.disabled = false; boton.textContent = "Me sirve, empezar";
    toast("No se pudo guardar. Revisa el internet e intenta otra vez.");
  }
}

/* ---------- App: inicio y pestañas ---------- */

const ICONOS = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/></svg>',
  movimientos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  metas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5" fill="currentColor"/></svg>',
  yo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};

// Palabras que delatan el sobre de un gasto
const PISTAS = {
  Comida: /almuerzo|desayuno|cena|comida|corrientazo|rappi|domicilio|mercado|d1|ara|olimpica|olímpica|éxito|exito|tinto|caf[eé]|perro|hamburguesa|pizza|empanada|arepa|fruta|panader|snack|gaseosa|agua|pollo|restaurante|onces|merienda/,
  Transporte: /gasolina|bus|buseta|transmetro|taxi|uber|didi|indriver|picap|moto|parqueadero|peaje|pasaje|metro|sitp|tanqueo/,
  Salidas: /cine|rumba|cerveza|trago|discoteca|bar\b|fiesta|concierto|partido|estadio|salida|paseo|playa|juego|netflix|spotify|regalo/,
};
const METODOS = ["Nequi", "Efectivo", "Tarjeta", "Daviplata", "Transferencia"];

function sobrePorPista(texto) {
  const t = (texto || "").toLowerCase();
  for (const [nombre, re] of Object.entries(PISTAS)) {
    if (re.test(t)) {
      const s = estado.sobres.find((x) => x.nombre === nombre && x.tipo === "gasto");
      if (s) return s.id;
    }
  }
  return null;
}

const sobreDe = (id) => estado.sobres.find((s) => s.id === id);
const porDia = (saldo, quedan) => Math.floor(Math.max(0, saldo) / quedan / 50) * 50;

function barra() {
  const b = (v, t) => `<button data-vista="${v}" ${estado.vista === v ? 'aria-current="page"' : ""}>${ICONOS[v]}${t}</button>`;
  return `<div class="barra"><nav aria-label="Secciones">${b("inicio", "Inicio")}${b("movimientos", "Movimientos")}<button class="luka" data-anotar aria-label="Anotar con Luka">L</button>${b("metas", "Metas")}${b("yo", "Yo")}</nav></div>`;
}

function pintarApp() {
  const vistas = {
    inicio: vistaInicio,
    sobre: vistaSobre,
    mover: vistaMover,
    movimientos: vistaMovimientos,
    ajustar: vistaAjustar,
    metas: () => vistaPronto("Metas", "Aquí vas a ver tus metas, abonarles y saber cuándo llegas a cada una.", 4),
    yo: vistaYo,
  };
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
  inicio: engancharInicio,
  sobre: engancharSobre,
  mover: engancharMover,
  movimientos: engancharMovimientos,
  ajustar: engancharAjustar,
  yo() {
    document.getElementById("salir").onclick = () => sb.auth.signOut();
    document.getElementById("rehacer").onclick = () => {
      const b = document.getElementById("rehacer");
      if (b.dataset.seguro) return empezarBienvenida();
      b.dataset.seguro = "1";
      b.textContent = "Se borran tus sobres, fijos y meta. Toca otra vez para seguir";
    };
    document.getElementById("ir-ajustar").onclick = () => ir("ajustar");
  },
};

/* ---------- Consejos con reglas fijas ---------- */

function consejo() {
  const s = saldos();
  const quedan = diasQuedan();
  const hoy = new Date().getDate();

  // Un sobre de gasto que ya se pasó o va muy rápido
  for (const x of estado.sobres.filter((y) => y.tipo === "gasto" && y.presupuesto > 0)) {
    if (s[x.id] < 0) return `<div class="nota"><b>Te pasaste en ${esc(x.nombre)}</b>Vas ${pesos(-s[x.id])} por encima. Pasa plata de otra tarjeta para cuadrar.</div>`;
  }
  const finMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const avance = (hoy - 1) / finMes;
  const apurado = estado.sobres
    .filter((y) => y.tipo === "gasto" && y.presupuesto > 0)
    .map((y) => ({ y, usado: 1 - s[y.id] / y.presupuesto }))
    .filter((r) => r.usado >= 0.8 && r.usado > avance + 0.15)
    .sort((a, b) => b.usado - a.usado)[0];
  if (apurado) return `<div class="nota"><b>${esc(apurado.y.nombre)} va en ${Math.round(apurado.usado * 100)} %</b>Te quedan ${pesos(s[apurado.y.id])} para ${quedan} días: ${pesos(porDia(s[apurado.y.id], quedan))} por día.</div>`;

  const pagados = fijosPagados();
  const proximo = estado.fijos.filter((f) => f.dia_mes && f.dia_mes >= hoy && !pagados.has(f.nombre)).sort((a, b) => a.dia_mes - b.dia_mes)[0];
  if (proximo && proximo.dia_mes - hoy <= 7) {
    const cuando = proximo.dia_mes === hoy ? "hoy" : proximo.dia_mes - hoy === 1 ? "mañana" : `el ${proximo.dia_mes}`;
    return `<div class="nota"><b>Se viene un pago fijo</b>${esc(proximo.nombre)} (${pesos(proximo.monto)}) es ${cuando}. Ya está apartado en Fijos.</div>`;
  }

  // Gastos hormiga: muchos gastos chiquitos
  const hormiga = estado.movimientos.filter((m) => m.tipo === "gasto" && m.monto <= 10000);
  if (hormiga.length >= 6) {
    const total = hormiga.reduce((t, m) => t + m.monto, 0);
    return `<div class="nota"><b>Ojo con los gastos hormiga</b>Llevas ${hormiga.length} gastos de menos de $10.000 este mes. Suman ${pesos(total)}.</div>`;
  }
  if (!estado.movimientos.length) return `<div class="nota"><b>Empieza a anotar</b>Toca la L de abajo cada vez que gastes. Cada gasto sale de su tarjeta y mientras más anotes, mejores consejos te doy.</div>`;
  return "";
}

/* ---------- Inicio con la billetera ---------- */

function fijosPagados() {
  const fijo = estado.sobres.find((x) => x.tipo === "fijo");
  return new Set(estado.movimientos.filter((m) => m.tipo === "gasto" && fijo && m.sobre_id === fijo.id).map((m) => m.descripcion));
}

function vistaInicio() {
  const s = saldos();
  const gasto = estado.sobres.filter((x) => x.tipo === "gasto");
  const disponible = gasto.reduce((t, x) => t + Math.max(0, s[x.id]), 0);
  const quedan = diasQuedan();
  const d = new Date();
  const nombre = estado.perfil?.nombre?.split(" ")[0] || "";
  const tarjetas = estado.sobres.filter((x) => x.tipo !== "fijo");
  const meta = estado.metas[0];
  const alto = 96, paso = 50;
  const fijos = estado.sobres.find((x) => x.tipo === "fijo");
  const pagados = fijosPagados();
  const pendientes = estado.fijos.filter((f) => !pagados.has(f.nombre));
  const entro = estado.movimientos.filter((m) => m.tipo === "ingreso").reduce((t, m) => t + m.monto, 0);

  return `
  <section class="pantalla inicio">
    <span class="saludo">Hola${nombre ? ", " + esc(nombre) : ""} · ${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}</span>
    <div class="hoy">
      <span class="cifra">${pesos(porDia(disponible, quedan))}</span>
      <span class="sub">puedes gastar hoy · ${quedan === 1 ? "último día del mes" : `quedan ${quedan} días del mes`}${entro ? ` · te entraron ${pesos(entro)}` : ""}</span>
    </div>
    <div class="billetera" style="height:${alto + paso * (tarjetas.length - 1)}px">
      ${tarjetas.map((x, i) => {
        const saldo = s[x.id];
        const esAhorro = x.tipo === "ahorro";
        const monto = esAhorro && meta ? pesos(meta.ahorrado) : pesos(saldo);
        const detalle = esAhorro
          ? (meta ? `${Math.round((meta.ahorrado / meta.objetivo) * 100)} % de ${pesos(meta.objetivo)} · ` : "") + `${pesos(x.presupuesto)} al mes`
          : saldo < 0 ? `te pasaste ${pesos(-saldo)} · era ${pesos(x.presupuesto)}` : saldo === 0 ? `agotado · era ${pesos(x.presupuesto)}` : `de ${pesos(x.presupuesto)} · ${pesos(porDia(saldo, quedan))} por día`;
        return `<button class="tarjeta" data-id="${x.id}" style="top:${i * paso}px;--c:${x.color};--t:${letraDe(x.color)}" aria-label="${esc(x.nombre)}: ${monto}. Mantén presionado para mover plata">
          <span class="arriba"><span class="nombre">${esAhorro && meta ? "Ahorro · " + esc(x.nombre) : esc(x.nombre)}</span><span class="monto">${monto}</span></span>
          <span class="de">${detalle}</span>
        </button>`;
      }).join("")}
    </div>
    <p class="pista">Toca una tarjeta para abrirla. Mantenla presionada y arrástrala sobre otra para mover plata.</p>
    ${fijos ? `<button class="fijos-resumen" id="ver-fijos" aria-expanded="false"><span>Fijos del mes · ${pesos(fijos.presupuesto)}</span><span>${pendientes.length ? `faltan ${pendientes.length} por pagar` : "todos pagados"}</span></button>
    <div class="lista-pagos" id="lista-fijos" hidden>
      ${estado.fijos.map((f) => `<div class="pago"><span>${esc(f.nombre)}<small>${f.dia_mes ? "día " + f.dia_mes + " · " : ""}${pesos(f.monto)}</small></span>${pagados.has(f.nombre) ? `<span class="pagado">Pagado</span>` : `<button class="chip" data-pagar="${f.id}">Ya lo pagué</button>`}</div>`).join("")}
    </div>` : ""}
    ${consejo()}
  </section>`;
}

function engancharInicio() {
  // Tocar abre el sobre; mantener presionado y soltar sobre otra tarjeta abre "Mover plata"
  app.querySelectorAll(".tarjeta").forEach((el) => {
    let timer = null, arrastrando = false, y0 = 0, x0 = 0, movio = false;
    const destinoEn = (x, y) => {
      el.style.pointerEvents = "none";
      const bajo = document.elementFromPoint(x, y)?.closest(".tarjeta");
      el.style.pointerEvents = "";
      return bajo && bajo !== el ? bajo : null;
    };
    const marcar = (bajo) => app.querySelectorAll(".tarjeta").forEach((t) => t.classList.toggle("destino", t === bajo));
    const empezar = (x, y) => {
      x0 = x; y0 = y; movio = false;
      timer = setTimeout(() => { arrastrando = true; el.classList.add("alzada"); navigator.vibrate?.(15); }, 330);
    };
    const mover = (x, y, e) => {
      if (!arrastrando) {
        if (Math.abs(y - y0) > 8 || Math.abs(x - x0) > 8) { clearTimeout(timer); movio = true; }
        return;
      }
      e.preventDefault();
      el.style.transform = `translateY(${y - y0}px) scale(1.03)`;
      marcar(destinoEn(x, y));
    };
    const soltar = (x, y) => {
      clearTimeout(timer);
      if (!arrastrando) {
        if (!movio) ir("sobre", { sobreAbierto: el.dataset.id });
        return;
      }
      arrastrando = false;
      el.classList.remove("alzada");
      el.style.transform = "";
      const bajo = destinoEn(x, y);
      marcar(null);
      if (!bajo) return;
      if ([el, bajo].some((t) => sobreDe(t.dataset.id)?.tipo !== "gasto")) return toast("Abonar o sacar de la meta llega en la parte 4.");
      ir("mover", { mover: { de: el.dataset.id, a: bajo.dataset.id, monto: 0 } });
    };
    el.addEventListener("touchstart", (e) => empezar(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    el.addEventListener("touchmove", (e) => mover(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
    el.addEventListener("touchend", (e) => { e.preventDefault(); soltar(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
    el.addEventListener("touchcancel", () => { clearTimeout(timer); arrastrando = false; el.classList.remove("alzada"); el.style.transform = ""; marcar(null); });
    el.addEventListener("mousedown", (e) => {
      empezar(e.clientX, e.clientY);
      const mm = (ev) => mover(ev.clientX, ev.clientY, ev);
      const mu = (ev) => { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); soltar(ev.clientX, ev.clientY); };
      document.addEventListener("mousemove", mm);
      document.addEventListener("mouseup", mu);
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir("sobre", { sobreAbierto: el.dataset.id }); } });
  });

  const ver = document.getElementById("ver-fijos");
  if (ver) ver.onclick = () => {
    const lista = document.getElementById("lista-fijos");
    lista.hidden = !lista.hidden;
    ver.setAttribute("aria-expanded", String(!lista.hidden));
  };
  app.querySelectorAll("[data-pagar]").forEach((el) => (el.onclick = async () => {
    const f = estado.fijos.find((x) => x.id === el.dataset.pagar);
    const fijo = estado.sobres.find((x) => x.tipo === "fijo");
    el.disabled = true;
    const ok = await guardarMovimiento({ tipo: "gasto", monto: f.monto, sobre_id: fijo.id, descripcion: f.nombre, metodo: "" });
    if (ok) { toast(`${f.nombre} pagado`); pintarApp(); document.getElementById("ver-fijos")?.click(); }
    else el.disabled = false;
  }));
}

/* ---------- Un sobre abierto ---------- */

function filaMovimiento(m) {
  const s = sobreDe(m.sobre_id);
  const destino = sobreDe(m.sobre_destino_id);
  const f = new Date(m.fecha);
  let titulo = m.descripcion || (m.tipo === "ingreso" ? "Ingreso" : "Gasto");
  let sub = [s?.nombre, m.metodo].filter(Boolean).join(" · ");
  let signo = "−", clase = "";
  if (m.tipo === "ingreso") { signo = "+"; clase = "entra"; sub = ["Ingreso", m.metodo].filter(Boolean).join(" · "); }
  if (m.tipo === "traslado") { signo = ""; clase = "pasa"; titulo = `${s?.nombre || "?"} → ${destino?.nombre || "?"}`; sub = "Movida entre tarjetas"; }
  const color = m.tipo === "ingreso" ? "var(--verde)" : (s?.color || "#c9d3cd");
  return `<button class="mov" data-mov="${m.id}">
    <i style="background:${color}"></i>
    <span class="txt">${esc(titulo)}<small>${esc(sub)}${sub ? " · " : ""}${f.getHours().toString().padStart(2, "0")}:${f.getMinutes().toString().padStart(2, "0")}</small></span>
    <span class="num ${clase}">${signo}${pesos(m.monto)}</span>
  </button>`;
}

function vistaSobre() {
  const x = sobreDe(estado.sobreAbierto);
  if (!x) { estado.vista = "inicio"; return vistaInicio(); }
  const s = saldos()[x.id];
  const quedan = diasQuedan();
  const movs = estado.movimientos.filter((m) => m.sobre_id === x.id || m.sobre_destino_id === x.id);
  const gastado = movs.filter((m) => m.tipo === "gasto").reduce((t, m) => t + m.monto, 0);
  const pct = x.presupuesto ? Math.min(100, Math.max(0, Math.round((gastado / x.presupuesto) * 100))) : 0;
  const esAhorro = x.tipo === "ahorro";

  let tip = "";
  if (!esAhorro && x.presupuesto) {
    const top = Object.entries(movs.filter((m) => m.tipo === "gasto").reduce((r, m) => { const k = (m.descripcion || "otros").toLowerCase(); r[k] = (r[k] || 0) + m.monto; return r; }, {})).sort((a, b) => b[1] - a[1])[0];
    if (s < 0) tip = `Te pasaste ${pesos(-s)}. Toca «Mover plata» y pasa de otra tarjeta que tenga de sobra.`;
    else if (top && top[1] >= gastado * 0.4 && gastado > 0) tip = `Lo que más se lleva este sobre: «${esc(top[0])}», con ${pesos(top[1])} (${Math.round((top[1] / gastado) * 100)} %).`;
    else tip = `Para que te alcance, gasta máximo ${pesos(porDia(s, quedan))} por día.`;
  }

  return `
  <section class="pantalla inicio">
    <button class="volver" data-vista="inicio">← Billetera</button>
    <div class="abierta" style="--c:${x.color};--t:${letraDe(x.color)}">
      <div class="arriba"><span>${esAhorro ? "Ahorro · " : ""}${esc(x.nombre)}</span><span>${quedan} días</span></div>
      <span class="monto">${pesos(s)}</span>
      <div class="barrita"><i style="width:${pct}%"></i></div>
      <small>${esAhorro ? `Le metes ${pesos(x.presupuesto)} al mes` : `Gastaste ${pesos(gastado)} de ${pesos(x.presupuesto)} · ${pesos(porDia(s, quedan))} por día`}</small>
    </div>
    ${tip ? `<div class="nota"><b>Luka dice</b>${tip}</div>` : ""}
    <div class="fila">
      ${esAhorro ? `<p class="sub">Abonarle a la meta llega en la parte 4.</p>` : `<button class="boton" data-anotar="${x.id}">Anotar gasto</button>
      <button class="boton claro" id="mover-desde">Mover plata</button>`}
    </div>
    <h3 class="titulo-lista">Este mes</h3>
    <div class="lista-movs">${movs.length ? movs.map(filaMovimiento).join("") : `<p class="sub">Todavía no hay movimientos en esta tarjeta.</p>`}</div>
  </section>`;
}

function engancharSobre() {
  const moverDesde = document.getElementById("mover-desde");
  if (moverDesde) moverDesde.onclick = () => {
    const otro = estado.sobres.find((y) => y.id !== estado.sobreAbierto && y.tipo === "gasto");
    ir("mover", { mover: { de: estado.sobreAbierto, a: otro?.id, monto: 0 } });
  };
  engancharFilas();
}

function engancharFilas() {
  app.querySelectorAll("[data-mov]").forEach((el) => (el.onclick = () => {
    const m = estado.movimientos.find((x) => x.id === el.dataset.mov) || estado.movsMes?.find((x) => x.id === el.dataset.mov);
    if (m) abrirAnotar(m);
  }));
}

/* ---------- Mover plata entre tarjetas ---------- */

function vistaMover() {
  const mv = estado.mover;
  const s = saldos();
  const opciones = estado.sobres.filter((x) => x.tipo === "gasto");
  const de = sobreDe(mv.de), a = sobreDe(mv.a);
  const max = Math.max(0, s[mv.de] || 0);
  const sel = (id, nombre) => `<select id="${nombre}" class="selector">${opciones.map((x) => `<option value="${x.id}" ${x.id === id ? "selected" : ""}>${esc(x.nombre)} · ${pesos(s[x.id])}</option>`).join("")}</select>`;
  return `
  <section class="pantalla inicio">
    <button class="volver" data-vista="inicio">← Billetera</button>
    <h1>Mover plata</h1>
    <div class="caja-mover" style="--c:${de?.color};--t:${letraDe(de?.color)}"><label for="de">De</label>${sel(mv.de, "de")}</div>
    <div class="flecha num" id="flecha">↓ ${pesos(mv.monto)}</div>
    <div class="caja-mover" style="--c:${a?.color};--t:${letraDe(a?.color)}"><label for="a">A</label>${sel(mv.a, "a")}</div>
    <div class="campo">
      <label for="monto-mover">¿Cuánto?</label>
      <input id="monto-mover" class="grande" inputmode="decimal" value="${mv.monto ? pesos(mv.monto) : ""}" placeholder="$0">
      <input id="rango-mover" type="range" min="0" max="${Math.max(max, 1000)}" step="1000" value="${Math.min(mv.monto, max)}" aria-label="Cuánto mover">
      <span class="ayuda">En ${esc(de?.nombre || "")} hay ${pesos(max)}.</span>
    </div>
    <div class="nota" id="nota-mover"></div>
    <div class="acciones"><button class="boton" id="hacer-mover">Mover</button></div>
  </section>`;
}

function engancharMover() {
  const mv = estado.mover;
  const s = saldos();
  const quedan = diasQuedan();
  const input = document.getElementById("monto-mover");
  const rango = document.getElementById("rango-mover");
  const pintar = () => {
    const de = sobreDe(mv.de), a = sobreDe(mv.a);
    const queda = (s[mv.de] || 0) - mv.monto;
    document.getElementById("flecha").textContent = "↓ " + pesos(mv.monto);
    const nota = document.getElementById("nota-mover");
    const boton = document.getElementById("hacer-mover");
    boton.textContent = mv.monto ? `Mover ${pesos(mv.monto)}` : "Mover";
    if (mv.de === mv.a) { nota.textContent = "Escoge dos tarjetas distintas."; boton.disabled = true; return; }
    if (!mv.monto) { nota.textContent = "Escribe cuánto o mueve la barra."; boton.disabled = true; return; }
    if (queda < 0) { nota.textContent = `En ${de.nombre} no hay tanto: máximo ${pesos(Math.max(0, s[mv.de]))}.`; boton.disabled = true; return; }
    boton.disabled = false;
    nota.textContent = de.tipo === "gasto"
      ? `${de.nombre} queda en ${pesos(queda)}: ${pesos(porDia(queda, quedan))} por día.${queda / quedan < 5000 ? " Es justo, pero se puede." : ""}`
      : `${de.nombre} queda en ${pesos(queda)}. ${a.nombre} sube a ${pesos((s[mv.a] || 0) + mv.monto)}.`;
  };
  input.oninput = () => { mv.monto = leerMonto(input.value); rango.value = mv.monto; pintar(); };
  input.onblur = () => { if (mv.monto) input.value = pesos(mv.monto); };
  rango.oninput = () => { mv.monto = +rango.value; input.value = pesos(mv.monto); pintar(); };
  document.getElementById("de").onchange = (e) => { mv.de = e.target.value; ir("mover"); };
  document.getElementById("a").onchange = (e) => { mv.a = e.target.value; ir("mover"); };
  document.getElementById("hacer-mover").onclick = async (e) => {
    e.currentTarget.disabled = true;
    const de = sobreDe(mv.de), a = sobreDe(mv.a);
    const ok = await guardarMovimiento({ tipo: "traslado", monto: mv.monto, sobre_id: mv.de, sobre_destino_id: mv.a, descripcion: `${de.nombre} → ${a.nombre}` });
    if (ok) { toast(`Listo: ${pesos(mv.monto)} de ${de.nombre} a ${a.nombre}`); ir("inicio"); }
    else e.currentTarget.disabled = false;
  };
  pintar();
}

/* ---------- Anotar (hoja que sube) ---------- */

async function guardarMovimiento(fila, id = null) {
  const q = id ? sb.from("movimientos").update(fila).eq("id", id) : sb.from("movimientos").insert(fila);
  const { error } = await q;
  if (error) { toast("No se pudo guardar. Revisa el internet."); return false; }
  await cargarTodo();
  return true;
}

function fechaLocal(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function abrirAnotar(previo = {}) {
  const editando = !!previo.id;
  if (previo.tipo === "traslado") {
    return abrirHoja(`
      <h2>Movida entre tarjetas</h2>
      <p class="sub">${esc(previo.descripcion)} · ${pesos(previo.monto)}</p>
      <div class="acciones"><button class="boton peligro" id="borrar">Deshacer esta movida</button><button class="boton texto" data-cerrar>Cerrar</button></div>`,
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
  const ayer = fechaLocal(new Date(Date.now() - 864e5));
  const deGasto = estado.sobres.filter((x) => x.tipo !== "ahorro");

  abrirHoja(`
    <div class="pestanas" role="tablist">
      <button role="tab" type="button" aria-selected="${f.tipo === "gasto"}" data-tipo="gasto">Gasto</button>
      <button role="tab" type="button" aria-selected="${f.tipo === "ingreso"}" data-tipo="ingreso">Me entró plata</button>
    </div>
    <div class="campo">
      <label for="a-monto">¿Cuánto?</label>
      <input id="a-monto" class="grande" inputmode="decimal" placeholder="Ej: 15k" value="${f.monto ? pesos(f.monto) : ""}" autocomplete="off">
    </div>
    <div class="campo">
      <label for="a-desc">${f.tipo === "gasto" ? "¿En qué?" : "¿De dónde?"}</label>
      <input id="a-desc" placeholder="${f.tipo === "gasto" ? "Ej: almuerzo, gasolina, Rappi" : "Ej: quincena, venta, regalo"}" value="${esc(f.descripcion)}" autocomplete="off">
    </div>
    <div class="campo" id="bloque-sobre" ${f.tipo === "ingreso" ? "hidden" : ""}>
      <span class="etiqueta">¿De qué tarjeta sale?</span>
      <div class="chips-sobre">${deGasto.map((x) => `<button type="button" class="chip-sobre" data-sobre="${x.id}" style="--c:${x.color};--t:${letraDe(x.color)}" aria-pressed="${x.id === f.sobre_id}">${esc(x.nombre)}</button>`).join("")}</div>
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
      const marcarSobre = () => hoja.querySelectorAll("[data-sobre]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sobre === f.sobre_id)));
      hoja.querySelectorAll("[data-tipo]").forEach((b) => (b.onclick = () => {
        f.tipo = b.dataset.tipo;
        f.monto = leerMonto($("a-monto").value); f.descripcion = $("a-desc").value;
        hoja.querySelectorAll("[data-tipo]").forEach((t) => t.setAttribute("aria-selected", String(t === b)));
        $("bloque-sobre").hidden = f.tipo === "ingreso";
        hoja.querySelector('label[for="a-desc"]').textContent = f.tipo === "gasto" ? "¿En qué?" : "¿De dónde?";
        $("a-desc").placeholder = f.tipo === "gasto" ? "Ej: almuerzo, gasolina, Rappi" : "Ej: quincena, venta, regalo";
      }));
      $("a-monto").oninput = () => { f.monto = leerMonto($("a-monto").value); };
      $("a-monto").onblur = () => { if (f.monto) $("a-monto").value = pesos(f.monto); };
      $("a-desc").oninput = () => {
        f.descripcion = $("a-desc").value;
        if (!f.elegidoAMano) { const p = sobrePorPista(f.descripcion); if (p) { f.sobre_id = p; marcarSobre(); } }
      };
      hoja.querySelectorAll("[data-sobre]").forEach((b) => (b.onclick = () => { f.sobre_id = b.dataset.sobre; f.elegidoAMano = true; marcarSobre(); }));
      hoja.querySelectorAll("[data-metodo]").forEach((b) => (b.onclick = () => { f.metodo = b.dataset.metodo; hoja.querySelectorAll("[data-metodo]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
      const marcarFecha = () => hoja.querySelectorAll("[data-fecha]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.fecha === f.fecha)));
      hoja.querySelectorAll("[data-fecha]").forEach((b) => (b.onclick = () => { f.fecha = b.dataset.fecha; $("a-fecha").value = f.fecha; marcarFecha(); }));
      $("a-fecha").onchange = () => { f.fecha = $("a-fecha").value || hoy; marcarFecha(); };
      $("a-guardar").onclick = async () => {
        const err = $("a-error");
        f.monto = leerMonto($("a-monto").value); f.descripcion = $("a-desc").value.trim();
        const falta = !f.monto ? "Escribe cuánto fue." : f.tipo === "gasto" && !f.sobre_id ? "Escoge de qué tarjeta sale." : "";
        if (falta) { err.textContent = falta; err.hidden = false; return; }
        $("a-guardar").disabled = true;
        const cuando = f.fecha === hoy ? (editando && fechaLocal(new Date(previo.fecha)) === hoy ? previo.fecha : new Date().toISOString()) : new Date(f.fecha + "T12:00:00").toISOString();
        const fila = { tipo: f.tipo, monto: f.monto, descripcion: f.descripcion, metodo: f.metodo, sobre_id: f.tipo === "gasto" ? f.sobre_id : null, fecha: cuando };
        const ok = await guardarMovimiento(fila, previo.id || null);
        if (!ok) { $("a-guardar").disabled = false; return; }
        cerrarHoja();
        estado.movsMes = null;
        pintarApp();
        if (editando) toast("Cambios guardados");
        else if (f.tipo === "ingreso") toast(`Anotado: te entraron ${pesos(f.monto)}`);
        else {
          const x = sobreDe(f.sobre_id);
          const quedo = saldos()[f.sobre_id];
          toast(quedo < 0 ? `Anotado. ${x.nombre} quedó en −${pesos(-quedo)}` : `Anotado. A ${x.nombre} le quedan ${pesos(quedo)}`);
        }
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
  requestAnimationFrame(() => fondo.classList.add("abierta"));
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
  fondo.classList.remove("abierta");
  setTimeout(() => fondo.remove(), 220);
}

/* ---------- Movimientos ---------- */

function vistaMovimientos() {
  const mes = estado.mesVisto || inicioDeMes();
  const esActual = mes.getTime() === inicioDeMes().getTime();
  const lista = esActual ? estado.movimientos : estado.movsMes;
  const filtro = estado.filtroMov || "todo";
  if (!lista) return `<section class="pantalla inicio"><p class="sub">Cargando…</p></section>`;
  const vis = lista.filter((m) => filtro === "todo" || m.tipo === filtro);
  const gastos = lista.filter((m) => m.tipo === "gasto").reduce((t, m) => t + m.monto, 0);
  const ingresos = lista.filter((m) => m.tipo === "ingreso").reduce((t, m) => t + m.monto, 0);

  const grupos = {};
  for (const m of vis) {
    const d = new Date(m.fecha);
    const k = fechaLocal(d);
    (grupos[k] ||= { d, items: [] }).items.push(m);
  }
  const hoy = fechaLocal(new Date()), ayer = fechaLocal(new Date(Date.now() - 864e5));
  const titulo = (k, d) => (k === hoy ? "Hoy" : k === ayer ? "Ayer" : `${DIAS[d.getDay()]} ${d.getDate()}`);

  return `
  <section class="pantalla inicio">
    <div class="mes-nav">
      <button class="flechita" id="mes-ant" aria-label="Mes anterior">‹</button>
      <h1>${MESES[mes.getMonth()][0].toUpperCase() + MESES[mes.getMonth()].slice(1)}${mes.getFullYear() !== new Date().getFullYear() ? " " + mes.getFullYear() : ""}</h1>
      <button class="flechita" id="mes-sig" aria-label="Mes siguiente" ${esActual ? "disabled" : ""}>›</button>
    </div>
    <div class="totales">
      <div><span class="sub">Gastaste</span><b class="num">${pesos(gastos)}</b></div>
      <div><span class="sub">Te entró</span><b class="num entra">${pesos(ingresos)}</b></div>
    </div>
    <div class="chips" role="tablist">
      ${[["todo", "Todo"], ["gasto", "Gastos"], ["ingreso", "Ingresos"], ["traslado", "Movidas"]].map(([v, t]) => `<button class="chip suave" role="tab" data-filtro="${v}" aria-pressed="${filtro === v}">${t}</button>`).join("")}
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
    if (nuevo.getTime() !== inicioDeMes().getTime()) {
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

/* ---------- Ajustar sobres ---------- */

function vistaAjustar() {
  const editables = estado.sobres.filter((x) => x.tipo !== "fijo");
  const libre = Math.round(estado.perfil.ingreso_por_pago * PAGOS_AL_MES[estado.perfil.frecuencia]) - estado.fijos.reduce((t, f) => t + f.monto, 0);
  return `
  <section class="pantalla inicio">
    <button class="volver" data-vista="yo">← Yo</button>
    <h1>Mis tarjetas</h1>
    <p class="sub">Cuánto le toca a cada una al mes. Te quedan ${pesos(Math.max(0, libre))} después de los fijos.</p>
    <div class="lista-ajuste">
      ${editables.map((x) => `
      <div class="ajuste" style="--c:${x.color}">
        <i></i>
        <input data-nombre="${x.id}" value="${esc(x.nombre)}" aria-label="Nombre de la tarjeta">
        <input data-presu="${x.id}" class="num" inputmode="decimal" value="${pesos(x.presupuesto)}" aria-label="Presupuesto de ${esc(x.nombre)}">
      </div>`).join("")}
    </div>
    <div class="saldo-reparto" id="saldo-ajuste"></div>
    <button class="boton claro" id="nueva-tarjeta">+ Nueva tarjeta</button>
    <div class="acciones"><button class="boton" id="guardar-ajuste">Guardar</button></div>
  </section>`;
}

function engancharAjustar() {
  const libre = Math.round(estado.perfil.ingreso_por_pago * PAGOS_AL_MES[estado.perfil.frecuencia]) - estado.fijos.reduce((t, f) => t + f.monto, 0);
  const total = () => [...app.querySelectorAll("[data-presu]")].reduce((t, el) => t + leerMonto(el.value), 0);
  const pintar = () => {
    const queda = libre - total();
    const el = document.getElementById("saldo-ajuste");
    el.className = "saldo-reparto" + (queda < 0 ? " malo" : "");
    el.innerHTML = queda < 0 ? `<span>Repartiste más de lo que te entra</span><span class="num">${pesos(-queda)}</span>` : `<span>Sin repartir</span><span class="num">${pesos(queda)}</span>`;
  };
  app.querySelectorAll("[data-presu]").forEach((el) => { el.oninput = pintar; el.onblur = () => { el.value = pesos(leerMonto(el.value)); }; });
  pintar();
  document.getElementById("nueva-tarjeta").onclick = async () => {
    const usados = new Set(estado.sobres.map((x) => x.color));
    const color = ["#7a5bb5", "#d9822b", "#2a8fa8", "#b54a7f", "#5d7a2f"].find((c) => !usados.has(c)) || "#7a5bb5";
    const { error } = await sb.from("sobres").insert({ nombre: "Nueva", tipo: "gasto", color, presupuesto: 0, orden: estado.sobres.length });
    if (error) return toast("No se pudo crear.");
    await cargarTodo();
    pintarApp();
  };
  document.getElementById("guardar-ajuste").onclick = async (e) => {
    e.currentTarget.disabled = true;
    const cambios = estado.sobres.filter((x) => x.tipo !== "fijo").map((x) => ({
      id: x.id,
      nombre: (app.querySelector(`[data-nombre="${x.id}"]`).value.trim() || x.nombre).slice(0, 30),
      presupuesto: leerMonto(app.querySelector(`[data-presu="${x.id}"]`).value),
    }));
    const res = await Promise.all(cambios.map((c) => sb.from("sobres").update({ nombre: c.nombre, presupuesto: c.presupuesto }).eq("id", c.id)));
    if (res.some((r) => r.error)) { toast("No se pudo guardar todo."); e.currentTarget.disabled = false; return; }
    await cargarTodo();
    toast("Tarjetas guardadas");
    ir("inicio");
  };
}

/* ---------- Otras pestañas ---------- */

function vistaPronto(titulo, texto, parte) {
  return `<section class="pantalla vacio"><span class="paso">Parte ${parte} · en construcción</span><h2>${titulo}</h2><p class="sub">${texto}</p></section>`;
}

function vistaYo() {
  const p = estado.perfil;
  const frec = { mensual: "Cada mes", quincenal: "Cada quincena", semanal: "Cada semana", variable: "Varía" }[p.frecuencia];
  return `
  <section class="pantalla inicio">
    <h1>${esc(p.nombre || "Tú")}</h1>
    <div>
      <div class="yo-dato"><span>Correo</span><span>${esc(estado.usuario.email)}</span></div>
      <div class="yo-dato"><span>Te pagan</span><span>${frec}</span></div>
      <div class="yo-dato"><span>${p.frecuencia === "variable" ? "Al mes" : "Por pago"}</span><span class="num">${pesos(p.ingreso_por_pago)}</span></div>
      <div class="yo-dato"><span>Gastos fijos</span><span>${estado.fijos.length}</span></div>
    </div>
    <button class="boton" id="ir-ajustar">Ajustar mis tarjetas</button>
    <button class="boton claro" id="rehacer">Volver a hacer la bienvenida</button>
    <button class="boton texto" id="salir">Cerrar sesión</button>
  </section>`;
}

/* ---------- Instalable ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
