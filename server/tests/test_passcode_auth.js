import db from '../db.js';

async function runPasscodeTests() {
  console.log('🧪 Тестирование авторизации по кодовым словам доступа...');
  await db.initDatabase();

  const user = await db.get('SELECT * FROM users WHERE username = ?', ['ruslatna']);
  console.log('Пользователь ruslatna:', user ? 'Найден' : 'Не найден');

  const passcodes = await db.query('SELECT * FROM security_passcodes WHERE status = "active"');
  console.log('Активные кодовые слова:', passcodes.map(p => `${p.code_word} (${p.assigned_to})`));

  function verifyWord(input) {
    const clean = input.trim().toUpperCase();
    return passcodes.find(p => p.code_word && p.code_word.trim().toUpperCase() === clean);
  }

  // Тест 1: Числовой код
  if (verifyWord('21177')) {
    console.log('✔️ [PASS] Кодовое слово «21177» распознано');
  } else {
    console.error('❌ [FAIL] Кодовое слово «21177» не найдено');
    process.exit(1);
  }

  // Тест 2: Русское слово в нижнем регистре
  if (verifyWord('керамика')) {
    console.log('✔️ [PASS] Кодовое слово «керамика» (нижний регистр) распознано');
  } else {
    console.error('❌ [FAIL] Кодовое слово «керамика» не распознано');
    process.exit(1);
  }

  // Тест 3: Невалидное слово
  if (!verifyWord('неверное-слово-999')) {
    console.log('✔️ [PASS] Неверное кодовое слово отклонено');
  } else {
    console.error('❌ [FAIL] Неверное кодовое слово было принято!');
    process.exit(1);
  }

  console.log('🎉 ВСЕ ТЕСТЫ КОДОВЫХ СЛОВ ПРОЙДЕНЫ УСПЕШНО!');
}

runPasscodeTests().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
