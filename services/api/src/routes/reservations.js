'use strict';

/*
 * Reservation endpoints. All protected endpoints are POST (the RC4 envelope
 * travels in the request body; fetch clients cannot send GET bodies).
 *
 *   POST /api/reservations/list     {token, status?, equipmentId?}
 *                                   students: own only; technicians/admins: all
 *   POST /api/reservations/create   {token, equipmentId, startsAt, endsAt, purpose?}
 *                                   any authenticated user, booked for self
 *   POST /api/reservations/update   {token, id, purpose?, status?, startsAt?, endsAt?}
 *                                   owner (cancel/edit own) or technician/admin
 *   POST /api/reservations/history  {token}
 *                                   ended / cancelled / completed reservations
 *   POST /api/reservations/search   {token, q}   *** INTENTIONALLY VULNERABLE ***
 *
 * Every query in this file is parameterized EXCEPT the reservation search,
 * which carries lab vulnerability V2 (string-concatenated `q`). Keep it that
 * way: no other endpoint in the application may build SQL by concatenation.
 */
const express = require('express');
const { query } = require('../db');

const router = express.Router();

const SELECT_LIST = `
  SELECT r.id,
         r.equipment_id   AS "equipmentId",
         e.asset_tag      AS "assetTag",
         e.name           AS "equipmentName",
         r.user_id        AS "userId",
         u.username       AS "ownerUsername",
         u.display_name   AS "ownerDisplayName",
         r.starts_at      AS "startsAt",
         r.ends_at        AS "endsAt",
         r.purpose,
         r.status,
         r.created_at     AS "createdAt"
    FROM reservations r
    JOIN equipment e ON e.id = r.equipment_id
    JOIN users u     ON u.id = r.user_id
`;

function parseDate(value, name) {
  if (typeof value !== 'string' || value.length === 0) return { error: `${name} must be an ISO-8601 timestamp` };
  const t = Date.parse(value);
  if (Number.isNaN(t)) return { error: `${name} must be an ISO-8601 timestamp` };
  return { value: new Date(t).toISOString() };
}

async function getReservation(id) {
  const { rows } = await query(`${SELECT_LIST} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

router.post('/list', async (req, res, next) => {
  try {
    const { status, equipmentId } = req.body || {};
    const filters = [];
    const params = [];
    if (req.user.role === 'student') {
      params.push(req.user.userId);
      filters.push(`r.user_id = $${params.length}`);
    }
    if (typeof status === 'string' && status.length > 0) {
      params.push(status);
      filters.push(`r.status = $${params.length}`);
    }
    if (Number.isInteger(equipmentId)) {
      params.push(equipmentId);
      filters.push(`r.equipment_id = $${params.length}`);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await query(`${SELECT_LIST} ${where} ORDER BY r.starts_at DESC`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/create', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!Number.isInteger(b.equipmentId)) {
      return res.status(400).json({ error: 'validation_failed', message: 'integer equipmentId is required' });
    }
    const starts = parseDate(b.startsAt, 'startsAt');
    if (starts.error) return res.status(400).json({ error: 'validation_failed', message: starts.error });
    const ends = parseDate(b.endsAt, 'endsAt');
    if (ends.error) return res.status(400).json({ error: 'validation_failed', message: ends.error });
    if (ends.value <= starts.value) {
      return res.status(400).json({ error: 'validation_failed', message: 'endsAt must be after startsAt' });
    }
    try {
      const { rows } = await query(
        `INSERT INTO reservations (equipment_id, user_id, starts_at, ends_at, purpose)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [b.equipmentId, req.user.userId, starts.value, ends.value, b.purpose || null]
      );
      res.status(201).json(await getReservation(rows[0].id));
    } catch (err) {
      if (err.code === '23503') return res.status(400).json({ error: 'invalid_reference', message: 'unknown equipmentId' });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.post('/update', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!Number.isInteger(b.id)) {
      return res.status(400).json({ error: 'validation_failed', message: 'id must be an integer' });
    }
    const existing = await getReservation(b.id);
    if (!existing) {
      return res.status(404).json({ error: 'not_found' });
    }
    const isOwner = req.user.userId === existing.userId;
    if (!isOwner && req.user.role === 'student') {
      return res.status(403).json({ error: 'forbidden', message: 'students may only modify their own reservations' });
    }

    const sets = [];
    const params = [];
    if (b.purpose !== undefined) {
      params.push(b.purpose);
      sets.push(`purpose = $${params.length}`);
    }
    if (b.startsAt !== undefined) {
      const starts = parseDate(b.startsAt, 'startsAt');
      if (starts.error) return res.status(400).json({ error: 'validation_failed', message: starts.error });
      params.push(starts.value);
      sets.push(`starts_at = $${params.length}`);
    }
    if (b.endsAt !== undefined) {
      const ends = parseDate(b.endsAt, 'endsAt');
      if (ends.error) return res.status(400).json({ error: 'validation_failed', message: ends.error });
      params.push(ends.value);
      sets.push(`ends_at = $${params.length}`);
    }
    if (b.status !== undefined) {
      // Students may only ever cancel; staff (and non-student owners) set any.
      if (req.user.role === 'student' && b.status !== 'cancelled') {
        return res.status(403).json({ error: 'forbidden', message: 'students may only cancel their own reservations' });
      }
      params.push(b.status);
      sets.push(`status = $${params.length}`);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'nothing to update (purpose, status, startsAt, endsAt)' });
    }
    params.push(b.id);
    try {
      await query(`UPDATE reservations SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
      res.json(await getReservation(b.id));
    } catch (err) {
      if (err.code === '23514') return res.status(400).json({ error: 'validation_failed', message: 'invalid status value' });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.post('/history', async (req, res, next) => {
  try {
    const params = [];
    let scope = '';
    if (req.user.role === 'student') {
      params.push(req.user.userId);
      scope = `r.user_id = $${params.length} AND `;
    }
    const { rows } = await query(
      `${SELECT_LIST}
        WHERE ${scope}(r.status IN ('cancelled', 'completed') OR r.ends_at < now())
        ORDER BY r.starts_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/*
 * V2 — INTENTIONAL SQL INJECTION (coursework vulnerability; do not "fix").
 *
 * The `q` parameter is concatenated straight into the SQL string. The search
 * is meant to return only the caller's own reservations; the classic
 * `x' OR 1=1 -- ` payload breaks out of that scoping and returns every user's
 * reservations — see docs/vulnerabilities/V2-SQL-INJECTION.md and
 * scripts/poc-v2-sqli.js. Everything else in this file is parameterized.
 */
router.post('/search', async (req, res, next) => {
  try {
    const q = (req.body || {}).q;
    if (typeof q !== 'string' || q.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'q is required' });
    }
    const { rows } = await query(
      // VULN-V2: INTENTIONAL SQL INJECTION — `q` concatenated unescaped.
      `${SELECT_LIST}
        WHERE r.user_id = $1 AND r.purpose ILIKE '%${q}%'
        ORDER BY r.starts_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
