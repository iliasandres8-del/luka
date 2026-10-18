# Luka

App de gastos e ingresos para cualquier persona: la plata se reparte en sobres (tarjetas de una billetera), se anota en segundos y Luka da consejos.

Se instala desde el navegador del celular («Agregar a pantalla de inicio»). Cada persona tiene su cuenta y solo ve lo suyo.

## Partes

1. **Cuentas y bienvenida** (lista): registro con correo, 4 pasos (ingreso, gastos fijos, meta y reparto en sobres) e inicio con la billetera.
2. Billetera y anotar gastos, ingresos y traslados.
3. Chat con Luka.
4. Metas y avisos.
5. Conexión opcional con Gmail para leer las alertas del banco.

## Técnica

- HTML, CSS y JavaScript sin compilar, en GitHub Pages.
- Supabase (proyecto `luka`): tablas `perfiles`, `sobres`, `metas`, `gastos_fijos`, `movimientos`, todas con RLS por usuario.
- Íconos: `powershell -File iconos\generar.ps1`.
