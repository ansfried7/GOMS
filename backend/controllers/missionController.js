const db = require("../config/db");
const PDFDocument = require('pdfkit');

// ===== HELPERS =====
const safe = (v) => (v === undefined ? null : v);

const transformMission = (mission) => {
  if (!mission) return null;
  return {
    id: mission.id,
    id_demandeurs: mission.id_demandeurs,
    reference: mission.reference,
    motif: mission.motif,
    destination: mission.destination,
    dateDepart: mission.dateDepart,
    dateRetour: mission.dateRetour,
    portee: mission.portee,
    statut: mission.statut,
    est_ordre_mission: mission.est_ordre_mission,
    id_chauffeur: mission.id_chauffeur,
    id_vehicule: mission.id_vehicule,
    categorie_socio_pro_principale: mission.categorie_socio_pro_principale,
    created_at: mission.created_at,
    updated_at: mission.updated_at,
  };
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { id_demandeurs } = req.params; // id_utilisateur du frontend

    // 🔍 Chercher le id_demandeur correspondant à l'id_utilisateur
    const [demandeurs] = await db.execute(
      `SELECT id_demandeur FROM demandeurs WHERE id_utilisateur = ?`,
      [id_demandeurs]
    );

    if (demandeurs.length === 0) {
      return res.status(200).json({
        stats: { enAttente: 0, validees: 0, rejetees: 0 },
        missions: []
      });
    }

    const id_demandeur = demandeurs[0].id_demandeur;

    const [stats] = await db.execute(
      `SELECT 
          COUNT(CASE WHEN statut = 'En attente' THEN 1 END) as enAttente,
          COUNT(CASE WHEN statut = 'Validée' THEN 1 END) as validees,
          COUNT(CASE WHEN statut = 'Rejetée' THEN 1 END) as rejetees
       FROM demandemissions WHERE id_demandeurs = ?`,
      [id_demandeur],
    );

    const [missions] = await db.execute(
      `SELECT * FROM demandemissions 
       WHERE id_demandeurs = ? AND statut != 'Brouillon'
       ORDER BY created_at DESC LIMIT 10`,
      [id_demandeur],
    );

    res.status(200).json({
      stats: stats[0] || { enAttente: 0, validees: 0, rejetees: 0 },
      missions: missions.map(transformMission),
    });
  } catch (error) {
    console.error("Erreur getDashboardStats:", error);
    res.status(500).json({ message: "Erreur dashboard" });
  }
};

