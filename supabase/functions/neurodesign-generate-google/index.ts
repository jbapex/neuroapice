import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildPrompt(config: Record<string, unknown>): string {
  const parts: string[] = [];
  const gender = config.subject_gender === "masculino" ? "homem" : config.subject_gender === "feminino" ? "mulher" : "";
  const subjectDesc = (config.subject_description as string)?.trim() || "";
  if (gender || subjectDesc) parts.push(`Sujeito principal: ${[gender, subjectDesc].filter(Boolean).join(", ")}.`);
  const niche = (config.niche_project as string)?.trim();
  if (niche) parts.push(`Contexto/nicho: ${niche}. Objetivo: criativo de marca/ads.`);
  const env = (config.environment as string)?.trim();
  if (env) parts.push(`Ambiente: ${env}.`);
  const colors = [config.ambient_color, config.rim_light_color, config.fill_light_color].filter(Boolean) as string[];
  if (colors.length) parts.push(`Iluminação e cores: ${colors.join(", ")}.`);
  const shot = config.shot_type as string;
  const layoutPos = config.layout_position as string;
  if (shot) parts.push(`Enquadramento: ${shot}.`);
  if (layoutPos) parts.push(`Posição do sujeito: ${layoutPos}.`);
  if (config.text_enabled) parts.push("Espaço reservado para texto.");
  const attrs = (config.visual_attributes as Record<string, unknown>) || {};
  const tags = Array.isArray(attrs.style_tags) ? attrs.style_tags : [];
  if (tags.length) parts.push(`Estilo: ${tags.join(", ")}.`);
  if (attrs.sobriety != null) parts.push(`Tom visual: ${Number(attrs.sobriety) <= 50 ? "mais criativo" : "mais profissional"}.`);
  if (attrs.ultra_realistic) parts.push("Ultra realista.");
  if (attrs.blur_enabled) parts.push("Blur de fundo suave.");
  if (attrs.lateral_gradient_enabled) parts.push("Degradê lateral.");
  if (config.floating_elements_enabled && (config.floating_elements_text as string)?.trim()) {
    parts.push(`Elementos flutuantes: ${(config.floating_elements_text as string).trim()}.`);
  }
  const styleRefs = Array.isArray(config.style_reference_urls) ? config.style_reference_urls : [];
  const styleInstructions = Array.isArray(config.style_reference_instructions) ? config.style_reference_instructions as string[] : [];
  if (styleRefs.length > 0) {
    const perRef: string[] = [];
    for (let i = 0; i < styleRefs.length; i++) {
      const t = styleInstructions[i] != null ? String(styleInstructions[i]).trim() : "";
      if (t) perRef.push(`Referência ${i + 1}: copie ${t}.`);
      else perRef.push(`Referência ${i + 1}: reproduza o estilo visual geral.`);
    }
    if (perRef.length) parts.push("Das imagens de referência anexas: " + perRef.join(" ") + " A imagem gerada deve ser semelhante ao estilo enviado.");
    else parts.push("Copie e reproduza o estilo visual das imagens de referência anexas: cores, iluminação, composição e estética. A imagem gerada deve ser semelhante ao estilo que foi enviado.");
  }
  const logoUrl = (config.logo_url as string)?.trim();
  if (logoUrl) parts.push("Inclua a logo anexa na arte, em posição visível e adequada (ex.: canto inferior, junto ao texto ou à marca).");
  const dims = (config.dimensions as string) || "1:1";
  parts.push(`Formato: ${dims}. Safe area para texto.`);
  if ((config.additional_prompt as string)?.trim()) parts.push((config.additional_prompt as string).trim());
  return parts.filter(Boolean).join(" ");
}

const SUBJECT_FACE_INSTRUCTION =
  "Obrigatório: use sempre o rosto e a identidade da pessoa da(s) imagem(ns) de sujeito principal como rosto na imagem gerada. Mantenha a mesma pessoa. ";

const STYLE_REFERENCE_INSTRUCTION =
  "Copie o estilo das imagens de referência anexas. A imagem gerada deve ser semelhante ao estilo enviado: reproduza cores, iluminação, composição e estética visual. ";

const LOGO_INSTRUCTION = "Inclua a logo anexa na arte, em posição visível e adequada (ex.: canto inferior, junto ao texto ou à marca). ";

type Conn = { id: number; user_id: string; provider: string; api_key: string; api_url: string; default_model: string | null };

function getAspectRatio(dimensions: string): string {
  const d = (dimensions || "1:1").trim();
  if (d === "4:5" || d === "9:16" || d === "16:9") return d;
  return "1:1";
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const data = btoa(binary);
    const contentType = res.headers.get("content-type") || "";
    const mimeType = contentType.includes("png") ? "image/png" : contentType.includes("webp") ? "image/webp" : "image/jpeg";
    return { data, mimeType };
  } catch {
    return null;
  }
}

