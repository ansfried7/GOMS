const db = require("../config/db");

async function createValidatorWithPlainPassword() {
  try {
    console.log("👤 Création d'un validateur avec mot de passe en texte clair...\n");

    // Supprimer l'utilisateur existant
    await db.execute(
      `DELETE FROM utilisateurs WHERE email = 'validateur@sodeco.com'`
    );

    // Créer un nouvel utilisateur avec mot de passe en texte clair
    const [result] = await db.execute(
      `INSERT INTO utilisateurs (nom, prenom, email, username, password, role, statut_compte)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'Validateur',
        'Test',
        'validateur@sodeco.com',
        'validateur_test',
        'Validateur@2026',  // ⚠️ Mot de passe EN TEXTE CLAIR (utilisé par le contrôleur)
        'Validateur',
        'Actif'
      ]
    );

    const id_utilisateur = result.insertId;
    console.log(`✅ Utilisateur validateur créé (ID: ${id_utilisateur})`);

    // Vérifier s'il existe un validateur
    const [existing] = await db.execute(
      `SELECT id_validateur FROM validateurs WHERE id_utilisateur = ?`,
      [id_utilisateur]
    );

    if (existing.length === 0) {
      // Créer l'entrée validateur
      await db.execute(
        `INSERT INTO validateurs (id_utilisateur, id_sous_role)
         VALUES (?, ?)`,
        [id_utilisateur, 6] // 6 = Directeur de Département
      );
      console.log("✅ Validateur créé avec le sous-rôle 'Directeur de Département'");
    }

    console.log("\n✅ Configuration complétée!");
    console.log("\n📝 Credentials pour tester:");
    console.log("   Email: validateur@sodeco.com");
    console.log("   Mot de passe: Validateur@2026");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erreur:", error.message);
    process.exit(1);
  }
}

createValidatorWithPlainPassword();
