#!/usr/bin/env node
// Temporary script: Generate ementas for all acervo documents without one.
// Uses Firestore REST API. No LLM tokens consumed.

const API_KEY = 'AIzaSyDFV2iOMhhg3EAwQ6J72Zpx2kfe4WyDLLw';
const PROJECT_ID = 'hocapp-44760';
const EMAIL = 'fsalamoni@gmail.com';
const PASSWORD = 'F@erun2164';
const BATCH_SIZE = 10;

// ── Topic → Legal Areas mapping ──────────────────────────────────────────────

const TOPIC_AREAS = {
  'NEPOTISMO': ['Direito Administrativo', 'Direito Constitucional'],
  'NEPOTISMO LICITATÓRIO': ['Direito Administrativo', 'Licitações e Contratos'],
  'IMPROBIDADE': ['Direito Administrativo', 'Improbidade Administrativa'],
  'LICITAÇÃO': ['Direito Administrativo', 'Licitações e Contratos'],
  'INEXIGIBILIDADE': ['Direito Administrativo', 'Licitações e Contratos'],
  'DISPENSA': ['Direito Administrativo', 'Licitações e Contratos'],
  'CREDENCIAMENTO': ['Direito Administrativo', 'Licitações e Contratos'],
  'SERVIDOR': ['Direito Administrativo', 'Servidor Público'],
  'TEMPORÁRIOS': ['Direito Administrativo', 'Servidor Público'],
  'CONTRATAÇÃO TEMPORÁRIA': ['Direito Administrativo', 'Servidor Público'],
  'CONCURSO': ['Direito Administrativo', 'Concurso Público'],
  'TRIBUTÁRIO': ['Direito Tributário'],
  'IPTU': ['Direito Tributário'],
  'REGISTRO': ['Direito Civil', 'Registros Públicos'],
  'FAMÍLIA': ['Direito de Família'],
  'SUCESSÕES': ['Direito das Sucessões'],
  'SOCIOAFETIVIDADE': ['Direito de Família'],
  'CURATELA': ['Direito Civil', 'Direito de Família'],
  'DOAÇÃO': ['Direito Civil'],
  'INVENTÁRIO': ['Direito Civil', 'Direito das Sucessões'],
  'INVENTÁRIO EXTRAJUDICIAL': ['Direito Civil', 'Direito das Sucessões'],
  'INTERVENÇÃO': ['Direito Processual Civil'],
  'ANPC': ['Direito Processual Civil', 'Acordo de Não Persecução Cível'],
  'CONSTITUCIONALIDADE': ['Direito Constitucional'],
  'INCONSTITUCIONALIDADE': ['Direito Constitucional'],
  'CONSTITUCIONALIDADE DE LEI': ['Direito Constitucional'],
  'BENS PÚBLICOS': ['Direito Administrativo'],
  'CONTRATO DE GESTÃO': ['Direito Administrativo', 'Contratos Administrativos'],
  'FÉRIAS': ['Direito Administrativo', 'Servidor Público'],
  'FÉRIAS DE AGENTE POLÍTICO': ['Direito Administrativo', 'Agente Político'],
  'VEREADOR': ['Direito Administrativo', 'Direito Municipal'],
  'PREFEITO': ['Direito Administrativo', 'Direito Municipal'],
  'ALVARÁ': ['Direito Administrativo'],
  'PROCESSO CIVIL': ['Direito Processual Civil'],
  'PROCESSO': ['Direito Processual Civil'],
  'DILIGÊNCIA': ['Direito Processual Penal'],
  'ANTICORRUPÇÃO': ['Direito Administrativo', 'Anticorrupção'],
  'PROMOÇÃO PESSOAL': ['Direito Administrativo', 'Publicidade'],
  'COMPETÊNCIA': ['Direito Processual'],
  'ACP': ['Direito Processual Civil', 'Ação Civil Pública'],
  'DEVOLUÇÃO': ['Procedimento Administrativo'],
  'SERVIÇOS': ['Direito Administrativo', 'Contratos Administrativos'],
  'ATRIBUIÇÕES': ['Direito Administrativo'],
  'ACUMULAÇÃO': ['Direito Administrativo', 'Servidor Público'],
  'ESTAGIÁRIO': ['Direito Administrativo'],
  'AUTONOMIA MUNICIPAL': ['Direito Constitucional', 'Direito Municipal'],
  'PARCERIA': ['Direito Administrativo'],
  'PATROCÍNIO': ['Direito Administrativo'],
  'REQUISIÇÃO': ['Direito Processual'],
  'REQUISIÇÃO DO MP': ['Direito Processual'],
  'ATUALIZAÇÃO MONETÁRIA': ['Direito Processual Civil'],
  'TEMA': ['Direito Constitucional'],
  'STF': ['Direito Constitucional'],
  'MODELOS': ['Modelos e Minutas'],
  'PROCURADORIA MUNICIPAL': ['Direito Administrativo', 'Direito Municipal'],
  'FREE FLOW': ['Direito Administrativo', 'Contratos Administrativos'],
  'VEÍCULO ABANDONADO': ['Direito Administrativo'],
  'PUBLICIDADE': ['Direito Administrativo'],
  'AGENTE PÚBLICO': ['Direito Administrativo'],
  'PRESCRIÇÃO': ['Direito Civil', 'Direito Processual'],
  'TEMA 897': ['Direito Constitucional', 'Improbidade Administrativa'],
  'TEMA 1192': ['Direito Constitucional'],
};

const STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'e', 'ou', 'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'por', 'para', 'com', 'sem', 'sob', 'sobre', 'entre', 'até',
  'ao', 'aos', 'à', 'às', 'pelo', 'pela', 'pelos', 'pelas',
  'que', 'se', 'não', 'mais', 'como', 'mas', 'qual', 'quando',
]);

// ── Firebase Auth ────────────────────────────────────────────────────────────

async function signIn() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { idToken: data.idToken, uid: data.localId };
}

// ── Firestore REST helpers ───────────────────────────────────────────────────

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function listAllDocs(idToken, uid) {
  const docs = [];
  let pageToken = '';
  const fieldMask = ['filename', 'ementa', 'ementa_keywords', 'status', 'created_at'].map(f => `mask.fieldPaths=${f}`).join('&');
  while (true) {
    const url = `${BASE}/users/${uid}/acervo?pageSize=300&${fieldMask}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    if (data.documents) {
      for (const d of data.documents) {
        const name = d.name; // full path
        const docId = name.split('/').pop();
        const fields = d.fields || {};
        docs.push({
          id: docId,
          filename: fields.filename?.stringValue || '',
          ementa: fields.ementa?.stringValue || '',
          status: fields.status?.stringValue || '',
          created_at: fields.created_at?.stringValue || '',
          ementa_keywords: (fields.ementa_keywords?.arrayValue?.values || []).map(v => v.stringValue),
        });
      }
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return docs;
}

async function readDocText(idToken, uid, docId) {
  const url = `${BASE}/users/${uid}/acervo/${docId}?mask.fieldPaths=text_content&mask.fieldPaths=filename`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return '';
  const data = await res.json();
  return data.fields?.text_content?.stringValue || '';
}

async function writeEmenta(idToken, uid, docId, ementa, keywords) {
  const url = `${BASE}/users/${uid}/acervo/${docId}?updateMask.fieldPaths=ementa&updateMask.fieldPaths=ementa_keywords`;
  const body = {
    fields: {
      ementa: { stringValue: ementa },
      ementa_keywords: {
        arrayValue: {
          values: keywords.map(k => ({ stringValue: k })),
        },
      },
    },
  };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Write failed for ${docId}: ${res.status} ${errText}`);
  }
}

// ── Ementa generation (rule-based, no LLM) ──────────────────────────────────

function parseFilename(filename) {
  // Pattern: YYYYMMDD - TOPIC. Subtopic1. Subtopic2. Location.docx
  const clean = filename.replace(/\.docx?$/i, '').trim();
  const dashIdx = clean.indexOf(' - ');
  if (dashIdx < 0) return { date: '', topic: clean, subtopics: [], location: '' };

  const datePart = clean.slice(0, dashIdx).trim();
  const rest = clean.slice(dashIdx + 3).trim();

  // Handle underscore-separated filenames (e.g., ACP_Tres_Arroios_...)
  if (rest.includes('_') && !rest.includes('.')) {
    const parts = rest.split('_').filter(Boolean);
    return { date: datePart, topic: parts[0] || '', subtopics: parts.slice(1), location: '' };
  }

  // Split on ". " (dot + space) to get segments
  const segments = rest.split(/\.\s*/).filter(s => s.trim().length > 0);
  if (segments.length === 0) return { date: datePart, topic: rest, subtopics: [], location: '' };

  const topic = segments[0].trim();
  const location = segments.length > 1 ? segments[segments.length - 1].trim() : '';
  const subtopics = segments.slice(1, segments.length > 1 ? -1 : undefined).map(s => s.trim()).filter(Boolean);

  return { date: datePart, topic, subtopics, location };
}

