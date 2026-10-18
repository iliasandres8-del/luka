// Avisos de Luka al celular (web push).
// GET            -> llave pública para suscribirse
// POST manana    -> 7 a. m.: "Hoy puedes gastar $X" (lo llama pg_cron)
// POST noche     -> 9 p. m.: recordatorio si no anotó nada hoy (pg_cron)
// POST sobre     -> cuando un gasto deja una tarjeta en 80 % o en rojo (trigger de movimientos)
// POST prueba    -> la persona se manda un aviso de prueba (con su sesión)
// Las llamadas internas traen x-cron, un secreto guardado en la tabla privado.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3";
import webpush from "npm:web-push@3.6.7";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, "Content-Type": "application/json" } });
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

let llaves: { publica: string; privada: string; cron: string } | null = null;
async function cargarLlaves() {
  if (llaves) return llaves;
  const filas = await sql`select clave, valor from public.privado where clave in ('vapid_publica', 'vapid_privada', 'cron')`;
  const m = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
  if (!m.vapid_publica) {
    const nuevas = webpush.generateVAPIDKeys();
    await sql`insert into public.privado (clave, valor) values ('vapid_publica', ${nuevas.publicKey}), ('vapid_privada', ${nuevas.privateKey}) on conflict (clave) do nothing`;
    return cargarLlaves();
  }
  llaves = { publica: m.vapid_publica, privada: m.vapid_privada, cron: m.cron };
  webpush.setVapidDetails("https://iliasandres8-del.github.io/luka/", llaves.publica, llaves.privada);
  return llaves;
}

async function enviar(userId: string, titulo: string, cuerpo: string, etiqueta: string) {
  const subs = await sql`select id, endpoint, p256dh, auth from public.suscripciones where user_id = ${userId}`;
  let enviados = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ titulo, cuerpo, etiqueta }),
        { TTL: 6 * 3600, urgency: "normal" },
      );
      enviados++;
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode;
      if (codigo === 404 || codigo === 410) await sql`delete from public.suscripciones where id = ${s.id}`;
    }
  }
  return enviados;
}

// Fecha de Colombia (UTC-5)
function colombia() {
  const ahora = new Date(Date.now() - 5 * 3600e3);
  const a = ahora.getUTCFullYear(), m = ahora.getUTCMonth(), d = ahora.getUTCDate();
  const finMes = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return {
    dia: d,
    quedan: finMes - d + 1,
    inicioMes: new Date(Date.UTC(a, m, 1, 5)).toISOString(),
    inicioHoy: new Date(Date.UTC(a, m, d, 5)).toISOString(),
  };
}

// Saldo de cada tarjeta este mes, igual que en la app
async function saldos(userId: string, inicioMes: string) {
  return await sql`
    select s.id, s.nombre, s.tipo, s.presupuesto,
      s.presupuesto
        - coalesce(sum(m.monto) filter (where m.sobre_id = s.id and m.tipo in ('gasto','traslado','abono')), 0)
        + coalesce(sum(m.monto) filter (where m.sobre_destino_id = s.id and m.tipo in ('traslado','retiro')), 0) as saldo
    from public.sobres s
    left join public.movimientos m on (m.sobre_id = s.id or m.sobre_destino_id = s.id) and m.fecha >= ${inicioMes}
    where s.user_id = ${userId} and not s.archivado
    group by s.id order by s.orden`;
}

