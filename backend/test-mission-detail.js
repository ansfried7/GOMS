const db = require('./config/db');

// Test the query that was failing
async function testMissionDetail() {
  try {
    const missionId = 32;
    const chauffeurId = 19;
    
    const [missionRows] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart, d.dateRetour, d.statut,
              om.id_ordre,
              v.id_vehicule, v.marque, v.immatriculation, v.couleur, v.type_vehicule
       FROM demandemissions d
       LEFT JOIN ordres_missions om ON om.id_demande = d.id
       LEFT JOIN vehicules v ON d.id_vehicule = v.id_vehicule
       WHERE d.id = ? AND d.id_chauffeur = ?`,
      [missionId, chauffeurId]
    );

    console.log('✅ Mission detail query successful!');
    console.log('Mission:', JSON.stringify(missionRows[0], null, 2));

    if (missionRows.length > 0) {
      // Now test missionnaires
      const [missionnaires] = await db.execute(
        `SELECT id_missionnaire as id, nom, prenom, fonction, est_chef_mission
         FROM missionnaires
         WHERE id_mission = ?
         ORDER BY est_chef_mission DESC`,
        [missionId]
      );
      console.log('\n✅ Missionnaires query successful!');
      console.log('Missionnaires:', JSON.stringify(missionnaires, null, 2));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testMissionDetail();
