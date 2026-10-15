# SPEC — Kanbit

> **Kanbit** (Kanban + bit): tablero ágil para equipos de proyectos de programación en el aula.
> Dominio: **kanbit.app** (frontend en `kanbit.app`, API en `api.kanbit.app`).

> Documento de especificación para iniciar el desarrollo con Claude Code.
> Leer completo antes de escribir código.
>
> **🎯 Objetivo inmediato: Kanbit v1.0 en producción para el lunes 19 de octubre de 2026**, con alumnos reales usándola en clase.
> El alcance de v1.0 está en la **sección 12.1** y manda sobre el resto del documento: todo lo que no esté en 12.1 se construye después (sección 12.2), aunque esté descrito en otras secciones.
> Trabajar etapa por etapa y no avanzar sin cumplir los criterios de aceptación de cada una.

---

## 1. Visión

Plataforma web **PWA** tipo Trello para que alumnos de secundaria técnica y bachillerato técnico administren los proyectos en equipo de clase aplicando una **metodología híbrida Scrum + Kanban + gestión de equipos** (sprint semanal, tablero por persona, tres reuniones de pie de 15 minutos).

La app no solo permite usar la metodología: **la guía**. El ritmo semanal, las reuniones, la validación del moderador y los bloqueos están integrados en el flujo.

El docente cuenta con un **panel de seguimiento** para monitorear a todos los equipos y evaluar la participación individual.

### 1.1 Alcance

- Solo texto. **No hay carga de imágenes ni archivos.**
- Tablero Kanban con filas por integrante.
- Sprint semanal lunes–viernes.
- Reuniones guiadas (Arranque, Seguimiento, Cierre) con temporizador proyectable.
- Bloqueos como entidad propia.
- Notas del equipo en Markdown.
- Comentarios en hilo.
- Panel docente con vista diaria, por sprint y por alumno, y exportación a Excel.
- Instalable como PWA en celular y computadora, con lectura sin conexión.

### 1.2 Fuera de alcance (v1)

- Carga de imágenes, adjuntos o avatares subidos (usar iniciales/colores).
- Chat en tiempo real entre alumnos.
- Integración con Google Classroom u otras plataformas.
- Multi-escuela (una sola instancia por docente/plantel).
- Notificaciones push (se evaluará después de v1).

---

## 2. Metodología que implementa la app

### 2.1 Principios

- Colaboración radical y eliminación constante de obstáculos (inspirado en los *All Blacks*).
- Sin jerarquías rígidas ni diagramas de Gantt.
- El tablero es el estándar visual para medir el avance del trabajo.

### 2.2 Equipo

- Tamaño recomendado por la metodología: 7 ± 2 (5 a 9).
- **Adaptación escolar:** el docente define el rango permitido por grupo (por defecto **3 a 9**).
- Roles:
  - **Moderador:** mantiene la metodología, dirige las reuniones, valida tarjetas y ayuda a eliminar bloqueos. También puede tener tareas propias.
  - **Desarrollador de proyectos:** ejecuta y mueve sus propias tarjetas.

### 2.3 Sprint

- Duración fija de **1 semana, lunes a viernes**.
- Los proyectos grandes se descomponen en entregables semanales medibles.

### 2.4 Tablero

Matriz **filas (integrante) × columnas (estado)**:

| Columna | Significado |
|---|---|
| Backlog | Tareas pendientes generales del equipo que no entran en la semana |
| Por hacer | Tareas planificadas y validadas para el sprint |
| En marcha | Tareas en ejecución |
| Terminado | Tareas finalizadas |

- El Backlog es del equipo y admite tarjetas **sin responsable** (fila "Sin asignar").
- Las columnas son **fijas** (no configurables).

### 2.5 Tarjeta

- **Proyecto** (el equipo puede tener uno o varios).
- **Tarea**: independiente, valiosa y medible.
- **Criterio de terminado**: una línea que dice cómo se sabe que está terminada (obligatorio al salir del Backlog; refuerza que la tarea sea medible).
- **Día estimado de entrega**: Lun, Mar, Mié, Jue o Vie.
- **Responsable**: un solo integrante (las tareas son individuales).

### 2.6 Las tres reuniones

Todas: de pie, frente al tablero, participación de todos, **máximo 15 minutos**.

| Día | Reunión | Qué ocurre |
|---|---|---|
| Lunes | **Arranque** | Cada integrante pasa tarjetas a *Por hacer* en su fila con día estimado. El moderador valida y prioriza. Se registra la meta de la semana. |
| Martes–Jueves | **Seguimiento** | Cada integrante responde: qué hice, qué estoy haciendo, qué haré mañana y qué me bloquea. El foco es desbloquear, no justificarse. |
| Viernes | **Cierre** | Se revisa el tablero (idealmente todo en *Terminado*), el ritmo logrado y se registran reflexiones y acuerdos. Se decide qué pasa con lo no terminado. |

### 2.7 Contexto escolar

- Los grupos tienen clase **diaria**, con **7 sesiones por semana** (dos días tienen doble sesión).
- **La reunión del día se hace solo en la primera sesión de ese día.** La segunda sesión es tiempo completo de trabajo.
- El docente captura el horario de cada grupo (sesiones por día) y la app usa esos datos para proponer la reunión correcta.

---

## 3. Roles y permisos

