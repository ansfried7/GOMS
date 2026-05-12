const pool = require('../config/db');

// ==================== GESTION DES UTILISATEURS ====================

exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT 
        u.id_utilisateur as id, 
        u.nom, 
        u.prenom, 
        u.email, 
        u.username,
        u.password,
        u.role, 
        u.statut_compte as statut,
        sr.nom_sous_role as sous_role,
        sr.id_sous_role,
        c.id_chauffeur,
        c.telephone,
        c.types_vehicules_autorises,
        c.statut_disponibilite as chauffeur_statut,
        c.photo_path as photo,
        c.photo_cip_path,
        vhl.id_vehicule,
        vhl.immatriculation,
        vhl.marque,
        vhl.type_vehicule,
        u.date_creation
      FROM utilisateurs u 
      LEFT JOIN validateurs v ON u.id_utilisateur = v.id_utilisateur
      LEFT JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role
      LEFT JOIN chauffeurs c ON u.id_utilisateur = c.id_utilisateur
      LEFT JOIN vehicules vhl ON c.id_chauffeur = vhl.id_chauffeur_attitré
      ORDER BY u.date_creation DESC
    `);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT 
        u.id_utilisateur as id, 
        u.nom, 
        u.prenom, 
        u.email, 
        u.username,
        u.password,
        u.role, 
        u.statut_compte as statut,
        sr.nom_sous_role as sous_role,
        sr.id_sous_role,
        c.telephone,
        c.types_vehicules_autorises,
        c.statut_disponibilite as chauffeur_statut,
        c.photo_path as photo,
        c.photo_cip_path,
        c.id_chauffeur,
        vhl.id_vehicule,
        vhl.immatriculation,
        vhl.marque,
        vhl.type_vehicule
      FROM utilisateurs u 
      LEFT JOIN validateurs v ON u.id_utilisateur = v.id_utilisateur
      LEFT JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role
      LEFT JOIN chauffeurs c ON u.id_utilisateur = c.id_utilisateur
      LEFT JOIN vehicules vhl ON c.id_chauffeur = vhl.id_chauffeur_attitré
      WHERE u.id_utilisateur = ?
    `, [req.params.id]);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const {
      nom, prenom, email, username, password, role, statut, telephone,
      types_vehicules, types_vehicules_autorises, chauffeur_statut,
      id_sous_role, id_vehicule, liaisonMode, photo_path, photo_cip_path
    } = req.body;
    
    // Vérifier si l'email existe déjà
    const [existingUser] = await pool.query(
      'SELECT id_utilisateur FROM utilisateurs WHERE email = ?', 
      [email]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    // Génération automatique des identifiants si non fournis
    const generatedUsername = username || (prenom.toLowerCase() + '.' + nom.toLowerCase() + Math.floor(Math.random() * 1000));
    const generatedPassword = password || Math.random().toString(36).slice(-8);

    // Stocker l'utilisateur
    const [result] = await pool.query(
      'INSERT INTO utilisateurs (nom, prenom, email, username, password, role, statut_compte) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nom, prenom, email, generatedUsername, generatedPassword, role, statut || 'Actif']
    );

    const userId = result.insertId;

    // Si c'est un validateur, créer l'entrée dans la table validateurs
    if (role === 'Validateur' && id_sous_role) {
      await pool.query(
        'INSERT INTO validateurs (id_utilisateur, id_sous_role) VALUES (?, ?)',
        [userId, id_sous_role]
      );
    }

    let chauffeurId = null;
    // Si c'est un chauffeur, créer l'entrée dans la table chauffeurs
    if (role === 'Chauffeur') {
      const [chauffeurResult] = await pool.query(
        'INSERT INTO chauffeurs (id_utilisateur, telephone, types_vehicules_autorises, statut_disponibilite, photo_path, photo_cip_path) VALUES (?, ?, ?, ?, ?, ?)',
        [
          userId,
          telephone || '',
          types_vehicules_autorises || types_vehicules || 'Tous',
          chauffeur_statut || 'Disponible',
          photo_path || null,
          photo_cip_path || null
        ]
      );
      chauffeurId = chauffeurResult.insertId;

      // Gérer la liaison immédiate si demandée
      if ((liaisonMode === 'choose' || id_vehicule) && id_vehicule) {
        await pool.query(
          'UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_vehicule = ?',
          [id_vehicule]
        );
        await pool.query(
          'UPDATE vehicules SET id_chauffeur_attitré = ? WHERE id_vehicule = ?',
          [chauffeurId, id_vehicule]
        );
      }
    }

    res.status(201).json({ 
      id: userId, 
      id_chauffeur: role === 'Chauffeur' ? chauffeurId : null,
      nom, 
      prenom, 
      email, 
      username: generatedUsername,
      password: generatedPassword, // Retourner le mot de passe pour affichage initial
      role, 
      statut: statut || 'Actif'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { 
      nom, prenom, email, username, password, role, statut, id_sous_role,
      telephone, types_vehicules_autorises, chauffeur_statut, photo_path, photo_cip_path, id_vehicule 
    } = req.body;
    const userId = req.params.id;

    // 1. Mettre à jour la table utilisateurs
    let updateQuery = 'UPDATE utilisateurs SET nom = ?, prenom = ?, email = ?, username = ?, role = ?, statut_compte = ?';
    let params = [nom, prenom, email, username, role, statut || 'Actif'];

    if (password) {
      updateQuery += ', password = ?';
      params.push(password);
    }
    updateQuery += ' WHERE id_utilisateur = ?';
    params.push(userId);
    await connection.query(updateQuery, params);

    // 2. Si c'est un validateur, mettre à jour le sous-rôle
    if (role === 'Validateur' && id_sous_role) {
      const [validateur] = await connection.query('SELECT id_validateur FROM validateurs WHERE id_utilisateur = ?', [userId]);
      if (validateur.length > 0) {
        await connection.query('UPDATE validateurs SET id_sous_role = ? WHERE id_utilisateur = ?', [id_sous_role, userId]);
      }
    }

    // 3. Si c'est un chauffeur, mettre à jour la table chauffeurs
    if (role === 'Chauffeur') {
      const [chauffeur] = await connection.query('SELECT id_chauffeur FROM chauffeurs WHERE id_utilisateur = ?', [userId]);
      if (chauffeur.length > 0) {
        const chauffeurId = chauffeur[0].id_chauffeur;
        await connection.query(
          'UPDATE chauffeurs SET telephone = ?, types_vehicules_autorises = ?, statut_disponibilite = ?, photo_path = ?, photo_cip_path = ? WHERE id_chauffeur = ?',
          [
            telephone || '',
            types_vehicules_autorises || 'Tous',
            chauffeur_statut || 'Disponible',
            photo_path || null,
            photo_cip_path || null,
            chauffeurId
          ]
        );

        if (id_vehicule !== undefined) {
          await connection.query('UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_chauffeur_attitré = ?', [chauffeurId]);
          if (id_vehicule) {
            await connection.query('UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_vehicule = ?', [id_vehicule]);
            await connection.query('UPDATE vehicules SET id_chauffeur_attitré = ? WHERE id_vehicule = ?', [chauffeurId, id_vehicule]);
          }
        }
      } else {
        const [createdChauffeur] = await connection.query(
          'INSERT INTO chauffeurs (id_utilisateur, telephone, types_vehicules_autorises, statut_disponibilite, photo_path, photo_cip_path) VALUES (?, ?, ?, ?, ?, ?)',
          [
            userId,
            telephone || '',
            types_vehicules_autorises || 'Tous',
            chauffeur_statut || 'Disponible',
            photo_path || null,
            photo_cip_path || null
          ]
        );

        if (id_vehicule) {
          await connection.query('UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_vehicule = ?', [id_vehicule]);
          await connection.query('UPDATE vehicules SET id_chauffeur_attitré = ? WHERE id_vehicule = ?', [createdChauffeur.insertId, id_vehicule]);
        }
      }
    }

    await connection.commit();
    res.json({ message: 'Utilisateur mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await pool.query('DELETE FROM utilisateurs WHERE id_utilisateur = ?', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== GESTION DES SOUS-RÔLES ====================

exports.getAllSubRoles = async (req, res) => {
  try {
    const [sousRoles] = await pool.query(`
      SELECT 
        sr.id_sous_role as id,
        sr.nom_sous_role as nom,
        sr.description,
        sr.date_creation,
        sr.date_modification
      FROM sous_roles sr
      ORDER BY sr.date_creation DESC
    `);

    // Récupérer les permissions pour chaque sous-rôle
    const result = [];
    for (const role of sousRoles) {
      const [permissions] = await pool.query(`
        SELECT p.id_permission as id, p.nom_permission as nom, p.description
        FROM permissions p
        JOIN sous_role_permissions srp ON p.id_permission = srp.id_permission
        WHERE srp.id_sous_role = ?
      `, [role.id]);
      
      role.permission_ids = permissions.map(p => p.id);
      role.permissions = permissions.map(p => p.nom);
      result.push(role);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSubRoleById = async (req, res) => {
  try {
    const [sousRole] = await pool.query(`
      SELECT 
        sr.id_sous_role as id,
        sr.nom_sous_role as nom,
        sr.description
      FROM sous_roles sr
      WHERE sr.id_sous_role = ?
    `, [req.params.id]);

    if (sousRole.length === 0) {
      return res.status(404).json({ error: 'Sous-rôle non trouvé' });
    }

    const role = sousRole[0];

    // Récupérer les permissions
    const [permissions] = await pool.query(`
      SELECT p.id_permission as id, p.nom_permission as nom, p.description
      FROM permissions p
      JOIN sous_role_permissions srp ON p.id_permission = srp.id_permission
      WHERE srp.id_sous_role = ?
    `, [role.id]);

    role.permission_ids = permissions.map(p => p.id);
    role.permissions = permissions.map(p => p.nom);

    res.json(role);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllPermissions = async (req, res) => {
  try {
    const [permissions] = await pool.query('SELECT id_permission as id, nom_permission as nom, description FROM permissions');
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createSubRole = async (req, res) => {
  try {
    const { nom, description, permission_ids } = req.body;

    const [result] = await pool.query(
      'INSERT INTO sous_roles (nom_sous_role, description) VALUES (?, ?)',
      [nom, description]
    );

    const subRoleId = result.insertId;

    // Ajouter les permissions
    if (permission_ids && permission_ids.length > 0) {
      for (const permId of permission_ids) {
        await pool.query(
          'INSERT INTO sous_role_permissions (id_sous_role, id_permission) VALUES (?, ?)',
          [subRoleId, permId]
        );
      }
    }

    res.status(201).json({ id: subRoleId, nom, description });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateSubRole = async (req, res) => {
  try {
    const { nom, description, permission_ids } = req.body;
    const subRoleId = req.params.id;

    await pool.query(
      'UPDATE sous_roles SET nom_sous_role = ?, description = ? WHERE id_sous_role = ?',
      [nom, description, subRoleId]
    );

    // Supprimer les anciennes permissions
    await pool.query('DELETE FROM sous_role_permissions WHERE id_sous_role = ?', [subRoleId]);

    // Ajouter les nouvelles permissions
    if (permission_ids && permission_ids.length > 0) {
      for (const permId of permission_ids) {
        await pool.query(
          'INSERT INTO sous_role_permissions (id_sous_role, id_permission) VALUES (?, ?)',
          [subRoleId, permId]
        );
      }
    }

    res.json({ id: subRoleId, nom, description });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteSubRole = async (req, res) => {
  try {
    const subRoleId = req.params.id;

    // Vérifier si le sous-rôle est utilisé dans les étapes du workflow
    const [etapesUsage] = await pool.query(
      'SELECT id_etape FROM etapes_workflow WHERE id_sous_role_requis = ?',
      [subRoleId]
    );

    if (etapesUsage.length > 0) {
      return res.status(400).json({ 
        error: 'Ce sous-rôle ne peut pas être supprimé car il est utilisé dans une ou plusieurs étapes du workflow' 
      });
    }

    await pool.query('DELETE FROM sous_roles WHERE id_sous_role = ?', [subRoleId]);
    res.json({ message: 'Sous-rôle supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== GESTION DES WORKFLOWS ====================

exports.getWorkflows = async (req, res) => {
  try {
    const [workflows] = await pool.query(`
      SELECT 
        w.id_workflow as id,
        w.nom_workflow as nom,
        w.description
      FROM workflows w
      ORDER BY w.id_workflow
    `);
    
    // Pour chaque workflow, récupérer ses étapes
    const parsedWorkflows = [];
    for (const workflow of workflows) {
      const [etapes] = await pool.query(`
        SELECT 
          ew.id_etape as id,
          ew.libelle_etape as libelle,
          ew.ordre_etape as ordre,
          ew.description_etape as description,
          sr.nom_sous_role as nom_sous_role,
          sr.id_sous_role as id_sous_role
        FROM etapes_workflow ew
        LEFT JOIN sous_roles sr ON ew.id_sous_role_requis = sr.id_sous_role
        WHERE ew.id_workflow = ?
        ORDER BY ew.ordre_etape
      `, [workflow.id]);
      
      parsedWorkflows.push({
        ...workflow,
        etapes: etapes || []
      });
    }
    
    res.json(parsedWorkflows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getWorkflowById = async (req, res) => {
  try {
    const [workflow] = await pool.query(`
      SELECT 
        w.id_workflow as id,
        w.nom_workflow as nom,
        w.description
      FROM workflows w
      WHERE w.id_workflow = ?
    `, [req.params.id]);

    if (workflow.length === 0) {
      return res.status(404).json({ error: 'Workflow non trouvé' });
    }

    const [etapes] = await pool.query(`
      SELECT 
        ew.id_etape as id,
        ew.libelle_etape as libelle,
        ew.ordre_etape as ordre,
        ew.description_etape as description,
        sr.nom_sous_role as sous_role,
        sr.id_sous_role as id_sous_role
      FROM etapes_workflow ew
      LEFT JOIN sous_roles sr ON ew.id_sous_role_requis = sr.id_sous_role
      WHERE ew.id_workflow = ?
      ORDER BY ew.ordre_etape
    `, [req.params.id]);

    res.json({ ...workflow[0], etapes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateWorkflow = async (req, res) => {
  try {
    const { id_workflow, etapes } = req.body;

    // Supprimer les anciennes étapes
    await pool.query('DELETE FROM etapes_workflow WHERE id_workflow = ?', [id_workflow]);

    // Ajouter les nouvelles étapes
    if (etapes && etapes.length > 0) {
      for (let i = 0; i < etapes.length; i++) {
        const etape = etapes[i];
        await pool.query(
          'INSERT INTO etapes_workflow (libelle_etape, ordre_etape, id_workflow, id_sous_role_requis, description_etape) VALUES (?, ?, ?, ?, ?)',
          [etape.libelle, i + 1, id_workflow, etape.id_sous_role, etape.description]
        );
      }
    }

    res.json({ message: 'Workflow mis à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== GESTION DES CHAUFFEURS ====================

exports.getAllChauffeurs = async (req, res) => {
  try {
    const [chauffeurs] = await pool.query(`
      SELECT 
        c.id_chauffeur as id,
        u.id_utilisateur,
        u.nom,
        u.prenom,
        u.email,
        u.username,
        c.telephone,
        c.types_vehicules_autorises,
        c.statut_disponibilite as statut,
        c.moyenne_notes as rating,
        (SELECT COUNT(*) FROM demandemissions WHERE id_chauffeur = c.id_chauffeur AND statut = 'Effectuée') as missions,
        c.photo_path as photo,
        c.photo_cip_path,
        v.id_vehicule,
        v.immatriculation,
        v.marque,
        v.type_vehicule,
        v.couleur,
        v.statut_disponibilite as vehicule_statut,
        v.consommation_100km,
        v.observations,
        u.statut_compte
      FROM chauffeurs c
      JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
      LEFT JOIN vehicules v ON c.id_chauffeur = v.id_chauffeur_attitré
      ORDER BY u.nom, u.prenom
    `);
    res.json(chauffeurs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getChauffeurById = async (req, res) => {
  try {
    const [chauffeur] = await pool.query(`
      SELECT 
        c.id_chauffeur as id,
        u.id_utilisateur,
        u.nom,
        u.prenom,
        u.email,
        u.username,
        c.telephone,
        c.types_vehicules_autorises,
        c.statut_disponibilite as statut,
        c.moyenne_notes as rating,
        (SELECT COUNT(*) FROM demandemissions WHERE id_chauffeur = c.id_chauffeur AND statut = 'Effectuée') as missions,
        c.photo_path as photo,
        c.photo_cip_path,
        v.id_vehicule,
        v.immatriculation,
        v.marque,
        v.type_vehicule,
        v.couleur,
        v.statut_disponibilite as vehicule_statut,
        v.consommation_100km,
        v.observations,
        v.photo_documents,
        v.statut_assurance,
        v.date_debut_assurance,
        v.date_fin_assurance,
        v.date_derniere_tvm,
        v.date_prochaine_tvm
      FROM chauffeurs c
      JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
      LEFT JOIN vehicules v ON c.id_chauffeur = v.id_chauffeur_attitré
      WHERE c.id_chauffeur = ?
    `, [req.params.id]);

    if (chauffeur.length === 0) {
      return res.status(404).json({ error: 'Chauffeur non trouvé' });
    }

    // Récupérer les notes récentes
    const [notes] = await pool.query(`
      SELECT 
        nc.note,
        nc.commentaire,
        nc.date_notation,
        m.nom as missionnaire_nom,
        m.prenom as missionnaire_prenom
      FROM notations_chauffeur nc
      LEFT JOIN missionnaires m ON nc.id_missionnaire_notant = m.id_missionnaire
      WHERE nc.id_chauffeur = ?
      ORDER BY nc.date_notation DESC
      LIMIT 5
    `, [req.params.id]);

    res.json({ ...chauffeur[0], notes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateChauffeur = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { telephone, types_vehicules_autorises, statut, photo_path, photo_cip_path, id_vehicule } = req.body;
    const chauffeurId = req.params.id;

    // 1. Mettre à jour les infos de base du chauffeur
    await connection.query(
      'UPDATE chauffeurs SET telephone = ?, types_vehicules_autorises = ?, statut_disponibilite = ?, photo_path = ?, photo_cip_path = ? WHERE id_chauffeur = ?',
      [telephone, types_vehicules_autorises, statut, photo_path, photo_cip_path, chauffeurId]
    );

    // 2. Gérer la liaison avec le véhicule (1:1)
    if (id_vehicule !== undefined) {
      // Désassigner l'ancien véhicule de ce chauffeur
      await connection.query(
        'UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_chauffeur_attitré = ?',
        [chauffeurId]
      );

      // Si un nouveau véhicule est spécifié (pas null)
      if (id_vehicule) {
        // Désassigner l'éventuel ancien chauffeur de ce véhicule
        await connection.query(
          'UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_vehicule = ?',
          [id_vehicule]
        );
        // Assigner le nouveau chauffeur
        await connection.query(
          'UPDATE vehicules SET id_chauffeur_attitré = ? WHERE id_vehicule = ?',
          [chauffeurId, id_vehicule]
        );
      }
    }

    await connection.commit();
    res.json({ message: 'Chauffeur mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

exports.updateLiaison = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id_chauffeur, id_vehicule } = req.body;

    // Désassigner l'ancien véhicule du chauffeur
    await connection.query(
      'UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_chauffeur_attitré = ?',
      [id_chauffeur]
    );

    // Si on veut lier à un véhicule
    if (id_vehicule) {
      // Désassigner l'ancien chauffeur du véhicule cible
      await connection.query(
        'UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_vehicule = ?',
        [id_vehicule]
      );
      // Créer le nouveau lien
      await connection.query(
        'UPDATE vehicules SET id_chauffeur_attitré = ? WHERE id_vehicule = ?',
        [id_chauffeur, id_vehicule]
      );
    }

    await connection.commit();
    res.json({ message: 'Liaison mise à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

// ==================== GESTION DES VÉHICULES ====================

exports.getAllVehicules = async (req, res) => {
  try {
    const [vehicules] = await pool.query(`
      SELECT 
        v.id_vehicule as id,
        v.immatriculation,
        v.marque,
        v.type_vehicule as type,
        v.couleur,
        v.statut_disponibilite as statut,
        v.consommation_100km as consommation,
        v.statut_assurance as assurance_statut,
        v.date_debut_assurance as assurance_debut,
        v.date_fin_assurance as assurance_fin,
        v.date_derniere_tvm as tvm_derniere,
        v.date_prochaine_tvm as tvm_prochaine,
        v.observations,
        v.photo_documents,
        c.id_chauffeur,
        u.nom as chauffeur_nom,
        u.prenom as chauffeur_prenom,
        u.email as chauffeur_email,
        c.telephone,
        c.types_vehicules_autorises,
        c.statut_disponibilite as chauffeur_statut,
        c.moyenne_notes as chauffeur_rating,
        c.photo_path as chauffeur_photo
      FROM vehicules v
      LEFT JOIN chauffeurs c ON v.id_chauffeur_attitré = c.id_chauffeur
      LEFT JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
      ORDER BY v.immatriculation
    `);
    res.json(vehicules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getVehiculeById = async (req, res) => {
  try {
    const [vehicule] = await pool.query(`
      SELECT 
        v.id_vehicule as id,
        v.immatriculation,
        v.marque,
        v.type_vehicule as type,
        v.couleur,
        v.statut_disponibilite as statut,
        v.consommation_100km as consommation,
        v.statut_assurance as assurance_statut,
        v.date_debut_assurance as assurance_debut,
        v.date_fin_assurance as assurance_fin,
        v.date_derniere_tvm as tvm_derniere,
        v.date_prochaine_tvm as tvm_prochaine,
        v.observations,
        v.photo_documents,
        c.id_chauffeur,
        u.nom as chauffeur_nom,
        u.prenom as chauffeur_prenom,
        u.email as chauffeur_email,
        c.telephone,
        c.types_vehicules_autorises,
        c.statut_disponibilite as chauffeur_statut,
        c.moyenne_notes as chauffeur_rating,
        c.photo_path as chauffeur_photo
      FROM vehicules v
      LEFT JOIN chauffeurs c ON v.id_chauffeur_attitré = c.id_chauffeur
      LEFT JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
      WHERE v.id_vehicule = ?
    `, [req.params.id]);

    if (vehicule.length === 0) {
      return res.status(404).json({ error: 'Véhicule non trouvé' });
    }

    const [historiqueVisites] = await pool.query(`
      SELECT
        id_visite_technique,
        id_chauffeur,
        statut_visite,
        km_depart,
        heure_depart,
        km_fin,
        heure_fin,
        cout_visite_technique,
        observation,
        date_creation,
        date_modification
      FROM visites_techniques
      WHERE id_vehicule = ?
        AND (statut_visite LIKE 'Effectu%' OR km_fin IS NOT NULL)
      ORDER BY date_modification DESC, date_creation DESC
      LIMIT 10
    `, [req.params.id]);

    res.json({
      ...vehicule[0],
      historique_visites: historiqueVisites
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createVehicule = async (req, res) => {
  try {
    const { 
      immatriculation, marque, type, type_vehicule, couleur, statut, consommation,
      assurance_statut, assurance_debut, assurance_fin, tvm_derniere, tvm_prochaine,
      observations, photo_documents, id_chauffeur
    } = req.body;

    const finalType = type_vehicule || type;

    const [result] = await pool.query(
      `INSERT INTO vehicules (
        immatriculation, marque, type_vehicule, couleur, statut_disponibilite,
        consommation_100km, statut_assurance, date_debut_assurance, date_fin_assurance,
        date_derniere_tvm, date_prochaine_tvm, observations, photo_documents,
        id_chauffeur_attitré
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        immatriculation, 
        marque, 
        finalType, 
        couleur || null, 
        statut || 'Disponible',
        consommation || null, 
        assurance_statut || 'Assuré',
        assurance_debut || '2026-01-01', 
        assurance_fin || '2026-12-31',
        tvm_derniere || '2026-01-02', 
        tvm_prochaine || '2027-01-05',
        observations || '', 
        photo_documents || '', 
        id_chauffeur || null
      ]
    );

    res.status(201).json({ 
      id: result.insertId, 
      immatriculation, 
      marque, 
      type_vehicule 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateVehicule = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const {
      immatriculation, marque, type, type_vehicule, couleur, statut, consommation,
      assurance_statut, assurance_debut, assurance_fin, tvm_derniere, tvm_prochaine,
      observations, photo_documents, id_chauffeur
    } = req.body;
    
    const finalType = type_vehicule || type;
    const vehiculeId = req.params.id;

    // 1. Mettre à jour les infos du véhicule
    await connection.query(
      `UPDATE vehicules SET 
        immatriculation = ?, marque = ?, type_vehicule = ?, couleur = ?,
        statut_disponibilite = ?, consommation_100km = ?, statut_assurance = ?,
        date_debut_assurance = ?, date_fin_assurance = ?, date_derniere_tvm = ?,
        date_prochaine_tvm = ?, observations = ?, photo_documents = ?
      WHERE id_vehicule = ?`,
      [
        immatriculation, marque, finalType, couleur, statut,
        consommation, assurance_statut, assurance_debut, assurance_fin,
        tvm_derniere, tvm_prochaine, observations, photo_documents,
        vehiculeId
      ]
    );

    // 2. Gérer la liaison avec le chauffeur (1:1)
    if (id_chauffeur !== undefined) {
      // Désassigner l'ancien chauffeur de ce véhicule
      // Pas besoin, l'UPDATE ci-dessous s'en charge pour ce véhicule

      // Si un nouveau chauffeur est spécifié (pas null)
      if (id_chauffeur) {
        // Désassigner le chauffeur de son éventuel ancien véhicule
        await connection.query(
          'UPDATE vehicules SET id_chauffeur_attitré = NULL WHERE id_chauffeur_attitré = ?',
          [id_chauffeur]
        );
      }

      // Mettre à jour le lien sur le véhicule actuel
      await connection.query(
        'UPDATE vehicules SET id_chauffeur_attitré = ? WHERE id_vehicule = ?',
        [id_chauffeur || null, vehiculeId]
      );
    }

    await connection.commit();
    res.json({ message: 'Véhicule mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

exports.deleteVehicule = async (req, res) => {
  try {
    await pool.query('DELETE FROM vehicules WHERE id_vehicule = ?', [req.params.id]);
    res.json({ message: 'Véhicule supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== GESTION DES GRILLES TARIFAIRES ====================

exports.getAllTarifs = async (req, res) => {
  try {
    const [tarifs] = await pool.query(`
      SELECT 
        gt.id_grille as id,
        csp.nom_categorie as categorie,
        csp.id_categorie,
        gt.portee_mission as portee,
        gt.type_sejour,
        gt.tarif,
        gt.devise
      FROM grilles_tarifaires gt
      JOIN categories_socio_professionnelles csp ON gt.id_categorie = csp.id_categorie
      ORDER BY csp.ordre_tri, gt.portee_mission, gt.type_sejour
    `);
    res.json(tarifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTarifsByPortee = async (req, res) => {
  try {
    const { portee } = req.query;
    const [tarifs] = await pool.query(`
      SELECT 
        gt.id_grille as id,
        csp.nom_categorie as categorie,
        csp.id_categorie,
        gt.portee_mission as portee,
        gt.type_sejour,
        gt.tarif,
        gt.devise
      FROM grilles_tarifaires gt
      JOIN categories_socio_professionnelles csp ON gt.id_categorie = csp.id_categorie
      WHERE gt.portee_mission = ?
      ORDER BY csp.ordre_tri, gt.type_sejour
    `, [portee]);
    res.json(tarifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const [categories] = await pool.query(`
      SELECT 
        id_categorie as id,
        nom_categorie as nom,
        ordre_tri as ordre
      FROM categories_socio_professionnelles
      ORDER BY ordre_tri ASC
    `);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateTarif = async (req, res) => {
  try {
    const { tarif, devise } = req.body;
    
    await pool.query(
      'UPDATE grilles_tarifaires SET tarif = ?, devise = ? WHERE id_grille = ?',
      [tarif, devise || 'XOF', req.params.id]
    );

    res.json({ message: 'Tarif mis à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.calculateMissionFees = async (req, res) => {
  try {
    const { categorie_socio_pro, portee_mission, duree_nuit } = req.body;

    let types_sejour = [];
    if (duree_nuit > 0) {
      // Utiliser les libellés exacts de la BD
      if (portee_mission === 'National') {
        types_sejour.push('Hébergement (Nuitée)');
        types_sejour.push('Restauration (Nuitée)');
      } else if (portee_mission === 'Continental') {
        types_sejour.push('Hébergement (Afrique)');
        types_sejour.push('Restauration (Afrique)');
      } else if (portee_mission === 'International') {
        types_sejour.push('Hébergement (Int.)');
        types_sejour.push('Restauration (Int.)');
      }
    } else {
      // Sans nuitée (uniquement pour missions nationales)
      if (portee_mission === 'National') {
        types_sejour.push('Restauration (Sans Nuitée)');
      }
    }

    const placeholders = types_sejour.map(() => '?').join(',');
    
    const [tarifs] = await pool.query(`
      SELECT 
        type_sejour,
        tarif
      FROM grilles_tarifaires gt
      JOIN categories_socio_professionnelles csp ON gt.id_categorie = csp.id_categorie
      WHERE csp.nom_categorie = ? AND gt.portee_mission = ? AND gt.type_sejour IN (${placeholders})
    `, [categorie_socio_pro, portee_mission, ...types_sejour]);

    let total = 0;
    const details = {};
    tarifs.forEach(t => {
      let montant = t.tarif;
      // 📅 Hébergement: multiplié par nombre de NUITS
      if (t.type_sejour.includes('Hébergement')) {
        montant *= duree_nuit;
      } 
      // 🍽️ Restauration: multiplié par nombre de JOURS (nuits + 1)
      else if (t.type_sejour.includes('Restauration')) {
        montant *= (duree_nuit + 1);
      }
      details[t.type_sejour] = montant;
      total += montant;
    });

    res.json({ total, details });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== GESTION DES MISSIONS PRÉPLANIFIÉES ====================

exports.getAllMissionsPreplanifiees = async (req, res) => {
  try {
    const [missions] = await pool.query(`
      SELECT 
        mp.id_preplan as id,
        mp.motif,
        mp.destination,
        mp.date_depart,
        mp.date_retour,
        mp.portee,
        mp.statut_preplan as statut,
        mp.delai_soumission_avant_depart as delai,
        COUNT(mpm.id) as nombre_missionnaires,
        u.nom as admin_nom,
        u.prenom as admin_prenom
      FROM missions_preplanifiees mp
      LEFT JOIN missionnaires_preplan mpm ON mp.id_preplan = mpm.id_preplan
      JOIN utilisateurs u ON mp.id_administrateur = u.id_utilisateur
      GROUP BY mp.id_preplan
      ORDER BY mp.date_depart DESC
    `);
    res.json(missions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMissionPreplanifieeById = async (req, res) => {
  try {
    const [mission] = await pool.query(`
      SELECT 
        mp.id_preplan as id,
        mp.motif,
        mp.destination,
        mp.date_depart,
        mp.date_retour,
        mp.portee,
        mp.statut_preplan as statut,
        mp.delai_soumission_avant_depart as delai,
        u.nom as admin_nom,
        u.prenom as admin_prenom
      FROM missions_preplanifiees mp
      JOIN utilisateurs u ON mp.id_administrateur = u.id_utilisateur
      WHERE mp.id_preplan = ?
    `, [req.params.id]);

    if (mission.length === 0) {
      return res.status(404).json({ error: 'Mission préplanifiée non trouvée' });
    }

    const [missionnaires] = await pool.query(`
      SELECT 
        id,
        nom,
        prenom,
        fonction,
        email,
        est_chef_mission as est_chef,
        categorie_socio_pro as categorie
      FROM missionnaires_preplan
      WHERE id_preplan = ?
    `, [req.params.id]);

    res.json({ ...mission[0], missionnaires });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createMissionPreplanifiee = async (req, res) => {
  try {
    const { motif, destination, date_depart, date_retour, portee, delai, id_administrateur, missionnaires } = req.body;

    const [result] = await pool.query(
      `INSERT INTO missions_preplanifiees (
        motif, destination, date_depart, date_retour, portee, 
        delai_soumission_avant_depart, id_administrateur, statut_preplan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Programmée')`,
      [motif, destination, date_depart, date_retour, portee, delai, id_administrateur]
    );

    const missionId = result.insertId;

    // Ajouter les missionnaires
    if (missionnaires && missionnaires.length > 0) {
      for (const m of missionnaires) {
        await pool.query(
          `INSERT INTO missionnaires_preplan (
            id_preplan, nom, prenom, fonction, email, est_chef_mission, categorie_socio_pro
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [missionId, m.nom, m.prenom, m.fonction, m.email, m.est_chef ? 1 : 0, m.categorie]
        );
      }
    }

    res.status(201).json({ id: missionId, motif, destination, portee });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateMissionPreplanifiee = async (req, res) => {
  try {
    const { motif, destination, date_depart, date_retour, portee, delai, missionnaires } = req.body;
    const missionId = req.params.id;

    await pool.query(
      `UPDATE missions_preplanifiees SET 
        motif = ?, destination = ?, date_depart = ?, date_retour = ?,
        portee = ?, delai_soumission_avant_depart = ?
      WHERE id_preplan = ?`,
      [motif, destination, date_depart, date_retour, portee, delai, missionId]
    );

    // Mettre à jour les missionnaires
    if (missionnaires) {
      await pool.query('DELETE FROM missionnaires_preplan WHERE id_preplan = ?', [missionId]);
      
      for (const m of missionnaires) {
        await pool.query(
          `INSERT INTO missionnaires_preplan (
            id_preplan, nom, prenom, fonction, email, est_chef_mission, categorie_socio_pro
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [missionId, m.nom, m.prenom, m.fonction, m.email, m.est_chef ? 1 : 0, m.categorie]
        );
      }
    }

    res.json({ message: 'Mission préplanifiée mise à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMissionPreplanifiee = async (req, res) => {
  try {
    await pool.query('DELETE FROM missions_preplanifiees WHERE id_preplan = ?', [req.params.id]);
    res.json({ message: 'Mission préplanifiée supprimée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== AFFECTATION DE RESSOURCES ====================

exports.getAvailableResources = async (req, res) => {
  try {
    const [resources] = await pool.query(`
      SELECT 
        c.id_chauffeur,
        u.nom as chauffeur_nom,
        u.prenom as chauffeur_prenom,
        c.statut_disponibilite,
        c.moyenne_notes as rating,
        c.nombre_missions,
        v.id_vehicule,
        v.immatriculation,
        v.marque,
        v.type_vehicule,
        v.couleur,
        v.statut_disponibilite as vehicule_statut
      FROM chauffeurs c
      JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
      LEFT JOIN vehicules v ON c.id_chauffeur = v.id_chauffeur_attitré
      WHERE c.statut_disponibilite = 'Disponible' AND v.statut_disponibilite = 'Disponible'
      ORDER BY c.nombre_missions ASC, c.moyenne_notes DESC
    `);
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.affectResourceToMission = async (req, res) => {
  try {
    const { id_ordre, id_chauffeur, id_vehicule } = req.body;

    // Mettre à jour l'ordre de mission avec le chauffeur et le véhicule
    await pool.query(
      'UPDATE ordres_missions SET id_chauffeur = ?, id_vehicule = ? WHERE id_ordre = ?',
      [id_chauffeur, id_vehicule, id_ordre]
    );

    // Mettre à jour les statuts de disponibilité
    await pool.query(
      'UPDATE chauffeurs SET statut_disponibilite = ?, nombre_missions = nombre_missions + 1 WHERE id_chauffeur = ?',
      ['Affecté', id_chauffeur]
    );

    await pool.query(
      'UPDATE vehicules SET statut_disponibilite = ? WHERE id_vehicule = ?',
      ['Affecté', id_vehicule]
    );

    res.json({ message: 'Ressources affectées à la mission' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== DASHBOARD STATISTIQUES ====================

exports.getSuiviChauffeurs = async (req, res) => {
  try {
    const [suivi] = await pool.query(`
      SELECT 
        c.id_chauffeur as id,
        u.nom,
        u.prenom,
        c.photo_path as photo,
        c.statut_disponibilite as statut_dispo,
        dm.id as id_demande,
        dm.statut as statut_mission,
        om.id_ordre,
        dm.reference as missionRef,
        dm.motif,
        dm.destination,
        dm.dateDepart,
        dm.dateRetour,
        v.immatriculation as vehicule_immatriculation,
        v.marque as vehicule_marque,
        v.type_vehicule as vehicule_type,
        (SELECT kilometrage FROM enregistrements_km_chauffeur WHERE id_demandemission = dm.id AND type = 'debut' ORDER BY date_creation DESC LIMIT 1) as km_depart,
        (SELECT kilometrage FROM enregistrements_km_chauffeur WHERE id_demandemission = dm.id AND type = 'fin' ORDER BY date_creation DESC LIMIT 1) as km_arrivee,
        (SELECT SUM(quantite_carburant) FROM enregistrements_carburation WHERE id_demandemission = dm.id) as total_carburant,
        notation.note,
        notation.commentaire,
        notation.date_notation
      FROM demandemissions dm
      JOIN chauffeurs c ON dm.id_chauffeur = c.id_chauffeur
      JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
      LEFT JOIN ordres_missions om ON dm.id = om.id_demande
      LEFT JOIN vehicules v ON dm.id_vehicule = v.id_vehicule
      LEFT JOIN notations_chauffeur notation
        ON notation.id_notation = (
          SELECT nc.id_notation
          FROM notations_chauffeur nc
          WHERE nc.id_demande = dm.id AND nc.note IS NOT NULL
          ORDER BY nc.date_notation DESC, nc.id_notation DESC
          LIMIT 1
        )
      WHERE dm.statut IN ('Validée', 'En cours', 'Effectuée')
      GROUP BY dm.id
      ORDER BY dm.dateDepart ASC
    `);
    res.json(suivi);
  } catch (error) {
    console.error('Error in getSuiviChauffeurs:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getMaintenanceVehicles = async (req, res) => {
  try {
    const { from, to, type } = req.query; // period: YYYY-MM
    
    let query = `
      SELECT 
        v.id_vehicule as id,
        v.immatriculation,
        v.marque,
        v.type_vehicule as type,
        v.date_fin_assurance as echeance_assurance,
        v.date_prochaine_tvm as echeance_tvm,
        v.statut_disponibilite as statut,
        u.nom as chauffeur_nom,
        u.prenom as chauffeur_prenom
      FROM vehicules v
      LEFT JOIN chauffeurs c ON v.id_chauffeur_attitré = c.id_chauffeur
      LEFT JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
      WHERE 1=1
    `;
    
    const params = [];
    
    if (from && to) {
      if (type === 'Assurance') {
        query += ` AND v.date_fin_assurance BETWEEN ? AND ?`;
        params.push(from, to);
      } else if (type === 'Visite Technique') {
        query += ` AND v.date_prochaine_tvm BETWEEN ? AND ?`;
        params.push(from, to);
      } else {
        query += ` AND (v.date_fin_assurance BETWEEN ? AND ? OR v.date_prochaine_tvm BETWEEN ? AND ?)`;
        params.push(from, to, from, to);
      }
    }

    const [results] = await pool.query(query, params);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // 1. Statistiques Globales (Cartes du haut)
    const [usersCount] = await pool.query('SELECT COUNT(*) as count FROM utilisateurs WHERE statut_compte = "Actif"');
    const [demandsCount] = await pool.query('SELECT COUNT(*) as count FROM demandemissions WHERE statut NOT IN ("Effectuée", "Rejetée")');
    const [activeMissionsCount] = await pool.query('SELECT COUNT(*) as count FROM ordres_missions WHERE statut_ordre = "En cours"');
    const [pendingValidationsCount] = await pool.query('SELECT COUNT(*) as count FROM validations WHERE decision = "En attente"');

    // Stats spécifiques logistique
    const [totalChauffeurs] = await pool.query('SELECT COUNT(*) as count FROM chauffeurs');
    const [chauffeursDispo] = await pool.query('SELECT COUNT(*) as count FROM chauffeurs WHERE statut_disponibilite = "Disponible"');
    const [totalVehicules] = await pool.query('SELECT COUNT(*) as count FROM vehicules');
    const [vehiculesDispo] = await pool.query('SELECT COUNT(*) as count FROM vehicules WHERE statut_disponibilite = "Disponible"');

    // ... (rest of the function)

    // 2. Répartition des utilisateurs (Chauffeurs, Demandeurs, Validateurs, Admins)
    const [usersByRole] = await pool.query(`
      SELECT role, COUNT(*) as count 
      FROM utilisateurs 
      WHERE statut_compte = 'Actif' 
      GROUP BY role
    `);

    // 3. Statistiques Missions (Prévues, En cours, Effectuées)
    // Prévues = Validées mais pas encore en cours
    // En cours = statut 'En cours'
    // Effectuées = statut 'Effectuée'
    const [missionsStats] = await pool.query(`
      SELECT 
        SUM(CASE WHEN statut = 'Validée' THEN 1 ELSE 0 END) as planned,
        SUM(CASE WHEN statut = 'En cours' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN statut = 'Effectuée' THEN 1 ELSE 0 END) as completed
      FROM demandemissions
    `);

    // 4. Statistiques Ressources (Disponibilité)
    const [chauffeurStatus] = await pool.query('SELECT statut_disponibilite as statut, COUNT(*) as count FROM chauffeurs GROUP BY statut_disponibilite');
    const [vehiculeStatus] = await pool.query('SELECT statut_disponibilite as statut, COUNT(*) as count FROM vehicules GROUP BY statut_disponibilite');

    // 5. Statistiques Validations
    const [validationStats] = await pool.query(`
      SELECT 
        SUM(CASE WHEN decision = 'Approuvé' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN decision = 'Rejeté' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN decision = 'En attente' THEN 1 ELSE 0 END) as pending
      FROM validations
    `);

    // 6. Statistiques détaillées par étape de workflow (Taux d'acceptation)
    const [workflowStepStats] = await pool.query(`
      SELECT 
        ew.libelle_etape as label,
        SUM(CASE WHEN v.decision = 'Approuvé' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN v.decision = 'Rejeté' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN v.decision = 'En attente' THEN 1 ELSE 0 END) as pending
      FROM etapes_workflow ew
      LEFT JOIN validations v ON ew.id_etape = v.id_etape
      GROUP BY ew.id_etape, ew.libelle_etape
      ORDER BY ew.ordre_etape
    `);

    // 7. Activité Récente (10 derniers événements mixés)
    const [recentDemands] = await pool.query(`
      SELECT 
        'demand' as type,
        id,
        motif as description,
        created_at as date,
        statut
      FROM demandemissions
      ORDER BY created_at DESC
      LIMIT 5
    `);

    const [recentValidations] = await pool.query(`
      SELECT 
        'validation' as type,
        v.id_validation as id,
        CONCAT('Décision ', v.decision, ' pour la mission #', IFNULL(dm.reference, dm.id)) as description,
        v.date_validation as date,
        v.decision as statut
      FROM validations v
      JOIN ordres_missions om ON v.id_ordre = om.id_ordre
      JOIN demandemissions dm ON om.id_demande = dm.id
      WHERE v.decision != 'En attente'
      ORDER BY v.date_validation DESC
      LIMIT 5
    `);

    const [recentUsers] = await pool.query(`
      SELECT 
        'user' as type,
        id_utilisateur as id,
        CONCAT('Nouvel utilisateur : ', prenom, ' ', nom) as description,
        date_creation as date,
        role as statut
      FROM utilisateurs
      ORDER BY date_creation DESC
      LIMIT 5
    `);

    // Fusionner et trier les activités
    const activities = [...recentDemands, ...recentValidations, ...recentUsers]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    res.json({
      summary: {
        users: usersCount[0].count,
        demands: demandsCount[0].count,
        activeMissions: activeMissionsCount[0].count,
        pendingValidations: pendingValidationsCount[0].count
      },
      usersByRole,
      missions: missionsStats[0],
      resources: {
        chauffeurs: chauffeurStatus,
        vehicules: vehiculeStatus
      },
      validations: validationStats[0],
      workflowStepStats,
      activities
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==================== GESTION DES DEMANDEURS ====================

exports.getAllDemandeurs = async (req, res) => {
  try {
    const [demandeurs] = await pool.query(`
      SELECT 
        d.id_demandeur as id,
        u.nom,
        u.prenom,
        u.email,
        d.emplacement,
        d.localite,
        d.date_creation
      FROM demandeurs d
      INNER JOIN utilisateurs u ON d.id_utilisateur = u.id_utilisateur
      ORDER BY u.nom, u.prenom ASC
    `);
    res.json(demandeurs);
  } catch (error) {
    console.error('Erreur getAllDemandeurs:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getMissionEnregistrements = async (req, res) => {
  try {
    const { missionId } = req.params;
    
    const [kmRecords] = await pool.query(`
      SELECT 'km' as category, id_enregistrement_km as id, type, kilometrage, date_creation
      FROM enregistrements_km_chauffeur
      WHERE id_demandemission = ?
      ORDER BY date_creation ASC
    `, [missionId]);

    const [carbRecords] = await pool.query(`
      SELECT 'carburation' as category, id_carburation as id, 'en_cours' as type, quantite_carburant, km_carburation as kilometrage, date_creation
      FROM enregistrements_carburation
      WHERE id_demandemission = ?
      ORDER BY date_creation ASC
    `, [missionId]);

    const allRecords = [...kmRecords, ...carbRecords].sort((a, b) => new Date(a.date_creation) - new Date(b.date_creation));
    
    res.json(allRecords);
  } catch (error) {
    console.error('Error in getMissionEnregistrements:', error);
    res.status(500).json({ error: error.message });
  }
};


