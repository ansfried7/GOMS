const db = require("../config/db");

// ═══════════════════════════════════════════════════════════════════════
// � HELPER: Récupérer les permissions d'un utilisateur
// ═══════════════════════════════════════════════════════════════════════
const getUserPermissions = async (id_utilisateur) => {
  try {
    const [result] = await db.execute(
      `SELECT DISTINCT p.nom_permission
       FROM validateurs v
       JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role
       JOIN sous_role_permissions srp ON sr.id_sous_role = srp.id_sous_role
       JOIN permissions p ON srp.id_permission = p.id_permission
       WHERE v.id_utilisateur = ?`,
      [id_utilisateur]
    );
    return result.map(r => r.nom_permission);
  } catch (error) {
    console.error("❌ Erreur getUserPermissions:", error);
    return [];
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 📋 GET DEMANDES EN ATTENTE DE VALIDATION POUR UN VALIDATEUR
// ═══════════════════════════════════════════════════════════════════════
exports.getDemandesEnAttente = async (req, res) => {
  try {
    const { id_utilisateur } = req.params;

    // 1️⃣ Récupérer le validateur et son sous-rôle
    const [validateurs] = await db.execute(
      `SELECT v.id_validateur, v.id_sous_role, sr.nom_sous_role
       FROM validateurs v
       JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role
       WHERE v.id_utilisateur = ?`,
      [id_utilisateur]
    );

    if (validateurs.length === 0) {
      return res.status(403).json({ message: "Vous n'êtes pas un validateur" });
    }

    const validateur = validateurs[0];
    const id_sous_role = validateur.id_sous_role;

    // 2️⃣ Récupérer toutes les étapes attendues du workflow pour ce sous-rôle
    const [etapes] = await db.execute(
      `SELECT id_etape, id_workflow, ordre_etape, libelle_etape 
       FROM etapes_workflow 
       WHERE id_sous_role_requis = ?`,
      [id_sous_role]
    );

    if (etapes.length === 0) {
      return res.json([]);
    }

    // 3️⃣ Pour chaque étape, récupérer les demandes en attente
    //    ⚠️ RÈGLE : un validateur ne voit une demande que si TOUTES les étapes
    //    précédentes ont déjà été validées (décision = 'VALIDÉE').
    const demandesEnAttente = [];

    for (const etape of etapes) {
      const [demandes] = await db.execute(
        `SELECT 
          dm.id,
          dm.reference,
          dm.id_demandeurs,
          dm.motif,
          dm.destination,
          dm.dateDepart,
          dm.dateRetour,
          dm.portee,
          dm.statut,
          dm.id_workflow,
          dm.created_at,
          u.nom,
          u.prenom,
          ? as etape_nom,
          ? as ordre_etape
        FROM demandemissions dm
        JOIN demandeurs d ON dm.id_demandeurs = d.id_demandeur
        JOIN utilisateurs u ON d.id_utilisateur = u.id_utilisateur
        WHERE dm.id_workflow = ? 
          AND dm.statut != 'Brouillon'
          AND dm.statut = 'En attente'
          -- ✅ Mon étape n'a pas encore été traitée
          AND NOT EXISTS (
            SELECT 1 FROM validations 
            WHERE id_demande = dm.id 
            AND id_etape = ?
          )
          -- ✅ Toutes les étapes PRÉCÉDENTES ont été validées (VALIDÉE)
          AND (
            SELECT COUNT(*) 
            FROM etapes_workflow ew_prev
            WHERE ew_prev.id_workflow = dm.id_workflow
              AND ew_prev.ordre_etape < ?
          ) = (
            SELECT COUNT(*) 
            FROM validations v_prev
            JOIN etapes_workflow ew_prev ON v_prev.id_etape = ew_prev.id_etape
            WHERE v_prev.id_demande = dm.id
              AND ew_prev.id_workflow = dm.id_workflow
              AND ew_prev.ordre_etape < ?
              AND v_prev.decision = 'VALIDÉE'
          )
        ORDER BY dm.created_at ASC`,
        [etape.libelle_etape, etape.ordre_etape, etape.id_workflow, etape.id_etape, etape.ordre_etape, etape.ordre_etape]
      );

      for (const demande of demandes) {
        // Récupérer les missionnaires
        const [missionnaires] = await db.execute(
          `SELECT id_missionnaire, nom, prenom, fonction, email, est_chef_mission, categorie_socio_pro 
           FROM missionnaires 
           WHERE id_mission = ?`,
          [demande.id]
        );

        demandesEnAttente.push({
          ...demande,
          missionnaires,
          id_etape: etape.id_etape
        });
      }
    }

    res.status(200).json(demandesEnAttente);
  } catch (error) {
    console.error("❌ Erreur getDemandesEnAttente:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// ✅ VALIDER UNE ÉTAPE DU WORKFLOW
// ═══════════════════════════════════════════════════════════════════════
exports.validerEtape = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id_demande, id_etape, id_utilisateur, commentaire = null, signature = null } = req.body;

    if (!id_demande || !id_etape || !id_utilisateur) {
      connection.release();
      return res.status(400).json({ message: "Paramètres manquants" });
    }

    // Vérifier permissions
    const permissions = await getUserPermissions(id_utilisateur);
    if (!permissions.includes('VALIDER_MISSION')) {
      connection.release();
      return res.status(403).json({ message: "Vous n'avez pas la permission de valider" });
    }

    await connection.beginTransaction();

    // 0️⃣ Récupérer la demande et l'étape attendue
    const [demandes] = await connection.execute(
      `SELECT dm.*, ew.libelle_etape, ew.id_sous_role_requis, ew.ordre_etape, ew.id_etape as etape_attendue_id
       FROM demandemissions dm
       -- Trouver la prochaine étape non validée
       JOIN etapes_workflow ew ON ew.id_workflow = dm.id_workflow
       WHERE dm.id = ? 
         AND NOT EXISTS (
           SELECT 1 FROM validations v 
           WHERE v.id_demande = dm.id AND v.id_etape = ew.id_etape AND v.decision = 'VALIDÉE'
         )
       ORDER BY ew.ordre_etape ASC
       LIMIT 1`,
      [id_demande]
    );

    if (demandes.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ message: "Demande non trouvée ou déjà entièrement validée" });
    }

    const demande = demandes[0];

    // 🔐 SÉCURITÉ: Vérifier que l'étape soumise est bien l'étape attendue
    if (parseInt(id_etape) !== demande.etape_attendue_id) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ message: "Cette étape n'est pas l'étape actuelle du workflow pour cette demande" });
    }

    // 🔐 SÉCURITÉ: Vérifier que l'utilisateur a le sous-rôle requis pour cette étape
    const [validateurCheck] = await connection.execute(
      `SELECT id_validateur FROM validateurs WHERE id_utilisateur = ? AND id_sous_role = ?`,
      [id_utilisateur, demande.id_sous_role_requis]
    );

    if (validateurCheck.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({ message: "Vous n'avez pas le rôle requis pour valider cette étape spécifique" });
    }

    const nomEtapeActuelle = demande.libelle_etape;

    // ⚠️ RÈGLE: Si l'étape est "CSMG - Affectation Ressources" et portée est "National"
    // alors il FAUT que chauffeur et véhicule soient affectés avant de valider
    if (nomEtapeActuelle && nomEtapeActuelle.includes('CSMG') && demande.portee === 'National') {
      const [ordre] = await connection.execute(
        `SELECT id_chauffeur, id_vehicule FROM demandemissions WHERE id = ?`,
        [id_demande]
      );

      if (ordre.length > 0 && (!ordre[0].id_chauffeur || !ordre[0].id_vehicule)) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ 
          message: "Chauffeur et véhicule doivent être affectés avant de valider cette étape" 
        });
      }
    }

    // 1️⃣ Créer l'enregistrement de validation
    await connection.execute(
      `INSERT INTO validations (id_demande, id_etape, id_utilisateur, decision, commentaire, signature, date_validation)
       VALUES (?, ?, ?, 'VALIDÉE', ?, ?, NOW())`,
      [id_demande, id_etape, id_utilisateur, commentaire, signature]
    );

    // 2️⃣ Récupérer le workflow et l'étape actuelle
    const [demandes2] = await connection.execute(
      `SELECT dm.id_workflow FROM demandemissions dm WHERE dm.id = ?`,
      [id_demande]
    );

    const id_workflow = demandes2[0].id_workflow;

    // 3️⃣ Vérifier s'il y a une prochaine étape
    const [prochaines] = await connection.execute(
      `SELECT id_etape, ordre_etape, libelle_etape, id_sous_role_requis
       FROM etapes_workflow 
       WHERE id_workflow = ? AND ordre_etape > (
         SELECT ordre_etape FROM etapes_workflow WHERE id_etape = ?
       )
       ORDER BY ordre_etape ASC
       LIMIT 1`,
      [id_workflow, id_etape]
    );

    if (prochaines.length > 0) {
      // Il y a une prochaine étape, la demande reste "En attente"
      console.log("✅ Étape validée, passage à l'étape suivante");
      
      // Mettre à jour l'updated_at pour indiquer une progression
      await connection.execute(
        `UPDATE demandemissions SET updated_at = NOW() WHERE id = ?`,
        [id_demande]
      );
    } else {
      // C'est la dernière étape, la demande est complètement validée
      await connection.execute(
        `UPDATE demandemissions SET statut = 'Validée', updated_at = NOW() WHERE id = ?`,
        [id_demande]
      );
      console.log("✅ Demande complètement validée!");
    }

    await connection.commit();

    res.status(200).json({
      message: "Étape validée avec succès",
      nextStep: prochaines.length > 0 ? prochaines[0] : null
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Erreur validerEtape:", error);
    res.status(500).json({ message: "Erreur lors de la validation", error: error.message });
  } finally {
    connection.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// ❌ REJETER UNE ÉTAPE DU WORKFLOW
// ═══════════════════════════════════════════════════════════════════════
exports.rejeterEtape = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id_demande, id_etape, id_utilisateur, motif_rejet } = req.body;

    if (!id_demande || !id_etape || !id_utilisateur || !motif_rejet) {
      connection.release();
      return res.status(400).json({ message: "Paramètres manquants ou motif de rejet vide" });
    }

    // Vérifier permissions
    const permissions = await getUserPermissions(id_utilisateur);
    if (!permissions.includes('REJETER_MISSION')) {
      connection.release();
      return res.status(403).json({ message: "Vous n'avez pas la permission de rejeter" });
    }

    await connection.beginTransaction();

    // 0️⃣ Vérification de sécurité (Identique à la validation)
    const [demandes] = await connection.execute(
      `SELECT dm.*, ew.id_etape as etape_attendue_id, ew.id_sous_role_requis
       FROM demandemissions dm
       JOIN etapes_workflow ew ON ew.id_workflow = dm.id_workflow
       WHERE dm.id = ? 
         AND NOT EXISTS (
           SELECT 1 FROM validations v 
           WHERE v.id_demande = dm.id AND v.id_etape = ew.id_etape AND v.decision = 'VALIDÉE'
         )
       ORDER BY ew.ordre_etape ASC
       LIMIT 1`,
      [id_demande]
    );

    if (demandes.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ message: "Demande introuvable ou workflow inactif" });
    }

    const demande = demandes[0];

    if (parseInt(id_etape) !== demande.etape_attendue_id) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ message: "Action impossible : l'étape ne correspond pas au workflow actuel" });
    }

    const [validateurCheck] = await connection.execute(
      `SELECT id_validateur FROM validateurs WHERE id_utilisateur = ? AND id_sous_role = ?`,
      [id_utilisateur, demande.id_sous_role_requis]
    );

    if (validateurCheck.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({ message: "Désolé, vous n'êtes pas autorisé à rejeter à cette étape du workflow" });
    }

    // 1️⃣ Créer l'enregistrement de validation avec décision REJETÉE
    await connection.execute(
      `INSERT INTO validations (id_demande, id_etape, id_utilisateur, decision, commentaire, date_validation)
       VALUES (?, ?, ?, 'REJETÉE', ?, NOW())`,
      [id_demande, id_etape, id_utilisateur, motif_rejet]
    );

    // 2️⃣ Marquer la demande comme rejetée
    await connection.execute(
      `UPDATE demandemissions SET statut = 'Rejetée', updated_at = NOW() WHERE id = ?`,
      [id_demande]
    );

    await connection.commit();

    res.status(200).json({
      message: "Demande rejetée avec succès"
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Erreur rejeterEtape:", error);
    res.status(500).json({ message: "Erreur lors du rejet", error: error.message });
  } finally {
    connection.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 🔐 GET PERMISSIONS D'UN UTILISATEUR
// ═══════════════════════════════════════════════════════════════════════
exports.getUserPermissions = async (req, res) => {
  try {
    const { id_utilisateur } = req.params;

    const permissions = await getUserPermissions(id_utilisateur);

    res.status(200).json({
      permissions
    });
  } catch (error) {
    console.error("❌ Erreur getUserPermissions:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 📜 GET HISTORIQUE DES VALIDATIONS D'UN VALIDATEUR
// ═══════════════════════════════════════════════════════════════════════
exports.getHistoriqueValidations = async (req, res) => {
  try {
    const { id_utilisateur } = req.params;

    const [validations] = await db.execute(
      `SELECT 
        v.id_validation,
        v.id_demande,
        v.decision,
        v.commentaire,
        v.date_validation,
        ew.libelle_etape as etape_nom,
        dm.reference,
        dm.motif,
        dm.destination,
        u.nom,
        u.prenom
      FROM validations v
      JOIN etapes_workflow ew ON v.id_etape = ew.id_etape
      JOIN demandemissions dm ON v.id_demande = dm.id
      JOIN demandeurs d ON dm.id_demandeurs = d.id_demandeur
      JOIN utilisateurs u ON d.id_utilisateur = u.id_utilisateur
      WHERE v.id_utilisateur = ?
      ORDER BY v.date_validation DESC
      LIMIT 100`,
      [id_utilisateur]
    );

    res.status(200).json(validations);
  } catch (error) {
    console.error("❌ Erreur getHistoriqueValidations:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 📋 GET DÉTAILS D'UNE DEMANDE POUR VALIDATION + PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════
exports.getDetailDemande = async (req, res) => {
  try {
    const { id_demande, id_utilisateur } = req.params;

    // Récupérer la demande
    const [demandes] = await db.execute(
      `SELECT 
        dm.id,
        dm.reference,
        dm.id_demandeurs,
        dm.motif,
        dm.destination,
        dm.dateDepart,
        dm.dateRetour,
        dm.portee,
        dm.statut,
        dm.id_workflow,
        dm.est_ordre_mission,
        dm.categorie_socio_pro_principale,
        dm.id_ordre_lié,
        dm.id_chauffeur,
        dm.id_vehicule,
        dm.created_at,
        dm.updated_at,
        u.nom,
        u.prenom,
        u.email
      FROM demandemissions dm
      JOIN demandeurs d ON dm.id_demandeurs = d.id_demandeur
      JOIN utilisateurs u ON d.id_utilisateur = u.id_utilisateur
      WHERE dm.id = ?`,
      [id_demande]
    );

    if (demandes.length === 0) {
      return res.status(404).json({ message: "Demande non trouvée" });
    }

    const demande = demandes[0];

    // 🔥 IMPORTANT: Récupérer l'étape actuelle du workflow à valider (première étape non validée)
    const [etapes] = await db.execute(
      `SELECT 
        ew.id_etape,
        ew.libelle_etape,
        ew.ordre_etape,
        ew.id_sous_role_requis,
        sr.nom_sous_role
      FROM etapes_workflow ew
      LEFT JOIN sous_roles sr ON ew.id_sous_role_requis = sr.id_sous_role
      WHERE ew.id_workflow = ? 
        AND NOT EXISTS (
          SELECT 1 FROM validations v 
          WHERE v.id_demande = ? 
          AND v.id_etape = ew.id_etape 
          AND v.decision = 'VALIDÉE'
        )
      ORDER BY ew.ordre_etape ASC
      LIMIT 1`,
      [demande.id_workflow, id_demande]
    );

    const etapeActuelle = etapes.length > 0 ? etapes[0] : null;

    // Récupérer les missionnaires (incluant les frais calculés)
    const [missionnaires] = await db.execute(
      `SELECT id_missionnaire, nom, prenom, fonction, email, est_chef_mission, categorie_socio_pro, frais_hebergement, frais_restauration
       FROM missionnaires 
       WHERE id_mission = ?`,
      [id_demande]
    );

    // Récupérer l'historique de validation
    const [validations] = await db.execute(
      `SELECT 
        v.id_validation,
        v.id_etape,
        v.decision,
        v.commentaire,
        v.motif_rejet,
        v.date_validation,
        ew.libelle_etape as etape_nom,
        ew.ordre_etape,
        u.nom as validateur_nom,
        u.prenom as validateur_prenom
      FROM validations v
      LEFT JOIN etapes_workflow ew ON v.id_etape = ew.id_etape
      LEFT JOIN utilisateurs u ON v.id_utilisateur = u.id_utilisateur
      WHERE v.id_demande = ?
      ORDER BY v.date_validation ASC`,
      [id_demande]
    );

    // 🔐 Récupérer les permissions de l'utilisateur
    const permissions = id_utilisateur ? await getUserPermissions(id_utilisateur) : [];

    res.status(200).json({
      ...demande,
      etape_actuelle: etapeActuelle,
      missionnaires,
      validations,
      commentaires: [],
      permissions
    });

  } catch (error) {
    console.error("❌ Erreur getDetailDemande:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 📋 GET MISSIONS VALIDÉES PAR UN VALIDATEUR
// ═══════════════════════════════════════════════════════════════════════
exports.getMissionsValidees = async (req, res) => {
  try {
    const { id_utilisateur } = req.params;

    // Récupérer toutes les demandes où ce validateur a enregistré une validation
    const [missions] = await db.execute(
      `SELECT DISTINCT
        dm.id,
        dm.reference,
        dm.id_demandeurs,
        dm.motif,
        dm.destination,
        dm.dateDepart,
        dm.dateRetour,
        dm.portee,
        dm.statut,
        dm.created_at,
        u.nom,
        u.prenom,
        v.date_validation,
        v.decision,
        ew.libelle_etape
      FROM validations v
      JOIN demandemissions dm ON v.id_demande = dm.id
      JOIN demandeurs d ON dm.id_demandeurs = d.id_demandeur
      JOIN utilisateurs u ON d.id_utilisateur = u.id_utilisateur
      JOIN etapes_workflow ew ON v.id_etape = ew.id_etape
      WHERE v.id_utilisateur = ? 
      ORDER BY v.date_validation DESC
      LIMIT 50`,
      [id_utilisateur]
    );

    res.status(200).json(missions);
  } catch (error) {
    console.error("❌ Erreur getMissionsValidees:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};
