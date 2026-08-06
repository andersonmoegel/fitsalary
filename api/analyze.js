// Serverless function: recebe vaga + currículo, chama o Gemini e devolve o JSON da análise.
// A chave nunca chega ao navegador — fica em process.env.GEMINI_API_KEY.

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function buildPrompt(job, cvText, cvName) {
  return `Você é um especialista sênior em recrutamento tech/administrativo e benchmark salarial (Glassdoor, Levels.fyi, pesquisas Robert Half/Catho). Data de referência: ${new Date().toLocaleDateString('pt-BR')}.

Analise a VAGA e o CURRÍCULO abaixo e responda EXCLUSIVAMENTE com um JSON válido (sem markdown, sem crases, sem texto fora do JSON) neste formato exato:

{
 "cargo": "título do cargo da vaga",
 "empresa": "nome da empresa ou null",
 "senioridade_detectada": "Júnior|Pleno|Sênior|Especialista|Liderança",
 "match_score": 0,
 "veredicto": "2-3 frases objetivas resumindo o fit do candidato",
 "pontos_fortes": [{"titulo":"...","detalhe":"..."}],
 "lacunas": [{"titulo":"...","detalhe":"...","criticidade":"alta|media|baixa"}],
 "keywords_presentes": ["skills da vaga que o CV cobre"],
 "keywords_ausentes": ["skills da vaga ausentes no CV"],
 "salario": {
   "brl": {"min": 0, "ideal": 0, "max": 0},
   "usd": {"min": 0, "ideal": 0, "max": 0},
   "justificativa": "Explique a faixa: mercado do cargo, porte/reputação da empresa (padrão Glassdoor para essa empresa se conhecida), senioridade e anos de experiência do candidato, localização/remoto. 3-5 frases."
 },
 "dicas_negociacao": ["3 a 4 dicas práticas de negociação salarial para ESTE caso"],
 "melhorias_curriculo": ["3 a 5 ajustes concretos no CV para aumentar o match com ESTA vaga"]
}

Regras: "pontos_fortes" com 3 a 5 itens; "lacunas" com 2 a 5 itens; "match_score" inteiro de 0 a 100.
Regras de salário: valores MENSAIS e numéricos (sem pontuação nem símbolo). Para BRL use o mercado brasileiro (CLT); para USD use referência de mercado internacional/remoto para o mesmo perfil. Se a empresa for conhecida, calibre pela banda salarial típica dela (estilo Glassdoor por cargo). O "ideal" deve refletir o percentil ~65-75 considerando a experiência real do candidato.

=== VAGA ===
${job.slice(0, 12000)}

=== CURRÍCULO (${cvName || 'curriculo'}) ===
${cvText.slice(0, 12000)}`;
}

async function callGemini(key, prompt) {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json' }
  });

// A GEMINI_API_KEY é sempre uma chave de API do AI Studio — envia sempre via query string.
    const url = `${base}?key=${encodeURIComponent(key)}`;
    const headers = { 'Content-Type': 'application/json' };

  const r = await fetch(url, { method: 'POST', headers, body });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
}

// Diagnostico: GET /api/analyze?health=1
// Informa se a chave esta configurada e se o Gemini a aceita.
// Nunca devolve o valor da chave — apenas o prefixo e o tamanho.
async function health(res) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(200).json({
      configurada: false,
      diagnostico: 'A variavel GEMINI_API_KEY nao existe neste deploy. Crie em Settings > Environment Variables (ambiente Production) e refaca o deploy.'
    });
  }

  const formato = /^AIza/.test(key)
    ? 'API key do AI Studio'
    : /^(ya29|AQ)/.test(key)
      ? 'token OAuth (expira em poucas horas — prefira uma chave AIza)'
      : 'formato nao reconhecido';

  const info = {
    configurada: true,
    formato,
    prefixo: key.slice(0, 6) + '...',
    tamanho: key.length,
    modelo: MODEL
  };

  try {
    await callGemini(key, 'Responda apenas: ok');
    return res.status(200).json({ ...info, chaveValida: true, diagnostico: 'Chave aceita pelo Gemini. Tudo pronto.' });
  } catch (e) {
    return res.status(200).json({
      ...info,
      chaveValida: false,
      diagnostico: `O Gemini rejeitou a chave: ${e.message}`
    });
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health) {
    return health(res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'Chave do Gemini nao configurada. Adicione a variavel GEMINI_API_KEY em Settings > Environment Variables no projeto da Vercel e refaca o deploy.'
    });
  }

  try {
    const { job, cvText, cvName } = req.body || {};
    if (!job || job.length < 80) return res.status(400).json({ error: 'Descricao da vaga muito curta.' });
    if (!cvText || cvText.length < 100) return res.status(400).json({ error: 'Curriculo nao reconhecido.' });

    const raw = await callGemini(key, buildPrompt(job, cvText, cvName));
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return res.status(502).json({ error: 'A IA respondeu em formato inesperado.' });

    let parsed;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return res.status(502).json({ error: 'Nao consegui interpretar a resposta da IA. Tente novamente.' });
    }
    return res.status(200).json(parsed);
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? 401 : 502;
    const hint = status === 401
      ? 'A chave do Gemini foi rejeitada ou expirou. Gere uma chave em aistudio.google.com/apikey e atualize a variavel GEMINI_API_KEY na Vercel.'
      : e.message;
    return res.status(status).json({ error: hint });
  }
}
