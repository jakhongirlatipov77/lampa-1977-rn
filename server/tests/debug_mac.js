import { getServerMacs } from '../utils/macResolver.js';
import db from '../db.js';

async function debugLocalhost() {
  const macs = getServerMacs();
  console.log('Server MACs from os.networkInterfaces():', macs);
  const rows = await db.query('SELECT * FROM allowed_devices');
  console.log('Allowed devices in DB:', rows);
}

debugLocalhost().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
