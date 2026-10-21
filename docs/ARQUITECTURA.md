# Arquitectura

Estado: aprobada el 2026-10-21 (Fase 2).

## Stack propuesto

| Pieza | Propuesta | Alternativa |
| --- | --- | --- |
| Interfaz | Next.js + TypeScript como PWA | Expo (app nativa) |
| Datos, usuarios, archivos | Supabase: PostgreSQL, autenticación, permisos por fila, almacenamiento | Firebase |
| Liquidación | Funciones puras en TypeScript con pruebas (Vitest) | Vistas SQL |
| Alojamiento | Vercel + una sola base Supabase (`control-construcciones-prueba`, us-east-1); datos ficticios en una organización "Demo" aislada; migraciones probadas en CI antes de aplicarse | Render o Railway |
| IA | Gemini en plan gratis para leer mensajes y recibos, con reglas fijas de respaldo; servidor MCP propio con credencial por agente | Claude (pago) |
| WhatsApp | API oficial de WhatsApp Business (Meta), incremento 2; costos por verificar | Registro manual desde el chat |
| Diseño 3D | glTF/GLB con `<model-viewer>`; fuentes pesadas enlazadas en Drive | Recorridos 360 |

Costo: planes gratis de Vercel, Supabase y Gemini (decidido el 2026-10-21). Por verificar los límites de cada plan.

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
| `expense` | house_id (obligatorio), amount, date, kind (lot, construction, sale_cost, derivado de la categoría), category (lista fija en `apps/web/src/lib/expenses.ts`), supplier_name, paid_by_partner_id, has_receipt, source, status, replaces_id |
| `attachment` | owner_type, owner_id, storage_path, mime_type, size, sha256 |
| `sale` | house_id, buyer_name, agreed_price, status |
| `sale_payment` | sale_id, amount (negativo = devolución), date, source, received_by_partner_id, status |
| `partner_transfer` | house_id, from_partner_id, to_partner_id, amount, date |
| `settlement` | house_id, version, breakdown, totals, approved_by, approved_at, hash |
| `audit_log` | actor, action, table, record_id, before, after, at |

Reglas: `organization_id` y permisos por fila en todo; anular en vez de borrar; casa `settled` no acepta movimientos; bitácora por triggers.

## WhatsApp (incremento 2)

1. Meta envía cada mensaje a `/api/whatsapp`; la app revisa la firma (`WHATSAPP_APP_SECRET`), responde 200 de una vez y procesa después.
2. `whatsapp_context` identifica al socio por su celular (los demás números se ignoran) y trae casas abiertas, sugerencias abiertas y los últimos mensajes.
3. La foto o PDF se descarga de Meta, se revisa por contenido (máx. 4 MB) y se guarda con el mensaje (`whatsapp_record`, que ignora repetidos).
4. Gemini (plan gratis) devuelve JSON con los gastos o la respuesta; si falla, las reglas fijas de `reader.ts` leen el texto. En ambos casos la app valida casas, socios, categoría, valor y fecha antes de guardar con `whatsapp_suggest`.
5. La app contesta por WhatsApp (confirmación o la pregunta que falta). Una persona confirma o descarta en Dinero › Por revisar; al confirmar se crea el gasto con origen `whatsapp` y su soporte.

Variables en Vercel: `WHATSAPP_WEBHOOK_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `GEMINI_API_KEY` (y opcional `GEMINI_MODEL`). Responder dentro de 24 horas en WhatsApp no tiene costo; límites del plan gratis de Gemini: por verificar.

## Inicio de sesión

Correo y contraseña la primera vez en cada celular (la persona crea su contraseña si está invitada; queda el enlace al correo como respaldo, máximo 2 correos por hora en el plan gratis); después PIN de 4 dígitos (cifrado, bloqueo a los 5 intentos, se pide al abrir, tras 15 min sin uso y para aprobar liquidaciones).

## Permisos

- Administrador: todo. Socio operativo: ver, aprobar; registra vía WhatsApp. Consulta: ver sus casas y aprobar liquidación y acuerdo.
- Agentes: nivel 1 lectura, 2 proponer (tabla `suggestion`), 3 editar bajo riesgo con deshacer, 4 código solo en copia de prueba. La base de datos impide que escriban en aportes, abonos o liquidaciones.
