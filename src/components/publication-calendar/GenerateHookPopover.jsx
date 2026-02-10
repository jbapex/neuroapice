import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

const GenerateHookPopover = ({ day, dateKey, isDayGenerating, popoverOpen, setPopoverOpen, campaigns, hookGeneratorModuleId, selectedClientId, setGeneratingDays, setHooks }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [campaignId, setCampaignId] = useState('none');
  const [llmIntegrations, setLlmIntegrations] = useState([]);
  const [selectedLlmId, setSelectedLlmId] = useState(null);

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
    } catch (err) {
      console.error('Erro ao carregar IAs:', err);
    }
  }, [user, selectedLlmId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleGenerate = async () => {
    if (!hookGeneratorModuleId) {
      toast({ title: 'Erro', description: 'O módulo gerador de ganchos não está configurado.', variant: 'destructive' });
      return;
    }

    if (!selectedLlmId) {
      toast({ title: 'Selecione uma IA', description: 'Por favor, selecione uma conexão de IA para gerar o gancho.', variant: 'destructive' });
      return;
    }

    setGeneratingDays(prev => ({ ...prev, [dateKey]: true }));
    setPopoverOpen(false);

    try {
      const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
      if (!selectedIntegration) {
        throw new Error('Conexão de IA selecionada não encontrada');
      }

      // Buscar detalhes do módulo para contexto
      const { data: moduleData } = await supabase
        .from('modules')
        .select('prompt, name')
        .eq('id', hookGeneratorModuleId)
        .single();

      const modulePrompt = moduleData?.prompt || '';
      const userPrompt = `Gere um gancho de publicação para o dia ${dateKey}`;
      const fullPrompt = modulePrompt ? `${modulePrompt}\n\n${userPrompt}` : userPrompt;

      let generatedText = '';

      // Tentar generic-ai-chat primeiro (preferido)
      try {
        const { data: chatData, error: chatError } = await supabase.functions.invoke('generic-ai-chat', {
          body: JSON.stringify({
            messages: [
              { role: 'system', content: fullPrompt },
              { role: 'user', content: `Contexto: Cliente ID ${selectedClientId}${campaignId !== 'none' ? `, Campanha ID ${campaignId}` : ''}` }
            ],
            llm_integration_id: selectedLlmId,
            is_user_connection: selectedIntegration.is_user_connection,
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

        generatedText = chatData?.response || chatData?.content || '';
      } catch (genericError) {
        console.warn('generic-ai-chat failed, trying generate-content:', genericError);
        // Fallback para generate-content
        const { data, error } = await supabase.functions.invoke('generate-content', {
          body: {
            module_id: hookGeneratorModuleId,
            client_id: selectedClientId,
            campaign_id: campaignId === 'none' ? null : campaignId,
            user_text: userPrompt,
          }
        });

        if (error) {
          let errorMsg = error.message || 'Ocorreu um erro ao gerar conteúdo.';
          const context = error.context || {};
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

        if (!data || !data.generatedText) {
          throw new Error('A função de geração não retornou conteúdo válido.');
        }

        generatedText = data.generatedText;
      }

      if (!generatedText) {
        throw new Error('A IA não retornou conteúdo válido.');
      }
      const { data: userResponse } = await supabase.auth.getUser();
      const { error: upsertError } = await supabase
        .from('publication_hooks')
        .upsert({
          client_id: selectedClientId,
          user_id: userResponse.user.id,
          campaign_id: campaignId === 'none' ? null : campaignId,
          hook_date: dateKey,
          hook_text: generatedText,
        }, { onConflict: 'client_id,hook_date' });

      if (upsertError) throw upsertError;

      setHooks(prev => ({ ...prev, [dateKey]: generatedText }));
      toast({ title: 'Sucesso!', description: `Gancho gerado para ${format(day, 'dd/MM/yyyy')}.` });

    } catch (error) {
      let errorMessage = error.message || 'Ocorreu um erro ao gerar o gancho.';
      if (error.context) {
        try {
          const errorJson = typeof error.context === 'string' 
            ? JSON.parse(error.context) 
            : await new Response(error.context).json();
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          // Se não conseguir parsear, usar a mensagem padrão
        }
      }
      toast({
        title: 'Erro ao gerar gancho',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setGeneratingDays(prev => ({ ...prev, [dateKey]: false }));
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          disabled={isDayGenerating || !hookGeneratorModuleId}
          onClick={(e) => e.stopPropagation()}
        >
          {isDayGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-400" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2">
          <Label htmlFor={`ai-select-${dateKey}`} className="text-xs font-medium">Conexão de IA</Label>
          <Select value={selectedLlmId?.toString() || ''} onValueChange={(value) => setSelectedLlmId(parseInt(value))}>
            <SelectTrigger id={`ai-select-${dateKey}`} className="h-8 text-xs">
              <SelectValue placeholder="Selecione a IA" />
            </SelectTrigger>
            <SelectContent>
              {llmIntegrations.map((integration) => (
                <SelectItem key={integration.id} value={integration.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${integration.is_user_connection ? 'bg-green-500' : 'bg-blue-500'}`} />
                    <span>{integration.name}</span>
                    <span className="text-xs text-muted-foreground">({integration.is_user_connection ? 'Pessoal' : 'Global'})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Label htmlFor={`campaign-select-${dateKey}`} className="text-xs font-medium">Campanha (Opcional)</Label>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger id={`campaign-select-${dateKey}`} className="h-8 text-xs">
              <SelectValue placeholder="Nenhuma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id.toString()}>{campaign.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button 
            size="sm" 
            className="w-full h-8 text-xs" 
            onClick={handleGenerate}
            disabled={!selectedLlmId}
          >
            Gerar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default GenerateHookPopover;