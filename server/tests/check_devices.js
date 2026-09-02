import db from '../db.js';

async function listDevices() {
  const devs = await db.query('SELECT * FROM allowed_devices');
  console.log('Devices in database:', JSON.stringify(devs, null, 2));
}

listDevices().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