async function generateWithGoogleGemini(
  conn: Conn,
  prompt: string,
  quantity: number,
  dimensions: string,
  subjectImageUrls: string[] = [],
  styleReferenceUrls: string[] = [],
  styleInstruction?: string,
  logoUrl?: string
): Promise<{ url: string }[]> {
  const baseUrl = conn.api_url.replace(/\/$/, "");
  const model = conn.default_model || "gemini-2.5-flash-image";
  const url = `${baseUrl}/models/${model}:generateContent`;
  const aspectRatio = getAspectRatio(dimensions);
  let textPrompt = prompt;
  if (subjectImageUrls.length > 0) textPrompt = SUBJECT_FACE_INSTRUCTION + textPrompt;
  if (styleReferenceUrls.length > 0) textPrompt = (styleInstruction || STYLE_REFERENCE_INSTRUCTION) + textPrompt;
  if (logoUrl?.trim()) textPrompt = LOGO_INSTRUCTION + textPrompt;
  const contentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  if (subjectImageUrls.length > 0) {
    for (const subjectUrl of subjectImageUrls.slice(0, 2)) {
      const img = await fetchImageAsBase64(subjectUrl);
      if (img) contentParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }
  if (styleReferenceUrls.length > 0) {
    for (const styleUrl of styleReferenceUrls.slice(0, 3)) {
      const img = await fetchImageAsBase64(styleUrl);
      if (img) contentParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }
  if (logoUrl?.trim()) {
    const logoImg = await fetchImageAsBase64(logoUrl.trim());
    if (logoImg) contentParts.push({ inlineData: { mimeType: logoImg.mimeType, data: logoImg.data } });
  }
  contentParts.push({ text: textPrompt });
  const body = {
    contents: [{ parts: contentParts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio, imageSize: "1K" },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": conn.api_key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new Error("Resposta Gemini sem parts");
  const urls: { url: string }[] = [];
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.data) {
      const mime = inline.mimeType || "image/png";
      urls.push({ url: `data:${mime};base64,${inline.data}` });
      if (urls.length >= Math.min(quantity, 5)) break;
    }
  }
  if (urls.length === 0) throw new Error("Resposta Gemini sem imagens");
  return urls;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { projectId, configId, config, userAiConnectionId } = body as { projectId: string; configId?: string; config: Record<string, unknown>; userAiConnectionId?: string };

    if (!projectId || !config) {
      return new Response(JSON.stringify({ error: "projectId e config são obrigatórios" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!userAiConnectionId) {
      return new Response(JSON.stringify({ error: "Selecione uma conexão de imagem (Google) no builder antes de gerar." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: project, error: projectError } = await supabase.from("neurodesign_projects").select("id, owner_user_id").eq("id", projectId).single();
    if (projectError || !project || project.owner_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Projeto não encontrado ou acesso negado" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: conn, error: connError } = await supabase
      .from("user_ai_connections")
      .select("id, user_id, provider, api_key, api_url, default_model")
      .eq("id", userAiConnectionId)
      .single();

    if (connError || !conn || conn.user_id !== user.id || !conn.api_key) {
      return new Response(JSON.stringify({ error: "Conexão de imagem não encontrada ou inválida. Verifique em Configurações → Minha IA." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const quantity = Math.min(Math.max(Number(config.quantity) || 1, 1), 5);
    const prompt = buildPrompt(config);
    const subjectImageUrls: string[] = Array.isArray(config.subject_image_urls)
      ? (config.subject_image_urls as string[]).filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, 2)
      : [];
    const styleReferenceUrls: string[] = Array.isArray(config.style_reference_urls)
      ? (config.style_reference_urls as string[]).filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, 3)
      : [];
    const styleInstructionsArr = Array.isArray(config.style_reference_instructions) ? (config.style_reference_instructions as string[]).slice(0, styleReferenceUrls.length) : [];
    const perRefParts: string[] = [];
    for (let i = 0; i < styleReferenceUrls.length; i++) {
      const t = styleInstructionsArr[i] != null ? String(styleInstructionsArr[i]).trim() : "";
      if (t) perRefParts.push(`Referência ${i + 1}: copie ${t}.`);
      else perRefParts.push(`Referência ${i + 1}: reproduza o estilo visual geral.`);
    }
    const styleInstruction = perRefParts.length > 0
      ? "Das imagens de referência anexas (na ordem): " + perRefParts.join(" ") + " A imagem gerada deve ser semelhante ao estilo enviado. "
      : undefined;
    const logoUrl = (config.logo_url && typeof config.logo_url === "string" && config.logo_url.trim()) ? config.logo_url.trim() : undefined;

    const runInsert = {
      project_id: projectId,
      config_id: configId || null,
      type: "generate",
      status: "running",
      provider: "google",
      provider_request_json: { prompt, config: { ...config, subject_image_urls: undefined, scenario_photo_urls: undefined, style_reference_urls: undefined, logo_url: undefined } },
    };
    const { data: run, error: runError } = await supabase.from("neurodesign_generation_runs").insert(runInsert).select("id").single();
    if (runError || !run) {
      return new Response(JSON.stringify({ error: runError?.message || "Erro ao criar run" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let images: { url: string }[];
    try {
      images = await generateWithGoogleGemini(
        conn as Conn,
        prompt,
        quantity,
        (config.dimensions as string) || "1:1",
        subjectImageUrls,
        styleReferenceUrls,
        styleInstruction,
        logoUrl
      );
    } catch (apiErr) {
      await supabase.from("neurodesign_generation_runs").update({ error_message: String(apiErr), completed_at: new Date().toISOString() }).eq("id", run.id);
      return new Response(JSON.stringify({ error: String(apiErr) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const imageRows = images.map((img) => ({
      run_id: run.id,
      project_id: projectId,
      url: img.url,
      thumbnail_url: img.url,
      width: 1024,
      height: 1024,
    }));
    const { data: insertedImages, error: insertError } = await supabase
      .from("neurodesign_generated_images")
      .insert(imageRows)
      .select("id, run_id, project_id, url, thumbnail_url, width, height");

    if (insertError) {
      await supabase
        .from("neurodesign_generation_runs")
        .update({ status: "error", error_message: insertError.message, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar imagens: " + insertError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("neurodesign_generation_runs").update({
      status: "success",
      provider: "google",
      error_message: null,
      provider_response_json: { images: insertedImages },
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    const payload = insertedImages?.length
      ? insertedImages
      : imageRows.map((r) => ({ run_id: run.id, project_id: projectId, url: r.url, thumbnail_url: r.url, width: 1024, height: 1024 }));
    return new Response(JSON.stringify({ runId: run.id, images: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
