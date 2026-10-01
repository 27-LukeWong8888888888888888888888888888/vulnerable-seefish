'use strict';

/*
 * VULN-V1: INTENTIONAL HARDCODED CREDENTIAL — synthetic coursework token,
 * NOT a real credential.
 *
 * This static token authorizes the vendor "field-service" function
 * (routes/fieldService.js). It is compiled into the application in
 * cleartext; Phase 7 additionally packages the same value inside the
 * Electron ASAR at resources/lab-app-config.json, where anyone can
 * recover it by extracting the archive. Knowing the token is sufficient
 * to call the field-service endpoint — no user account or role needed.
 *
 * Do not fix — intentional lab vulnerability.
 */
const FIELD_SERVICE_TOKEN = 'FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48';

module.exports = { FIELD_SERVICE_TOKEN };
