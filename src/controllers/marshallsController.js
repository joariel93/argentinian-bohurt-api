const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

async function getColoresEquipo(idEquipo) {
  const eq = await db.get(
    `SELECT id_color1, id_color2, id_color3 FROM equipo WHERE id_equipo = ?`,
    [idEquipo]
  );
  if (!eq) return [];

  const ids = [eq.id_color1, eq.id_color2, eq.id_color3];
  const colores = [];
  for (const id of ids) {
    const c = await db.get(
      `SELECT id_color AS id, nombre, hex FROM colores WHERE id_color = ?`,
      [id]
    );
    if (c) colores.push(c);
  }
  return colores;
}

async function getPeleadoresEquipoEnTorneo(idTorneo, idEquipo) {
  const rows = await db.all(
    `SELECT u.id_usuario AS idUsuario, u.nombre, u.apellido, u.username,
            tep.numero_peleador AS numeroPeleador, tep.cantidad_amarillas AS cantidadAmarillas,
            tep.descalificado
     FROM torneo_equipo_peleador tep
     JOIN usuario u ON tep.id_usuario = u.id_usuario
     WHERE tep.id_torneo = ? AND tep.id_equipo = ?
     ORDER BY tep.numero_peleador ASC`,
    [idTorneo, idEquipo]
  );
  return rows.map((r) => ({ ...r, descalificado: !!r.descalificado }));
}

async function buildEquipo(idEquipo, idTorneo) {
  const eq = await db.get(
    `SELECT id_equipo, nombre, logo FROM equipo WHERE id_equipo = ?`,
    [idEquipo]
  );
  if (!eq) return null;

  const [colores, peleadores] = await Promise.all([
    getColoresEquipo(idEquipo),
    getPeleadoresEquipoEnTorneo(idTorneo, idEquipo),
  ]);

  return {
    id: eq.id_equipo,
    nombre: eq.nombre,
    logo: eq.logo,
    colores,
    peleadores,
  };
}

