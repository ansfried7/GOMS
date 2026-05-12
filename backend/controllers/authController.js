const db = require("../config/db");
const nodemailer = require("nodemailer");
require("dotenv").config();

// ─────────────────────────────────────────────
// UTILITAIRE : Générer un code à 6 chiffres
// ─────────────────────────────────────────────
function genererCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─────────────────────────────────────────────
// UTILITAIRE : Transporteur Nodemailer
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ─────────────────────────────────────────────
// INSCRIPTION
// ─────────────────────────────────────────────
exports.register = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { nom, prenom, email, password, emplacement, localite } = req.body;

    console.log("📝 Tentative d'inscription:", { nom, prenom, email });

    const [checkEmail] = await connection.execute(
      "SELECT id_utilisateur FROM utilisateurs WHERE email = ?",
      [email],
    );

    if (checkEmail.length > 0) {
      connection.release();
      return res.status(400).json({ message: "Cet email est déjà utilisé." });
    }

    await connection.beginTransaction();
    const username = email.split('@')[0] + '_' + Date.now();

    const sqlUser = `INSERT INTO utilisateurs (nom, prenom, email, username, password, role, statut_compte) VALUES (?, ?, ?, ?, ?, 'Demandeur', 'Actif')`;
    const [userResult] = await connection.execute(sqlUser, [
      nom,
      prenom,
      email,
      username,
      password,
    ]);

    const userId = userResult.insertId;

    const sqlDemandeur = `INSERT INTO demandeurs (id_utilisateur, emplacement, localite) VALUES (?, ?, ?)`;
    await connection.execute(sqlDemandeur, [userId, emplacement, localite]);

    await connection.commit();
    console.log("✅ Inscription réussie pour:", email);
    res.status(201).json({ message: "Compte SODECO créé avec succès !" });
  } catch (error) {
    await connection.rollback();
    console.error("❌ ERREUR SQL lors de l'inscription:", error.message);
    res.status(500).json({
      message: "Erreur lors de l'inscription",
      details: error.message,
    });
  } finally {
    connection.release();
  }
};

// ─────────────────────────────────────────────
// CONNEXION
// ─────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔐 Tentative de connexion avec l'email:", email);

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis." });
    }

    const [users] = await db.execute(
      "SELECT id_utilisateur, nom, prenom, email, password, role, statut_compte FROM utilisateurs WHERE email = ?",
      [email],
    );

    console.log("✅ Résultat de la requête utilisateur:", users.length > 0 ? "Utilisateur trouvé" : "Utilisateur non trouvé");

    if (users.length === 0) {
      return res
        .status(401)
        .json({ message: "Email ou mot de passe incorrect." });
    }

    const user = users[0];
    console.log("👤 Utilisateur récupéré:", { id: user.id_utilisateur, email: user.email, role: user.role, statut: user.statut_compte });

    if (user.statut_compte !== 'Actif') {
      return res.status(403).json({ message: "Ce compte a été désactivé." });
    }

    const isMatch = password === user.password;
    console.log("🔑 Vérification du mot de passe:", isMatch ? "✅ Correct" : "❌ Incorrect");

    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Email ou mot de passe incorrect." });
    }

    console.log("✅ Connexion réussie pour:", user.email);

    // Si c'est un validateur, récupérer son id_sous_role et nom_sous_role
    let id_sous_role = null;
    let nom_sous_role = null;

    if (user.role === 'Validateur') {
      const [validateurs] = await db.execute(
        `SELECT v.id_sous_role, sr.nom_sous_role 
         FROM validateurs v
         JOIN sous_roles sr ON v.id_sous_role = sr.id_sous_role
         WHERE v.id_utilisateur = ?
         LIMIT 1`,
        [user.id_utilisateur]
      );

      if (validateurs.length > 0) {
        id_sous_role = validateurs[0].id_sous_role;
        nom_sous_role = validateurs[0].nom_sous_role;
      }
    }

    res.json({
      message: "Connexion réussie",
      user: {
        id: user.id_utilisateur,
        id_utilisateur: user.id_utilisateur,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        id_sous_role: id_sous_role,
        nom_sous_role: nom_sous_role,
      },
    });
  } catch (error) {
    console.error("❌ ERREUR Login détaillée:");
    console.error("   - Message:", error.message);
    console.error("   - Code:", error.code);
    console.error("   - Stack:", error.stack);
    res.status(500).json({ 
      message: "Erreur lors de la connexion.",
      details: error.message 
    });
  }
};

