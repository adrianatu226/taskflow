# Torre Central — Autolab: Especificaciones Técnicas y de Negocio

## Contexto de Negocio

Autolab es una empresa de gestión de talleres automotrices que opera una red de talleres y flotas de vehículos. Los asesores de servicio (llamados "superadmin" en los datos) son responsables de acompañar cada vehículo a lo largo de su ciclo de reparación, desde la recepción hasta la entrega. Torre Central es el panel de control operativo en tiempo real que permite a los asesores y supervisores detectar desviaciones de SLA antes de que escalen.

---

## Flujo de Negocio: Ciclo de Vida de un Vehículo

Un vehículo entra al sistema en el momento de su recepción en el taller y recorre las siguientes fases secuenciales:

```
Diagnóstico → Cotización → [Asignar Cotización] → Aprobación → Ejecución → [Sin Confirmar] → Por Entregar
```

| Fase | Estado interno | Descripción |
|---|---|---|
| Diagnóstico | `diagnostico` | El taller inspecciona el vehículo. SLA: 30 minutos máximo |
| Cotización | `cotizacion` | El asesor genera la cotización de trabajos. SLA: 1 día hábil |
| Asignar Cotización | `asignar_cotizacion` | Cotización lista, pendiente de enviar al cliente |
| Aprobación | `aprobacion` | Cliente decide aprobar o rechazar trabajos. SLA: 4 horas |
| Ejecución | `ejecucion` | El taller realiza los trabajos aprobados. SLA variable por tipo |
| Sin Confirmar | `entrega_sinconf` | Trabajos listos, pero el taller no confirmó la salida |
| Por Entregar | `entrega` | Taller confirmó, pendiente de que el cliente recoja |

### Tipos de Servicio y SLAs de Ejecución

| Tipo | Campo `SERVICIO` | Días hábiles máximos |
|---|---|---|
| Correctivo | `CORRECTIVO` | 3 días |
| HyP Sencillo | `HYP SENCILLO` | 5 días |
| HyP Complejo | `HYP COMPLEJO` | 14 días |
| Estacionamiento | `ESTACIONAMIENTO` | Sin SLA (resguardo) |

### Sistema de Alertas

Cada vehículo tiene un nivel de alerta calculado en tiempo real:

- **Lagging** (rojo): SLA vencido o en situación crítica. Requiere acción inmediata.
- **Leading** (azul): SLA próximo a vencer (≥60–80%). Requiere atención preventiva.
- **Ok** (gris): Dentro de parámetros normales.

---

## Especificaciones Técnicas

### Stack Actual

| Componente | Tecnología |
|---|---|
| Frontend | Vanilla HTML/CSS/JavaScript (ES6+) |
| Fuente de datos | Google Sheets + Google Apps Script |
| Protocolo de datos | JSONP (`?callback=_dataCb`) |
| Persistencia cliente | `localStorage` |
| Exportación | SheetJS / XLSX v0.18.5 (CDN) |
| Tipografías | Google Fonts (JetBrains Mono, Syne) |
| Despliegue | Archivo `.html` abierto directamente en navegador |

### Estructura del Archivo Único

Todo el código vive en `Torre Central — Autolab.html` (~1,773 líneas):

- **Líneas 1–660**: CSS embebido (`<style>`)
- **Líneas 661–1,773**: JavaScript embebido (`<script>`) + HTML de vistas
- No existe separación de archivos ni proceso de build

### Modelo de Datos: Campos Clave por Vehículo

Los datos llegan como un array de objetos planos desde Apps Script. Campos relevantes:

