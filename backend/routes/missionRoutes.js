const express = require('express');
const router = express.Router();
const missionController = require('../controllers/missionController');
const downloadOrdreController = require('../controllers/downloadOrdreController');
const pdfFraisController = require('../controllers/pdfFraisController');
const adminController = require('../controllers/adminController');

// Route pour créer une mission complète
router.post('/create', missionController.createDemande);

// Récupérer les brouillons d'un demandeur
router.get('/brouillons/:id_demandeurs', missionController.getBrouillons);

// Récupérer les statistiques du dashboard
router.get('/dashboard/:id_demandeurs', missionController.getDashboardStats);

// Historique complet
router.get('/all/:id_demandeurs', missionController.getAllMissions);

// ═══════════════════════════════════════════════════════════════════════
// ORDRES DE MISSION (NEW)
// ═══════════════════════════════════════════════════════════════════════

// Créer un ordre de mission à partir d'une demande (ASSISTANT DRH)
router.post('/ordre/create', missionController.createOrdreFromDemande);

// Récupérer les ordres de mission (ASSISTANT DRH, CSMG, DAF, DRH, DG)
router.get('/ordre/list/:id_utilisateur', missionController.getOrdresMission);

// Mettre à jour un ordre de mission (DRH)
router.put('/ordre/update', missionController.updateOrdre);

// Mettre à jour les catégories socio-professionnelles (ASSISTANTE DRH)
router.post('/demande/update-categories', missionController.updateMissionnairesCategories);

// ═══════════════════════════════════════════════════════════════════════
// AFFECTATION RESSOURCES (NEW)
// ═══════════════════════════════════════════════════════════════════════

// Affecter chauffeur et véhicule (CSMG)
router.post('/ressources/affecter', missionController.affecterRessources);

// Récupérer chauffeurs disponibles (pour affectation)
router.get('/resources/chauffeurs', adminController.getAllChauffeurs);

// Récupérer véhicules disponibles (pour affectation)
router.get('/resources/vehicules', adminController.getAllVehicules);

// ═══════════════════════════════════════════════════════════════════════
// GESTION DES FRAIS (NEW)
// ═══════════════════════════════════════════════════════════════════════

// Consulter les frais d'un ordre (DAF)
router.get('/frais/consulter/:id_demande', missionController.getFraisOrdre);

// Modifier les frais d'un ordre (DAF)
router.put('/frais/update', missionController.updateFraisOrdre);

// Télécharger l'état des frais d'un missionnaire en PDF
router.get('/download/frais/:id_missionnaire', pdfFraisController.downloadFraisMissionnaireAsPDF);

// Télécharger l'ordre de mission en PDF
router.get('/download/ordre/:id_demande', downloadOrdreController.downloadOrdreAsPDF);

// Supprimer une mission/brouillon par son ID
router.delete('/:id', missionController.deleteMission);

// Récupérer les détails d'une mission par son ID
// (Gardé en dernier pour ne pas interférer avec les routes au-dessus)
router.get('/:id', missionController.getMissionById);

module.exports = router;