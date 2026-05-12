const db = require("../config/db");

// ===== HELPER: Transformer les données de BD au format frontend =====
const transformPreplan = (preplan, missionnaires = []) => {
  if (!preplan) return null;
  return {
    id: preplan.id_preplan,
    motif: preplan.motif,
    destination: preplan.destination,
    dateDepart: preplan.dateDepart,
    dateRetour: preplan.dateRetour,
    portee: preplan.portee,
    statut: preplan.statut_preplan,
    autoSubmission: preplan.delai_soumission_avant_depart,
    id_workflow: preplan.id_workflow,
    missionaires: missionnaires.map(m => ({
      nom: m.nom,
      prenom: m.prenom,
      email: m.email,
      fonction: m.fonction,
      estChefMission: m.est_chef_mission === 1
    }))
  };
};

// ===== HELPER: Obtenir l'id_demandeur à partir de l'id_utilisateur =====
const getIdDemandeur = async (id_utilisateur) => {
  const [demandeur] = await db.execute(
    "SELECT id_demandeur FROM demandeurs WHERE id_utilisateur = ?",
    [id_utilisateur]
  );
  return demandeur.length > 0 ? demandeur[0].id_demandeur : null;
};

/**
 * GET: Récupérer tous les workflows disponibles pour le formulaire
 */
exports.getWorkflows = async (req, res) => {
  try {
    const [workflows] = await db.execute(
      "SELECT id_workflow as id, nom_workflow as nom, description FROM workflows ORDER BY nom_workflow ASC"
    );
    res.status(200).json(workflows);
  } catch (error) {
    console.error("Erreur getWorkflows:", error);
    res.status(500).json({ message: "Erreur serveur", details: error.message });
  }
};

/**
 * GET: Récupérer toutes les missions préplanifiées pour un utilisateur admin
 */
exports.getAllPreplans = async (req, res) => {
  try {
    const query = `
      SELECT 
        mp.id_preplan,
        dm.id as id_demandemission,
        dm.motif,
        dm.destination,
        dm.dateDepart,
        dm.dateRetour,
        dm.portee,
        dm.id_workflow,
        mp.delai_soumission_avant_depart,
        mp.statut_preplan,
        mp.date_creation,
        mp.date_modification
      FROM missions_preplanifiees mp
      INNER JOIN demandemissions dm ON mp.id_demandemission = dm.id
      ORDER BY mp.date_creation DESC
    `;
    
    const [preplans] = await db.execute(query);
    
    // Enrichir chaque preplan avec ses missionnaires
    const enrichedPreplans = await Promise.all(
      preplans.map(async (preplan) => {
        const [missionnaires] = await db.execute(
          "SELECT * FROM missionnaires WHERE id_mission = ?",
          [preplan.id_demandemission]
        );
        return transformPreplan(preplan, missionnaires);
      })
    );

    res.status(200).json(enrichedPreplans);
  } catch (error) {
    console.error("Erreur getAllPreplans:", error);
    res.status(500).json({ message: "Erreur serveur", details: error.message });
  }
};

/**
 * GET: Récupérer une mission préplanifiée par son ID
 */
