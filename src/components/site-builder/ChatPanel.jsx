import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, CornerDownLeft, Loader2, Sparkles, ChevronsUpDown, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useParams, useLocation } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { v4 as uuidv4 } from 'uuid';

const StreamingMessage = ({ content, onFinished }) => {
  const [displayedContent, setDisplayedContent] = useState('');

  useEffect(() => {
    setDisplayedContent('');
    if (content) {
      let i = 0;
      const interval = setInterval(() => {
        if (i < content.length) {
          setDisplayedContent(prev => prev + content[i]);
          i++;
        } else {
          clearInterval(interval);
          if (onFinished) onFinished();
        }
      }, 20);
      return () => clearInterval(interval);
    }
  }, [content, onFinished]);

  return <p className="text-sm whitespace-pre-wrap">{displayedContent}</p>;
};

const ChatPanel = ({ 
  htmlContent, setHtmlContent,           // Modo standalone (atual)
  pageStructure, setPageStructure,       // Modo modal (novo)
  setIsBuilding, flowContext 
}) => {
  const { projectId } = useParams();
  const location = useLocation();
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollAreaRef = useRef(null);
  const [llmIntegrations, setLlmIntegrations] = useState([]);
  const [selectedLlmId, setSelectedLlmId] = useState(null);
  // Phase 1: planning mode state
  const [architectureProposed, setArchitectureProposed] = useState(false);
  const [architectureApproved, setArchitectureApproved] = useState(false);

  // Detecção automática do modo de uso
  const isModalMode = !htmlContent && pageStructure;
  const isStandaloneMode = htmlContent && !pageStructure;

  const getFlowContextFromState = () => {
    const flowNode = location.state?.flowNode;
    if (!flowNode) return null;

    return {
      nodeId: flowNode.id,
      nodeType: flowNode.type,
      nodeData: flowNode.data,
    };
  };

  const loadChatHistory = useCallback(async () => {
    if (!projectId || !user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_projects')
        .select('chat_history')
        .eq('id', projectId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data && data.chat_history) {
        setMessages(data.chat_history);
        // detect planning markers in persisted history
        const hasProposed = data.chat_history.some(m => m.role === 'system' && m.content === '__ARCH_PROPOSED__');
        const hasApproved = data.chat_history.some(m => m.role === 'system' && m.content === '__ARCH_APPROVED__');
        setArchitectureProposed(hasProposed);
        setArchitectureApproved(hasApproved);
      } else {
        setMessages([{ role: 'assistant', content: "Olá! Como posso te ajudar a construir sua página hoje?" }]);
      }
    } catch (error) {
      toast.error('Erro ao carregar histórico do chat.', { description: error.message });
      setMessages([{ role: 'assistant', content: "Olá! Como posso te ajudar a construir sua página hoje?" }]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, user]);

  useEffect(() => {
    loadChatHistory();
  }, [loadChatHistory]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, isLoading, isStreaming]);

  const saveChatHistory = async (newMessages) => {
    if (!projectId || !user) return;
    try {
      const { error } = await supabase
        .from('site_projects')
        .update({ chat_history: newMessages })
        .eq('id', projectId);

      if (error) throw error;
    } catch (error) {
      toast.error('Erro ao salvar histórico do chat.', { description: error.message });
    }
  };

  // Buscar integrações de IA (prioriza Minha IA)
  useEffect(() => {
    const fetchIntegrations = async () => {
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
          toast.error('Nenhuma IA configurada', { description: 'Configure sua IA em Minha IA para usar o editor com IA.' });
        }
      } catch (err) {
        console.error('Erro ao carregar IAs do editor:', err);
        toast.error('Erro ao carregar IAs', { description: 'Não foi possível carregar as conexões de IA.' });
      }
    };
    fetchIntegrations();
  }, [user, selectedLlmId]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;
    if (!selectedLlmId) {
      toast.error('Selecione uma IA para continuar');
      return;
    }

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setIsStreaming(false);
    
    const finalFlowContext = flowContext || getFlowContextFromState();

    // Phase 1: planning intercept
    const approveKeywords = ['aprovar', 'aprovado', 'gerar agora', 'pode gerar', 'estou pronto', 'pronto', 'pode implementar', 'implementar'];
    const changeKeywords = ['alterar', 'mudar', 'trocar', 'rever seções'];
    const generationIntent = /^\s*(gerar|implementar|inserir|adicionar)\b/i.test(input);

    const wantsApproval = approveKeywords.some(k => input.toLowerCase().includes(k));
    const wantsChange = changeKeywords.some(k => input.toLowerCase().includes(k));

    if (!generationIntent && (!architectureProposed || (!architectureApproved && (wantsChange || !wantsApproval)))) {
      // Ask AI to propose a structure plan (no HTML yet)
      try {
        const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
        const plannerPrompt = `Atue como planner de landing pages. Com base nas mensagens do usuário, proponha:
        - Público-alvo, proposta de valor e tom
        - Estrutura de seções (ordem): hero com 2 CTAs, provas sociais, benefícios (6 cards), features (tabs), como funciona (3 passos), comparativo, depoimentos, integrações, preços (3 planos), FAQ, CTA final
        - Diretrizes visuais (Tailwind: max-w-7xl, grid 12 colunas, gradiente sutil, microinterações)
        - CTAs principais e secundários
        - 2-3 variações de estilo (A/B/C)
        Responda apenas em texto estruturado, sem HTML. Termine perguntando: "Aprovar e gerar agora?"`;

        const planningMessages = [
          { role: 'system', content: plannerPrompt },
          ...newMessages.map(({ role, content }) => ({ role, content }))
        ];

        const { data: planData, error: planError } = await supabase.functions.invoke('generic-ai-chat', {
          body: JSON.stringify({
            messages: planningMessages,
            llm_integration_id: selectedLlmId,
            is_user_connection: selectedIntegration?.is_user_connection,
          }),
        });

        if (planError) throw planError;
        const planText = planData?.response || planData?.content || 'Tenho uma proposta de estrutura. Deseja gerar agora?';
        const planned = [...newMessages, { role: 'assistant', content: planText } , { role: 'system', content: '__ARCH_PROPOSED__' }];
        setArchitectureProposed(true);
        setIsLoading(false);
        setIsStreaming(false);
        setMessages(planned);
        await saveChatHistory(planned);
      } catch (err) {
        setIsLoading(false);
        toast.error('Erro ao sugerir estrutura', { description: err.message });
      }
      return;
    }

    if (architectureProposed && !architectureApproved && wantsApproval) {
      // mark approved and continue to generation
      setArchitectureApproved(true);
      const marked = [...newMessages, { role: 'system', content: '__ARCH_APPROVED__' }];
      setMessages(marked);
      await saveChatHistory(marked);
      // proceed to generation flow below
    }

    try {
      // Prompt-base e composição de mensagens devem usar newMessages já definido
      const baseSystemPrompt = `Você é um ARQUITETO DE LANDING PAGES premium. Objetivo: entregar trechos HTML/JSX (compatíveis com Tailwind) prontos para injeção no preview, com visual moderno e foco em conversão.
      POLÍTICAS GERAIS
      - Saída: somente o conteúdo do corpo (sem <html>/<head>/<body>), bem formatado e legível.
      - Tecnologia: TailwindCSS (utilitárias), responsivo mobile-first, tipografia clara, contraste AA/AAA, sem scripts externos.
      - Semântica: usar <header>, <section>, <main>, <footer> quando fizer sentido.
      - Editabilidade: adicionar data-id e data-type em todos os textos clicáveis (headings, parágrafos, botões) para edição no editor.
      - Microinterações: transitions no hover/focus (opacidade, escala suave), sombras leves (shadow-md) e bordas arredondadas (rounded-xl).
      - Layout: containers max-w-7xl, grids responsivas (até 12 colunas), spacing generoso (py-16/24), uso de gap consistente.
      - Visual: pode usar gradiente sutil (bg-gradient-to-r), badges/chips, cards, ícones placeholders.
      - Conversão: CTAs evidentes em ponto alto e repetição contextual; se possível, hero com 2 CTAs e prova social.
      - A11y/SEO: hierarquia H1/H2/H3 correta, alt em imagens, links descritivos.
      - Incremental: se o usuário pedir mudanças, retorne SOMENTE a seção/trecho atualizado.
      - Importante: quando gerar texto longo, separar em seções (hero, benefícios, depoimentos, preços, FAQ, CTA final).`;

      const messagesWithSystem = [
        { role: 'system', content: baseSystemPrompt },
        ...newMessages.map(({ role, content }) => ({ role, content }))
      ];
      // Preferências por modo: standalone usa primeiro site-builder-assistant; modal mantém generic primeiro
      if (setIsBuilding) setIsBuilding(true);
      let data, error;

      const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
      if (!selectedIntegration) {
        throw new Error('Conexão de IA selecionada não encontrada');
      }

      const withTimeout = (promise, ms = 30000) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado ao comunicar com a IA.')), ms))
        ]);
      };

      const callBuilder = () => withTimeout(
        supabase.functions.invoke('site-builder-assistant', {
          body: { 
            messages: messagesWithSystem, 
            html_content: htmlContent,
            flow_context: finalFlowContext,
            llm_integration_id: selectedLlmId,
            is_user_connection: selectedIntegration.is_user_connection,
          },
        })
      );

      const callGeneric = () => withTimeout(
        supabase.functions.invoke('generic-ai-chat', {
          body: JSON.stringify({
            session_id: null, // Não salvar sessão - Site Builder tem seu próprio histórico
            messages: messagesWithSystem,
            llm_integration_id: selectedLlmId,
            is_user_connection: selectedIntegration.is_user_connection,
            context: 'site_builder', // Identificar contexto
          }),
        })
      );

      if (isStandaloneMode) {
        // Tenta primeiro o site builder (espera html_update)
        const { data: builderData, error: builderError } = await callBuilder();
        data = builderData; error = builderError;

        if (error) {
          // Fallback para generic
          const { data: chatData, error: chatError } = await callGeneric();
          if (chatError) throw chatError;
          data = { response: { type: 'message', content: chatData?.response || chatData?.content || '' } };
          error = null;
        }
      } else {
        // Modal: mantém generic primeiro e cai para builder
        try {
          const { data: chatData, error: chatError } = await callGeneric();
          if (chatError) throw chatError;
          data = { response: { type: 'message', content: chatData?.response || chatData?.content || '' } };
          error = null;
        } catch (genericError) {
          const { data: builderData, error: builderError } = await callBuilder();
          data = builderData; error = builderError;
        }
      }

      if (error) {
        try {
            const errorContext = await error.context.json();
            throw new Error(errorContext.error || 'Erro desconhecido na função.');
        } catch (parseError) {
             throw new Error(error.message || 'Erro desconhecido na comunicação com a IA.');
        }
      }
      
      let assistantResponse = data.response;
      let finalMessages = newMessages;
      
      setIsLoading(false);

      // Se veio como mensagem, tentar extrair HTML/JSX e promover para html_update
      if (assistantResponse?.type === 'message' && assistantResponse?.content) {
        const text = assistantResponse.content;
        const codeBlockMatch = text.match(/```(html|jsx)?\n([\s\S]*?)```/i);
        const tagMatch = text.match(/<\s*(div|section|header|main|footer|nav|article|aside)[\s>][\s\S]*>/i);
        const extracted = codeBlockMatch ? codeBlockMatch[2] : tagMatch ? text : null;
        if (extracted) {
          assistantResponse = { type: 'html_update', html: extracted, explanation: 'Código aplicado ao preview.' };
        }
      }

      if (assistantResponse.type === 'html_update' && assistantResponse.html) {
          // Modo standalone: anexar novo trecho quando for intenção de geração; substituir apenas quando não for geração explícita
          if (isStandaloneMode && setHtmlContent) {
            if (generationIntent) {
              setHtmlContent(prev => `${prev || ''}\n${assistantResponse.html}`);
            } else {
              setHtmlContent(assistantResponse.html);
            }
          }
          
          // Modo modal: converte HTML para módulo do pageStructure
          if (isModalMode && setPageStructure) {
            const newModule = {
              id: uuidv4(),
              name: assistantResponse.explanation || 'Seção Gerada pela IA',
              html: assistantResponse.html
            };
            setPageStructure(prev => [...prev, newModule]);
          }
          
          const explanation = assistantResponse.explanation || "Seu site foi atualizado.";
          finalMessages = [...newMessages, { role: 'assistant', content: explanation }];
          setMessages(prev => [...prev, { role: 'assistant', content: explanation }]);
          setIsStreaming(true);
      } else if (assistantResponse.type === 'message' && assistantResponse.content) {
          finalMessages = [...newMessages, { role: 'assistant', content: assistantResponse.content }];
          setMessages(prev => [...prev, { role: 'assistant', content: assistantResponse.content }]);
          setIsStreaming(true);
      } else {
        const fallbackMessage = "Recebi uma resposta, mas não consegui processá-la. Verifique o preview para ver se houve alguma alteração.";
        finalMessages = [...newMessages, { role: 'assistant', content: fallbackMessage }];
        setMessages(prev => [...prev, { role: 'assistant', content: fallbackMessage }]);
        setIsStreaming(true);
      }

      await saveChatHistory(finalMessages);

    } catch (error) {
      console.error(error);
      const errorMsg = "Ocorreu um erro ao processar sua solicitação. Tente novamente.";
      const updatedMessages = [...newMessages, { role: 'assistant', content: errorMsg, isError: true }];
      setMessages(updatedMessages);
      toast.error("Erro na comunicação com a IA", { description: error.message });
      setIsLoading(false);
      if(setIsBuilding) setIsBuilding(false);
    }
  };
  
  const handleStreamingFinished = () => {
    setIsStreaming(false);
    if(setIsBuilding) setIsBuilding(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900/50 backdrop-blur-sm border-l border-gray-700/50">
      <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
        <h2 className="text-xl font-bold text-white flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-primary animate-pulse" />
            Assistente IA
        </h2>
        {/* Seletor de IA compacto, sem alterar o design geral */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center text-xs text-gray-400">
            <Settings className="w-3 h-3 mr-1" /> IA
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 text-xs justify-between min-w-[160px]">
                <span className="truncate">
                  {selectedLlmId ? (llmIntegrations.find(i => i.id === selectedLlmId)?.name || 'Selecione a IA') : 'Selecione a IA'}
                </span>
                <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Procurar conexão..." />
                <CommandList>
                  <CommandEmpty>Nenhuma IA encontrada</CommandEmpty>
                  <CommandGroup>
                    {llmIntegrations.map(integration => (
                      <CommandItem key={integration.id} value={integration.name} onSelect={() => setSelectedLlmId(integration.id)}>
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
      <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
        <div className="space-y-6">
          <AnimatePresence>
            {messages.filter(m => m.role !== 'system').map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : message.isError 
                    ? 'bg-red-500/20 text-red-300 border border-red-500/50 rounded-bl-none'
                    : 'bg-gray-800 text-gray-300 rounded-bl-none'
                }`}>
                  {message.role === 'assistant' && !message.isError && index === messages.length - 1 && isStreaming ? (
                    <StreamingMessage content={message.content} onFinished={handleStreamingFinished} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex-shrink-0 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
              <div className="max-w-[80%] p-3 rounded-lg bg-gray-800 text-gray-300 rounded-bl-none">
                <p className="text-sm">Analisando e construindo...</p>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 border-t border-gray-700/50">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Descreva o que você quer criar ou alterar..."
            className="w-full bg-gray-800 border-gray-600 text-white rounded-lg resize-none pr-20"
            rows={2}
            disabled={isLoading || isStreaming}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-3 bottom-3 bg-primary hover:bg-primary/90"
            disabled={isLoading || isStreaming || !input.trim()}
          >
            <CornerDownLeft className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;