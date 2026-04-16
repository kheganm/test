const { getDb } = require('../db');

async function getHouseBalance() {
  const result = await getDb().execute({ sql: 'SELECT balance FROM house_pool WHERE id = 1', args: [] });
  return Number(result.rows[0].balance);
}

async function addToHousePool(amount) {
  await getDb().execute({
    sql: 'UPDATE house_pool SET balance = balance + ? WHERE id = 1',
    args: [amount],
  });
}

async function deductFromHousePool(amount) {
  await getDb().execute({
    sql: 'UPDATE house_pool SET balance = balance - ? WHERE id = 1',
    args: [amount],
  });
}

module.exports = { getHouseBalance, addToHousePool, deductFromHousePool };
