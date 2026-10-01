'use strict';

/*
 * Equipment endpoints — all queries parameterized (Phase 2 explicitly
 * forbids SQL injection here; the one intentional injection arrives with
 * the reservation search in Phase 3).
 *
 * All protected endpoints are POST (the RC4 envelope travels in the
 * request body; fetch clients cannot send GET bodies):
 *
 *   POST /api/equipment/list    {token, status?, locationId?, q?}
 *   POST /api/equipment/get     {token, id}
 *   POST /api/equipment/create  {token, assetTag, name, category, locationId, ...}  (admin)
 *   POST /api/equipment/update  {token, id, status?, firmwareVersion?}              (technician, admin)
 */
const express = require('express');
const { query } = require('../db');
const { requireRole } = require('../requireAuth');

const router = express.Router();

const SELECT_LIST = `
  SELECT e.id,
         e.asset_tag        AS "assetTag",
         e.name,
         e.category,
         e.status,
         e.firmware_version AS "firmwareVersion",
         e.diagnostic_target AS "diagnosticTarget",
         e.last_seen_at     AS "lastSeenAt",
         e.location_id      AS "locationId",
         l.label            AS "locationLabel",
         l.building         AS "building",
         l.room             AS "room"
    FROM equipment e
    JOIN locations l ON l.id = e.location_id
`;

router.post('/list', async (req, res, next) => {
  try {
    const { status, locationId, q } = req.body || {};
    const filters = [];
    const params = [];
    if (typeof status === 'string' && status.length > 0) {
      params.push(status);
      filters.push(`e.status = $${params.length}`);
    }
    if (Number.isInteger(locationId)) {
      params.push(locationId);
      filters.push(`e.location_id = $${params.length}`);
    }
    if (typeof q === 'string' && q.length > 0) {
      params.push(`%${q}%`);
      filters.push(`(e.name ILIKE $${params.length} OR e.asset_tag ILIKE $${params.length})`);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await query(`${SELECT_LIST} ${where} ORDER BY e.asset_tag`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/get', async (req, res, next) => {
  try {
    const id = (req.body || {}).id;
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'validation_failed', message: 'id must be an integer' });
    }
    const { rows } = await query(`${SELECT_LIST} WHERE e.id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/create', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.assetTag || !b.name || !b.category || !Number.isInteger(b.locationId)) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'assetTag, name, category and integer locationId are required'
      });
    }
    try {
      const { rows } = await query(
        `INSERT INTO equipment (asset_tag, name, category, location_id, status, firmware_version, diagnostic_target)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, asset_tag AS "assetTag", name, category, status,
                   firmware_version AS "firmwareVersion", diagnostic_target AS "diagnosticTarget",
                   location_id AS "locationId"`,
        [
          b.assetTag,
          b.name,
          b.category,
          b.locationId,
          b.status || 'available',
          b.firmwareVersion || null,
          b.diagnosticTarget || null
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'conflict', message: 'assetTag already exists' });
      if (err.code === '23503') return res.status(400).json({ error: 'invalid_reference', message: 'unknown locationId' });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

router.post('/update', requireRole('technician', 'admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!Number.isInteger(b.id)) {
      return res.status(400).json({ error: 'validation_failed', message: 'id must be an integer' });
    }
    const sets = [];
    const params = [];
    if (b.status !== undefined) {
      params.push(b.status);
      sets.push(`status = $${params.length}`);
    }
    if (b.firmwareVersion !== undefined) {
      params.push(b.firmwareVersion);
      sets.push(`firmware_version = $${params.length}`);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'nothing to update (status, firmwareVersion)' });
    }
    params.push(b.id);
    try {
      const { rows } = await query(
        `UPDATE equipment SET ${sets.join(', ')}
          WHERE id = $${params.length}
          RETURNING id, asset_tag AS "assetTag", name, category, status,
                    firmware_version AS "firmwareVersion", diagnostic_target AS "diagnosticTarget",
                    location_id AS "locationId"`,
        params
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found' });
      }
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23514') return res.status(400).json({ error: 'validation_failed', message: 'invalid status value' });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
