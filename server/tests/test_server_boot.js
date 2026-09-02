import http from 'http';
import { app, ensureDatabaseReady } from '../server.js';

async function testBoot() {
  console.log('Testing server boot and API health...');
  await ensureDatabaseReady();
  
  const server = app.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    console.log(`Test server running on port ${port}`);

    http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Health response status:', res.statusCode);
        console.log('Health response body:', data);
        server.close(() => {
          console.log('✅ Server boot and health check successful!');
          process.exit(0);
        });
      });
    }).on('error', (err) => {
      console.error('HTTP request failed:', err);
      server.close();
      process.exit(1);
    });
  });
}

testBoot().catch(err => {
  console.error('Fatal boot test error:', err);
  process.exit(1);
});
