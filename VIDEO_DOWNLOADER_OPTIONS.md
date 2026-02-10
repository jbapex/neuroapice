# Opções para Reconstruir Download de Vídeos

## 📋 Resumo das Opções

| Opção | Dificuldade | Custo | Confiabilidade | Recomendação |
|-------|-------------|-------|----------------|--------------|
| **yt-dlp (Python)** | Média | Grátis | ⭐⭐⭐⭐⭐ | 🏆 MELHOR |
| **ytdl-core (Node/Deno)** | Média | Grátis | ⭐⭐⭐⭐ | ✅ Boa |
| **API Externa (Paga)** | Fácil | ~$10-50/mês | ⭐⭐⭐⭐⭐ | ✅ Estável |
| **Frontend Direto** | Fácil | Grátis | ⭐⭐⭐ | ⚠️ Limitado |
| **Worker Externo** | Alta | ~$5-20/mês | ⭐⭐⭐⭐ | ✅ Alternativa |

---

## 🏆 OPÇÃO 1: yt-dlp (RECOMENDADA)

### Por que escolher?
- ✅ Mais atualizada e confiável
- ✅ Suporta YouTube, Instagram, TikTok, etc
- ✅ Atualizações constantes para contornar bloqueios
- ✅ Permite escolher qualidade/formato
- ✅ Gratuita

### Como implementar na Edge Function:

**1. Criar/Atualizar Edge Function `get-video-metadata`:**

```python
import yt_dlp
import json

def main(req):
    try:
        video_url = req.json.get('video_url')
        if not video_url:
            return json.dumps({"error": "URL do vídeo é obrigatória"}), 400
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            
            return json.dumps({
                "title": info.get('title', 'Sem título'),
                "thumbnail": info.get('thumbnail', ''),
                "uploader": info.get('uploader', ''),
                "duration_string": info.get('duration_string', '0:00'),
                "video_url": video_url,
            }), 200
            
    except Exception as e:
        return json.dumps({
            "error": f"Não foi possível obter os metadados do vídeo: {str(e)}"
        }), 400
```

**2. Criar/Atualizar Edge Function `download-video`:**

```python
import yt_dlp
import json
import os
from supabase import create_client

def main(req):
    try:
        video_url = req.json.get('video_url') or req.json.get('media_id')
        
        # Se for media_id, busca URL do banco
        if not video_url or not video_url.startswith('http'):
            # Buscar do banco usando media_id
            # Implementar busca no Supabase
        
        ydl_opts = {
            'format': 'best[ext=mp4]/best',
            'outtmpl': '%(title)s.%(ext)s',
        }
        
        # Download para storage temporário
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            filename = ydl.prepare_filename(info)
            
            # Upload para Supabase Storage
            # Retornar URL assinada para download
        
    except Exception as e:
        return json.dumps({"error": str(e)}), 400
```

**Instalação no Supabase:**
1. Criar `requirements.txt` na Edge Function:
```
yt-dlp>=2024.1.0
```

2. Deploy:
```bash
supabase functions deploy get-video-metadata
supabase functions deploy download-video
```

---

## ✅ OPÇÃO 2: API Externa (Paga, mas Estável)

### Serviços Recomendados:

#### RapidAPI - YouTube Downloader
- **Custo**: ~$10-50/mês dependendo do uso
- **Endpoint**: `https://youtube-downloader.p.rapidapi.com/`
- **Limite**: ~1000 requests/mês no plano básico

#### Implementação:

```typescript
// Edge Function usando API Externa
Deno.serve(async (req) => {
  const { video_url } = await req.json()
  
  const response = await fetch('https://youtube-downloader.p.rapidapi.com/download', {
    method: 'POST',
    headers: {
      'X-RapidAPI-Key': Deno.env.get('RAPIDAPI_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: video_url }),
  })
  
  const data = await response.json()
  return new Response(JSON.stringify(data))
})
```

**Vantagens:**
- ✅ Zero manutenção
- ✅ Sempre atualizado
- ✅ Funciona imediatamente

**Desvantagens:**
- ❌ Custo mensal
- ❌ Dependência externa
- ❌ Limites de uso

---

