/**
 * Edge Function: download-video (TypeScript/Deno)
 * Usa yt-dlp para baixar vídeos e fazer upload para Supabase Storage
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exec } from "https://deno.land/x/exec@0.0.5/mod.ts"

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    let video_url = body.video_url
    const media_id = body.media_id

    // Se tiver media_id, buscar URL do banco
    if (media_id && !video_url) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      const { data: mediaData, error: mediaError } = await supabase
        .from('media_library')
        .select('video_url')
        .eq('id', media_id)
        .single()

      if (mediaError || !mediaData) {
        return new Response(
          JSON.stringify({ error: 'Mídia não encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      video_url = mediaData.video_url
    }

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'URL do vídeo ou media_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar diretório temporário
    const tempDir = await Deno.makeTempDir({ prefix: 'ytdlp_' })
    const outputPath = `${tempDir}/%(title)s.%(ext)s`

    // Comando yt-dlp para baixar
    const ytDlpCommand = `yt-dlp -f "best[ext=mp4]/best[height<=720]/best" --no-warnings --quiet -o "${outputPath}" "${video_url}"`

    try {
      const { output, code } = await exec(ytDlpCommand)

      if (code !== 0) {
        throw new Error(output || 'Erro ao baixar vídeo')
      }

      // Procurar arquivo baixado
      const files = []
      for await (const entry of Deno.readDir(tempDir)) {
        if (entry.isFile) {
          files.push(entry.name)
        }
      }

      if (files.length === 0) {
        throw new Error('Arquivo não foi baixado')
      }

      const downloadedFile = `${tempDir}/${files[0]}`
      const fileInfo = await Deno.stat(downloadedFile)

      // Ler arquivo
      const videoData = await Deno.readFile(downloadedFile)

      // Upload para Supabase Storage
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      // Nome do arquivo (sanitizado)
      const filename = files[0].replace(/[^a-zA-Z0-9._-]/g, '_')

      // Caminho no storage
      const now = new Date()
      const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
      const storagePath = `video-downloads/${datePath}/${filename}`

      // Upload
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media_uploads')
        .upload(storagePath, videoData, {
          contentType: 'video/mp4',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Erro ao fazer upload: ${uploadError.message}`)
      }

      // Criar URL assinada (válida por 1 hora)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('media_uploads')
        .createSignedUrl(storagePath, 3600)

      if (signedUrlError) {
        throw new Error('Erro ao criar URL assinada')
      }

      // Limpar arquivo temporário
      await Deno.remove(tempDir, { recursive: true })

      return new Response(
        JSON.stringify({
          download_url: signedUrlData.signedUrl,
          filename: filename,
          size: fileInfo.size,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (execError) {
      // Limpar em caso de erro
      try {
        await Deno.remove(tempDir, { recursive: true })
      } catch {}

      const errorMsg = execError.message || String(execError)

      let friendlyError = 'Não foi possível baixar o vídeo.'
      if (errorMsg.includes('Private video')) {
        friendlyError = 'Este vídeo é privado e não pode ser baixado.'
      } else if (errorMsg.includes('Video unavailable')) {
        friendlyError = 'Este vídeo não está disponível.'
      }

      return new Response(
        JSON.stringify({ error: friendlyError }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

  } catch (error) {
    console.error('Erro ao processar download:', error)
    return new Response(
      JSON.stringify({
        error: 'Não foi possível baixar o vídeo. Tente novamente.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

