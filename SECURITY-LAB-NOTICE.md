# Security Lab Notice

This repository is an **intentionally vulnerable** application built for
coursework. Later phases introduce deliberate, documented vulnerabilities
(hard-coded token, SQL injection, SSRF, unsafe Electron IPC) so that they can
be studied in a controlled environment.

Rules for this lab:

1. **Never deploy it.** Run it only on localhost; the Docker setup binds the
   API to `127.0.0.1` and publishes nothing else.
2. **Synthetic data only.** All users, passwords, tokens, device data, and
   challenge values are fake and exist solely inside this project.
3. **Do not "fix" vulnerabilities** unless an exercise explicitly says to.
   Each one is registered in `VULNERABILITIES.md` (repo root) with full
   writeups in `docs/vulnerabilities/`, and covered by vuln-presence
   tests.
4. The lab must never be reachable from a network you do not control.