## ✅ OPÇÃO 3: ytdl-core (Node/Deno)

### Para Supabase Edge Functions (Deno):

```typescript
// Importar biblioteca Deno compatível
import { YTDL } from "https://deno.land/x/ytdl_core/mod.ts"

Deno.serve(async (req) => {
  const { video_url } = await req.json()
  
  try {
    const info = await YTDL.getInfo(video_url)
    
    return new Response(JSON.stringify({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[0].url,
      uploader: info.videoDetails.author.name,
    }))
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400 }
    )
  }
})
```

**Vantagens:**
- ✅ Nativo para Deno
- ✅ Não precisa instalar dependências pesadas
- ✅ Rápido

**Desvantagens:**
- ⚠️ Pode precisar de atualizações mais frequentes
- ⚠️ Menos recursos que yt-dlp

---

## ⚠️ OPÇÃO 4: Frontend Direto (Limitado)

### Usando biblioteca JavaScript no navegador:

```javascript
// No componente DownloaderCard.jsx
import ytdl from 'ytdl-core-browser' // ou biblioteca similar

const handleDownloadDirect = async (url) => {
  try {
    // Tenta fazer download direto no navegador
    const info = await ytdl.getInfo(url)
    const stream = ytdl(url, { quality: 'highest' })
    
    // Cria blob e faz download
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    const blob = new Blob(chunks)
    const url_blob = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url_blob
    a.download = `${info.videoDetails.title}.mp4`
    a.click()
  } catch (error) {
    // Falha silenciosamente ou usa backend
  }
}
```

**Vantagens:**
- ✅ Sem custo no backend
- ✅ Download instantâneo

**Desvantagens:**
- ❌ Limitações do navegador (CORS, tamanho)
- ❌ Não funciona para Instagram
- ❌ Pode ser bloqueado

---

## 🚀 OPÇÃO 5: Worker Externo (Vercel/Railway)

### Criar Worker separado:

**Vercel Serverless Function:**
```python
# api/download-video.py
from flask import Flask, request, jsonify
import yt_dlp

app = Flask(__name__)

@app.route('/api/download', methods=['POST'])
def download_video():
    video_url = request.json.get('video_url')
    
    # Processa download usando yt-dlp
    # Retorna URL ou faz stream
    
    return jsonify({...})
```

**Chamar do Supabase:**
```typescript
// Edge Function chama Worker externo
const response = await fetch('https://seu-worker.vercel.app/api/download', {
  method: 'POST',
  body: JSON.stringify({ video_url }),
})
```

**Vantagens:**
- ✅ Ambiente mais flexível
- ✅ Pode usar qualquer biblioteca
- ✅ Escala facilmente

**Desvantagens:**
- ❌ Custo adicional
- ❌ Mais complexidade
- ❌ Manter dois serviços

---

## 📊 Comparação Final

### Para PRODUÇÃO (Recomendado):
1. **yt-dlp na Edge Function** - Melhor custo/benefício
2. **API Externa** - Se precisa de solução rápida e estável

### Para TESTE/RÁPIDO:
3. **ytdl-core** - Implementação mais simples
4. **Frontend Direto** - Se quer evitar backend

---

## 🔧 Próximos Passos Recomendados

### Plano de Ação:

1. **Fase 1 - Teste Rápido** (1-2 dias):
   - Implementar ytdl-core em Edge Function
   - Testar com algumas URLs
   - Validar funcionamento

2. **Fase 2 - Produção** (3-5 dias):
   - Migrar para yt-dlp
   - Adicionar tratamento de erros robusto
   - Implementar cache de metadados
   - Adicionar suporte a múltiplos formatos

3. **Fase 3 - Otimização** (opcional):
   - Implementar fila de download
   - Adicionar progresso de download
   - Suporte a downloads em background

---

## 💡 Minha Recomendação

**Começar com: yt-dlp na Edge Function**

**Por quê:**
- É a solução mais robusta
- Não tem custos adicionais
- Funciona para maioria dos casos
- Atualizações frequentes

**Se não funcionar:**
- Implementar API externa como fallback
- Ou usar Worker externo

---

Qual opção você prefere implementar? Posso ajudar com o código específico!

