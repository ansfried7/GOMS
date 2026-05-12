const db = require('../config/db');

// ===== HELPERS =====
const safe = (v) => (v === undefined ? null : v);

// Récupérer l'ID du chauffeur à partir de l'ID utilisateur
const getChauffeurIdFromUserId = async (userId) => {
  const [chauffeurs] = await db.execute(
    `SELECT id_chauffeur FROM chauffeurs WHERE id_utilisateur = ?`,
    [userId]
  );
  return chauffeurs.length > 0 ? chauffeurs[0].id_chauffeur : null;
};

// ===== GET DASHBOARD CHAUFFEUR =====
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user?.id; // Supposé être fourni par middleware d'auth
    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) {
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    const [chauffeurRows] = await db.execute(
      `SELECT c.id_chauffeur as id, c.telephone, c.statut_disponibilite,
              c.moyenne_notes, c.nombre_missions, c.types_vehicules_autorises,
              u.nom, u.prenom, u.email
       FROM chauffeurs c
       JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
       WHERE c.id_chauffeur = ?`,
      [chauffeurId]
    );

    // Mission en cours avec enregistrements KM
    const [missionEnCours] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart, d.dateRetour, d.statut,
              chef.nom as chefMissionNom, chef.prenom as chefMissionPrenom,
              v.id_vehicule, v.marque, v.immatriculation, v.couleur, v.type_vehicule,
              v.statut_disponibilite as vehicule_statut, v.consommation_100km,
              v.statut_assurance, v.date_debut_assurance, v.date_fin_assurance,
              v.date_derniere_tvm, v.date_prochaine_tvm, v.observations,
              ekc_d.kilometrage as km_debut,
              ekc_f.kilometrage as km_fin
       FROM demandemissions d
       LEFT JOIN missionnaires chef ON chef.id_mission = d.id AND chef.est_chef_mission = 1
       LEFT JOIN vehicules v ON d.id_vehicule = v.id_vehicule
       LEFT JOIN enregistrements_km_chauffeur ekc_d ON d.id = ekc_d.id_demandemission AND ekc_d.type = 'debut'
       LEFT JOIN enregistrements_km_chauffeur ekc_f ON d.id = ekc_f.id_demandemission AND ekc_f.type = 'fin'
       WHERE d.id_chauffeur = ?
         AND (d.statut = 'En cours' OR (d.statut = 'Validée' AND d.dateDepart <= NOW()))
       ORDER BY d.dateDepart DESC
       LIMIT 1`,
      [chauffeurId]
    );

    // Missions à venir
    const [missionsAVenir] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart, d.dateRetour, d.statut,
              chef.nom as chefNom, chef.prenom as chefPrenom,
              GROUP_CONCAT(DISTINCT CONCAT(ms.prenom, ' ', ms.nom) SEPARATOR ', ') as missionnaires
       FROM demandemissions d
       LEFT JOIN missionnaires chef ON chef.id_mission = d.id AND chef.est_chef_mission = 1
       LEFT JOIN missionnaires ms ON ms.id_mission = d.id
       WHERE d.id_chauffeur = ?
         AND d.statut = 'Validée'
         AND d.dateDepart > NOW()
       GROUP BY d.id
       ORDER BY d.dateDepart ASC`,
      [chauffeurId]
    );

    const [vehiculeRows] = await db.execute(
      `SELECT v.id_vehicule, v.marque, v.immatriculation, v.couleur, v.type_vehicule,
              v.statut_disponibilite as vehicule_statut, v.consommation_100km,
              v.statut_assurance, v.date_debut_assurance, v.date_fin_assurance,
              v.date_derniere_tvm, v.date_prochaine_tvm, v.observations, v.photo_documents
       FROM vehicules v
       WHERE v.id_vehicule = COALESCE(?, (
         SELECT id_vehicule
         FROM vehicules
         WHERE id_chauffeur_attitré = ?
         LIMIT 1
       ))
       LIMIT 1`,
      [missionEnCours[0]?.id_vehicule || null, chauffeurId]
    );

    const [notes] = await db.execute(
      `SELECT nc.id_notation as id, nc.note, nc.commentaire, nc.date_notation,
              d.motif, d.destination, d.dateDepart,
              m.nom as notateurNom, m.prenom as notateurPrenom
       FROM notations_chauffeur nc
       JOIN demandemissions d ON nc.id_demande = d.id
       LEFT JOIN missionnaires m ON nc.id_missionnaire_notant = m.id_missionnaire
       WHERE nc.id_chauffeur = ? AND nc.note IS NOT NULL
       ORDER BY nc.date_notation DESC
       LIMIT 5`,
      [chauffeurId]
    );

    // Kilométrage total et nombre de missions effectuées
    const [statsKm] = await db.execute(
      `SELECT COUNT(DISTINCT d.id) as total_missions_effectuees,
              COALESCE(SUM(ekc2.kilometrage - ekc.kilometrage), 0) as total_km_parcouru
       FROM demandemissions d
       LEFT JOIN enregistrements_km_chauffeur ekc ON d.id = ekc.id_demandemission AND ekc.type = 'debut'
       LEFT JOIN enregistrements_km_chauffeur ekc2 ON d.id = ekc2.id_demandemission AND ekc2.type = 'fin'
       WHERE d.id_chauffeur = ? AND d.statut = 'Effectuée'`,
      [chauffeurId]
    );

    res.json({
      chauffeur: chauffeurRows[0] || null,
      disponibilite: chauffeurRows[0]?.statut_disponibilite || 'Disponible',
      vehiculeActuel: vehiculeRows[0] || null,
      notesRecentes: notes,
      missionEnCours: missionEnCours[0] || null,
      missionsAVenir: missionsAVenir,
      totalKmParcouru: statsKm[0]?.total_km_parcouru || 0,
      totalMissionsEffectuees: statsKm[0]?.total_missions_effectuees || 0
    });
  } catch (error) {
    console.error('Erreur getDashboard:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== GET MISSION EN COURS =====
exports.getMissionEnCours = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    // Récupérer la mission principale
    const [missionRows] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart, d.dateRetour, d.statut,
              d.id_chauffeur, d.id_vehicule,
              v.id_vehicule, v.marque, v.immatriculation, v.couleur, v.type_vehicule as type,
              ekc_d.kilometrage as km_debut,
              ekc_f.kilometrage as km_fin
       FROM demandemissions d
       LEFT JOIN vehicules v ON d.id_vehicule = v.id_vehicule
       LEFT JOIN enregistrements_km_chauffeur ekc_d ON d.id = ekc_d.id_demandemission AND ekc_d.type = 'debut'
       LEFT JOIN enregistrements_km_chauffeur ekc_f ON d.id = ekc_f.id_demandemission AND ekc_f.type = 'fin'
       WHERE d.id_chauffeur = ?
         AND (d.statut = 'En cours' OR (d.statut = 'Validée' AND d.dateDepart <= NOW()))
       ORDER BY d.dateDepart DESC
       LIMIT 1`,
      [chauffeurId]
    );

    if (missionRows.length === 0) {
      return res.json(null);
    }

    const mission = missionRows[0];

    // Vérifier les enregistrements
    const [debutRecords] = await db.execute(
      `SELECT COUNT(*) as count FROM enregistrements_km_chauffeur WHERE id_demandemission = ? AND type = 'debut'`,
      [mission.id]
    );
    const [finRecords] = await db.execute(
      `SELECT COUNT(*) as count FROM enregistrements_km_chauffeur WHERE id_demandemission = ? AND type = 'fin'`,
      [mission.id]
    );

    mission.debut_enregistre = debutRecords[0].count > 0 ? 1 : 0;
    mission.fin_enregistre = finRecords[0].count > 0 ? 1 : 0;

    // Récupérer les missionnaires
    const [missionnaires] = await db.execute(
      `SELECT id_missionnaire as id, nom, prenom, fonction, est_chef_mission
       FROM missionnaires
       WHERE id_mission = ?
       ORDER BY est_chef_mission DESC`,
      [mission.id]
    );

    mission.missionnaires = missionnaires;
    mission.chefMission = missionnaires.find(m => m.est_chef_mission) || null;

    // Récupérer le véhicule
    mission.vehicule = mission.id_vehicule ? {
      id: mission.id_vehicule,
      marque: mission.marque,
      immatriculation: mission.immatriculation,
      couleur: mission.couleur,
      type: mission.type
    } : null;

    res.json(mission);
  } catch (error) {
    console.error('Erreur getMissionEnCours:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== GET MISSIONS À VENIR =====
exports.getMissionsAVenir = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    const [missions] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart, d.dateRetour, d.statut,
              chef.nom as chefNom, chef.prenom as chefPrenom,
              GROUP_CONCAT(DISTINCT CONCAT(ms.prenom, ' ', ms.nom) SEPARATOR ', ') as missionnaires
       FROM demandemissions d
       LEFT JOIN missionnaires chef ON chef.id_mission = d.id AND chef.est_chef_mission = 1
       LEFT JOIN missionnaires ms ON ms.id_mission = d.id
       WHERE d.id_chauffeur = ?
         AND d.statut = 'Validée'
         AND d.dateDepart > NOW()
       GROUP BY d.id
       ORDER BY d.dateDepart ASC`,
      [chauffeurId]
    );

    res.json(missions);
  } catch (error) {
    console.error('Erreur getMissionsAVenir:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== GET MISSION DETAIL =====
exports.getMissionDetail = async (req, res) => {
  try {
    const { missionId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    // Récupérer la mission principale
    const [missionRows] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart, d.dateRetour, d.statut,
              d.id_chauffeur, d.id_vehicule,
              v.id_vehicule, v.marque, v.immatriculation, v.couleur, v.type_vehicule
       FROM demandemissions d
       LEFT JOIN vehicules v ON d.id_vehicule = v.id_vehicule
       WHERE d.id = ? AND d.id_chauffeur = ?`,
      [missionId, chauffeurId]
    );

    if (missionRows.length === 0) {
      return res.status(404).json({ message: 'Mission non trouvée' });
    }

    const mission = missionRows[0];

    // Récupérer les missionnaires
    const [missionnaires] = await db.execute(
      `SELECT id_missionnaire as id, nom, prenom, fonction, est_chef_mission
       FROM missionnaires
       WHERE id_mission = ?
       ORDER BY est_chef_mission DESC`,
      [missionId]
    );

    mission.missionnaires = missionnaires;
    mission.chefMission = missionnaires.find(m => m.est_chef_mission) || null;

    // Récupérer le véhicule (si non déjà joint ou besoin de plus de détails)
    mission.vehicule = mission.id_vehicule ? {
      id: mission.id_vehicule,
      marque: mission.marque,
      immatriculation: mission.immatriculation,
      couleur: mission.couleur,
      type: mission.type_vehicule
    } : null;

    res.json(mission);
  } catch (error) {
    console.error('Erreur getMissionDetail:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== GET HISTORIQUE MISSIONS =====
exports.getHistoriqueMissions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    const [missions] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart, d.dateRetour, d.statut,
              DATEDIFF(d.dateRetour, d.dateDepart) + 1 as duree,
              km_debut.kilometrage as km_debut,
              km_fin.kilometrage as km_fin,
              km_debut.date_creation as date_km_debut,
              km_fin.date_creation as date_km_fin,
              (km_fin.kilometrage - km_debut.kilometrage) as km_total,
              notation.note, notation.commentaire, notation.date_notation,
              v.id_vehicule, v.marque, v.immatriculation, v.couleur, v.type_vehicule
       FROM demandemissions d
       LEFT JOIN enregistrements_km_chauffeur km_debut
         ON km_debut.id_enregistrement_km = (
           SELECT ekc.id_enregistrement_km
           FROM enregistrements_km_chauffeur ekc
           WHERE ekc.id_demandemission = d.id AND ekc.type = 'debut'
           ORDER BY ekc.date_creation DESC, ekc.id_enregistrement_km DESC
           LIMIT 1
         )
       LEFT JOIN enregistrements_km_chauffeur km_fin
         ON km_fin.id_enregistrement_km = (
           SELECT ekc.id_enregistrement_km
           FROM enregistrements_km_chauffeur ekc
           WHERE ekc.id_demandemission = d.id AND ekc.type = 'fin'
           ORDER BY ekc.date_creation DESC, ekc.id_enregistrement_km DESC
           LIMIT 1
         )
       LEFT JOIN notations_chauffeur notation
         ON notation.id_notation = (
           SELECT nc.id_notation
           FROM notations_chauffeur nc
           WHERE nc.id_demande = d.id AND nc.note IS NOT NULL
           ORDER BY nc.date_notation DESC, nc.id_notation DESC
           LIMIT 1
         )
       LEFT JOIN vehicules v ON d.id_vehicule = v.id_vehicule
       WHERE d.id_chauffeur = ?
         AND d.statut = 'Effectuée'
         AND km_fin.kilometrage IS NOT NULL
       ORDER BY d.dateDepart DESC`,
      [chauffeurId]
    );

    for (const mission of missions) {
      const [missionnaires] = await db.execute(
        `SELECT id_missionnaire as id, nom, prenom, fonction, est_chef_mission
         FROM missionnaires
         WHERE id_mission = ?
         ORDER BY est_chef_mission DESC`,
        [mission.id]
      );

      const [carburations] = await db.execute(
        `SELECT id_carburation as id, quantite_carburant, km_carburation, date_creation
         FROM enregistrements_carburation
         WHERE id_demandemission = ?
         ORDER BY date_creation ASC`,
        [mission.id]
      );

      mission.missionnaires = missionnaires;
      mission.chefMission = missionnaires.find(m => m.est_chef_mission) || missionnaires[0] || null;
      mission.vehicule = mission.id_vehicule ? {
        id: mission.id_vehicule,
        marque: mission.marque,
        immatriculation: mission.immatriculation,
        couleur: mission.couleur,
        type: mission.type_vehicule
      } : null;
      mission.enregistrements = {
        km_debut: mission.km_debut,
        km_fin: mission.km_fin,
        date_km_debut: mission.date_km_debut,
        date_km_fin: mission.date_km_fin,
        carburations
      };
    }

    res.json(missions);
  } catch (error) {
    console.error('Erreur getHistoriqueMissions:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== SAVE MISSION ENREGISTREMENT (KM/CARBURATION/TEMPS) =====
exports.saveMissionEnregistrement = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { missionId } = req.params;
    const { type, kilometrage, heure, quantite_carburant } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      connection.release();
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) {
      connection.release();
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    await connection.beginTransaction();

    if (type === 'debut' || type === 'fin') {
      // Enregistrement kilométrique : Vérifier si un enregistrement existe déjà pour cette mission et ce type
      const [existing] = await connection.execute(
        `SELECT id_demandemission FROM enregistrements_km_chauffeur 
         WHERE id_demandemission = ? AND type = ?`,
        [missionId, type]
      );

      if (existing.length > 0) {
        // Mise à jour de l'enregistrement existant
        await connection.execute(
          `UPDATE enregistrements_km_chauffeur 
           SET kilometrage = ?, id_chauffeur = ?, date_creation = NOW()
           WHERE id_demandemission = ? AND type = ?`,
          [kilometrage, chauffeurId, missionId, type]
        );
      } else {
        // Nouvel enregistrement
        await connection.execute(
          `INSERT INTO enregistrements_km_chauffeur 
           (id_demandemission, id_chauffeur, type, kilometrage)
           VALUES (?, ?, ?, ?)`,
          [missionId, chauffeurId, type, kilometrage]
        );
      }

      // Lors du départ, mettre la mission en cours
      if (type === 'debut') {
        await connection.execute(
          `UPDATE demandemissions SET statut = 'En cours' WHERE id = ? AND (statut = 'Validée' OR statut = 'En cours')`,
          [missionId]
        );

        const [missionRows] = await connection.execute(
          `SELECT id_vehicule, id_chauffeur FROM demandemissions WHERE id = ?`,
          [missionId]
        );

        const currentVehiculeId = missionRows[0]?.id_vehicule;
        const currentChauffeurId = missionRows[0]?.id_chauffeur || chauffeurId;

        await connection.execute(
          `UPDATE chauffeurs SET statut_disponibilite = 'En mission' WHERE id_chauffeur = ?`,
          [currentChauffeurId]
        );

        if (currentVehiculeId) {
          await connection.execute(
            `UPDATE vehicules SET statut_disponibilite = 'En mission' WHERE id_vehicule = ?`,
            [currentVehiculeId]
          );
        }
      }

      // Si c'est la fin, marquer la mission comme effectuée
      if (type === 'fin') {
        await connection.execute(
          `UPDATE demandemissions SET statut = 'Effectuée' WHERE id = ?`,
          [missionId]
        );

        // Récupérer le véhicule avant de libérer le chauffeur
        const [missionRows] = await connection.execute(
          `SELECT id_vehicule, id_chauffeur FROM demandemissions WHERE id = ?`,
          [missionId]
        );

        const currentVehiculeId = missionRows[0]?.id_vehicule;
        const currentChauffeurId = missionRows[0]?.id_chauffeur || chauffeurId;

        // Remettre le chauffeur en disponible
        await connection.execute(
          `UPDATE chauffeurs SET statut_disponibilite = 'Disponible' WHERE id_chauffeur = ?`,
          [currentChauffeurId]
        );

        // Remettre le véhicule en disponible
        if (currentVehiculeId) {
          await connection.execute(
            `UPDATE vehicules SET statut_disponibilite = 'Disponible' WHERE id_vehicule = ?`,
            [currentVehiculeId]
          );
        }
      }
    } else if (type === 'en_cours') {
      // Enregistrement carburation
      await connection.execute(
        `INSERT INTO enregistrements_carburation 
         (id_demandemission, id_chauffeur, quantite_carburant, km_carburation)
         VALUES (?, ?, ?, ?)`,
        [missionId, chauffeurId, quantite_carburant, kilometrage]
      );
    }

    await connection.commit();
    res.json({ message: 'Enregistrement sauvegardé avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur saveMissionEnregistrement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    connection.release();
  }
};

// ===== SAVE CARBURATION =====
exports.saveCarburation = async (req, res) => {
  try {
    const { missionId } = req.params;
    const { quantite, quantite_carburant, km_carburation } = req.body;

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    await db.execute(
      `INSERT INTO enregistrements_carburation 
       (id_demandemission, id_chauffeur, quantite_carburant, km_carburation)
       VALUES (?, ?, ?, ?)`,
      [missionId, chauffeurId, quantite_carburant || quantite, km_carburation]
    );

    res.json({ message: 'Carburation enregistrée' });
  } catch (error) {
    console.error('Erreur saveCarburation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== GET VISITE TECHNIQUE =====
exports.getVisiteTechnique = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    const vehiculeScopeSql = `
      SELECT DISTINCT v.id_vehicule
      FROM vehicules v
      WHERE v.id_chauffeur_attitré = ?
         OR v.id_vehicule IN (
           SELECT dm.id_vehicule
           FROM demandemissions dm
           WHERE dm.id_chauffeur = ?
             AND dm.id_vehicule IS NOT NULL
             AND dm.statut IN ('Validée', 'En cours', 'Effectuée')
         )
    `;

    const [enCours] = await db.execute(
      `SELECT vt.*, v.marque, v.immatriculation, v.type_vehicule, v.date_derniere_tvm, v.date_prochaine_tvm
       FROM visites_techniques vt
       JOIN vehicules v ON vt.id_vehicule = v.id_vehicule
       WHERE vt.id_chauffeur = ?
         AND vt.statut_visite = 'En cours'
       ORDER BY vt.date_creation DESC
       LIMIT 1`,
      [chauffeurId]
    );

    const [aVenir] = await db.execute(
      `SELECT v.id_vehicule, v.marque, v.immatriculation, v.type_vehicule,
              v.date_derniere_tvm, v.date_prochaine_tvm,
              DATEDIFF(v.date_prochaine_tvm, CURDATE()) as jours_restants
       FROM vehicules v
       WHERE v.id_vehicule IN (${vehiculeScopeSql})
         AND v.date_prochaine_tvm IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM visites_techniques vt
           WHERE vt.id_vehicule = v.id_vehicule
             AND vt.statut_visite = 'En cours'
         )
       ORDER BY v.date_prochaine_tvm ASC`,
      [chauffeurId, chauffeurId]
    );

    const [historique] = await db.execute(
      `SELECT vt.*, v.marque, v.immatriculation, v.type_vehicule
       FROM visites_techniques vt
       JOIN vehicules v ON vt.id_vehicule = v.id_vehicule
       WHERE vt.id_chauffeur = ?
         AND (vt.statut_visite LIKE 'Effectu%' OR vt.km_fin IS NOT NULL)
       ORDER BY vt.date_modification DESC
       LIMIT 20`,
      [chauffeurId]
    );

    res.json({
      prochaine: aVenir[0] || null,
      aVenir,
      enCours: enCours[0] || null,
      historique
    });
  } catch (error) {
    console.error('Erreur getVisiteTechnique:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== SAVE VISITE TECHNIQUE ENREGISTREMENT =====
const saveVisiteTechniqueEnregistrementLegacy = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { visiteId } = req.params;
    const { type, kilometres, heure, cout, observations, id_vehicule, id_visite_technique } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      connection.release();
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) {
      connection.release();
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    await connection.beginTransaction();

    if (type === 'debut') {
      await connection.execute(
        `INSERT INTO visites_techniques_enregistrements
         (id_vehicule, id_chauffeur, type, kilometres, heure, date_enregistrement)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [visiteId, chauffeurId, 'debut', kilometres, heure]
      );
    } else if (type === 'fin') {
      await connection.execute(
        `INSERT INTO visites_techniques_enregistrements
         (id_vehicule, id_chauffeur, type, kilometres, heure, cout, observations, date_enregistrement)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [visiteId, chauffeurId, 'fin', kilometres, heure, cout, observations]
      );

      // Mettre à jour les dates de la visite technique du véhicule
      await connection.execute(
        `UPDATE vehicules 
         SET date_derniere_visite = NOW(),
             date_prochaine_visite = DATE_ADD(NOW(), INTERVAL 1 YEAR)
         WHERE id_vehicule = ?`,
        [visiteId]
      );
    }

    await connection.commit();
    res.json({ message: 'Visite technique enregistrée' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur saveVisiteTechniqueEnregistrement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    connection.release();
  }
};

// Nouvelle logique: la table visites_techniques porte directement le suivi complet.
exports.saveVisiteTechniqueEnregistrement = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { visiteId } = req.params;
    const { type, kilometres, heure, cout, observations, id_vehicule, id_visite_technique } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      connection.release();
      return res.status(401).json({ message: 'Non authentifie' });
    }

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) {
      connection.release();
      return res.status(404).json({ message: 'Chauffeur non trouve' });
    }

    await connection.beginTransaction();

    if (type === 'debut') {
      const vehiculeId = id_vehicule || visiteId;
      const [vehicules] = await connection.execute(
        `SELECT id_vehicule
         FROM vehicules
         WHERE id_vehicule = ?
           AND (
             id_chauffeur_attitré = ?
             OR id_vehicule IN (
               SELECT dm.id_vehicule
               FROM demandemissions dm
               WHERE dm.id_chauffeur = ?
                 AND dm.id_vehicule IS NOT NULL
                 AND dm.statut IN ('Validée', 'ValidÃ©e', 'En cours', 'Effectuée', 'EffectuÃ©e')
             )
           )
         LIMIT 1`,
        [vehiculeId, chauffeurId, chauffeurId]
      );

      if (vehicules.length === 0) {
        await connection.rollback();
        return res.status(403).json({ message: 'Vehicule non autorise pour ce chauffeur' });
      }

      const [active] = await connection.execute(
        `SELECT id_visite_technique
         FROM visites_techniques
         WHERE id_vehicule = ? AND statut_visite = 'En cours'
         LIMIT 1`,
        [vehiculeId]
      );

      if (active.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Une visite technique est deja en cours pour ce vehicule' });
      }

      const [result] = await connection.execute(
        `INSERT INTO visites_techniques
         (id_vehicule, id_chauffeur, statut_visite, km_depart, heure_depart)
         VALUES (?, ?, 'En cours', ?, ?)`,
        [vehiculeId, chauffeurId, kilometres, heure]
      );

      await connection.commit();
      return res.json({
        message: 'Debut de visite technique enregistre',
        id_visite_technique: result.insertId
      });
    }

    if (type === 'fin') {
      const visiteTechniqueId = id_visite_technique || visiteId;
      const [visites] = await connection.execute(
        `SELECT id_visite_technique, id_vehicule, km_depart
         FROM visites_techniques
         WHERE id_visite_technique = ?
           AND id_chauffeur = ?
           AND statut_visite = 'En cours'
         LIMIT 1`,
        [visiteTechniqueId, chauffeurId]
      );

      if (visites.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Visite technique en cours introuvable' });
      }

      const visite = visites[0];
      if (visite.km_depart !== null && Number(kilometres) < Number(visite.km_depart)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Le kilometrage de fin doit etre superieur ou egal au depart' });
      }

      await connection.execute(
        `UPDATE visites_techniques
         SET statut_visite = 'Effectuée',
             km_fin = ?,
             heure_fin = ?,
             cout_visite_technique = ?,
             observation = ?
         WHERE id_visite_technique = ?`,
        [kilometres, heure, cout, observations || null, visiteTechniqueId]
      );

      await connection.execute(
        `UPDATE vehicules
         SET date_derniere_tvm = CURDATE(),
             date_prochaine_tvm = DATE_ADD(CURDATE(), INTERVAL 1 YEAR)
         WHERE id_vehicule = ?`,
        [visite.id_vehicule]
      );

      await connection.commit();
      return res.json({ message: 'Visite technique terminee' });
    }

    await connection.rollback();
    return res.status(400).json({ message: 'Type d enregistrement invalide' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur saveVisiteTechniqueEnregistrement:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    connection.release();
  }
};

// ===== GET CHAUFFEUR NOTES =====
exports.getChauffeurNotes = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    const [notes] = await db.execute(
      `SELECT nc.*, d.motif, d.destination, d.dateDepart,
              m.nom as notateurNom, m.prenom as notateurPrenom
       FROM notations_chauffeur nc
       JOIN demandemissions d ON nc.id_demande = d.id
       LEFT JOIN missionnaires m ON nc.id_missionnaire_notant = m.id_missionnaire
       WHERE nc.id_chauffeur = ?
       ORDER BY nc.date_notation DESC`,
      [chauffeurId]
    );

    res.json(notes);
  } catch (error) {
    console.error('Erreur getChauffeurNotes:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== LAUNCH MISSION (Mettre la mission en cours) =====
exports.launchMission = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { missionId } = req.params;
    const { statut, id_chauffeur, id_vehicule } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      connection.release();
      return res.status(401).json({ message: 'Non authentifié' });
    }

    const chauffeurId = await getChauffeurIdFromUserId(userId);
    if (!chauffeurId) {
      connection.release();
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    await connection.beginTransaction();

    // Mettre à jour la mission au statut "En cours"
    await connection.execute(
      `UPDATE demandemissions SET statut = 'En cours' WHERE id = ? AND id_chauffeur = ?`,
      [missionId, chauffeurId]
    );

    // Mettre à jour le statut du chauffeur à "En mission"
    if (id_chauffeur) {
      await connection.execute(
        `UPDATE chauffeurs SET statut_disponibilite = 'En mission' WHERE id_chauffeur = ?`,
        [id_chauffeur]
      );
    }

    // Mettre à jour le statut du véhicule à "En mission"
    if (id_vehicule) {
      await connection.execute(
        `UPDATE vehicules SET statut_disponibilite = 'En mission' WHERE id_vehicule = ?`,
        [id_vehicule]
      );
    }

    await connection.commit();
    res.json({
      message: 'Mission lancée avec succès',
      statut: 'En cours'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur launchMission:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    connection.release();
  }
};

// ===== UPDATE CHAUFFEUR STATUS =====
exports.updateChauffeurStatus = async (req, res) => {
  try {
    const { chauffeurId } = req.params;
    const { statut_disponibilite } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    // Vérifier que c'est bien le chauffeur qui fait la requête
    const myId = await getChauffeurIdFromUserId(userId);
    if (myId !== parseInt(chauffeurId)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    await db.execute(
      `UPDATE chauffeurs SET statut_disponibilite = ? WHERE id_chauffeur = ?`,
      [statut_disponibilite, chauffeurId]
    );

    res.json({
      message: 'Statut du chauffeur mis à jour',
      statut_disponibilite
    });
  } catch (error) {
    console.error('Erreur updateChauffeurStatus:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== UPDATE VEHICULE STATUS =====
exports.updateVehiculeStatus = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    const { statut_disponibilite } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    await db.execute(
      `UPDATE vehicules SET statut_disponibilite = ? WHERE id_vehicule = ?`,
      [statut_disponibilite, vehiculeId]
    );

    res.json({
      message: 'Statut du véhicule mis à jour',
      statut_disponibilite
    });
  } catch (error) {
    console.error('Erreur updateVehiculeStatus:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
}

// ===== SUBMIT MISSION NOTATION (FORMULAIRE CHEF DE MISSION) =====
exports.submitMissionNotation = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { missionId } = req.params;
    const { note, commentaire } = req.body;
    const noteValue = Number(note);
    const normalizedNote = noteValue > 5 && noteValue <= 20 ? noteValue / 4 : noteValue;

    if (!Number.isInteger(normalizedNote) || normalizedNote < 1 || normalizedNote > 5) {
      return res.status(400).json({ message: 'Note invalide (1-5)' });
    }

    await connection.beginTransaction();

    // Récupérer l'ID du chauffeur directement depuis la mission
    const [mission] = await connection.execute(
      `SELECT d.id_chauffeur, chef.id_missionnaire as id_chef_mission
       FROM demandemissions d
       LEFT JOIN missionnaires chef ON chef.id_mission = d.id AND chef.est_chef_mission = 1
       WHERE d.id = ?
       LIMIT 1`,
      [missionId]
    );

    if (mission.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Mission non trouvée' });
    }

    const chauffeurId = mission[0].id_chauffeur;
    const missionnaireId = mission[0].id_chef_mission;

    if (!chauffeurId) {
      await connection.rollback();
      return res.status(400).json({ message: 'Aucun chauffeur affecté à cette mission' });
    }

    if (!missionnaireId) {
      await connection.rollback();
      return res.status(400).json({ message: 'Aucun chef de mission trouvé pour cette mission' });
    }

    // Insérer la notation
    await connection.execute(
      `INSERT INTO notations_chauffeur 
       (id_demande, id_chauffeur, id_missionnaire_notant, note, commentaire, date_notation)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [missionId, chauffeurId, missionnaireId, normalizedNote, commentaire || null]
    );

    // Mettre à jour la moyenne des notes du chauffeur
    const [moyennes] = await connection.execute(
      `SELECT AVG(note) as moyenne FROM notations_chauffeur WHERE id_chauffeur = ? AND note IS NOT NULL`,
      [chauffeurId]
    );

    const moyenneNote = moyennes[0].moyenne || 0;
    await connection.execute(
      `UPDATE chauffeurs SET moyenne_notes = ? WHERE id_chauffeur = ?`,
      [moyenneNote, chauffeurId]
    );

    // Mettre à jour le statut de la mission si nécessaire (facultatif selon les règles métier)
    // await connection.execute(
    //   `UPDATE demandemissions SET statut_notation = 'Notée' WHERE id = ?`,
    //   [missionId]
    // );

    await connection.commit();
    res.json({ message: 'Notation enregistrée avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur submitMissionNotation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    connection.release();
  }
};

// ===== GET MISSION POUR NOTATION (LIEN PUBLIC) =====
exports.getMissionForNotation = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: 'Token manquant' });
    }

    // Vérifier le token et récupérer les données
    const [notations] = await db.execute(
      `SELECT nm.id_demande, nm.id_chauffeur,
              d.reference, d.motif, d.destination, d.dateDepart,
              u.nom as chaufNom, u.prenom as chaufPrenom,
              chef.nom as chefNom, chef.prenom as chefPrenom
       FROM notations_chauffeur nm
       JOIN demandemissions d ON nm.id_demande = d.id
       JOIN chauffeurs c ON nm.id_chauffeur = c.id_chauffeur
       JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
       LEFT JOIN missionnaires chef ON chef.id_mission = d.id AND chef.est_chef_mission = 1
       WHERE nm.lien_token = ? AND nm.token_utilise = 0`,
      [token]
    );

    if (notations.length === 0) {
      return res.status(404).json({ message: 'Lien de notation invalide ou déjà utilisé' });
    }

    const mission = notations[0];
    res.json({
      mission: {
        id: mission.id_demande,
        reference: mission.reference,
        motif: mission.motif,
        destination: mission.destination,
        dateDepart: mission.dateDepart,
        chefMission: {
          nom: mission.chefNom,
          prenom: mission.chefPrenom
        }
      },
      chauffeur: {
        nom: mission.chaufNom,
        prenom: mission.chaufPrenom
      }
    });
  } catch (error) {
    console.error('Erreur getMissionForNotation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ===== SUBMIT NOTATION VIA TOKEN =====
exports.submitNotationWithToken = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { token, note, commentaire } = req.body;
    const noteValue = Number(note);
    const normalizedNote = noteValue > 5 && noteValue <= 20 ? noteValue / 4 : noteValue;

    if (!Number.isInteger(normalizedNote) || normalizedNote < 1 || normalizedNote > 5) {
      return res.status(400).json({ message: 'Note invalide (1-5)' });
    }

    await connection.beginTransaction();

    // Récupérer l'enregistrement de notation avec le token
    const [notations] = await connection.execute(
      `SELECT id_notation, id_demande, id_chauffeur FROM notations_chauffeur WHERE lien_token = ? AND token_utilise = 0`,
      [token]
    );

    if (notations.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Token invalide ou déjà utilisé' });
    }

    const notation = notations[0];

    // Mettre à jour la notation
    await connection.execute(
      `UPDATE notations_chauffeur SET note = ?, commentaire = ?, date_notation = NOW(), token_utilise = 1
       WHERE id_notation = ?`,
      [normalizedNote, commentaire || null, notation.id_notation]
    );

    // Mettre à jour la moyenne des notes du chauffeur
    const [moyennes] = await connection.execute(
      `SELECT AVG(note) as moyenne FROM notations_chauffeur WHERE id_chauffeur = ?`,
      [notation.id_chauffeur]
    );

    const moyenneNote = moyennes[0].moyenne || 0;
    await connection.execute(
      `UPDATE chauffeurs SET moyenne_notes = ? WHERE id_chauffeur = ?`,
      [moyenneNote, notation.id_chauffeur]
    );

    await connection.commit();
    res.json({ message: 'Notation enregistrée avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur submitNotationWithToken:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    connection.release();
  }
};

// ===== GET MISSION DETAILS FOR NOTATION (PAR ID DEMANDE) =====
exports.getMissionDetailsForNotation = async (req, res) => {
  try {
    const { idDemande } = req.params;

    // Récupérer les détails de la mission et du chauffeur
    const [missions] = await db.execute(
      `SELECT d.id, d.reference, d.motif, d.destination, d.dateDepart,
              u.nom as chaufNom, u.prenom as chaufPrenom, c.id_chauffeur,
              chef.nom as chefNom, chef.prenom as chefPrenom
       FROM demandemissions d
       JOIN chauffeurs c ON d.id_chauffeur = c.id_chauffeur
       JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur
       LEFT JOIN missionnaires chef ON chef.id_mission = d.id AND chef.est_chef_mission = 1
       WHERE d.id = ?`,
      [idDemande]
    );

    if (missions.length === 0) {
      return res.status(404).json({ message: 'Mission non trouvée' });
    }

    const mission = missions[0];
    res.json({
      mission: {
        id: mission.id,
        reference: mission.reference,
        motif: mission.motif,
        destination: mission.destination,
        dateDepart: mission.dateDepart,
        chefMission: {
          nom: mission.chefNom,
          prenom: mission.chefPrenom
        }
      },
      chauffeur: {
        id: mission.id_chauffeur,
        nom: mission.chaufNom,
        prenom: mission.chaufPrenom
      }
    });
  } catch (error) {
    console.error('Erreur getMissionDetailsForNotation:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = exports;

