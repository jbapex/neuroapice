import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, User, Send, Loader2, Sparkles, ChevronsUpDown, Settings, Check, X, Wand2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from '@/lib/utils';

const ClientOnboardingAssistant = ({ formState, setValue, getValues, watch, mode = 'create', clientName = null }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]); // Array de { field, value, original }
  const [llmIntegrations, setLlmIntegrations] = useState([]);
  const [selectedLlmId, setSelectedLlmId] = useState(null);
  const [isAiSelectorOpen, setIsAiSelectorOpen] = useState(false);
  const scrollAreaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  // Mapeamento de campos para labels
  const fieldLabels = {
    name: 'Nome do Cliente',
    creator_name: 'Nome do Criador',
    niche: 'Nicho',
    style_in_3_words: 'Estilo em 3 Palavras',
    product_to_promote: 'Produto/Serviço para Promover',
    target_audience: 'Público-alvo',
    success_cases: 'Casos de Sucesso',
    profile_views: 'Visualizações do Perfil',
    followers: 'Seguidores',
    appearance_format: 'Formato de Aparição',
    catchphrases: 'Bordões/Frases-chave',
    phone: 'Telefone',
    about: 'Sobre o Cliente',
  };

  // Buscar integrações de IA (prioriza Minha IA)
  const fetchIntegrations = useCallback(async () => {
    if (!user) return;
    try {
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

  // Análise inicial do formulário no modo edição
  const analyzeFormForEdit = useCallback(async () => {
    if (hasAnalyzed || !selectedLlmId || !llmIntegrations.length) return;
    
    setIsLoading(true);
    try {
      const values = getValues();
      const filledFields = [];
      const emptyFields = [];
      
      for (const [field, value] of Object.entries(values)) {
        if (fieldLabels[field]) {
          if (value) {
            filledFields.push(`${fieldLabels[field]}: ${value}`);
          } else {
            emptyFields.push(fieldLabels[field]);
          }
        }
      }

      const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
      if (!selectedIntegration) {
        setIsLoading(false);
        return;
      }

      const analysisPrompt = `Você é um estrategista de marketing sênior especializado em analisar e melhorar cadastros de clientes.

Analise o cadastro atual do cliente "${clientName || values.name || 'o cliente'}":

Campos preenchidos:
${filledFields.length > 0 ? filledFields.join('\n') : 'Nenhum campo preenchido.'}

Campos vazios:
${emptyFields.length > 0 ? emptyFields.join(', ') : 'Todos os campos foram preenchidos.'}

Sua tarefa:
1. Faça uma análise breve do que está bom e o que pode ser melhorado
2. Identifique campos que precisam de refinamento (textos genéricos, pouco persuasivos, incompletos)
3. Sugira melhorias específicas
4. Se houver campos vazios, pergunte se o usuário quer preenchê-los

Seja objetivo, profissional e acolhedor. Comece apresentando sua análise e oferecendo ajuda.`;

      const { data, error } = await supabase.functions.invoke('generic-ai-chat', {
        body: JSON.stringify({
          session_id: null, // Não salvar sessão
          messages: [
            { role: 'system', content: analysisPrompt },
            { role: 'user', content: 'Analise este cadastro e me diga o que pode ser melhorado.' }
          ],
          llm_integration_id: selectedLlmId,
          is_user_connection: selectedIntegration.is_user_connection,
          context: 'client_onboarding', // Identificar contexto
        }),
      });

      if (error) throw error;

      const analysisResponse = data?.response || data?.content || 'Análise concluída.';
      setMessages([{ role: 'assistant', content: analysisResponse }]);
      setHasAnalyzed(true);
    } catch (error) {
      console.error('Erro ao analisar formulário:', error);
      // Mensagem de fallback para não deixar tela preta
      const fallbackMessage = {
        role: 'assistant',
        content: `Olá! Estou aqui para ajudar a refinar o cadastro de "${clientName || 'este cliente'}". Você pode me pedir para melhorar campos específicos, completar informações faltantes ou tornar textos mais persuasivos.\n\nO que você gostaria de melhorar primeiro?`
      };
      setMessages([fallbackMessage]);
      setHasAnalyzed(true);
      toast({ title: 'Aviso', description: 'Não foi possível fazer análise automática, mas você pode usar o chat normalmente.', variant: 'default' });
    } finally {
      setIsLoading(false);
    }
  }, [hasAnalyzed, selectedLlmId, llmIntegrations, getValues, clientName, toast]);

  // Mensagem inicial quando não há mensagens
  useEffect(() => {
    if (messages.length === 0 && selectedLlmId && llmIntegrations.length > 0) {
      if (mode === 'create') {
        // Modo criação - mensagem padrão
        const initialMessage = {
          role: 'assistant',
          content: 'Olá! Sou seu assistente de cadastro. Vou te ajudar a preencher os dados do cliente com qualidade profissional para que os agentes de IA gerem os melhores conteúdos.\n\nPara começar, me conte: qual é o **nome do cliente** ou da empresa que você quer cadastrar?',
        };
        setMessages([initialMessage]);
      } else if (mode === 'edit' && !hasAnalyzed) {
        // Modo edição - mensagem inicial sem análise automática
        const initialMessage = {
          role: 'assistant',
          content: `Olá! Sou seu assistente de refinamento. Estou aqui para ajudar a melhorar o cadastro de "${clientName || 'este cliente'}".\n\nClique no botão "Analisar Cadastro" acima para eu examinar o formulário e sugerir melhorias, ou me diga diretamente o que você gostaria de ajustar.`,
        };
        setMessages([initialMessage]);
      }
    }
  }, [selectedLlmId, mode, llmIntegrations.length, hasAnalyzed, clientName]);

  // Scroll automático para o final
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, suggestions]);

  // Parser de sugestões do formato [SUGGESTION: campo="valor"]
  const parseSuggestions = (text) => {
    const suggestionRegex = /\[SUGGESTION:\s*(\w+)\s*=\s*"([^"]+)"\]/g;
    const found = [];
    let match;
    while ((match = suggestionRegex.exec(text)) !== null) {
      const field = match[1];
      const value = match[2];
      if (fieldLabels[field]) {
        found.push({ field, value, original: value });
      }
    }
    return found;
  };

  // Verificar quais campos estão vazios
  const getEmptyFields = () => {
    const values = getValues();
    const empty = [];
    for (const [field, label] of Object.entries(fieldLabels)) {
      if (field === 'name' && !values[field]) {
        empty.push(field);
      } else if (field !== 'name' && !values[field]) {
        empty.push(field);
      }
    }
    return empty;
  };

  // Encontrar próximo campo vazio
  const getNextEmptyField = () => {
    const empty = getEmptyFields();
    if (empty.length === 0) return null;
    // Prioridade: name primeiro, depois os outros
    if (empty.includes('name')) return 'name';
    return empty[0];
  };

  // Construir contexto dos campos preenchidos para a IA
  const getFormContext = () => {
    const values = getValues();
    const filled = [];
    for (const [field, value] of Object.entries(values)) {
      if (value && fieldLabels[field]) {
        filled.push(`${fieldLabels[field]}: ${value}`);
      }
    }
    return filled.length > 0 ? `Campos já preenchidos:\n${filled.join('\n')}` : 'Nenhum campo preenchido ainda.';
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    if (!selectedLlmId) {
      toast({ title: 'Selecione uma IA', description: 'Por favor, selecione uma conexão de IA para continuar.', variant: 'destructive' });
      return;
    }

    const userMessage = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
      if (!selectedIntegration) {
        throw new Error('Conexão de IA selecionada não encontrada');
      }

      const formContext = getFormContext();
      const nextField = getNextEmptyField();
      const nextFieldLabel = nextField ? fieldLabels[nextField] : null;
      
      const currentValues = getValues();
      const currentValuesText = Object.entries(currentValues)
        .filter(([key, value]) => value && fieldLabels[key])
        .map(([key, value]) => `${fieldLabels[key]}: ${value}`)
        .join('\n');

      let systemPrompt;
      
      if (mode === 'edit') {
        // Modo edição - foco em refinamento
        systemPrompt = `Você é um estrategista de marketing sênior especializado em analisar e melhorar cadastros de clientes existentes.

Você está no modo de REFINAMENTO. O usuário já tem um cadastro preenchido e pode querer:
- Melhorar textos existentes (tornar mais persuasivos, profissionais)
- Completar campos vazios
- Ajustar informações específicas

Cadastro atual:
${currentValuesText || 'Nenhum campo preenchido ainda.'}

Regras importantes:
1. Quando o usuário pedir para melhorar um campo ou você identificar necessidade de refinamento, SEMPRE reescreva o texto de forma mais profissional e persuasiva.
2. Analise a resposta do usuário e identifique quais campos podem ser melhorados ou preenchidos.
3. SEMPRE inclua sugestões no formato: [SUGGESTION: campo="valor_melhorado"] no final da resposta.
4. Você pode sugerir alterações mesmo em campos já preenchidos se detectar que podem ser melhorados.
5. Seja proativo: ofereça melhorias mesmo que o usuário não peça explicitamente.
6. Se o usuário disser "melhore tudo" ou "refine", analise todos os campos e sugira melhorias onde necessário.
7. Para campos vazios, pergunte se quer preencher.
8. Seja objetivo, profissional e acolhedor.

Campos disponíveis:
${Object.entries(fieldLabels).map(([key, label]) => `- ${key}: ${label}`).join('\n')}

Lembre-se: a qualidade do cadastro impacta diretamente na qualidade dos conteúdos gerados pelos agentes de IA. Busque sempre extrair o máximo de valor e construir textos profissionais e persuasivos.`;
      } else {
        // Modo criação - comportamento original
        systemPrompt = `Você é um estrategista de marketing sênior especializado em extrair informações de qualidade para cadastro de clientes.

Sua função é fazer perguntas estratégicas e, com base nas respostas do usuário, identificar valores para preencher campos do formulário.

Regras importantes:
1. Analise a resposta do usuário e SEMPRE reescreva/melhore o texto em versão profissional e persuasiva antes de sugerir.
2. Faça perguntas de forma natural, objetiva e profissional.
3. Quando identificar um valor para algum campo, SEMPRE inclua no final da sua resposta: [SUGGESTION: campo="valor_aprimorado"]
4. Se identificar múltiplos campos em uma resposta, liste múltiplas sugestões.
5. Pergunte APENAS sobre campos vazios. ${formContext}
6. ${nextFieldLabel ? `Agora pergunte sobre: ${nextFieldLabel}` : 'Todos os campos foram preenchidos. Pergunte se o usuário quer revisar algo ou finalizar.'}
7. Seja objetivo, use exemplos quando necessário, mas seja breve.
8. Se o usuário não souber responder algo, ofereça sugestões baseadas no contexto ou pule para o próximo campo.

Campos disponíveis:
${Object.entries(fieldLabels).map(([key, label]) => `- ${key}: ${label}`).join('\n')}

Lembre-se: a qualidade do cadastro impacta diretamente na qualidade dos conteúdos gerados pelos agentes de IA. Busque extrair informações diferenciadas e construir textos profissionais.`;
      }

      const { data, error } = await supabase.functions.invoke('generic-ai-chat', {
        body: JSON.stringify({
          session_id: null, // Não salvar sessão - conversas de clientes não devem aparecer no Chat IA
          messages: [
            { role: 'system', content: systemPrompt },
            ...newMessages.map(({ role, content }) => ({ role, content })),
          ],
          llm_integration_id: selectedLlmId,
          is_user_connection: selectedIntegration.is_user_connection,
          context: 'client_onboarding', // Identificar contexto, mas não salvar sessão
        }),
      });

      if (error) {
        let errorMsg = error.message || 'Ocorreu um erro ao chamar a IA.';
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

      const assistantResponse = data?.response || data?.content || 'Erro ao obter resposta da IA.';
      const newSuggestions = parseSuggestions(assistantResponse);

      // Adicionar sugestões encontradas
      if (newSuggestions.length > 0) {
        setSuggestions(prev => {
          // Evitar duplicatas
          const existing = prev.map(s => s.field);
          return [...prev, ...newSuggestions.filter(s => !existing.includes(s.field))];
        });
      }

      setMessages([...newMessages, { role: 'assistant', content: assistantResponse }]);
    } catch (error) {
      toast({ title: 'Erro ao processar', description: error.message, variant: 'destructive' });
      setMessages(prev => [...prev, { role: 'assistant', content: `Desculpe, ocorreu um erro: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySuggestion = (suggestion) => {
    setValue(suggestion.field, suggestion.value, { shouldValidate: true });
    setSuggestions(prev => prev.filter(s => s.field !== suggestion.field));
    toast({ 
      title: 'Campo preenchido!', 
      description: `${fieldLabels[suggestion.field]} foi adicionado ao formulário.`,
    });
  };

  const handleIgnoreSuggestion = (field) => {
    setSuggestions(prev => prev.filter(s => s.field !== field));
  };

  // Verificar quais campos foram preenchidos pela IA (com badge)
  const aiFilledFields = watch();

  return (
    <div className="flex flex-col h-full bg-muted/30 border-l min-h-0">
      {/* Header com seletor de IA */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-semibold">{mode === 'edit' ? 'Assistente de Refinamento' : 'Assistente de Cadastro'}</span>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'edit' && !hasAnalyzed && (
            <Button
              variant="default"
              size="sm"
              onClick={analyzeFormForEdit}
              disabled={isLoading || !selectedLlmId}
              className="h-8 text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 mr-1" />
                  Analisar Cadastro
                </>
              )}
            </Button>
          )}
          <Popover open={isAiSelectorOpen} onOpenChange={setIsAiSelectorOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Settings className="w-3 h-3 mr-1" />
                {selectedLlmId ? (llmIntegrations.find(i => i.id === selectedLlmId)?.name || 'IA') : 'Selecione IA'}
                <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0">
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
      </div>

      {/* Área de mensagens */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'rounded-lg px-4 py-2 max-w-[80%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content.replace(/\[SUGGESTION:[^\]]+\]/g, '').trim()}</p>
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="rounded-lg px-4 py-2 bg-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Painel de sugestões */}
      {suggestions.length > 0 && (
        <div className="border-t bg-background p-4 space-y-2 max-h-[200px] overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Sugestões Detectadas</span>
          </div>
          {suggestions.map((suggestion, idx) => (
            <Card key={idx} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <Badge variant="outline" className="mb-1">{fieldLabels[suggestion.field]}</Badge>
                  <p className="text-sm text-muted-foreground">{suggestion.value}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleApplySuggestion(suggestion)}
                    className="h-7 text-xs"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Adicionar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleIgnoreSuggestion(suggestion.field)}
                    className="h-7 w-7 p-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Input de mensagem */}
      <form onSubmit={handleSubmit} className="border-t bg-background p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua resposta..."
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" disabled={isLoading || !input.trim() || !selectedLlmId} size="icon" className="h-[60px]">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClientOnboardingAssistant;

