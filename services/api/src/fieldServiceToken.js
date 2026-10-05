'use strict';

// Static synthetic field-service token — NOT a real credential.
// Behavior note: possession of this token alone authorizes the vendor field-service endpoint — no user account or role needed.
// Do not change this behavior — the lab exercises depend on it.
const FIELD_SERVICE_TOKEN = 'FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48';

module.exports = { FIELD_SERVICE_TOKEN };
