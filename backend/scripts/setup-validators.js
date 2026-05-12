const db = require('../config/db');

(async () => {
  try {
    // Vérifier les validateurs existants
    const [validateurs] = await db.execute(
      `SELECT v.*, sr.nom_sous_role, u.nom, u.prenom 
       FROM validateurs v
       JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role
       JOIN utilisateurs u ON v.id_utilisateur = u.id_utilisateur`
    );
    
    console.log('📋 Validateurs existants:');
    console.table(validateurs);
    console.log('');
    
    // Créer un validateur test si nécessaire
    const [check] = await db.execute(`SELECT COUNT(*) as cnt FROM validateurs`);
    
    if (check[0].cnt === 0) {
      console.log('⚠️ Aucun validateur trouvé. Création du validateur test...');
      
      // Utiliser l'utilisateur ID 2 (bo bi) comme validateur Directeur de Département
      await db.execute(
        `INSERT INTO validateurs (id_utilisateur, id_sous_role) VALUES (?, ?)`,
        [2, 6]  // ID utilisateur 2, Directeur de Département
      );
      
      console.log('✅ Validateur créé avec succès!');
      console.log('   - Utilisateur ID: 2 (bo bi)');
      console.log('   - Sous-rôle: Directeur de Département');
    } else {
      console.log(`✅ ${check[0].cnt} validateur(s) déjà présent(s)`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
})();
