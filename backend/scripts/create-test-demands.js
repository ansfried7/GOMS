/**
 * Script pour créer des demandes de test de différents demandeurs
 * en attente de validation pour tester l'affichage des noms
 */

const db = require('../config/db');

async function createTestDemands() {
  try {
    console.log('🔨 Création de demandes de test pour différents demandeurs\n');

    // Récupérer les demandeurs
    const [demandeurs] = await db.execute(`
      SELECT id_utilisateur, nom, prenom 
      FROM utilisateurs 
      WHERE role = 'Demandeur'
      LIMIT 3
    `);

    console.log(`✅ Trouvé ${demandeurs.length} demandeurs`);

    // Récupérer un workflow
    const [workflows] = await db.execute(`
      SELECT DISTINCT id_workflow 
      FROM etapes_workflow 
      LIMIT 1
    `);

    if (workflows.length === 0) {
      console.log('❌ Aucun workflow trouvé');
      process.exit(1);
    }

    const workflowId = workflows[0].id_workflow;
    console.log(`✅ Workflow utilisé: ID ${workflowId}\n`);

    // Créer une demande pour chaque demandeur
    for (const demandeur of demandeurs) {
      const reference = `TEST-${Date.now()}-${demandeur.id_utilisateur}`;
      const dateDepart = new Date();
      dateDepart.setDate(dateDepart.getDate() + 5);

      const [result] = await db.execute(
        `INSERT INTO demandemissions (
          reference, id_demandeurs, motif, destination, dateDepart, dateRetour,
          portee, id_workflow, statut, est_ordre_mission, etape_creation, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          reference,
          demandeur.id_utilisateur,
          `Test de demande pour ${demandeur.prenom} ${demandeur.nom}`,
          'Destination Test',
          dateDepart.toISOString().split('T')[0],
          new Date(dateDepart.getTime() + 86400000).toISOString().split('T')[0],
          'National',
          workflowId,
          'En attente',
          0,
          'DEMANDE'
        ]
      );

      console.log(`✅ Demande créée pour ${demandeur.prenom} ${demandeur.nom}`);
      console.log(`   Référence: ${reference}`);
      console.log(`   ID Demande: ${result.insertId}\n`);
    }

    // Vérifier les demandes créées
    console.log('\n📋 Demandes "En attente" actuelles:');
    console.log('━'.repeat(80));

    const [check] = await db.execute(`
      SELECT 
        dm.id,
        dm.reference,
        dm.id_demandeurs,
        u.nom,
        u.prenom,
        dm.destination,
        dm.statut
      FROM demandemissions dm
      JOIN utilisateurs u ON dm.id_demandeurs = u.id_utilisateur
      WHERE dm.statut = 'En attente'
      ORDER BY dm.id DESC
    `);

    check.forEach((d, idx) => {
      console.log(`  #${idx + 1}: ${d.prenom} ${d.nom} - ${d.reference} (ID: ${d.id_demandeurs})`);
    });

    console.log('\n✅ Demandes de test créées avec succès!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

createTestDemands();
