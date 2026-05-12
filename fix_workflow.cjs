const db = require('./backend/config/db');

async function fixData() {
  try {
    console.log('--- Fixing missions with NULL id_workflow ---');
    
    // Mettre à jour les missions National sans workflow
    const [res1] = await db.execute(
      "UPDATE demandemissions SET id_workflow = 1 WHERE id_workflow IS NULL AND portee = 'National'"
    );
    console.log(`Updated National missions: ${res1.affectedRows}`);

    // Mettre à jour les missions Continental sans workflow
    const [res2] = await db.execute(
      "UPDATE demandemissions SET id_workflow = 2 WHERE id_workflow IS NULL AND portee = 'Continental'"
    );
    console.log(`Updated Continental missions: ${res2.affectedRows}`);

    // Mettre à jour les missions International sans workflow
    const [res3] = await db.execute(
      "UPDATE demandemissions SET id_workflow = 3 WHERE id_workflow IS NULL AND portee = 'International'"
    );
    console.log(`Updated International missions: ${res3.affectedRows}`);

    process.exit(0);
  } catch (error) {
    console.error('Error fixing data:', error);
    process.exit(1);
  }
}

fixData();
