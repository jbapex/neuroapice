# Edge Functions - Download de Vídeos

Este diretório contém as Edge Functions do Supabase para download de vídeos usando **yt-dlp**.

## ⚠️ IMPORTANTE: Escolha a Versão

Este diretório contém **duas versões** de cada função:

### Versão TypeScript (Deno) - ✅ RECOMENDADA
- **Arquivos**: `index.ts`
- **Vantagem**: Nativa do Supabase, mais fácil de deployar
- **Requisito**: yt-dlp precisa estar instalado no ambiente Deno (pode precisar de configuração adicional)

### Versão Python
- **Arquivos**: `index.py`
- **Vantagem**: Mais robusta, yt-dlp é nativo do Python
- **Requisito**: Supabase precisa suportar Python Edge Functions (verificar disponibilidade)

## 📁 Estrutura

```
supabase/functions/
├── get-video-metadata/
│   ├── index.ts          # Versão TypeScript (Deno) ✅
│   ├── index.py          # Versão Python
│   └── requirements.txt  # Dependências Python
├── download-video/
│   ├── index.ts          # Versão TypeScript (Deno) ✅
│   ├── index.py          # Versão Python
│   └── requirements.txt  # Dependências Python
├── DEPLOY_INSTRUCTIONS.md
└── README.md
```

## 🚀 Deploy Recomendado

**Use as versões TypeScript (`index.ts`):**

```bash
supabase functions deploy get-video-metadata
supabase functions deploy download-video
```

**IMPORTANTE:** Para as versões TypeScript funcionarem, o yt-dlp precisa estar disponível no ambiente Deno. Isso pode requerer:

1. Instalar yt-dlp no container/host onde as Edge Functions rodam
2. Ou usar um wrapper/API externa para yt-dlp
3. Ou usar Deno FFI para chamar yt-dlp

## 📦 Alternativa: Usar API Externa

Se instalar yt-dlp diretamente for complicado, considere usar uma API externa (Opção 2 do documento original) ou criar um worker separado.

## 🔧 Funções

### `get-video-metadata`
Extrai metadados (título, thumbnail, duração, etc.) de vídeos do YouTube, Instagram, etc.

**Request:**
```json
{
  "video_url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "title": "Título do Vídeo",
  "thumbnail": "https://...",
  "uploader": "Canal",
  "duration_string": "5:30",
  "duration": 330,
  "platform": "youtube"
}
```

### `download-video`
Faz download do vídeo e faz upload para Supabase Storage, retornando URL assinada.

**Request:**
```json
{
  "video_url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```
ou
```json
{
  "media_id": "uuid-do-media-na-biblioteca"
}
```

**Response:**
```json
{
  "download_url": "https://...signed-url...",
  "filename": "video.mp4",
  "size": 12345678
}
```

## ⚠️ Limitações do Supabase Edge Functions

1. **yt-dlp não vem pré-instalado** no ambiente Deno
2. **Soluções possíveis:**
   - Instalar yt-dlp via Dockerfile personalizado (se suportado)
   - Usar API externa que já tenha yt-dlp
   - Criar worker externo (Vercel/Railway) com Python

## 💡 Próximos Passos

1. **Teste a instalação de yt-dlp no Supabase:**
   - Verifique se é possível instalar via Deno
   - Ou use Dockerfile se suportado

2. **Se não funcionar:**
   - Considere migrar para Opção 2 (API Externa)
   - Ou criar worker externo com Python

3. **Teste localmente primeiro:**
   ```bash
   supabase functions serve get-video-metadata
   ```

## 📝 Notas

- As versões TypeScript usam `exec()` para chamar yt-dlp via linha de comando
- Certifique-se de que yt-dlp está disponível no PATH do ambiente
- As versões Python são mais diretas, mas requerem suporte Python no Supabase
