#!/usr/bin/env node

/**
 * 🧪 Script de test des endpoints de validation
 * Teste les appels API pour le workflow de validation
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000/api';
const ID_VALIDATEUR = 2; // utilisateur ID 2 (bo bi)
const ID_DEMANDE = 4;   // demande ID 4 (si existe)

// ══════════════════════════════════════════════════════════════════════════
// 🛠️ UTILITAIRE: Faire une requête HTTP
// ══════════════════════════════════════════════════════════════════════════

function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(path, BASE_URL);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════
// 🧪 TESTS
// ══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     🧪 Test des Endpoints de Validation Workflow          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // TEST 1: Demandes en attente
    console.log('1️⃣ Test: GET /validation/en-attente/:id_utilisateur');
    console.log(`   URL: /validation/en-attente/${ID_VALIDATEUR}\n`);

    const res1 = await httpRequest('GET', `/validation/en-attente/${ID_VALIDATEUR}`);
    console.log(`   Status: ${res1.status}`);
    console.log(`   Nombre de demandes: ${Array.isArray(res1.data) ? res1.data.length : 0}`);
    if (Array.isArray(res1.data) && res1.data.length > 0) {
      console.log(`   ✅ Demandes trouvées:`);
      res1.data.forEach(d => {
        console.log(`      - ${d.reference || 'N/A'}: ${d.motif} (${d.destination})`);
      });
    } else {
      console.log(`   ⚠️ Aucune demande trouvée (normal si pas de demande en attente)`);
    }
    console.log('');

    // TEST 2: Historique de validation
    console.log('2️⃣ Test: GET /validation/historique/:id_utilisateur');
    console.log(`   URL: /validation/historique/${ID_VALIDATEUR}\n`);

    const res2 = await httpRequest('GET', `/validation/historique/${ID_VALIDATEUR}`);
    console.log(`   Status: ${res2.status}`);
    console.log(`   Nombre d'entrées: ${Array.isArray(res2.data) ? res2.data.length : 0}`);
    console.log('');

    // TEST 3: Détail d'une demande
    if (ID_DEMANDE) {
      console.log('3️⃣ Test: GET /validation/detail/:id_demande');
      console.log(`   URL: /validation/detail/${ID_DEMANDE}\n`);

      const res3 = await httpRequest('GET', `/validation/detail/${ID_DEMANDE}`);
      console.log(`   Status: ${res3.status}`);
      if (res3.status === 200) {
        console.log(`   ✅ Demande chargée:`);
        console.log(`      - Référence: ${res3.data.reference || 'N/A'}`);
        console.log(`      - Motif: ${res3.data.motif}`);
        console.log(`      - Destination: ${res3.data.destination}`);
        console.log(`      - Missionnaires: ${(res3.data.missionnaires || []).length}`);
      } else {
        console.log(`   ⚠️ Erreur: ${res3.status}`);
      }
      console.log('');
    }

    // TEST 4: Test validation (simulation)
    console.log('4️⃣ Test: POST /validation/valider (simulation)');
    console.log(`   Données: id_demande=${ID_DEMANDE}, id_utilisateur=${ID_VALIDATEUR}\n`);

    if (ID_DEMANDE) {
      const validerPayload = {
        id_demande: ID_DEMANDE,
        id_etape: 67, // Première étape du workflow siège
        id_utilisateur: ID_VALIDATEUR,
        commentaire: 'Test validation',
        signature: 1
      };

      const res4 = await httpRequest('POST', '/validation/valider', validerPayload);
      console.log(`   Status: ${res4.status}`);
      if (res4.status === 200) {
        console.log(`   ✅ Validation réussie`);
        console.log(`   Réponse: ${JSON.stringify(res4.data)}`);
      } else {
        console.log(`   ⚠️ Erreur: ${JSON.stringify(res4.data)}`);
      }
    }
    console.log('');

    // RÉSUMÉ
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ Tests terminés                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📌 Notes:');
    console.log('   - Si "Aucune demande trouvée", créez d\'abord une demande');
    console.log('   - L\'ID de validateur doit correspondre à un utilisateur');
    console.log('   - Les ID d\'étape doivent correspondre au workflow');
    console.log('');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
    process.exit(1);
  }
}

// Lancer les tests
runTests().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
