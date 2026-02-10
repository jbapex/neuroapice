# 🚀 Instruções para Deploy das Edge Functions

## 📋 Pré-requisitos

1. **Supabase CLI instalado:**
```bash
npm install -g supabase
```

2. **Login no Supabase:**
```bash
supabase login
```

3. **Link do projeto:**
```bash
supabase link --project-ref seu-project-ref
```

---

## ⚠️ IMPORTANTE: Antes do Deploy

### Problema: yt-dlp precisa estar instalado

As Edge Functions do Supabase rodam em Deno, mas **yt-dlp é uma ferramenta Python** que precisa estar disponível no ambiente.

### Soluções:

#### **Opção A: Usar versão TypeScript + Instalar yt-dlp no host**
1. Use as versões `index.ts` (já criadas)
2. Instale yt-dlp no servidor/host onde o Supabase roda (se tiver acesso)
3. Ou configure um Dockerfile customizado (se o Supabase suportar)

#### **Opção B: Usar Worker Externo (RECOMENDADO)**
Criar um worker separado em Vercel/Railway com Python e yt-dlp, e chamar esse worker da Edge Function.

#### **Opção C: API Externa**
Usar uma API paga que já tenha yt-dlp (Opção 2 do documento original).

---

## 📦 Deploy das Funções

### Se usar versões TypeScript (index.ts):

```bash
# Deploy get-video-metadata
supabase functions deploy get-video-metadata

# Deploy download-video
supabase functions deploy download-video
```

**⚠️ Lembre-se:** yt-dlp precisa estar disponível no PATH do ambiente Deno!

### Se usar versões Python (index.py):

**Nota:** Supabase pode não suportar Python diretamente. Verifique a documentação.

```bash
# Se Python for suportado:
supabase functions deploy get-video-metadata --runtime python
supabase functions deploy download-video --runtime python
```

---

## ⚙️ Configurações Necessárias

### 1. Variáveis de Ambiente

No Dashboard do Supabase:
- Vá em **Project Settings** → **Edge Functions** → **Secrets**

Adicione (se ainda não existirem):
- `SUPABASE_URL` - Sua URL do Supabase (já deve existir)
- `SUPABASE_SERVICE_ROLE_KEY` - Chave de serviço (já deve existir)

### 2. Bucket de Storage

Certifique-se de que o bucket `media_uploads` existe:

1. Vá em **Storage** no Dashboard
2. Crie o bucket `media_uploads` se não existir
3. Configure as políticas:
   - **Public**: Não (bucket privado)
   - **File size limit**: Ajuste conforme necessário (ex: 500MB)

### 3. Políticas RLS (Row Level Security)

Se necessário, ajuste as políticas para a tabela `media_library`.

---

## 🧪 Teste Local (Opcional)

Para testar localmente antes de fazer deploy:

```bash
# Instalar Supabase CLI localmente
supabase start

# Rodar função localmente
supabase functions serve get-video-metadata
supabase functions serve download-video
```

Teste com curl:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/get-video-metadata' \
  --header 'Authorization: Bearer SEU_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"video_url":"https://www.youtube.com/watch?v=VIDEO_ID"}'
```

---

## ✅ Verificação Pós-Deploy

1. **Teste no Dashboard:**
   - Vá em **Edge Functions**
   - Clique na função
   - Use o **Invoke** para testar

2. **Teste no Frontend:**
   - Acesse o Mídia Center
   - Cole uma URL do YouTube
   - Deve buscar metadados corretamente

---

## 🐛 Troubleshooting

### Erro: "Module not found: yt-dlp"
- Verifique se o `requirements.txt` está correto
- O deploy deve instalar automaticamente, mas pode demorar

### Erro: "Storage bucket not found"
- Crie o bucket `media_uploads` no Storage
- Verifique as permissões

### Erro: "Service role key not found"
- Adicione `SUPABASE_SERVICE_ROLE_KEY` nas secrets
- Reinicie a função após adicionar

### Vídeos não estão baixando
- Verifique os logs da função no Dashboard
- Alguns vídeos podem ter restrições de download
- Teste com vídeos públicos simples primeiro

---

## 📝 Notas Importantes

1. **Limites do Supabase:**
   - Edge Functions têm timeout de 60 segundos (padrão)
   - Para vídeos longos, pode ser necessário aumentar
   - Storage tem limites de tamanho de arquivo

2. **Custos:**
   - Downloads consumem bandwidth
   - Storage consome espaço
   - Monitore o uso no Dashboard

3. **Segurança:**
   - As URLs assinadas expiram em 1 hora
   - Configure políticas RLS adequadas
   - Não exponha service role key no frontend

---

## 🔄 Atualizações Futuras

Para atualizar as funções:

```bash
# Fazer alterações nos arquivos
# Depois fazer deploy novamente
supabase functions deploy get-video-metadata
supabase functions deploy download-video
```

---

## 📞 Suporte

Se tiver problemas:
1. Verifique os logs da função no Dashboard
2. Teste localmente primeiro
3. Verifique se yt-dlp está atualizado

