require("dotenv").config();
const express = require('express');
const cors = require('cors');
const authController = require('./controllers/authController');
const missionRoutes = require('./routes/missionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const validationRoutes = require('./routes/validationRoutes');
const chauffeurRoutes = require('./routes/chauffeurRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes pour les missions
app.use('/api/missions', missionRoutes);

// Routes pour l'administration
app.use('/api/admin', adminRoutes);

// Routes pour la validation des workflows
app.use('/api/validation', validationRoutes);

// Routes pour les chauffeurs
app.use('/api/chauffeur', chauffeurRoutes);
app.use('/api/chauffeurs', chauffeurRoutes);

// Routes pour l'authentification
app.post('/api/register', authController.register);
app.post('/api/login', authController.login);

// Routes pour la réinitialisation du mot de passe
app.post('/api/forgot-password', authController.forgotPassword);
app.post('/api/verify-code', authController.verifyCode);
app.post('/api/reset-password', authController.resetPassword);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur Node lancé sur http://localhost:${PORT}`);
});