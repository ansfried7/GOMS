const db = require("../config/db");

/**
 * Script pour assigner les workflows aux demandes et créer des validateurs de test
 */
async function setup() {
  try {
    console.log("🔄 Début de la configuration de test...\n");

    // 1️⃣ Assigner les workflows par défaut
    console.log("📋 Assignation des workflows...");
    
    await db.execute(
      `UPDATE demandemissions dm
       SET dm.id_workflow = 1
       WHERE dm.id_workflow IS NULL 
         AND dm.id_demandeurs IN (
           SELECT d.id_demandeur 
           FROM demandeurs d 
           WHERE d.emplacement = 'Siège'
         )`
    );
    console.log("✅ Workflows Siège assignés");

    await db.execute(
      `UPDATE demandemissions dm
       SET dm.id_workflow = 2
       WHERE dm.id_workflow IS NULL 
         AND dm.id_demandeurs IN (
           SELECT d.id_demandeur 
           FROM demandeurs d 
           WHERE d.emplacement = 'Usine'
         )`
    );
    console.log("✅ Workflows Usine assignés");

    // 2️⃣ Mettre à jour le statut des demandes non-brouillon à "En attente"
    console.log("\n📋 Mise à jour des statuts de demande...");
    
    await db.execute(
      `UPDATE demandemissions 
       SET statut = 'En attente', date_soumission = NOW() 
       WHERE statut = 'Brouillon' AND id_workflow IS NOT NULL`
    );
    console.log("✅ Statuts mis à jour à 'En attente'");

    // 3️⃣ Vérifier les demandes
    const [demandes] = await db.execute(
      `SELECT id, reference, id_demandeurs, id_workflow, statut, created_at 
       FROM demandemissions 
       ORDER BY created_at DESC`
    );
    console.log(`\n📊 Total de demandes: ${demandes.length}`);
    demandes.forEach(d => {
      console.log(`  - ID ${d.id}: ${d.reference} | Workflow: ${d.id_workflow} | Statut: ${d.statut}`);
    });

    // 4️⃣ Créer un validateur de test avec le sous-rôle "Directeur de Département"
    console.log("\n👤 Création d'un validateur de test...");
    
    // Vérifier si l'utilisateur validateur existe déjà
    const [users] = await db.execute(
      `SELECT id_utilisateur FROM utilisateurs WHERE email = 'validateur@sodeco.com'`
    );

    let id_utilisateur;
    if (users.length === 0) {
      // Créer un nouvel utilisateur validateur
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash("Validateur@2026", 10);

      const [result] = await db.execute(
        `INSERT INTO utilisateurs (nom, prenom, email, username, password, role, statut_compte)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'Validateur',
          'Test',
          'validateur@sodeco.com',
          'validateur_test',
          hashedPassword,
          'Validateur',
          'Actif'
        ]
      );
      id_utilisateur = result.insertId;
      console.log(`✅ Utilisateur validateur créé (ID: ${id_utilisateur})`);
    } else {
      id_utilisateur = users[0].id_utilisateur;
      console.log(`ℹ️  Utilisateur validateur existe déjà (ID: ${id_utilisateur})`);
    }

    // Vérifier si le validateur existe dans la table validateurs
    const [validateurs] = await db.execute(
      `SELECT id_validateur FROM validateurs WHERE id_utilisateur = ?`,
      [id_utilisateur]
    );

    if (validateurs.length === 0) {
      // Créer le validateur avec le sous-rôle "Directeur de Département" (id=6)
      await db.execute(
        `INSERT INTO validateurs (id_utilisateur, id_sous_role)
         VALUES (?, ?)`,
        [id_utilisateur, 6] // 6 = Directeur de Département
      );
      console.log("✅ Validateur créé avec le sous-rôle 'Directeur de Département'");
    } else {
      console.log("ℹ️  Validateur existe déjà");
    }

    console.log("\n✅ Configuration complétée avec succès!");
    console.log("\n📝 Credentials pour tester:");
    console.log("   Email: validateur@sodeco.com");
    console.log("   Mot de passe: Validateur@2026");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erreur lors de la configuration:", error.message);
    console.error(error);
    process.exit(1);
  }
}

setup();
