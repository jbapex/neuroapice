import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChevronLeft, Loader2, Sparkles, Star, Copy, Link2, Eye, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import EditWithAiModal from '@/components/strategic-planner/EditWithAiModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';


const ModuleChat = () => {
  const { moduleId } = useParams();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, hasPermission } = useAuth();
  const [module, setModule] = useState(null);
  const [clients, setClients] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [filteredCampaigns, setFilteredCampaigns] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [complementaryText, setComplementaryText] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [lastOutput, setLastOutput] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingModule, setIsLoadingModule] = useState(true);
  const [suggestedModules, setSuggestedModules] = useState([]);
  const [previousOutputs, setPreviousOutputs] = useState([]);
  const [selectedPreviousOutput, setSelectedPreviousOutput] = useState(null);
  const [isViewContentDialogOpen, setIsViewContentDialogOpen] = useState(false);
  const [contentToView, setContentToView] = useState('');
  // IA: conexões do usuário (Minha IA)
  const [userLlmConnections, setUserLlmConnections] = useState([]);
  // IA: integração global do módulo (detalhes)
  const [moduleGlobalIa, setModuleGlobalIa] = useState(null);
  // IA: seleção explícita pelo usuário na tela
  const [selectedIaKey, setSelectedIaKey] = useState(''); // formato: user:<id> | global:<id>

  const fetchModuleDetails = useCallback(async () => {
    if (!moduleId || isNaN(parseInt(moduleId))) return;
    
    setIsLoadingModule(true);

    const isAllowed = hasPermission('module_access', parseInt(moduleId));

    if (!isAllowed) {
        toast({ title: "Acesso Negado", description: "Este módulo não está incluído no seu plano.", variant: "destructive" });
        navigate('/ferramentas/gerador-de-conteudo');
        setIsLoadingModule(false);
        return;
    }

    const { data: moduleData, error } = await supabase
      .from('modules')
      .select('*, suggestions:module_suggestions!source_module_id(suggested_module_id, source_module:modules!suggested_module_id(id, name))')
      .eq('id', moduleId)
      .single();

    if (error || !moduleData) {
      toast({ title: 'Erro ao carregar módulo', description: error?.message || "Módulo não encontrado.", variant: 'destructive' });
      setModule(null);
      navigate("/ferramentas/gerador-de-conteudo");
    } else {
      const defaultConfig = { use_client: false, use_campaign: true, use_complementary_text: true };
      setModule({ ...moduleData, config: moduleData.config ? moduleData.config : defaultConfig });
      
      const suggested = moduleData.suggestions?.map(s => s.source_module).filter(Boolean) || [];
      setSuggestedModules(suggested);
    }
    
    setIsLoadingModule(false);
  }, [moduleId, toast, hasPermission, navigate]);

  const fetchClients = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('clients').select('id, name').eq('user_id', user.id).order('name');
    if (error) {
      toast({ title: 'Erro ao buscar clientes', description: error.message, variant: 'destructive' });
    } else {
      setClients(data || []);
    }
  }, [toast, user]);

  const fetchCampaigns = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('campaigns').select('id, name, client_id').eq('user_id', user.id).order('name');
    if (error) {
      toast({ title: 'Erro ao buscar campanhas', description: error.message, variant: 'destructive' });
    } else {
      setCampaigns(data || []);
      setFilteredCampaigns(data || []);
    }
  }, [toast, user]);
  
  const fetchPreviousOutputs = useCallback(async (sourceModuleId, campaignId) => {
    if (!sourceModuleId || !user) return;

    let query = supabase
      .from('agent_outputs')
      .select('id, generated_text, created_at')
      .eq('module_id', sourceModuleId)
      .eq('user_id', user.id);
    
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(10);
    
    if (error) {
      toast({ title: 'Erro ao buscar conteúdos anteriores', variant: 'destructive'});
    } else {
      setPreviousOutputs(data || []);
    }
  }, [toast, user]);

  useEffect(() => {
    if (!authLoading && profile) {
      fetchModuleDetails();
    }
  }, [authLoading, profile, fetchModuleDetails]);
  
  // Buscar IA pessoais do usuário (text_generation ativas)
  useEffect(() => {
    const fetchUserIas = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('user_ai_connections')
        .select('id, name, capabilities, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (!error && data) {
        const textGen = data.filter(c => c.capabilities?.text_generation === true);
        setUserLlmConnections(textGen);
      }
    };
    fetchUserIas();
  }, [user]);

  // Buscar detalhes da IA global do módulo (nome/modelo) quando houver id
  useEffect(() => {
    const fetchModuleIa = async () => {
      if (!module?.llm_integration_id) { setModuleGlobalIa(null); return; }
      const { data, error } = await supabase
        .from('llm_integrations')
        .select('id, name, default_model')
        .eq('id', module.llm_integration_id)
        .single();
      if (!error) setModuleGlobalIa(data);
    };
    fetchModuleIa();
  }, [module?.llm_integration_id]);
  
  useEffect(() => {
    if (module?.config?.use_client) fetchClients();
    if (module?.config?.use_campaign) fetchCampaigns();
  }, [module, fetchClients, fetchCampaigns]);

  useEffect(() => {
    if (suggestedModules.length > 0 && module.config.use_campaign) {
      if (selectedCampaign) {
         fetchPreviousOutputs(suggestedModules[0].id, selectedCampaign.id);
      } else {
         setPreviousOutputs([]);
      }
    }
  }, [selectedCampaign, suggestedModules, module, fetchPreviousOutputs]);

  const handleSelectClient = async (clientId) => {
    const client = clients.find(c => c.id === parseInt(clientId));
    setSelectedClient(client || null);
    setSelectedCampaign(null);
    if (client) {
      setFilteredCampaigns(campaigns.filter(c => c.client_id === client.id));
    } else {
      setFilteredCampaigns(campaigns);
    }
  };

  const handleSelectCampaign = async (campaignId) => {
    const campaign = campaigns.find(c => c.id === parseInt(campaignId));
    if (campaign) {
      const { data, error } = await supabase.from('campaigns').select('*, clients(*)').eq('id', campaign.id).single();
      if (error) {
        toast({ title: 'Erro ao carregar detalhes da campanha', variant: 'destructive' });
        setSelectedCampaign(null);
      } else {
        setSelectedCampaign(data);
        if (data.clients) {
          setSelectedClient(data.clients);
        }
      }
    } else {
      setSelectedCampaign(null);
    }
  };

  const isGenerateButtonDisabled = () => {
    if (isLoading) return true;
    const { use_client, use_campaign } = module?.config || {};
    if (use_client && use_campaign) {
        // Quando ambos são exigidos, ambos devem estar preenchidos
        return !selectedClient || !selectedCampaign;
    }
    if (use_client && !selectedClient) return true;
    if (use_campaign && !selectedCampaign) return true;
    return false;
  };

  const handleGenerateContent = async (refinementPrompt = '') => {
    const isRefining = !!refinementPrompt;
    if (!isRefining && isGenerateButtonDisabled()) {
        toast({ title: "Faltam informações", description: "Por favor, preencha todos os campos necessários.", variant: "destructive" });
        return;
    }
    if (isRefining && !generatedContent) {
        toast({ title: "Nenhum conteúdo para refinar", description: "Gere um conteúdo primeiro antes de usar 'Editar com IA'.", variant: "destructive" });
        return;
    }

    setIsLoading(true);
    if (!isRefining) {
        setGeneratedContent('');
        setLastOutput(null);
    }

    let finalUserText = isRefining ? `--- CONTEÚDO BASE PARA REFINAR ---\n${generatedContent}\n\n--- INSTRUÇÕES DE REFINAMENTO ---\n${refinementPrompt}` : complementaryText;

    if (selectedPreviousOutput && !isRefining) {
        finalUserText = `--- CONTEÚDO BASE SELECIONADO ---\n${selectedPreviousOutput.generated_text}\n\n--- INSTRUÇÕES ADICIONAIS ---\n${complementaryText}`;
    }

    try {
        // Seleção de IA: prioriza Minha IA (ativa para text_generation). Fallback: IA global do módulo
        const activeUserIa = userLlmConnections.find(c => c.is_active) || userLlmConnections[0];
        const preferUserAi = module?.config?.prefer_user_ai === true;
        let isUserConnection = false;
        let llmIntegrationId = null;

        // 1) Se o usuário escolheu explicitamente uma IA no seletor, respeitar
        if (selectedIaKey) {
          const [kind, rawId] = selectedIaKey.split(':');
          isUserConnection = kind === 'user';
          llmIntegrationId = parseInt(rawId);
        } else {
          // 2) Caso contrário, aplicar a prioridade configurada
          if (preferUserAi) {
            if (activeUserIa) {
              isUserConnection = true;
              llmIntegrationId = activeUserIa.id;
            } else {
              llmIntegrationId = module?.llm_integration_id || null;
            }
          } else {
            if (module?.llm_integration_id) {
              llmIntegrationId = module.llm_integration_id;
            } else if (activeUserIa) {
              isUserConnection = true;
              llmIntegrationId = activeUserIa.id;
            }
          }
        }

        if (!llmIntegrationId) {
          setIsLoading(false);
          toast({ title: 'Nenhuma IA configurada', description: 'Configure uma IA em Minha IA ou defina uma IA para o módulo.', variant: 'destructive' });
          return;
        }

        let generatedText = '';
        let outputId = null;

        // Se temos uma IA determinada (seletor ou prioridade), tentar generic-ai-chat primeiro
        if (llmIntegrationId) {
          try {
            const contextLines = [];
            if (module?.name) contextLines.push(`Módulo: ${module.name}`);
            if (selectedClient?.name) contextLines.push(`Cliente: ${selectedClient.name}`);
            if (selectedCampaign?.name) contextLines.push(`Campanha: ${selectedCampaign.name}`);
            const contextHeader = contextLines.length ? `[CONTEXTO]\n${contextLines.join('\n')}\n\n` : '';

            const messages = [];
            if (module?.base_prompt) {
              messages.push({ role: 'system', content: module.base_prompt });
            }
            messages.push({ role: 'user', content: `${contextHeader}${finalUserText || 'Gerar conteúdo para o módulo selecionado.'}` });

            const { data: chatData, error: chatError } = await supabase.functions.invoke('generic-ai-chat', {
              body: JSON.stringify({
                session_id: null, // Não salvar sessão - conteúdo de módulos não deve aparecer no Chat IA
                messages,
                llm_integration_id: llmIntegrationId,
                is_user_connection: isUserConnection,
                context: 'module_generation', // Identificar contexto
              })
            });

            if (chatError) throw chatError;
            generatedText = chatData?.response || '';

            // Persistir saída para manter histórico, se possível
            if (generatedText) {
              const { data: insertData, error: insertError } = await supabase
                .from('agent_outputs')
                .insert([{
                  user_id: user.id,
                  module_id: parseInt(moduleId),
                  campaign_id: selectedCampaign?.id || null,
                  generated_text: generatedText,
                  is_favorited: false,
                }])
                .select('id')
                .single();
              if (!insertError) outputId = insertData.id;
            }

            setGeneratedContent(generatedText);
            setLastOutput({ id: outputId, is_favorited: false });
            toast({ title: `Conteúdo ${isRefining ? 'refinado' : 'gerado'} com sucesso!` });
            return;
          } catch (primaryErr) {
            // Falhou no generic-ai-chat (ex.: função não disponível): cair para generate-content
          }
        }

        // Fallback: usar função generate-content (comportamento antigo)
        {
          const { data, error } = await supabase.functions.invoke('generate-content', {
              body: JSON.stringify({
                  module_id: moduleId,
                  client_id: selectedClient?.id || null,
                  campaign_data: selectedCampaign,
                  user_text: finalUserText,
              }),
          });
          if (error) {
              const errorBody = await (error.context?.json ? error.context.json() : Promise.resolve({ error: error.message }));
              throw new Error(errorBody.error || error.message);
          }
          setGeneratedContent(data.generatedText);
          setLastOutput({ id: data.outputId, is_favorited: false });
          toast({ title: `Conteúdo ${isRefining ? 'refinado' : 'gerado'} com sucesso!` });
        }
    } catch (error) {
        setGeneratedContent(`Ocorreu um erro ao gerar o conteúdo: ${error.message}`);
        toast({ title: "Erro na Geração", description: error.message, variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
};

  const toggleFavorite = async () => {
    if (!lastOutput) return;
    const newFavoriteStatus = !lastOutput.is_favorited;
    const { error } = await supabase.from('agent_outputs').update({ is_favorited: newFavoriteStatus }).eq('id', lastOutput.id);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível atualizar o favorito.", variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: `Item ${newFavoriteStatus ? 'favoritado' : 'desfavoritado'}.` });
      setLastOutput(prev => ({ ...prev, is_favorited: newFavoriteStatus }));
    }
  };

  const copyToClipboard = () => {
    if (!generatedContent) return;
    navigator.clipboard.writeText(generatedContent);
    toast({ title: "Copiado!", description: "O conteúdo foi copiado para a área de transferência." });
  };

  const handleViewPreviousContent = () => {
    if (selectedPreviousOutput) {
      setContentToView(selectedPreviousOutput.generated_text);
      setIsViewContentDialogOpen(true);
    }
  };

  if (authLoading || isLoadingModule) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-16 h-16 animate-spin text-primary" /></div>;
  }
  if (!module) {
    return <div className="text-center p-8">
        <h2 className="text-2xl font-bold">Módulo não encontrado</h2>
        <p className="text-muted-foreground">O módulo que você está tentando acessar não existe ou não está disponível para você.</p>
        <Button asChild className="mt-4"><Link to="/ferramentas/gerador-de-conteudo">Voltar para a lista de Agentes</Link></Button>
      </div>;
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)] bg-background text-foreground">
      <header className="flex items-center p-4 border-b">
        <Button asChild variant="ghost" size="icon" className="mr-4">
          <Link to="/ferramentas/gerador-de-conteudo"><ChevronLeft className="w-5 h-5" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">{module.name}</h1>
          <p className="text-sm text-muted-foreground">{module.description}</p>
        </div>
      </header>

      <div className="flex-1 grid md:grid-cols-2 gap-8 p-8 overflow-y-auto">
        <motion.div initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Configuração do Conteúdo</CardTitle>
              <CardDescription>Preencha os campos para guiar a IA.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleGenerateContent(); }} className="space-y-6">
                {/* Seletor de IA (comportamento, sem alterar o layout geral) */}
                <div className="space-y-2">
                  <Label>Conexão de IA</Label>
                  <Select value={selectedIaKey} onValueChange={setSelectedIaKey}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione uma IA (opcional)..." /></SelectTrigger>
                    <SelectContent>
                      {userLlmConnections.length > 0 && userLlmConnections.map(conn => (
                        <SelectItem key={`user-${conn.id}`} value={`user:${conn.id}`}>{conn.name} • Minha IA</SelectItem>
                      ))}
                      {moduleGlobalIa && (
                        <SelectItem key={`global-${moduleGlobalIa.id}`} value={`global:${moduleGlobalIa.id}`}>{moduleGlobalIa.name} ({moduleGlobalIa.default_model}) • Global</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {module.config?.use_client && <div className="space-y-2">
                  <Label htmlFor="client-select">Cliente</Label>
                  <Select onValueChange={handleSelectClient} value={selectedClient?.id?.toString() || ''} disabled={!clients.length}>
                    <SelectTrigger id="client-select" className="w-full"><SelectValue placeholder="Selecione um cliente..." /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>}
                
                {module.config?.use_campaign && <div className="space-y-2">
                  <Label htmlFor="campaign-select">Campanha</Label>
                  <Select onValueChange={handleSelectCampaign} value={selectedCampaign?.id?.toString() || ''} disabled={!filteredCampaigns.length}>
                    <SelectTrigger id="campaign-select" className="w-full"><SelectValue placeholder="Selecione uma campanha..." /></SelectTrigger>
                    <SelectContent>{filteredCampaigns.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>}

                {suggestedModules.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Conteúdo de Agentes Anteriores</Label>
                    <div className="flex items-center space-x-2">
                      <Select onValueChange={(value) => setSelectedPreviousOutput(previousOutputs.find(o => o.id === parseInt(value)) || null)} disabled={!previousOutputs.length}>
                        <SelectTrigger><SelectValue placeholder="Selecione um conteúdo base..." /></SelectTrigger>
                        <SelectContent>
                          {previousOutputs.map(output => (
                            <SelectItem key={output.id} value={String(output.id)}>
                              {output.generated_text.substring(0, 50)}... ({new Date(output.created_at).toLocaleString()})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleViewPreviousContent}
                        disabled={!selectedPreviousOutput}
                        title="Ver conteúdo completo"
                      >
                        <Eye className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                )}
                
                {module.config?.use_complementary_text && <div className="space-y-2">
                  <Label htmlFor="complementary-text">Informações para a IA</Label>
                  <Textarea id="complementary-text" value={complementaryText} onChange={e => setComplementaryText(e.target.value)} placeholder="Adicione qualquer informação extra para a IA..." className="min-h-[150px]" />
                </div>}
                
                <Button type="submit" className="w-full" disabled={isGenerateButtonDisabled()}>
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Gerar Conteúdo
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Resultado Gerado</CardTitle>
              <CardDescription>Aqui está o conteúdo criado pela IA.</CardDescription>
            </CardHeader>
            <CardContent className="relative h-full flex flex-col">
              {isLoading && <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10 rounded-md">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Gerando conteúdo...</p>
              </div>}
              <div className="prose prose-sm dark:prose-invert max-w-none flex-grow overflow-y-auto p-4 rounded-md bg-muted min-h-[300px] whitespace-pre-wrap">
                {generatedContent || <span className="text-muted-foreground">O resultado aparecerá aqui.</span>}
              </div>
              {generatedContent && !isLoading && (
                <div className="flex items-center gap-2 mt-4">
                  <EditWithAiModal
                    onGenerate={handleGenerateContent}
                    isLoading={isLoading}
                    title={`Refinar ${module.name}`}
                    disabled={!generatedContent || isLoading}
                  />
                  <Button size="sm" variant="outline" onClick={toggleFavorite} disabled={!lastOutput}>
                    <Star className={`w-4 h-4 mr-2 ${lastOutput?.is_favorited ? 'text-yellow-400 fill-current' : ''}`} />
                    {lastOutput?.is_favorited ? 'Favoritado' : 'Desfavoritar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyToClipboard}>
                    <Copy className="w-4 h-4 mr-2" /> Copiar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Dialog open={isViewContentDialogOpen} onOpenChange={setIsViewContentDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto bg-card text-card-foreground">
          <DialogHeader>
            <DialogTitle>Conteúdo do Agente Anterior</DialogTitle>
            <DialogDescription>
              Visualize o conteúdo completo do item selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-md bg-muted whitespace-pre-wrap">
            {contentToView}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ModuleChat;