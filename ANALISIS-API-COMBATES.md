# Análisis de API — Torneos, Combates y Estadísticas

## 1. Propósito

Este documento describe el estado actual y las necesidades futuras de la **Argentinian Buhurt API** en lo relativo a torneos, combates y estadísticas, para que otra inteligencia artificial pueda diseñar y construir una aplicación frontend (app de marshall) que:

- Acceda a un torneo mediante un código OTP.
- Consulte los combates del torneo con los equipos enfrentados, sus colores y peleadores inscriptos.
- Registre resultados **round por round** (ganador, puntos, estado individual de peleadores).
- Cierre combates con ganador final y actualice automáticamente las estadísticas de equipos y peleadores.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Lenguaje | JavaScript (Node.js, CommonJS) | — |
| Framework HTTP | Express.js | `^4.19.2` |
| Base de datos | SQLite3 (driver nativo, sin ORM) | `^5.1.7` |
| IDs | UUID v4 | `^10.0.0` |
| Puerto | 3001 (configurable por `.env`) | — |
| Autenticación | **No implementada** | — |
| Convención de rutas | `/api/v1/...` | — |

**Importante**: No se usa ORM. Todas las consultas son SQL crudo pasado a través de `db.run()`, `db.get()`, `db.all()` y `db.transaction()` (wrapper asíncrono sobre sqlite3 definido en `src/database/connection.js`).

---

## 3. Base de Datos — Tablas Relevantes

Las foreign keys están habilitadas (`PRAGMA foreign_keys = ON`). Las tablas de entidades principales usan `TEXT` como PK (UUID v4). Las tablas de lookup usan `INTEGER AUTOINCREMENT`.

### 3.1 Tablas de Lookup (catálogos)