| Acción | Docente | Moderador | Integrante |
|---|:-:|:-:|:-:|
| Crear grupos, horario y código de acceso | ✅ | | |
| Crear/editar equipos y asignar moderador | ✅ | | |
| Ver todos los equipos del grupo (lectura) | ✅ | | |
| Comentar en cualquier tarjeta/minuta del grupo | ✅ | | |
| Crear proyectos del equipo | ✅ | ✅ | |
| Crear tarjetas en el Backlog | | ✅ | ✅ |
| Mover **sus propias** tarjetas | | ✅ | ✅ |
| Mover tarjetas de otros integrantes | | ✅ | |
| Validar tarjetas en *Por hacer* | | ✅ | |
| Abrir/conducir/cerrar reuniones | ✅ | ✅ | |
| Registrar su check-in | | ✅ | ✅ |
| Reportar bloqueo en su tarjeta | | ✅ | ✅ |
| Ofrecer ayuda y resolver bloqueos | | ✅ | ✅ |
| Cerrar el sprint | ✅ | ✅ | |
| Crear/editar notas del equipo | | ✅ | ✅ |
| Exportar a Excel | ✅ | | |

- Un alumno pertenece a **un solo equipo por grupo**.
- El docente puede cambiar al moderador en cualquier momento (se sugiere rotarlo por sprint).

---

## 4. Stack técnico

### 4.1 Frontend → Vercel

- React 18+ con **Vite** y **TypeScript** (strict).
- **Tailwind CSS**.
- **vite-plugin-pwa** (Workbox) para PWA.
- **@dnd-kit/core** + **@dnd-kit/sortable** para drag & drop (no usar react-beautiful-dnd).
- **TanStack Query** para datos del servidor y actualizaciones optimistas.
- **Zustand** para estado de UI (modo proyección, temporizador, filtros).
- **React Router**.
- **react-hook-form** + **zod** para formularios.
- **socket.io-client** (a partir de v1.3).
- Markdown: **react-markdown** + **remark-gfm** (con sanitización; no permitir HTML crudo).
- Fechas: **date-fns** + **date-fns-tz**.
- Offline: persistencia de TanStack Query en IndexedDB con **idb-keyval** (v1.0) y **Dexie.js** para la cola de check-ins (v1.2).
- IDs en cliente: **@paralleldrive/cuid2** (o `crypto.randomUUID()`).

### 4.2 Backend → Railway

- Node.js 20+ con **Express** y **TypeScript**.
- **Prisma** ORM.
- **Zod** para validar cuerpo, parámetros y query de cada endpoint.
- **Socket.IO** en el mismo servidor HTTP.
- Seguridad: **helmet**, **cors**, **express-rate-limit**, **bcrypt**, **jsonwebtoken**, **cookie-parser**.
- Logs: **pino** (o morgan en desarrollo).
- Exportación: **exceljs**.
- Pruebas: **Vitest** + **Supertest**.
- Documentación de API: **OpenAPI/Swagger** (`/api/docs`).

### 4.3 Base de datos → Railway

- **PostgreSQL**.

### 4.4 Estructura del repositorio (monorepo)

```
/
├── apps/
│   ├── web/                # React + Vite + PWA (Vercel)
│   └── api/                # Express + Prisma + Socket.IO (Railway)
├── packages/
│   └── shared/             # tipos TS y esquemas zod compartidos (enums, DTOs)
├── spec.md
├── CLAUDE.md               # convenciones para Claude Code (generar en fase 0)
├── package.json            # workspaces (pnpm o npm workspaces)
└── README.md
```

---

## 5. Requisitos PWA

### 5.1 Instalación

