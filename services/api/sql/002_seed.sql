-- Campus Laboratory Booking — seed data (Phase 1)
-- All values are synthetic. Times are UTC.

-- Seed IDs are deterministic:
--   users:      1 admin, 2 tech1, 3 tech2, 4 alice, 5 bob, 6 carol, 7 dave, 8 erin, 9 frank
--   equipment:  1..12 = EQ-1001..EQ-1012

INSERT INTO users (username, display_name, role, password_hash) VALUES
  ('admin', 'Lab Administrator', 'admin',      crypt('AdminPass!23',   gen_salt('bf'))),
  ('tech1', 'Tina Torres',       'technician', crypt('TechPass!23',    gen_salt('bf'))),
  ('tech2', 'Tom Tek',           'technician', crypt('TechPass!23',    gen_salt('bf'))),
  ('alice', 'Alice Anderson',    'student',    crypt('StudentPass!23', gen_salt('bf'))),
  ('bob',   'Bob Baker',         'student',    crypt('StudentPass!23', gen_salt('bf'))),
  ('carol', 'Carol Chen',        'student',    crypt('StudentPass!23', gen_salt('bf'))),
  ('dave',  'Dave Diaz',         'student',    crypt('StudentPass!23', gen_salt('bf'))),
  ('erin',  'Erin Evans',        'student',    crypt('StudentPass!23', gen_salt('bf'))),
  ('frank', 'Frank Fisher',      'student',    crypt('StudentPass!23', gen_salt('bf')));

INSERT INTO locations (id, building, room, label) VALUES
  (1, 'Bldg C', '214', 'Bldg C — 214 (Environmental Lab)'),
  (2, 'Bldg C', '220', 'Bldg C — 220 (Bio Lab)'),
  (3, 'Bldg D', '105', 'Bldg D — 105 (Electronics Lab)'),
  (4, 'Bldg E', '310', 'Bldg E — 310 (Fabrication Lab)');

-- EQ-1001 is the simulated internal lab device that arrives in Phase 4; the
-- rest are synthetic campus addresses that later demonstrate the missing
-- SSRF allowlist (Phase 5).
INSERT INTO equipment (id, asset_tag, name, category, location_id, status, firmware_version, diagnostic_target) VALUES
  (1,  'EQ-1001', 'Environmental Chamber XL',  'environmental',   1, 'available',  '3.1.7-lab', 'http://lab-device:8080/api/status'),
  (2,  'EQ-1002', 'DNA Sequencer 4500',       'sequencing',      2, 'available',  '2.9.1',     'http://10.20.30.41:8080/api/status'),
  (3,  'EQ-1003', 'UV-VIS Spectrometer',      'spectroscopy',    2, 'available',  '5.0.2',     'http://10.20.30.42:8080/api/status'),
  (4,  'EQ-1004', 'Digital Oscilloscope 200MHz', 'electronics',  3, 'maintenance','1.4.0',     'http://10.20.30.43:8080/api/status'),
  (5,  'EQ-1005', 'FDM 3D Printer Pro',       'fabrication',     4, 'available',  '4.2.0',     'http://10.20.30.44:8080/api/status'),
  (6,  'EQ-1006', 'High-Speed Centrifuge',    'centrifugation',  2, 'available',  '2.0.8',     'http://10.20.30.45:8080/api/status'),
  (7,  'EQ-1007', 'Fluorescence Microscope',  'microscopy',      2, 'reserved',   '6.1.3',     'http://10.20.30.46:8080/api/status'),
  (8,  'EQ-1008', 'PCR Thermal Cycler',       'pcr',             2, 'available',  '3.3.3',     'http://10.20.30.47:8080/api/status'),
  (9,  'EQ-1009', 'Desktop CNC Mill',         'fabrication',     4, 'maintenance','1.9.9',     'http://10.20.30.48:8080/api/status'),
  (10, 'EQ-1010', 'Signal Generator 3GHz',    'electronics',     3, 'available',  '2.2.1',     'http://10.20.30.49:8080/api/status'),
  (11, 'EQ-1011', 'CO2 Incubator',            'incubation',      2, 'available',  '1.1.5',     'http://10.20.30.50:8080/api/status'),
  (12, 'EQ-1012', 'Laser Cutter 60W',         'fabrication',     4, 'retired',    '7.7.0',     'http://10.20.30.51:8080/api/status');

