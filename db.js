'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'symptoms.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS symptoms (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    latitude  REAL    NOT NULL,
    longitude REAL    NOT NULL,
    headache  INTEGER NOT NULL CHECK(headache BETWEEN 0 AND 10),
    fatigue   INTEGER NOT NULL CHECK(fatigue  BETWEEN 0 AND 10)
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_timestamp ON symptoms(timestamp)`);

module.exports = db;
