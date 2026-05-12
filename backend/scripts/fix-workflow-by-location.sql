-- Script de correction des workflows basé sur l'emplacement du demandeur
-- (non pas sur la portée comme c'était le cas avant)

-- ✅ ÉTAPE 1 : Assigner "Workflow Siège" (id=1) aux demandes des demandeurs au Siège
UPDATE demandemissions dm
SET dm.id_workflow = 1
WHERE dm.id_demandeurs IN (
  SELECT d.id_demandeur 
  FROM demandeurs d 
  WHERE d.emplacement = 'Siège'
);

-- ✅ ÉTAPE 2 : Assigner "Workflow Usine" (id=2) aux demandes des demandeurs en Usine
UPDATE demandemissions dm
SET dm.id_workflow = 2
WHERE dm.id_demandeurs IN (
  SELECT d.id_demandeur 
  FROM demandeurs d 
  WHERE d.emplacement = 'Usine'
);

-- 📊 VÉRIFICATION : Afficher les demandes avec leur workflow et emplacement
SELECT 
  dm.id,
  dm.reference,
  dm.portee,
  d.emplacement,
  dm.id_workflow,
  CASE 
    WHEN dm.id_workflow = 1 THEN 'Workflow Siège'
    WHEN dm.id_workflow = 2 THEN 'Workflow Usine'
    ELSE 'Workflow Indéfini'
  END as workflow_type,
  dm.statut,
  dm.created_at
FROM demandemissions dm
JOIN demandeurs d ON dm.id_demandeurs = d.id_demandeur
ORDER BY dm.created_at DESC;