exports.getPreplanById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        mp.id_preplan,
        dm.id as id_demandemission,
        dm.motif,
        dm.destination,
        dm.dateDepart,
        dm.dateRetour,
        dm.portee,
        dm.id_workflow,
        mp.delai_soumission_avant_depart,
        mp.statut_preplan,
        mp.date_creation,
        mp.date_modification
      FROM missions_preplanifiees mp
      INNER JOIN demandemissions dm ON mp.id_demandemission = dm.id
      WHERE mp.id_preplan = ?
    `;

    const [preplan] = await db.execute(query, [id]);
    if (preplan.length === 0) {
      return res.status(404).json({ message: "Mission préplanifiée non trouvée" });
    }

    const [missionnaires] = await db.execute(
      "SELECT * FROM missionnaires WHERE id_mission = ?",
      [preplan[0].id_demandemission]
    );

    res.status(200).json(transformPreplan(preplan[0], missionnaires));
  } catch (error) {
    console.error("Erreur getPreplanById:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

/**
 * POST: Créer une nouvelle mission préplanifiée
 */
exports.createPreplan = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const {
      motif,
      destination,
      dateDepart,
      dateRetour,
      portee,
      autoSubmission,
      missionaires,
      id_workflow
    } = req.body;

    // Validation
    if (!motif || !destination || !dateDepart || !dateRetour || !portee) {
      connection.release();
      return res.status(400).json({ message: "Informations manquantes" });
    }

    if (!id_workflow) {
      connection.release();
      return res.status(400).json({ message: "Workflow requis" });
    }

    if (!missionaires || missionaires.length === 0) {
      connection.release();
      return res.status(400).json({ message: "Au moins un missionnaire requis" });
    }

    const hasChef = missionaires.some(m => m.estChefMission);
    if (!hasChef) {
      connection.release();
      return res.status(400).json({ message: "Un chef de mission doit être désigné" });
    }

    await connection.beginTransaction();

    try {
      // 1. Chercher le demandeur avec email "admindemandeur@gmail.com"
      const [demandeurs] = await connection.execute(
        `SELECT d.id_demandeur FROM demandeurs d 
         INNER JOIN utilisateurs u ON d.id_utilisateur = u.id_utilisateur 
         WHERE u.email = 'admindemandeur@gmail.com'`
      );

      let id_demandeur;
      if (demandeurs.length === 0) {
        // Créer le compte admindemandeur s'il n'existe pas
        const [userResult] = await connection.execute(
          `INSERT INTO utilisateurs 
           (nom, prenom, email, username, password, role, statut_compte)
           VALUES ('Admin', 'Demandeur', 'admindemandeur@gmail.com', 'admindemandeur', '$2b$10$U1Uh/Rt.wfWBnWdEpjDcY.sTKUaAghGR7HSR6csyYCUxe8Nfw/UB2', 'Demandeur', 'Actif')`
        );

        // Créer l'entrée demandeur
        const [demanderResult] = await connection.execute(
          `INSERT INTO demandeurs (id_utilisateur, emplacement)
           VALUES (?, 'Siège')`,
          [userResult.insertId]
        );

        id_demandeur = demanderResult.insertId;
      } else {
        id_demandeur = demandeurs[0].id_demandeur;
      }

      // 2. Créer l'entrée dans demandemissions avec statut 'Brouillon'
      const sqlDemandemission = `
        INSERT INTO demandemissions 
        (id_demandeurs, motif, destination, dateDepart, dateRetour, portee, id_workflow, statut)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Brouillon')
      `;

      const [resultDemande] = await connection.execute(sqlDemandemission, [
        id_demandeur,
        motif,
        destination,
        dateDepart,
        dateRetour,
        portee,
        id_workflow
      ]);

      const id_demandemission = resultDemande.insertId;

      // 3. Créer l'entrée dans missions_preplanifiees
      const sqlPreplan = `
        INSERT INTO missions_preplanifiees 
        (id_demandemission, delai_soumission_avant_depart, statut_preplan)
        VALUES (?, ?, 'Programmée')
      `;

      await connection.execute(sqlPreplan, [
        id_demandemission,
        autoSubmission || 5
      ]);

      // 4. Ajouter les missionnaires
      const sqlMissionnaire = `
        INSERT INTO missionnaires 
        (id_mission, nom, prenom, email, fonction, est_chef_mission)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      for (const m of missionaires) {
        await connection.execute(sqlMissionnaire, [
          id_demandemission,
          m.nom,
          m.prenom,
          m.email,
          m.fonction,
          m.estChefMission ? 1 : 0
        ]);
      }

      await connection.commit();

      res.status(201).json({
        message: "Mission préplanifiée créée avec succès",
        id: id_demandemission
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    console.error("Erreur createPreplan:", error);
    res.status(500).json({ message: "Erreur serveur", details: error.message });
  } finally {
    connection.release();
  }
};

/**
 * PUT: Modifier une mission préplanifiée
 */
