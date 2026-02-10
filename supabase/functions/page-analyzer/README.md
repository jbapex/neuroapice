# Edge Function: page-analyzer

Analisa páginas web e extrai informações estruturadas em formato JSON.

## Funcionalidades

- Extrai título da página
- Meta tags (description, keywords, Open Graph, Twitter Cards)
- Headings (H1-H6)
- Links internos e externos
- Imagens (src e alt)
- Conteúdo de texto (primeiros 5000 caracteres)
- Idioma e charset
- Timestamp da análise

## Request

```json
{
  "analysis_id": 123
}
```

## Response

```json
{
  "success": true,
  "analysis_id": 123,
  "data": {
    "url": "https://example.com",
    "title": "Título da Página",
    "meta": {
      "description": "...",
      "keywords": "...",
      "og_title": "...",
      "og_description": "...",
      "og_image": "..."
    },
    "headings": {
      "h1": ["..."],
      "h2": ["...", "..."],
      ...
    },
    "links": [
      { "url": "...", "text": "..." }
    ],
    "images": [
      { "src": "...", "alt": "..." }
    ],
    "text_content": "...",
    "language": "pt-BR",
    "charset": "UTF-8",
    "analysis_timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Deploy

```bash
supabase functions deploy page-analyzer
```

## Fluxo

1. Frontend cria registro em `page_analyses` com status `pending`
2. Frontend chama esta função com `analysis_id`
3. Função atualiza status para `processing`
4. Função faz fetch da URL
5. Função extrai dados do HTML
6. Função atualiza registro com `status: 'completed'` e `analysis_data`
7. Frontend recebe atualização via Supabase Realtime subscription

## Limites

- Timeout: 30 segundos para fetch
- Links: máximo 100 links
- Imagens: máximo 50 imagens
- Texto: máximo 5000 caracteres
- Links/Imagens URLs: máximo 500 caracteres

## Tratamento de Erros

Em caso de erro, o registro é atualizado com:
- `status: 'failed'`
- `error_message: 'mensagem do erro'`

