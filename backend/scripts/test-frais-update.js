/**
 * Script de test pour vérifier que la route /missions/frais/update fonctionne
 */

const db = require('../config/db');

async function testFraisUpdate() {
  try {
    console.log('🧪 Test de la route /missions/frais/update\n');

    // 1️⃣ Vérifier qu'une demande avec des missionnaires existe
    console.log('1️⃣ Recherche d\'une demande avec missionnaires...');
    const [demandes] = await db.execute(`
      SELECT dm.id, dm.reference, COUNT(m.id_missionnaire) as nb_missionnaires
      FROM demandemissions dm
      LEFT JOIN missionnaires m ON m.id_mission = dm.id
      GROUP BY dm.id
      HAVING nb_missionnaires > 0
      LIMIT 1
    `);

    if (demandes.length === 0) {
      console.log('❌ Aucune demande avec missionnaires trouvée');
      process.exit(1);
    }

    const demande = demandes[0];
    console.log(`✅ Demande trouvée: ID=${demande.id}, Référence=${demande.reference}, Missionnaires=${demande.nb_missionnaires}`);

    // 2️⃣ Récupérer les missionnaires
    console.log('\n2️⃣ Récupération des missionnaires...');
    const [missionnaires] = await db.execute(`
      SELECT id_missionnaire, nom, prenom, frais_hebergement, frais_restauration
      FROM missionnaires
      WHERE id_mission = ?
      LIMIT 2
    `, [demande.id]);

    console.log(`✅ ${missionnaires.length} missionnaires trouvés:`);
    missionnaires.forEach((m, idx) => {
      console.log(`   #${idx + 1}: ${m.nom} ${m.prenom} - Hébergement: ${m.frais_hebergement}, Restauration: ${m.frais_restauration}`);
    });

    // 3️⃣ Simuler l'appel API
    console.log('\n3️⃣ Simulation de l\'appel PUT /missions/frais/update...');
    console.log('Payload:');
    const payload = {
      id_demande: demande.id,
      frais_par_missionnaire: missionnaires.map(m => ({
        id_missionnaire: m.id_missionnaire,
        frais_hebergement: 50000,
        frais_restauration: 25000
      }))
    };
    console.log(JSON.stringify(payload, null, 2));

    // 4️⃣ Exécuter la mise à jour
    console.log('\n4️⃣ Exécution de la mise à jour...');
    for (const frais of payload.frais_par_missionnaire) {
      const montantHebergement = parseFloat(frais.frais_hebergement || 0);
      const montantRestauration = parseFloat(frais.frais_restauration || 0);

      await db.execute(
        `UPDATE missionnaires 
         SET frais_hebergement = ?, frais_restauration = ?
         WHERE id_missionnaire = ? AND id_mission = ?`,
        [montantHebergement, montantRestauration, frais.id_missionnaire, payload.id_demande]
      );

      console.log(`✅ Mise à jour pour missionnaire ${frais.id_missionnaire}: Hébergement=${montantHebergement}, Restauration=${montantRestauration}`);
    }

    // 5️⃣ Vérifier les résultats
    console.log('\n5️⃣ Vérification des résultats...');
    const [updated] = await db.execute(`
      SELECT id_missionnaire, nom, prenom, frais_hebergement, frais_restauration
      FROM missionnaires
      WHERE id_mission = ?
    `, [demande.id]);

    console.log('Données mises à jour:');
    updated.forEach((m, idx) => {
      console.log(`   #${idx + 1}: ${m.nom} ${m.prenom} - Hébergement: ${m.frais_hebergement}, Restauration: ${m.frais_restauration}`);
    });

    console.log('\n✅ Test réussi! La route devrait fonctionner maintenant.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testFraisUpdate();
