import http from 'http';

const payload = JSON.stringify({
  username: 'ruslatna',
  password: '21177@RuS',
  code_word: '21177'
});

const req = http.request('http://127.0.0.1:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Response:', data);
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', (err) => {
  console.error('Request error:', err);
  process.exit(1);
});

req.write(payload);
req.end();
