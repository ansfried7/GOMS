const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const chauffeurController = require('../controllers/chauffeurController');
const preplanController = require('../controllers/preplanController');

// ==================== ROUTES UTILISATEURS ====================
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// ==================== ROUTES SOUS-RÔLES ====================
router.get('/sub-roles', adminController.getAllSubRoles);
router.get('/sub-roles/:id', adminController.getSubRoleById);
router.get('/permissions', adminController.getAllPermissions);
router.post('/sub-roles', adminController.createSubRole);
router.put('/sub-roles/:id', adminController.updateSubRole);
router.delete('/sub-roles/:id', adminController.deleteSubRole);

// ==================== ROUTES WORKFLOWS ====================
router.get('/workflows', adminController.getWorkflows);
router.get('/workflows/:id', adminController.getWorkflowById);
router.put('/workflows/:id', adminController.updateWorkflow);

// ==================== ROUTES CHAUFFEURS ====================
router.get('/chauffeurs', adminController.getAllChauffeurs);
router.get('/chauffeurs/:id', adminController.getChauffeurById);
router.put('/chauffeurs/:id', adminController.updateChauffeur);
router.put('/liaison', adminController.updateLiaison);
router.get('/suivi-chauffeurs', adminController.getSuiviChauffeurs);
router.get('/maintenance-vehicles', adminController.getMaintenanceVehicles);

// ==================== ROUTES VÉHICULES ====================
router.get('/vehicules', adminController.getAllVehicules);
router.get('/vehicules/:id', adminController.getVehiculeById);
router.post('/vehicules', adminController.createVehicule);
router.put('/vehicules/:id', adminController.updateVehicule);
router.put('/vehicules/:vehiculeId/statut', chauffeurController.updateVehiculeStatus);
router.delete('/vehicules/:id', adminController.deleteVehicule);

// ==================== ROUTES GRILLE TARIFAIRE ====================
router.get('/tariffs', adminController.getAllTarifs);
router.get('/tariffs/by-portee', adminController.getTarifsByPortee);
router.get('/categories', adminController.getAllCategories);
router.put('/tariffs/:id', adminController.updateTarif);
router.post('/calculate-fees', adminController.calculateMissionFees);

// ==================== ROUTES MISSIONS PRÉPLANIFIÉES ====================
router.get('/workflows-list', preplanController.getWorkflows);
router.get('/preplan-missions', preplanController.getAllPreplans);
router.get('/preplan-missions/:id', preplanController.getPreplanById);
router.post('/preplan-missions', preplanController.createPreplan);
router.put('/preplan-missions/:id', preplanController.updatePreplan);
router.delete('/preplan-missions/:id', preplanController.deletePreplan);

// ==================== ROUTES AFFECTATION DE RESSOURCES ====================
router.get('/available-resources', adminController.getAvailableResources);
router.post('/affect-resources', adminController.affectResourceToMission);
router.get('/missions/:missionId/enregistrements', adminController.getMissionEnregistrements);

// ==================== ROUTES DEMANDEURS ====================
router.get('/demandeurs', adminController.getAllDemandeurs);

// ==================== ROUTE DASHBOARD STATISTIQUES ====================
router.get('/dashboard/stats', adminController.getDashboardStats);

module.exports = router;