- `manifest.webmanifest` con: `name: "Kanbit"`, `short_name: "Kanbit"`, `description`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `orientation: "any"`, `theme_color`, `background_color`, `lang: "es-MX"`.
- Íconos: 192×192, 512×512 y 512×512 *maskable* (los íconos de la app son estáticos del proyecto; no son carga de imágenes por usuarios).
- `apple-touch-icon` y meta tags para iOS (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`).
- Botón "Instalar app" propio que use el evento `beforeinstallprompt` (Android/escritorio) y una guía breve para iOS ("Compartir → Agregar a inicio").

### 5.2 Service worker y caché

- Registro con `registerType: "prompt"`: cuando hay versión nueva, mostrar aviso "Hay una actualización — Recargar".
- **App shell** (HTML, JS, CSS, fuentes, íconos) precacheado: la app abre aunque no haya internet.
- El service worker **no** cachea respuestas de la API (evita datos duplicados o viejos); los datos sin conexión los maneja la estrategia offline de la sección 5.3.
- Nunca persistir respuestas de `/auth/*` ni la exportación a Excel.

### 5.3 Estrategia offline por niveles (decisión: **no** local-first completo)

Se descartó un local-first completo (sincronización bidireccional con resolución de conflictos) porque Kanbit es colaborativa y con reglas de negocio validadas en el servidor (permisos, validación del moderador, orden de tarjetas). Se implementa por niveles:

| Nivel | Qué hace | Cuándo |
|---|---|---|
| **1. Lectura offline** | Caché de TanStack Query persistida en **IndexedDB** (`@tanstack/query-sync-storage-persister` o `@tanstack/query-async-storage-persister` + `idb-keyval`). Sin conexión el alumno abre la app y ve el último estado de su tablero, sprint y check-ins. | **v1.0** |
| **2. Cola de check-ins** | Tabla *outbox* en **Dexie.js**: el check-in se guarda localmente si no hay conexión y se envía solo al reconectar (evento `online` + reintento al abrir la app). Sin conflictos: cada check-in pertenece a un solo alumno y la API lo trata como *upsert* idempotente. | v1.2 |
| **3. Local-first completo** | Mover tarjetas y editar todo sin conexión con sincronización. | Solo si el piloto demuestra que es necesario |

**Comportamiento sin conexión (v1.0):**
- Banner persistente "Sin conexión — mostrando la última versión guardada".
- Drag & drop y formularios de escritura deshabilitados, con mensaje claro.
- La caché persistida expira a los 7 días y se borra al cerrar sesión.
- Al reconectar: invalidar consultas de TanStack Query.

**Plan B en clase (v1.0):** si un alumno no tiene datos durante la reunión, el moderador puede capturar el check-in de ese integrante desde su dispositivo (queda registrado quién lo capturó).

### 5.3.1 Decisiones de diseño obligatorias desde v1.0 (preparan el nivel 2 y 3)

1. **IDs generados en el cliente:** el frontend genera el `id` (cuid2 o UUID v7) de tarjetas, check-ins, notas y comentarios y lo envía en el `POST`. El backend valida el formato y lo usa.
2. **Creación idempotente:** si llega un `POST` con un `id` que ya existe y pertenece al mismo autor, se responde `200` con el registro existente en vez de duplicar o fallar.
3. **`updatedAt` en todas las tablas** y devuelto en todas las respuestas; las ediciones (`PATCH`) aceptan `expectedUpdatedAt` opcional y responden `409` si no coincide (control optimista).

### 5.4 Calidad

- Lighthouse PWA: instalable, con service worker y manifest válidos.
- Diseño **mobile-first** en las pantallas de check-in, tarjeta y notas.
- Tablero usable en celular: en pantallas angostas, mostrar **una fila (integrante) a la vez** con pestañas por persona, o columnas con scroll horizontal por fila.

---

## 6. Modelo de datos (Prisma)

> Referencia. Ajustar nombres a convenciones de Prisma (`camelCase` en campos, `PascalCase` en modelos). Todas las tablas con `createdAt` y `updatedAt`.

```prisma
enum Role         { TEACHER STUDENT }
enum Weekday      { MON TUE WED THU FRI }
enum CardStatus   { BACKLOG TODO DOING DONE }
enum SprintStatus { OPEN CLOSED }
enum MeetingType  { KICKOFF FOLLOWUP CLOSING }   // Arranque, Seguimiento, Cierre

model User {
  id           String   @id @default(cuid())
  name         String
  username     String   @unique        // matrícula o usuario generado
  passwordHash String
  role         Role
}

model Group {
  id            String  @id @default(cuid())
  name          String                    // ej. "5°A Programación"
  accessCode    String  @unique           // código para que los alumnos se registren
  accessOpen    Boolean @default(true)    // el docente puede cerrar el registro
  teacherId     String
  minTeamSize   Int     @default(3)
  maxTeamSize   Int     @default(9)
  timezone      String  @default("America/Monterrey")
}

model GroupSchedule {                      // horario: sesiones por día
  groupId   String
  weekday   Weekday
  sessions  Int                            // 1 o 2
  @@id([groupId, weekday])
}

model GroupMember { groupId String; userId String; @@id([groupId, userId]) }

model Team {
  id      String @id @default(cuid())
  name    String
  groupId String
}

model TeamMember {
  teamId      String
  userId      String
  isModerator Boolean @default(false)
  rowOrder    Int                          // orden de la fila en el tablero
  @@id([teamId, userId])
}

model Project {
  id       String @id @default(cuid())
  teamId   String
  name     String
  archived Boolean @default(false)
}

model Sprint {
  id        String       @id @default(cuid())
  teamId    String
  number    Int                            // 1, 2, 3...
  startDate DateTime                       // lunes
  endDate   DateTime                       // viernes
  goal      String?
  status    SprintStatus @default(OPEN)
  @@unique([teamId, number])
}

model Card {
  id               String     @id @default(cuid())
  teamId           String
  projectId        String
  sprintId         String?                 // null = backlog
  assigneeId       String?                 // null = sin asignar (solo en BACKLOG)
  title            String                  // la tarea
  doneCriteria     String?                 // obligatorio fuera de BACKLOG
  dueWeekday       Weekday?                // obligatorio fuera de BACKLOG
  status           CardStatus @default(BACKLOG)
  position         String                  // fractional index dentro de (assignee, status)
  validated        Boolean    @default(false)
  validatedById    String?
  carriedOverCount Int        @default(0)  // veces que se arrastró a otro sprint
  completedAt      DateTime?
  createdById      String
}

model CardEvent {                          // historial para métricas y auditoría
  id         String      @id @default(cuid())
  cardId     String
  userId     String
  type       String                         // MOVED, ASSIGNED, VALIDATED, CARRIED_OVER, EDITED...
  fromStatus CardStatus?
  toStatus   CardStatus?
  createdAt  DateTime    @default(now())
}

model Blocker {
  id           String    @id @default(cuid())
  cardId       String
  reportedById String
  description  String
  helperId     String?                     // compañero que ofreció ayuda
  resolved     Boolean   @default(false)
  resolvedById String?
  resolvedAt   DateTime?
  resolution   String?
}

model Meeting {
  id                 String      @id @default(cuid())
  sprintId           String
  type               MeetingType
  date               DateTime                // fecha (día) de la reunión
  startedAt          DateTime?
  endedAt            DateTime?
  durationSeconds    Int?
  notesMd            String?
  agreements         String?                 // acuerdos
  facilitatorId      String?
  @@unique([sprintId, date])                 // una reunión por día por equipo
}

model MeetingCheckin {
  id             String  @id @default(cuid())
  meetingId      String
  userId         String
  turnOrder      Int?
  secondsSpoken  Int?
  did            String?                     // qué hice
  doing          String?                     // qué estoy haciendo
  willDo         String?                     // qué haré mañana
  blockers       String?                     // qué me bloquea
  present        Boolean @default(true)
  @@unique([meetingId, userId])
}

model Note {
  id         String @id @default(cuid())
  teamId     String
  section    String                         // Investigación, Requisitos, Decisiones, Recursos...
  title      String
  contentMd  String
  authorId   String
  lastEditorId String
  cardId     String?                        // enlace opcional a tarjeta
}

model Comment {
  id        String  @id @default(cuid())
  authorId  String
  body      String
  parentId  String?                         // hilo (1 nivel de respuesta)
  cardId    String?
  meetingId String?
  noteId    String?
  // exactamente uno de cardId/meetingId/noteId debe tener valor (validar en servicio)
}
```

### 6.1 Reglas de integridad

- Una tarjeta en `TODO`, `DOING` o `DONE` **debe** tener `assigneeId`, `dueWeekday`, `doneCriteria` y `sprintId`.
- Los `id` de registros creados por usuarios los genera el cliente (sección 5.3.1); el `@default(cuid())` del esquema queda solo como respaldo para registros creados por el servidor.
- `position` usa **ordenamiento fraccional** (librería `fractional-indexing`); mover una tarjeta actualiza solo esa fila.
- Solo puede haber **un sprint `OPEN` por equipo**.
- Cada equipo debe tener **exactamente un moderador** cuando haya integrantes.
- Al eliminar un usuario de un equipo: sus tarjetas no terminadas vuelven al Backlog sin responsable.
- Textos con límites: título de tarjeta 140 caracteres, criterio 200, comentario 2 000, nota 20 000.

---

## 7. Lógica de dominio

### 7.1 Zona horaria y "hoy"

- Toda la lógica de días (qué reunión toca, tarjetas vencidas) se calcula en el **servidor** con la zona horaria del grupo (`America/Monterrey`).
- Las fechas se guardan en UTC.

### 7.2 Ciclo del sprint

1. **Apertura:** al entrar al tablero un lunes (o el primer día con clase de la semana) sin sprint abierto, el moderador ve "Iniciar sprint de la semana". Se crea el sprint con `startDate` = lunes y `endDate` = viernes de esa semana.
2. **Planeación (Arranque):** los integrantes mueven tarjetas de Backlog a *Por hacer* en su fila. Al hacerlo, la app exige `dueWeekday` y `doneCriteria`. Las tarjetas quedan `validated = false` (se muestran con borde punteado) hasta que el moderador las valide.
3. **Ejecución:** las tarjetas validadas pueden pasar a *En marcha* y *Terminado*. Las tarjetas no validadas **no** pueden pasar a *En marcha*.
4. **Cierre:** el moderador (o el docente) cierra el sprint. Para cada tarjeta no terminada se elige: **regresar al Backlog** (se quita sprint, conserva responsable) o **arrastrar al siguiente sprint** (`carriedOverCount++`). Se ofrece una acción masiva "arrastrar todas".
5. Si llega el lunes siguiente con el sprint anterior abierto, mostrar aviso al moderador y al docente: "El sprint anterior no se cerró".

### 7.3 Estado visual de tarjetas

Calculado con el día actual del grupo:

| Condición | Estilo |
|---|---|
| No validada (en Por hacer) | Borde punteado + etiqueta "Por validar" |
| `dueWeekday` = hoy y no terminada | Amarillo — "Vence hoy" |
| `dueWeekday` < hoy y no terminada | Rojo — "Atrasada" |
| Bloqueo abierto | Ícono ⚠ + borde naranja |
| `carriedOverCount > 0` | Etiqueta "Arrastrada ×N" |

### 7.4 Reunión del día

- Con `GroupSchedule` y el día actual, la API devuelve la **reunión sugerida**:
  - Lunes → Arranque; martes a jueves → Seguimiento; viernes → Cierre.
  - Si el lunes no hay clase (día sin sesiones), el Arranque se mueve al primer día con clase de la semana; igual con el Cierre al último.
- **Solo una reunión por día por equipo** (restricción única `sprintId + date`). En días de doble sesión no se pide un segundo check-in.
- El docente puede crear una reunión fuera de lo sugerido si lo necesita.

### 7.5 Bloqueos

- Un integrante reporta un bloqueo en **su** tarjeta (descripción obligatoria).
- Cualquier compañero puede pulsar "Yo te ayudo" (`helperId`).
- El reportante, el ayudante o el moderador lo marcan como resuelto, con una línea de resolución opcional.
- Los bloqueos escritos en un check-in de Seguimiento ofrecen el botón "Convertir en bloqueo de tarjeta".

---

## 8. Pantallas

### 8.1 Autenticación y acceso

- **Inicio de sesión:** usuario + contraseña.
- **Registro de alumno:** código de grupo + nombre + matrícula/usuario + contraseña. Solo si el grupo tiene `accessOpen = true`.
- **Restablecer contraseña:** lo hace el docente desde su panel (genera contraseña temporal). No hay correo en v1.
- El docente se crea con un script de *seed* o variable de entorno inicial.

### 8.2 Alumno

1. **Mi equipo / Tablero** (pantalla principal)
   - Encabezado: equipo, sprint actual (número, fechas, meta), barra de avance del sprint y botón de la **reunión del día**.
   - Matriz de filas por integrante × 4 columnas, con fila "Sin asignar" para el Backlog.
   - Filtros: por proyecto, solo mis tarjetas, solo atrasadas, solo bloqueadas.
   - Clic en tarjeta → panel lateral (o pantalla completa en móvil) con detalle, historial, bloqueos y comentarios.
2. **Reunión del día** (ver 8.4).
3. **Notas** del equipo: lista por secciones, editor Markdown con vista previa, autor y última edición, enlace a tarjeta, comentarios.
4. **Historial de sprints**: sprints anteriores con su resumen y minutas.
5. **Mi perfil**: cambiar contraseña, instalar app.

### 8.3 Moderador (además de lo del alumno)

- Botón **Validar** en tarjetas de *Por hacer* (individual y "validar todas").
- Iniciar y cerrar sprint (asistente de cierre con decisiones por tarjeta).
- Conducir la reunión en **modo proyección**.
- Lista de **bloqueos abiertos** del equipo.

### 8.4 Reunión y modo proyección

**Vista normal (celular/computadora):**
- Arranque: meta de la semana + tablero en modo planeación + validación.
- Seguimiento: formulario de check-in de 4 campos por integrante (cada alumno llena el suyo desde su celular).
- Cierre: resumen automático del sprint + campos de reflexión (qué funcionó, qué mejorar) y acuerdos + paso al asistente de cierre.

**Modo proyección (pantalla completa para el proyector):**
- **Temporizador grande de 15:00** con cuenta regresiva: verde → amarillo a partir del minuto 10 → rojo a partir del minuto 14 → parpadeo y "Tiempo" al llegar a 0. Botones iniciar/pausar/reiniciar.
- **Turno de palabra:** muestra el integrante que habla, su mini-temporizador (por defecto 2 min, configurable), botón "Siguiente" y la lista de quién falta. El orden puede ser aleatorio o por orden de fila.
- En Seguimiento, el check-in de quien tiene el turno se muestra en grande en cuanto lo envía.
- Tablero del equipo debajo (o alternando), en tamaño legible a distancia.
- Selector rápido de equipo para el docente.
- Se registran `startedAt`, `endedAt`, `durationSeconds` y `secondsSpoken` por integrante.
- Usar **Wake Lock API** (si está disponible) para que la pantalla no se apague.
- Tipografía grande, alto contraste, sin elementos innecesarios.

### 8.5 Panel docente

1. **Grupos:** crear grupo, capturar horario (sesiones por día), definir rango de tamaño de equipo, ver o regenerar el código de acceso, abrir/cerrar registro.
2. **Equipos del grupo:** crear equipos, asignar alumnos (arrastrar), designar moderador, alumnos sin equipo.
3. **Vista "Hoy"** (pantalla de inicio del docente):
   - Por equipo: reunión del día hecha o pendiente, duración real, check-ins faltantes.
   - Alumnos sin check-in hoy.
   - Bloqueos nuevos de hoy y bloqueos abiertos más antiguos.
   - Tarjetas que vencen hoy y tarjetas atrasadas.
4. **Vista de sprint (por grupo):** cada equipo con su porcentaje de avance (tarjetas terminadas/planeadas), tarjetas arrastradas, bloqueos abiertos y si el sprint se cerró a tiempo.
5. **Vista de equipo:** acceso de solo lectura al tablero, reuniones, notas y comentarios del equipo; el docente puede comentar.
6. **Vista por alumno:**
   - Tarjetas terminadas por sprint.
   - % de cumplimiento del día estimado (terminadas en o antes de su día).
   - Check-ins registrados / reuniones de seguimiento del periodo.
   - Bloqueos reportados, bloqueos en los que ayudó, bloqueos resueltos.
   - Tarjetas arrastradas.
   - Comentarios y notas aportadas.
7. **Exportar a Excel** (por grupo y rango de fechas o sprints): una hoja por métrica (resumen por alumno, por equipo, reuniones, bloqueos).
8. **Gestión de alumnos:** restablecer contraseña, mover de equipo, dar de baja.

---

## 9. Métricas (definiciones)

| Métrica | Cálculo |
|---|---|
| Avance del sprint | tarjetas `DONE` del sprint / tarjetas del sprint |
| Cumplimiento del día estimado | tarjetas con `completedAt` ≤ fin de su `dueWeekday` / tarjetas terminadas |
| Lead time | `completedAt` − primer evento de paso a `TODO` |
| Tarjetas por persona por sprint | conteo de `DONE` por `assigneeId` |
| Participación en seguimiento | check-ins con contenido / reuniones de seguimiento del equipo |
| Disciplina de reunión | % de reuniones con `durationSeconds` ≤ 900 |
| Colaboración | bloqueos donde el alumno fue `helperId` o `resolvedById` (sin contar los propios) |
| Arrastre | suma de `carriedOverCount` |

---

## 10. API (REST, prefijo `/api/v1`)

> Todas las respuestas en JSON. Errores con formato `{ error: { code, message, details? } }`. Validación con zod. Autorización verificada en **cada** endpoint según la tabla de la sección 3.

**Auth**
- `POST /auth/register` (código de grupo) · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password`

**Grupos y equipos (docente)**
- `GET/POST /groups` · `GET/PATCH /groups/:id` · `PUT /groups/:id/schedule` · `POST /groups/:id/access-code/regenerate`
- `GET/POST /groups/:id/teams` · `PATCH/DELETE /teams/:id`
- `PUT /teams/:id/members` · `PATCH /teams/:id/moderator`
- `POST /users/:id/reset-password`

**Tablero**
- `GET /teams/:id/board` → equipo, integrantes (filas), sprint abierto, proyectos y tarjetas
- `GET/POST /teams/:id/projects` · `PATCH /projects/:id`
- `POST /teams/:id/cards` · `GET/PATCH/DELETE /cards/:id`
- `POST /cards/:id/move` → `{ status, assigneeId, position, dueWeekday?, doneCriteria? }`
- `POST /cards/:id/validate` · `POST /teams/:id/cards/validate-all`
- `GET /cards/:id/events`

**Sprints**
- `POST /teams/:id/sprints` (iniciar) · `GET /teams/:id/sprints` · `GET /sprints/:id`
- `GET /sprints/:id/summary` · `POST /sprints/:id/close` → `{ decisions: [{ cardId, action: "BACKLOG" | "CARRY" }] }`

**Bloqueos**
- `POST /cards/:id/blockers` · `GET /teams/:id/blockers?open=true`
- `POST /blockers/:id/help` · `POST /blockers/:id/resolve`

**Reuniones**
- `GET /teams/:id/meetings/today` → reunión sugerida (y existente si ya se creó)
- `POST /teams/:id/meetings` · `GET/PATCH /meetings/:id`
- `POST /meetings/:id/start` · `POST /meetings/:id/end`
- `PUT /meetings/:id/checkins/me` · `PATCH /meetings/:id/checkins/:userId` (turno/segundos, moderador)

**Notas y comentarios**
- `GET/POST /teams/:id/notes` · `GET/PATCH/DELETE /notes/:id`
- `GET/POST /comments?cardId|meetingId|noteId=` · `PATCH/DELETE /comments/:id`

**Panel docente**
- `GET /groups/:id/dashboard/today`
- `GET /groups/:id/dashboard/sprints?week=`
- `GET /groups/:id/students/:userId/stats?from=&to=`
- `GET /groups/:id/export.xlsx?from=&to=`

---

## 11. Tiempo real (Socket.IO)

> **v1.0 no usa Socket.IO.** El tablero y la reunión se actualizan con *polling* de TanStack Query: `refetchInterval` de 10 s en tablero y reunión activa, `refetchOnWindowFocus` y `refetchOnReconnect`. Socket.IO llega en v1.3.

- Autenticación del socket con la misma cookie de sesión.
- Salas: `team:<teamId>` (integrantes, docente) y `group:<groupId>` (docente).
- Eventos emitidos por el servidor **después** de confirmar el cambio en la base de datos:
  - `card:created`, `card:updated`, `card:moved`, `card:deleted`
  - `blocker:changed`, `sprint:changed`
  - `meeting:changed`, `meeting:checkin`, `meeting:turn` (turno de palabra para sincronizar el modo proyección con los celulares)
  - `comment:created`, `note:updated`
- El cliente aplica los eventos invalidando o actualizando la caché de TanStack Query.
- Ediciones simultáneas de una nota: **último en guardar gana**, con aviso "Otro integrante modificó esta nota" si el `updatedAt` cambió desde que se abrió (control optimista).

---

## 12. Plan de versiones

### 12.1 Kanbit v1.0 — MVP para usar en clase el lunes 19 de octubre de 2026

**Objetivo:** que los equipos que ya trabajan en proyectos lleven su sprint semanal en Kanbit: tablero por persona, validación del moderador, check-in diario y reunión proyectada con temporizador. Todo lo demás espera.

#### Alcance v1.0

| Módulo | Incluye en v1.0 | NO incluye en v1.0 |
|---|---|---|
| Auth | Login usuario/contraseña; registro de alumno con código de grupo; seed del docente; cambio de contraseña; el docente restablece contraseñas | Refresh token con rotación (usar un solo JWT de 7 días en cookie `HttpOnly`) |
| Docente – grupos | Crear grupo, ver/regenerar código, abrir/cerrar registro | Horario por día (`GroupSchedule`): en v1.0 la reunión sugerida se calcula solo por día de la semana (lun–vie) |
| Docente – equipos | Crear equipos, asignar alumnos, designar moderador | Arrastrar alumnos entre equipos, validación de tamaño |
| Proyectos | Crear proyectos del equipo (moderador/docente) | Archivar |
| Tablero | Filas por integrante + fila "Sin asignar"; 4 columnas fijas; crear/editar/eliminar tarjeta; drag & drop con `@dnd-kit` y ordenamiento fraccional; permisos de movimiento en la API; vista móvil (una fila por pestaña); filtro "solo mis tarjetas" | Historial visible de tarjeta, filtros por proyecto/atrasadas/bloqueadas |
| Tarjeta | Proyecto, tarea, criterio de terminado, día estimado, responsable; estados visuales: por validar, vence hoy, atrasada | Etiqueta "arrastrada ×N", ⚠ de bloqueo |
| Sprint | Iniciar sprint de la semana (con meta); reglas al salir del Backlog; validar individual y "validar todas"; no pasar a En marcha sin validar; cerrar sprint (todo lo no terminado regresa al Backlog conservando responsable) | Asistente de cierre por tarjeta, arrastre al siguiente sprint, aviso de sprint sin cerrar |
| Reuniones | Reunión del día sugerida (lun Arranque, mar–jue Seguimiento, vie Cierre), una por día por equipo; check-in de 4 campos desde el celular; el moderador puede capturar el check-in de otro; notas y acuerdos de la reunión | Turnos de palabra, `secondsSpoken`, reuniones fuera de lo sugerido |
| **Modo proyección** | Pantalla completa con **temporizador de 15:00** (verde → amarillo min 10 → rojo min 14 → "Tiempo"), iniciar/pausar/reiniciar; check-ins del equipo en grande (polling); tablero compacto del equipo; Wake Lock; registra `startedAt`, `endedAt`, `durationSeconds` | Turno de palabra con mini-temporizador, selector rápido de equipo |
| Panel docente | Lista de grupos → equipos; abrir el tablero y la reunión del día de cualquier equipo en **solo lectura**; indicador por equipo: reunión de hoy hecha/pendiente y cuántos check-ins faltan | Vistas "Hoy" completas, sprint, alumno, métricas, Excel |
| PWA | Manifest, íconos, instalable (botón + guía iOS), app shell offline, **nivel 1 offline** (sección 5.3), aviso de actualización | Nivel 2 (cola Dexie) |
| Tiempo real | Polling 10 s + refetch al enfocar/reconectar | Socket.IO |
| Bloqueos, notas, comentarios | — | Todo (v1.1) |
| Calidad | Pruebas unitarias de las reglas del sprint y permisos de movimiento; pruebas de API de auth y `move` | Cobertura amplia, Swagger completo |

#### Modelo de datos mínimo v1.0

`User`, `Group`, `GroupMember`, `Team`, `TeamMember`, `Project`, `Sprint`, `Card`, `CardEvent` (se registra desde v1.0 aunque no se muestre, para tener métricas después), `Meeting`, `MeetingCheckin` (agregar `capturedById String?`).
Las demás tablas (`GroupSchedule`, `Blocker`, `Note`, `Comment`) se agregan con migraciones en sus versiones.

#### Plan de días

| Día | Entregable | Criterio de "listo" |
|---|---|---|
| **Mié 14** | Fase 0: monorepo, Prisma + Postgres local y en Railway, `GET /api/v1/health`, deploy en Vercel (`kanbit.app`) y Railway (`api.kanbit.app`) con cookie de dominio funcionando, PWA mínima, `CLAUDE.md` | La app instalada en un celular muestra el health de producción |
| **Jue 15** | Auth completa + seed del docente + panel docente de grupos, equipos, moderador y proyectos | El docente crea un grupo; dos alumnos se registran con el código y quedan en un equipo |
| **Vie 16** | Tablero: filas por persona, CRUD de tarjetas, drag & drop, permisos, vista móvil | Dos alumnos mueven sus tarjetas; mover la de otro → 403 |
| **Sáb 17** | Sprint: iniciar, reglas de salida del Backlog, validación, estados visuales, cierre simple | Ciclo lun–vie simulado con `clock` inyectable pasa las pruebas |
| **Dom 18** | Reuniones + check-in + modo proyección + indicadores del docente + lectura offline + prueba completa en celulares | Checklist de aceptación v1.0 completo |
| **Lun 19** | 🚀 Uso en clase | — |

Si el calendario se aprieta, se recorta en este orden (de lo primero que se sacrifica a lo último): indicadores del docente → lectura offline → estados visuales "vence hoy/atrasada" → notas/acuerdos de la reunión. **No se recorta:** tablero, validación del moderador, check-in y temporizador proyectable.

#### Checklist de aceptación v1.0

- [ ] El docente crea grupo, equipos, moderadores y proyectos desde la app en producción.
- [ ] Un alumno se registra con el código de grupo desde su celular e instala la PWA.
- [ ] Cada alumno ve su fila y solo puede mover sus tarjetas; el moderador puede mover todas.
- [ ] Una tarjeta no sale del Backlog sin responsable, día estimado y criterio de terminado.
- [ ] Una tarjeta no validada no puede pasar a En marcha.
- [ ] El moderador inicia y cierra el sprint; al cerrar, lo no terminado vuelve al Backlog.
- [ ] El lunes la app propone Arranque, de martes a jueves Seguimiento y el viernes Cierre.
- [ ] Cada alumno envía su check-in desde el celular y aparece en el modo proyección en ≤ 15 s.
- [ ] El temporizador de 15 min cambia de color y la duración queda guardada.
- [ ] El docente abre el tablero de cualquier equipo en solo lectura y ve qué equipos ya hicieron su reunión.
- [ ] Sin internet, la PWA abre y muestra el último tablero con el banner de "Sin conexión".
- [ ] Probado en Chrome Android, Safari iOS (PWA instalada) y Chrome de escritorio con proyector.

### 12.2 Hoja de ruta posterior

Cada versión se libera cuando cumple su aceptación, sin interrumpir el uso en clase (migraciones compatibles hacia atrás).

| Versión | Contenido | Aceptación |
|---|---|---|
| **v1.1** — Colaboración | Bloqueos como entidad (reportar, "yo te ayudo", resolver, convertir desde check-in); ⚠ en tarjeta; comentarios en hilo en tarjetas y reuniones; notas del equipo en Markdown por secciones | Un bloqueo reportado en un check-in se convierte en bloqueo de tarjeta y otro integrante lo resuelve |
| **v1.2** — Sprint completo + offline nivel 2 | Asistente de cierre por tarjeta (Backlog / arrastrar), `carriedOverCount` y etiqueta, aviso de sprint sin cerrar, historial visible de tarjeta, filtros; **cola de check-ins con Dexie.js** | Un check-in hecho en modo avión se envía solo al reconectar y no se duplica |
| **v1.3** — Tiempo real y reunión avanzada | Socket.IO (sección 11) reemplaza el polling; turnos de palabra con mini-temporizador y `secondsSpoken`; selector rápido de equipo; `GroupSchedule` (horario por día y regla de primera sesión) | Dos navegadores ven un movimiento de tarjeta en < 1 s; los turnos se sincronizan proyector ↔ celulares |
| **v1.4** — Panel docente completo | Vistas "Hoy", sprint por grupo, equipo y alumno (sección 8.5); métricas (sección 9); exportación a Excel; gestión de alumnos (mover, dar de baja) | Las métricas coinciden con un conjunto de datos de prueba calculado a mano |
| **v1.5** — Pulido | Refresh token con rotación, rate limits finos, Swagger completo, accesibilidad AA, pruebas E2E (Playwright), notas enlazadas a tarjetas, validación de tamaño de equipo | Lighthouse ≥ 90 en PWA y accesibilidad |
| Futuro (evaluar con el piloto) | Notificaciones push, local-first nivel 3, multi-escuela | — |

## 13. Despliegue y configuración

### 13.1 Dominios y cookies (importante para PWA)

Frontend (Vercel) y API (Railway) en dominios distintos rompen las cookies de sesión en Safari/iOS y en PWAs instaladas (cookies de terceros bloqueadas). Por ello:

- **Dominio del proyecto: `kanbit.app`** (comprado en Vercel; DNS administrado en Vercel).
  - `kanbit.app` (y `www.kanbit.app` → redirección a `kanbit.app`) → frontend en Vercel.
  - `api.kanbit.app` → API en Railway: agregar el dominio personalizado en Railway y crear en el DNS de Vercel el registro `CNAME api` apuntando al destino que indique Railway.
- Cookie de sesión con `Domain=.kanbit.app`, `HttpOnly`, `Secure`, `SameSite=Lax`.
- `.app` exige HTTPS (HSTS precargado): no hay acceso por HTTP ni en subdominios; Vercel y Railway emiten los certificados automáticamente.
- Socket.IO se conecta directo a `api.kanbit.app` (los rewrites de Vercel no soportan WebSockets).
- CORS: permitir solo el origen del frontend, con `credentials: true`.
- En desarrollo: proxy de Vite (`/api` y `/socket.io` → `localhost:3000`).

### 13.2 Sesión

- JWT de acceso de corta duración (15 min) + token de refresco (7–30 días) en cookies `HttpOnly`, con rotación del refresco.
- Rate limit en `/auth/*` (por ejemplo, 10 intentos / 15 min por IP + usuario).

### 13.3 Variables de entorno

**apps/api**
```
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
COOKIE_DOMAIN=.kanbit.app
CORS_ORIGIN=https://kanbit.app
PORT=3000
NODE_ENV=production
SEED_TEACHER_USERNAME=
SEED_TEACHER_PASSWORD=
```

**apps/web**
```
VITE_API_URL=https://api.kanbit.app/api/v1
VITE_SOCKET_URL=https://api.kanbit.app
```

### 13.4 Railway

- Servicio API con *build* del workspace `apps/api`, comando de arranque que ejecute `prisma migrate deploy` antes de iniciar el servidor.
- PostgreSQL de Railway con respaldos activados.
- Health check en `/api/v1/health`.

### 13.5 Vercel

- Proyecto con raíz `apps/web`, *framework preset* Vite.
- Rewrite de SPA: todas las rutas → `/index.html`.
- Encabezados: `Cache-Control: no-cache` para `sw.js` y `manifest.webmanifest`.

---

## 14. Convenciones para Claude Code

- Idioma: **interfaz en español (es-MX)**; código, nombres de variables, tablas y commits en **inglés**.
- TypeScript estricto; prohibido `any` salvo justificación en comentario.
- Tipos y esquemas zod compartidos en `packages/shared` (enums, DTOs de request/response).
- Backend por módulos: `routes → controllers → services → prisma`. La lógica de negocio y las reglas de la sección 7 viven en `services`, con pruebas unitarias.
- Toda la lógica de fechas pasa por un módulo `clock` con fecha inyectable (para probar lunes–viernes).
- Autorización centralizada en middlewares/funciones reutilizables (`requireTeacher`, `requireTeamMember`, `requireModerator`, `canMoveCard`).
- Frontend por features: `src/features/{auth,board,sprint,meetings,blockers,notes,comments,teacher}`.
- Componentes accesibles: navegación por teclado en el tablero (dnd-kit tiene soporte de teclado), contraste AA, etiquetas en formularios.
- No introducir carga de archivos/imágenes en ninguna parte.
- Cada etapa/versión termina con: pruebas pasando, `README.md` actualizado y migración de Prisma versionada.
- Antes de implementar cada etapa, proponer el plan de archivos y esperar confirmación.
- En v1.0 priorizar que funcione en producción sobre la perfección: código limpio y tipado, pero sin abstracciones para funciones que todavía no están en 12.1.
- Al terminar cada etapa del plan de días, hacer deploy a producción (no acumular).

---

## 15. Pendientes por decidir

- Paleta de colores e ícono de Kanbit.
- Duración por defecto del turno de palabra (propuesta: 2 min) — v1.3.
- Si el docente debe aprobar el cierre de sprint o basta con el moderador.
- Secciones de notas predeterminadas (propuesta: Investigación, Requisitos, Decisiones, Recursos).