// ─────────────────────────────────────────────
// MOT DE PASSE OUBLIÉ — Étape 1 : Envoyer le code
// ─────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "L'email est requis." });
  }

  try {
    const [users] = await db.execute(
      "SELECT id_utilisateur, prenom FROM utilisateurs WHERE email = ?",
      [email],
    );

    if (users.length === 0) {
      return res.json({
        message:
          "Si cet email existe, un code de réinitialisation a été envoyé.",
      });
    }

    const user = users[0];
    const code = genererCode();

    const expiration = new Date(Date.now() + 15 * 60 * 1000);
    const expirationSQL = expiration
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await db.execute(
      "DELETE FROM reset_password_tokens WHERE utilisateur_id = ?",
      [user.id_utilisateur],
    );

    await db.execute(
      "INSERT INTO reset_password_tokens (utilisateur_id, code, expiration) VALUES (?, ?, ?)",
      [user.id_utilisateur, code, expirationSQL],
    );

    await transporter.sendMail({
      from: `"SODECO - Gestion des Missions" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Code de réinitialisation de votre mot de passe SODECO",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #1b2b48;">SODECO</h2>
            <p style="color: #555;">Gestion des Ordres de Mission</p>
          </div>
          <p>Bonjour <strong>${user.prenom}</strong>,</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe. Voici votre code de vérification :</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2e8b57; background: #f0f9f4; padding: 16px 24px; border-radius: 8px; border: 2px dashed #2e8b57;">
              ${code}
            </span>
          </div>
          <p style="color: #888;">Ce code est valable pendant <strong>15 minutes</strong>.</p>
          <p style="color: #888;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
          <p style="text-align: center; color: #bbb; font-size: 12px;">© 2026 SODECO - Tous droits réservés</p>
        </div>
      `,
    });

    res.json({
      message: "Si cet email existe, un code de réinitialisation a été envoyé.",
    });
  } catch (error) {
    console.error("Erreur forgotPassword:", error);
    res
      .status(500)
      .json({
        message: "Erreur lors de l'envoi du code.",
        details: error.message,
      });
  }
};

// ─────────────────────────────────────────────
// MOT DE PASSE OUBLIÉ — Étape 2 : Vérifier le code
// ─────────────────────────────────────────────
exports.verifyCode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: "Email et code requis." });
  }

  try {
    const [users] = await db.execute(
      "SELECT id_utilisateur FROM utilisateurs WHERE email = ?",
      [email],
    );

    if (users.length === 0) {
      return res.status(400).json({ message: "Code invalide ou expiré." });
    }

    const userId = users[0].id_utilisateur;

    const [tokens] = await db.execute(
      "SELECT * FROM reset_password_tokens WHERE utilisateur_id = ? AND code = ?",
      [userId, code],
    );

    if (tokens.length === 0) {
      return res.status(400).json({ message: "Code incorrect." });
    }

    const token = tokens[0];

    if (new Date() > new Date(token.expiration)) {
      await db.execute(
        "DELETE FROM reset_password_tokens WHERE utilisateur_id = ?",
        [userId],
      );
      return res
        .status(400)
        .json({ message: "Ce code a expiré. Veuillez recommencer." });
    }

    res.json({ message: "Code vérifié avec succès.", valide: true });
  } catch (error) {
    console.error("Erreur verifyCode:", error);
    res.status(500).json({ message: "Erreur lors de la vérification." });
  }
};

// ─────────────────────────────────────────────
// MOT DE PASSE OUBLIÉ — Étape 3 : Réinitialiser le mot de passe
// ─────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res
      .status(400)
      .json({ message: "Email, code et nouveau mot de passe requis." });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({
        message: "Le mot de passe doit contenir au moins 6 caractères.",
      });
  }

  try {
    const [users] = await db.execute(
      "SELECT id_utilisateur FROM utilisateurs WHERE email = ?",
      [email],
    );

    if (users.length === 0) {
      return res.status(400).json({ message: "Opération invalide." });
    }

    const userId = users[0].id_utilisateur;

    const [tokens] = await db.execute(
      "SELECT * FROM reset_password_tokens WHERE utilisateur_id = ? AND code = ?",
      [userId, code],
    );

    if (tokens.length === 0) {
      return res.status(400).json({ message: "Code invalide. Recommencez." });
    }

    if (new Date() > new Date(tokens[0].expiration)) {
      await db.execute(
        "DELETE FROM reset_password_tokens WHERE utilisateur_id = ?",
        [userId],
      );
      return res
        .status(400)
        .json({ message: "Code expiré. Veuillez recommencer." });
    }

    const hashedPassword = newPassword;

    await db.execute("UPDATE utilisateurs SET password = ? WHERE id_utilisateur = ?", [
      hashedPassword,
      userId,
    ]);

    await db.execute(
      "DELETE FROM reset_password_tokens WHERE utilisateur_id = ?",
      [userId],
    );

    res.json({ message: "Mot de passe réinitialisé avec succès !" });
  } catch (error) {
    console.error("Erreur resetPassword:", error);
    res.status(500).json({ message: "Erreur lors de la réinitialisation." });
  }
};
