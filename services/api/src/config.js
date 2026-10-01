'use strict';

module.exports = {
  apiPort: parseInt(process.env.API_PORT || '3000', 10),
  sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10),
  pg: {
    host: process.env.PGHOST || 'db',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'labuser',
    password: process.env.PGPASSWORD || 'labpass-dev-only',
    database: process.env.PGDATABASE || 'campus_lab'
  }
};
