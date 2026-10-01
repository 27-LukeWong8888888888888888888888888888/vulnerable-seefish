# Documentation

| Document | Audience | Contents |
|---|---|---|
| [`LAB-EXERCISES.md`](LAB-EXERCISES.md) | students | Four hands-on exercises; no spoilers |
| [`INSTRUCTOR-NOTES.md`](INSTRUCTOR-NOTES.md) | instructors / graders | Setup, seed data, expected PoC results, grading, reset |
| [`VULN-MAP.md`](VULN-MAP.md) | everyone | Pointer to the vulnerability registry at the repo root |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | maintainers | Components, networks, trust boundaries, endpoint reference, CLI helper |
| [`THREAT-MODEL.md`](THREAT-MODEL.md) | maintainers | Assets, trust boundaries, attacker profiles |
| [`DATA-MODEL.md`](DATA-MODEL.md) | maintainers | Schema and seeded data |
| [`PROTOCOL-RC4.md`](PROTOCOL-RC4.md) | maintainers | Encrypted-envelope protocol and its deliberate weaknesses |
| [`vulnerabilities/`](vulnerabilities/) | instructors / graders | Full writeup per vulnerability (V1–V4) |

**Suggested reading paths**

- **Taking the lab:** `LAB-EXERCISES.md` only — it contains no
  vulnerability spoilers. Do not open
  [`VULNERABILITIES.md`](../VULNERABILITIES.md) (repo root) or
  `vulnerabilities/` until you have your own answers.
- **Setting up or grading:** [`VULNERABILITIES.md`](../VULNERABILITIES.md)
  (the registry: affected feature, required role, prerequisites,
  reproduction, expected proof, reset) → `INSTRUCTOR-NOTES.md` →
  per-vuln writeups in `vulnerabilities/` as needed.
- **Modifying the code:** `ARCHITECTURE.md` → `PROTOCOL-RC4.md` →
  `THREAT-MODEL.md` → `DATA-MODEL.md`.

Every document inherits the rules in
[`SECURITY-LAB-NOTICE.md`](../SECURITY-LAB-NOTICE.md): the
vulnerabilities are intentional, synthetic, and must not be fixed.
