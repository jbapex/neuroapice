import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Conn = { id: number; user_id: string; provider: string; api_key: string; api_url: string; default_model: string | null };

async function imageUrlToBase64(imageUrl: string): Promise<{ data: string; mimeType: string } | null> {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { data: match[2], mimeType: match[1].trim() || "image/png" };
  }
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

async function refineWithGoogleGemini(conn: Conn, imageUrls: string[], textPrompt: string): Promise<{ url: string } | null> {
  const baseUrl = conn.api_url.replace(/\/$/, "");
  const model = conn.default_model || "gemini-2.5-flash-image";
  const apiUrl = `${baseUrl}/models/${model}:generateContent`;
  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
  for (const imageUrl of imageUrls) {
    const img = await imageUrlToBase64(imageUrl);
    if (!img) return null;
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  parts.push({ text: textPrompt });
  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": conn.api_key },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
  };
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) return null;
  const mime = part.inlineData.mimeType || "image/png";
  return { url: `data:${mime};base64,${part.inlineData.data}` };
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
    const {
      projectId,
      runId,
      imageId,
      instruction,
      configOverrides,
      userAiConnectionId,
      referenceImageUrl,
      replacementImageUrl,
      region,
      regionCropImageUrl,
    } = body as {
      projectId: string;
      runId: string;
      imageId: string;
      instruction: string;
      configOverrides?: Record<string, unknown>;
      userAiConnectionId?: string;
      referenceImageUrl?: string;
      replacementImageUrl?: string;
      region?: { x: number; y: number; width: number; height: number };
      regionCropImageUrl?: string;
    };

    if (!projectId || !runId || !imageId || !instruction?.trim()) {
      return new Response(JSON.stringify({ error: "projectId, runId, imageId e instruction são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!userAiConnectionId) {
      return new Response(JSON.stringify({ error: "Conexão de imagem (Google) é obrigatória" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: project, error: projectError } = await supabase.from("neurodesign_projects").select("id, owner_user_id").eq("id", projectId).single();
    if (projectError || !project || project.owner_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Projeto não encontrado ou acesso negado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: sourceImage, error: imgError } = await supabase
      .from("neurodesign_generated_images")
      .select("id, url, thumbnail_url, project_id")
      .eq("id", imageId)
      .eq("project_id", projectId)
      .single();
    if (imgError || !sourceImage?.url) {
      return new Response(JSON.stringify({ error: "Imagem não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: existingRun } = await supabase.from("neurodesign_generation_runs").select("id, config_id").eq("id", runId).eq("project_id", projectId).single();
    if (!existingRun) {
      return new Response(JSON.stringify({ error: "Execução não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: conn, error: connError } = await supabase
      .from("user_ai_connections")
      .select("id, user_id, provider, api_key, api_url, default_model")
      .eq("id", userAiConnectionId)
      .single();

    if (connError || !conn || conn.user_id !== user.id || !conn.api_key) {
      return new Response(JSON.stringify({ error: "Conexão de imagem não encontrada ou inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const runInsert = {
      project_id: projectId,
      config_id: existingRun.config_id,
      type: "refine",
      status: "running",
      provider: "google",
      parent_run_id: runId,
      refine_instruction: instruction.trim(),
      provider_request_json: {
        instruction: instruction.trim(),
        configOverrides,
        referenceImageUrl: referenceImageUrl ?? null,
        replacementImageUrl: replacementImageUrl ?? null,
        region: region ?? null,
        regionCropImageUrl: regionCropImageUrl ?? null,
      },
    };
    const { data: run, error: runError } = await supabase.from("neurodesign_generation_runs").insert(runInsert).select("id").single();
    if (runError || !run) {
      return new Response(JSON.stringify({ error: runError?.message || "Erro ao criar run de refino" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sourceImageUrl = sourceImage.url || sourceImage.thumbnail_url;
    const imageUrls: string[] = [sourceImageUrl];
    let textPrompt: string;

    if (referenceImageUrl && !replacementImageUrl) {
      imageUrls.push(referenceImageUrl);
      textPrompt = `Apply the visual style of the second image (reference art) to the first image. Keep the same composition and subject of the first image, but make it look similar to the reference. Additional instruction: ${instruction.trim()}`;
    } else if (replacementImageUrl) {
      if (regionCropImageUrl) {
        imageUrls.push(regionCropImageUrl, replacementImageUrl);
        textPrompt = `In the first image, replace the region that corresponds to the content shown in the second image (the selected crop) with the content of the third image. Keep the rest of the first image unchanged. ${instruction.trim()}`;
      } else {
        imageUrls.push(replacementImageUrl);
        textPrompt = `In the first image, replace the element or area described in the following instruction with the content of the second image. Keep the rest unchanged. Instruction: ${instruction.trim()}`;
      }
    } else {
      textPrompt = `Apply this change to the image, keep the rest the same: ${instruction.trim()}`;
    }

    let refinedUrl: string | null = null;
    try {
      const result = await refineWithGoogleGemini(conn as Conn, imageUrls, textPrompt);
      if (result) refinedUrl = result.url;
    } catch (apiErr) {
      await supabase
        .from("neurodesign_generation_runs")
        .update({ error_message: String(apiErr), completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return new Response(JSON.stringify({ error: String(apiErr) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!refinedUrl) {
      await supabase
        .from("neurodesign_generation_runs")
        .update({ status: "error", error_message: "Refino não retornou imagem", completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return new Response(JSON.stringify({ error: "Refino não retornou imagem da API Google" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const imageRow = {
      run_id: run.id,
      project_id: projectId,
      url: refinedUrl,
      thumbnail_url: refinedUrl,
      width: 1024,
      height: 1024,
    };
    const { data: insertedImages, error: insertError } = await supabase.from("neurodesign_generated_images").insert([imageRow]).select("id, url, thumbnail_url, width, height");
    if (insertError) {
      await supabase
        .from("neurodesign_generation_runs")
        .update({ status: "error", error_message: insertError.message, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await supabase.from("neurodesign_generation_runs").update({
      status: "success",
      provider: "google",
      error_message: null,
      provider_response_json: { images: insertedImages },
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    return new Response(JSON.stringify({ runId: run.id, images: insertedImages || [imageRow] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