| Campo raw | Tipo | Descripción |
|---|---|---|
| `appointment_id` | string | ID único de la cita/OT |
| `vehicle_plates` | string | Placa del vehículo |
| `modelo` | string | Modelo del vehículo |
| `name_shop` | string | Nombre del taller |
| `fleet` | string | Flota/empresa a la que pertenece el vehículo |
| `superadmin` | string | Nombre del asesor responsable |
| `SERVICIO` | string | Tipo de servicio (`CORRECTIVO`, `HYP SENCILLO`, etc.) |
| `estado` | string | Estado textual desde el sistema fuente |
| `Estado SLA` | string | Descripción textual del estado de SLA |
| `SLA 3` | string | Estado de fase (ej: `TRABAJANDOSE`, `COTIZANDO / DIAGNOSTICANDO`) |
| `ESTADO 2` | string | Estado secundario del sistema fuente |
| `reception_time` | datetime | Timestamp de recepción en taller |
| `sla_entrega` | datetime | Fecha límite de SLA de entrega |
| `quote_max_converted_at` | datetime | Última cotización generada |
| `dias habiles desde recepcion` | number | Días hábiles desde recepción |
| `dias habiles desde aprobacion` | number | Días hábiles desde aprobación del cliente |
| `pct_sla_quote_teoric_expiration` | float (0–1) | % del SLA de cotización consumido |
| `pct_sla_entrega` | float (0–1) | % del SLA de entrega consumido |
| `total_pending_price` | number | Valor monetario pendiente (MXN) |
| `cantidad_upsales` | int | Número de cotizaciones generadas (>1 indica posible diagnóstico incompleto) |
| `is_light` | bool/string | Indicador de vehículo ligero |
| `first_job_start_date` | datetime | Fecha en que el taller inició los trabajos |

**Campos computados** (generados en `processData()`):

| Campo | Valores posibles |
|---|---|
| `_phase` | `diagnostico`, `cotizacion`, `asignar_cotizacion`, `aprobacion`, `ejecucion`, `entrega_sinconf`, `entrega`, `resguardo`, `otro` |
| `_alert` | `lagging`, `leading`, `ok` |
| `_alertMsg` | string descriptivo para mostrar en UI |

### Lógica de Detección de Fase (`detectPhase`)

La fase se determina priorizando campos en este orden:
1. `SERVICIO === 'ESTACIONAMIENTO'` → `resguardo`
2. `SLA 3` o `ESTADO 2` contiene `RESGUARDO` → `resguardo`
3. `estado` contiene `sin confirmacion` → `entrega_sinconf`
4. `estado` o `SLA 3` contiene indicadores de entrega → `entrega`
5. `SLA 3 === 'TRABAJANDOSE'` o SLA menciona entrega → `ejecucion`
6. `SLA 3 === 'ESPERANDO APROBACION'` → `aprobacion`
7. `SLA 3 === 'COTIZANDO / DIAGNOSTICANDO'` → `cotizacion` o `diagnostico` (según si SLA dice "por empezar")
8. Fallback por texto en `Estado SLA` → `diagnostico` / `cotizacion`

### Filtros Disponibles

| Filtro | Campo fuente | Modo |
|---|---|---|
| Flota | `fleet` | Multi-select inclusivo |
| Taller | `name_shop` | Multi-select inclusivo o exclusivo |
| Servicio | `SERVICIO` | Multi-select inclusivo |
| Fase (Asesores) | `_phase` | Multi-select exclusivo |
| Asesor | `superadmin` | Single-select |

### Persistencia en localStorage

| Clave | Contenido |
|---|---|
| `torre_cfg` | `{ user: string, key: string }` — configuración del usuario |
| `torre_tasks` | Array de tareas `{ id, title, assignee, priority, plate, done, ts }` |
| `notes_<appointment_id>` | Array de notas `{ text, user, ts }` |
| `partes_<appointment_id>` | `{ status: string, log: [{ ts, text, user }] }` |

---

## Limitaciones de la Arquitectura Actual y Migración Recomendada

### Problemas del Esquema Actual (Google Sheets + JSONP)

La fuente de datos actual tiene limitaciones estructurales importantes:

1. **Sin acceso directo a BD**: Los datos pasan por Google Sheets como intermediario, lo que introduce latencia, inconsistencias y dependencia de una hoja de cálculo que puede ser editada manualmente.
2. **JSONP inseguro**: El mecanismo JSONP (`<script src="...?callback=_dataCb">`) es una técnica obsoleta sin soporte para autenticación ni HTTPS forzado.
3. **Solo lectura**: La aplicación no puede escribir de vuelta al sistema fuente; tareas y notas quedan atrapadas en `localStorage` del navegador del usuario.
4. **Sin tiempo real**: La actualización automática es un polling cada 300 segundos, no un stream en vivo.
5. **Sin multi-usuario**: Dos asesores usando la app en diferentes equipos no ven las tareas ni notas del otro.
6. **Fragilidad de parseo**: La detección de fase depende de texto libre en campos como `Estado SLA` (ej: `"más de 30 minutos"`), lo que se rompe si el texto cambia.

### Migración Recomendada: Conexión Directa a la Base de Datos de Autolab

La arquitectura objetivo debe reemplazar Google Sheets + JSONP por una conexión directa a la base de datos operacional de Autolab:

```
Base de datos Autolab (PostgreSQL / MySQL)
        │
        │ API REST o GraphQL (backend propio o Supabase/Hasura)
        │ — Autenticación JWT por usuario
        │ — Endpoints paginados por estado/fase
        │ — WebSocket o SSE para actualizaciones en tiempo real
        ▼
Torre Central (frontend)
        │
        ├── GET /appointments?status=active   → allVehicles[]
        ├── GET /appointments/:id             → detalle de vehículo
        ├── POST /tasks                       → crear tarea (persistida en BD)
        ├── PATCH /tasks/:id                  → actualizar tarea
        └── POST /notes                       → guardar nota
```

**Beneficios inmediatos:**
- Datos sin intermediario: la app refleja el estado real de Autolab sin depender de que alguien actualice una hoja.
- Tareas y notas persistidas en BD: visibles para todos los asesores en tiempo real.
- Autenticación real: cada usuario tiene su sesión y permisos.
- Eliminación del parseo frágil: los campos `_phase` y `_alert` podrían calcularse en el backend con lógica tipada y testeada, o incluso provenir directamente de la BD si Autolab ya tiene esos estados.
- Posibilidad de escritura: el asesor podría actualizar el estado del vehículo directamente desde Torre Central.

**Campos mínimos requeridos del endpoint `/appointments`** (equivalentes a los actuales del Sheet):

```json
{
  "appointment_id": "string",
  "vehicle_plates": "string",
  "modelo": "string",
  "name_shop": "string",
  "fleet": "string",
  "superadmin": "string",
  "service_type": "CORRECTIVO | HYP_SENCILLO | HYP_COMPLEJO | ESTACIONAMIENTO",
  "status": "string",
  "sla_status": "string",
  "phase_status": "string",
  "reception_time": "ISO8601",
  "sla_deadline": "ISO8601",
  "last_quote_at": "ISO8601",
  "first_job_start_at": "ISO8601",
  "business_days_since_reception": "number",
  "business_days_since_approval": "number",
  "sla_quote_pct": "number (0-1)",
  "sla_delivery_pct": "number (0-1)",
  "pending_price": "number",
  "upsale_count": "number",
  "is_light": "boolean"
}
```

---

## Módulos de la Aplicación

| Vista | Función principal | Datos usados |
|---|---|---|
| Torre (Radar) | SLA dashboard en tiempo real con tarjetas por fase | `filteredVehicles`, `_phase`, `_alert` |
| Cotizaciones | Pipeline de cotizaciones pendientes por asesor | `filteredVehicles` filtrado a fases `cotizacion` y `aprobacion` |
| Partes | Vehículos bloqueados esperando refacciones | `allVehicles` con `estado.includes('esperando')` |
| Asesores | Ranking de carga y alertas por asesor | `filteredVehicles` agrupados por `superadmin` |
| Tareas | Gestión de tareas operativas | `localStorage['torre_tasks']` |
| Métricas | KPIs: % lagging, ranking por taller/asesor/flota/fase | `filteredVehicles` |
| Recomendaciones | Motor de reglas que genera acciones prioritarias | `allVehicles` completo, sin filtros |
