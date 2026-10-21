# Decisiones

Cada decisión con fecha, qué se decidió y por qué. Las más recientes arriba.

| Fecha | Decisión | Razón |
| --- | --- | --- |
| 2026-10-21 | Diseño aprobado ("versión limpia"): letra Geist, fondo gris claro, tarjetas blancas, negro para lo activo y naranja como único acento. Cinco secciones (Inicio, Casas, Dinero, Ventas, Socios); en el celular, barra inferior con el botón + para registrar. Cada casa tiene etapas y pestañas (Resumen, Gastos, Venta, Reparto, Actividad). Los capítulos de obra muestran solo plata, sin % de avance | Mauricio pidió algo menos básico, con la letra y el estilo de un ejemplo que él escogió, y lo más limpio posible |
| 2026-10-21 | Mejoras que entran (después de publicar el incremento 1): recibo por foto (la app lee valor, proveedor y fecha y propone el gasto; una persona confirma), simulador de venta (precio → cuánto le queda a cada socio, con la regla del reparto), costo real por m² y por capítulo para presupuestar la siguiente casa, historial de precios por material y proveedor, y enlace de consulta para el comprador (fotos y estado de sus pagos) | Elegidas por Mauricio; el simulador y el costo por m² usan datos que la app ya guarda |
| 2026-10-21 | Las alertas son solo de lo pendiente por pagar o cobrar: fiados a proveedores, saldo del maestro en cada corte y cuotas vencidas del comprador. No hay alertas de presupuesto | Pedido de Mauricio |
| 2026-10-21 | Queda fuera por ahora el informe mensual automático para Jesús | Mauricio no lo necesita todavía |
| 2026-10-21 | La liquidación final se genera cuando ya hay plata recibida y los socios están a paz y salvo (los traslados entre socios se registran antes). Si después se mueve plata, deja de valer y se genera otra versión | Una casa liquidada no recibe más movimientos, así que los traslados deben quedar antes del cierre |
| 2026-10-21 | Cada socio aprueba con su PIN, verificado dentro de la base de datos; un PIN equivocado cuenta para el bloqueo. Al aprobar el último, la base marca la casa como liquidada; nadie puede marcarla a mano ni reabrirla | La regla no depende de la app ni de un agente |
| 2026-10-21 | Registrar la venta pasa la casa a "Vendida"; cada abono dice de dónde vino (comprador, crédito, subsidio, cesantías) y a qué socio le llegó; una devolución al comprador es un abono negativo | Así sale "lo que nos debemos" sin pasos extra |
| 2026-10-21 | Lista fija de 12 categorías de gasto; cada una define si el gasto es de lote, obra o venta, así quien registra no tiene que elegir el tipo | Un campo menos para el papá y la liquidación no depende de que alguien acierte el tipo |
| 2026-10-21 | La foto del soporte se comprime en el celular (lado mayor 1.600 px, JPEG) y viaja con el formulario; el servidor revisa por contenido que sea foto o PDF, calcula su huella sha256 y la guarda en almacenamiento privado. Límite 4 MB | Vercel no recibe más de 4,5 MB por petición; revisar antes de guardar es más seguro que dejar que el celular suba directo |
| 2026-10-21 | "Registrar el correcto" anula el gasto equivocado en la misma operación y lo enlaza; cada gasto se corrige una sola vez | Nunca quedan contados los dos, ni ninguno |
| 2026-10-21 | Stack aprobado en la Fase 2: Next.js (PWA) + Supabase + Vercel, cuentas a nombre de Mauricio | Poco mantenimiento, permisos en la base de datos, costo bajo |
| 2026-10-21 | Una sola base de datos en Supabase (proyecto `control-construcciones-prueba`, us-east-1) que es la real; sin proyecto de producción separado. Mitigación: migraciones probadas en CI sobre una base temporal, datos ficticios en una organización "Demo" aislada por permisos, copia semanal a Google Drive | Decisión de Mauricio; el plan gratuito permite 2 proyectos y uno lo usa `finanzas-hogar` |
| 2026-10-21 | Inicio de sesión: enlace al correo la primera vez en cada celular, luego PIN de 4 dígitos (cifrado en servidor, bloqueo a los 5 intentos, se pide al abrir, tras 15 min sin uso y para aprobar liquidaciones; cierre remoto de sesión) | Fácil para el papá y el socio, con protecciones porque un PIN de 4 dígitos solo es débil |
| 2026-10-21 | Fase 1 (especificación) aprobada; se agrega el caso 13: lote 65, construcción 75, ingreso neto 180 → socio 85, papá 95 | Ejemplo real de Mauricio, cuadra con la cascada |
| 2026-10-21 | Borradores de docs/ en la carpeta del proyecto hasta crear el repositorio en la Fase 2 | No hay repositorio aún |
| 2026-10-21 | Cada abono registra a qué socio le llegó el dinero | La cuenta receptora depende de cada negocio; de ahí sale "lo que nos debemos" |
| 2026-10-21 | Gastos generales se cargan a la casa activa; con dos activas se elige la casa | Evita repartos arbitrarios; no hay gastos sin casa |
| 2026-10-21 | Liquidación en cascada: 1) reembolsar gastos de venta a quien pagó, 2) capital pro-rata al aporte, 3) utilidad 50/50; recalculada con cada abono | Una sola regla cubre el ejemplo, pagos parciales y pérdidas |
| 2026-10-21 | Pagos parciales devuelven capital primero, en proporción al aporte; utilidad solo cuando todo el capital está recuperado | Así se trabaja hoy (confirmado por Mauricio) |
| 2026-10-21 | Pérdidas se reparten en proporción al aporte | Confirmado por Mauricio |
| 2026-10-21 | El aporte de cada socio es la suma de lo que pagó; cada gasto registra quién pagó | El dinero sale de la cuenta del papá; el socio aporta el lote; el papá paga algunos gastos del lote |
| 2026-10-21 | Los gastos se reportan por WhatsApp y se registran en la app; Mauricio es el usuario principal | Más fácil para el papá. WhatsApp guarda mensajes sin señal, así que el modo sin conexión deja de ser urgente |
| 2026-10-21 | El socio entra con rol de solo consulta | Transparencia sin riesgo de cambios |
| 2026-10-21 | No se cargan las 4 casas históricas; se usan datos ficticios | Los datos del cuaderno no están organizados |
| 2026-10-21 | Montos en pesos enteros; el peso sobrante de un reparto va al socio con mayor aporte | Exactitud sin punto flotante, resultado determinista |
| 2026-10-21 | Gastos y abonos se anulan y reemplazan, nunca se borran | Auditoría |
| 2026-10-21 | `organization_id` en todas las tablas desde el inicio, sin funciones de producto aún | Bajo costo hoy, evita migración si se vuelve producto |

