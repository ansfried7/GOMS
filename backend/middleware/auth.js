const db = require('../config/db');

/**
 * Middleware d'authentification pour vérifier le JWT
 * Extrait l'ID de l'utilisateur du token et le stocke dans req.user
 */
exports.authenticateToken = async (req, res, next) => {
  try {
    // Note: En production, utilisez un JWT ou un système d'authentification complet.
    // En développement, l'ID de l'utilisateur est transmis via le header `x-user-id`.
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ message: 'ID utilisateur non fourni' });
    }

    // Vérifier que l'utilisateur existe dans la base de données
    const [users] = await db.execute(
      'SELECT id_utilisateur, role FROM utilisateurs WHERE id_utilisateur = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Utilisateur non trouvé' });
    }

    // Stocker les informations de l'utilisateur dans req.user
    req.user = {
      id: userId,
      role: users[0].role
    };

    next();
  } catch (error) {
    console.error('Erreur authentification:', error);
    res.status(500).json({ message: 'Erreur d\'authentification' });
  }
};

/**
 * Middleware pour vérifier que l'utilisateur a un rôle spécifique
 */
exports.authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    next();
  };
};

module.exports = exports;
