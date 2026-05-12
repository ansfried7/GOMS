const express = require('express');
const router = express.Router();
const chauffeurController = require('../controllers/chauffeurController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// ===== ROUTES PUBLIQUES (SANS AUTHENTIFICATION) =====
// Récupérer la mission pour notation via token
router.get('/notation/mission', chauffeurController.getMissionForNotation);
router.get('/notation/:idDemande/details', chauffeurController.getMissionDetailsForNotation);
// Soumettre une notation via token
router.post('/notation/submit', chauffeurController.submitNotationWithToken);
router.post('/notation/:missionId', chauffeurController.submitMissionNotation);

// ===== ROUTES PROTÉGÉES (AVEC AUTHENTIFICATION) =====
// Appliquer le middleware d'authentification à toutes les routes suivantes
router.use(authenticateToken);

// ===== DASHBOARD ET MISSION EN COURS =====
router.get('/dashboard', chauffeurController.getDashboard);
router.get('/missions/en-cours', chauffeurController.getMissionEnCours);

// ===== MISSIONS À VENIR ET HISTORIQUE =====
router.get('/missions/a-venir', chauffeurController.getMissionsAVenir);
router.get('/missions/historique', chauffeurController.getHistoriqueMissions);
router.get('/missions/:missionId', chauffeurController.getMissionDetail);

// ===== LANCER UNE MISSION =====
router.put('/missions/:missionId/launch', chauffeurController.launchMission);

// ===== ENREGISTREMENTS DE MISSIONS =====
// Enregistrements kilométriques et carburation
router.post('/missions/:missionId/enregistrement', chauffeurController.saveMissionEnregistrement);
router.post('/missions/:missionId/carburation', chauffeurController.saveCarburation);

// ===== VISITE TECHNIQUE =====
router.get('/visite-technique', chauffeurController.getVisiteTechnique);
router.post('/visite-technique/:visiteId/enregistrement', chauffeurController.saveVisiteTechniqueEnregistrement);

// ===== NOTES ET NOTATIONS =====
router.get('/notes', chauffeurController.getChauffeurNotes);

// ===== GESTION DES STATUTS =====
router.put('/:chauffeurId/statut', chauffeurController.updateChauffeurStatus);

module.exports = router;
