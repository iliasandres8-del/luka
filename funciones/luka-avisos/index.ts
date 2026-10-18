// Avisos de Luka al celular (web push).
// GET            -> llave pública para suscribirse
// POST manana    -> 7 a. m.: "Hoy puedes gastar $X" con el saldo real hasta el próximo pago (pg_cron)
// POST noche     -> 9 p. m.: recordatorio si no anotó nada hoy (pg_cron)
// POST sobre     -> cuando un gasto pasa el 80 % o el 100 % del tope de una tarjeta (trigger de movimientos)
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

// Próximo día de pago según cada cuánto le pagan (fechas de Colombia como UTC a medianoche)
function proximoPago(frecuencia: string, dias: number[], hoy: Date) {
  if (frecuencia === "semanal" && dias.length) {
    let d = new Date(hoy.getTime() + 864e5);
    while (d.getUTCDay() !== dias[0] % 7) d = new Date(d.getTime() + 864e5);
    return d;
  }
  if ((frecuencia === "mensual" || frecuencia === "quincenal") && dias.length) {
    const c: Date[] = [];
    for (let k = 0; k < 2; k++) for (const dia of dias) {
      const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + k + 1, 0)).getUTCDate();
      c.push(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + k, Math.min(dia, fin))));
    }
    return c.filter((d) => d > hoy).sort((x, y) => x.getTime() - y.getTime())[0];
  }
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1));
}

async function manana() {
  const c = colombia();
  const ahora = new Date(Date.now() - 5 * 3600e3);
  const hoy = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const gente = await sql`
    select p.id, p.nombre, p.frecuencia, p.dias_pago,
      coalesce((select sum(case m.tipo when 'ingreso' then m.monto when 'retiro' then m.monto when 'gasto' then -m.monto when 'abono' then -m.monto else 0 end)
                from public.movimientos m where m.user_id = p.id), 0)::bigint as saldo
    from public.perfiles p
    where p.aviso_manana and p.bienvenida_lista and exists (select 1 from public.suscripciones x where x.user_id = p.id)`;
  let n = 0;
  for (const p of gente) {
    const pago = proximoPago(p.frecuencia, p.dias_pago || [], hoy);
    const dias = Math.max(1, Math.round((pago.getTime() - hoy.getTime()) / 864e5));
    // Fijos sin pagar este mes que vencen antes del próximo pago
    const fijos = await sql`
      select f.nombre, f.monto, f.dia_mes from public.gastos_fijos f
      where f.user_id = ${p.id} and f.activo and f.dia_mes is not null
        and not exists (select 1 from public.movimientos m where m.user_id = ${p.id} and m.tipo = 'gasto' and m.descripcion = f.nombre and m.fecha >= ${c.inicioMes})`;
    const finMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0)).getUTCDate();
    const pendiente = fijos.filter((f) => {
      let d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), Math.min(f.dia_mes, finMes)));
      if (d < hoy) d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, f.dia_mes));
      return d < pago;
    }).reduce((t, f) => t + Number(f.monto), 0);
    const porDia = Math.max(0, Math.floor((Number(p.saldo) - pendiente) / dias / 50) * 50);
    let cuerpo = `Tienes ${pesos(Number(p.saldo))} y tu pago llega en ${dias} ${dias === 1 ? "día" : "días"}.`;
    const pronto = fijos.find((f) => f.dia_mes === c.dia || f.dia_mes === c.dia + 1);
    if (pronto) cuerpo += ` ${pronto.dia_mes === c.dia ? "Hoy" : "Mañana"} toca pagar ${pronto.nombre} (${pesos(Number(pronto.monto))}).`;
    n += await enviar(p.id, `${p.nombre ? p.nombre.split(" ")[0] + ", hoy" : "Hoy"} puedes gastar ${pesos(porDia)}`, cuerpo, "manana");
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
  const [m] = await sql`select user_id, sobre_id, monto, tipo, origen from public.movimientos where id = ${movimientoId}`;
  if (!m || m.tipo !== "gasto" || !m.sobre_id || m.origen === "ajuste") return 0;
  const [p] = await sql`select aviso_sobres from public.perfiles where id = ${m.user_id}`;
  if (!p?.aviso_sobres) return 0;
  const c = colombia();
  const [s] = await sql`
    select s.nombre, s.presupuesto,
      coalesce((select sum(x.monto) from public.movimientos x where x.sobre_id = s.id and x.tipo = 'gasto' and x.origen <> 'ajuste' and x.fecha >= ${c.inicioMes}), 0)::bigint as gastado
    from public.sobres s where s.id = ${m.sobre_id}`;
  const tope = Number(s?.presupuesto || 0);
  if (!tope) return 0;
  const despues = Number(s.gastado), antes = despues - Number(m.monto);
  if (antes <= tope && despues > tope) return enviar(m.user_id, `Te pasaste del tope de ${s.nombre}`, `Llevas ${pesos(despues)} de ${pesos(tope)} este mes.`, "sobre-" + m.sobre_id);
  if (antes < tope * 0.8 && despues >= tope * 0.8) return enviar(m.user_id, `${s.nombre} ya va en ${Math.round((despues / tope) * 100)} %`, `Te quedan ${pesos(tope - despues)} de tu tope para ${c.quedan} días.`, "sobre-" + m.sobre_id);
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
