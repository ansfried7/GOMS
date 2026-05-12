const express = require('express');
const router = express.Router();
const chauffeurController = require('../controllers/chauffeurController');
const { authenticateToken } = require('../middleware/auth');

// ===== ROUTES PROTÉGÉES (AVEC AUTHENTIFICATION) =====
router.use(authenticateToken);

// ===== GESTION DES STATUTS =====
router.put('/:vehiculeId/statut', chauffeurController.updateVehiculeStatus);

module.exports = router;
