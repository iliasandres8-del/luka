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

function barra() {
  const b = (v, t) => `<button data-vista="${v}" ${estado.vista === v ? 'aria-current="page"' : ""}>${ICONOS[v]}${t}</button>`;
  return `<div class="barra"><nav aria-label="Secciones">${b("inicio", "Inicio")}${b("movimientos", "Movimientos")}<button class="luka" data-vista="luka" aria-label="Hablar con Luka">L</button>${b("metas", "Metas")}${b("yo", "Yo")}</nav></div>`;
}

function pintarApp() {
  const vistas = { inicio: vistaInicio, movimientos: () => vistaPronto("Movimientos", "Aquí vas a ver todo lo que anotes, día por día.", 2), luka: () => vistaPronto("Luka", "Aquí vas a anotar escribiendo como hablas y preguntarle si te alcanza.", 3), metas: () => vistaPronto("Metas", "Aquí vas a ver tus metas y cuándo llegas a cada una.", 4), yo: vistaYo };
  app.innerHTML = vistas[estado.vista]() + barra();
  app.querySelectorAll("[data-vista]").forEach((el) => (el.onclick = () => { estado.vista = el.dataset.vista; pintarApp(); window.scrollTo(0, 0); }));
  app.querySelectorAll(".tarjeta").forEach((el) => (el.onclick = () => toast("Abrir el sobre y anotar gastos llega en la parte 2.")));
  const salir = document.getElementById("salir");
  if (salir) salir.onclick = async () => { await sb.auth.signOut(); };
  const rehacer = document.getElementById("rehacer");
  if (rehacer) rehacer.onclick = empezarBienvenida;
}

function consejo() {
  const hoy = new Date().getDate();
  const proximo = estado.fijos.filter((f) => f.dia_mes && f.dia_mes >= hoy).sort((a, b) => a.dia_mes - b.dia_mes)[0];
  if (proximo && proximo.dia_mes - hoy <= 7) {
    const cuando = proximo.dia_mes === hoy ? "hoy" : proximo.dia_mes - hoy === 1 ? "mañana" : `el ${proximo.dia_mes}`;
    return `<div class="nota"><b>Se viene un pago fijo</b>${esc(proximo.nombre)} (${pesos(proximo.monto)}) es ${cuando}. Ya está apartado en Fijos.</div>`;
  }
  if (!estado.movimientos.length) return `<div class="nota"><b>Empieza a anotar</b>Cada gasto que anotes sale de su tarjeta. Mientras más anotes, mejores consejos te doy.</div>`;
  return "";
}

function vistaInicio() {
  const s = saldos();
  const gasto = estado.sobres.filter((x) => x.tipo === "gasto");
  const disponible = gasto.reduce((t, x) => t + Math.max(0, s[x.id]), 0);
  const quedan = diasQuedan();
  const hoyPuedes = Math.floor(disponible / quedan / 50) * 50;
  const d = new Date();
  const nombre = estado.perfil?.nombre?.split(" ")[0] || "";
  const tarjetas = estado.sobres.filter((x) => x.tipo !== "fijo");
  const meta = estado.metas[0];
  const alto = 96, paso = 50;

  const fijos = estado.sobres.find((x) => x.tipo === "fijo");
  const proximoFijo = estado.fijos.filter((f) => f.dia_mes && f.dia_mes >= d.getDate())[0];

  return `
  <section class="pantalla inicio">
    <span class="saludo">Hola${nombre ? ", " + esc(nombre) : ""} · ${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}</span>
    <div class="hoy">
      <span class="cifra">${pesos(hoyPuedes)}</span>
      <span class="sub">puedes gastar hoy · ${quedan === 1 ? "último día del mes" : `quedan ${quedan} días del mes`}</span>
    </div>
    <div class="billetera" style="height:${alto + paso * (tarjetas.length - 1)}px">
      ${tarjetas.map((x, i) => {
        const saldo = s[x.id];
        const esAhorro = x.tipo === "ahorro";
        const monto = esAhorro && meta ? pesos(meta.ahorrado) : pesos(saldo);
        const detalle = esAhorro
          ? (meta ? `${Math.round((meta.ahorrado / meta.objetivo) * 100)} % de ${pesos(meta.objetivo)} · ` : "") + `${pesos(x.presupuesto)} al mes`
          : saldo <= 0 ? `agotado · era ${pesos(x.presupuesto)}` : `de ${pesos(x.presupuesto)} · ${pesos(Math.floor(saldo / quedan / 50) * 50)} por día`;
        return `<button class="tarjeta" style="top:${i * paso}px;--c:${x.color};--t:${letraDe(x.color)}" aria-label="${esc(x.nombre)}: ${monto}">
          <span class="arriba"><span class="nombre">${esAhorro && meta ? "Ahorro · " + esc(x.nombre) : esc(x.nombre)}</span><span class="monto">${monto}</span></span>
          <span class="de">${detalle}</span>
        </button>`;
      }).join("")}
    </div>
    ${fijos ? `<div class="fijos-resumen"><span>Fijos del mes · ${pesos(fijos.presupuesto)}</span><span>${proximoFijo ? `próximo: ${esc(proximoFijo.nombre)}, día ${proximoFijo.dia_mes}` : `${estado.fijos.length} pagos`}</span></div>` : ""}
    ${consejo()}
  </section>`;
}

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
    <button class="boton claro" id="rehacer">Volver a hacer la bienvenida</button>
    <button class="boton texto" id="salir">Cerrar sesión</button>
  </section>`;
}

/* ---------- Instalable ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
