# Luka

App de gastos e ingresos para cualquier persona: la plata se reparte en sobres (tarjetas de una billetera), se anota en segundos y Luka da consejos.

Se instala desde el navegador del celular («Agregar a pantalla de inicio»). Cada persona tiene su cuenta y solo ve lo suyo.

## Cómo funciona

- **Inicio**: cuánto puedes gastar hoy (saldo real repartido hasta tu próximo pago, sin los gastos fijos que vienen), sugerencias y resumen de hoy, la semana y el mes.
- **Tarjetas**: las categorías de gasto con lo que llevas este mes; tope opcional por tarjeta.
- **Anotar**: monto, tarjeta y opciones rápidas de descripción (aprende las que más usas). También por chat con Luka o desde las alertas del banco en Gmail.
- **Metas y deudas**: ahorro con proyección de cuándo llegas y ahorro sugerido cuando te entra plata.
- **Avisos** al celular: 7 a. m., 9 p. m. y cuando una tarjeta pasa su tope.

## Técnica

- HTML, CSS y JavaScript sin compilar, en GitHub Pages.
- Supabase (proyecto `luka`): tablas `perfiles`, `sobres` (tarjetas), `metas`, `deudas`, `gastos_fijos`, `movimientos`, `mensajes`, `suscripciones`, `conexiones_gmail`, todas con RLS por usuario. Saldo con `mi_saldo()`.
- Funciones: `luka-avisos` y `luka-gmail` (proyecto luka), `luka-chat` (proyecto panel-personal, donde está la llave de Gemini). Fuentes en `funciones/`.
- Íconos: `powershell -File iconos\generar.ps1`.