-- 32 reservations, deliberately cross-user. Row 13 (alice, EQ-1002,
-- "Senior project: DNA sequencer calibration") is the seeded proof row that
-- lab vulnerability V2 must let another user retrieve (Phase 3).
INSERT INTO reservations (equipment_id, user_id, starts_at, ends_at, purpose, status) VALUES
  (1,  4, '2026-09-02 09:00+00', '2026-09-02 11:00+00', 'ENV-301: chamber baseline run', 'completed'),
  (1,  5, '2026-09-03 13:00+00', '2026-09-03 15:00+00', 'ENV-301: chamber baseline run', 'completed'),
  (4,  7, '2026-09-05 10:00+00', '2026-09-05 12:00+00', 'ELEC-220: RC circuit measurements', 'completed'),
  (8,  5, '2026-09-08 14:00+00', '2026-09-08 16:00+00', 'Thesis: PCR primer validation', 'completed'),
  (6,  9, '2026-09-09 09:00+00', '2026-09-09 10:00+00', 'BIO-110: sample prep', 'completed'),
  (7,  6, '2026-09-10 13:00+00', '2026-09-10 15:00+00', 'BIO-210: fluorescence imaging', 'completed'),
  (5,  8, '2026-09-11 10:00+00', '2026-09-11 13:00+00', 'Prototype: bracket v1 print', 'completed'),
  (3,  4, '2026-09-12 09:00+00', '2026-09-12 11:00+00', 'CHEM-401: absorbance standards', 'completed'),
  (10, 7, '2026-09-15 14:00+00', '2026-09-15 16:00+00', 'ELEC-330: filter characterisation', 'completed'),
  (2,  6, '2026-09-16 09:00+00', '2026-09-16 12:00+00', 'BIO-405: library prep', 'completed'),
  (1,  8, '2026-09-17 13:00+00', '2026-09-17 15:00+00', 'ENV-301: chamber baseline run', 'completed'),
  (11, 5, '2026-09-18 10:00+00', '2026-09-18 11:00+00', 'CELL-201: culture check', 'completed'),
  (2,  4, '2026-10-06 09:00+00', '2026-10-06 12:00+00', 'Senior project: DNA sequencer calibration', 'active'),
  (1,  4, '2026-10-07 09:00+00', '2026-10-07 11:00+00', 'Senior project: thermal profiling', 'active'),
  (1,  5, '2026-10-07 13:00+00', '2026-10-07 15:00+00', 'ENV-301: chamber baseline run', 'active'),
  (8,  5, '2026-10-08 14:00+00', '2026-10-08 16:00+00', 'Thesis: PCR primer validation (rerun)', 'active'),
  (7,  6, '2026-10-13 13:00+00', '2026-10-13 15:00+00', 'BIO-210: group practical', 'active'),
  (5,  8, '2026-10-14 10:00+00', '2026-10-14 13:00+00', 'Prototype: drone frame v2 print', 'active'),
  (4,  7, '2026-10-15 10:00+00', '2026-10-15 12:00+00', 'ELEC-220: RC circuit measurements', 'active'),
  (6,  9, '2026-10-16 09:00+00', '2026-10-16 10:00+00', 'BIO-110: sample prep', 'active'),
  (3,  4, '2026-10-20 09:00+00', '2026-10-20 11:00+00', 'CHEM-401: absorbance standards', 'active'),
  (10, 7, '2026-10-21 14:00+00', '2026-10-21 16:00+00', 'ELEC-330: filter characterisation', 'active'),
  (2,  6, '2026-10-22 09:00+00', '2026-10-22 12:00+00', 'BIO-405: library prep', 'active'),
  (11, 5, '2026-10-23 10:00+00', '2026-10-23 11:00+00', 'CELL-201: culture check', 'active'),
  (1,  9, '2026-10-27 09:00+00', '2026-10-27 11:00+00', 'ENV-301: chamber baseline run', 'active'),
  (8,  8, '2026-10-28 14:00+00', '2026-10-28 16:00+00', 'BIO-350: genotyping panel', 'active'),
  (5,  7, '2026-10-29 10:00+00', '2026-10-29 13:00+00', 'Capstone: sensor housing print', 'active'),
  (7,  4, '2026-11-03 13:00+00', '2026-11-03 15:00+00', 'BIO-210: group practical', 'active'),
  (9,  8, '2026-09-22 10:00+00', '2026-09-22 12:00+00', 'Capstone: aluminium test cuts', 'completed'),
  (6,  6, '2026-09-24 15:00+00', '2026-09-24 16:00+00', 'BIO-110: sample prep', 'completed'),
  (12, 9, '2026-09-26 10:00+00', '2026-09-26 11:00+00', 'ARCH-150: acrylic signage test', 'cancelled'),
  (10, 5, '2026-11-05 09:00+00', '2026-11-05 11:00+00', 'ELEC-220: antenna sweep', 'active');

INSERT INTO fault_reports (equipment_id, reported_by, title, description, severity, status, resolution) VALUES
  (4,  7, 'Channel 2 reads noise',        'Channel 2 shows heavy noise floor on all ranges.', 'high', 'open', NULL),
  (9,  8, 'Spindle vibration above spec', 'Vibration exceeds 4 mm/s during aluminium cuts.',   'critical', 'in_progress', NULL),
  (12, 9, 'Laser tube end of life',     'Output power down to 18W; tube is beyond service hours.', 'medium', 'open', NULL),
  (6,  6, 'Lid sensor intermittent',    'Lid-open sensor occasionally false-triggers mid-run.', 'medium', 'open', NULL),
  (11, 5, 'CO2 reading drifts',         'CO2 drifts ~2% over a 6-hour culture run.',          'high', 'in_progress', NULL),
  (7,  4, 'Stage motor stalls',         'X-stage stalls near home position.',                 'low', 'resolved', 'Replaced stepper driver (DRV8825)');

-- Synthetic dummy secrets. The field-service token value is the canonical
-- string that will also be packaged inside the Electron app for V1; it is
-- not a real credential.
INSERT INTO service_secrets (name, token, note) VALUES
  ('field-service-token',
   'FS-LAB-7f3a9c1e-4b2d-8e6f-a5c0-1d9b3e7f2a48',
   'Synthetic field-service token for the vendor (non-production) fleet-sweep function. V1 lab: mirror of the token packaged inside the Electron ASAR at resources/lab-app-config.json. Not a real credential.'),
  ('legacy-api-key',
   'LEGACY-LAB-00000000-1111-2222-3333-444444444444',
   'Synthetic legacy integration key kept for realism. Unused by the application.');

-- Seeds above assign explicit ids (locations, equipment), which leaves the
-- SERIAL sequences behind max(id). Without this resync, later inserts that
-- rely on DEFAULT nextval() fail with duplicate-key (23505).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'locations', 'equipment', 'reservations',
    'fault_reports', 'service_secrets', 'diagnostic_runs', 'audit_log'
  ]
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT max(id) FROM %I), 1))',
      t, 'id', t
    );
  END LOOP;
END $$;
