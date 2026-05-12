/**
 * Diagnostic détaillé de la relation demandemissions/utilisateurs
 */

const db = require('../config/db');

async function detailedDiagnose() {
  try {
    console.log('🔍 DIAGNOSTIC DÉTAILLÉ: Problème du nom du demandeur\n');

    // Créer une demande de test pour voir le problème
    const [userResult] = await db.execute(`
      SELECT id_utilisateur, nom, prenom 
      FROM utilisateurs 
      WHERE role = 'Demandeur'
      LIMIT 3
    `);

    console.log('📋 Utilisateurs Demandeurs:');
    console.log('━'.repeat(80));
    userResult.forEach(u => {
      console.log(`  ID: ${u.id_utilisateur} | Nom: ${u.nom} | Prénom: ${u.prenom}`);
    });

    // Vérifier la structure de la table demandemissions
    console.log('\n\n📊 Structure et données de demandemissions (toutes les demandes):');
    console.log('━'.repeat(80));

    const [allDemandes] = await db.execute(`
      SELECT 
        dm.id,
        dm.reference,
        dm.id_demandeurs,
        dm.motif,
        dm.destination,
        dm.statut,
        u.id_utilisateur,
        u.nom as user_nom,
        u.prenom as user_prenom
      FROM demandemissions dm
      LEFT JOIN utilisateurs u ON dm.id_demandeurs = u.id_utilisateur
      ORDER BY dm.id DESC
      LIMIT 10
    `);

    if (allDemandes.length === 0) {
      console.log('❌ Aucune demande trouvée');
    } else {
      allDemandes.forEach((d, idx) => {
        console.log(`
  #${idx + 1}:
    ID: ${d.id} | Ref: ${d.reference} | Statut: ${d.statut}
    ID Demandeur dans DB: ${d.id_demandeurs}
    User trouvé: ID=${d.id_utilisateur}, Nom=${d.user_nom} ${d.user_prenom}
    Motif: ${d.motif}
        `);
      });
    }

    // Vérifier la requête exacte du controller
    console.log('\n\n🔧 Test de la requête du validationController:');
    console.log('━'.repeat(80));

    const idUtilisateur = 11; // Remplacer par un validateur réel
    const [validateurs] = await db.execute(
      `SELECT v.id_validateur, v.id_sous_role, sr.nom_sous_role
       FROM validateurs v
       JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role
       WHERE v.id_utilisateur = ?`,
      [idUtilisateur]
    );

    if (validateurs.length === 0) {
      console.log(`❌ L'utilisateur ${idUtilisateur} n'est pas un validateur`);
    } else {
      const validateur = validateurs[0];
      console.log(`✅ Validateur trouvé: ${validateur.nom_sous_role} (ID: ${validateur.id_sous_role})`);

      const [etapes] = await db.execute(
        `SELECT id_etape, id_workflow, ordre_etape, libelle_etape 
         FROM etapes_workflow 
         WHERE id_sous_role_requis = ?`,
        [validateur.id_sous_role]
      );

      console.log(`\n📍 Étapes pour ce validateur: ${etapes.length} trouvées`);

      if (etapes.length > 0) {
        const etape = etapes[0];
        console.log(`\nTest avec la première étape: ${etape.libelle_etape}`);

        const [testResult] = await db.execute(
          `SELECT 
            dm.id,
            dm.reference,
            dm.id_demandeurs,
            dm.motif,
            dm.destination,
            dm.statut,
            u.nom,
            u.prenom,
            ? as etape_nom
          FROM demandemissions dm
          JOIN utilisateurs u ON dm.id_demandeurs = u.id_utilisateur
          WHERE dm.id_workflow = ? 
            AND dm.statut != 'Brouillon'
            AND dm.statut = 'En attente'
            AND NOT EXISTS (
              SELECT 1 FROM validations 
              WHERE id_demande = dm.id 
              AND id_etape = ?
            )
          LIMIT 5`,
          [etape.libelle_etape, etape.id_workflow, etape.id_etape]
        );

        if (testResult.length === 0) {
          console.log('❌ Aucune demande trouvée pour cette étape');
        } else {
          console.log(`✅ Demandes trouvées: ${testResult.length}`);
          testResult.forEach((d, idx) => {
            console.log(`
  #${idx + 1}:
    Ref: ${d.reference}
    ID Demandeurs: ${d.id_demandeurs}
    Nom affiché: ${d.prenom} ${d.nom}
    Étape: ${d.etape_nom}
            `);
          });
        }
      }
    }

    console.log('\n\n✅ Diagnostic terminé\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

detailedDiagnose();
