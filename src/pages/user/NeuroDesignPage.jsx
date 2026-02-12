import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import NeuroDesignSidebar from '@/components/neurodesign/NeuroDesignSidebar';
import BuilderPanel from '@/components/neurodesign/BuilderPanel';
import PreviewPanel from '@/components/neurodesign/PreviewPanel';
import MasonryGallery from '@/components/neurodesign/MasonryGallery';
import NeuroDesignErrorBoundary from '@/components/neurodesign/NeuroDesignErrorBoundary';

const NeuroDesignPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState('explore');
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [runs, setRuns] = useState([]);
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const generatingRef = useRef(false);
  const refiningRef = useRef(false);
  const [imageConnections, setImageConnections] = useState([]);
  const [llmConnections, setLlmConnections] = useState([]);
  const [selectedLlmId, setSelectedLlmId] = useState(null);
  const [isFillingFromPrompt, setIsFillingFromPrompt] = useState(false);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('neurodesign_projects')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) {
        toast({ title: 'Erro ao carregar projetos', description: error.message, variant: 'destructive' });
        setProjects([]);
        return;
      }
      setProjects(data || []);
    } catch (e) {
      toast({ title: 'Erro ao carregar projetos', description: e?.message || 'Tabela pode não existir. Execute o SQL do NeuroDesign no Supabase.', variant: 'destructive' });
      setProjects([]);
    }
  }, [user, toast]);

  const fetchImageConnections = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_ai_connections')
        .select('id, name, provider, default_model, capabilities')
        .eq('user_id', user.id);
      if (error) return;
      setImageConnections((data || []).filter((c) => c.capabilities?.image_generation));
    } catch (_e) {
      setImageConnections([]);
    }
  }, [user]);

  const fetchLlmConnections = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('user_ai_connections')
        .select('id, name, provider, default_model, capabilities, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (error) return;
      const list = (data || []).filter((c) => c.capabilities?.text_generation === true);
      setLlmConnections(list);
      setSelectedLlmId((prev) => (list.length > 0 && (!prev || !list.some((c) => c.id === prev)) ? list[0].id : prev));
    } catch (_e) {
      setLlmConnections([]);
    }
  }, [user]);

  const fetchRuns = useCallback(async (projectId) => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from('neurodesign_generation_runs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) return;
    setRuns(data || []);
  }, []);

  const fetchImages = useCallback(async (projectId) => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from('neurodesign_generated_images')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar galeria', description: error.message, variant: 'destructive' });
      return;
    }
    setImages(data || []);
  }, [toast]);

  useEffect(() => {
    fetchProjects();
    fetchImageConnections();
    fetchLlmConnections();
  }, [fetchProjects, fetchImageConnections, fetchLlmConnections]);

  useEffect(() => {
    if (selectedProject) {
      setCurrentConfig(null);
      setSelectedImage(null);
      fetchRuns(selectedProject.id);
      fetchImages(selectedProject.id);
    } else {
      setRuns([]);
      setImages([]);
      setCurrentConfig(null);
      setSelectedImage(null);
    }
  }, [selectedProject, fetchRuns, fetchImages]);

  const handleGenerate = async (config) => {
    if (generatingRef.current) return;
    if (!selectedProject) {
      toast({ title: 'Selecione um projeto', variant: 'destructive' });
      return;
    }
    generatingRef.current = true;
    setIsGenerating(true);
    try {
      const conn = imageConnections.find((c) => c.id === config?.user_ai_connection_id);
      const isGoogle = conn?.provider?.toLowerCase() === 'google';
      const fnName = isGoogle ? 'neurodesign-generate-google' : 'neurodesign-generate';
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: {
          projectId: selectedProject.id,
          configId: config?.id || null,
          config,
          userAiConnectionId: config?.user_ai_connection_id || null,
        },
      });
      const errMsg = data?.error || error?.message;
      if (error) throw new Error(errMsg || `Falha ao chamar o servidor de geração. Confira se a Edge Function ${fnName} está publicada no Supabase.`);
      if (data?.error) throw new Error(data.error);
      const newImages = data?.images;
      if (newImages?.length) {
        await fetchRuns(selectedProject.id);
        await fetchImages(selectedProject.id);
        const { data: imgList } = await supabase.from('neurodesign_generated_images').select('*').eq('project_id', selectedProject.id).order('created_at', { ascending: false });
        if (imgList?.length) {
          setSelectedImage(imgList[0]);
        } else {
          const withIds = newImages.map((img, i) => ({ ...img, id: img.id || `temp-${i}`, run_id: img.run_id || data.runId, project_id: selectedProject.id }));
          setImages((prev) => [...withIds, ...prev]);
          setSelectedImage(withIds[0]);
        }
        toast({ title: 'Imagens geradas com sucesso!' });
      } else {
        toast({ title: 'Geração concluída', description: `Nenhuma imagem retornada. Verifique se a Edge Function ${fnName} está publicada no Supabase.`, variant: 'destructive' });
      }
    } catch (e) {
      const msg = e?.message || 'Erro desconhecido';
      const is429 = /429|quota|rate limit/i.test(msg);
      toast({
        title: 'Erro ao gerar',
        description: is429
          ? 'Limite de uso da API Google (429) atingido. Aguarde alguns minutos ou verifique seu plano e uso em https://ai.google.dev/gemini-api/docs/rate-limits'
          : msg,
        variant: 'destructive',
      });
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleRefine = async (payload) => {
    if (refiningRef.current) return;
    if (!selectedProject || !selectedImage?.id) {
      toast({ title: 'Selecione uma imagem para refinar', variant: 'destructive' });
      return;
    }
    const runId = selectedImage.run_id || runs.find((r) => r.id && images.some((i) => i.run_id === r.id && i.id === selectedImage.id))?.id;
    if (!runId) {
      toast({ title: 'Execução não encontrada', variant: 'destructive' });
      return;
    }
    const instruction = typeof payload === 'string' ? payload : payload?.instruction ?? '';
    const configOverrides = typeof payload === 'object' && payload !== null ? payload.configOverrides : undefined;
    const referenceImageUrl = typeof payload === 'object' && payload !== null ? payload.referenceImageUrl : undefined;
    const replacementImageUrl = typeof payload === 'object' && payload !== null ? payload.replacementImageUrl : undefined;
    const region = typeof payload === 'object' && payload !== null ? payload.region : undefined;
    const regionCropImageUrl = typeof payload === 'object' && payload !== null ? payload.regionCropImageUrl : undefined;

    refiningRef.current = true;
    setIsRefining(true);
    try {
      const body = {
        projectId: selectedProject.id,
        runId,
        imageId: selectedImage.id,
        instruction,
        configOverrides,
        userAiConnectionId: currentConfig?.user_ai_connection_id || null,
      };
      if (referenceImageUrl) body.referenceImageUrl = referenceImageUrl;
      if (replacementImageUrl) body.replacementImageUrl = replacementImageUrl;
      if (region) body.region = region;
      if (regionCropImageUrl) body.regionCropImageUrl = regionCropImageUrl;

      const refineConn = imageConnections.find((c) => c.id === currentConfig?.user_ai_connection_id);
      const isGoogleRefine = refineConn?.provider?.toLowerCase() === 'google';
      const refineFnName = isGoogleRefine ? 'neurodesign-refine-google' : 'neurodesign-refine';
      const { data, error } = await supabase.functions.invoke(refineFnName, {
        body,
      });
      const refineErrMsg = data?.error || error?.message;
      if (error) throw new Error(refineErrMsg || 'Falha ao chamar o servidor de refino.');
      if (data?.error) throw new Error(data.error);
      if (data?.images?.length) {
        await fetchImages(selectedProject.id);
        await fetchRuns(selectedProject.id);
        const { data: imgList } = await supabase.from('neurodesign_generated_images').select('*').eq('project_id', selectedProject.id).order('created_at', { ascending: false });
        if (imgList?.length) setSelectedImage(imgList[0]);
        toast({ title: 'Imagem refinada com sucesso!' });
      }
    } catch (e) {
      const msg = e?.message || 'Erro desconhecido';
      const is429 = /429|quota|rate limit/i.test(msg);
      toast({
        title: 'Erro ao refinar',
        description: is429
          ? 'Limite de uso da API Google (429) atingido. Aguarde alguns minutos ou verifique seu plano em https://ai.google.dev/gemini-api/docs/rate-limits'
          : msg,
        variant: 'destructive',
      });
    } finally {
      refiningRef.current = false;
      setIsRefining(false);
    }
  };

  const NEURODESIGN_FILL_ALLOWED_KEYS = new Set([
    'subject_gender', 'subject_description', 'niche_project', 'environment',
    'shot_type', 'layout_position', 'dimensions', 'text_enabled', 'headline_h1',
    'subheadline_h2', 'cta_button_text', 'text_position', 'text_gradient',
    'visual_attributes', 'ambient_color', 'rim_light_color', 'fill_light_color',
    'floating_elements_enabled', 'floating_elements_text', 'additional_prompt',
  ]);
  const NEURODESIGN_FILL_ENUMS = {
    subject_gender: ['masculino', 'feminino'],
    shot_type: ['close-up', 'medio busto', 'americano'],
    layout_position: ['esquerda', 'centro', 'direita'],
    dimensions: ['1:1', '4:5', '9:16', '16:9'],
    text_position: ['esquerda', 'centro', 'direita'],
  };
  const NEURODESIGN_STYLE_TAGS = ['clássico', 'formal', 'elegante', 'institucional', 'tecnológico', 'minimalista', 'criativo'];

  const handleFillFromPrompt = async (pastedText) => {
    const trimmed = (pastedText || '').trim();
    if (!trimmed) {
      toast({ title: 'Digite ou cole um prompt', variant: 'destructive' });
      return;
    }
    const connId = selectedLlmId || llmConnections[0]?.id;
    if (!connId) {
      toast({ title: 'Nenhuma conexão de IA ativa', description: 'Configure uma conexão de modelo de linguagem em Minha IA.', variant: 'destructive' });
      return;
    }
    const systemPrompt = `Você é um assistente que extrai dados estruturados de briefs criativos para preencher um formulário de geração de imagem (NeuroDesign).
Responda APENAS com um único objeto JSON válido, sem markdown, sem texto antes ou depois. Use apenas as chaves que conseguir inferir do texto; omita as que não fizerem sentido.
Regras:
- subject_gender: "masculino" ou "feminino"
- subject_description: string (descrição do sujeito/pose/roupa)
- niche_project: string (nicho ou contexto do projeto)
- environment: string (ambiente/cenário)
- shot_type: exatamente um de "close-up", "medio busto", "americano"
- layout_position: exatamente um de "esquerda", "centro", "direita"
- dimensions: exatamente um de "1:1", "4:5", "9:16", "16:9"
- text_enabled: boolean. Se true, preencha headline_h1, subheadline_h2, cta_button_text quando aplicável
- text_position: "esquerda", "centro" ou "direita"
- visual_attributes: objeto opcional com style_tags (array com valores entre: clássico, formal, elegante, institucional, tecnológico, minimalista, criativo), sobriety (0-100), ultra_realistic (boolean), blur_enabled (boolean), lateral_gradient_enabled (boolean)
- additional_prompt: string com instruções extras
- ambient_color, rim_light_color, fill_light_color: strings (hex ou descrição)
- floating_elements_enabled: boolean, floating_elements_text: string`;

    setIsFillingFromPrompt(true);
    try {
      const { data, error } = await supabase.functions.invoke('generic-ai-chat', {
        body: JSON.stringify({
          session_id: null,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Preencha os campos do NeuroDesign com base no seguinte brief/prompt:\n\n${trimmed}` },
          ],
          llm_integration_id: connId,
          is_user_connection: true,
          context: 'neurodesign_fill',
        }),
      });
      if (error) throw new Error(error.message || error);
      if (data?.error) throw new Error(data.error);
      const raw = data?.response || data?.content || '';
      let parsed = null;
      try {
        parsed = JSON.parse(raw.trim());
      } catch (_e) {
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const str = jsonMatch[1] || jsonMatch[0];
          parsed = JSON.parse(str.trim());
        }
        if (!parsed) throw new Error('Resposta da IA não contém JSON válido.');
      }
      const sanitized = {};
      for (const key of Object.keys(parsed)) {
        if (!NEURODESIGN_FILL_ALLOWED_KEYS.has(key)) continue;
        let value = parsed[key];
        if (NEURODESIGN_FILL_ENUMS[key] && typeof value === 'string') {
          const v = value.trim().toLowerCase();
          if (NEURODESIGN_FILL_ENUMS[key].includes(v)) sanitized[key] = v;
        } else if (key === 'visual_attributes' && value && typeof value === 'object') {
          const prev = currentConfig?.visual_attributes || {};
          const next = { ...prev };
          if (Array.isArray(value.style_tags)) {
            next.style_tags = value.style_tags.filter((t) => NEURODESIGN_STYLE_TAGS.includes(String(t).toLowerCase()));
          }
          if (typeof value.sobriety === 'number' && value.sobriety >= 0 && value.sobriety <= 100) next.sobriety = value.sobriety;
          if (typeof value.ultra_realistic === 'boolean') next.ultra_realistic = value.ultra_realistic;
          if (typeof value.blur_enabled === 'boolean') next.blur_enabled = value.blur_enabled;
          if (typeof value.lateral_gradient_enabled === 'boolean') next.lateral_gradient_enabled = value.lateral_gradient_enabled;
          sanitized[key] = next;
        } else if (key === 'text_enabled' || key === 'text_gradient' || key === 'floating_elements_enabled') {
          sanitized[key] = Boolean(value);
        } else if (typeof value === 'string' || typeof value === 'number') {
          sanitized[key] = value;
        }
      }
      setCurrentConfig((prev) => {
        const base = prev || {};
        const merged = { ...base };
        for (const key of Object.keys(sanitized)) {
          if (key === 'visual_attributes') merged.visual_attributes = { ...(base.visual_attributes || {}), ...sanitized.visual_attributes };
          else merged[key] = sanitized[key];
        }
        return merged;
      });
      toast({ title: 'Campos preenchidos com sucesso!' });
    } catch (e) {
      toast({ title: 'Erro ao preencher campos', description: e?.message || 'Não foi possível extrair os campos.', variant: 'destructive' });
    } finally {
      setIsFillingFromPrompt(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>NeuroDesign - Neuro Ápice</title>
        <meta name="description" content="Design Builder premium: crie imagens com controle total de composição." />
      </Helmet>
      <NeuroDesignErrorBoundary>
      <div className="flex h-[calc(100vh-4rem)] min-h-[400px] bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 text-white overflow-hidden">
        <NeuroDesignSidebar
          view={view}
          setView={setView}
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          onRefreshProjects={fetchProjects}
        />
        <main className="flex-1 flex overflow-hidden">
          {view === 'create' && (
            <div className="flex flex-1 min-w-0">
              <div className="w-[400px] shrink-0 overflow-y-auto border-r border-white/10">
                <BuilderPanel
                  project={selectedProject}
                  config={currentConfig}
                  setConfig={setCurrentConfig}
                  imageConnections={imageConnections}
                  onGenerate={handleGenerate}
                  isGenerating={isGenerating}
                  onFillFromPrompt={handleFillFromPrompt}
                  hasLlmConnection={llmConnections.length > 0}
                  isFillingFromPrompt={isFillingFromPrompt}
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <PreviewPanel
                  project={selectedProject}
                  user={user}
                  selectedImage={selectedImage}
                  images={images}
                  isGenerating={isGenerating}
                  isRefining={isRefining}
                  onRefine={handleRefine}
                  onDownload={(url) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `neurodesign-${Date.now()}.png`;
                    a.click();
                  }}
                />
              </div>
            </div>
          )}
          {view === 'gallery' && (
            <div className="flex-1 overflow-y-auto p-6">
              <MasonryGallery
                images={images}
                projectId={selectedProject?.id}
                selectedIds={selectedImage ? [selectedImage.id] : []}
                onSelectImage={setSelectedImage}
                onDownload={(url) => {
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `neurodesign-${Date.now()}.png`;
                  a.click();
                }}
              />
            </div>
          )}
          {view === 'explore' && (
            <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center text-muted-foreground">
              <p>Selecione um projeto na barra lateral ou crie um novo e use &quot;Criar&quot; para começar.</p>
            </div>
          )}
        </main>
      </div>
      </NeuroDesignErrorBoundary>
    </>
  );
};

export default NeuroDesignPage;