#### colores
| Columna | Tipo | Descripción |
|---|---|---|
| `id_color` | INTEGER PK | ID del color |
| `nombre` | TEXT | Nombre (Negro, Blanco, Rojo, Azul, Verde, Amarillo, Naranja, Rosa, Violeta, Marrón, Gris, Celeste) |
| `hex` | TEXT | Código hexadecimal (#000000, etc.) |

#### genero
| Columna | Tipo |
|---|---|
| `id_genero` | INTEGER PK |
| `nombre` | TEXT (Masculino, Femenino) |

#### modalidad
| Columna | Tipo |
|---|---|
| `id_modalidad` | INTEGER PK |
| `nombre` | TEXT (Buhurt, Duelo, Profight) |

#### categoria
PK compuesta: `(id_categoria, id_modalidad)`

| Columna | Tipo |
|---|---|
| `id_categoria` | INTEGER |
| `id_modalidad` | INTEGER FK → `modalidad` |
| `nombre` | TEXT (5 vs 5, 3 vs 3, Heraldico, 80kg, etc.) |

#### tipo_torneo
| Columna | Tipo |
|---|---|
| `id_tipo_torneo` | INTEGER PK |
| `nombre` | TEXT (Grupos y eliminatorias, Eliminatorias, Liga) |
| `con_grupos` | INTEGER (0/1) |
| `con_eliminatorias` | INTEGER (0/1) |

#### reglamento
| Columna | Tipo |
|---|---|
| `id_reglamento` | INTEGER PK |
| `nombre` | TEXT |
| `link` | TEXT |

---

### 3.2 Entidades Principales

#### torneo
| Columna | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id_torneo` | TEXT PK | Sí | UUID v4 |
| `nombre` | TEXT | Sí | |
| `localizacion` | TEXT | Sí | |
| `fecha_torneo` | TEXT | Sí | Formato ISO string |
| `fecha_cierre_inscripcion` | TEXT | Sí | Formato ISO string |
| `id_organizador` | TEXT | No | FK → `usuario` |
| `id_reglamento` | INTEGER | Sí (default 1) | FK → `reglamento` |
| `id_genero` | INTEGER | Sí (default 1) | FK → `genero` |
| `id_categoria` | INTEGER | Sí (default 1) | Parte de FK compuesta → `categoria` |
| `id_modalidad` | INTEGER | Sí (default 1) | FK → `modalidad`, parte de FK compuesta |
| `id_tipo_torneo` | INTEGER | No | FK → `tipo_torneo` |
| `imagen` | TEXT | No | URL o path de imagen |
| `password` | TEXT | No | **Código OTP de acceso para marshalls** |

#### equipo
| Columna | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id_equipo` | TEXT PK | Sí | UUID v4 |
| `nombre` | TEXT | Sí | |
| `logo` | TEXT | No | URL o path |
| `fecha_creacion` | TEXT | No | |
| `id_color1` | INTEGER | Sí (default 1) | FK → `colores` |
| `id_color2` | INTEGER | Sí (default 2) | FK → `colores` |
| `id_color3` | INTEGER | Sí (default 3) | FK → `colores` |
| `id_categoria` | INTEGER | Sí (default 1) | FK compuesta → `categoria` |
| `id_modalidad` | INTEGER | Sí (default 1) | FK → `modalidad` |
| `id_genero` | INTEGER | Sí (default 1) | FK → `genero` |

#### usuario
| Columna | Tipo |
|---|---|
| `id_usuario` | TEXT PK (UUID) |
| `username` | TEXT UNIQUE |
| `nombre` | TEXT |
| `apellido` | TEXT |
| `id_tipo_usuario` | INTEGER FK (Administrador=1, Organizador=2, Club=3, Luchador=4, Marshall=5) |

#### luchador
Extensión 1:1 de `usuario` para perfiles de peleador.

| Columna | Tipo |
|---|---|
| `id_usuario` | TEXT PK, FK → `usuario` |
| `fecha_nacimiento` | TEXT |
| `nombre_contacto_emergencia` | TEXT |
| `telefono_contacto_emergencia` | TEXT |
| `domicilio` | TEXT |

---

### 3.3 Tablas de Asociación

#### torneo_equipo — Equipos inscriptos en un torneo (con estadísticas agregadas)
PK: `(id_equipo, id_torneo)`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id_equipo` | TEXT | — | FK → `equipo` |
| `id_torneo` | TEXT | — | FK → `torneo` |
| `posicion` | INTEGER | null | Posición final en el torneo |
| `cantidad_combates` | INTEGER | 0 | Combates disputados |
| `cantidad_victorias` | INTEGER | 0 | Combates ganados |
| `cantidad_derrotas` | INTEGER | 0 | Combates perdidos |
| `cantidad_rounds_ganados` | INTEGER | 0 | Rounds ganados |
| `cantidad_rounds_perdidos` | INTEGER | 0 | Rounds perdidos |

#### torneo_equipo_peleador — Peleadores inscriptos por equipo en un torneo
PK: `(id_torneo, id_equipo, id_usuario)`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id_torneo` | TEXT | — | FK → `torneo` |
| `id_equipo` | TEXT | — | FK → `equipo` |
| `id_usuario` | TEXT | — | FK → `usuario` |
| `numero_peleador` | INTEGER | — | Número asignado (1, 2, 3...) |
| `cantidad_amarillas` | INTEGER | 0 | Total de amarillas acumuladas en el torneo |
| `descalificado` | INTEGER | 0 | 0 = no, 1 = sí |

#### torneo_luchador — Estadísticas individuales del peleador en el torneo
PK: `(id_torneo, id_usuario)`

| Columna | Tipo | Default |
|---|---|---|
| `id_torneo` | TEXT | — |
| `id_usuario` | TEXT | — |
| `cantidad_combates` | INTEGER | 0 |
| `cantidad_puntos` | INTEGER | null |
| `cantidad_victorias` | INTEGER | 0 |
| `cantidad_derrotas` | INTEGER | 0 |
| `cantidad_rounds_ganados` | INTEGER | 0 |
| `cantidad_rounds_perdidos` | INTEGER | 0 |
| `cantidad_rounds_en_pie` | INTEGER | null |

#### equipos_por_grupo — Asignación de equipos a grupos (fase de grupos)
PK: `(id_torneo, id_equipo)`

| Columna | Tipo |
|---|---|
| `id_torneo` | TEXT |
| `id_equipo` | TEXT |
| `grupo` | INTEGER |

#### organizacion_torneo — Organización del torneo (1:1 con torneo)
PK: `id_torneo`

| Columna | Tipo |
|---|---|
| `id_torneo` | TEXT FK → `torneo` |
| `id_tipo_torneo` | INTEGER FK → `tipo_torneo` |
| `cantidad_grupos` | INTEGER (null) |

---

### 3.4 Tablas de Combate

#### combate — Enfrentamiento entre dos equipos
PK: `(id_torneo, id_combate)`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id_torneo` | TEXT | — | FK → `torneo` |
| `id_combate` | TEXT | — | UUID v4 |
| `orden` | INTEGER | — | Orden del combate dentro del torneo |
| `link` | TEXT | null | Link a video/streaming |
| `id_equipo_a` | TEXT | — | FK → `equipo` |
| `id_equipo_b` | TEXT | — | FK → `equipo` |
| `id_equipo_ganador` | TEXT | null | FK → `equipo`. null = combate no finalizado |
| `cantidad_round_ganados_ganador` | INTEGER | 0 | Rounds ganados por el ganador |
| `cantidad_round_ganados_perdedor` | INTEGER | 0 | Rounds ganados por el perdedor |

#### round_combate — Resultado de cada round
PK: `(id_torneo, id_combate, orden, round)`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id_torneo` | TEXT | — | FK compuesta → `combate` |
| `id_combate` | TEXT | — | FK compuesta → `combate` |
| `orden` | INTEGER | — | FK compuesta → `combate` |
| `round` | INTEGER | — | Número de round (1, 2, 3...) |
| `id_equipo_ganador` | TEXT | — | FK → `equipo`. Equipo que ganó este round |
| `puntos_ganador` | INTEGER | 0 | Puntos del equipo ganador en este round |
| `puntos_perdedor` | INTEGER | 0 | Puntos del equipo perdedor en este round |

#### round_peleador — Estado de cada peleador en un round
PK: `(id_torneo, id_combate, orden, round, id_usuario)`

FK compuesta: `(id_torneo, id_combate, orden, round)` → `round_combate`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id_torneo` | TEXT | — | |
| `id_combate` | TEXT | — | |
| `orden` | INTEGER | — | |
| `round` | INTEGER | — | |
| `id_usuario` | TEXT | — | FK → `usuario` |
| `en_pie` | INTEGER | 1 | 1 = en pie, 0 = caído |
| `amonestado` | INTEGER | 0 | 0 = no, 1 = sí (amarilla) |
| `expulsado` | INTEGER | 0 | 0 = no, 1 = sí (roja) |

---

### 3.5 Diagrama de Relaciones (Torneo → Combates)

```
torneo
 ├── organizacion_torneo (1:1) → tipo_torneo
 ├── equipos_por_grupo (1:N) → equipo
 ├── torneo_equipo (1:N) → equipo (con stats)
 ├── torneo_equipo_peleador (1:N) → equipo, usuario (inscripciones)
 ├── torneo_luchador (1:N) → usuario (stats individuales)
 └── combate (1:N)
      ├── id_equipo_a → equipo
      ├── id_equipo_b → equipo
      ├── id_equipo_ganador → equipo
      └── round_combate (1:N)
           └── round_peleador (1:N) → usuario
```

---

## 4. Endpoints Existentes Relevantes

Base URL: `http://localhost:3001/api`

### GET `/v1/torneo/:idTorneo/equipos`
Obtiene los equipos inscriptos en un torneo.

**Response 200:**
```json
[
  {
    "id": "uuid-equipo",
    "nombre": "Mercenarios",
    "logo": "/Mercenarios.svg",
    "fechaCreacion": "2023-01-01",
    "posicion": null
  }
]
```

*La respuesta actual **no incluye** colores ni peleadores. Se necesita un nuevo endpoint para eso.*

### GET `/v1/teams/:idTeam`
Obtiene el detalle de un equipo (sin peleadores).

**Response 200:**
```json
{
  "id": "uuid-equipo",
  "nombre": "Mercenarios",
  "etiqueta": "5 vs 5",
  "esMasculino": true,
  "logo": "/Mercenarios.svg",
  "clubId": "uuid-club",
  "club": "Club Acero",
  "info": "Info del club",
  "color1": 1,
  "color2": 2,
  "color3": 3,
  "redesSociales": [...]
}
```

*Para obtener los nombres y hex de los colores, la app frontend puede usar el endpoint de lookup o bien el nuevo endpoint de equipo+peleadores puede incluirlos expandidos.*

### GET `/v1/tournaments`
Lista todos los torneos con modalidad, género, categoría, equipos inscriptos y estado.

**Response 200:**
```json
[
  {
    "id": "uuid-torneo",
    "nombre": "Torneo Nacional 2026",
    "fechaTorneo": "2026-12-01",
    "fechaCierreInscripcion": "2026-11-15",
    "localizacion": "Buenos Aires",
    "imagen": null,
    "modalidad": "Buhurt",
    "sexo": "Masculino",
    "categoria": "5 vs 5",
    "equiposInscritos": 8,
    "estado": "Inscripciones abiertas"
  }
]
```

### GET `/v1/tournaments/:tournamentId/info`
Obtiene información detallada de un torneo con clubes invitados.

**Response 200:**
```json
{
  "nombre": "Torneo Nacional 2026",
  "fechaTorneo": "2026-12-01",
  "fechaCierreInscripcion": "2026-11-15",
  "localizacion": "Buenos Aires",
  "modalidad": "Buhurt",
  "sexo": "Masculino",
  "categoria": "5 vs 5",
  "clubesInvitados": [
    { "id": "uuid-club", "nombre": "Club Acero" }
  ]
}
```

### GET `/v1/organizers/:organizerId/tournaments`
Verifica si existe un torneo para un ID dado.

**Response 200:** `true` o `false`

### GET `/v1/combat-types/:idModalidad`
Obtiene las categorías disponibles para una modalidad.

**Response 200:**
```json
[
  { "value": 1, "label": "5 vs 5" },
  { "value": 2, "label": "3 vs 3" }
]
```

---

## 5. Endpoints NUEVOS a Crear

---

### 5.1 Acceso al Torneo por OTP

#### `POST /api/v1/torneo/acceso`

Permite a un marshall acceder a un torneo ingresando el código OTP que el organizador le proporcionó. El código OTP se almacena en la columna `torneo.password`.

**Request Body:**
```json
{
  "codigo": "ABC123"
}
```

**Response 200 — Acceso válido:**
```json
{
  "accesoValido": true,
  "torneo": {
    "id": "uuid-torneo",
    "nombre": "Torneo Nacional 2026",
    "localizacion": "Buenos Aires",
    "fechaTorneo": "2026-12-01",
    "modalidad": "Buhurt",
    "categoria": "5 vs 5",
    "genero": "Masculino",
    "idTipoTorneo": 1
  }
}
```

**Response 200 — Acceso inválido:**
```json
{
  "accesoValido": false,
  "mensaje": "Código de acceso inválido"
}
```

**Response 400 — Falta el código:**
```json
{
  "error": "El campo 'codigo' es requerido"
}
```

**Lógica SQL:**
```sql
SELECT id_torneo, nombre, localizacion, fecha_torneo, id_modalidad, id_categoria, id_genero, id_tipo_torneo
FROM torneo
WHERE password = ?
```

---

### 5.2 Combates del Torneo

#### `GET /api/v1/torneo/:idTorneo/combates`

Obtiene todos los combates de un torneo, con la información de los equipos enfrentados: nombres, colores (con hex) y peleadores inscriptos.

**Parámetros de ruta:**
- `idTorneo` (TEXT) — UUID del torneo

**Response 200:**
```json
{
  "idTorneo": "uuid-torneo",
  "nombre": "Torneo Nacional 2026",
  "modalidad": "Buhurt",
  "categoria": "5 vs 5",
  "genero": "Masculino",
  "combates": [
    {
      "id": "uuid-combate",
      "orden": 1,
      "link": null,
      "finalizado": false,
      "equipoA": {
        "id": "uuid-equipo-a",
        "nombre": "Mercenarios",
        "logo": "/Mercenarios.svg",
        "colores": [
          { "id": 1, "nombre": "Negro", "hex": "#000000" },
          { "id": 2, "nombre": "Blanco", "hex": "#ffffff" },
          { "id": 7, "nombre": "Naranja", "hex": "#ff6a00" }
        ],
        "peleadores": [
          {
            "idUsuario": "uuid-peleador",
            "nombre": "Juan",
            "apellido": "Pérez",
            "numeroPeleador": 1,
            "cantidadAmarillas": 0,
            "descalificado": false
          }
        ]
      },
      "equipoB": {
        "id": "uuid-equipo-b",
        "nombre": "Guardianes",
        "logo": "/Guardianes.svg",
        "colores": [
          { "id": 1, "nombre": "Negro", "hex": "#000000" },
          { "id": 3, "nombre": "Rojo", "hex": "#e00e00" },
          { "id": 2, "nombre": "Blanco", "hex": "#ffffff" }
        ],
        "peleadores": [
          {
            "idUsuario": "uuid-peleador-2",
            "nombre": "Carlos",
            "apellido": "Gómez",
            "numeroPeleador": 1,
            "cantidadAmarillas": 1,
            "descalificado": false
          }
        ]
      },
      "resultado": null
    },
    {
      "id": "uuid-combate-2",
      "orden": 2,
      "finalizado": true,
      "equipoA": { "..." : "..." },
      "equipoB": { "..." : "..." },
      "resultado": {
        "idEquipoGanador": "uuid-equipo-a",
        "nombreGanador": "Mercenarios",
        "roundsGanadosGanador": 2,
        "roundsGanadosPerdedor": 1,
        "rounds": [
          {
            "round": 1,
            "idEquipoGanador": "uuid-equipo-b",
            "puntosGanador": 5,
            "puntosPerdedor": 3,
            "peleadores": [
              {
                "idUsuario": "uuid-peleador",
                "enPie": true,
                "amonestado": false,
                "expulsado": false
              }
            ]
          },
          {
            "round": 2,
            "idEquipoGanador": "uuid-equipo-a",
            "puntosGanador": 7,
            "puntosPerdedor": 2,
            "peleadores": [ "..." ]
          },
          {
            "round": 3,
            "idEquipoGanador": "uuid-equipo-a",
            "puntosGanador": 4,
            "puntosPerdedor": 4,
            "peleadores": [ "..." ]
          }
        ]
      }
    }
  ]
}
```

**Lógica SQL — Paso 1: obtener combates del torneo:**
```sql
SELECT c.id_combate, c.orden, c.link,
       c.id_equipo_a, c.id_equipo_b,
       c.id_equipo_ganador,
       c.cantidad_round_ganados_ganador, c.cantidad_round_ganados_perdedor
FROM combate c
WHERE c.id_torneo = ?
ORDER BY c.orden ASC
```

**Lógica SQL — Paso 2: para cada equipo, obtener colores y peleadores:**

*Colores del equipo:*
```sql
SELECT co.id_color, co.nombre, co.hex
FROM equipo e
JOIN colores co ON co.id_color IN (e.id_color1, e.id_color2, e.id_color3)
WHERE e.id_equipo = ?
```

*Peleadores inscriptos para este equipo en este torneo:*
```sql
SELECT u.id_usuario, u.nombre, u.apellido,
       tep.numero_peleador, tep.cantidad_amarillas, tep.descalificado
FROM torneo_equipo_peleador tep
JOIN usuario u ON tep.id_usuario = u.id_usuario
WHERE tep.id_torneo = ? AND tep.id_equipo = ?
ORDER BY tep.numero_peleador ASC
```

**Lógica SQL — Paso 3: para combates finalizados, obtener rounds:**
```sql
SELECT rc.round, rc.id_equipo_ganador, rc.puntos_ganador, rc.puntos_perdedor
FROM round_combate rc
WHERE rc.id_torneo = ? AND rc.id_combate = ?
ORDER BY rc.round ASC
```

**Lógica SQL — Paso 4: para cada round, obtener estado de peleadores:**
```sql
SELECT rp.id_usuario, rp.en_pie, rp.amonestado, rp.expulsado
FROM round_peleador rp
WHERE rp.id_torneo = ? AND rp.id_combate = ? AND rp.round = ?
```

**Response 404 — Torneo no encontrado:**
```json
{
  "error": "Torneo no encontrado"
}
```

---

### 5.3 Crear Combate

#### `POST /api/v1/torneo/:idTorneo/combate`

Crea un nuevo combate entre dos equipos en un torneo, registrando a todos los peleadores inscriptos de ambos equipos en la tabla `round_peleador` para el round 1 (estado inicial: todos en pie). Esto permite que al iniciar un round, la app ya tenga la grilla de peleadores cargada.

**Parámetros de ruta:**
- `idTorneo` (TEXT) — UUID del torneo

**Request Body:**
```json
{
  "idEquipoA": "uuid-equipo-a",
  "idEquipoB": "uuid-equipo-b",
  "orden": 1,
  "link": null
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idEquipoA` | TEXT | Sí | UUID del equipo A |
| `idEquipoB` | TEXT | Sí | UUID del equipo B |
| `orden` | INTEGER | Sí | Orden del combate en el torneo (1, 2, 3...) |
| `link` | TEXT | No | Link a transmisión/video |

**Response 201:**
```json
{
  "idCombate": "uuid-combate",
  "mensaje": "Combate creado exitosamente"
}
```

**Response 400 — Faltan campos:**
```json
{
  "error": "idEquipoA, idEquipoB y orden son requeridos"
}
```

**Response 400 — Mismo equipo:**
```json
{
  "error": "idEquipoA e idEquipoB deben ser diferentes"
}
```

**Response 404 — Torneo no encontrado:**
```json
{
  "error": "Torneo no encontrado"
}
```

**Lógica de negocio:**
1. Verificar que el torneo existe.
2. Verificar que `idEquipoA !== idEquipoB`.
3. Verificar que ambos equipos están inscriptos en el torneo (`torneo_equipo`).
4. Generar UUID para el combate.
5. En una transacción:
   a. Insertar en `combate` con `id_equipo_ganador = NULL`.
   b. Para cada peleador inscripto de ambos equipos (`torneo_equipo_peleador`), insertar una fila en `round_peleador` con `round = 1`, `en_pie = 1`, `amonestado = 0`, `expulsado = 0`.

**SQL de inserción del combate:**
```sql
INSERT INTO combate (id_torneo, id_combate, link, orden, id_equipo_a, id_equipo_b)
VALUES (?, ?, ?, ?, ?, ?)
```

**SQL de inserción de peleadores iniciales en round 1:**
```sql
INSERT INTO round_peleador (id_torneo, id_combate, orden, round, id_usuario, en_pie, amonestado, expulsado)
VALUES (?, ?, ?, 1, ?, 1, 0, 0)
```

---

### 5.4 Crear Combates Masivos (Todos contra Todos)

#### `POST /api/v1/torneo/:idTorneo/generar-combates`

Genera automáticamente todos los combates para un torneo de tipo "Liga" o "Grupos" (todos contra todos). Si el torneo tiene grupos (`equipos_por_grupo`), genera los combates dentro de cada grupo. Si no tiene grupos, genera todos contra todos entre todos los equipos inscriptos.

**Parámetros de ruta:**
- `idTorneo` (TEXT) — UUID del torneo

**Request Body:** *(vacío o no requerido)*

**Response 201:**
```json
{
  "mensaje": "Combates generados exitosamente",
  "cantidadCombates": 6
}
```

**Response 400 — Sin equipos suficientes:**
```json
{
  "error": "Se necesitan al menos 2 equipos inscriptos para generar combates"
}
```

**Lógica de negocio:**
1. Verificar que el torneo existe.
2. Obtener el `tipo_torneo` desde `organizacion_torneo`.
3. Si el torneo tiene grupos (`con_grupos = 1` en `tipo_torneo`):
   - Obtener los equipos agrupados por `grupo` desde `equipos_por_grupo`.
   - Para cada grupo, generar todos los enfrentamientos posibles (A vs B, A vs C, B vs C, etc.).
4. Si el torneo NO tiene grupos:
   - Obtener todos los equipos de `torneo_equipo`.
   - Generar todos los enfrentamientos posibles entre todos los equipos.
5. Insertar cada combate en una transacción, asignando `orden` secuencial.

**Algoritmo para generar pares (sin repetir, sin enfrentar a un equipo consigo mismo):**
```
Para i = 0 hasta n-1:
  Para j = i+1 hasta n-1:
    crear combate(equipo[i], equipo[j])
```

---

### 5.5 Grabar Resultado de un Round

#### `POST /api/v1/torneo/:idTorneo/combate/:idCombate/round`

Graba el resultado de un round: equipo ganador, puntos, y estado de cada peleador (en pie, amonestado, expulsado).

**Parámetros de ruta:**
- `idTorneo` (TEXT)
- `idCombate` (TEXT)

**Request Body:**
```json
{
  "orden": 1,
  "round": 1,
  "idEquipoGanador": "uuid-equipo-a",
  "puntosGanador": 5,
  "puntosPerdedor": 3,
  "peleadores": [
    {
      "idUsuario": "uuid-peleador-1",
      "enPie": true,
      "amonestado": false,
      "expulsado": false
    },
    {
      "idUsuario": "uuid-peleador-2",
      "enPie": false,
      "amonestado": true,
      "expulsado": false
    },
    {
      "idUsuario": "uuid-peleador-3",
      "enPie": false,
      "amonestado": false,
      "expulsado": true
    }
  ]
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `orden` | INTEGER | Sí | Orden del combate (debe coincidir con el del combate) |
| `round` | INTEGER | Sí | Número de round (1, 2, 3...) |
| `idEquipoGanador` | TEXT | Sí | UUID del equipo que ganó el round |
| `puntosGanador` | INTEGER | No (default 0) | Puntos del ganador en este round |
| `puntosPerdedor` | INTEGER | No (default 0) | Puntos del perdedor en este round |
| `peleadores` | ARRAY | Sí | Lista de peleadores con su estado en este round |

**Response 201:**
```json
{
  "mensaje": "Round registrado exitosamente"
}
```

**Response 400 — Faltan campos:**
```json
{
  "error": "orden, round, idEquipoGanador y peleadores son requeridos"
}
```

**Response 404 — Combate no encontrado:**
```json
{
  "error": "Combate no encontrado"
}
```

**Response 409 — Round ya registrado:**
```json
{
  "error": "El round ya fue registrado para este combate"
}
```

**Lógica de negocio:**
1. Verificar que el combate existe.
2. Verificar que el round no fue registrado ya (`round_combate`).
3. Verificar que `idEquipoGanador` sea `id_equipo_a` o `id_equipo_b` del combate.
4. En una transacción:
   a. Insertar en `round_combate`.
   b. Para cada peleador en el array, hacer `INSERT OR REPLACE` en `round_peleador`.
   c. Si el peleador está amonestado, incrementar `cantidad_amarillas` en `torneo_equipo_peleador`.
   d. Si el peleador está expulsado, marcar `descalificado = 1` en `torneo_equipo_peleador`.

**SQL — Insertar round:**
```sql
INSERT INTO round_combate (id_torneo, id_combate, orden, round, id_equipo_ganador, puntos_ganador, puntos_perdedor)
VALUES (?, ?, ?, ?, ?, ?, ?)
```

**SQL — Insertar/actualizar peleador en round:**
```sql
INSERT OR REPLACE INTO round_peleador (id_torneo, id_combate, orden, round, id_usuario, en_pie, amonestado, expulsado)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

**SQL — Incrementar amarillas (si amonestado = 1):**
```sql
UPDATE torneo_equipo_peleador
SET cantidad_amarillas = cantidad_amarillas + 1
WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?
```

**SQL — Marcar descalificado (si expulsado = 1):**
```sql
UPDATE torneo_equipo_peleador
SET descalificado = 1
WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?
```

---

### 5.6 Cerrar Combate

#### `POST /api/v1/torneo/:idTorneo/combate/:idCombate/cerrar`

Cierra un combate registrando el equipo ganador y la cantidad de rounds ganados por cada lado. Además, actualiza automáticamente las estadísticas de equipos en `torneo_equipo` y de peleadores en `torneo_luchador`.

**Parámetros de ruta:**
- `idTorneo` (TEXT)
- `idCombate` (TEXT)

**Request Body:**
```json
{
  "idEquipoGanador": "uuid-equipo-a"
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `idEquipoGanador` | TEXT | Sí | UUID del equipo ganador del combate |

**Response 200:**
```json
{
  "mensaje": "Combate cerrado exitosamente",
  "roundsGanadosGanador": 2,
  "roundsGanadosPerdedor": 1
}
```

**Response 400 — Falta ganador:**
```json
{
  "error": "idEquipoGanador es requerido"
}
```

**Response 400 — Ganador inválido:**
```json
{
  "error": "El equipo ganador debe ser idEquipoA o idEquipoB del combate"
}
```

**Response 404 — Combate no encontrado:**
```json
{
  "error": "Combate no encontrado"
}
```

**Response 409 — Combate ya cerrado:**
```json
{
  "error": "El combate ya fue cerrado"
}
```

**Response 409 — Sin rounds registrados:**
```json
{
  "error": "No se puede cerrar un combate sin rounds registrados"
}
```

**Lógica de negocio:**
1. Verificar que el combate existe y no está cerrado (`id_equipo_ganador IS NULL`).
2. Verificar que `idEquipoGanador` es `id_equipo_a` o `id_equipo_b`.
3. Contar rounds ganados por cada equipo desde `round_combate`.
4. Identificar el equipo perdedor (el que no es el ganador).
5. En una transacción:
   a. Actualizar `combate`: setear `id_equipo_ganador`, `cantidad_round_ganados_ganador`, `cantidad_round_ganados_perdedor`.
   b. Actualizar `torneo_equipo` para el equipo ganador:
      ```sql
      UPDATE torneo_equipo
      SET cantidad_combates = cantidad_combates + 1,
          cantidad_victorias = cantidad_victorias + 1,
          cantidad_rounds_ganados = cantidad_rounds_ganados + ?,
          cantidad_rounds_perdidos = cantidad_rounds_perdidos + ?
      WHERE id_equipo = ? AND id_torneo = ?
      ```
   c. Actualizar `torneo_equipo` para el equipo perdedor:
      ```sql
      UPDATE torneo_equipo
      SET cantidad_combates = cantidad_combates + 1,
          cantidad_derrotas = cantidad_derrotas + 1,
          cantidad_rounds_ganados = cantidad_rounds_ganados + ?,
          cantidad_rounds_perdidos = cantidad_rounds_perdidos + ?
      WHERE id_equipo = ? AND id_torneo = ?
      ```
   d. Para cada peleador del equipo ganador en `torneo_equipo_peleador`, actualizar o insertar en `torneo_luchador`:
      ```sql
      INSERT INTO torneo_luchador (id_torneo, id_usuario, cantidad_combates, cantidad_victorias, cantidad_derrotas,
                                   cantidad_rounds_ganados, cantidad_rounds_perdidos, cantidad_rounds_en_pie)
      VALUES (?, ?, 1, 1, 0, ?, ?, ?)
      ON CONFLICT(id_torneo, id_usuario) DO UPDATE SET
        cantidad_combates = cantidad_combates + 1,
        cantidad_victorias = cantidad_victorias + 1,
        cantidad_rounds_ganados = cantidad_rounds_ganados + ?,
        cantidad_rounds_perdidos = cantidad_rounds_perdidos + ?,
        cantidad_rounds_en_pie = COALESCE(cantidad_rounds_en_pie, 0) + ?
      ```
      *Nota: SQLite no soporta `ON CONFLICT` directamente en INSERT con PK compuesta así. La implementación deberá hacer un `SELECT` previo para ver si existe y luego `INSERT` o `UPDATE`.*
   e. Análogo para los peleadores del equipo perdedor.

---

### 5.7 Resetear Combate

#### `DELETE /api/v1/torneo/:idTorneo/combate/:idCombate`

Elimina un combate completo junto con sus rounds y datos de peleadores por round. Útil si se creó mal o se necesita reiniciar.

**Response 200:**
```json
{
  "mensaje": "Combate eliminado exitosamente"
}
```

**Lógica:**
```sql
DELETE FROM round_peleador WHERE id_torneo = ? AND id_combate = ?;
DELETE FROM round_combate WHERE id_torneo = ? AND id_combate = ?;
DELETE FROM combate WHERE id_torneo = ? AND id_combate = ?;
```

---

### 5.8 Estadísticas del Torneo

#### `GET /api/v1/torneo/:idTorneo/estadisticas`

Obtiene estadísticas consolidadas del torneo: tabla de posiciones de equipos y estadísticas individuales de peleadores.

**Response 200:**
```json
{
  "idTorneo": "uuid-torneo",
  "nombre": "Torneo Nacional 2026",
  "equipos": [
    {
      "id": "uuid-equipo",
      "nombre": "Mercenarios",
      "logo": "/Mercenarios.svg",
      "combates": 3,
      "victorias": 3,
      "derrotas": 0,
      "roundsGanados": 6,
      "roundsPerdidos": 1
    }
  ],
  "peleadores": [
    {
      "idUsuario": "uuid-peleador",
      "nombre": "Juan",
      "apellido": "Pérez",
      "idEquipo": "uuid-equipo",
      "equipo": "Mercenarios",
      "combates": 3,
      "puntos": 15,
      "victorias": 3,
      "derrotas": 0,
      "roundsGanados": 6,
      "roundsPerdidos": 1,
      "roundsEnPie": 5
    }
  ]
}
```

**SQL — Equipos:**
```sql
SELECT te.id_equipo, e.nombre, e.logo,
       te.cantidad_combates, te.cantidad_victorias, te.cantidad_derrotas,
       te.cantidad_rounds_ganados, te.cantidad_rounds_perdidos
FROM torneo_equipo te
JOIN equipo e ON te.id_equipo = e.id_equipo
WHERE te.id_torneo = ?
ORDER BY te.cantidad_victorias DESC, te.cantidad_derrotas ASC
```

**SQL — Peleadores:**
```sql
SELECT tl.id_usuario, u.nombre, u.apellido, 
       tep.id_equipo, e.nombre AS equipo,
       tl.cantidad_combates, tl.cantidad_puntos, tl.cantidad_victorias, tl.cantidad_derrotas,
       tl.cantidad_rounds_ganados, tl.cantidad_rounds_perdidos, tl.cantidad_rounds_en_pie
FROM torneo_luchador tl
JOIN usuario u ON tl.id_usuario = u.id_usuario
JOIN torneo_equipo_peleador tep ON tep.id_torneo = tl.id_torneo AND tep.id_usuario = tl.id_usuario
JOIN equipo e ON tep.id_equipo = e.id_equipo
WHERE tl.id_torneo = ?
ORDER BY tl.cantidad_victorias DESC
```

---

## 6. Resumen de Todos los Endpoints (Existentes + Nuevos)

| Método | Path | Existente/Nuevo | Descripción |
|---|---|---|---|
| POST | `/api/v1/torneo/acceso` | **NUEVO** | Acceder a torneo por código OTP |
| GET | `/api/v1/torneo/:idTorneo/combates` | **NUEVO** | Obtener combates con equipos, colores y peleadores |
| POST | `/api/v1/torneo/:idTorneo/combate` | **NUEVO** | Crear un combate individual |
| POST | `/api/v1/torneo/:idTorneo/generar-combates` | **NUEVO** | Generar todos los combates automáticamente |
| POST | `/api/v1/torneo/:idTorneo/combate/:idCombate/round` | **NUEVO** | Grabar resultado de un round |
| POST | `/api/v1/torneo/:idTorneo/combate/:idCombate/cerrar` | **NUEVO** | Cerrar combate y actualizar estadísticas |
| DELETE | `/api/v1/torneo/:idTorneo/combate/:idCombate` | **NUEVO** | Eliminar un combate |
| GET | `/api/v1/torneo/:idTorneo/estadisticas` | **NUEVO** | Estadísticas del torneo |
| GET | `/api/v1/torneo/:idTorneo/equipos` | Existente | Equipos inscriptos (básico) |
| GET | `/api/v1/teams/:idTeam` | Existente | Detalle de equipo |
| GET | `/api/v1/tournaments` | Existente | Lista de torneos |
| GET | `/api/v1/tournaments/:tournamentId/info` | Existente | Info de torneo + clubes |
| GET | `/api/v1/combat-types/:idModalidad` | Existente | Categorías por modalidad |
| POST | `/api/v1/torneo/:idTorneo/equipos` | Existente | Inscribir equipo en torneo |
| DELETE | `/api/v1/torneo/:idTorneo/equipos/:idEquipo` | Existente | Desinscribir equipo |

---

## 7. Flujo Completo de la App de Marshall

```
1. MARSHALL abre la app
2. Ingresa el código OTP que le dio el organizador
   → POST /api/v1/torneo/acceso { codigo: "ABC123" }
   ← { accesoValido: true, torneo: { id, nombre, localizacion, fechaTorneo, ... } }

3. Se almacena el idTorneo en la app (localStorage/estado)

4. La app consulta los combates del torneo
   → GET /api/v1/torneo/:idTorneo/combates
   ← { combates: [ { id, orden, equipoA: {...}, equipoB: {...}, resultado: null/finalizado } ] }

5. El marshall selecciona un combate:
   - Ve los equipos enfrentados con nombres y colores
   - Ve los peleadores de cada equipo con su número y estado (activo, amarillas, descalificado)

6. El marshall inicia el Round 1:
   - La app muestra la grilla de peleadores (todos "en pie" por defecto)
   - Durante el round, el marshall marca peleadores caídos, amonestados o expulsados
   - Al finalizar el round, selecciona el equipo ganador y los puntos
   → POST /api/v1/torneo/:idTorneo/combate/:idCombate/round
     { orden, round: 1, idEquipoGanador, puntosGanador, puntosPerdedor, peleadores: [...] }

7. Se repite el paso 6 para cada round (típicamente 3 rounds por combate)

8. Al finalizar todos los rounds, el marshall cierra el combate:
   → POST /api/v1/torneo/:idTorneo/combate/:idCombate/cerrar
     { idEquipoGanador }
   ← El sistema calcula automáticamente rounds ganados y actualiza estadísticas

9. El marshall pasa al siguiente combate y repite desde el paso 5.
```

---

## 8. Consideraciones Técnicas para la Implementación

### 8.1 Nuevos archivos a crear

```
src/
├── routes/
│   └── combates.js              ← Nuevo archivo de rutas de combates
├── controllers/
│   └── combatesController.js    ← Nuevo controlador de combates
```

Registrar las rutas en `src/index.js`:
```js
const combatesRoutes = require('./routes/combates');
app.use('/api', combatesRoutes);
```

### 8.2 Manejo de errores

La API usa respuestas con códigos HTTP estándar y estructura de error:
```json
{ "error": "Mensaje descriptivo" }
```

Errores comunes a manejar: 400 (validación), 404 (no encontrado), 409 (conflicto/estado inválido), 500 (error interno).

Todos los controladores deben usar try/catch ya que no hay middleware de errores automático:
```js
const controller = {
  metodo: async (req, res) => {
    try {
      // lógica
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
};
```

### 8.3 SQLite — Consideraciones de `upsert`

SQLite (versiones recientes) soporta `INSERT ... ON CONFLICT DO UPDATE`, pero solo a partir de SQLite 3.24.0. Si la versión es anterior, se debe hacer:
1. `SELECT` para verificar existencia.
2. `INSERT` o `UPDATE` según corresponda.

Alternativa: usar `INSERT OR REPLACE` (reescribe toda la fila, requiere conocer todos los valores).

### 8.4 Generación de UUIDs

Importar del módulo `uuid` que ya está en el proyecto:
```js
const { v4: uuidv4 } = require('uuid');
```

### 8.5 Convención de rutas

- Los nuevos endpoints usan el prefijo `/api/v1/` para consistencia.
- Las rutas de torneo usan `/torneo/` (sin 'u' en inglés, siguiendo la convención existente).
- IDs en la URL son camelCase: `:idTorneo`, `:idCombate`.
- Respuestas JSON en español para mensajes, keys en camelCase para propiedades.

---

## 9. Resumen para la Otra IA

Si vas a usar este documento para pedirle a otra IA que construya la app frontend, estos son los puntos clave que debe entender:

1. **No hay auth de usuarios.** El acceso se hace por OTP del torneo (`torneo.password`). El endpoint de acceso devuelve el `idTorneo` que se usa para todas las consultas posteriores.

2. **La app no lista torneos.** Solo se accede por código OTP. El marshall obtiene el código del organizador por fuera del sistema.

3. **El endpoint principal es `GET /combates`.** Devuelve TODO lo que la app necesita para mostrar combates, equipos, colores y peleadores en una sola llamada (respuesta anidada).

4. **Grabar resultados es round por round.** La app debe enviar el estado de TODOS los peleadores (en pie, amonestado, expulsado) en cada round. El backend se encarga de acumular amarillas y descalificaciones.

5. **Cerrar combate dispara la actualización de estadísticas.** La app solo envía el `idEquipoGanador`; el backend calcula rounds ganados/perdidos y actualiza todas las tablas de stats.

6. **Los colores se devuelven expandidos** (id, nombre, hex) para que la app pinte directamente sin necesidad de llamadas adicionales a lookups.

7. **La creación masiva de combates** (`/generar-combates`) es opcional pero conveniente para torneos de liga o grupos. Si la app necesita crear combates manualmente (ej. fase eliminatoria), usa el endpoint individual `POST /combate`.
