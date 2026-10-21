# Decisiones

Cada decisión con fecha, qué se decidió y por qué. Las más recientes arriba.

| Fecha | Decisión | Razón |
| --- | --- | --- |
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

## Propuestas pendientes de aprobación

- Stack: Next.js (PWA) + Supabase + Vercel. Se decide en la Fase 2.
