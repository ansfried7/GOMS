const express = require('express');
const router = express.Router();
const validationController = require('../controllers/validationController');

// ╔══════════════════════════════════════════════════════════════╗
// ║           ROUTES DE VALIDATION DES WORKFLOWS               ║
// ╚══════════════════════════════════════════════════════════════╝

// 📋 Récupérer les demandes en attente pour un validateur
router.get('/en-attente/:id_utilisateur', validationController.getDemandesEnAttente);

// 📜 Récupérer l'historique des validations d'un validateur
router.get('/historique/:id_utilisateur', validationController.getHistoriqueValidations);

// 🏆 Récupérer les missions validées par un validateur
router.get('/missions-validees/:id_utilisateur', validationController.getMissionsValidees);

// 🔍 Récupérer les détails complets d'une demande avec permissions
router.get('/detail/:id_demande/:id_utilisateur', validationController.getDetailDemande);

// 🔐 Récupérer les permissions d'un utilisateur
router.get('/permissions/:id_utilisateur', validationController.getUserPermissions);

// ✅ Valider une étape du workflow
router.post('/valider', validationController.validerEtape);

// ❌ Rejeter une étape du workflow
router.post('/rejeter', validationController.rejeterEtape);

module.exports = router;
