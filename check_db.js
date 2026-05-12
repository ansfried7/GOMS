const mysql = require('mysql2/promise');
require('dotenv').config({ path: './backend/.env' });

async function checkWorkflows() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'sodeco_db',
  });
  
  try {
    const [workflows] = await pool.query('SELECT * FROM workflows');
    console.log('Workflows:', JSON.stringify(workflows, null, 2));

    const [etapes] = await pool.query('SELECT * FROM etapes_workflow');
    console.log('Etapes:', JSON.stringify(etapes, null, 2));
    
    const [demandeurs] = await pool.query('SELECT emplacement, COUNT(*) as count FROM demandeurs GROUP BY emplacement');
    console.log('Demandeurs by emplacement:', JSON.stringify(demandeurs, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkWorkflows();
