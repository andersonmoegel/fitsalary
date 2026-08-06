// Serverless function: busca o conteúdo de uma URL (vaga ou perfil) e extrai o texto principal.
// Usada pela aba "Usar link" (vaga) e pela opção de link no lugar do arquivo de currículo.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function stripTags(html) {
return html
.replace(/<!--[\s\S]*?-->/g, ' ')
.replace(/<(script|style|nav|header|footer|iframe|svg|noscript|form|button)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
.replace(/<[^>]+>/g, '\n')
.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
.replace(/[ \t]+/g, ' ')
.replace(/\n[ \t]*/g, '\n')
.replace(/\n{2,}/g, '\n')
.trim();
}

function extractJsonLd(html) {
var blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
for (var i = 0; i < blocks.length; i++) {
var parsed;
try { parsed = JSON.parse(blocks[i][1].trim()); } catch (e) { continue; }
var items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
for (var j = 0; j < items.length; j++) {
var item = items[j] || {};
var t = item['@type'];
var types = Array.isArray(t) ? t : [t];
if (types.indexOf('JobPosting') !== -1) {
var parts = [];
if (item.title) parts.push('Cargo: ' + item.title);
if (item.hiringOrganization && item.hiringOrganization.name) parts.push('Empresa: ' + item.hiringOrganization.name);
if (item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressLocality) parts.push('Local: ' + item.jobLocation.address.addressLocality);
if (item.description) parts.push(stripTags(item.description));
var joined = parts.join('\n');
if (joined.length > 200) return joined;
}
if (types.indexOf('Person') !== -1) {
var pparts = [];
if (item.name) pparts.push('Nome: ' + item.name);
if (item.jobTitle) pparts.push('Cargo atual: ' + item.jobTitle);
if (item.description) pparts.push(stripTags(item.description));
var pjoined = pparts.join('\n');
if (pjoined.length > 100) return pjoined;
}
}
}
return '';
}

function extractMainContent(html) {
var patterns = [
/<article[^>]*>([\s\S]*?)<\/article>/i,
/<main[^>]*>([\s\S]*?)<\/main>/i,
/<div[^>]+class=["'][^"']*(?:job-description|jobDescription|job_description|description)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
];
for (var i = 0; i < patterns.length; i++) {
var m = html.match(patterns[i]);
if (m) {
var txt = stripTags(m[m.length - 1]);
if (txt.length > 200) return txt;
}
}
var body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
return stripTags(body ? body[1] : html);
}

function isBlockedHost(hostname) {
var h = hostname.toLowerCase();
if (h === 'localhost' || h.slice(-6) === '.local') return true;
if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
if (h === '::1' || h.slice(0,5) === 'fe80:' || h.slice(0,2) === 'fc' || h.slice(0,2) === 'fd') return true;
return false;
}

export default async function handler(req, res) {
if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

var url = (req.body || {}).url;
if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Informe a URL.' });

var target;
try { target = new URL(url); } catch (e) { return res.status(400).json({ error: 'URL inválida.' }); }
if (!/^https?:$/.test(target.protocol)) return res.status(400).json({ error: 'Use um link http ou https.' });
if (isBlockedHost(target.hostname)) return res.status(400).json({ error: 'Esse endereço não pode ser acessado.' });

var controller = new AbortController();
var timer = setTimeout(function () { controller.abort(); }, 9000);

try {
var r = await fetch(target.toString(), {
redirect: 'follow',
signal: controller.signal,
headers: {
'User-Agent': UA,
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
}
});

var finalUrl = r.url || target.toString();
if (r.status === 999 || /\/(login|authwall|uas\/login|checkpoint)(\/|$|\?)/i.test(finalUrl)) {
clearTimeout(timer);
return res.status(200).json({ error: 'Esse site exige login e bloqueia leitura automática (comum em perfis do LinkedIn). Copie e cole o conteúdo manualmente.' });
}
if (!r.ok) {
clearTimeout(timer);
return res.status(200).json({ error: 'Não consegui ler esse link (HTTP ' + r.status + ').' });
}

var html = await r.text();
if (html.length > 2000000) html = html.slice(0, 2000000);

var titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
var title = titleMatch ? stripTags(titleMatch[1]).slice(0, 200) : '';

var text = extractJsonLd(html);
if (!text || text.length < 200) text = extractMainContent(html);

clearTimeout(timer);

if (!text || text.length < 150) {
return res.status(200).json({ error: 'Não consegui extrair conteúdo suficiente desse link (o site pode exigir login ou bloquear leitura automática). Copie e cole manualmente.' });
}

return res.status(200).json({ text: text.slice(0, 15000), title: title, finalUrl: finalUrl });
} catch (e) {
clearTimeout(timer);
var timedOut = e.name === 'AbortError';
var msg = timedOut ? 'O site demorou demais para responder. Tente novamente ou copie o texto manualmente.' : ('Não consegui ler esse link: ' + e.message);
return res.status(200).json({ error: msg });
}
}
