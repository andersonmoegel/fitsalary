# FitSalary

Avaliação de compatibilidade entre uma vaga e o seu currículo, com recomendação de faixa salarial em BRL e USD. Análise feita pelo Gemini através de uma função serverless — a chave de API nunca chega ao navegador.

**Produção:** https://fitsalary.vercel.app

## Como funciona

1. O usuário cola a descrição da vaga (ou informa um link, extraído via proxy no browser).
2. Arrasta o currículo em PDF, DOCX ou TXT — o texto é extraído no próprio navegador com `pdf.js` / `mammoth.js`.
3. O front envia vaga + texto do CV para `POST /api/analyze`.
4. A função serverless monta o prompt, chama o Gemini e devolve um JSON estruturado.
5. O front renderiza score de match, pontos fortes, lacunas, palavras-chave, dicas de negociação e a faixa salarial.

Nenhum dado é persistido em servidor.

## Estrutura

```
index.html        Front-end completo (HTML + CSS + JS inline)
api/analyze.js    Função serverless que chama o Gemini
package.json      Define "type": "module" para a função usar ESM
```

## Configuração

A aplicação exige uma variável de ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | sim | Chave da API do Google AI Studio (começa com `AIza`). Gere em [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | não | Modelo usado. Padrão: `gemini-2.0-flash`. |

Na Vercel: **Settings → Environment Variables**, adicione `GEMINI_API_KEY` no ambiente Production e refaça o deploy.

A função aceita tanto chaves do AI Studio (`AIza...`, enviadas na query string) quanto tokens OAuth do Google Cloud (`ya29...`, `AQ...`, enviados no header `Authorization`). Tokens OAuth expiram em poucas horas — prefira a chave do AI Studio.

## Desenvolvimento local

```bash
npm i -g vercel
vercel dev
```

Crie um `.env.local` com `GEMINI_API_KEY=...` antes de rodar.

## Segurança

- A chave vive apenas como variável de ambiente. Nunca faça commit dela.
- O endpoint `/api/analyze` é público: quem tiver a URL consome sua cota do Gemini. Para uso pessoal, considere ativar Password Protection na Vercel ou adicionar rate limiting por IP.

## Limitações

A faixa salarial é uma estimativa gerada pelo modelo a partir do conhecimento de mercado que ele tem até o corte de treinamento — não é uma consulta ao vivo ao Glassdoor, que não expõe API pública. Serve como âncora de negociação; confirme os números em fontes atualizadas antes de usá-los.