exports.updatePreplan = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;
    const {
      motif,
      destination,
      dateDepart,
      dateRetour,
      portee,
      autoSubmission,
      missionaires,
      id_workflow
    } = req.body;

    // Validation
    if (!motif || !destination || !dateDepart || !dateRetour || !portee) {
      connection.release();
      return res.status(400).json({ message: "Informations manquantes" });
    }

    if (!id_workflow) {
      connection.release();
      return res.status(400).json({ message: "Workflow requis" });
    }

    if (!missionaires || missionaires.length === 0) {
      connection.release();
      return res.status(400).json({ message: "Au moins un missionnaire requis" });
    }

    const hasChef = missionaires.some(m => m.estChefMission);
    if (!hasChef) {
      connection.release();
      return res.status(400).json({ message: "Un chef de mission doit être désigné" });
    }

    await connection.beginTransaction();

    try {
      // 1. Récupérer l'id_demandemission associé
      const [preplan] = await connection.execute(
        "SELECT id_demandemission FROM missions_preplanifiees WHERE id_preplan = ?",
        [id]
      );

      if (preplan.length === 0) {
        connection.release();
        return res.status(404).json({ message: "Mission préplanifiée non trouvée" });
      }

      const id_demandemission = preplan[0].id_demandemission;

      // 2. Mettre à jour demandemissions
      const sqlUpdateDemande = `
        UPDATE demandemissions 
        SET motif = ?, destination = ?, dateDepart = ?, dateRetour = ?, portee = ?, id_workflow = ?
        WHERE id = ?
      `;

      await connection.execute(sqlUpdateDemande, [
        motif,
        destination,
        dateDepart,
        dateRetour,
        portee,
        id_workflow,
        id_demandemission
      ]);

      // 3. Mettre à jour missions_preplanifiees
      const sqlUpdatePreplan = `
        UPDATE missions_preplanifiees 
        SET delai_soumission_avant_depart = ?
        WHERE id_preplan = ?
      `;

      await connection.execute(sqlUpdatePreplan, [
        autoSubmission || 5,
        id
      ]);

      // 4. Supprimer les anciens missionnaires et en ajouter les nouveaux
      await connection.execute(
        "DELETE FROM missionnaires WHERE id_mission = ?",
        [id_demandemission]
      );

      const sqlMissionnaire = `
        INSERT INTO missionnaires 
        (id_mission, nom, prenom, email, fonction, est_chef_mission)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      for (const m of missionaires) {
        await connection.execute(sqlMissionnaire, [
          id_demandemission,
          m.nom,
          m.prenom,
          m.email,
          m.fonction,
          m.estChefMission ? 1 : 0
        ]);
      }

      await connection.commit();

      res.status(200).json({
        message: "Mission préplanifiée mise à jour avec succès"
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    console.error("Erreur updatePreplan:", error);
    res.status(500).json({ message: "Erreur serveur", details: error.message });
  } finally {
    connection.release();
  }
};

/**
 * DELETE: Supprimer une mission préplanifiée
 */
exports.deletePreplan = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id } = req.params;

    await connection.beginTransaction();

    try {
      // 1. Récupérer l'id_demandemission
      const [preplan] = await connection.execute(
        "SELECT id_demandemission FROM missions_preplanifiees WHERE id_preplan = ?",
        [id]
      );

      if (preplan.length === 0) {
        connection.release();
        return res.status(404).json({ message: "Mission préplanifiée non trouvée" });
      }

      const id_demandemission = preplan[0].id_demandemission;

      // 2. Supprimer les missionnaires
      await connection.execute(
        "DELETE FROM missionnaires WHERE id_mission = ?",
        [id_demandemission]
      );

      // 3. Supprimer de missions_preplanifiees
      await connection.execute(
        "DELETE FROM missions_preplanifiees WHERE id_preplan = ?",
        [id]
      );

      // 4. Supprimer de demandemissions
      await connection.execute(
        "DELETE FROM demandemissions WHERE id = ?",
        [id_demandemission]
      );

      await connection.commit();

      res.status(200).json({ message: "Mission préplanifiée supprimée avec succès" });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error) {
    console.error("Erreur deletePreplan:", error);
    res.status(500).json({ message: "Erreur serveur", details: error.message });
  } finally {
    connection.release();
  }
};
