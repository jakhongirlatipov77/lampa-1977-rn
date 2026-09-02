import http from 'http';

function tryLogin(code) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      username: 'ruslatna',
      password: '21177@RuS',
      code_word: code
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
        resolve({ status: res.statusCode, body: JSON.parse(data) });
      });
    });

    req.write(payload);
    req.end();
  });
}

async function testAll() {
  const r1 = await tryLogin('КЕРАМИКА');
  console.log('Тест 1 (КЕРАМИКА): Status', r1.status, r1.body.success ? 'Успех' : r1.body.error);

  const r2 = await tryLogin('керамика');
  console.log('Тест 2 (керамика нижний регистр): Status', r2.status, r2.body.success ? 'Успех' : r2.body.error);

  const r3 = await tryLogin('НЕВЕРНЫЙ_КОД');
  console.log('Тест 3 (НЕВЕРНЫЙ_КОД): Status', r3.status, r3.body.success ? 'Успех' : r3.body.error);
}

testAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
