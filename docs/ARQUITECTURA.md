# Arquitectura

Estado: borrador. El stack es una propuesta; se decide en la Fase 2.

## Stack propuesto

| Pieza | Propuesta | Alternativa |
| --- | --- | --- |
| Interfaz | Next.js + TypeScript como PWA | Expo (app nativa) |
| Datos, usuarios, archivos | Supabase: PostgreSQL, autenticación, permisos por fila, almacenamiento | Firebase |
| Liquidación | Funciones puras en TypeScript con pruebas (Vitest) | Vistas SQL |
| Alojamiento | Vercel + Supabase, proyectos separados de prueba y producción | Render o Railway |
| IA | API de Claude para leer recibos; servidor MCP propio con credencial por agente | Otros OCR |
| WhatsApp | API oficial de WhatsApp Business (Meta), incremento 2; costos por verificar | Registro manual desde el chat |
| Diseño 3D | glTF/GLB con `<model-viewer>`; fuentes pesadas enlazadas en Drive | Recorridos 360 |

Costo estimado: ~45 USD/mes más IA (por verificar).

## Liquidación

Se recalcula con el total recibido a la fecha (R):

1. Reembolsar gastos de venta a quien los pagó.
2. Capital devuelto a cada socio = min(R, C) × aporte / C.
3. Utilidad = max(R − C, 0) repartida 50/50.

Montos en pesos enteros; el peso sobrante va al socio con mayor aporte. La liquidación final se congela en `settlement` con su desglose y la aprueban ambos socios.

## Modelo de datos (núcleo)

| Tabla | Campos clave |
| --- | --- |
| `organization` | name, timezone |
| `app_user`, `membership` | user_id, organization_id, role |
| `partner` | name, user_id |
| `house` | name, address, stage (lot, design, construction, for_sale, sold, settled), expected_price |
| `house_agreement` | house_id, version, profit_split, lot_value, accepted_by, accepted_at |
| `expense` | house_id (obligatorio), amount, date, kind (lot, construction, sale_cost), category_id, supplier_name, paid_by_partner_id, has_receipt, source, status, replaces_id |
| `attachment` | owner_type, owner_id, storage_path, mime_type, size, sha256 |
| `sale` | house_id, buyer_name, agreed_price, status |
| `sale_payment` | sale_id, amount (negativo = devolución), date, source, received_by_partner_id, status |
| `partner_transfer` | house_id, from_partner_id, to_partner_id, amount, date |
| `settlement` | house_id, version, breakdown, totals, approved_by, approved_at, hash |
| `audit_log` | actor, action, table, record_id, before, after, at |

Reglas: `organization_id` y permisos por fila en todo; anular en vez de borrar; casa `settled` no acepta movimientos; bitácora por triggers.

## Permisos

- Administrador: todo. Socio operativo: ver, aprobar; registra vía WhatsApp. Consulta: ver sus casas y aprobar liquidación y acuerdo.
- Agentes: nivel 1 lectura, 2 proponer (tabla `suggestion`), 3 editar bajo riesgo con deshacer, 4 código solo en copia de prueba. La base de datos impide que escriban en aportes, abonos o liquidaciones.
