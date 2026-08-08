# 💰 FitSalary

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)
![Gemini](https://img.shields.io/badge/LLM-Gemini_API-4285F4?style=flat&logo=google&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

Avaliação de compatibilidade entre uma vaga e o seu currículo, com recomendação de faixa salarial em BRL e USD. Análise feita pelo Gemini através de uma função serverless — a chave de API nunca chega ao navegador.

**Produção:** https://fitsalary.vercel.app

## Como funciona

**Vaga:** cole a descrição da vaga ou informe o link da vaga (funciona bem para a maioria dos sites de emprego). A leitura do link é feita no servidor pela função `/api/fetch-link`, que extrai dados estruturados (schema.org JobPosting) quando disponíveis ou o texto principal da página como alternativa.

**Currículo:** arraste um arquivo em PDF, DOCX ou TXT (o texto é extraído no próprio navegador com pdf.js / mammoth.js) ou cole o link do seu perfil do LinkedIn/portfólio — a mesma função `/api/fetch-link` busca e extrai o conteúdo público da página.

**Análise:** o front envia vaga e texto do currículo para `POST /api/analyze`. A função serverless monta o prompt, chama o Gemini (com nova tentativa automática caso a resposta venha malformada) e devolve um JSON estruturado. O front renderiza score de match, pontos fortes, lacunas, palavras-chave, dicas de negociação e a faixa salarial.

Nenhum dado é persistido em servidor.

## Estrutura

| Arquivo | Descrição |
|---|---|
| `index.html` | Front-end completo (HTML + CSS + JS inline) |
| `api/analyze.js` | Função serverless que chama o Gemini, com fallback entre modelos e novas tentativas em caso de resposta malformada |
| `api/fetch-link.js` | Função serverless que busca uma URL (vaga ou currículo/LinkedIn) e extrai o conteúdo relevante, com proteções contra SSRF |
| `package.json` | Define `"type": "module"` para as funções usarem ESM |

## Configuração

A aplicação exige uma variável de ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | sim | Chave da API do Google AI Studio (começa com `AIza`). Gere em aistudio.google.com/apikey. |
| `GEMINI_MODEL` | não | Fixa um modelo específico. Se não definida, a função tenta automaticamente, em ordem: gemini-2.5-flash, gemini-flash-latest, gemini-2.0-flash, gemini-2.0-flash-lite, gemini-2.5-flash-lite, gemini-pro-latest. |

Na Vercel: **Settings → Environment Variables**, adicione `GEMINI_API_KEY` no ambiente Production e refaça o deploy.

A função aceita tanto chaves do AI Studio (`AIza...`, enviadas na query string) quanto tokens OAuth do Google Cloud (`ya29...`, `AQ...`, enviados no header Authorization). Tokens OAuth expiram em poucas horas — prefira a chave do AI Studio.

## Leitura de links

O endpoint `/api/fetch-link` faz a busca da página no servidor (evitando bloqueios de CORS) e tenta, nesta ordem: extrair dados estruturados via JSON-LD (schema.org JobPosting ou Person) quando o site publica esse formato; e, como alternativa, extrair heuristicamente o texto principal do HTML.

**Proteções incluídas:** bloqueio de requisições para localhost, IPs privados e o endereço de metadados de nuvem (169.254.169.254); apenas os protocolos http/https são aceitos; timeout nas requisições.

**Limitação conhecida:** perfis do LinkedIn geralmente exigem login para mostrar o histórico completo — a extração retorna apenas o resumo público (nome, cargo atual, sobre). Se a leitura falhar ou vier incompleta, exporte o perfil como PDF e envie no campo de upload do currículo. O LinkedIn também pode limitar a taxa de requisições (HTTP 429); nesse caso, aguarde alguns segundos e tente novamente.

## Desenvolvimento local

```
npm i -g vercel
vercel dev
```

Crie um `.env.local` com `GEMINI_API_KEY=...` antes de rodar.

## Segurança

A chave vive apenas como variável de ambiente. Nunca faça commit dela.

O endpoint `/api/analyze` é público: quem tiver a URL consome sua cota do Gemini. Para uso pessoal, considere ativar Password Protection na Vercel ou adicionar rate limiting por IP.

O endpoint `/api/fetch-link` busca URLs informadas pelo usuário; ele bloqueia hosts internos/privados, mas ainda assim é um proxy de leitura — evite expor a aplicação sem controle de acesso caso isso seja uma preocupação.

## Limitações

A faixa salarial é uma estimativa gerada pelo modelo a partir do conhecimento de mercado que ele tem até o corte de treinamento — não é uma consulta ao vivo ao Glassdoor, que não expõe API pública. Serve como âncora de negociação; confirme os números em fontes atualizadas antes de usá-los.

## Licença

MIT
