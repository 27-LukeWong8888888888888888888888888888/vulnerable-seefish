'use strict';


const express = require('express');
const { query } = require('./db');
const { envelopeMiddleware } = require('./envelopeMiddleware');
const { requireAuth } = require('./requireAuth');
const sessionRoutes = require('./routes/session');
const authRoutes = require('./routes/auth');
const equipmentRoutes = require('./routes/equipment');
const faultRoutes = require('./routes/faults');
const reservationRoutes = require('./routes/reservations');
const diagnosticsRoutes = require('./routes/diagnostics');
const fieldServiceRoutes = require('./routes/fieldService');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', service: 'campus-lab-booking-api', db: 'up' });
    } catch (err) {
      res.status(503).json({ status: 'degraded', service: 'campus-lab-booking-api', db: 'down' });
    }
  });

  
  app.use('/api/session/key', sessionRoutes);

 
  app.use('/api', envelopeMiddleware);
  app.use('/api/auth', authRoutes);
  app.use('/api/equipment', requireAuth, equipmentRoutes);
  app.use('/api/fault-reports', requireAuth, faultRoutes);
  app.use('/api/reservations', requireAuth, reservationRoutes);
  
  app.use('/api/diagnostics', requireAuth, diagnosticsRoutes);
  app.use('/api/field-service', fieldServiceRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({
      error: status >= 500 ? 'internal_error' : 'bad_request',
      message: err.expose ? err.message : undefined
    });
  });

  return app;
}

module.exports = { createApp };
