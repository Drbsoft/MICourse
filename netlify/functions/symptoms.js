'use strict';

const { createClient } = require('@libsql/client');

// ── Haversine distance in km ─────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Tábla inicializálása (első hívásnál fut le) ──────────────────────────────
async function initDb(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS symptoms (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      latitude  REAL    NOT NULL,
      longitude REAL    NOT NULL,
      headache  INTEGER NOT NULL CHECK(headache BETWEEN 0 AND 10),
      fatigue   INTEGER NOT NULL CHECK(fatigue  BETWEEN 0 AND 10)
    )
  `);
  await db.execute(
    'CREATE INDEX IF NOT EXISTS idx_timestamp ON symptoms(timestamp)'
  );
}

// ── Közeli hasonló bejegyzések lekérdezése ───────────────────────────────────
async function queryNearby(db, lat, lon, headache, fatigue) {
  const cutoff    = Date.now() - 24 * 60 * 60 * 1000; // utolsó 24 óra
  const radii     = [30, 60, 70];
  const MIN_COUNT = 3;

  let finalCount  = 0;
  let finalRadius = radii[0];

  for (const radius of radii) {
    const boxDeg = radius / 111; // ~1° ≈ 111 km

    const { rows } = await db.execute({
      sql: `SELECT latitude, longitude, headache, fatigue
            FROM   symptoms
            WHERE  timestamp  > :cutoff
              AND  latitude   BETWEEN :latMin AND :latMax
              AND  longitude  BETWEEN :lonMin AND :lonMax`,
      args: {
        cutoff,
        latMin: lat - boxDeg,
        latMax: lat + boxDeg,
        lonMin: lon - boxDeg,
        lonMax: lon + boxDeg,
      },
    });

    const count = rows.filter(row =>
      haversineKm(lat, lon, row.latitude, row.longitude) <= radius &&
      Math.abs(row.headache - headache) <= 2 &&
      Math.abs(row.fatigue  - fatigue)  <= 2
    ).length;

    finalCount  = count;
    finalRadius = radius;

    if (count >= MIN_COUNT) break;
  }

  let category, message;
  if (finalCount === 0) {
    category = 'none';
    message  = 'Senki más nem jelzett hasonló tüneteket a közeledben.';
  } else if (finalCount <= 3) {
    category = 'few';
    message  = 'Néhányan érzik így magukat a közeledben.';
  } else if (finalCount <= 10) {
    category = 'some';
    message  = 'Közepesen sokan érzik így magukat a közeledben.';
  } else {
    category = 'many';
    message  = 'Sokan érzik így magukat a közeledben!';
  }

  return { count: finalCount, radius: finalRadius, category, message };
}

// ── Netlify Function handler ─────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Érvénytelen JSON.' }),
    };
  }

  const { latitude, longitude, headache, fatigue } = body;

  const valid =
    typeof latitude  === 'number' && latitude  >= -90  && latitude  <= 90  &&
    typeof longitude === 'number' && longitude >= -180 && longitude <= 180 &&
    typeof headache  === 'number' && headache  >= 0    && headache  <= 10  &&
    typeof fatigue   === 'number' && fatigue   >= 0    && fatigue   <= 10;

  if (!valid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Érvénytelen adatok.' }),
    };
  }

  const h = Math.round(headache);
  const f = Math.round(fatigue);

  const db = createClient({
    url:       process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  await initDb(db);

  // Lekérdezés ELŐBB, hogy a saját beküldés ne számítson bele
  const result = await queryNearby(db, latitude, longitude, h, f);

  await db.execute({
    sql:  'INSERT INTO symptoms (timestamp, latitude, longitude, headache, fatigue) VALUES (?, ?, ?, ?, ?)',
    args: [Date.now(), latitude, longitude, h, f],
  });

  return {
    statusCode: 200,
    headers:    { 'Content-Type': 'application/json' },
    body:       JSON.stringify(result),
  };
};