function detectDocType(text) {
  const first500 = (text || '').slice(0, 500).toUpperCase();
  if (first500.includes('AÇÃO CIVIL PÚBLICA') || first500.includes('ACP')) return 'ACP';
  if (first500.includes('PETIÇÃO INICIAL')) return 'Petição Inicial';
  if (first500.includes('PETIÇÃO')) return 'Petição';
  if (first500.includes('RECURSO DE APELAÇÃO')) return 'Recurso de Apelação';
  if (first500.includes('RECURSO')) return 'Recurso';
  if (first500.includes('SENTENÇA')) return 'Sentença';
  if (first500.includes('MANIFESTAÇÃO')) return 'Manifestação';
  if (first500.includes('PROMOÇÃO DE ARQUIVAMENTO')) return 'Promoção de Arquivamento';
  if (first500.includes('PROMOÇÃO')) return 'Promoção';
  if (first500.includes('INFORMAÇÃO TÉCNICA')) return 'Informação Técnica';
  if (first500.includes('NOTA TÉCNICA')) return 'Nota Técnica';
  if (first500.includes('PARECER')) return 'Parecer';
  if (first500.includes('DESPACHO')) return 'Despacho';
  if (first500.includes('OFÍCIO')) return 'Ofício';
  return 'Parecer'; // default for this user's work
}

function extractConclusion(text) {
  if (!text) return '';
  const upper = text.toUpperCase();

  // Look for conclusion section
  const patterns = [
    /(?:CONCLUS[ÃA]O\s*(?:E\s*ENCAMINHAMENTO)?|(?:IV|III|V|VI)\s*[-–.]\s*CONCLUS[ÃA]O)[:\s]*\n?([\s\S]{20,500}?)(?:\n\n|\n[A-Z]{3,}|\n\d+[.)]\s|$)/i,
    /(?:ANTE|DIANTE|PELO|FACE)\s+(?:O|AO)\s+EXPOSTO[,\s]*([\s\S]{20,400}?)(?:\.\s*\n|\n\n|$)/i,
    /EX\s+POSITIS[,\s]*([\s\S]{20,400}?)(?:\.\s*\n|\n\n|$)/i,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      let conclusion = match[1].trim();
      // Clean up and truncate
      conclusion = conclusion.replace(/\s+/g, ' ').slice(0, 300);
      if (conclusion.length > 10) return conclusion;
    }
  }
  return '';
}

function findAreas(topic, subtopics, text) {
  const areas = new Set();

  // Match topic against known areas
  const topicUpper = topic.toUpperCase();
  for (const [key, vals] of Object.entries(TOPIC_AREAS)) {
    if (topicUpper.includes(key) || key.includes(topicUpper)) {
      vals.forEach(a => areas.add(a));
    }
  }

  // Also check subtopics
  for (const sub of subtopics) {
    const subUpper = sub.toUpperCase();
    for (const [key, vals] of Object.entries(TOPIC_AREAS)) {
      if (subUpper.includes(key) || key.includes(subUpper)) {
        vals.forEach(a => areas.add(a));
      }
    }
  }

  // Text-based detection for common legal areas
  if (text) {
    const textUpper = text.slice(0, 5000).toUpperCase();
    if (textUpper.includes('SÚMULA VINCULANTE 13')) areas.add('Direito Constitucional');
    if (textUpper.includes('LEI 8.429') || textUpper.includes('IMPROBIDADE')) areas.add('Improbidade Administrativa');
    if (textUpper.includes('LEI 14.133') || textUpper.includes('LEI 8.666')) areas.add('Licitações e Contratos');
    if (textUpper.includes('CÓDIGO CIVIL') || textUpper.includes('ART. 1.')) areas.add('Direito Civil');
    if (textUpper.includes('CONSTITUIÇÃO FEDERAL') || textUpper.includes('ART. 37')) areas.add('Direito Constitucional');
  }

  if (areas.size === 0) areas.add('Direito Administrativo'); // fallback
  return [...areas];
}

