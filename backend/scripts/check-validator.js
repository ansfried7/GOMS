const db = require("../config/db");
const bcrypt = require("bcrypt");

async function checkAndFixValidator() {
  try {
    console.log("🔍 Vérification de l'utilisateur validateur...\n");

    // 1️⃣ Chercher tous les utilisateurs
    const [users] = await db.execute(
      `SELECT id_utilisateur, nom, prenom, email, role FROM utilisateurs 
       WHERE role IN ('Validateur', 'Demandeur', 'Admin') 
       LIMIT 20`
    );

    console.log("📋 Utilisateurs trouvés:");
    users.forEach(u => {
      console.log(`  - ID ${u.id_utilisateur}: ${u.prenom} ${u.nom} (${u.email}) - Rôle: ${u.role}`);
    });

    // 2️⃣ Créer ou mettre à jour l'utilisateur validateur
    console.log("\n👤 Création/mise à jour du validateur...");

    const hashedPassword = await bcrypt.hash("Validateur@2026", 10);

    const [existing] = await db.execute(
      `SELECT id_utilisateur FROM utilisateurs WHERE email = 'validateur@sodeco.com'`
    );

    if (existing.length > 0) {
      // Mettre à jour le mot de passe
      await db.execute(
        `UPDATE utilisateurs SET password = ? WHERE email = 'validateur@sodeco.com'`,
        [hashedPassword]
      );
      console.log("✅ Mot de passe du validateur mis à jour");
    } else {
      // Créer un nouvel utilisateur
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
      console.log(`✅ Utilisateur validateur créé (ID: ${result.insertId})`);
    }

    // 3️⃣ Vérifier qu'il y a un validateur assigné
    const [validateurs] = await db.execute(
      `SELECT v.id_validateur, v.id_utilisateur, sr.nom_sous_role 
       FROM validateurs v
       JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role 
       WHERE v.id_utilisateur IN (
         SELECT id_utilisateur FROM utilisateurs WHERE email = 'validateur@sodeco.com'
       )`
    );

    if (validateurs.length === 0) {
      const [userResult] = await db.execute(
        `SELECT id_utilisateur FROM utilisateurs WHERE email = 'validateur@sodeco.com'`
      );
      
      if (userResult.length > 0) {
        const id_utilisateur = userResult[0].id_utilisateur;
        
        // Vérifier s'il existe déjà
        const [existing] = await db.execute(
          `SELECT id_validateur FROM validateurs WHERE id_utilisateur = ?`,
          [id_utilisateur]
        );

        if (existing.length === 0) {
          await db.execute(
            `INSERT INTO validateurs (id_utilisateur, id_sous_role)
             VALUES (?, ?)`,
            [id_utilisateur, 6] // Directeur de Département
          );
          console.log("✅ Validateur assigné au sous-rôle 'Directeur de Département'");
        }
      }
    } else {
      console.log(`✅ Validateur existe: ${validateurs[0].nom_sous_role}`);
    }

    console.log("\n✅ Vérification complétée!");
    console.log("\n📝 Credentials pour tester:");
    console.log("   Email: validateur@sodeco.com");
    console.log("   Mot de passe: Validateur@2026");
    console.log("   Rôle: Validateur");
    console.log("   Sous-rôle: Directeur de Département");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erreur:", error.message);
    process.exit(1);
  }
}

checkAndFixValidator();
