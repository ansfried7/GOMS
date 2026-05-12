const db = require('../config/db');
const PDFDocument = require('pdfkit');

const safeNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => {
  const amount = Math.round(safeNumber(value));
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

// ==================== FONCTIONS UTILITAIRES ====================

/**
 * Convertit un nombre en lettres (Français) - Version simplifiée pour montants CFA
 */
const numberToFrenchWords = (n) => {
  if (n === 0) return "zéro";

  const units = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
  const teens = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const tens = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante-dix", "quatre-vingt", "quatre-vingt-dix"];

  const convertGroup = (num) => {
    let res = "";
    const h = Math.floor(num / 100);
    const t = num % 100;
    const d = Math.floor(t / 10);
    const u = t % 10;

    if (h > 0) {
      res += (h > 1 ? units[h] + " " : "") + "cent" + (h > 1 && t === 0 ? "s" : "") + " ";
    }

    if (t >= 10 && t < 20) {
      res += teens[t - 10];
    } else {
      if (d > 0) {
        if (d === 7 || d === 9) {
          res += tens[d - 1] + "-" + teens[u];
        } else {
          res += tens[d] + (u === 1 && d !== 8 ? "-et-un" : (u > 0 ? "-" + units[u] : ""));
        }
      } else if (u > 0) {
        res += units[u];
      }
    }
    return res.trim();
  };

  let result = "";
  const billion = Math.floor(n / 1000000000);
  const million = Math.floor((n % 1000000000) / 1000000);
  const thousand = Math.floor((n % 1000000) / 1000);
  const remainder = n % 1000;

  if (billion > 0) result += convertGroup(billion) + " milliard" + (billion > 1 ? "s" : "") + " ";
  if (million > 0) result += convertGroup(million) + " million" + (million > 1 ? "s" : "") + " ";
  if (thousand > 0) result += (thousand === 1 ? "" : convertGroup(thousand) + " ") + "mille ";
  if (remainder > 0) result += convertGroup(remainder);

  // Capitalize first letter
  const finalStr = result.trim();
  return finalStr.charAt(0).toUpperCase() + finalStr.slice(1);
};

/**
 * Formate la date en format long (ex: Lundi 16 Mars 2026)
 */
const formatLongDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

// ==================== CONTRÔLEUR PRINCIPAL ====================

exports.downloadFraisMissionnaireAsPDF = async (req, res) => {
  try {
    const { id_missionnaire } = req.params;

    if (!id_missionnaire) {
      return res.status(400).json({ message: 'ID missionnaire manquant' });
    }

    // 1️⃣ Récupérer les données complètes
    const [rows] = await db.execute(
      `SELECT m.*, d.id as id_mission, d.reference, d.motif, d.destination, d.portee, d.dateDepart, d.dateRetour, d.statut
       FROM missionnaires m
       JOIN demandemissions d ON m.id_mission = d.id
       WHERE m.id_missionnaire = ?`,
      [id_missionnaire]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Missionnaire non trouvé' });
    }

    const m = rows[0];
    const id_mission = m.id_mission;

    // 2️⃣ Calculer les durées et taux
    const startDate = new Date(m.dateDepart);
    const endDate = new Date(m.dateRetour);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    
    const nuits = Math.max(0, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)));
    const jours = nuits + 1;

    const hebergementTotal = safeNumber(m.frais_hebergement);
    const restaurationTotal = safeNumber(m.frais_restauration);
    const grandTotal = hebergementTotal + restaurationTotal;

    const rateH = nuits > 0 ? Math.round(hebergementTotal / nuits) : 0;
    const rateR = jours > 0 ? Math.round(restaurationTotal / jours) : 0;

    // 3️⃣ Récupérer les signatures (DAF et DG)
    // DAF (Etape 5 ou libellé contenant DAF)
    const [dafSigs] = await db.execute(
      `SELECT v.signature_numerique, u.nom, u.prenom
       FROM validations v
       JOIN etapes_workflow ew ON v.id_etape = ew.id_etape
       LEFT JOIN utilisateurs u ON v.id_utilisateur = u.id_utilisateur
       WHERE v.id_demande = ? AND (ew.libelle_etape LIKE '%DAF%' OR ew.id_sous_role_requis = 5)
       ORDER BY v.date_validation DESC LIMIT 1`,
      [id_mission]
    );

    // DG (Etape 12 ou libellé contenant Directeur G)
    const [dgSigs] = await db.execute(
      `SELECT v.signature_numerique, u.nom, u.prenom
       FROM validations v
       JOIN etapes_workflow ew ON v.id_etape = ew.id_etape
       LEFT JOIN utilisateurs u ON v.id_utilisateur = u.id_utilisateur
       WHERE v.id_demande = ? AND (ew.libelle_etape LIKE '%Directeur G%' OR ew.id_sous_role_requis = 12)
       ORDER BY v.date_validation DESC LIMIT 1`,
      [id_mission]
    );

    const daf = dafSigs[0] || null;
    const dg = dgSigs[0] || null;

    // 4️⃣ Génération du PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const pageLeft = 50;
    const pageRight = 545;
    const contentWidth = pageRight - pageLeft;

    // -- En-tête (Style SODECO) --
    doc.font('Helvetica-Bold').fontSize(18).text('SODECO', { align: 'center' });
    doc.font('Helvetica').fontSize(11).text('SOCIETE POUR LE DEVELOPPEMENT DU COTON', { align: 'center' });
    doc.fontSize(8)
      .text("Société Anonyme avec Conseil d'Administration au capital de FCFA 100 milliards", { align: 'center' })
      .text('Siège social : Immeuble FAGACE (bât. B) boulevard de la Cen-Sad Cotonou (Benin) 01 BP 8059', { align: 'center' })
      .text('Tél. 21.30.95.11/ 21.30.95.39   Fax. 21.30.94.46', { align: 'center' });
    
    doc.moveDown(0.2);
    doc.moveTo(pageLeft, doc.y).lineTo(pageRight, doc.y).lineWidth(0.5).strokeColor('#333').stroke();
    doc.moveDown(1);

    // -- Date et Lieu --
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fontSize(10).font('Helvetica').text(`Cotonou, le ${today}`, { align: 'right' });
    doc.moveDown(1.5);

    // -- Titre Encadré --
    const titleY = doc.y;
    doc.rect(pageLeft + 40, titleY, contentWidth - 80, 25).lineWidth(1).strokeColor('#000').stroke();
    doc.font('Helvetica-Bold').fontSize(12).text('ETAT DES FRAIS DE MISSION', pageLeft, titleY + 7, { align: 'center' });
    doc.y = titleY + 45;

    // -- Références --
    doc.fontSize(10).font('Helvetica');
    doc.text(`Réf. :             ${m.reference || 'N/A'}/2026/DG/DCL/DCLA/DAF/DRH/CSMG/CSAPR/A-DRH`);
    doc.text(`Réf : Ordre de Mission N° :      ${m.reference || 'N/A'}/2026/DG/DCL/DCLA/DAF/DRH/CSMG/CSAPR/A-DRH`);
    doc.moveDown(1.5);

    // -- Point Récapitulatif --
    const fullName = `${m.nom || ''} ${m.prenom || ''}`.trim();
    doc.font('Helvetica-Bold').fontSize(11).text(`Point Récapitulatif des frais de mission de ${fullName}`, { underline: true });
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').text(`Date de Départ : ${formatLongDate(m.dateDepart)}`);
    doc.text(`Date de Retour : ${formatLongDate(m.dateRetour)}`);
    doc.moveDown(1);

    // -- Tableau des Frais --
    const tableTop = doc.y;
    const colWidths = [150, 130, 130, 85];
    const colXs = [pageLeft, pageLeft + 150, pageLeft + 280, pageLeft + 410];
    const rowHeight = 45;

    // Entête Tableau
    doc.lineWidth(0.5).strokeColor('#000');
    doc.rect(pageLeft, tableTop, contentWidth, rowHeight).stroke();
    doc.fontSize(9).font('Helvetica-Bold');
    
    doc.text('Nom et Prénoms', colXs[0], tableTop + 10, { width: colWidths[0], align: 'center' });
    doc.text('Frais de restauration', colXs[1], tableTop + 10, { width: colWidths[1], align: 'center' });
    doc.text("Frais d'hébergement", colXs[2], tableTop + 10, { width: colWidths[2], align: 'center' });
    doc.text('Montant', colXs[3], tableTop + 10, { width: colWidths[3], align: 'center' });

    // Lignes verticales entête
    [1, 2, 3].forEach(i => doc.moveTo(colXs[i], tableTop).lineTo(colXs[i], tableTop + rowHeight).stroke());

    // Corps Tableau
    const bodyY = tableTop + rowHeight;
    doc.rect(pageLeft, bodyY, contentWidth, rowHeight).stroke();
    doc.font('Helvetica');
    
    // Nom
    doc.text(fullName, colXs[0], bodyY + 15, { width: colWidths[0], align: 'center' });
    
    // Restauration
    const restStr = `${formatMoney(rateR)} FCFA x ${jours.toString().padStart(2, '0')}j\n= ${formatMoney(restaurationTotal)} F CFA`;
    doc.text(restStr, colXs[1], bodyY + 12, { width: colWidths[1], align: 'center' });
    
    // Hébergement
    const hebStr = `${formatMoney(rateH)} FCFA x ${nuits.toString().padStart(2, '0')}j\n= ${formatMoney(hebergementTotal)} F CFA`;
    doc.text(hebStr, colXs[2], bodyY + 12, { width: colWidths[2], align: 'center' });
    
    // Montant Total
    doc.font('Helvetica-Bold').text(`${formatMoney(grandTotal)} FCFA`, colXs[3], bodyY + 18, { width: colWidths[3], align: 'center' });

    // Lignes verticales corps
    [1, 2, 3].forEach(i => doc.moveTo(colXs[i], bodyY).lineTo(colXs[i], bodyY + rowHeight).stroke());

    doc.y = bodyY + rowHeight + 15;

    // -- Montant en Lettres --
    const words = numberToFrenchWords(grandTotal);
    const boxY = doc.y;
    doc.rect(pageLeft, boxY, contentWidth, 20).stroke();
    doc.font('Helvetica-Bold').fontSize(10).text(`Arrêté le présent état à la somme de ${words} F CFA`, pageLeft + 5, boxY + 5);
    
    doc.moveDown(2);

    // -- N.B. --
    doc.font('Helvetica-Bold').fontSize(9).text('N.B :', { underline: true });
    doc.font('Helvetica').fontSize(8);
    doc.text('1- Les frais d\'hébergement seront désormais payés directement par le Service Financier et les factures seront transmises au retour par le concerné aux RH pour prise en compte.');
    doc.text('2- Seuls les frais de restauration seront payés avant tout départ en mission.');
    
    doc.moveDown(3);

    // -- Signatures --
    const sigY = doc.y;
    const sigWidth = 200;

    // DAF (Gauche)
    doc.font('Helvetica-Bold').fontSize(10);
    const dafName = daf ? `${daf.prenom} ${daf.nom}`.toUpperCase() : 'CARMÉLO HOUNSOUNOU';
    doc.text(dafName, pageLeft, sigY, { width: sigWidth, align: 'center', underline: true });
    doc.text('DAF', pageLeft, sigY + 12, { width: sigWidth, align: 'center' });
    
    if (daf && daf.signature_numerique && daf.signature_numerique.startsWith('data:image')) {
      try {
        const buf = Buffer.from(daf.signature_numerique.split(',')[1], 'base64');
        doc.image(buf, pageLeft + 50, sigY + 25, { width: 100, height: 40 });
      } catch (e) { console.warn('Signature DAF err:', e.message); }
    }

    // DG (Droite)
    const dgX = pageRight - sigWidth;
    const dgName = dg ? `${dg.prenom} ${dg.nom}`.toUpperCase() : 'SERGE E. ADEROMOU';
    doc.text(dgName, dgX, sigY, { width: sigWidth, align: 'center', underline: true });
    doc.text('Directeur Général', dgX, sigY + 12, { width: sigWidth, align: 'center' });

    if (dg && dg.signature_numerique && dg.signature_numerique.startsWith('data:image')) {
      try {
        const buf = Buffer.from(dg.signature_numerique.split(',')[1], 'base64');
        doc.image(buf, dgX + 50, sigY + 25, { width: 100, height: 40 });
      } catch (e) { console.warn('Signature DG err:', e.message); }
    }

    // -- Flux de sortie --
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Frais_${m.nom || 'missionnaire'}_${m.prenom || ''}.pdf"`);

    doc.pipe(res);
    doc.end();

  } catch (error) {
    console.error('❌ Erreur downloadFraisMissionnaireAsPDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Erreur lors de la génération du PDF', error: error.message });
    }
  }
};