function generateSynopsis(topic, subtopics, location) {
  const parts = [topic, ...subtopics].filter(Boolean);
  const desc = parts.join(', ').toLowerCase();
  const loc = location ? ` no município de ${location}` : '';

  const topicUpper = topic.toUpperCase();
  if (topicUpper.includes('NEPOTISMO')) return `Análise de situação de nepotismo envolvendo ${subtopics.join(', ').toLowerCase() || 'agentes públicos'}${loc}`;
  if (topicUpper.includes('IMPROBIDADE')) return `Análise de atos de improbidade administrativa — ${subtopics.join(', ') || 'enquadramento de conduta'}${loc}`;
  if (topicUpper.includes('LICITAÇÃO')) return `Análise de procedimento licitatório — ${subtopics.join(', ') || 'regularidade'}${loc}`;
  if (topicUpper.includes('SERVIDOR') || topicUpper.includes('TEMPORÁRIOS')) return `Análise de questão relativa a servidor público — ${subtopics.join(', ') || 'regime funcional'}${loc}`;
  if (topicUpper.includes('CONCURSO')) return `Análise de questão relativa a concurso público — ${subtopics.join(', ') || 'regularidade'}${loc}`;
  if (topicUpper.includes('REGISTRO')) return `Análise de questão registral — ${subtopics.join(', ') || 'procedimento'}${loc}`;
  if (topicUpper.includes('TRIBUTÁRIO') || topicUpper.includes('IPTU')) return `Análise de questão tributária — ${subtopics.join(', ') || 'legalidade'}${loc}`;
  if (topicUpper.includes('SOCIOAFETIVIDADE')) return `Análise de reconhecimento de filiação socioafetiva — ${subtopics.join(', ') || 'procedimento'}${loc}`;
  if (topicUpper.includes('FAMÍLIA') || topicUpper.includes('SUCESSÕES')) return `Análise de questão de direito de família/sucessões — ${subtopics.join(', ')}${loc}`;
  if (topicUpper.includes('INTERVENÇÃO')) return `Análise de intervenção — ${subtopics.join(', ') || 'manifestação'}${loc}`;
  if (topicUpper.includes('ANPC')) return `Análise de Acordo de Não Persecução Cível — ${subtopics.join(', ') || 'condições'}${loc}`;
  if (topicUpper.includes('DEVOLUÇÃO')) return `Análise de devolução de procedimento — ${subtopics.join(', ') || 'encaminhamento'}${loc}`;
  if (topicUpper.includes('VEREADOR')) return `Análise de questão envolvendo vereador — ${subtopics.join(', ')}${loc}`;
  if (topicUpper.includes('PREFEITO')) return `Análise de questão envolvendo prefeito — ${subtopics.join(', ')}${loc}`;
  if (topicUpper.includes('ACP')) return `Ação Civil Pública — ${subtopics.join(', ')}${loc}`;
  if (topicUpper.includes('BENS PÚBLICOS')) return `Análise sobre bens públicos — ${subtopics.join(', ')}${loc}`;
  if (topicUpper.includes('CONSTITUCIONALIDADE') || topicUpper.includes('INCONSTITUCIONALIDADE'))
    return `Análise de constitucionalidade — ${subtopics.join(', ') || 'remessa à SUBJUR'}${loc}`;
  if (topicUpper.includes('ALVARÁ')) return `Análise de alvará — ${subtopics.join(', ')}${loc}`;
  if (topicUpper.includes('PROCESSO')) return `Análise processual — ${subtopics.join(', ')}${loc}`;
  if (topicUpper.includes('STF') || topicUpper.includes('TEMA')) return `Análise de tema do STF — ${subtopics.join(', ')}${loc}`;

  return `Análise jurídica sobre ${desc}${loc}`;
}

function extractTopics(topic, subtopics, text) {
  const topics = new Set();
  topics.add(topic);
  subtopics.forEach(s => topics.add(s));

  // Extract prominent legal references from text
  if (text) {
    const textSlice = text.slice(0, 8000);
    const svMatch = textSlice.match(/Súmula Vinculante\s+(\d+)/gi);
    if (svMatch) svMatch.forEach(m => topics.add(m));
    const sMatch = textSlice.match(/Súmula\s+\d+\s+do\s+\w+/gi);
    if (sMatch) sMatch.forEach(m => topics.add(m));
    const temaMatch = textSlice.match(/Tema\s+\d+/gi);
    if (temaMatch) temaMatch.forEach(m => topics.add(m));
    const leiMatch = textSlice.match(/Lei\s+(?:n[°º.]?\s*)?[\d.]+\/\d{4}/gi);
    if (leiMatch) leiMatch.slice(0, 5).forEach(m => topics.add(m));
  }

  return [...topics].filter(t => t.length > 1).slice(0, 10);
}

