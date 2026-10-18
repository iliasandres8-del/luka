// Cerebro del chat de Luka. Vive en el proyecto panel-personal porque ahí está guardada la llave de Gemini.
// Comprueba la sesión contra el proyecto luka, lee los datos de la persona con su propio token (RLS)
// y le pide a Gemini una respuesta corta más los gastos que haya que anotar.
// Las cuentas (saldo, cuánto puede gastar) las hace la app y llegan en "resumen"; la IA no las inventa.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3";

const LUKA_URL = "https://nuotkljmwojymfcodgph.supabase.co";
const LUKA_KEY = "sb_publishable_L1ZV86fVmwvaHigXBEjADw_b67Tws9L";
const MODELOS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
let llave: string | null = null;
async function llaveGemini() {
  if (llave) return llave;
  const [f] = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'gemini_api_key'`;
  llave = f?.decrypted_secret ?? null;
  return llave;
}

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });

async function luka(ruta: string, token: string) {
  const r = await fetch(`${LUKA_URL}${ruta}`, { headers: { apikey: LUKA_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`luka ${ruta}: ${r.status}`);
  return r.json();
}

const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

type Sobre = { id: string; nombre: string; tipo: string; presupuesto: number };
type Mov = { tipo: string; monto: number; sobre_id: string | null; sobre_destino_id: string | null; descripcion: string; metodo: string; fecha: string };

async function contexto(token: string, resumen: string) {
  // Hora de Colombia (UTC-5, sin horario de verano)
  const ahora = new Date(Date.now() - 5 * 3600e3);
  const hoy = ahora.toISOString().slice(0, 10);
  const ayer = new Date(ahora.getTime() - 864e5).toISOString().slice(0, 10);
  const desde = new Date(Date.now() - 21 * 864e5).toISOString();
  const [perfil, sobres, movs] = await Promise.all([
    luka("/rest/v1/perfiles?select=nombre", token),
    luka("/rest/v1/sobres?select=id,nombre,tipo&archivado=eq.false&tipo=neq.ahorro&order=orden", token) as Promise<Sobre[]>,
    luka(`/rest/v1/movimientos?select=tipo,monto,sobre_id,sobre_destino_id,descripcion,metodo,fecha,origen&fecha=gte.${desde}&origen=neq.ajuste&order=fecha.desc&limit=30`, token) as Promise<Mov[]>,
  ]);
  const nombreDe = (id: string | null) => sobres.find((s) => s.id === id)?.nombre ?? "sin tarjeta";
  const texto = [
    `Hoy es ${DIAS[ahora.getUTCDay()]} ${hoy} (ayer fue ${ayer}). La persona se llama ${perfil[0]?.nombre || "sin nombre"}.`,
    "Cuentas hechas por la app (son exactas, úsalas tal cual):",
    String(resumen || "").slice(0, 4000),
    "Últimos movimientos (3 semanas):",
    ...movs.map((x) => `- ${x.fecha.slice(0, 10)} ${x.tipo} ${pesos(x.monto)} ${x.descripcion || ""}${x.tipo === "gasto" ? ` (${nombreDe(x.sobre_id)})` : ""}${x.metodo ? ", " + x.metodo : ""}`),
  ].join("\n");
  return { texto, hoy, sobres: sobres.map((s) => ({ nombre: s.nombre, tipo: s.tipo })) };
}

const INSTRUCCIONES = (tarjetas: string, hoy: string) => `Eres Luka, el asistente de una app colombiana de gastos. La persona anota lo que gasta en tarjetas (categorías como Comida o Transporte) y Luka le lleva el saldo real.
Hablas como un parcero colombiano: cercano, relajado, claro y CORTO (máximo 3 frases). Tuteas. Nada de emojis en exceso (máximo uno).

Tu trabajo:
1. ANOTAR: si la persona cuenta que gastó o le entró plata ("gasté 12 en un perro", "me pagaron la quincena 480", "15 lucas de almuerzo y 8 de bus"),
   devuelve cada movimiento en "anotar". Montos en pesos enteros: "12" o "12 mil" o "12k" o "12 lucas" = 12000; "1,5 millones" = 1500000; "480" para una quincena = 480000.
   Si dice un número pequeño sin unidad (menor a 1000), son miles.
   "sobre" es la tarjeta (categoría) y debe ser EXACTAMENTE uno de estos nombres: ${tarjetas}. Escoge el que más tenga sentido (comida, transporte, salidas…). Si ninguno encaja, usa "Otros" si existe; si no, el primero.
   Para ingresos deja "sobre" vacío. "fecha" en AAAA-MM-DD (hoy es ${hoy}; "ayer" es el día anterior). "metodo": Nequi, Efectivo, Tarjeta, Daviplata o Transferencia si lo dice; si no, vacío.
   "descripcion": corta, con mayúscula inicial ("Perro caliente", "Gasolina", "Quincena").
   Cuando solo anotas, "respuesta" debe ser vacía: la app muestra sola cómo quedan las tarjetas.
2. RESPONDER preguntas sobre su plata ("¿me alcanza para salir el sábado?", "¿en qué se me va la plata?", "¿cuánto llevo en comida?") usando SOLO los números del contexto.
   No inventes cifras. Si tienes que sumar o restar, hazlo con cuidado. Si no tienes el dato, dilo.
3. En "botones" puedes poner 1 o 2 respuestas rápidas cortas que la persona podría tocar (ej. "¿En qué gasto más?", "¿Cuánto llevo esta semana?"). Deja "mover" siempre vacío.
   Si te preguntan si les alcanza para algo, compáralo con lo que pueden gastar por día y con el saldo, y sugiere qué hacer.
4. Si piden consejos de inversión, acciones o cripto, di que eso no lo das y vuelve a su presupuesto.
Nunca anotes algo que la persona no dijo claramente que gastó o recibió. Si pregunta "¿y si gasto 50?", NO lo anotes.`;

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    respuesta: { type: "STRING" },
    anotar: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING", enum: ["gasto", "ingreso"] },
          monto: { type: "NUMBER" },
          descripcion: { type: "STRING" },
          sobre: { type: "STRING" },
          metodo: { type: "STRING" },
          fecha: { type: "STRING" },
        },
        required: ["tipo", "monto", "descripcion", "sobre", "fecha"],
      },
    },
    mover: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { de: { type: "STRING" }, a: { type: "STRING" }, monto: { type: "NUMBER" } }, required: ["de", "a", "monto"] },
    },
    botones: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["respuesta", "anotar", "mover", "botones"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return responder({ error: "Falta la sesión" }, 401);

  // ¿Es alguien con sesión en Luka?
  const u = await fetch(`${LUKA_URL}/auth/v1/user`, { headers: { apikey: LUKA_KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return responder({ error: "Sesión vencida. Vuelve a entrar." }, 401);

  let cuerpo: { mensaje?: string; historial?: { rol: string; texto: string }[]; resumen?: string };
  try { cuerpo = await req.json(); } catch { return responder({ error: "Cuerpo inválido" }, 400); }
  const mensaje = String(cuerpo.mensaje || "").trim().slice(0, 600);
  if (!mensaje) return responder({ error: "Mensaje vacío" }, 400);

  let ctx;
  try { ctx = await contexto(token, cuerpo.resumen || ""); } catch (e) { return responder({ error: "No pude leer tus datos.", detalle: (e as Error).message }, 502); }
  const tarjetas = ctx.sobres.map((s) => `"${s.nombre}"`).join(", ");

  const historial = (cuerpo.historial || []).slice(-10).map((h) => ({
    role: h.rol === "yo" ? "user" : "model",
    parts: [{ text: String(h.texto || "").slice(0, 600) || "(anotado)" }],
  }));
  const peticion = {
    systemInstruction: { parts: [{ text: INSTRUCCIONES(tarjetas, ctx.hoy) + "\n\nCONTEXTO ACTUAL DE SU PLATA:\n" + ctx.texto }] },
    contents: [...historial, { role: "user", parts: [{ text: mensaje }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA, temperature: 0.3 },
  };

  const k = await llaveGemini();
  if (!k) return responder({ error: "Luka no tiene llave de IA configurada." }, 500);
  let ultimoError = "";
  for (const modelo of MODELOS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST", headers: { "x-goog-api-key": k, "Content-Type": "application/json" }, body: JSON.stringify(peticion),
      });
      if (!r.ok) { ultimoError = `${modelo}: ${r.status}`; continue; }
      const j = await r.json();
      const texto = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
      const datos = JSON.parse(texto);
      datos.anotar = (datos.anotar || []).filter((x: { monto: number }) => Number(x.monto) > 0).map((x: { monto: number }) => ({ ...x, monto: Math.round(Number(x.monto)) }));
      datos.mover = (datos.mover || []).filter((x: { monto: number }) => Number(x.monto) > 0).map((x: { monto: number }) => ({ ...x, monto: Math.round(Number(x.monto)) }));
      datos.botones = (datos.botones || []).slice(0, 2);
      return responder({ ok: true, modelo, ...datos });
    } catch (e) { ultimoError = `${modelo}: ${(e as Error).message}`; }
  }
  return responder({ error: "Luka no pudo pensar ahora. Intenta en un minuto.", detalle: ultimoError }, 503);
});
