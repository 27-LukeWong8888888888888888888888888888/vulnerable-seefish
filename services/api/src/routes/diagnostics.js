'use strict';

/*
 * Equipment diagnostics (Phase 5) — both endpoints fetch a URL SERVER-SIDE
 * and record a diagnostic_runs row.
 *
 *   POST /api/diagnostics/run    (technician, admin)
 *       { equipmentId } — intended behaviour: the server fetches the
 *       equipment's CONFIGURED diagnostic_target from the database. The
 *       caller does not choose the URL.
 *
 *   POST /api/diagnostics/fetch  (technician, admin)
 *       { equipmentId, target } — VULN-V3: INTENTIONAL SSRF. `target` comes
 *       from the request body and is fetched by the server with NO
 *       allowlist and NO loopback / private-range / link-local blocking
 *       (redirects are followed). A technician can therefore make the
 *       server reach anything the api container can reach — including the
 *       internal-only lab device. Synthetic coursework vuln — do not fix.
 *
 * The fetched body is returned to the caller in full (capped), which is
 * what makes the internal device challenge retrievable through the API.
 */
const express = require('express');
const { query } = require('../db');
const { requireRole } = require('../requireAuth');

const router = express.Router();

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_CHARS = 100000;

const EQUIPMENT_SELECT = `
  SELECT e.id, e.asset_tag AS "assetTag", e.name, e.diagnostic_target AS "diagnosticTarget"
    FROM equipment e
`;

async function lookupEquipment(equipmentId) {
  const { rows } = await query(`${EQUIPMENT_SELECT} WHERE e.id = $1`, [equipmentId]);
  return rows[0] || null;
}

async function fetchTarget(target) {
  const started = Date.now();
  // VULN-V3 (fetch endpoint): `target` is caller-controlled and there is
  // deliberately no URL validation here — no scheme/host allowlist, no
  // loopback or private-range blocking. Redirects are followed.
  const resp = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const text = (await resp.text()).slice(0, MAX_BODY_CHARS);
  return { resp, text, durationMs: Date.now() - started };
}

async function recordRun({ equipmentId, userId, kind, target, responseBody, status, durationMs }) {
  await query(
    `INSERT INTO diagnostic_runs (equipment_id, requested_by, kind, target, response_body, status, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [equipmentId, userId, kind, target, responseBody, status, durationMs]
  );
}

router.post('/run', requireRole('technician', 'admin'), async (req, res, next) => {
  try {
    const equipmentId = (req.body || {}).equipmentId;
    if (!Number.isInteger(equipmentId)) {
      return res.status(400).json({ error: 'validation_failed', message: 'equipmentId must be an integer' });
    }
    const eq = await lookupEquipment(equipmentId);
    if (!eq) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (!eq.diagnosticTarget) {
      return res.status(400).json({ error: 'no_diagnostic_target', message: 'equipment has no configured diagnostic target' });
    }
    try {
      const { resp, text, durationMs } = await fetchTarget(eq.diagnosticTarget);
      await recordRun({
        equipmentId, userId: req.user.userId, kind: 'run',
        target: eq.diagnosticTarget, responseBody: text, status: 'completed', durationMs
      });
      if (resp.ok) {
        await query('UPDATE equipment SET last_seen_at = now() WHERE id = $1', [equipmentId]);
      }
      return res.json({
        equipmentId: eq.id, assetTag: eq.assetTag, target: eq.diagnosticTarget,
        httpStatus: resp.status, body: text, durationMs
      });
    } catch (err) {
      await recordRun({
        equipmentId, userId: req.user.userId, kind: 'run',
        target: eq.diagnosticTarget, responseBody: null, status: 'failed', durationMs: null
      });
      return res.status(502).json({ error: 'fetch_failed', message: String((err && err.message) || err) });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/fetch', requireRole('technician', 'admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!Number.isInteger(b.equipmentId)) {
      return res.status(400).json({ error: 'validation_failed', message: 'equipmentId must be an integer' });
    }
    const eq = await lookupEquipment(b.equipmentId);
    if (!eq) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (typeof b.target !== 'string' || b.target.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'target URL is required' });
    }
    try {
      const { resp, text, durationMs } = await fetchTarget(b.target);
      await recordRun({
        equipmentId: eq.id, userId: req.user.userId, kind: 'fetch',
        target: b.target, responseBody: text, status: 'completed', durationMs
      });
      return res.json({
        equipmentId: eq.id, assetTag: eq.assetTag, target: b.target,
        httpStatus: resp.status, body: text, durationMs
      });
    } catch (err) {
      await recordRun({
        equipmentId: eq.id, userId: req.user.userId, kind: 'fetch',
        target: b.target, responseBody: null, status: 'failed', durationMs: null
      });
      return res.status(502).json({ error: 'fetch_failed', message: String((err && err.message) || err) });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
