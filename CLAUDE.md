# Control de construcciones

App web para controlar un negocio familiar de construcción y venta de casas en Atlántico, Colombia. Dueño del producto: Mauricio. Usuarios: Mauricio (administrador), su papá (socio operativo, reporta gastos por WhatsApp) y el socio (solo consulta).

## Reglas estables

- Interfaz en español de Colombia; código, tablas y nombres técnicos en inglés.
- Montos en pesos colombianos como enteros (`bigint`). Nunca punto flotante.
- Zona horaria America/Bogota.
- Todas las tablas llevan `organization_id` y permisos por fila.
- Gastos y abonos no se borran ni cambian de monto: se anulan y se reemplazan.
- Toda escritura queda en `audit_log` (por triggers de base de datos).
- Los agentes nunca modifican aportes, abonos ni liquidaciones sin aprobación humana.
- La lógica de liquidación vive en funciones puras con pruebas automatizadas; ver `docs/ARQUITECTURA.md`.
- Normativa colombiana (impuestos, facturación, sociedad, datos personales): no asumir, marcar "por verificar".

## Modo de trabajo

- Fases con aprobación: no escribir código de la app sin aprobación explícita de la fase.
- Pedir confirmación antes de instalar dependencias, borrar archivos o comandos de gran impacto.
- Máximo 3 preguntas por turno. Distinguir lo sabido, lo asumido y lo por verificar.
- Commits pequeños con mensajes claros.
- Actualizar `docs/` con cada decisión.

## Documentos

- `docs/VISION.md`: alcance y módulos.
- `docs/DECISIONES.md`: decisiones con fecha y razón.
- `docs/ARQUITECTURA.md`: stack, modelo de datos, permisos, agentes.
- `docs/ROADMAP.md`: fases y estado.