async function actualizarLuchadores(trx, idTorneo, idCombate, idEquipo, esGanador, ganadosGanador, ganadosPerdedor) {
  const fighters = await trx.all(
    `SELECT id_usuario FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ?`,
    [idTorneo, idEquipo]
  );

  let totalEnPie = 0;

  for (const f of fighters) {
    const row = await trx.get(
      `SELECT COUNT(*) AS n FROM round_peleador
       WHERE id_torneo = ? AND id_combate = ? AND id_usuario = ? AND en_pie = 1`,
      [idTorneo, idCombate, f.id_usuario]
    );
    const enPie = row?.n || 0;
    totalEnPie += enPie;

    const victorias = esGanador ? 1 : 0;
    const derrotas = esGanador ? 0 : 1;
    const roundsGanados = esGanador ? ganadosGanador : ganadosPerdedor;
    const roundsPerdidos = esGanador ? ganadosPerdedor : ganadosGanador;

    const existing = await trx.get(
      `SELECT id_usuario FROM torneo_luchador WHERE id_torneo = ? AND id_usuario = ?`,
      [idTorneo, f.id_usuario]
    );

    if (existing) {
      await trx.run(
        `UPDATE torneo_luchador SET
           cantidad_combates = cantidad_combates + 1,
           cantidad_victorias = cantidad_victorias + ?,
           cantidad_derrotas = cantidad_derrotas + ?,
           cantidad_rounds_ganados = cantidad_rounds_ganados + ?,
           cantidad_rounds_perdidos = cantidad_rounds_perdidos + ?,
           cantidad_rounds_en_pie = COALESCE(cantidad_rounds_en_pie, 0) + ?
         WHERE id_torneo = ? AND id_usuario = ?`,
        [victorias, derrotas, roundsGanados, roundsPerdidos, enPie, idTorneo, f.id_usuario]
      );
    } else {
      await trx.run(
        `INSERT INTO torneo_luchador (id_torneo, id_usuario, cantidad_combates, cantidad_victorias,
                                      cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos,
                                      cantidad_rounds_en_pie)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
        [idTorneo, f.id_usuario, victorias, derrotas, roundsGanados, roundsPerdidos, enPie]
      );
    }
  }

  return totalEnPie;
}

async function getGanadorDirecto(idTorneo, grupo, idEquipoA, idEquipoB) {
  const c = await db.get(
    `SELECT id_equipo_ganador FROM combate
     WHERE id_torneo = ? AND grupo = ?
       AND ((id_equipo_a = ? AND id_equipo_b = ?) OR (id_equipo_a = ? AND id_equipo_b = ?))
       AND id_equipo_ganador IS NOT NULL`,
    [idTorneo, grupo, idEquipoA, idEquipoB, idEquipoB, idEquipoA]
  );
  return c?.id_equipo_ganador || null;
}

async function getRankingGrupo(idTorneo, grupo) {
  const equipos = await db.all(
    `SELECT id_equipo FROM equipos_por_grupo WHERE id_torneo = ? AND grupo = ?`,
    [idTorneo, grupo]
  );
  const ids = equipos.map((e) => e.id_equipo);
  if (ids.length === 0) return [];

  const ranking = [];
  for (const idEquipo of ids) {
    const victorias = await db.get(
      `SELECT COUNT(*) AS n FROM combate WHERE id_torneo = ? AND grupo = ? AND id_equipo_ganador = ?`,
      [idTorneo, grupo, idEquipo]
    );
    const hombres = await db.get(
      `SELECT COUNT(*) AS n
       FROM round_peleador rp
       JOIN combate c ON c.id_torneo = rp.id_torneo AND c.id_combate = rp.id_combate
       JOIN torneo_equipo_peleador tep ON tep.id_torneo = rp.id_torneo AND tep.id_usuario = rp.id_usuario
       WHERE c.id_torneo = ? AND c.grupo = ? AND tep.id_equipo = ? AND rp.en_pie = 1`,
      [idTorneo, grupo, idEquipo]
    );
    ranking.push({ id_equipo: idEquipo, victorias: victorias?.n || 0, hombresEnPie: hombres?.n || 0 });
  }

  ranking.sort((a, b) => b.victorias - a.victorias || b.hombresEnPie - a.hombresEnPie);

  for (let i = 0; i < ranking.length - 1; i++) {
    const a = ranking[i];
    const b = ranking[i + 1];
    if (a.victorias === b.victorias && a.hombresEnPie === b.hombresEnPie) {
      const ganador = await getGanadorDirecto(idTorneo, grupo, a.id_equipo, b.id_equipo);
      if (ganador === b.id_equipo) {
        [ranking[i], ranking[i + 1]] = [ranking[i + 1], ranking[i]];
      }
    }
  }

  return ranking.map((r) => r.id_equipo);
}

async function resolverSlot(row, side, combatesMap, rankingsCache, idTorneo, memo) {
  const origen = row[`origen_${side}`];

  if (!origen || origen === 'equipo') {
    return row[`id_equipo_${side}`] || null;
  }

  if (origen === 'ganador') {
    const src = combatesMap.get(row[`id_combate_origen_${side}`]);
    return src?.id_equipo_ganador || null;
  }

  if (origen === 'perdedor') {
    const src = combatesMap.get(row[`id_combate_origen_${side}`]);
    if (!src || !src.id_equipo_ganador) return null;
    const equipos = await resolverEquiposCombate(src, combatesMap, rankingsCache, idTorneo, memo);
    return src.id_equipo_ganador === equipos.idA ? equipos.idB : equipos.idA;
  }

  if (origen === 'clasificado') {
    const grupo = row[`grupo_origen_${side}`];
    const posicion = row[`posicion_origen_${side}`];
    if (!grupo || !posicion) return null;
    if (!rankingsCache.has(grupo)) {
      rankingsCache.set(grupo, await getRankingGrupo(idTorneo, grupo));
    }
    return rankingsCache.get(grupo)[posicion - 1] || null;
  }

  return null;
}

async function resolverEquiposCombate(row, combatesMap, rankingsCache, idTorneo, memo) {
  if (memo.has(row.id_combate)) return memo.get(row.id_combate);

  const promise = (async () => {
    const idA = await resolverSlot(row, 'a', combatesMap, rankingsCache, idTorneo, memo);
    const idB = await resolverSlot(row, 'b', combatesMap, rankingsCache, idTorneo, memo);
    return { idA, idB };
  })();

  memo.set(row.id_combate, promise);
  return promise;
}

async function getEquiposParaSorteo(idTorneo) {
  const rows = await db.all(
    `SELECT te.id_equipo, te.es_cabeza_serie, c.id_club
     FROM torneo_equipo te
     LEFT JOIN club_equipos ce ON ce.id_equipo = te.id_equipo
     LEFT JOIN club c ON c.id_club = ce.id_club
     WHERE te.id_torneo = ?`,
    [idTorneo]
  );
  return rows.map((r) => ({
    idEquipo: r.id_equipo,
    idClub: r.id_club || null,
    esCabezaSerie: !!r.es_cabeza_serie,
  }));
}

function sortearGrupos(equipos, cantidadGrupos) {
  const grupos = Array.from({ length: cantidadGrupos }, (_, i) => ({
    numero: i + 1,
    nombre: `Grupo ${String.fromCharCode(65 + i)}`,
    equipos: [],
  }));

  const semillas = equipos.filter((e) => e.esCabezaSerie);
  const resto = equipos.filter((e) => !e.esCabezaSerie);

  const asignar = (equipo) => {
    let candidatos = grupos.filter((g) => !g.equipos.some((x) => x.idClub === equipo.idClub));
    if (candidatos.length === 0) candidatos = grupos;
    candidatos.sort((a, b) => a.equipos.length - b.equipos.length);
    return candidatos[0];
  };

  [...semillas, ...resto].forEach((equipo) => {
    const g = asignar(equipo);
    g.equipos.push(equipo);
  });

  return grupos.map((g) => ({ numero: g.numero, nombre: g.nombre, equipos: g.equipos.map((e) => e.idEquipo) }));
}

function sortearEliminatoria(equipos) {
  const n = equipos.length;
  let size = 2;
  while (size < n) size *= 2;
  const matches = size / 2;

  const map = new Map(equipos.map((e) => [e.idEquipo, e]));
  const orden = new Array(size).fill(null);

  const semillas = equipos.filter((e) => e.esCabezaSerie);
  const resto = equipos.filter((e) => !e.esCabezaSerie);

  const matchTieneClub = (m, club) => {
    const a = orden[m * 2];
    const b = orden[m * 2 + 1];
    return (a && map.get(a)?.idClub === club) || (b && map.get(b)?.idClub === club);
  };

  const semillasEnMitad = (m) => {
    const half = m < matches / 2 ? 0 : 1;
    let count = 0;
    const start = half * (matches / 2);
    const end = (half + 1) * (matches / 2);
    for (let mm = start; mm < end; mm++) {
      const a = orden[mm * 2];
      const b = orden[mm * 2 + 1];
      if ((a && map.get(a)?.esCabezaSerie) || (b && map.get(b)?.esCabezaSerie)) count++;
    }
    return count;
  };

  const elegirMatch = (e) => {
    let best = -1;
    let bestScore = Infinity;
    for (let m = 0; m < matches; m++) {
      const ocupado = (orden[m * 2] !== null ? 1 : 0) + (orden[m * 2 + 1] !== null ? 1 : 0);
      if (ocupado >= 2) continue;

      let score = ocupado * 10;
      if (matchTieneClub(m, e.idClub)) score += 1000;
      if (e.esCabezaSerie) score += semillasEnMitad(m) * 30;

      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  };

  const colocar = (e) => {
    const m = elegirMatch(e);
    if (m === -1) return false;
    if (orden[m * 2] === null) orden[m * 2] = e.idEquipo;
    else orden[m * 2 + 1] = e.idEquipo;
    return true;
  };

  semillas.forEach(colocar);
  resto.forEach(colocar);

  return orden.filter((id) => id !== null);
}

const marshallsController = {
  acceso: async (req, res) => {
    try {
      const { codigo } = req.body;

      if (!codigo) {
        return res.status(400).json({ error: "El campo 'codigo' es requerido" });
      }

      const t = await db.get(
        `SELECT id_torneo, nombre, localizacion, fecha_torneo, id_modalidad, id_categoria, id_genero, id_tipo_torneo
         FROM torneo WHERE password = ?`,
        [codigo]
      );

      if (!t) {
        return res.json({ accesoValido: false, mensaje: 'Código de acceso inválido' });
      }

      const count = await db.get(
        `SELECT COUNT(*) AS n FROM combate WHERE id_torneo = ?`,
        [t.id_torneo]
      );

      const [modalidad, categoria, genero] = await Promise.all([
        db.get(`SELECT nombre FROM modalidad WHERE id_modalidad = ?`, [t.id_modalidad]),
        db.get(`SELECT nombre FROM categoria WHERE id_categoria = ? AND id_modalidad = ?`, [t.id_categoria, t.id_modalidad]),
        db.get(`SELECT nombre FROM genero WHERE id_genero = ?`, [t.id_genero]),
      ]);

      res.json({
        accesoValido: true,
        torneo: {
          id: t.id_torneo,
          nombre: t.nombre,
          localizacion: t.localizacion,
          fechaTorneo: t.fecha_torneo,
          modalidad: modalidad?.nombre || null,
          categoria: categoria?.nombre || null,
          genero: genero?.nombre || null,
          idTipoTorneo: t.id_tipo_torneo,
          organizado: count.n > 0,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  getCombates: async (req, res) => {
    try {
      const { idTorneo } = req.params;

      const torneo = await db.get(
        `SELECT id_torneo, nombre, id_modalidad, id_categoria, id_genero FROM torneo WHERE id_torneo = ?`,
        [idTorneo]
      );
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      const combates = await db.all(
        `SELECT id_combate, orden, link, fase, grupo, ronda, nivel,
                origen_a, origen_b, id_combate_origen_a, id_combate_origen_b,
                grupo_origen_a, grupo_origen_b, posicion_origen_a, posicion_origen_b,
                id_equipo_a, id_equipo_b, id_equipo_ganador,
                cantidad_round_ganados_ganador, cantidad_round_ganados_perdedor
         FROM combate WHERE id_torneo = ? ORDER BY orden ASC`,
        [idTorneo]
      );

      const combatesMap = new Map(combates.map((c) => [c.id_combate, c]));
      const rankingsCache = new Map();
      const memo = new Map();

      const result = await Promise.all(
        combates.map(async (c) => {
          const finalizado = !!c.id_equipo_ganador;

          const equipos = await resolverEquiposCombate(c, combatesMap, rankingsCache, idTorneo, memo);
          const [equipoA, equipoB] = await Promise.all([
            equipos.idA ? buildEquipo(equipos.idA, idTorneo) : null,
            equipos.idB ? buildEquipo(equipos.idB, idTorneo) : null,
          ]);

          let resultado = null;
          if (finalizado) {
            const rounds = await db.all(
              `SELECT round, id_equipo_ganador, puntos_ganador, puntos_perdedor
               FROM round_combate WHERE id_torneo = ? AND id_combate = ? ORDER BY round ASC`,
              [idTorneo, c.id_combate]
            );

            const roundsConPeleadores = await Promise.all(
              rounds.map(async (r) => {
                const peleadores = await db.all(
                  `SELECT id_usuario AS idUsuario, en_pie AS enPie, amonestado, expulsado
                   FROM round_peleador
                   WHERE id_torneo = ? AND id_combate = ? AND round = ?`,
                  [idTorneo, c.id_combate, r.round]
                );
                return {
                  round: r.round,
                  idEquipoGanador: r.id_equipo_ganador,
                  puntosGanador: r.puntos_ganador,
                  puntosPerdedor: r.puntos_perdedor,
                  peleadores: peleadores.map((p) => ({
                    ...p,
                    enPie: !!p.enPie,
                    amonestado: !!p.amonestado,
                    expulsado: !!p.expulsado,
                  })),
                };
              })
            );

            const ganador = await db.get(`SELECT nombre FROM equipo WHERE id_equipo = ?`, [c.id_equipo_ganador]);
            resultado = {
              idEquipoGanador: c.id_equipo_ganador,
              nombreGanador: ganador?.nombre || null,
              roundsGanadosGanador: c.cantidad_round_ganados_ganador,
              roundsGanadosPerdedor: c.cantidad_round_ganados_perdedor,
              rounds: roundsConPeleadores,
            };
          }

          return {
            id: c.id_combate,
            orden: c.orden,
            link: c.link || null,
            fase: c.fase || null,
            grupo: c.grupo || null,
            ronda: c.ronda || null,
            nivel: c.nivel ?? null,
            origenA: c.origen_a || null,
            origenB: c.origen_b || null,
            idCombateOrigenA: c.id_combate_origen_a || null,
            idCombateOrigenB: c.id_combate_origen_b || null,
            grupoOrigenA: c.grupo_origen_a || null,
            grupoOrigenB: c.grupo_origen_b || null,
            posicionOrigenA: c.posicion_origen_a ?? null,
            posicionOrigenB: c.posicion_origen_b ?? null,
            finalizado,
            equipoA,
            equipoB,
            resultado,
          };
        })
      );

      const [modalidad, categoria, genero] = await Promise.all([
        db.get(`SELECT nombre FROM modalidad WHERE id_modalidad = ?`, [torneo.id_modalidad]),
        db.get(`SELECT nombre FROM categoria WHERE id_categoria = ? AND id_modalidad = ?`, [torneo.id_categoria, torneo.id_modalidad]),
        db.get(`SELECT nombre FROM genero WHERE id_genero = ?`, [torneo.id_genero]),
      ]);

      res.json({
        idTorneo,
        nombre: torneo.nombre,
        modalidad: modalidad?.nombre || null,
        categoria: categoria?.nombre || null,
        genero: genero?.nombre || null,
        combates: result,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  createCombate: async (req, res) => {
    try {
      const { idTorneo } = req.params;
      const { idEquipoA, idEquipoB, orden, link, fase, grupo, ronda } = req.body;

      if (!idEquipoA || !idEquipoB || orden === undefined || orden === null) {
        return res.status(400).json({ error: 'idEquipoA, idEquipoB y orden son requeridos' });
      }
      if (idEquipoA === idEquipoB) {
        return res.status(400).json({ error: 'idEquipoA e idEquipoB deben ser diferentes' });
      }

      const torneo = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [idTorneo]);
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      for (const idEquipo of [idEquipoA, idEquipoB]) {
        const te = await db.get(
          `SELECT id_equipo FROM torneo_equipo WHERE id_torneo = ? AND id_equipo = ?`,
          [idTorneo, idEquipo]
        );
        if (!te) {
          return res.status(404).json({ error: `El equipo ${idEquipo} no está inscripto en el torneo` });
        }
      }

      const idCombate = uuidv4();
      await db.run(
        `INSERT INTO combate (id_torneo, id_combate, link, orden, fase, grupo, ronda, id_equipo_a, id_equipo_b)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idTorneo, idCombate, link || null, orden, fase || null, grupo || null, ronda || null, idEquipoA, idEquipoB]
      );

      res.status(201).json({ idCombate, mensaje: 'Combate creado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  generarCombates: async (req, res) => {
    try {
      const { idTorneo } = req.params;

      const torneo = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [idTorneo]);
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      const grupos = await db.all(
        `SELECT id_equipo, grupo FROM equipos_por_grupo WHERE id_torneo = ? ORDER BY grupo`,
        [idTorneo]
      );

      let equiposPorGrupo;
      if (grupos.length > 0) {
        equiposPorGrupo = {};
        grupos.forEach((g) => {
          if (!equiposPorGrupo[g.grupo]) equiposPorGrupo[g.grupo] = [];
          equiposPorGrupo[g.grupo].push(g.id_equipo);
        });
      } else {
        const eqs = await db.all(
          `SELECT id_equipo FROM torneo_equipo WHERE id_torneo = ? ORDER BY id_equipo`,
          [idTorneo]
        );
        equiposPorGrupo = { '': eqs.map((e) => e.id_equipo) };
      }

      const pares = [];
      for (const [grupo, ids] of Object.entries(equiposPorGrupo)) {
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            pares.push({
              idEquipoA: ids[i],
              idEquipoB: ids[j],
              fase: grupos.length > 0 ? 'grupos' : 'liga',
              grupo: grupos.length > 0 ? String(grupo) : null,
            });
          }
        }
      }

      if (pares.length === 0) {
        return res.status(400).json({ error: 'Se necesitan al menos 2 equipos inscriptos para generar combates' });
      }

      await db.transaction(async (trx) => {
        for (let i = 0; i < pares.length; i++) {
          const p = pares[i];
          const idCombate = uuidv4();
          await trx.run(
            `INSERT INTO combate (id_torneo, id_combate, orden, fase, grupo, id_equipo_a, id_equipo_b)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [idTorneo, idCombate, i + 1, p.fase, p.grupo, p.idEquipoA, p.idEquipoB]
          );
        }
      });

      res.status(201).json({ mensaje: 'Combates generados exitosamente', cantidadCombates: pares.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crearEstructura: async (req, res) => {
    try {
      const { idTorneo } = req.params;
      const { fases, combates } = req.body;

      if (!Array.isArray(combates)) {
        return res.status(400).json({ error: 'El campo combates es requerido' });
      }

      const torneo = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [idTorneo]);
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      await db.transaction(async (trx) => {
        await trx.run(`DELETE FROM round_peleador WHERE id_torneo = ?`, [idTorneo]);
        await trx.run(`DELETE FROM round_combate WHERE id_torneo = ?`, [idTorneo]);
        await trx.run(`DELETE FROM combate WHERE id_torneo = ?`, [idTorneo]);
        await trx.run(`DELETE FROM fase_torneo WHERE id_torneo = ?`, [idTorneo]);

        if (Array.isArray(fases)) {
          for (let i = 0; i < fases.length; i++) {
            const f = fases[i];
            await trx.run(
              `INSERT INTO fase_torneo (id_torneo, orden, tipo, cantidad_grupos, clasifican_por_grupo, tercer_puesto)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [idTorneo, i + 1, f.tipo, f.cantidadGrupos || null, f.clasificanPorGrupo || null, f.tercerPuesto ? 1 : 0]
            );
          }
        }

        const idMap = new Map();
        combates.forEach((c, i) => {
          idMap.set(c.tempId ?? String(i), uuidv4());
        });

        for (let i = 0; i < combates.length; i++) {
          const c = combates[i];
          const idCombate = idMap.get(c.tempId ?? String(i));
          const idOrigenA = c.idCombateOrigenA ? idMap.get(c.idCombateOrigenA) || null : null;
          const idOrigenB = c.idCombateOrigenB ? idMap.get(c.idCombateOrigenB) || null : null;

          const origenA = c.origenA || (idOrigenA ? 'ganador' : 'equipo');
          const origenB = c.origenB || (idOrigenB ? 'ganador' : 'equipo');

          await trx.run(
            `INSERT INTO combate (id_torneo, id_combate, link, orden, fase, grupo, ronda, nivel,
               origen_a, origen_b, id_combate_origen_a, id_combate_origen_b,
               grupo_origen_a, grupo_origen_b, posicion_origen_a, posicion_origen_b,
               id_equipo_a, id_equipo_b, id_equipo_ganador)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            [idTorneo, idCombate, c.link || null, c.orden ?? i + 1, c.fase || null, c.grupo || null, c.ronda || null, c.nivel ?? null,
              origenA, origenB, idOrigenA, idOrigenB,
              c.grupoOrigenA || null, c.grupoOrigenB || null, c.posicionOrigenA ?? null, c.posicionOrigenB ?? null,
              c.idEquipoA || null, c.idEquipoB || null]
          );

          if (c.autoAvance) {
            const equipo = c.idEquipoA || c.idEquipoB;
            if (equipo) {
              await trx.run(
                `UPDATE combate SET id_equipo_ganador = ? WHERE id_torneo = ? AND id_combate = ?`,
                [equipo, idTorneo, idCombate]
              );
            }
          }
        }
      });

      res.status(201).json({ mensaje: 'Estructura creada exitosamente', cantidadCombates: combates.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  grabarRound: async (req, res) => {
    try {
      const { idTorneo, idCombate } = req.params;
      const { orden, round, idEquipoGanador, puntosGanador, puntosPerdedor, peleadores } = req.body;

      if (orden === undefined || orden === null || round === undefined || round === null || !Array.isArray(peleadores)) {
        return res.status(400).json({ error: 'orden, round y peleadores son requeridos' });
      }

      const combate = await db.get(
        `SELECT id_equipo_a, id_equipo_b, id_equipo_ganador FROM combate WHERE id_torneo = ? AND id_combate = ?`,
        [idTorneo, idCombate]
      );
      if (!combate) return res.status(404).json({ error: 'Combate no encontrado' });

      if (idEquipoGanador && idEquipoGanador !== combate.id_equipo_a && idEquipoGanador !== combate.id_equipo_b) {
        return res.status(400).json({ error: 'El equipo ganador debe ser idEquipoA o idEquipoB del combate' });
      }

      const existing = await db.get(
        `SELECT round FROM round_combate WHERE id_torneo = ? AND id_combate = ? AND round = ?`,
        [idTorneo, idCombate, round]
      );
      if (existing) {
        return res.json({ mensaje: 'Round ya registrado' });
      }

      await db.transaction(async (trx) => {
        await trx.run(
          `INSERT INTO round_combate (id_torneo, id_combate, orden, round, id_equipo_ganador, puntos_ganador, puntos_perdedor)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [idTorneo, idCombate, orden, round, idEquipoGanador || null, puntosGanador || 0, puntosPerdedor || 0]
        );

        for (const p of peleadores) {
          await trx.run(
            `INSERT OR REPLACE INTO round_peleador (id_torneo, id_combate, orden, round, id_usuario, en_pie, amonestado, expulsado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [idTorneo, idCombate, orden, round, p.idUsuario, p.enPie ? 1 : 0, p.amonestado ? 1 : 0, p.expulsado ? 1 : 0]
          );

          if (p.amonestado || p.expulsado) {
            const tep = await trx.get(
              `SELECT id_equipo FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_usuario = ?`,
              [idTorneo, p.idUsuario]
            );
            if (tep) {
              if (p.amonestado) {
                await trx.run(
                  `UPDATE torneo_equipo_peleador SET cantidad_amarillas = cantidad_amarillas + 1
                   WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
                  [idTorneo, tep.id_equipo, p.idUsuario]
                );
              }
              if (p.expulsado) {
                await trx.run(
                  `UPDATE torneo_equipo_peleador SET descalificado = 1
                   WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
                  [idTorneo, tep.id_equipo, p.idUsuario]
                );
              }
            }
          }
        }
      });

      res.status(201).json({ mensaje: 'Round registrado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  cerrarCombate: async (req, res) => {
    try {
      const { idTorneo, idCombate } = req.params;
      const { idEquipoGanador } = req.body;

      if (!idEquipoGanador) {
        return res.status(400).json({ error: 'idEquipoGanador es requerido' });
      }

      const combate = await db.get(
        `SELECT id_equipo_a, id_equipo_b, id_equipo_ganador FROM combate WHERE id_torneo = ? AND id_combate = ?`,
        [idTorneo, idCombate]
      );
      if (!combate) return res.status(404).json({ error: 'Combate no encontrado' });
      if (combate.id_equipo_ganador) return res.status(409).json({ error: 'El combate ya fue cerrado' });
      if (idEquipoGanador !== combate.id_equipo_a && idEquipoGanador !== combate.id_equipo_b) {
        return res.status(400).json({ error: 'El equipo ganador debe ser idEquipoA o idEquipoB del combate' });
      }

      const rounds = await db.all(
        `SELECT id_equipo_ganador FROM round_combate WHERE id_torneo = ? AND id_combate = ?`,
        [idTorneo, idCombate]
      );
      if (rounds.length === 0) {
        return res.status(409).json({ error: 'No se puede cerrar un combate sin rounds registrados' });
      }

      const idPerdedor = idEquipoGanador === combate.id_equipo_a ? combate.id_equipo_b : combate.id_equipo_a;
      const ganadosGanador = rounds.filter((r) => r.id_equipo_ganador === idEquipoGanador).length;
      const ganadosPerdedor = rounds.filter((r) => r.id_equipo_ganador === idPerdedor).length;

      await db.transaction(async (trx) => {
        await trx.run(
          `UPDATE combate SET id_equipo_ganador = ?, cantidad_round_ganados_ganador = ?, cantidad_round_ganados_perdedor = ?
           WHERE id_torneo = ? AND id_combate = ?`,
          [idEquipoGanador, ganadosGanador, ganadosPerdedor, idTorneo, idCombate]
        );

        const enPieGanador = await actualizarLuchadores(trx, idTorneo, idCombate, idEquipoGanador, true, ganadosGanador, ganadosPerdedor);
        const enPiePerdedor = await actualizarLuchadores(trx, idTorneo, idCombate, idPerdedor, false, ganadosGanador, ganadosPerdedor);

        await trx.run(
          `UPDATE torneo_equipo
           SET cantidad_combates = cantidad_combates + 1,
               cantidad_victorias = cantidad_victorias + 1,
               cantidad_rounds_ganados = cantidad_rounds_ganados + ?,
               cantidad_rounds_perdidos = cantidad_rounds_perdidos + ?,
               cantidad_hombres_en_pie = cantidad_hombres_en_pie + ?
           WHERE id_equipo = ? AND id_torneo = ?`,
          [ganadosGanador, ganadosPerdedor, enPieGanador, idEquipoGanador, idTorneo]
        );

        await trx.run(
          `UPDATE torneo_equipo
           SET cantidad_combates = cantidad_combates + 1,
               cantidad_derrotas = cantidad_derrotas + 1,
               cantidad_rounds_ganados = cantidad_rounds_ganados + ?,
               cantidad_rounds_perdidos = cantidad_rounds_perdidos + ?,
               cantidad_hombres_en_pie = cantidad_hombres_en_pie + ?
           WHERE id_equipo = ? AND id_torneo = ?`,
          [ganadosPerdedor, ganadosGanador, enPiePerdedor, idPerdedor, idTorneo]
        );
      });

      res.json({
        mensaje: 'Combate cerrado exitosamente',
        roundsGanadosGanador: ganadosGanador,
        roundsGanadosPerdedor: ganadosPerdedor,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  deleteCombate: async (req, res) => {
    try {
      const { idTorneo, idCombate } = req.params;

      await db.transaction(async (trx) => {
        await trx.run(`DELETE FROM round_peleador WHERE id_torneo = ? AND id_combate = ?`, [idTorneo, idCombate]);
        await trx.run(`DELETE FROM round_combate WHERE id_torneo = ? AND id_combate = ?`, [idTorneo, idCombate]);
        await trx.run(`DELETE FROM combate WHERE id_torneo = ? AND id_combate = ?`, [idTorneo, idCombate]);
      });

      res.json({ mensaje: 'Combate eliminado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  deleteCombates: async (req, res) => {
    try {
      const { idTorneo } = req.params;

      await db.transaction(async (trx) => {
        await trx.run(`DELETE FROM round_peleador WHERE id_torneo = ?`, [idTorneo]);
        await trx.run(`DELETE FROM round_combate WHERE id_torneo = ?`, [idTorneo]);
        await trx.run(`DELETE FROM combate WHERE id_torneo = ?`, [idTorneo]);
      });

      res.json({ mensaje: 'Combates eliminados exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  getEquipos: async (req, res) => {
    try {
      const { idTorneo } = req.params;

      const torneo = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [idTorneo]);
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      const rows = await db.all(
        `SELECT te.id_equipo, te.posicion, te.es_cabeza_serie AS esCabezaSerie,
                c.id_club AS idClub, c.nombre AS club
         FROM torneo_equipo te
         LEFT JOIN club_equipos ce ON ce.id_equipo = te.id_equipo
         LEFT JOIN club c ON c.id_club = ce.id_club
         WHERE te.id_torneo = ?
         ORDER BY c.nombre ASC, te.id_equipo ASC`,
        [idTorneo]
      );

      const equipos = await Promise.all(
        rows.map(async (r) => {
          const eq = await buildEquipo(r.id_equipo, idTorneo);
          return {
            ...eq,
            posicion: r.posicion,
            idClub: r.idClub || null,
            club: r.club || null,
            esCabezaSerie: !!r.esCabezaSerie,
          };
        })
      );

      res.json(equipos);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  setCabezaSerie: async (req, res) => {
    try {
      const { idTorneo, idEquipo } = req.params;
      const { esCabezaSerie } = req.body;

      if (esCabezaSerie === undefined) {
        return res.status(400).json({ error: 'El campo esCabezaSerie es requerido' });
      }

      const te = await db.get(
        `SELECT id_equipo FROM torneo_equipo WHERE id_torneo = ? AND id_equipo = ?`,
        [idTorneo, idEquipo]
      );
      if (!te) return res.status(404).json({ error: 'Equipo no inscripto en el torneo' });

      await db.run(
        `UPDATE torneo_equipo SET es_cabeza_serie = ? WHERE id_torneo = ? AND id_equipo = ?`,
        [esCabezaSerie ? 1 : 0, idTorneo, idEquipo]
      );

      res.json({ mensaje: 'Cabeza de serie actualizada', esCabezaSerie: !!esCabezaSerie });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  sorteo: async (req, res) => {
    try {
      const { idTorneo } = req.params;
      const { tipo, cantidadGrupos, tercerPuesto } = req.body;

      if (!tipo || !['grupos', 'eliminatoria'].includes(tipo)) {
        return res.status(400).json({ error: "El campo tipo debe ser 'grupos' o 'eliminatoria'" });
      }

      const torneo = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [idTorneo]);
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      const equipos = await getEquiposParaSorteo(idTorneo);
      if (equipos.length < 2) {
        return res.status(400).json({ error: 'Se necesitan al menos 2 equipos inscriptos para sortear' });
      }

      if (tipo === 'grupos') {
        const n = cantidadGrupos ? Number(cantidadGrupos) : 2;
        if (!n || n < 2) return res.status(400).json({ error: 'cantidadGrupos debe ser al menos 2' });
        res.json({ grupos: sortearGrupos(equipos, n) });
      } else {
        res.json({ ordenEquipos: sortearEliminatoria(equipos), tercerPuesto: !!tercerPuesto });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  crearEquipoCoalicion: async (req, res) => {
    try {
      const { idTorneo } = req.params;
      const { nombre } = req.body;

      if (!nombre) return res.status(400).json({ error: 'El campo nombre es requerido' });

      const torneo = await db.get(`SELECT id_torneo FROM torneo WHERE id_torneo = ?`, [idTorneo]);
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      const idEquipo = uuidv4();
      await db.transaction(async (trx) => {
        await trx.run(
          `INSERT INTO equipo (id_equipo, nombre, logo, fecha_creacion, id_color1, id_color2, id_color3, id_categoria, id_modalidad, id_genero)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [idEquipo, nombre, null, new Date().toISOString().split('T')[0], 1, 2, 1, 1, 1, 1]
        );
        await trx.run(
          `INSERT INTO torneo_equipo (id_equipo, id_torneo, posicion, cantidad_combates, cantidad_victorias, cantidad_derrotas, cantidad_rounds_ganados, cantidad_rounds_perdidos)
           VALUES (?, ?, NULL, 0, 0, 0, 0, 0)`,
          [idEquipo, idTorneo]
        );
      });

      res.status(201).json({ id: idEquipo, nombre, mensaje: 'Equipo coalición creado' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  eliminarEquipo: async (req, res) => {
    try {
      const { idTorneo, idEquipo } = req.params;

      await db.transaction(async (trx) => {
        await trx.run(`DELETE FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ?`, [idTorneo, idEquipo]);
        await trx.run(`DELETE FROM equipos_por_grupo WHERE id_torneo = ? AND id_equipo = ?`, [idTorneo, idEquipo]);
        await trx.run(`DELETE FROM torneo_equipo WHERE id_torneo = ? AND id_equipo = ?`, [idTorneo, idEquipo]);
      });

      res.json({ mensaje: 'Equipo eliminado del torneo' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  inscribirPeleador: async (req, res) => {
    try {
      const { idTorneo, idEquipo } = req.params;
      const { idUsuario } = req.body;

      if (!idUsuario) return res.status(400).json({ error: 'idUsuario es requerido' });

      const user = await db.get(`SELECT id_usuario FROM usuario WHERE id_usuario = ?`, [idUsuario]);
      if (!user) return res.status(404).json({ error: 'Peleador no encontrado' });

      const te = await db.get(
        `SELECT id_equipo FROM torneo_equipo WHERE id_torneo = ? AND id_equipo = ?`,
        [idTorneo, idEquipo]
      );
      if (!te) return res.status(404).json({ error: 'Equipo no inscripto en el torneo' });

      const enOtro = await db.get(
        `SELECT e.nombre FROM torneo_equipo_peleador tep
         JOIN equipo e ON tep.id_equipo = e.id_equipo
         WHERE tep.id_torneo = ? AND tep.id_usuario = ? AND tep.id_equipo != ?`,
        [idTorneo, idUsuario, idEquipo]
      );
      if (enOtro) {
        return res.status(409).json({ error: `El peleador ya está inscripto en el equipo "${enOtro.nombre}"` });
      }

      const ya = await db.get(
        `SELECT id_usuario FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
        [idTorneo, idEquipo, idUsuario]
      );
      if (ya) {
        return res.json({ idUsuario, mensaje: 'Peleador ya inscripto' });
      }

      await db.run(
        `INSERT INTO torneo_equipo_peleador (id_torneo, id_equipo, id_usuario, numero_peleador, cantidad_amarillas, descalificado)
         VALUES (?, ?, ?, 0, 0, 0)`,
        [idTorneo, idEquipo, idUsuario]
      );

      res.status(201).json({ idUsuario, mensaje: 'Peleador inscripto exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  eliminarPeleador: async (req, res) => {
    try {
      const { idTorneo, idEquipo, idUsuario } = req.params;

      await db.run(
        `DELETE FROM torneo_equipo_peleador WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
        [idTorneo, idEquipo, idUsuario]
      );

      res.json({ mensaje: 'Peleador eliminado' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  guardarNumerosPeleadores: async (req, res) => {
    try {
      const { idTorneo } = req.params;
      const { numeros } = req.body;

      if (!Array.isArray(numeros)) {
        return res.status(400).json({ error: 'El campo numeros es requerido' });
      }

      await db.transaction(async (trx) => {
        for (const n of numeros) {
          await trx.run(
            `UPDATE torneo_equipo_peleador SET numero_peleador = ? WHERE id_torneo = ? AND id_equipo = ? AND id_usuario = ?`,
            [n.numeroPeleador || 0, idTorneo, n.idEquipo, n.idUsuario]
          );
        }
      });

      res.json({ mensaje: 'Números guardados exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  getGrupos: async (req, res) => {
    try {
      const { idTorneo } = req.params;

      const rows = await db.all(
        `SELECT id_equipo AS idEquipo, grupo FROM equipos_por_grupo WHERE id_torneo = ? ORDER BY grupo`,
        [idTorneo]
      );

      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  guardarGrupos: async (req, res) => {
    try {
      const { idTorneo } = req.params;
      const { grupos } = req.body;

      if (!Array.isArray(grupos)) {
        return res.status(400).json({ error: 'El campo grupos es requerido' });
      }

      await db.transaction(async (trx) => {
        await trx.run(`DELETE FROM equipos_por_grupo WHERE id_torneo = ?`, [idTorneo]);
        for (const g of grupos) {
          await trx.run(
            `INSERT OR REPLACE INTO equipos_por_grupo (id_torneo, id_equipo, grupo) VALUES (?, ?, ?)`,
            [idTorneo, g.idEquipo, g.grupo]
          );
        }
      });

      res.json({ mensaje: 'Grupos guardados exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },

  getEstadisticas: async (req, res) => {
    try {
      const { idTorneo } = req.params;

      const torneo = await db.get(`SELECT id_torneo, nombre FROM torneo WHERE id_torneo = ?`, [idTorneo]);
      if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

      const equipos = await db.all(
        `SELECT te.id_equipo AS id, e.nombre, e.logo, te.posicion,
                COALESCE(te.cantidad_combates, 0) AS combates,
                COALESCE(te.cantidad_victorias, 0) AS victorias,
                COALESCE(te.cantidad_derrotas, 0) AS derrotas,
                COALESCE(te.cantidad_rounds_ganados, 0) AS roundsGanados,
                COALESCE(te.cantidad_rounds_perdidos, 0) AS roundsPerdidos,
                epg.grupo
         FROM torneo_equipo te
         JOIN equipo e ON te.id_equipo = e.id_equipo
         LEFT JOIN equipos_por_grupo epg ON epg.id_torneo = te.id_torneo AND epg.id_equipo = te.id_equipo
         WHERE te.id_torneo = ?
         ORDER BY te.cantidad_victorias DESC, te.cantidad_derrotas ASC, te.cantidad_rounds_ganados DESC`,
        [idTorneo]
      );

      const peleadores = await db.all(
        `SELECT tl.id_usuario AS idUsuario, u.nombre, u.apellido,
                tep.id_equipo AS idEquipo, e.nombre AS equipo,
                tl.cantidad_combates AS combates, tl.cantidad_puntos AS puntos,
                tl.cantidad_victorias AS victorias, tl.cantidad_derrotas AS derrotas,
                tl.cantidad_rounds_ganados AS roundsGanados, tl.cantidad_rounds_perdidos AS roundsPerdidos,
                tl.cantidad_rounds_en_pie AS roundsEnPie
         FROM torneo_luchador tl
         JOIN usuario u ON tl.id_usuario = u.id_usuario
         JOIN torneo_equipo_peleador tep ON tep.id_torneo = tl.id_torneo AND tep.id_usuario = tl.id_usuario
         JOIN equipo e ON tep.id_equipo = e.id_equipo
         WHERE tl.id_torneo = ?
         ORDER BY tl.cantidad_victorias DESC`,
        [idTorneo]
      );

      res.json({ idTorneo, nombre: torneo.nombre, equipos, peleadores });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  },
};

module.exports = marshallsController;
