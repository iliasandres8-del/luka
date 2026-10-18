// Recibe las alertas del banco que manda el Apps Script de cada persona desde su Gmail
// y las anota como gastos o ingresos. El script se identifica con una llave personal
// (aquí solo se guarda su huella SHA-256). Nunca se guarda el correo, solo monto, comercio y fecha.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

type Alerta = { id: string; fecha: string; de: string; asunto: string; texto: string };

const BANCOS: [RegExp, string][] = [
  [/nu\.com\.co|\bnu\b/i, "Nu"], [/nequi/i, "Nequi"], [/daviplata/i, "Daviplata"], [/davivienda/i, "Davivienda"],
  [/bancolombia/i, "Bancolombia"], [/bbva/i, "BBVA"], [/bogota|bogotá/i, "Banco de Bogotá"], [/avvillas|av villas/i, "AV Villas"],
  [/popular/i, "Banco Popular"], [/colpatria|scotiabank/i, "Colpatria"], [/lulo/i, "Lulo"], [/falabella/i, "Falabella"],
  [/itau|itaú/i, "Itaú"], [/caja ?social/i, "Caja Social"], [/rappi/i, "RappiPay"], [/movii/i, "Movii"],
];

// Palabras que delatan la tarjeta (categoría), con comercios comunes de Colombia
const PISTAS: Record<string, RegExp> = {
  Comida: /almuerzo|desayuno|cena|comida|corrientazo|rappi|ifood|domicilio|mercado(?! ?libre)|\bd1\b|\bara\b|olimpica|olímpica|éxito|exito|carulla|jumbo|tinto|caf[eé]|perro|hamburguesa|pizza|empanada|arepa|panader|snack|pollo|restaurante|kfc|mcdonald|frisby|subway|crepes|jeno|dominos|oxxo|justo y bueno|isimo/i,
  Transporte: /gasolina|terpel|primax|texaco|biomax|esso|mobil|\bbus\b|transmetro|taxi|uber|didi|indriver|picap|cabify|parqueadero|peaje|pasaje|metro|sitp|tanqueo|estaci[oó]n de servicio/i,
  Salidas: /cine|royal films|cinemark|cine colombia|procinal|rumba|cerveza|\bbar\b|discoteca|concierto|tuboleta|eticket|estadio/i,
  Compras: /falabella|zara|koaj|arturo calle|tennis|adidas|nike|mercado libre|mercadolibre|amazon|temu|shein|alkosto|ktronix|homecenter|miniso/i,
  Estudio: /universidad|unisim|librer|panamericana|papeler|udemy|platzi|coursera/i,
  Salud: /droguer|farmac|cruz verde|pasteur|cl[ií]nica|odonto|smart ?fit|bodytech|gimnasio/i,
  Suscripciones: /netflix|spotify|disney|hbo|\bmax\b|prime video|youtube|apple\.com|google|icloud|claro|movistar|tigo|\bwom\b|steam|playstation|xbox|nintendo/i,
};

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s|\/)(\S)/g, (_, a, b) => a + b.toUpperCase()).trim();

function leerNumero(s: string) {
  let t = s.trim();
  if (/[.,]\d{1,2}$/.test(t)) t = t.replace(/[.,]\d{1,2}$/, ""); // quita centavos
  return parseInt(t.replace(/[.,]/g, ""), 10) || 0;
}

