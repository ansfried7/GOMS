const db = require("../config/db");

/**
 * Script de migration pour la table validations
 * Ajoute les colonnes manquantes et crée les index
 */
async function migrate() {
  try {
    console.log("🔄 Début de la migration de la table validations...\n");

    // 1️⃣ Ajouter la colonne id_demande
    try {
      await db.execute(
        `ALTER TABLE validations ADD COLUMN id_demande INT DEFAULT NULL`
      );
      console.log("✅ Colonne id_demande ajoutée");
    } catch (e) {
      if (e.message.includes("Duplicate column")) {
        console.log("ℹ️  Colonne id_demande existe déjà");
      } else {
        throw e;
      }
    }

    // 2️⃣ Ajouter la colonne id_utilisateur
    try {
      await db.execute(
        `ALTER TABLE validations ADD COLUMN id_utilisateur INT DEFAULT NULL`
      );
      console.log("✅ Colonne id_utilisateur ajoutée");
    } catch (e) {
      if (e.message.includes("Duplicate column")) {
        console.log("ℹ️  Colonne id_utilisateur existe déjà");
      } else {
        throw e;
      }
    }

    // 3️⃣ Ajouter la colonne signature
    try {
      await db.execute(
        `ALTER TABLE validations ADD COLUMN signature TINYINT DEFAULT 0`
      );
      console.log("✅ Colonne signature ajoutée");
    } catch (e) {
      if (e.message.includes("Duplicate column")) {
        console.log("ℹ️  Colonne signature existe déjà");
      } else {
        throw e;
      }
    }

    // 4️⃣ Ajouter la FK pour id_demande
    try {
      await db.execute(
        `ALTER TABLE validations ADD CONSTRAINT fk_validations_demande 
         FOREIGN KEY (id_demande) REFERENCES demandemissions(id) ON DELETE CASCADE`
      );
      console.log("✅ Contrainte FK pour id_demande ajoutée");
    } catch (e) {
      if (e.message.includes("Duplicate key")) {
        console.log("ℹ️  Contrainte FK pour id_demande existe déjà");
      } else {
        throw e;
      }
    }

    // 5️⃣ Ajouter la FK pour id_utilisateur
    try {
      await db.execute(
        `ALTER TABLE validations ADD CONSTRAINT fk_validations_utilisateur 
         FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE`
      );
      console.log("✅ Contrainte FK pour id_utilisateur ajoutée");
    } catch (e) {
      if (e.message.includes("Duplicate key")) {
        console.log("ℹ️  Contrainte FK pour id_utilisateur existe déjà");
      } else {
        throw e;
      }
    }

    // 6️⃣ Modifier le type enum de decision
    try {
      await db.execute(
        `ALTER TABLE validations MODIFY COLUMN decision 
         ENUM('VALIDÉE','REJETÉE','En attente') DEFAULT 'En attente'`
      );
      console.log("✅ Enum decision modifié");
    } catch (e) {
      console.log("ℹ️  Enum decision déjà à jour");
    }

    // 7️⃣ Créer les index
    try {
      await db.execute(
        `CREATE INDEX idx_validations_demande_etape ON validations(id_demande, id_etape)`
      );
      console.log("✅ Index idx_validations_demande_etape créé");
    } catch (e) {
      if (e.message.includes("Duplicate key")) {
        console.log("ℹ️  Index idx_validations_demande_etape existe déjà");
      } else {
        throw e;
      }
    }

    try {
      await db.execute(
        `CREATE INDEX idx_validations_utilisateur ON validations(id_utilisateur)`
      );
      console.log("✅ Index idx_validations_utilisateur créé");
    } catch (e) {
      if (e.message.includes("Duplicate key")) {
        console.log("ℹ️  Index idx_validations_utilisateur existe déjà");
      } else {
        throw e;
      }
    }

    try {
      await db.execute(
        `CREATE INDEX idx_validations_date ON validations(date_validation)`
      );
      console.log("✅ Index idx_validations_date créé");
    } catch (e) {
      if (e.message.includes("Duplicate key")) {
        console.log("ℹ️  Index idx_validations_date existe déjà");
      } else {
        throw e;
      }
    }

    console.log("\n✅ Migration complétée avec succès!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erreur lors de la migration:", error.message);
    console.error(error);
    process.exit(1);
  }
}

migrate();
