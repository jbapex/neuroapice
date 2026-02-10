import React, { useState, useEffect, useRef, useCallback } from 'react';
    import { useParams, Link } from 'react-router-dom';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Send, Sparkles, Bot, User, CornerDownLeft, Loader2, ChevronLeft, Square, ChevronsUpDown } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Textarea } from '@/components/ui/textarea';
    import { useToast } from '@/components/ui/use-toast';
    import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
    import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import ReactMarkdown from 'react-markdown';
    
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
    
      return <ReactMarkdown>{displayedContent}</ReactMarkdown>;
    };
    
    const CampaignCopilot = () => {
      const { campaignId } = useParams();
      const { user, profile } = useAuth();
      const { toast } = useToast();
    
      const [messages, setMessages] = useState([]);
      const [input, setInput] = useState('');
      const [isLoading, setIsLoading] = useState(false);
      const [isStreaming, setIsStreaming] = useState(false);
      const [campaign, setCampaign] = useState(null);
      const [isReady, setIsReady] = useState(false);
      const [llmIntegrations, setLlmIntegrations] = useState([]);
      const [selectedLlmId, setSelectedLlmId] = useState(null);
      const [isAiSelectorOpen, setIsAiSelectorOpen] = useState(false);
      const messagesEndRef = useRef(null);
      const abortControllerRef = useRef(null);
    
      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      };
    
      useEffect(scrollToBottom, [messages, isLoading, isStreaming]);

      const fetchIntegrations = useCallback(async () => {
        if (!user || !profile) return;
        
        try {
          // PRIORIDADE 1: Buscar conexões pessoais do usuário primeiro
          let userConnections = [];
          const { data: userData, error: userError } = await supabase
            .from('user_ai_connections')
            .select('id, name, provider, default_model, capabilities, is_active')
            .eq('user_id', user.id)
            .eq('is_active', true);

          if (!userError && userData) {
            // Filtrar apenas conexões com capacidade de geração de texto
            userConnections = userData
              .filter(conn => conn.capabilities?.text_generation === true)
              .map(conn => ({
                ...conn,
                is_user_connection: true,
                source: 'personal' // Indicador de origem
              }));
          }

          // PRIORIDADE 2: Buscar integrações globais apenas se não houver pessoais
          let globalIntegrations = [];
          if (userConnections.length === 0) {
            const { data: globalData, error: globalError } = await supabase
              .from('llm_integrations')
              .select('id, name, provider, default_model');

            if (!globalError && globalData) {
              globalIntegrations = globalData
                .filter(i => i.is_active !== false)
                .map(i => ({
                  ...i,
                  is_user_connection: false,
                  source: 'global' // Indicador de origem
                }));
            }
          }

          // Combinar integrações (pessoais primeiro, globais depois)
          const allIntegrations = [
            ...userConnections,
            ...globalIntegrations
          ];

          setLlmIntegrations(allIntegrations);

          // Selecionar automaticamente a primeira IA disponível
          if (allIntegrations.length > 0) {
            const defaultIntegration = allIntegrations[0];
            setSelectedLlmId(defaultIntegration.id);
            
            // Mostrar toast informativo sobre o tipo de IA selecionada
            if (defaultIntegration.source === 'personal') {
              toast({ 
                title: 'IA Pessoal Ativa', 
                description: `Usando sua IA pessoal: ${defaultIntegration.name}`,
                duration: 3000
              });
            } else if (defaultIntegration.source === 'global') {
              toast({ 
                title: 'IA Global Ativa', 
                description: `Usando IA global: ${defaultIntegration.name}. Configure sua IA pessoal em "Minha IA" para ter controle total.`,
                duration: 5000
              });
            }
          } else {
            // Nenhuma IA encontrada
            toast({ 
              title: 'Nenhuma IA Configurada', 
              description: 'Configure uma IA em Configurações → Minha IA para começar a usar o copiloto.',
              variant: 'destructive',
              duration: 8000
            });
          }
        } catch (error) {
          console.error('Erro ao buscar integrações:', error);
          toast({ title: 'Erro ao carregar IAs', description: 'Não foi possível carregar as conexões de IA.', variant: 'destructive' });
        }
      }, [user, profile, toast]);
    
      const initializeChat = useCallback(async () => {
        if (!user || !campaignId) return;
        setIsLoading(true);
    
        try {
          // Carregar integrações de IA (não bloqueia se falhar)
          try {
            await fetchIntegrations();
          } catch (integrationError) {
            console.error('Erro ao carregar integrações:', integrationError);
            // Continua mesmo sem integrações
          }
    
          const { data: campaignData, error: campaignError } = await supabase
            .from('campaigns')
            .select('id, name, clients(name)')
            .eq('id', campaignId)
            .eq('user_id', user.id)
            .single();
    
          if (campaignError || !campaignData) {
            toast({ title: 'Erro', description: 'Campanha não encontrada ou acesso negado.', variant: 'destructive' });
            setIsReady(false);
            setIsLoading(false);
            return;
          }
          setCampaign(campaignData);
    
          const { data: sessions, error: sessionError } = await supabase
            .from('campaign_chat_sessions')
            .select('messages')
            .eq('campaign_id', campaignId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
    
          if (sessionError) {
            console.error('Erro ao carregar sessões:', sessionError);
            // Continua mesmo sem carregar sessões
          }
    
          if (sessions && sessions.length > 0) {
            setMessages(sessions[0].messages);
          } else {
            // Verificar se há IAs pessoais configuradas
            const hasPersonalAIs = llmIntegrations.some(ai => ai.source === 'personal');
            
            let initialMessage;
            if (hasPersonalAIs) {
              initialMessage = {
                role: 'assistant',
                content: `Olá! Sou seu copiloto para a campanha **${campaignData.name}**. Como posso te ajudar a decolar hoje? Você pode me pedir para criar textos, imagens, anúncios e muito mais!\n\n✅ **Usando sua IA pessoal** - Você tem controle total sobre as configurações.`
              };
            } else {
              initialMessage = {
                role: 'assistant',
                content: `Olá! Sou seu copiloto para a campanha **${campaignData.name}**. Como posso te ajudar a decolar hoje? Você pode me pedir para criar textos, imagens, anúncios e muito mais!\n\n⚠️ **Usando IA global** - Para ter controle total, configure sua IA pessoal em **Configurações → Minha IA**.`
              };
            }
            
            setMessages([initialMessage]);
            try {
              await supabase.from('campaign_chat_sessions').insert({
                user_id: user.id,
                campaign_id: campaignId,
                messages: [initialMessage]
              });
            } catch (insertError) {
              console.error('Erro ao salvar sessão inicial:', insertError);
              // Continua mesmo se não conseguir salvar
            }
          }
          setIsReady(true);
        } catch (error) {
          console.error('Erro ao inicializar chat:', error);
          toast({ title: 'Erro ao carregar', description: 'Ocorreu um erro ao inicializar o copiloto.', variant: 'destructive' });
          setIsReady(false);
        } finally {
          setIsLoading(false);
        }
      }, [campaignId, user, toast, fetchIntegrations]);
    
      useEffect(() => {
        initializeChat();
      }, [initializeChat]);
    
      const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading || isStreaming || !isReady) return;
        
        if (!selectedLlmId) {
          toast({ title: "Nenhuma conexão de IA ativa", description: "Selecione uma conexão de IA para começar a conversar.", variant: "destructive" });
          return;
        }
    
        const userMessage = { role: 'user', content: input };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);
        setIsStreaming(false);
    
        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;
    
        const currentIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
        if (!currentIntegration) {
          toast({ title: "Erro", description: "A conexão de IA selecionada não foi encontrada.", variant: "destructive" });
          setIsLoading(false);
          return;
        }
    
        try {
          // Adicionar contexto da campanha na primeira mensagem do usuário
          const messagesWithContext = newMessages.map((msg, index) => {
            if (index === 0 && msg.role === 'user') {
              return {
                ...msg,
                content: `[CONTEXTO DA CAMPANHA: ${campaign?.name}${campaign?.clients?.name ? ` - Cliente: ${campaign.clients.name}` : ''}]\n\n${msg.content}`
              };
            }
            return msg;
          });

          const { data, error } = await supabase.functions.invoke('generic-ai-chat', {
            body: JSON.stringify({
              session_id: null, // Não usar sessão persistente para campanhas - tem própria tabela campaign_chat_sessions
              messages: messagesWithContext.map(({ role, content }) => ({ role, content })),
              llm_integration_id: selectedLlmId,
              is_user_connection: currentIntegration.is_user_connection,
              context: 'campaign_copilot', // Identificar contexto - não deve aparecer no Chat IA
            }),
            signal,
          });
    
          if (error) {
            if (error.name === 'AbortError') {
              toast({ title: 'Geração cancelada', description: 'Você interrompeu a resposta da IA.' });
              setIsLoading(false);
              return;
            }
            let errorMsg = error.message || 'Ocorreu um erro desconhecido.';
            const context = error.context || {};
            if (context.error) {
                errorMsg = context.error;
            } else {
                try {
                    const errorJson = await new Response(context).json();
                    errorMsg = errorJson.error || errorMsg;
                } catch (e) {
                }
            }
            throw new Error(errorMsg);
          }
          
          const assistantResponse = { role: 'assistant', content: data.response };
          setIsLoading(false);
          setIsStreaming(true);
          setMessages(prev => [...prev, assistantResponse]);
    
        } catch (err) {
          if (err.name === 'AbortError') {
            toast({ title: 'Geração cancelada', description: 'Você interrompeu a resposta da IA.' });
            setIsLoading(false);
            return;
          }
          const errorMessage = { role: 'assistant', content: `Desculpe, ocorreu um erro: ${err.message}` };
          setMessages(prev => [...prev, errorMessage]);
          toast({
            title: 'Erro na comunicação com o copiloto',
            description: err.message,
            variant: 'destructive',
          });
          setIsLoading(false);
          setIsStreaming(false);
        } finally {
          abortControllerRef.current = null;
        }
      };
    
      const handleStopGeneration = () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    
      if (!isReady && isLoading) {
        return (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
          </div>
        );
      }
    
      if (!isReady && !isLoading) {
        return (
          <div className="text-center p-8">
            <h2 className="text-2xl font-bold">Erro ao Carregar Copiloto</h2>
            <p className="text-muted-foreground">Não foi possível iniciar o copiloto para esta campanha.</p>
            <Button asChild className="mt-4"><Link to="/campanhas">Voltar para Campanhas</Link></Button>
          </div>
        );
      }
    
      const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);

      return (
        <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
          <header className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10">
            <div className="flex items-center">
              <Button asChild variant="ghost" size="icon" className="mr-4">
                <Link to="/campanhas"><ChevronLeft className="w-5 h-5" /></Link>
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Copiloto: {campaign?.name}
                </h1>
                {campaign?.clients?.name && <p className="text-sm text-muted-foreground">Cliente: {campaign.clients.name}</p>}
              </div>
            </div>
            
            {/* Seletor de IA */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">IA:</span>
              <Popover open={isAiSelectorOpen} onOpenChange={setIsAiSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-64 justify-between">
                    <div className="flex items-center gap-2">
                      {selectedIntegration && (
                        <div className={`w-2 h-2 rounded-full ${
                          selectedIntegration.source === 'personal' ? 'bg-green-500' : 'bg-blue-500'
                        }`} />
                      )}
                      <span>
                        {selectedIntegration ? `${selectedIntegration.name} (${selectedIntegration.default_model})` : "Selecione uma IA..."}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0">
                  <Command>
                    <CommandInput placeholder="Buscar IA..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma IA encontrada.</CommandEmpty>
                      <CommandGroup>
                        {llmIntegrations.map((integration) => (
                          <CommandItem
                            key={integration.id}
                            value={integration.name}
                            onSelect={() => {
                              setSelectedLlmId(integration.id);
                              setIsAiSelectorOpen(false);
                            }}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <div className={`w-2 h-2 rounded-full ${
                                integration.source === 'personal' ? 'bg-green-500' : 'bg-blue-500'
                              }`} />
                              <div className="flex flex-col flex-1">
                                <span className="font-medium">{integration.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {integration.default_model} • {integration.source === 'personal' ? 'Pessoal' : 'Global'}
                                </span>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </header>
    
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            <AnimatePresence>
              {messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-primary-foreground" />
                    </div>
                  )}
                  <div className={`max-w-2xl p-4 rounded-2xl prose prose-sm dark:prose-invert prose-p:my-2 prose-headings:my-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-muted rounded-bl-none'}`}>
                    {msg.role === 'assistant' && index === messages.length - 1 && isStreaming ? (
                      <StreamingMessage content={msg.content} onFinished={() => setIsStreaming(false)} />
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </AnimatePresence>
          </div>
          <div className="p-4 md:p-6 border-t bg-background">
            {isLoading || isStreaming ? (
              <div className="flex items-center justify-between w-full rounded-md border border-input bg-background px-4 py-2 min-h-[52px]">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Gerando...</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleStopGeneration}>
                  <Square className="w-4 h-4 mr-2" />
                  Parar
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="relative">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      handleSendMessage(e);
                    }
                  }}
                  placeholder={selectedLlmId ? "Converse com seu copiloto de campanha..." : "Selecione uma IA para começar a conversar..."}
                  className="pr-24 min-h-[52px] resize-none"
                  disabled={isLoading || isStreaming}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    <CornerDownLeft className="inline w-3 h-3" /> para enviar
                  </span>
                  <Button type="submit" size="icon" disabled={!input.trim() || !selectedLlmId}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      );
    };
    
    export default CampaignCopilot;