function generateKeywords(parsed, areas, topics) {
  const kws = new Set();

  // From topic and subtopics
  const allParts = [parsed.topic, ...parsed.subtopics, parsed.location].filter(Boolean);
  for (const part of allParts) {
    const words = part.toLowerCase().replace(/[.,;:!?()"']/g, ' ').split(/\s+/);
    words.filter(w => w.length > 2 && !STOPWORDS.has(w)).forEach(w => kws.add(w));
    // Also add the full phrase
    if (part.length > 2) kws.add(part.toLowerCase());
  }

  // From areas
  areas.forEach(a => kws.add(a.toLowerCase()));

  // From topics
  topics.forEach(t => { if (t.length > 2) kws.add(t.toLowerCase()); });

  return [...kws].slice(0, 25);
}

function generateEmentaForDoc(filename, textContent) {
  const parsed = parseFilename(filename);
  const docType = detectDocType(textContent);
  const synopsis = generateSynopsis(parsed.topic, parsed.subtopics, parsed.location);
  const areas = findAreas(parsed.topic, parsed.subtopics, textContent);
  const topics = extractTopics(parsed.topic, parsed.subtopics, textContent);
  const conclusion = extractConclusion(textContent);

  const ementaParts = [
    `Tipo: ${docType}`,
    `Assunto: ${parsed.topic}`,
    `Síntese: ${synopsis}`,
    `Áreas: ${areas.join(', ')}`,
    `Tópicos: ${topics.join(', ')}`,
    `Conclusão: ${conclusion || 'N/A'}`,
  ];

  const keywords = generateKeywords(parsed, areas, topics);

  return { ementa: ementaParts.join(' | '), keywords };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Gerador de Ementas (sem LLM) ===\n');

  // 1. Auth
  console.log('Autenticando no Firebase...');
  const { idToken, uid } = await signIn();
  console.log(`Autenticado como ${EMAIL} (UID: ${uid})\n`);

  // 2. List all docs
  console.log('Listando documentos do acervo...');
  const allDocs = await listAllDocs(idToken, uid);
  console.log(`Total: ${allDocs.length} documentos no acervo`);

  const indexed = allDocs.filter(d => d.status === 'indexed');
  const withEmenta = indexed.filter(d => d.ementa);
  const withoutEmenta = indexed.filter(d => !d.ementa);
  console.log(`Indexados: ${indexed.length} | Com ementa: ${withEmenta.length} | Sem ementa: ${withoutEmenta.length}\n`);

  if (withoutEmenta.length === 0) {
    console.log('Todos os documentos já possuem ementa!');
    return;
  }

  // 3. Process in batches
  let done = 0;
  let errors = 0;

  for (let i = 0; i < withoutEmenta.length; i += BATCH_SIZE) {
    const batch = withoutEmenta.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (doc) => {
      try {
        // Read text content
        const textContent = await readDocText(idToken, uid, doc.id);

        // Generate ementa
        const { ementa, keywords } = generateEmentaForDoc(doc.filename, textContent);

        // Write back
        await writeEmenta(idToken, uid, doc.id, ementa, keywords);

        done++;
        const pct = Math.round((done / withoutEmenta.length) * 100);
        console.log(`[${done}/${withoutEmenta.length}] (${pct}%) ✓ ${doc.filename}`);
        console.log(`   Ementa: ${ementa.slice(0, 120)}...`);
      } catch (err) {
        errors++;
        done++;
        console.error(`[${done}/${withoutEmenta.length}] ✗ ${doc.filename}: ${err.message}`);
      }
    }));
  }

  console.log(`\n=== Concluído ===`);
  console.log(`Ementas geradas: ${done - errors}/${withoutEmenta.length}`);
  if (errors > 0) console.log(`Erros: ${errors}`);
  console.log(`Total com ementa agora: ${withEmenta.length + done - errors}/${indexed.length}`);
}

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
