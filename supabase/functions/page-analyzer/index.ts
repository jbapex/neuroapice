/**
 * Edge Function: page-analyzer
 * Analisa páginas web e extrai informações estruturadas
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { analysis_id } = await req.json()

    if (!analysis_id) {
      return new Response(
        JSON.stringify({ error: "analysis_id é obrigatório" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar análise no banco
    const { data: analysis, error: fetchError } = await supabase
      .from('page_analyses')
      .select('*')
      .eq('id', analysis_id)
      .single()

    if (fetchError || !analysis) {
      return new Response(
        JSON.stringify({ error: "Análise não encontrada" }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (analysis.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: "Análise já foi processada" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Atualizar status para processing
    await supabase
      .from('page_analyses')
      .update({ status: 'processing' })
      .eq('id', analysis_id)

    const url = analysis.url

    // Validar URL
    let targetUrl: URL
    try {
      targetUrl = new URL(url)
    } catch {
      await supabase
        .from('page_analyses')
        .update({ 
          status: 'failed',
          error_message: 'URL inválida'
        })
        .eq('id', analysis_id)

      return new Response(
        JSON.stringify({ error: "URL inválida" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Fazer fetch da página
    let html: string
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        signal: AbortSignal.timeout(30000) // 30 segundos timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      html = await response.text()
    } catch (fetchErr) {
      const errorMsg = fetchErr instanceof Error ? fetchErr.message : 'Erro ao buscar página'
      
      await supabase
        .from('page_analyses')
        .update({ 
          status: 'failed',
          error_message: errorMsg
        })
        .eq('id', analysis_id)

      return new Response(
        JSON.stringify({ error: errorMsg }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Extrair informações do HTML usando regex simples (já que não temos bibliotecas de parsing)
    const analysisData = extractPageData(html, url)

    // Salvar resultado
    const { error: updateError } = await supabase
      .from('page_analyses')
      .update({ 
        status: 'completed',
        analysis_data: analysisData
      })
      .eq('id', analysis_id)

    if (updateError) {
      console.error('Erro ao salvar análise:', updateError)
      return new Response(
        JSON.stringify({ error: "Erro ao salvar resultado da análise" }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        analysis_id: analysis_id,
        data: analysisData
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Erro ao processar análise:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Erro interno do servidor'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/**
 * Extrai dados estruturados do HTML
 */
function extractPageData(html: string, url: string): any {
  const data: any = {
    url: url,
    title: extractTitle(html),
    meta: extractMetaTags(html),
    headings: extractHeadings(html),
    links: extractLinks(html),
    images: extractImages(html),
    text_content: extractTextContent(html),
    language: extractLanguage(html),
    charset: extractCharset(html),
    analysis_timestamp: new Date().toISOString()
  }

  return data
}

function extractTitle(html: string): string {
  // <title>...</title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) return titleMatch[1].trim()
  
  // <h1>...</h1> como fallback
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
  if (h1Match) return h1Match[1].trim()
  
  return 'Sem título'
}

function extractMetaTags(html: string): any {
  const meta: any = {}
  
  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
  if (descMatch) meta.description = descMatch[1]
  
  // Meta keywords
  const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i)
  if (keywordsMatch) meta.keywords = keywordsMatch[1]
  
  // Open Graph
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  if (ogTitleMatch) meta.og_title = ogTitleMatch[1]
  
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
  if (ogDescMatch) meta.og_description = ogDescMatch[1]
  
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
  if (ogImageMatch) meta.og_image = ogImageMatch[1]
  
  // Twitter Cards
  const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i)
  if (twitterTitleMatch) meta.twitter_title = twitterTitleMatch[1]
  
  const twitterDescMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i)
  if (twitterDescMatch) meta.twitter_description = twitterDescMatch[1]
  
  // Viewport
  const viewportMatch = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["']/i)
  if (viewportMatch) meta.viewport = viewportMatch[1]
  
  return meta
}

function extractHeadings(html: string): any {
  const headings: any = {
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: []
  }
  
  for (let level = 1; level <= 6; level++) {
    const regex = new RegExp(`<h${level}[^>]*>([^<]+)<\/h${level}>`, 'gi')
    let match
    while ((match = regex.exec(html)) !== null) {
      headings[`h${level}`].push(match[1].trim())
    }
  }
  
  return headings
}

function extractLinks(html: string): any[] {
  const links: any[] = []
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi
  let match
  
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1]
    const text = match[2].replace(/<[^>]+>/g, '').trim()
    
    // Filtrar links vazios e muito longos
    if (href && href.length < 500 && text && text.length < 200) {
      links.push({
        url: href,
        text: text.substring(0, 200)
      })
    }
    
    // Limitar a 100 links
    if (links.length >= 100) break
  }
  
  return links
}

function extractImages(html: string): any[] {
  const images: any[] = []
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/gi
  let match
  
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    const alt = match[2] || ''
    
    if (src && src.length < 500) {
      images.push({
        src: src,
        alt: alt.substring(0, 200)
      })
    }
    
    // Limitar a 50 imagens
    if (images.length >= 50) break
  }
  
  return images
}

function extractTextContent(html: string): string {
  // Remove scripts e styles
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
  
  // Limitar a 5000 caracteres
  return text.substring(0, 5000)
}

function extractLanguage(html: string): string {
  const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i)
  if (langMatch) return langMatch[1]
  
  const langMetaMatch = html.match(/<meta[^>]*http-equiv=["']content-language["'][^>]*content=["']([^"']+)["']/i)
  if (langMetaMatch) return langMetaMatch[1]
  
  return 'pt-BR' // Default
}

function extractCharset(html: string): string {
  const charsetMatch = html.match(/<meta[^>]*charset=["']([^"']+)["']/i)
  if (charsetMatch) return charsetMatch[1]
  
  const charsetMetaMatch = html.match(/<meta[^>]*http-equiv=["']content-type["'][^>]*content=["'][^"']*charset=([^"';]+)/i)
  if (charsetMetaMatch) return charsetMetaMatch[1]
  
  return 'UTF-8' // Default
}

