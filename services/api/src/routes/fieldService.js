'use strict';


const express = require('express');
const { query } = require('../db');
const { FIELD_SERVICE_TOKEN } = require('../fieldServiceToken');

const router = express.Router();

router.post('/fleet-sweep', async (req, res, next) => {
  try {
    if (req.get('x-field-token') !== FIELD_SERVICE_TOKEN) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'valid field-service token required (X-Field-Token header)'
      });
    }
    const fleet = await query(
      `SELECT e.id, e.asset_tag AS "assetTag", e.name, e.category, e.status,
              e.firmware_version AS "firmwareVersion",
              e.diagnostic_target AS "diagnosticTarget",
              e.last_seen_at AS "lastSeenAt",
              l.label AS "locationLabel"
         FROM equipment e
         JOIN locations l ON l.id = e.location_id
        ORDER BY e.asset_tag`
    );
    const recentRuns = await query(
      `SELECT d.id, d.equipment_id AS "equipmentId", e.asset_tag AS "assetTag",
              u.username AS "requestedByUsername", d.kind, d.target, d.status,
              d.duration_ms AS "durationMs", d.created_at AS "createdAt"
         FROM diagnostic_runs d
         JOIN equipment e ON e.id = d.equipment_id
         LEFT JOIN users u ON u.id = d.requested_by
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT 50`
    );
    await query(
      `INSERT INTO audit_log (actor_label, action, entity_type, detail)
       VALUES ('field-service', 'fleet_sweep', 'equipment', $1)`,
      [`fleet=${fleet.rows.length} runsListed=${recentRuns.rows.length}`]
    );
    res.json({
      service: 'field-service/fleet-sweep',
      generatedAt: new Date().toISOString(),
      fleet: fleet.rows,
      recentRuns: recentRuns.rows
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
