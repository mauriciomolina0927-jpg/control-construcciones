# Roadmap

| Fase | Contenido | Estado |
| --- | --- | --- |
| 0. Descubrimiento | Negocio, vacíos, riesgos | Terminada (2026-10-21) |
| 1. Especificación | Módulos, pantallas, reglas, modelo de datos, 13 casos de prueba | Aprobada (2026-10-21) |
| 2. Arquitectura | Stack, seguridad, permisos, despliegue, pruebas, repositorio | Aprobada (2026-10-21) ([doc](https://claude.ai/artifact/LFsMR6Gk3uYMzNokT5YnSC)) |
| 3. Construcción | Incrementos usables por separado | Incremento 1 publicado (2026-10-21); en curso: incremento 2 (WhatsApp) |

## Incrementos de la Fase 3

1. Núcleo financiero: casas, aportes, gastos, liquidación provisional y final, bitácora, registro manual.
2. WhatsApp con agente y bandeja de sugerencias; recibo por foto (la app lee el recibo y propone el gasto); pantalla Hoy.
3. Ventas y cartera; enlace de consulta para el comprador; alertas de lo pendiente por pagar o cobrar; simulador de venta; estado de cuenta por socio; exportación para el contador.
4. Presupuesto por capítulos; costo real por m² para presupuestar la siguiente casa; proveedores e historial de precios.
5. Documentos, Biblioteca de diseño, marketing.
6. Servidor MCP, varias empresas.

Fuera por ahora: informe mensual automático para el socio (decidido el 2026-10-21).

## Riesgos principales

- Adopción del papá (mitigado con WhatsApp).
- Regla de liquidación sin acuerdo escrito (acuerdo versionado por casa).
- Sobrealcance para 2 casas al año.
- Normativa y tributaria (verificar con contador).
- Agentes con demasiado permiso (niveles y bloqueo en base de datos).
