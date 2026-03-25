'use strict';

const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

// ── Query nearby similar entries (query BEFORE insert to exclude own entry) ──
function queryNearby(lat, lon, headache, fatigue) {
  const cutoff    = Date.now() - 24 * 60 * 60 * 1000; // last 24 hours
  const radii     = [30, 60, 70];
  const MIN_COUNT = 3;

  const stmt = db.prepare(`
    SELECT latitude, longitude, headache, fatigue
    FROM   symptoms
    WHERE  timestamp  > ?
      AND  latitude   BETWEEN ? AND ?
      AND  longitude  BETWEEN ? AND ?
  `);

  let finalCount  = 0;
  let finalRadius = radii[0];

  for (const radius of radii) {
    const boxDeg = radius / 111; // ~1° ≈ 111 km

    const candidates = stmt.all(
      cutoff,
      lat - boxDeg, lat + boxDeg,
      lon - boxDeg, lon + boxDeg
    );

    const count = candidates.filter(row =>
      haversineKm(lat, lon, row.latitude, row.longitude) <= radius &&
      Math.abs(row.headache - headache) <= 2 &&
      Math.abs(row.fatigue  - fatigue)  <= 2
    ).length;

    finalCount  = count;
    finalRadius = radius;

    if (count >= MIN_COUNT) break; // enough data – stop expanding
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

// ── POST /api/symptoms ───────────────────────────────────────────────────────
app.post('/api/symptoms', (req, res) => {
  const { latitude, longitude, headache, fatigue } = req.body ?? {};

  const valid =
    typeof latitude  === 'number' && latitude  >= -90  && latitude  <= 90  &&
    typeof longitude === 'number' && longitude >= -180 && longitude <= 180 &&
    typeof headache  === 'number' && headache  >= 0    && headache  <= 10  &&
    typeof fatigue   === 'number' && fatigue   >= 0    && fatigue   <= 10;

  if (!valid) {
    return res.status(400).json({ error: 'Érvénytelen adatok.' });
  }

  const h = Math.round(headache);
  const f = Math.round(fatigue);

  // Query BEFORE inserting so the caller's own entry is not counted
  const result = queryNearby(latitude, longitude, h, f);

  db.prepare(
    'INSERT INTO symptoms (timestamp, latitude, longitude, headache, fatigue) VALUES (?, ?, ?, ?, ?)'
  ).run(Date.now(), latitude, longitude, h, f);

  res.json(result);
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Fejfajas.hu szerver fut → http://localhost:${PORT}`);
});
