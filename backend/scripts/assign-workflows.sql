-- Script pour assigner les workflows par défaut aux demandes qui n'en ont pas

-- 1️⃣ Assigner "Workflow Siège" (id=1) aux demandes des demandeurs au Siège
UPDATE demandemissions dm
SET dm.id_workflow = 1
WHERE dm.id_workflow IS NULL 
  AND dm.id_demandeurs IN (
    SELECT d.id_demandeur 
    FROM demandeurs d 
    WHERE d.emplacement = 'Siège'
  );

-- 2️⃣ Assigner "Workflow Usine" (id=2) aux demandes des demandeurs en Usine
UPDATE demandemissions dm
SET dm.id_workflow = 2
WHERE dm.id_workflow IS NULL 
  AND dm.id_demandeurs IN (
    SELECT d.id_demandeur 
    FROM demandeurs d 
    WHERE d.emplacement = 'Usine'
  );

-- 3️⃣ Vérifier le statut des demandes
SELECT id, reference, id_demandeurs, id_workflow, statut, created_at 
FROM demandemissions 
ORDER BY created_at DESC;
