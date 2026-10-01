'use strict';

const { createApp } = require('./src/app');
const config = require('./src/config');

const app = createApp();

app.listen(config.apiPort, () => {
  console.log(`campus-lab-booking-api listening on :${config.apiPort} (RC4 envelope enforced on /api)`);
});
