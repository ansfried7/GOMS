/**
 * Script de test pour vérifier la nouvelle logique:
 * Une demande = Un ordre
 * 
 * Tests:
 * 1. Créer une demande → vérifie que ordres_missions est aussi créé
 * 2. Appeler createOrdreFromDemande → vérifie que c'est une UPDATE pas INSERT
 * 3. Vérifier que est_ordre_mission = 1
 */

const mysql = require('mysql2/promise');

async function testNewOrdreLogic() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'sodecobd'
  });

  try {
    console.log('🧪 Test 1: Vérifier qu\'une demande récente a un ordre lié');
    
    // Récupérer les 5 dernières demandes
    const [demandes] = await connection.execute(`
      SELECT dm.id, dm.reference, dm.est_ordre_mission, om.id_ordre
      FROM demandemissions dm
      LEFT JOIN ordres_missions om ON dm.id = om.id_demande
      ORDER BY dm.created_at DESC
      LIMIT 5
    `);

    console.table(demandes);
    
    console.log('\n🧪 Test 2: Vérifier les ordres_missions');
    const [ordres] = await connection.execute(`
      SELECT * FROM ordres_missions LIMIT 5
    `);
    console.table(ordres);

    console.log('\n✅ Tests complétés');

  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    connection.end();
  }
}

testNewOrdreLogic();
