-- Migration pour aligner les enregistrements chauffeur sur les demandes de mission
-- Passage de id_ordre à id_demandemission pour les tables de carburation et kilométrage
-- Suppression des champs heure/date, utilisation de date_creation pour l'historique temporel

-- Table de carburation
ALTER TABLE enregistrements_carburation
  DROP FOREIGN KEY enregistrements_carburation_ibfk_1;

ALTER TABLE enregistrements_carburation
  DROP INDEX id_ordre,
  CHANGE COLUMN id_ordre id_demandemission int NOT NULL,
  CHANGE COLUMN quantite_litres quantite_carburant decimal(8,2) NOT NULL,
  DROP COLUMN heure_carburation,
  DROP COLUMN date_carburation,
  ADD COLUMN id_chauffeur int NOT NULL AFTER id_demandemission,
  ADD INDEX idx_id_demandemission (id_demandemission);

ALTER TABLE enregistrements_carburation
  ADD CONSTRAINT enregistrements_carburation_ibfk_1 FOREIGN KEY (id_demandemission) REFERENCES demandemissions(id) ON DELETE CASCADE;

-- Table kilométrage chauffeur
ALTER TABLE enregistrements_km_chauffeur
  DROP FOREIGN KEY enregistrements_km_chauffeur_ibfk_1;

ALTER TABLE enregistrements_km_chauffeur
  DROP INDEX id_ordre,
  CHANGE COLUMN id_ordre id_demandemission int NOT NULL,
  ADD COLUMN id_chauffeur int NOT NULL AFTER id_demandemission,
  ADD COLUMN `type` enum('debut','fin') NOT NULL DEFAULT 'debut' AFTER id_chauffeur,
  ADD COLUMN kilometrage int DEFAULT NULL AFTER `type`,
  DROP COLUMN km_depart,
  DROP COLUMN heure_depart,
  DROP COLUMN date_depart_reel,
  DROP COLUMN km_arrivee,
  DROP COLUMN heure_arrivee,
  DROP COLUMN date_arrivee_reel,
  DROP COLUMN observations_depart,
  DROP COLUMN observations_arrivee,
  ADD INDEX idx_id_demandemission (id_demandemission);

ALTER TABLE enregistrements_km_chauffeur
  ADD CONSTRAINT enregistrements_km_chauffeur_ibfk_1 FOREIGN KEY (id_demandemission) REFERENCES demandemissions(id) ON DELETE CASCADE;
