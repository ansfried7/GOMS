const PDFDocument = require("pdfkit");
const db = require("../config/db");

// ═══════════════════════════════════════════════════════════════════════
// 📄 TÉLÉCHARGER L'ORDRE DE MISSION EN PDF
// ═══════════════════════════════════════════════════════════════════════
exports.downloadOrdreAsPDF = async (req, res) => {
  try {
    const { id_demande } = req.params;

    if (!id_demande) {
      return res.status(400).json({ message: "ID demande manquant" });
    }

    console.log(`📄 Début génération PDF pour ordre id_demande=${id_demande}`);

    // 1️⃣ Récupérer les infos de l'ordre
    const [demandes] = await db.execute(
      `SELECT * FROM demandemissions WHERE id = ? AND est_ordre_mission = 1`,
      [id_demande]
    );

    if (demandes.length === 0) {
      console.error(`❌ Ordre non trouvé pour id_demande=${id_demande}`);
      return res.status(404).json({ message: "Ordre de mission non trouvé" });
    }

    const demande = demandes[0];

    // 2️⃣ Récupérer les missionnaires
    const [missionnaires] = await db.execute(
      `SELECT * FROM missionnaires WHERE id_mission = ?`,
      [id_demande]
    );

    if (!missionnaires || missionnaires.length === 0) {
      console.warn(`⚠️ Aucun missionnaire trouvé pour id_demande=${id_demande}`);
    }

    // 3️⃣ Récupérer chauffeur et véhicule
    let chauffeur = null;
    let vehicule = null;
    if (demande.id_chauffeur) {
      const [chaufResult] = await db.execute(
        `SELECT u.nom, u.prenom, c.telephone FROM chauffeurs c 
         JOIN utilisateurs u ON c.id_utilisateur = u.id_utilisateur 
         WHERE c.id_chauffeur = ?`,
        [demande.id_chauffeur]
      );
      if (chaufResult.length > 0) chauffeur = chaufResult[0];
    }
    if (demande.id_vehicule) {
      const [vehicResult] = await db.execute(
        `SELECT marque, type_vehicule as type, immatriculation FROM vehicules WHERE id_vehicule = ?`,
        [demande.id_vehicule]
      );
      if (vehicResult.length > 0) vehicule = vehicResult[0];
    }

    // 4️⃣ Récupérer la signature du DG
    const [dgSignatures] = await db.execute(
      `SELECT v.signature_numerique, v.signature, v.date_validation, u.nom, u.prenom
       FROM validations v
       JOIN etapes_workflow ew ON ew.id_etape = v.id_etape
       LEFT JOIN utilisateurs u ON u.id_utilisateur = v.id_utilisateur
       WHERE v.id_demande = ?
         AND v.decision LIKE 'VALID%'
         AND (ew.id_sous_role_requis = 12 OR ew.libelle_etape LIKE '%Directeur G%')
       ORDER BY v.date_validation DESC
       LIMIT 1`,
      [id_demande]
    );
    const dgSignature = dgSignatures[0] || null;

    // 5️⃣ Créer le PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40
    });

    const pageLeft = 58;
    const pageRight = 537;
    const contentWidth = pageRight - pageLeft;

    const formatDate = (value, options = {}) => {
      if (!value) return 'N/A';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return String(value);
      return parsed.toLocaleDateString('fr-FR', options);
    };

    const formatLongDate = (value) => formatDate(value, {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const fullName = (person) => [person?.prenom, person?.nom].filter(Boolean).join(' ').trim();
    const missionChief = missionnaires.find((m) => m.est_chef_mission) || missionnaires[0] || null;
    const signatureData = dgSignature?.signature_numerique || '';
    const signatureName = fullName(dgSignature) || 'Directeur General';

    // Bordure de page
    doc.rect(28, 22, 539, 792).lineWidth(0.8).strokeColor('#333333').stroke();
    doc.fillColor('#111111');

    // En-tête SODECO
    doc.font('Helvetica-Bold').fontSize(18).text('SODECO', pageLeft, 58, { width: contentWidth, align: 'center' });
    doc.font('Helvetica').fontSize(12).text('SOCIETE POUR LE DEVELOPPEMENT DU COTON', { align: 'center' });
    doc.fontSize(9)
      .text("Société Anonyme avec Conseil d'Administration au capital de FCFA 100 milliards", { align: 'center' })
      .text('Siège social : Immeuble FAGACE (bât. B), Boulevard de la CEN-SAD 01 BP 8059', { align: 'center' })
      .text('Tél : (229) 21.30.95.39 / 21.30.95.11 - Fax : (229) 21.30.94.46 Cotonou (Bénin)', { align: 'center' });

    doc.moveDown(1.5);
    doc.fontSize(10).text(`Cotonou, le ${formatDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric' })}`, pageLeft, doc.y, {
      width: contentWidth,
      align: 'right'
    });

    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(10).text(`N/Ref. : ${demande.reference || `${demande.id}/SODECO/OM`}`, pageLeft, doc.y);

    doc.moveDown(1.2);
    const titleY = doc.y;
    doc.rect(120, titleY, 355, 38).lineWidth(1.5).strokeColor('#222222').stroke();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text('ORDRE DE MISSION', 120, titleY + 12, {
      width: 355,
      align: 'center'
    });
    doc.y = titleY + 58;

    doc.font('Helvetica-Bold').fontSize(11).text('Le Directeur Général de la SODECO autorise :', pageLeft, doc.y);
    doc.moveDown(1);

    if (missionnaires.length === 0) {
      doc.font('Helvetica').text('- Aucun missionnaire enregistré', pageLeft + 25);
    } else {
      missionnaires.forEach((m) => {
        const name = `${m.nom || ''} ${m.prenom || ''}`.trim() || 'N/A';
        const role = m.fonction ? `, ${m.fonction}` : '';
        doc.font('Helvetica-Bold').fontSize(11).text(`- ${name}${role}`, pageLeft + 25, doc.y);
      });
    }

    doc.moveDown(1.2);
    doc.font('Helvetica').fontSize(11).text('Tous en service à la SODECO (Société pour le Développement du Coton),', pageLeft, doc.y, {
      width: contentWidth,
      align: 'left'
    });

    doc.moveDown(1.2);
    doc.text(`À se rendre à ${demande.destination || 'N/A'}`, pageLeft, doc.y);
    doc.moveDown(1.1);

    const writeLabelLine = (label, value) => {
      doc.font('Helvetica-Bold').text(`${label} : `, pageLeft, doc.y, { continued: true });
      doc.font('Helvetica').text(value || 'N/A');
    };

    writeLabelLine('Motif', demande.motif || 'N/A');
    if (chauffeur) writeLabelLine('Conducteur', `${chauffeur.nom || ''} ${chauffeur.prenom || ''}`.trim());
    else writeLabelLine('Conducteur', 'Non affecté');

    if (vehicule) writeLabelLine('Moyen de Transport', `${vehicule.marque || ''} ${vehicule.type || ''} (${vehicule.immatriculation || 'N/A'})`.trim());
    else writeLabelLine('Moyen de Transport', demande.moyen_transport_libelle || 'Non affecté');

    writeLabelLine('Date de Départ', formatLongDate(demande.dateDepart));
    writeLabelLine('Date de Retour', formatLongDate(demande.dateRetour));
    writeLabelLine('Chef de mission', missionChief ? `${missionChief.nom || ''} ${missionChief.prenom || ''}`.trim() : 'N/A');

    doc.moveDown(1.1);
    doc.font('Helvetica-Bold').text('Les frais de mission sont imputables au budget de la SODECO.', pageLeft, doc.y, {
      width: contentWidth
    });

    doc.moveDown(1.1);
    doc.font('Helvetica-Bold').text('Les Autorités Politiques et Administratives ', pageLeft, doc.y, { continued: true });
    doc.font('Helvetica').text("sont priées de faciliter aux intéressés, l'accomplissement de leur mission.", {
      width: contentWidth
    });

    // Signature
    const signatureX = 365;
    const signatureY = 655;
    
    if (signatureData && signatureData.startsWith('data:image/')) {
      try {
        const signatureBuffer = Buffer.from(signatureData.split(',')[1], 'base64');
        doc.image(signatureBuffer, signatureX, signatureY - 52, { width: 135, height: 55, fit: [135, 55] });
      } catch (imageError) {
        console.warn('Signature DG illisible pour le PDF:', imageError.message);
      }
    }

    doc.font('Helvetica-Bold').fontSize(11).text(signatureName.toUpperCase(), signatureX, signatureY, {
      width: 145,
      align: 'center'
    });
    doc.moveTo(signatureX + 14, signatureY + 14).lineTo(signatureX + 131, signatureY + 14).lineWidth(0.8).stroke();
    doc.fontSize(10).text('Directeur Général', signatureX, signatureY + 18, {
      width: 145,
      align: 'center'
    });

    // Pied de page
    doc.font('Helvetica').fontSize(7).fillColor('#666666').text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
      pageLeft,
      780,
      { width: contentWidth, align: 'center' }
    );

    // 6️⃣ Envoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Ordre_${demande.reference || demande.id}.pdf"`);
    
    doc.pipe(res);
    doc.end();

  } catch (error) {
    console.error("❌ Erreur downloadOrdreAsPDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: "Erreur lors de la génération du PDF", 
        error: error.message 
      });
    }
  }
};

 