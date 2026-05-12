-- Reformatage de la table des visites techniques.
-- A executer une fois sur la base existante avant d'utiliser le nouveau suivi chauffeur.

CREATE TABLE IF NOT EXISTS visites_techniques_new (
  id_visite_technique INT NOT NULL AUTO_INCREMENT,
  id_vehicule INT NOT NULL,
  id_chauffeur INT DEFAULT NULL,
  statut_visite ENUM('En cours','Effectuée') NOT NULL DEFAULT 'En cours',
  km_depart INT DEFAULT NULL,
  heure_depart TIME DEFAULT NULL,
  km_fin INT DEFAULT NULL,
  heure_fin TIME DEFAULT NULL,
  cout_visite_technique DECIMAL(12,2) DEFAULT NULL,
  observation TEXT,
  date_creation TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  date_modification TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_visite_technique),
  KEY idx_visites_techniques_vehicule (id_vehicule),
  KEY idx_visites_techniques_chauffeur (id_chauffeur),
  KEY idx_visites_techniques_statut (statut_visite),
  CONSTRAINT fk_visites_techniques_vehicule
    FOREIGN KEY (id_vehicule) REFERENCES vehicules(id_vehicule)
    ON DELETE CASCADE,
  CONSTRAINT fk_visites_techniques_chauffeur
    FOREIGN KEY (id_chauffeur) REFERENCES chauffeurs(id_chauffeur)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO visites_techniques_new (
  id_visite_technique,
  id_vehicule,
  id_chauffeur,
  statut_visite,
  km_fin,
  heure_fin,
  cout_visite_technique,
  observation,
  date_creation,
  date_modification
)
SELECT
  id_visite_technique,
  id_vehicule,
  id_chauffeur,
  CASE
    WHEN statut_visite_technique = 'Effectuée' THEN 'Effectuée'
    ELSE 'En cours'
  END,
  km_visite_technique,
  CASE WHEN date_realisation IS NULL THEN NULL ELSE '00:00:00' END,
  cout_visite_technique,
  observations_visite_technique,
  date_creation,
  date_modification
FROM visites_techniques;

DROP TABLE visites_techniques;
RENAME TABLE visites_techniques_new TO visites_techniques;