async function manana() {
  const c = colombia();
  const gente = await sql`select p.id, p.nombre from public.perfiles p where p.aviso_manana and p.bienvenida_lista and exists (select 1 from public.suscripciones x where x.user_id = p.id)`;
  let n = 0;
  for (const p of gente) {
    const s = await saldos(p.id, c.inicioMes);
    const libre = s.filter((x) => x.tipo === "gasto").reduce((t, x) => t + Math.max(0, Number(x.saldo)), 0);
    const hoy = Math.floor(libre / c.quedan / 50) * 50;
    const fijos = await sql`select nombre, monto, dia_mes from public.gastos_fijos where user_id = ${p.id} and activo and dia_mes in (${c.dia}, ${c.dia + 1})`;
    let cuerpo = `Te quedan ${c.quedan} días del mes.`;
    if (fijos.length) cuerpo += ` ${fijos[0].dia_mes === c.dia ? "Hoy" : "Mañana"} toca pagar ${fijos[0].nombre} (${pesos(Number(fijos[0].monto))}).`;
    n += await enviar(p.id, `${p.nombre ? p.nombre.split(" ")[0] + ", hoy" : "Hoy"} puedes gastar ${pesos(hoy)}`, cuerpo, "manana");
  }
  return n;
}

async function noche() {
  const c = colombia();
  const gente = await sql`
    select p.id from public.perfiles p
    where p.aviso_noche and p.bienvenida_lista
      and exists (select 1 from public.suscripciones x where x.user_id = p.id)
      and not exists (select 1 from public.movimientos m where m.user_id = p.id and m.creado >= ${c.inicioHoy})`;
  let n = 0;
  for (const p of gente) n += await enviar(p.id, "¿Anotamos lo de hoy?", "No has anotado nada hoy. Cuéntale a Luka en qué gastaste, así sea poquito.", "noche");
  return n;
}

async function sobre(movimientoId: string) {
  const [m] = await sql`select user_id, sobre_id, monto, tipo from public.movimientos where id = ${movimientoId}`;
  if (!m || m.tipo !== "gasto" || !m.sobre_id) return 0;
  const [p] = await sql`select aviso_sobres from public.perfiles where id = ${m.user_id}`;
  if (!p?.aviso_sobres) return 0;
  const c = colombia();
  const s = (await saldos(m.user_id, c.inicioMes)).find((x) => x.id === m.sobre_id);
  if (!s || s.tipo !== "gasto" || Number(s.presupuesto) <= 0) return 0;
  const despues = Number(s.saldo), antes = despues + Number(m.monto), presu = Number(s.presupuesto);
  if (antes >= 0 && despues < 0) return enviar(m.user_id, `Te pasaste en ${s.nombre}`, `Vas ${pesos(-despues)} por encima. Pasa plata de otra tarjeta para cuadrar.`, "sobre-" + s.id);
  if (antes > presu * 0.2 && despues <= presu * 0.2 && despues >= 0)
    return enviar(m.user_id, `${s.nombre} ya va en ${Math.round((1 - despues / presu) * 100)} %`, `Te quedan ${pesos(despues)} para ${c.quedan} días: ${pesos(Math.floor(despues / c.quedan / 50) * 50)} por día.`, "sobre-" + s.id);
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const k = await cargarLlaves();
  if (req.method === "GET") return responder({ publica: k.publica });
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);
  let cuerpo: { tipo?: string; movimiento_id?: string };
  try { cuerpo = await req.json(); } catch { return responder({ error: "Cuerpo inválido" }, 400); }

  if (cuerpo.tipo === "prueba") {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${token}` } });
    if (!u.ok) return responder({ error: "Sesión vencida" }, 401);
    const { id } = await u.json();
    const n = await enviar(id, "Así se ven los avisos de Luka", "Te aviso en la mañana cuánto puedes gastar y cuando una tarjeta se esté acabando.", "prueba");
    return responder({ ok: true, enviados: n });
  }

  if (!k.cron || req.headers.get("x-cron") !== k.cron) return responder({ error: "No autorizado" }, 401);
  if (cuerpo.tipo === "manana") return responder({ ok: true, enviados: await manana() });
  if (cuerpo.tipo === "noche") return responder({ ok: true, enviados: await noche() });
  if (cuerpo.tipo === "sobre" && cuerpo.movimiento_id) return responder({ ok: true, enviados: await sobre(cuerpo.movimiento_id) });
  return responder({ error: "Tipo desconocido" }, 400);
});
