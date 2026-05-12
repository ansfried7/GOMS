-- ════════════════════════════════════════════════════════════════════════════
-- 🔄 MIGRATION: Corriger la table VALIDATIONS pour supporter les demandes de missions
-- ════════════════════════════════════════════════════════════════════════════

-- 1️⃣ Ajouter les colonnes manquantes (si elles n'existent pas)
ALTER TABLE validations
ADD COLUMN IF NOT EXISTS id_demande INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS id_utilisateur INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS signature TINYINT DEFAULT 0;

-- 2️⃣ Ajouter les clés étrangères pour les nouvelles colonnes
ALTER TABLE validations
ADD CONSTRAINT fk_validations_demande FOREIGN KEY (id_demande) 
  REFERENCES demandemissions(id) ON DELETE CASCADE;

ALTER TABLE validations
ADD CONSTRAINT fk_validations_utilisateur FOREIGN KEY (id_utilisateur)
  REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE;

-- 3️⃣ Modifier le type de la décision pour correspondre au code
ALTER TABLE validations MODIFY COLUMN decision 
  ENUM('VALIDÉE','REJETÉE','En attente') DEFAULT 'En attente';

-- 4️⃣ Créer un index pour des recherches rapides
CREATE INDEX idx_validations_demande_etape ON validations(id_demande, id_etape);
CREATE INDEX idx_validations_utilisateur ON validations(id_utilisateur);
CREATE INDEX idx_validations_date ON validations(date_validation);
