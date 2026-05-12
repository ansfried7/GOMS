-- Migration: Nouvelle logique - Une Demande = Un Ordre
-- Date: 2026-05-06
-- Description: Changement majeur pour simplifier la gestion des demandes et ordres

-- Cette migration est principalement documentaire puisque:
-- 1. ordres_missions table existe déjà
-- 2. est_ordre_mission colonne existe déjà
-- 3. La logique a été changée dans le backend:
--    - createDemande() crée aussi ordres_missions automatiquement
--    - createOrdreFromDemande() UPDATE la demande au lieu d'INSERT une nouvelle

-- Notes:
-- - id_ordre_lié reste dans demandemissions pour compatibilité rétroactive
-- - Une demande (id) a exactement un ordre via ordres_missions.id_demande
-- - est_ordre_mission = 0 : C'est une demande classique
-- - est_ordre_mission = 1 : C'est un ordre de mission

-- Vérification:
SELECT 'Vérification des demandes avec ordres' as check_type;
SELECT 
  dm.id, 
  dm.reference, 
  dm.est_ordre_mission,
  om.id_ordre,
  CASE 
    WHEN dm.est_ordre_mission = 0 THEN 'Demande'
    WHEN dm.est_ordre_mission = 1 THEN 'Ordre'
    ELSE 'Inconnu'
  END as type
FROM demandemissions dm
LEFT JOIN ordres_missions om ON dm.id = om.id_demande
ORDER BY dm.created_at DESC
LIMIT 20;
