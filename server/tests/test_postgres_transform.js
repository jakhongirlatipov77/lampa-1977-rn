import { transformSqlForPostgres } from '../db.js';

const tests = [
  {
    input: "SELECT * FROM users WHERE username = ? AND status = ?",
    expected: "SELECT * FROM users WHERE username = $1 AND status = $2"
  },
  {
    input: "SELECT * FROM orders WHERE strftime('%Y-%m', order_date) = ? AND strftime('%Y', order_date) = ?",
    expected: "SELECT * FROM orders WHERE to_char(order_date, 'YYYY-MM') = $1 AND to_char(order_date, 'YYYY') = $2"
  },
  {
    input: "INSERT INTO products (name, created_at) VALUES (?, datetime('now', 'localtime'))",
    expected: "INSERT INTO products (name, created_at) VALUES ($1, CURRENT_TIMESTAMP)"
  },
  {
    input: "INSERT INTO orders (date) VALUES (date('now', '-5 days'))",
    expected: "INSERT INTO orders (date) VALUES ((CURRENT_DATE - INTERVAL '5 days'))"
  },
  {
    input: "SELECT * FROM items WHERE name = 'What?' AND id = ?",
    expected: "SELECT * FROM items WHERE name = 'What?' AND id = $1"
  }
];

let failed = 0;
for (const [idx, t] of tests.entries()) {
  const actual = transformSqlForPostgres(t.input);
  if (actual === t.expected) {
    console.log(`✅ Test #${idx + 1} passed`);
  } else {
    console.error(`❌ Test #${idx + 1} failed:`);
    console.error(`   Input:    ${t.input}`);
    console.error(`   Expected: ${t.expected}`);
    console.error(`   Actual:   ${actual}`);
    failed++;
  }
}

if (failed === 0) {
  console.log('🎉 All SQL transformation tests passed successfully!');
  process.exit(0);
} else {
  console.error(`❌ ${failed} tests failed`);
  process.exit(1);
}