function analizar(a: Alerta) {
  const t = `${a.asunto} \n ${a.texto}`.replace(/\s+/g, " ");
  // Lo que no es un movimiento real
  if (/rechaz|falta(n)? (de )?fondos|declinad|fallid|no (fue|pudo ser) (exitos|procesad)|reversad|c[oó]digo de (verificaci|seguridad)|clave din[aá]mica|\botp\b|token/i.test(t)) return null;

  const m = t.match(/(?:\$|COP)\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  const monto = leerNumero(m[1]);
  if (monto < 100) return null;

  const ingreso = /(recibiste|te (enviaron|lleg[oó]|consignaron|transfirieron|abonaron|pagaron)|recibi[oó]|abono a tu|consignaci[oó]n|transferencia recibida|dep[oó]sito|ingres[oó] (dinero|plata)|llegaron)/i.test(t);
  const gasto = /(pagaste|compraste|compra|\bpago\b|pagado|retir|transferiste|enviaste|env[ií]o de dinero|d[eé]bito|avance|cobro|transacci[oó]n (aceptada|aprobada))/i.test(t);
  if (!ingreso && !gasto) return null;

  let comercio = "";
  const patrones = [
    /pagaste en:?\s*(.+?)\s+(?:la cantidad|con tu|con |por |el \d)/i,
    /compra (?:por \$[\d.,]+ )?en\s+(.+?)(?:\s+(?:el \d|por \$|con |a las|desde)|[.,] |$)/i,
    /(?:transacci[oó]n|pago) en\s+(.+?)(?:\s+(?:transacci|el \d|por \$|con )|[.,] |$)/i,
    /\ben\s+([A-Z0-9*][A-Z0-9 .&*'\/-]{2,40}?)(?=\s+(?:el|por|con|a las|desde|la)\b|[.,] |$)/,
    /(?:a|para|de)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,40}?)(?=\s+(?:el|por|desde|con)\b|[.,] |$)/,
  ];
  for (const p of patrones) { const r = t.match(p); if (r) { comercio = r[1].trim(); break; } }
  if (!comercio) comercio = a.asunto.replace(/^(pagaste|compraste|compra) en /i, "").replace(/ con (cuenta|tarjeta).*$/i, "");
  comercio = comercio.replace(/\s+\d{1,2}:\d{2}.*$/, "").replace(/\s{2,}/g, " ").slice(0, 40);
  const quien = t.match(/\bde:?\s+([A-ZÁÉÍÓÚÑ]{2,}(?:\s[A-ZÁÉÍÓÚÑ]{2,}){0,3})\b/);

  const banco = BANCOS.find(([re]) => re.test(a.de))?.[1] || "";
  const tipo = ingreso ? "ingreso" : "gasto";
  const descripcion = tipo === "ingreso" ? (quien ? `Te llegó de ${titulo(quien[1])}` : `Ingreso ${banco}`.trim()) : titulo(comercio) || "Compra";
  return { tipo, monto, descripcion: descripcion.slice(0, 60), metodo: banco, texto: t };
}

async function huella(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);
  let cuerpo: { llave?: string; alertas?: Alerta[] };
  try { cuerpo = await req.json(); } catch { return responder({ error: "Cuerpo inválido" }, 400); }
  if (!cuerpo.llave || cuerpo.llave.length < 20) return responder({ error: "Falta la llave" }, 401);
  const [c] = await sql`select user_id from public.conexiones_gmail where llave_hash = ${await huella(cuerpo.llave)}`;
  if (!c) return responder({ error: "Llave desconocida. Genera el código otra vez en Luka." }, 401);
  const uid = c.user_id;

  const sobres = await sql`select id, nombre, tipo, color from public.sobres where user_id = ${uid} and not archivado and tipo = 'gasto' order by orden`;
  const otros = sobres.find((s) => s.nombre === "Otros") || sobres[0];
  const anotados: { nombre: string; color: string; descripcion: string; monto: number; tipo: string }[] = [];

  for (const a of (cuerpo.alertas || []).slice(0, 50)) {
    const r = analizar(a);
    if (!r) continue;
    let sobre = null;
    if (r.tipo === "gasto") {
      for (const [nombre, re] of Object.entries(PISTAS)) {
        if (re.test(r.descripcion) || re.test(a.asunto)) { sobre = sobres.find((s) => s.nombre === nombre); if (sobre) break; }
      }
      sobre ||= otros;
    }
    const fecha = isNaN(Date.parse(a.fecha)) ? new Date().toISOString() : new Date(a.fecha).toISOString();
    const filas = await sql`
      insert into public.movimientos (user_id, tipo, monto, sobre_id, descripcion, metodo, origen, fecha, externo_id)
      values (${uid}, ${r.tipo}, ${r.monto}, ${sobre?.id ?? null}, ${r.descripcion}, ${r.metodo}, 'gmail', ${fecha}, ${"gmail:" + a.id})
      on conflict (user_id, externo_id) where externo_id is not null do nothing
      returning id`;
    if (filas.length) anotados.push({ nombre: sobre?.nombre || "Ingreso", color: sobre?.color || "#1f7a55", descripcion: r.descripcion, monto: r.monto, tipo: r.tipo });
  }

  await sql`update public.conexiones_gmail set ultima_vez = now(), total = total + ${anotados.length} where user_id = ${uid}`;
  if (anotados.length) {
    const texto = anotados.length === 1 ? "Anoté esto que llegó a tu correo:" : `Anoté ${anotados.length} movimientos que llegaron a tu correo:`;
    await sql`insert into public.mensajes (user_id, rol, texto, extra) values (${uid}, 'luka', ${texto}, ${sql.json({ tarjetas: anotados, lineas: ["Si alguno quedó en la tarjeta equivocada, cámbialo en Movimientos."] })})`;
  }
  return responder({ ok: true, anotados: anotados.length });
});
