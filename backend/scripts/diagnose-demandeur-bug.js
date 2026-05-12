/**
 * Script de diagnostic pour le bug du nom du demandeur
 * Affiche tous les demandes en attente avec leurs demandeurs
 */

const db = require('../config/db');

async function diagnose() {
  try {
    console.log('🔍 DIAGNOSTIC: Vérification des demandes en attente\n');

    // 1. Voir toutes les demandes en attente avec leurs demandeurs
    console.log('1️⃣ Demandes en attente avec leurs demandeurs:');
    console.log('━'.repeat(80));

    const [demandes] = await db.execute(`
      SELECT 
        dm.id,
        dm.reference,
        dm.id_demandeurs,
        u.id_utilisateur,
        u.nom,
        u.prenom,
        dm.destination,
        dm.dateDepart,
        dm.statut
      FROM demandemissions dm
      JOIN utilisateurs u ON dm.id_demandeurs = u.id_utilisateur
      WHERE dm.statut = 'En attente'
      ORDER BY dm.id
    `);

    if (demandes.length === 0) {
      console.log('❌ Aucune demande en attente trouvée');
    } else {
      demandes.forEach((d, idx) => {
        console.log(`
  Demande #${idx + 1}:
    ID: ${d.id}
    Référence: ${d.reference}
    ID Demandeur: ${d.id_demandeurs}
    Nom: ${d.nom} ${d.prenom}
    Destination: ${d.destination}
    Date Départ: ${d.dateDepart}
    Statut: ${d.statut}
        `);
      });
    }

    // 2. Voir tous les utilisateurs avec le nom 'seton' ou 'bodun'
    console.log('\n\n2️⃣ Utilisateurs contenant "seton" ou "bodun":');
    console.log('━'.repeat(80));

    const [setonUsers] = await db.execute(`
      SELECT id_utilisateur, nom, prenom, email, role
      FROM utilisateurs
      WHERE nom LIKE '%seton%' OR prenom LIKE '%seton%'
         OR nom LIKE '%bodun%' OR prenom LIKE '%bodun%'
    `);

    setonUsers.forEach((u, idx) => {
      console.log(`
  Utilisateur #${idx + 1}:
    ID: ${u.id_utilisateur}
    Nom: ${u.nom} ${u.prenom}
    Email: ${u.email}
    Rôle: ${u.role}
      `);
    });

    // 3. Compter les demandes par demandeur
    console.log('\n\n3️⃣ Demandes en attente groupées par demandeur:');
    console.log('━'.repeat(80));

    const [demandeurCounts] = await db.execute(`
      SELECT 
        u.id_utilisateur,
        u.nom,
        u.prenom,
        COUNT(dm.id) as count_demandes
      FROM demandemissions dm
      JOIN utilisateurs u ON dm.id_demandeurs = u.id_utilisateur
      WHERE dm.statut = 'En attente'
      GROUP BY dm.id_demandeurs, u.id_utilisateur, u.nom, u.prenom
    `);

    if (demandeurCounts.length === 0) {
      console.log('❌ Aucune demande en attente');
    } else {
      demandeurCounts.forEach((row, idx) => {
        console.log(`
  #${idx + 1}: ${row.nom} ${row.prenom} (ID: ${row.id_utilisateur})
    Nombre de demandes en attente: ${row.count_demandes}
        `);
      });
    }

    // 4. Vérifier les distinctes id_demandeurs
    console.log('\n\n4️⃣ IDs demandeurs distincts dans les demandes "En attente":');
    console.log('━'.repeat(80));

    const [distinctIds] = await db.execute(`
      SELECT DISTINCT dm.id_demandeurs
      FROM demandemissions dm
      WHERE dm.statut = 'En attente'
    `);

    console.log(`Nombre d'ID demandeurs distincts: ${distinctIds.length}`);
    distinctIds.forEach((row, idx) => {
      console.log(`  #${idx + 1}: ID ${row.id_demandeurs}`);
    });

    console.log('\n✅ Diagnostic terminé\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

diagnose();
