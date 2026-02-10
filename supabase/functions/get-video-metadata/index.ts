/**
 * Edge Function: get-video-metadata (TypeScript/Deno)
 * Usa yt-dlp via exec para extrair metadados de vídeos
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
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
    const { video_url } = await req.json()

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: "URL do vídeo é obrigatória" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Usar yt-dlp via linha de comando
    const ytDlpCommand = `yt-dlp --dump-json --no-warnings --quiet "${video_url}"`
    
    try {
      const { output, code } = await exec(ytDlpCommand)
      
      if (code !== 0) {
        throw new Error(output || 'Erro ao executar yt-dlp')
      }

      const info = JSON.parse(output)

      // Formatar duração
      const duration = info.duration || 0
      const hours = Math.floor(duration / 3600)
      const minutes = Math.floor((duration % 3600) / 60)
      const seconds = duration % 60
      let duration_string = hours > 0 
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`

      // Buscar melhor thumbnail
      const thumbnails = info.thumbnails || []
      let thumbnail = info.thumbnail || ''
      if (thumbnails.length > 0) {
        thumbnail = thumbnails[thumbnails.length - 1].url || thumbnail
      }

      // Preparar resposta
      const response_data = {
        title: info.title || 'Sem título',
        thumbnail: thumbnail,
        uploader: info.uploader || info.channel || info.creator || 'Desconhecido',
        duration: duration,
        duration_string: duration_string,
        description: (info.description || '').substring(0, 500),
        view_count: info.view_count || 0,
        video_url: video_url,
        platform: video_url.includes('youtube') || video_url.includes('youtu.be')
          ? 'youtube'
          : video_url.includes('instagram')
          ? 'instagram'
          : 'other',
      }

      return new Response(
        JSON.stringify(response_data),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (execError) {
      const errorMsg = execError.message || String(execError)
      
      let friendlyError = 'Não foi possível obter os metadados do vídeo.'
      
      if (errorMsg.includes('Private video') || errorMsg.includes('Sign in')) {
        friendlyError = 'Este vídeo é privado ou requer login. Não é possível acessá-lo.'
      } else if (errorMsg.includes('Video unavailable') || errorMsg.includes('unavailable')) {
        friendlyError = 'Este vídeo não está disponível ou foi removido.'
      } else if (errorMsg.includes('region') || errorMsg.includes('country')) {
        friendlyError = 'Este vídeo não está disponível na sua região.'
      } else {
        friendlyError = `Não foi possível obter os metadados do vídeo. Verifique a URL ou tente novamente.`
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
    console.error('Erro ao processar requisição:', error)
    return new Response(
      JSON.stringify({
        error: 'Não foi possível obter os metadados do vídeo. Verifique a URL ou tente novamente.'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

