/**
 * Edge Function: get-google-models
 * Lista modelos disponíveis na API Google Generative Language (Gemini).
 * Usado na Nova Conexão de Imagem para exibir modelos de geração de imagem ao informar a API key.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const apiKey = body?.apiKey ?? body?.api_key ?? ''

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'apiKey é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = `${GOOGLE_MODELS_URL}?key=${encodeURIComponent(apiKey)}&pageSize=100`
    const res = await fetch(url)

    if (!res.ok) {
      const text = await res.text()
      return new Response(
        JSON.stringify({
          error: 'Falha ao buscar modelos da API Google',
          details: res.status === 401 || res.status === 403 ? 'Chave da API inválida ou sem permissão.' : text.slice(0, 200),
        }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const data = await res.json()
    const models = Array.isArray(data?.models) ? data.models : []

    return new Response(
      JSON.stringify({ models }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Erro ao buscar modelos',
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
