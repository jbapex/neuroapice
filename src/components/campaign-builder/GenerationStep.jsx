import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Bot, Wand2, Sparkles, Facebook, CheckCircle, ChevronLeft, Star, Clipboard, Check, Edit, Save, X, Trash2, Lock, ChevronsUpDown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const GenerationStep = ({ campaignData, updateExecutionCount }) => {
  const { toast } = useToast();
  const { hasPermission, user } = useAuth();
  const [allAgents, setAllAgents] = useState({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('');
  const [selectedAgent, setSelectedAgent] = useState(null);
  
  const [outputs, setOutputs] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editText, setEditText] = useState('');
  const [llmIntegrations, setLlmIntegrations] = useState([]);
  const [selectedLlmId, setSelectedLlmId] = useState(null);
  const [isAiSelectorOpen, setIsAiSelectorOpen] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const all = [];

      if (hasPermission('ads')) {
        const { data: adsAgentsData, error: adsAgentsError } = await supabase.from('ads_agents').select('*');
        if (adsAgentsError) throw adsAgentsError;
        if (adsAgentsData) {
          const permittedAdsAgents = adsAgentsData
            .filter(agent => hasPermission('ads_agent_access', agent.id))
            .map(agent => ({
              ...agent,
              agent_group: 'Especialistas de Anúncios',
              type: 'ads_agent',
              icon: agent.platform === 'meta_ads' ? Facebook : Wand2,
            }));
          all.push(...permittedAdsAgents);
        }
      }

      const { data: modulesData, error: modulesError } = await supabase.from('modules').select('*');
      if (modulesError) throw modulesError;

      if (modulesData) {
        const permittedModules = modulesData
          .filter(module => module.name !== 'Criador de Sites' && module.name !== 'Analisador de Campanhas')
          .filter(module => hasPermission('module_access', module.id))
          .map(module => ({
            ...module,
            id: `module-${module.id}`,
            agent_group: 'Especialistas de Conteúdo',
            type: 'module',
            icon: Bot,
          }));
        all.push(...permittedModules);
      }
      
      const groupedAgents = all.reduce((acc, agent) => {
        const group = agent.agent_group;
        if (!acc[group]) acc[group] = [];
        acc[group].push(agent);
        return acc;
      }, {});
      
      setAllAgents(groupedAgents);
      if (Object.keys(groupedAgents).length > 0 && !activeTab) {
        setActiveTab(Object.keys(groupedAgents)[0]);
      }

    } catch (error) {
      toast({ title: "Erro ao buscar agentes", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, hasPermission, activeTab]);

  const fetchOutputs = useCallback(async () => {
    if (!campaignData.id) return;
    try {
      const [adsOutputsRes, genericOutputsRes] = await Promise.all([
        supabase.from('ads_agent_outputs').select('id, created_at, generated_text, is_favorited, ads_agent_id').eq('campaign_id', campaignData.id),
        supabase.from('agent_outputs').select('id, created_at, generated_text, is_favorited, module_id').eq('campaign_id', campaignData.id)
      ]);
      if (adsOutputsRes.error) throw adsOutputsRes.error;
      if (genericOutputsRes.error) throw genericOutputsRes.error;

      const combinedOutputs = [
        ...(adsOutputsRes.data || []).map(o => ({ ...o, agentId: o.ads_agent_id, type: 'ads_agent_outputs' })),
        ...(genericOutputsRes.data || []).map(o => ({ ...o, agentId: `module-${o.module_id}`, type: 'agent_outputs' }))
      ];
      
      const grouped = combinedOutputs.reduce((acc, output) => {
        const agentId = output.agentId;
        if (!acc[agentId]) acc[agentId] = [];
        acc[agentId].push(output);
        return acc;
      }, {});
      setOutputs(grouped);
    } catch (error) {
       toast({ title: "Erro ao buscar conteúdo gerado", description: error.message, variant: "destructive" });
    }
  }, [campaignData.id, toast]);

  // Buscar integrações de IA (prioriza Minha IA)
  const fetchIntegrations = useCallback(async () => {
    if (!user) return;
    try {
      // Conexões pessoais ativas com text_generation
      let personal = [];
      const { data: userData, error: userError } = await supabase
        .from('user_ai_connections')
        .select('id, name, provider, default_model, capabilities, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (!userError && userData) {
        personal = userData
          .filter(c => c.capabilities?.text_generation === true)
          .map(c => ({ ...c, is_user_connection: true, source: 'personal' }));
      }

      // Integrações globais apenas se não houver pessoais
      let global = [];
      if (personal.length === 0) {
        const { data: globalData, error: globalError } = await supabase
          .from('llm_integrations')
          .select('id, name, provider, default_model, is_active');
        if (!globalError && globalData) {
          global = globalData
            .filter(i => i.is_active !== false)
            .map(i => ({ ...i, is_user_connection: false, source: 'global' }));
        }
      }

      const all = [...personal, ...global];
      setLlmIntegrations(all);
      if (all.length > 0 && !selectedLlmId) {
        setSelectedLlmId(all[0].id);
      }
      if (all.length === 0) {
        toast({ title: 'Nenhuma IA configurada', description: 'Configure sua IA em Minha IA para gerar conteúdo.', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Erro ao carregar IAs:', err);
      toast({ title: 'Erro ao carregar IAs', description: 'Não foi possível carregar as conexões de IA.', variant: 'destructive' });
    }
  }, [user, selectedLlmId, toast]);

  useEffect(() => {
    fetchAgents();
    fetchOutputs();
    fetchIntegrations();
  }, [fetchAgents, fetchOutputs, fetchIntegrations]);
  
  const handleSelectAgent = (agent) => {
    setSelectedAgent(agent);
  };

  const handleGenerate = async (agent) => {
    if (!campaignData.id) {
        toast({ title: "Aguarde", description: "Por favor, salve a campanha antes de gerar.", variant: "destructive" });
        return;
    }
    if (!selectedLlmId) {
        toast({ title: "Selecione uma IA", description: "Por favor, selecione uma conexão de IA para gerar conteúdo.", variant: "destructive" });
        return;
    }
    setGenerating(true);
    
    const clients = campaignData?.clients;
    const payload = campaignData; // enviar campanha completa (inclui clients)
    const agentIdRaw = agent.id.toString().replace('module-', '');
    const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
    if (!selectedIntegration) {
      toast({ title: "Erro", description: "Conexão de IA selecionada não encontrada.", variant: "destructive" });
      setGenerating(false);
      return;
    }

    try {
      let result;
      if (agent.type === 'ads_agent') {
        // Para ads_agent, usar generate-ads-content com parâmetros de IA
        const { data: adsData, error: adsError } = await supabase.functions.invoke('generate-ads-content', {
          body: JSON.stringify({
            ads_agent_id: agentIdRaw,
            campaign_data: payload,
            user_text: 'Gere uma variação de conteúdo para este agente com base no briefing e contexto da campanha.',
          }),
        });
        
        if (adsError) {
          let errorMsg = adsError.message || 'Ocorreu um erro ao gerar conteúdo de anúncio.';
          const context = adsError.context || {};
          if (context.error) {
            errorMsg = context.error;
          } else {
            try {
              const errorJson = await new Response(context).json();
              errorMsg = errorJson.error || errorMsg;
            } catch (e) {
              // Se não conseguir parsear, usar a mensagem padrão
            }
          }
          throw new Error(errorMsg);
        }
        
        if (!adsData || !adsData.generatedText) {
          throw new Error('A função de geração não retornou conteúdo válido.');
        }
        
        result = { data: { generatedText: adsData.generatedText, outputId: adsData.outputId } };
      } else {
        // Para módulos, tentar generic-ai-chat primeiro, depois fallback para generate-content
        try {
          // Construir prompt com contexto do módulo e campanha
          const modulePrompt = agent.prompt || agent.description || '';
          const campaignContext = `Campanha: ${payload.name || 'Sem nome'}\nCliente: ${clients?.name || 'N/A'}\nBriefing: ${payload.description || 'N/A'}`;
          const fullPrompt = `${modulePrompt}\n\n${campaignContext}`;
          
          const { data: chatData, error: chatError } = await supabase.functions.invoke('generic-ai-chat', {
            body: JSON.stringify({
              session_id: null, // Não salvar sessão - conteúdo de campanha não deve aparecer no Chat IA
              messages: [
                { role: 'system', content: fullPrompt },
                { role: 'user', content: 'Gere o conteúdo solicitado para esta campanha.' }
              ],
              llm_integration_id: selectedLlmId,
              is_user_connection: selectedIntegration.is_user_connection,
              context: 'campaign_generation', // Identificar contexto
            }),
          });

          if (chatError) {
            let errorMsg = chatError.message || 'Ocorreu um erro ao chamar a IA.';
            const context = chatError.context || {};
            if (context.error) {
              errorMsg = context.error;
            } else {
              try {
                const errorJson = await new Response(context).json();
                errorMsg = errorJson.error || errorMsg;
              } catch (e) {
                // Se não conseguir parsear, usar a mensagem padrão
              }
            }
            throw new Error(errorMsg);
          }
          
          if (!chatData || (!chatData.response && !chatData.content)) {
            throw new Error('A IA não retornou conteúdo válido.');
          }
          
          // Salvar resultado em agent_outputs
          const generatedText = chatData.response || chatData.content || 'Conteúdo gerado com sucesso!';
          const { data: outputData, error: outputError } = await supabase
            .from('agent_outputs')
            .insert({
              module_id: agentIdRaw,
              campaign_id: campaignData.id,
              generated_text: generatedText,
              is_favorited: false,
            })
            .select('id')
            .single();

          if (outputError) throw outputError;

          result = { data: { generatedText, outputId: outputData.id } };
        } catch (genericError) {
          console.warn('generic-ai-chat failed, trying generate-content:', genericError);
          // Fallback para generate-content (comportamento antigo)
          const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('generate-content', {
            body: JSON.stringify({
              module_id: agentIdRaw,
              campaign_data: payload,
              client_id: clients?.id || null,
              user_text: 'Gere o conteúdo solicitado para esta campanha com base no briefing e contexto.',
            }),
          });
          
          if (fallbackError) {
            let errorMsg = fallbackError.message || 'Ocorreu um erro ao gerar conteúdo.';
            const context = fallbackError.context || {};
            if (context.error) {
              errorMsg = context.error;
            } else {
              try {
                const errorJson = await new Response(context).json();
                errorMsg = errorJson.error || errorMsg;
              } catch (e) {
                // Se não conseguir parsear, usar a mensagem padrão
              }
            }
            throw new Error(errorMsg);
          }
          
          if (!fallbackData || !fallbackData.generatedText) {
            throw new Error('A função de geração não retornou conteúdo válido.');
          }
          
          result = { data: { generatedText: fallbackData.generatedText, outputId: fallbackData.outputId } };
        }
      }
      
      // Verificação final de segurança (erros já foram tratados acima)
      if (!result || !result.data) {
        throw new Error('Nenhum resultado foi retornado da geração.');
      }

      toast({
        title: "Conteúdo Gerado!",
        description: `Uma nova variação para "${agent.name}" foi criada.`,
      });
      
      if (typeof updateExecutionCount === 'function' && result.data?.remainingExecutions) {
        try {
          updateExecutionCount(result.data.remainingExecutions);
        } catch (e) {
          console.warn("Falha ao chamar updateExecutionCount (ignorado):", e);
        }
      }

      fetchOutputs();
    } catch (error) {
        toast({ title: "Ocorreu um erro ao gerar o conteúdo", description: error.message, variant: "destructive" });
    } finally {
        setGenerating(false);
    }
  };
  
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: 'Copiado!', description: 'Conteúdo copiado.' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleFavorite = async (item) => {
    const { error } = await supabase.from(item.type).update({ is_favorited: !item.is_favorited }).eq('id', item.id);
    if (error) {
      toast({ title: 'Erro', description: 'Não foi possível favoritar.', variant: 'destructive' });
    } else {
      toast({ title: 'Sucesso!', description: `Item ${!item.is_favorited ? 'favoritado' : 'desfavoritado'}.` });
      fetchOutputs();
    }
  };
  
  const handleDelete = async (item) => {
    const { error } = await supabase.from(item.type).delete().eq('id', item.id);
    if (error) {
      toast({ title: 'Erro ao deletar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Item deletado.' });
      fetchOutputs();
    }
  };
  
  const startEditing = (item) => { setEditingItemId(item.id); setEditText(item.generated_text); };
  const cancelEditing = () => { setEditingItemId(null); setEditText(''); };
  
  const handleSaveEdit = async (item) => {
    const { error } = await supabase.from(item.type).update({ generated_text: editText }).eq('id', item.id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Salvo!", description: "Sua alteração foi salva." });
      cancelEditing();
      fetchOutputs();
    }
  };

  const AgentIcon = ({ agent }) => {
    const IconComponent = agent.icon;
    const color = agent.platform === 'meta_ads' ? 'text-blue-600' : 'text-primary';
    return <IconComponent className={cn("w-5 h-5 mr-2", color)} />;
  };

  if (loading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  
  if (selectedAgent) {
    const agentOutputs = outputs[selectedAgent.id] || [];
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setSelectedAgent(null)}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Voltar para Agentes
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <AgentIcon agent={selectedAgent} />
                {selectedAgent.name}
              </CardTitle>
              {/* Seletor de IA */}
              <Popover open={isAiSelectorOpen} onOpenChange={setIsAiSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 text-xs">
                    <Settings className="w-3 h-3 mr-1" />
                    {selectedLlmId ? (llmIntegrations.find(i => i.id === selectedLlmId)?.name || 'Selecione a IA') : 'Selecione a IA'}
                    <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                  <Command>
                    <CommandInput placeholder="Procurar conexão..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma IA encontrada</CommandEmpty>
                      <CommandGroup>
                        {llmIntegrations.map(integration => (
                          <CommandItem key={integration.id} value={integration.name} onSelect={() => {
                            setSelectedLlmId(integration.id);
                            setIsAiSelectorOpen(false);
                          }}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${integration.is_user_connection ? 'bg-green-500' : 'bg-blue-500'}`} />
                              <span>{integration.name}</span>
                              <span className="text-xs text-muted-foreground">({integration.is_user_connection ? 'Pessoal' : 'Global'})</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Accordion type="multiple" className="w-full space-y-4">
               {agentOutputs.map((item, index) => (
                  <AccordionItem value={`item-${index}`} key={item.id} className="border rounded-lg bg-input">
                    <AccordionTrigger className="px-4 py-3 font-semibold hover:no-underline justify-between w-full">
                        Variação {agentOutputs.length - index}
                        <div className="flex items-center gap-1 ml-auto mr-2">
                          <Button variant="ghost" size="icon" onClick={(e) => {e.stopPropagation(); handleToggleFavorite(item)}} title="Favoritar" className="text-muted-foreground hover:text-primary h-8 w-8">
                             <Star className={cn("w-4 h-4", item.is_favorited ? "text-yellow-400 fill-yellow-400" : "")} />
                          </Button>
                           <Button variant="ghost" size="icon" onClick={(e) => {e.stopPropagation(); handleDelete(item)}} title="Excluir" className="text-muted-foreground hover:text-destructive h-8 w-8">
                             <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                       {editingItemId === item.id ? (
                      <div className="space-y-2">
                        <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-[150px] bg-input" autoFocus />
                         <div className="flex items-center gap-1 pt-2">
                            <Button size="sm" onClick={() => handleSaveEdit(item)}><Save className="w-4 h-4 mr-2" /> Salvar</Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditing}><X className="w-4 h-4 mr-2" /> Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-muted-foreground whitespace-pre-wrap break-words">{item.generated_text}</p>
                        <div className="flex items-center gap-1 border-t pt-2 mt-2">
                           <Button variant="ghost" size="sm" onClick={() => handleCopy(item.generated_text, item.id)}>
                             {copiedId === item.id ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Clipboard className="w-4 h-4 mr-2" />} Copiar
                           </Button>
                           <Button variant="ghost" size="sm" onClick={() => startEditing(item)}>
                             <Edit className="w-4 h-4 mr-2" /> Editar
                           </Button>
                        </div>
                      </div>
                    )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
             {agentOutputs.length === 0 && !generating && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma variação gerada para este agente ainda.</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => handleGenerate(selectedAgent)} disabled={generating || !selectedLlmId}>
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Gerar Nova Variação
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const renderAgentCards = (agents) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
      {agents.map(agent => {
        const count = outputs[agent.id]?.length || 0;
        return (
          <Card key={agent.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                  <CardTitle className="flex items-center">
                      <AgentIcon agent={agent} />
                      {agent.name}
                  </CardTitle>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center">
                {count > 0 ? (
                  <div className="text-center text-muted-foreground">
                    <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                    <p className="font-semibold">{count} {count === 1 ? 'variação criada' : 'variações criadas'}</p>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <p>Nenhum conteúdo gerado.</p>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                  <Button className="w-full" onClick={() => handleSelectAgent(agent)} disabled={generating}>
                      <Bot className="w-4 h-4 mr-2" />
                      Gerar & Ver Conteúdo
                  </Button>
              </CardFooter>
          </Card>
        )
      })}
    </div>
  );

  return (
    <div className="space-y-8">
      {Object.keys(allAgents).length > 0 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            {Object.keys(allAgents).map(groupName => (
              <TabsTrigger key={groupName} value={groupName}>{groupName}</TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(allAgents).map(([groupName, agents]) => (
            <TabsContent key={groupName} value={groupName}>
              {renderAgentCards(agents)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
           <div className="text-center py-16">
              <Bot className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold">Nenhum Agente de IA Disponível</h3>
              <p className="text-muted-foreground mt-2">Seu plano não inclui agentes de IA ou nenhum foi configurado no sistema.</p>
          </div>
      )}
    </div>
  );
};

export default GenerationStep;