exports.createDemande = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const {
      id,
      id_demandeurs, // id_utilisateur du frontend
      motif,
      destination,
      dateDepart,
      dateRetour,
      portee,
      statut,
      missionnaires,
    } = req.body;

    if (!id && !id_demandeurs) {
      connection.release();
      return res.status(400).json({ message: "ID demandeur manquant." });
    }

    await connection.beginTransaction();

    let id_demande = id;
    let id_demandeur = null;
    let reference = null;

    // 🔍 Chercher ou créer le demandeur basé sur id_utilisateur
    let emplacement_demandeur = 'Siège'; // par défaut

    if (!id) {
      const [demandeurs] = await connection.execute(
        `SELECT id_demandeur, emplacement FROM demandeurs WHERE id_utilisateur = ?`,
        [id_demandeurs]
      );

      if (demandeurs.length > 0) {
        // Demandeur existe déjà
        id_demandeur = demandeurs[0].id_demandeur;
        emplacement_demandeur = demandeurs[0].emplacement;
      } else {
        // Créer un nouvel enregistrement dans demandeurs
        const [userInfo] = await connection.execute(
          `SELECT nom, prenom FROM utilisateurs WHERE id_utilisateur = ?`,
          [id_demandeurs]
        );

        const [insertResult] = await connection.execute(
          `INSERT INTO demandeurs (id_utilisateur, emplacement, localite, date_creation) 
           VALUES (?, ?, ?, NOW())`,
          [id_demandeurs, 'Siège', null]
        );
        id_demandeur = insertResult.insertId;
        emplacement_demandeur = 'Siège';
      }
    } else {
      // Si on met à jour une demande, récupérer l'emplacement du demandeur existant
      const [demandeurs] = await connection.execute(
        `SELECT d.emplacement FROM demandeurs d 
         JOIN demandemissions dm ON d.id_demandeur = dm.id_demandeurs 
         WHERE dm.id = ?`,
        [id]
      );
      if (demandeurs.length > 0) {
        emplacement_demandeur = demandeurs[0].emplacement;
      }
    }

    // Déterminer le workflow en fonction de l'emplacement du demandeur
    let workflow_id = 1; // Par défaut Siège
    if (emplacement_demandeur === 'Usine') workflow_id = 2;

    if (id) {
      // MODIFICATION - mise à jour des champs
      // On s'assure que id_workflow est aussi mis à jour si portee change
      const sqlUpdate = `
        UPDATE demandemissions 
        SET motif = ?, destination = ?, dateDepart = ?, dateRetour = ?, portee = ?, statut = ?, id_workflow = ?
        WHERE id = ?
      `;
      await connection.execute(sqlUpdate, [
        safe(motif),
        safe(destination),
        safe(dateDepart),
        safe(dateRetour),
        safe(portee),
        safe(statut),
        workflow_id,
        id,
      ]);
      
      // Supprimer les anciens missionnaires
      await connection.execute("DELETE FROM missionnaires WHERE id_mission = ?", [id]);
    } else {
      // CRÉATION - nouvelle demande
      const sqlInsert = `
        INSERT INTO demandemissions 
        (id_demandeurs, motif, destination, dateDepart, dateRetour, portee, statut, id_workflow, est_ordre_mission, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
      `;

      const [result] = await connection.execute(sqlInsert, [
        id_demandeur,
        safe(motif),
        safe(destination),
        safe(dateDepart),
        safe(dateRetour),
        safe(portee),
        safe(statut) || "Brouillon",
        workflow_id,
      ]);
      id_demande = result.insertId;
      
      // Générer et mettre à jour la référence
      const annee = new Date().getFullYear();
      reference = `DM-${annee}-${id_demande.toString().padStart(4, "0")}`;
      await connection.execute(
        "UPDATE demandemissions SET reference = ? WHERE id = ?",
        [reference, id_demande]
      );
      
      // 🔗 CRÉER AUTOMATIQUEMENT L'ENTRÉE ORDRE LIÉE À CETTE DEMANDE
      await connection.execute(
        `INSERT INTO ordres_missions (id_demande, moyen_transport_libelle, statut_ordre, date_creation_ordre) 
         VALUES (?, 'Transport routier', 'En attente', NOW())`,
        [id_demande]
      );
    }

    // Ajouter les missionnaires
    if (missionnaires && missionnaires.length > 0) {
      const sqlMissionnaire = `
        INSERT INTO missionnaires 
        (id_mission, nom, prenom, email, fonction, est_chef_mission, date_creation) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;
      for (const m of missionnaires) {
        const estChef = m.est_chef_mission ? 1 : 0;
        await connection.execute(sqlMissionnaire, [
          id_demande,
          safe(m.nom),
          safe(m.prenom),
          safe(m.email),
          safe(m.fonction),
          estChef,
        ]);
      }
    }

    await connection.commit();
    
    // Récupérer la mission créée/modifiée pour retourner les données complètes
    const [missionResult] = await connection.execute(
      "SELECT * FROM demandemissions WHERE id = ?",
      [id_demande]
    );
    
    const mission = missionResult[0];
    res.status(id ? 200 : 201).json({ 
      message: id ? "Demande mise à jour" : "Demande créée",
      data: transformMission(mission)
    });
  } catch (error) {
    await connection.rollback();
    console.error("Erreur createDemande:", error);
    res.status(500).json({ message: "Erreur serveur", details: error.message });
  } finally {
    connection.release();
  }
};

exports.getMissionById = async (req, res) => {
  try {
    const { id } = req.params;
    const [mission] = await db.execute(
      "SELECT * FROM demandemissions WHERE id = ?",
      [id],
    );
    if (mission.length === 0)
      return res.status(404).json({ message: "Mission non trouvée" });
    
    const [missionnaires] = await db.execute(
      "SELECT * FROM missionnaires WHERE id_mission = ?",
      [id],
    );
    
    res.status(200).json({ 
      ...transformMission(mission[0]), 
      missionnaires 
    });
  } catch (error) {
    console.error("Erreur getMissionById:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.getBrouillons = async (req, res) => {
  try {
    const { id_demandeurs } = req.params;
    
    // 🔍 Chercher le id_demandeur correspondant à l'id_utilisateur
    const [demandeurs] = await db.execute(
      `SELECT id_demandeur FROM demandeurs WHERE id_utilisateur = ?`,
      [id_demandeurs]
    );

    if (demandeurs.length === 0) {
      return res.status(200).json([]);
    }

    const id_demandeur = demandeurs[0].id_demandeur;
    
    const [rows] = await db.execute(
      "SELECT * FROM demandemissions WHERE id_demandeurs = ? AND statut = 'Brouillon' ORDER BY created_at DESC",
      [id_demandeur],
    );
    res.status(200).json(rows.map(transformMission));
  } catch (error) {
    console.error("Erreur getBrouillons:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.getAllMissions = async (req, res) => {
  try {
    const { id_demandeurs } = req.params;
    
    // 🔍 Chercher le id_demandeur correspondant à l'id_utilisateur
    const [demandeurs] = await db.execute(
      `SELECT id_demandeur FROM demandeurs WHERE id_utilisateur = ?`,
      [id_demandeurs]
    );

    if (demandeurs.length === 0) {
      return res.status(200).json([]);
    }

    const id_demandeur = demandeurs[0].id_demandeur;
    
    const [rows] = await db.execute(
      "SELECT * FROM demandemissions WHERE id_demandeurs = ? AND statut != 'Brouillon' ORDER BY created_at DESC",
      [id_demandeur],
    );
    res.status(200).json(rows.map(transformMission));
  } catch (error) {
    console.error("Erreur getAllMissions:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.deleteMission = async (req, res) => {
  try {
    await db.execute(`DELETE FROM demandemissions WHERE id = ?`, [
      req.params.id,
    ]);
    res.status(200).json({ message: "Mission supprimée avec succès" });
  } catch (error) {
    console.error("Erreur deleteMission:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// � SAUVEGARDER CATÉGORIES SOCIO-PRO DES MISSIONNAIRES
// ═══════════════════════════════════════════════════════════════════════
exports.updateMissionnairesCategories = async (req, res) => {
  try {
    const { id_demande, categories, categories_par_missionnaire } = req.body;
    
    // Accepter les deux formats de payload
    const categoriesArray = categories || categories_par_missionnaire || [];

    if (!id_demande || !Array.isArray(categoriesArray)) {
      return res.status(400).json({ message: "Paramètres manquants" });
    }

    // Mettre à jour les catégories pour chaque missionnaire
    for (const cat of categoriesArray) {
      if (cat.id_missionnaire) {
        // Accepter les deux clés pour la catégorie
        const categorieValue = cat.categorie || cat.categorie_socio_pro || null;
        if (categorieValue) {
          await db.execute(
            `UPDATE missionnaires SET categorie_socio_pro = ? WHERE id_missionnaire = ? AND id_mission = ?`,
            [categorieValue, cat.id_missionnaire, id_demande]
          );
        }
      }
    }

    res.status(200).json({
      message: "Catégories socio-professionnelles mises à jour avec succès"
    });

  } catch (error) {
    console.error("❌ Erreur updateMissionnairesCategories:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// �📝 CRÉER ORDRE DE MISSION À PARTIR D'UNE DEMANDE (ASSISTANT DRH)
// ═══════════════════════════════════════════════════════════════════════
exports.createOrdreFromDemande = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { 
      id_demande, 
      categorie_socio_pro_principale, 
      categories_par_missionnaire = [] 
    } = req.body;

    if (!id_demande) {
      connection.release();
      return res.status(400).json({ message: "ID demande manquant" });
    }

    await connection.beginTransaction();

    // 1️⃣ Récupérer la demande
    const [demandes] = await connection.execute(
      `SELECT * FROM demandemissions WHERE id = ?`,
      [id_demande]
    );

    if (demandes.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ message: "Demande non trouvée" });
    }

    const demande = demandes[0];

    // 2️⃣ Marquer la demande comme un ordre de mission (UNE SEULE DEMANDE = UN ORDRE)
    await connection.execute(
      `UPDATE demandemissions SET est_ordre_mission = 1, categorie_socio_pro_principale = ? WHERE id = ?`,
      [categorie_socio_pro_principale || null, id_demande]
    );

    // 3️⃣ Mettre à jour les catégories des missionnaires
    for (const missionnaire of categories_par_missionnaire) {
      await connection.execute(
        `UPDATE missionnaires SET categorie_socio_pro = ? WHERE id_missionnaire = ?`,
        [missionnaire.categorie_socio_pro || missionnaire.categorie || 'Cadre', missionnaire.id_missionnaire]
      );
    }
    
    // Si pas de catégories individuelles, utiliser la catégorie principale
    if (categories_par_missionnaire.length === 0 && categorie_socio_pro_principale) {
      await connection.execute(
        `UPDATE missionnaires SET categorie_socio_pro = ? WHERE id_mission = ?`,
        [categorie_socio_pro_principale, id_demande]
      );
    }

    // 4️⃣ Mettre à jour l'ordre associé
    await connection.execute(
      `UPDATE ordres_missions SET statut_ordre = 'En cours de création' WHERE id_demande = ?`,
      [id_demande]
    );

    // ⚠️ IMPORTANT: Les frais vont être générés/mis à jour automatiquement
    // lors de la transition vers les étapes suivantes

    await connection.commit();

    // Récupérer la demande mise à jour
    const [demandeUpdated] = await connection.execute(
      `SELECT * FROM demandemissions WHERE id = ?`,
      [id_demande]
    );

    // Récupérer les missionnaires
    const [missionnairesUpdated] = await connection.execute(
      `SELECT * FROM missionnaires WHERE id_mission = ?`,
      [id_demande]
    );

    const demandeTransformee = transformMission(demandeUpdated[0]);
    demandeTransformee.missionnaires = missionnairesUpdated;
    demandeTransformee.est_ordre_mission = demandeUpdated[0].est_ordre_mission;

    res.status(200).json({
      message: "Ordre de mission créé avec succès",
      data: demandeTransformee,
      id_ordre: id_demande
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Erreur createOrdreFromDemande:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  } finally {
    connection.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 📋 GET ORDRES DE MISSION EN ATTENTE (POUR ASSISTANT DRH & CO)
// ═══════════════════════════════════════════════════════════════════════
exports.getOrdresMission = async (req, res) => {
  try {
    const { id_utilisateur } = req.params;

    // Récupérer l'utilisateur pour vérifier son rôle
    const [utilisateurs] = await db.execute(
      `SELECT id_utilisateur FROM utilisateurs WHERE id_utilisateur = ?`,
      [id_utilisateur]
    );

    if (utilisateurs.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Récupérer les ordres de mission en attente
    const [ordres] = await db.execute(
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
        dm.est_ordre_mission,
        dm.categorie_socio_pro_principale,
        dm.created_at,
        dm.updated_at,
        u.nom,
        u.prenom
      FROM demandemissions dm
      JOIN demandeurs d ON dm.id_demandeurs = d.id_demandeur
      JOIN utilisateurs u ON d.id_utilisateur = u.id_utilisateur
      WHERE dm.est_ordre_mission = 1 
        AND dm.statut IN ('En attente', 'Validée')
      ORDER BY dm.created_at DESC`
    );

    // Pour chaque ordre, récupérer ses missionnaires et ressources
    const ordresDetailles = [];
    for (const ordre of ordres) {
      const [missionnaires] = await db.execute(
        `SELECT id_missionnaire, nom, prenom, fonction, email, categorie_socio_pro 
         FROM missionnaires WHERE id_mission = ?`,
        [ordre.id]
      );

      const [affectation] = await db.execute(
        `SELECT id_chauffeur, id_vehicule, statut_affectation FROM affectations_ressources WHERE id_mission = ?`,
        [ordre.id]
      );

      ordresDetailles.push({
        ...ordre,
        missionnaires,
        affectation: affectation.length > 0 ? affectation[0] : null
      });
    }

    res.status(200).json(ordresDetailles);

  } catch (error) {
    console.error("❌ Erreur getOrdresMission:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 📋 GET DEMANDES REJETÉES D'UN DEMANDEUR
// ═══════════════════════════════════════════════════════════════════════
exports.getDemandesRejetees = async (req, res) => {
  try {
    const { id_demandeurs } = req.params;

    // 🔍 Chercher le id_demandeur correspondant à l'id_utilisateur
    const [demandeurs] = await db.execute(
      `SELECT id_demandeur FROM demandeurs WHERE id_utilisateur = ?`,
      [id_demandeurs]
    );

    if (demandeurs.length === 0) {
      return res.status(200).json([]);
    }

    const id_demandeur = demandeurs[0].id_demandeur;

    const [demandes] = await db.execute(
      `SELECT 
        dm.id,
        dm.reference,
        dm.motif,
        dm.destination,
        dm.dateDepart,
        dm.dateRetour,
        dm.portee,
        dm.statut,
        dm.motif_rejet,
        dm.id_validateur_rejet,
        dm.created_at,
        dm.updated_at,
        u.nom as validateur_nom,
        u.prenom as validateur_prenom
      FROM demandemissions dm
      LEFT JOIN utilisateurs u ON dm.id_validateur_rejet = u.id_utilisateur
      WHERE dm.id_demandeurs = ? AND dm.statut = 'Rejetée'
      ORDER BY dm.updated_at DESC`,
      [id_demandeur]
    );

    // Pour chaque demande rejetée, ajouter l'historique complet
    const demandesAvecHistorique = [];
    for (const demande of demandes) {
      const [validations] = await db.execute(
        `SELECT 
          v.id_validation,
          v.decision,
          v.commentaire,
          v.date_validation,
          ew.libelle_etape,
          u.nom as validateur_nom,
          u.prenom as validateur_prenom
        FROM validations v
        LEFT JOIN etapes_workflow ew ON v.id_etape = ew.id_etape
        LEFT JOIN utilisateurs u ON v.id_utilisateur = u.id_utilisateur
        WHERE v.id_demande = ?
        ORDER BY v.date_validation ASC`,
        [demande.id]
      );

      demandesAvecHistorique.push({
        ...demande,
        validations
      });
    }

    res.status(200).json(demandesAvecHistorique);

  } catch (error) {
    console.error("❌ Erreur getDemandesRejetees:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// ✏️ METTRE À JOUR ORDRE DE MISSION (DRH - MODIFICATION)
// ═══════════════════════════════════════════════════════════════════════
exports.updateOrdre = async (req, res) => {
  try {
    const {
      id_demande,
      motif,
      destination,
      dateDepart,
      dateRetour,
      portee,
      categorie_socio_pro_principale,
      missionnaires = []
    } = req.body;

    if (!id_demande) {
      return res.status(400).json({ message: "ID demande manquant" });
    }

    // Récupérer l'emplacement du demandeur associé à cette demande
    const [demandeInfo] = await db.execute(
      `SELECT d.emplacement FROM demandeurs d 
       JOIN demandemissions dm ON d.id_demandeur = dm.id_demandeurs 
       WHERE dm.id = ?`,
      [id_demande]
    );

    let workflow_id = 1; // Par défaut Siège
    if (demandeInfo.length > 0 && demandeInfo[0].emplacement === 'Usine') {
      workflow_id = 2;
    }

    // Mettre à jour l'ordre
    await db.execute(
      `UPDATE demandemissions 
       SET motif = ?, destination = ?, dateDepart = ?, dateRetour = ?, 
           portee = ?, categorie_socio_pro_principale = ?, id_workflow = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        safe(motif), 
        safe(destination), 
        safe(dateDepart), 
        safe(dateRetour), 
        safe(portee), 
        safe(categorie_socio_pro_principale), 
        workflow_id,
        safe(id_demande)
      ]
    );

    // Mettre à jour les missionnaires si fournis
    if (missionnaires.length > 0) {
      for (const missionnaire of missionnaires) {
        await db.execute(
          `UPDATE missionnaires 
           SET nom = ?, prenom = ?, fonction = ?, email = ?, categorie_socio_pro = ?
           WHERE id_missionnaire = ?`,
          [
            missionnaire.nom,
            missionnaire.prenom,
            missionnaire.fonction,
            missionnaire.email,
            missionnaire.categorie_socio_pro,
            missionnaire.id_missionnaire
          ]
        );
      }
    }

    res.status(200).json({
      message: "Ordre de mission mise à jour avec succès"
    });

  } catch (error) {
    console.error("❌ Erreur updateOrdre:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 🚗 AFFECTER CHAUFFEUR ET VÉHICULE À UN ORDRE (CSMG)
// ═══════════════════════════════════════════════════════════════════════
exports.affecterRessources = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id_demande, id_chauffeur, id_vehicule, id_utilisateur } = req.body;

    if (!id_demande || !id_chauffeur || !id_vehicule) {
      connection.release();
      return res.status(400).json({ message: "Paramètres manquants (demande, chauffeur, véhicule)" });
    }

    await connection.beginTransaction();

    // 1️⃣ Vérifier que l'ordre existe et a pour portée "National"
    const [ordres] = await connection.execute(
      `SELECT id, portee FROM demandemissions WHERE id = ? AND est_ordre_mission = 1`,
      [id_demande]
    );

    if (ordres.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ message: "Ordre de mission non trouvé" });
    }

    const ordre = ordres[0];
    if (ordre.portee !== 'National') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ 
        message: "L'affectation ressource n'est requise que pour les ordres de portée National" 
      });
    }

    // 2️⃣ Vérifier la disponibilité du chauffeur et du véhicule
    const [chauffeurs] = await connection.execute(
      `SELECT id_chauffeur FROM chauffeurs WHERE id_chauffeur = ? AND statut_disponibilite IN ('Disponible', 'Affecté')`,
      [id_chauffeur]
    );

    const [vehicules] = await connection.execute(
      `SELECT id_vehicule FROM vehicules WHERE id_vehicule = ? AND statut_disponibilite IN ('Disponible', 'Affecté')`,
      [id_vehicule]
    );

    if (chauffeurs.length === 0 || vehicules.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ message: "Chauffeur ou véhicule non disponible" });
    }

    // 3️⃣ Mettre à jour l'ordre avec les ressources affectées
    await connection.execute(
      `UPDATE demandemissions 
       SET id_chauffeur = ?, id_vehicule = ?, etape_creation = 'RESSOURCE', updated_at = NOW()
       WHERE id = ?`,
      [id_chauffeur, id_vehicule, id_demande]
    );

    // 4️⃣ Marquer les ressources comme affectées
    await connection.execute(
      `UPDATE chauffeurs SET statut_disponibilite = 'Affecté' WHERE id_chauffeur = ?`,
      [id_chauffeur]
    );

    await connection.execute(
      `UPDATE vehicules SET statut_disponibilite = 'Affecté' WHERE id_vehicule = ?`,
      [id_vehicule]
    );

    await connection.commit();

    res.status(200).json({
      message: "Ressources affectées avec succès",
      affectation: { id_chauffeur, id_vehicule }
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Erreur affecterRessources:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  } finally {
    connection.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// � METTRE À JOUR LES CATÉGORIES SOCIO-PROFESSIONNELLES (ASSISTANTE DRH)
// ═══════════════════════════════════════════════════════════════════════
exports.updateCategoriesMissionnaires = async (req, res) => {
  try {
    const { id_demande, categories_par_missionnaire = [] } = req.body;

    if (!id_demande) {
      return res.status(400).json({ message: "ID demande manquant" });
    }

    if (!categories_par_missionnaire || categories_par_missionnaire.length === 0) {
      return res.status(400).json({ message: "Aucune catégorie fournie" });
    }

    // 1️⃣ Récupérer les infos de la demande (dateDepart, dateRetour, portee)
    const [demandes] = await db.execute(
      `SELECT dateDepart, dateRetour, portee FROM demandemissions WHERE id = ?`,
      [id_demande]
    );

    if (demandes.length === 0) {
      return res.status(404).json({ message: "Demande non trouvée" });
    }

    const { dateDepart, dateRetour, portee } = demandes[0];

    // 📅 Calculer le nombre de nuits et jours
    // Exemple: Mission du 16 au 20 mars
    //   - nuits = 4 (nuit du 16, 17, 18, 19)
    //   - jours = 5 (16, 17, 18, 19, 20)
    const startDate = new Date(dateDepart);
    const endDate = new Date(dateRetour);
    
    // Assurer que les heures sont à minuit pour un calcul correct
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    
    const nuits = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    const jours = nuits + 1;
    
    console.log(`📅 Dates: ${dateDepart} au ${dateRetour} | Nuits: ${nuits} | Jours: ${jours}`);

    // 2️⃣ Mettre à jour chaque missionnaire avec sa catégorie et calculer les frais
    for (const cat of categories_par_missionnaire) {
      const { id_missionnaire, categorie_socio_pro } = cat;
      
      if (!id_missionnaire || !categorie_socio_pro) {
        continue; // Ignorer les entrées invalides
      }

      // 3️⃣ Récupérer l'id_categorie depuis la table categories_socio_professionnelles
      const [categories] = await db.execute(
        `SELECT id_categorie FROM categories_socio_professionnelles WHERE nom = ?`,
        [categorie_socio_pro]
      );

      if (categories.length === 0) {
        console.warn(`⚠️ Catégorie ${categorie_socio_pro} non trouvée`);
        continue;
      }

      const id_categorie = categories[0].id_categorie;

      // 4️⃣ Récupérer les tarifs depuis la grille tarifaire
      const [tarifHebergement] = await db.execute(
        `SELECT tarif FROM grilles_tarifaires 
         WHERE id_categorie = ? AND portee_mission = ? AND type_sejour = 'Hébergement (Nuitée)'`,
        [id_categorie, portee]
      );

      const [tarifRestauration] = await db.execute(
        `SELECT tarif FROM grilles_tarifaires 
         WHERE id_categorie = ? AND portee_mission = ? AND type_sejour = 'Restauration (Nuitée)'`,
        [id_categorie, portee]
      );

      // Calculer les frais
      const frais_hebergement = (tarifHebergement[0]?.tarif || 0) * nuits;
      const frais_restauration = (tarifRestauration[0]?.tarif || 0) * jours;

      console.log(`
  📊 Calcul des frais pour missionnaire ${id_missionnaire} (${categorie_socio_pro}):
     • Tarif Hébergement: ${tarifHebergement[0]?.tarif || 0} XOF/nuit × ${nuits} nuits = ${frais_hebergement} XOF
     • Tarif Restauration: ${tarifRestauration[0]?.tarif || 0} XOF/jour × ${jours} jours = ${frais_restauration} XOF
     • TOTAL: ${frais_hebergement + frais_restauration} XOF
      `);

      // 5️⃣ Mettre à jour le missionnaire avec catégorie et frais
      await db.execute(
        `UPDATE missionnaires 
         SET categorie_socio_pro = ?, frais_hebergement = ?, frais_restauration = ?
         WHERE id_missionnaire = ?`,
        [categorie_socio_pro, frais_hebergement, frais_restauration, id_missionnaire]
      );
    }

    res.status(200).json({
      message: "✅ Catégories et frais calculés avec succès",
      count: categories_par_missionnaire.length,
      nuits,
      jours
    });

  } catch (error) {
    console.error("❌ Erreur updateCategoriesMissionnaires:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// �💰 CONSULTER LES FRAIS ESTIMÉS D'UN ORDRE (DAF)
// ═══════════════════════════════════════════════════════════════════════
exports.getFraisOrdre = async (req, res) => {
  try {
    const { id_demande } = req.params;

    if (!id_demande) {
      return res.status(400).json({ message: "ID demande manquant" });
    }

    // 1️⃣ Récupérer l'ordre
    const [ordres] = await db.execute(
      `SELECT * FROM demandemissions WHERE id = ? AND est_ordre_mission = 1`,
      [id_demande]
    );

    if (ordres.length === 0) {
      return res.status(404).json({ message: "Ordre de mission non trouvé" });
    }

    // 2️⃣ Récupérer les frais des missionnaires
    const [frais] = await db.execute(
      `SELECT 
        m.id_missionnaire,
        m.nom,
        m.prenom,
        m.fonction,
        m.categorie_socio_pro,
        m.frais_hebergement,
        m.frais_restauration
      FROM missionnaires m
      WHERE m.id_mission = ?
      ORDER BY m.nom, m.prenom`,
      [id_demande]
    );

    // 3️⃣ Calculer totaux
    const totalHebergement = frais.reduce((sum, f) => sum + parseFloat(f.frais_hebergement || 0), 0);
    const totalRestauration = frais.reduce((sum, f) => sum + parseFloat(f.frais_restauration || 0), 0);
    const totalFrais = totalHebergement + totalRestauration;

    res.status(200).json({
      ordre: ordres[0],
      frais,
      totaux: {
        total_hebergement: totalHebergement,
        total_restauration: totalRestauration,
        total_frais: totalFrais,
        nombre_missionnaires: frais.length
      }
    });

  } catch (error) {
    console.error("❌ Erreur getFraisOrdre:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// ✏️ MODIFIER LES FRAIS D'UN ORDRE (DAF)
// ═══════════════════════════════════════════════════════════════════════
exports.updateFraisOrdre = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { id_demande, frais_par_missionnaire = [] } = req.body;

    if (!id_demande || frais_par_missionnaire.length === 0) {
      connection.release();
      return res.status(400).json({ message: "Paramètres manquants" });
    }

    await connection.beginTransaction();

    // Mettre à jour chaque frais fourni par missionnaire
    for (const frais of frais_par_missionnaire) {
      if (!frais.id_missionnaire) continue;

      const montantHebergement = frais.frais_hebergement != null ? parseFloat(frais.frais_hebergement) : 0;
      const montantRestauration = frais.frais_restauration != null ? parseFloat(frais.frais_restauration) : 0;

      // ✅ Mettre à jour UNIQUEMENT la table missionnaires
      await connection.execute(
        `UPDATE missionnaires 
         SET frais_hebergement = ?, frais_restauration = ?
         WHERE id_missionnaire = ? AND id_mission = ?`,
        [montantHebergement, montantRestauration, frais.id_missionnaire, id_demande]
      );

      console.log(`✅ Frais mis à jour pour missionnaire ${frais.id_missionnaire}: Hébergement=${montantHebergement}, Restauration=${montantRestauration}`);
    }

    await connection.commit();

    res.status(200).json({
      message: "✅ Frais mise à jour avec succès"
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Erreur updateFraisOrdre:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  } finally {
    connection.release();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 📄 TÉLÉCHARGER L'ORDRE DE MISSION EN PDF
// ═══════════════════════════════════════════════════════════════════════
exports.downloadOrdreAsPDF = async (req, res) => {
  try {
    const { id_demande } = req.params;

    if (!id_demande) {
      return res.status(400).json({ message: "ID demande manquant" });
    }

    console.log(`📄 Début génération PDF pour ordre id_demande=${id_demande}`);

    // 1️⃣ Récupérer les infos de l'ordre
    const [demandes] = await db.execute(
      `SELECT * FROM demandemissions WHERE id = ? AND est_ordre_mission = 1`,
      [id_demande]
    );

    if (demandes.length === 0) {
      console.error(`❌ Ordre non trouvé pour id_demande=${id_demande}`);
      return res.status(404).json({ message: "Ordre de mission non trouvé" });
    }

    const demande = demandes[0];

    // 2️⃣ Récupérer les missionnaires
    const [missionnaires] = await db.execute(
      `SELECT * FROM missionnaires WHERE id_mission = ?`,
      [id_demande]
    );

    if (!missionnaires || missionnaires.length === 0) {
      console.warn(`⚠️ Aucun missionnaire trouvé pour id_demande=${id_demande}`);
    }

    // 3️⃣ Récupérer chauffeur et véhicule
    let chauffeur = null;
    let vehicule = null;
    if (demande.id_chauffeur) {
      const [chaufResult] = await db.execute(
        `SELECT u.nom, u.prenom, c.telephone FROM chauffeurs c 
         JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur 
         WHERE c.id_chauffeur = ?`,
        [demande.id_chauffeur]
      );
      if (chaufResult.length > 0) chauffeur = chaufResult[0];
    }
    if (demande.id_vehicule) {
      const [vehicResult] = await db.execute(
        `SELECT marque, type_vehicule as type, immatriculation FROM vehicules WHERE id_vehicule = ?`,
        [demande.id_vehicule]
      );
      if (vehicResult.length > 0) vehicule = vehicResult[0];
    }

    // 4️⃣ Récupérer la signature du DG
    const [dgSignatures] = await db.execute(
      `SELECT v.signature_numerique, v.signature, v.date_validation, u.nom, u.prenom
       FROM validations v
       JOIN etapes_workflow ew ON ew.id_etape = v.id_etape
       LEFT JOIN utilisateurs u ON u.id_utilisateur = v.id_utilisateur
       WHERE v.id_demande = ?
         AND v.decision LIKE 'VALID%'
         AND (ew.id_sous_role_requis = 12 OR ew.libelle_etape LIKE '%Directeur G%')
       ORDER BY v.date_validation DESC
       LIMIT 1`,
      [id_demande]
    );
    const dgSignature = dgSignatures[0] || null;

    // 5️⃣ Créer le PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40
    });

    const pageLeft = 58;
    const pageRight = 537;
    const contentWidth = pageRight - pageLeft;

    const formatDate = (value, options = {}) => {
      if (!value) return 'N/A';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleDateString('fr-FR', options);
    };

    const formatLongDate = (value) => formatDate(value, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const fullName = (person) => [person?.prenom, person?.nom].filter(Boolean).join(' ').trim();
    const missionChief = missionnaires.find((m) => m.est_chef_mission) || missionnaires[0] || null;
    const signatureData = dgSignature?.signature_numerique || '';
    const signatureName = fullName(dgSignature) || 'Directeur General';

    // Bordure de page
    doc.rect(28, 22, 539, 792).lineWidth(0.8).strokeColor('#333333').stroke();
    doc.fillColor('#111111');

    // En-tête SODECO
    doc.font('Helvetica-Bold').fontSize(18).text('SODECO', pageLeft, 58, { width: contentWidth, align: 'center' });
    doc.font('Helvetica').fontSize(12).text('SOCIETE POUR LE DEVELOPPEMENT DU COTON', { align: 'center' });
    doc.fontSize(9)
      .text("Société Anonyme avec Conseil d'Administration au capital de FCFA 100 milliards", { align: 'center' })
      .text('Siège social : Immeuble FAGACE (bât. B), Boulevard de la CEN-SAD 01 BP 8059', { align: 'center' })
      .text('Tél : (229) 21.30.95.39 / 21.30.95.11 - Fax : (229) 21.30.94.46 Cotonou (Bénin)', { align: 'center' });

    doc.moveDown(1.5);
    doc.fontSize(10).text(`Cotonou, le ${formatDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric' })}`, pageLeft, doc.y, {
      width: contentWidth,
      align: 'right'
    });

    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(10).text(`N/Ref. : ${demande.reference || `${demande.id}/SODECO/OM`}`, pageLeft, doc.y);

    doc.moveDown(1.2);
    const titleY = doc.y;
    doc.rect(120, titleY, 355, 38).lineWidth(1.5).strokeColor('#222222').stroke();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text('ORDRE DE MISSION', 120, titleY + 12, {
      width: 355,
      align: 'center'
    });
    doc.y = titleY + 58;

    doc.font('Helvetica-Bold').fontSize(11).text('Le Directeur Général de la SODECO autorise :', pageLeft, doc.y);
    doc.moveDown(1);

    if (missionnaires.length === 0) {
      doc.font('Helvetica').text('- Aucun missionnaire enregistré', pageLeft + 25);
    } else {
      missionnaires.forEach((m) => {
        const name = `${m.nom || ''} ${m.prenom || ''}`.trim() || 'N/A';
        const role = m.fonction ? `, ${m.fonction}` : '';
        doc.font('Helvetica-Bold').fontSize(11).text(`- ${name}${role}`, pageLeft + 25, doc.y);
      });
    }

    doc.moveDown(1.2);
    doc.font('Helvetica').fontSize(11).text('Tous en service à la SODECO (Société pour le Développement du Coton),', pageLeft, doc.y, {
      width: contentWidth,
      align: 'left'
    });

    doc.moveDown(1.2);
    doc.text(`À se rendre à ${demande.destination || 'N/A'}`, pageLeft, doc.y);
    doc.moveDown(1.1);

    const writeLabelLine = (label, value) => {
      doc.font('Helvetica-Bold').text(`${label} : `, pageLeft, doc.y, { continued: true });
      doc.font('Helvetica').text(value || 'N/A');
    };

    writeLabelLine('Motif', demande.motif || 'N/A');
    if (chauffeur) writeLabelLine('Conducteur', `${chauffeur.nom || ''} ${chauffeur.prenom || ''}`.trim());
    else writeLabelLine('Conducteur', 'Non affecté');

    if (vehicule) writeLabelLine('Moyen de Transport', `${vehicule.marque || ''} ${vehicule.type || ''} (${vehicule.immatriculation || 'N/A'})`.trim());
    else writeLabelLine('Moyen de Transport', demande.moyen_transport_libelle || 'Non affecté');

    writeLabelLine('Date de Départ', formatLongDate(demande.dateDepart));
    writeLabelLine('Date de Retour', formatLongDate(demande.dateRetour));
    writeLabelLine('Chef de mission', missionChief ? `${missionChief.nom || ''} ${missionChief.prenom || ''}`.trim() : 'N/A');

    doc.moveDown(1.1);
    doc.font('Helvetica-Bold').text('Les frais de mission sont imputables au budget de la SODECO.', pageLeft, doc.y, {
      width: contentWidth
    });

    doc.moveDown(1.1);
    doc.font('Helvetica-Bold').text('Les Autorités Politiques et Administratives ', pageLeft, doc.y, { continued: true });
    doc.font('Helvetica').text("sont priées de faciliter aux intéressés, l'accomplissement de leur mission.", {
      width: contentWidth
    });

    // Signature
    const signatureX = 365;
    const signatureY = 655;
    
    if (signatureData && signatureData.startsWith('data:image/')) {
      try {
        const signatureBuffer = Buffer.from(signatureData.split(',')[1], 'base64');
        doc.image(signatureBuffer, signatureX, signatureY - 52, { width: 135, height: 55, fit: [135, 55] });
      } catch (imageError) {
        console.warn('Signature DG illisible pour le PDF:', imageError.message);
      }
    }

    doc.font('Helvetica-Bold').fontSize(11).text(signatureName.toUpperCase(), signatureX, signatureY, {
      width: 145,
      align: 'center'
    });
    doc.moveTo(signatureX + 14, signatureY + 14).lineTo(signatureX + 131, signatureY + 14).lineWidth(0.8).stroke();
    doc.fontSize(10).text('Directeur Général', signatureX, signatureY + 18, {
      width: 145,
      align: 'center'
    });

    // Pied de page
    doc.font('Helvetica').fontSize(7).fillColor('#666666').text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
      pageLeft,
      780,
      { width: contentWidth, align: 'center' }
    );

    // 6️⃣ Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Ordre_${demande.reference || demande.id}.pdf"`);
    
    doc.pipe(res);
    doc.end();

  } catch (error) {
    console.error("❌ Erreur downloadOrdreAsPDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: "Erreur lors de la génération du PDF", 
        error: error.message 
      });
    }
  }
};
