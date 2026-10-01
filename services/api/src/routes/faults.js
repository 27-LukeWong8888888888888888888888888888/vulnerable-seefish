'use strict';

/*
 * Fault-report endpoints. All protected endpoints are POST (the RC4
 * envelope travels in the request body; fetch clients cannot send GET
 * bodies).
 *
 *   POST /api/fault-reports/list    {token}                       tech/admin: all;
 *                                                                 student: own only
 *   POST /api/fault-reports/create  {token, equipmentId, title, description?, severity?}
 *                                                                 any authenticated user
 *   POST /api/fault-reports/update  {token, id, status?, resolution?}
 *                                                                 technician, admin
 *
 * All queries parameterized — Phase 2 must not introduce SQL injection.
 */
const express = require('express');
const { query } = require('../db');
const { requireRole } = require('../requireAuth');

const router = express.Router();

const SELECT_LIST = `
  SELECT f.id,
         f.equipment_id   AS "equipmentId",
         e.asset_tag      AS "assetTag",
         f.reported_by    AS "reportedBy",
         u.username       AS "reportedByUsername",
         f.title,
         f.description,
         f.severity,
         f.status,
         f.resolution,
         f.created_at     AS "createdAt"
    FROM fault_reports f
    JOIN equipment e ON e.id = f.equipment_id
    JOIN users u     ON u.id = f.reported_by
`;

router.post('/list', async (req, res, next) => {
  try {
    if (req.user.role === 'student') {
      const { rows } = await query(
        `${SELECT_LIST} WHERE f.reported_by = $1 ORDER BY f.created_at DESC`,
        [req.user.userId]
      );
      return res.json(rows);
    }
    const { rows } = await query(`${SELECT_LIST} ORDER BY f.created_at DESC`);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/create', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!Number.isInteger(b.equipmentId) || !b.title || typeof b.title !== 'string') {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'integer equipmentId and title are required'
      });
    }
    const severity = ['low', 'medium', 'high', 'critical'].includes(b.severity) ? b.severity : 'medium';
    try {
      const { rows } = await query(
        `INSERT INTO fault_reports (equipment_id, reported_by, title, description, severity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, equipment_id AS "equipmentId", reported_by AS "reportedBy",
                   title, description, severity, status, resolution, created_at AS "createdAt"`,
        [b.equipmentId, req.user.userId, b.title, b.description || null, severity]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23503') return res.status(400).json({ error: 'invalid_reference', message: 'unknown equipmentId' });
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
    if (b.resolution !== undefined) {
      params.push(b.resolution);
      sets.push(`resolution = $${params.length}`);
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'nothing to update (status, resolution)' });
    }
    params.push(b.id);
    try {
      const { rows } = await query(
        `UPDATE fault_reports SET ${sets.join(', ')}
          WHERE id = $${params.length}
          RETURNING id, equipment_id AS "equipmentId", reported_by AS "reportedBy",
                    title, description, severity, status, resolution, created_at AS "createdAt"`,
        params
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'not_found' });
      }
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23514') return res.status(400).json({ error: 'validation_failed', message: 'invalid status or severity value' });
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
