import React, { useState, useEffect, useRef, useCallback } from 'react';
    import { motion } from 'framer-motion';
    import { Send, Menu, Loader2, Square } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Textarea } from '@/components/ui/textarea';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useMediaQuery } from '@/hooks/use-media-query';
    import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
    import AiChatSidebar from '@/components/ai-chat/AiChatSidebar';
    import AiChatMessage from '@/components/ai-chat/AiChatMessage';
    import AiChatWelcome from '@/components/ai-chat/AiChatWelcome';
    import { ScrollArea } from '@/components/ui/scroll-area';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

    const AiChat = ({ auth }) => {
      const { user, profile } = auth;
      const [sessions, setSessions] = useState([]);
      const [activeSessionId, setActiveSessionId] = useState(null);
      const [messages, setMessages] = useState([]);
      const [input, setInput] = useState('');
      const [isLoading, setIsLoading] = useState(false);
      const [isStreaming, setIsStreaming] = useState(false);
      const [isSessionsLoading, setIsSessionsLoading] = useState(true);
      const [llmIntegrations, setLlmIntegrations] = useState([]);
      const [selectedLlmId, setSelectedLlmId] = useState(null);
      const [isSidebarOpen, setIsSidebarOpen] = useState(true);
      const [sessionToDelete, setSessionToDelete] = useState(null);

      const { toast } = useToast();
      const messagesEndRef = useRef(null);
      const abortControllerRef = useRef(null);
      const isDesktop = useMediaQuery("(min-width: 768px)");

      const fetchIntegrations = useCallback(async () => {
        if (!user) return;
        try {
          // 1) Conexões pessoais ativas com text_generation
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

          // 2) Integrações globais apenas se não houver pessoais
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
        } catch (e) {
          // falha silenciosa com toast leve
          // useToast já está instanciado
          toast({ title: 'Erro ao carregar IAs', description: 'Não foi possível carregar as conexões de IA.', variant: 'destructive' });
        }
      }, [user, selectedLlmId, toast]);

      const fetchSessions = useCallback(async () => {
        setIsSessionsLoading(true);
        if (!user) return;
        
        // Buscar todas as sessões do usuário
        const { data, error } = await supabase
          .from('ai_chat_sessions')
          .select('id, title, llm_integration_id, user_ai_connection_id, updated_at, messages')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) {
          toast({ title: "Erro ao buscar conversas", description: error.message, variant: "destructive" });
          setSessions([]);
        } else {
          // Filtrar sessões que NÃO são do Chat IA
          // Identificar padrões de outras páginas que não devem aparecer aqui
          const chatIaSessions = (data || []).filter(session => {
            if (!session.messages || session.messages.length === 0) {
              // Sessões sem mensagens podem ser do Chat IA (novas)
              return true;
            }

            const title = session.title?.toLowerCase() || '';
            const messagesText = JSON.stringify(session.messages || []).toLowerCase();
            
            // Padrões que indicam que NÃO é do Chat IA:
            const isNotChatIa = 
              // Gerador de Conteúdo - padrão [CONTEXTO] com módulo/cliente/campanha
              messagesText.includes('[contexto]') ||
              messagesText.includes('módulo:') ||
              messagesText.includes('cliente:') && messagesText.includes('campanha:') ||
              title.includes('[contexto]') ||
              // Client Onboarding - padrões de análise de cadastro
              messagesText.includes('analise este cadastro') ||
              messagesText.includes('analisar cadastro') ||
              messagesText.includes('estrategista de marketing') && messagesText.includes('cadastros') ||
              title.includes('analise este cadastro') ||
              title.includes('analisar cadastro') ||
              // Site Builder - mensagem inicial típica
              messagesText.includes('construir sua página') ||
              messagesText.includes('como posso te ajudar a construir') ||
              // Geração de conteúdo para módulos (padrão system message com base_prompt)
              session.messages.some(msg => 
                msg.role === 'system' && 
                (msg.content?.includes('módulo') || msg.content?.includes('gerar conteúdo'))
              ) ||
              // Títulos muito longos ou específicos de geração
              (title.length > 100 && (
                title.includes('gerar') || 
                title.includes('conteúdo') || 
                title.includes('módulo')
              ));
            
            // Se não tiver nenhum desses padrões, assumir que é do Chat IA
            return !isNotChatIa;
          });

          setSessions(chatIaSessions);
        }
        setIsSessionsLoading(false);
      }, [user, toast]);

      useEffect(() => {
        fetchIntegrations();
        fetchSessions();
      }, [fetchIntegrations, fetchSessions]);

      const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      };

      useEffect(scrollToBottom, [messages, isLoading, isStreaming]);
      
      useEffect(() => {
        setIsSidebarOpen(isDesktop);
      }, [isDesktop]);

      const handleSelectSession = async (sessionId) => {
        setActiveSessionId(sessionId);
        setIsLoading(true);
        setMessages([]);
        const { data, error } = await supabase
          .from('ai_chat_sessions')
          .select('messages, llm_integration_id, user_ai_connection_id')
          .eq('id', sessionId)
          .single();

        if (error) {
          toast({ title: 'Erro ao carregar conversa', description: error.message, variant: 'destructive' });
          setMessages([]);
        } else {
          setMessages(data.messages || []);
          // sempre restaurar a IA usada na sessão, independente do tipo de acesso
          const restored = data.llm_integration_id || data.user_ai_connection_id;
          if (restored) setSelectedLlmId(restored);
        }
        setIsLoading(false);
        if (!isDesktop) setIsSidebarOpen(false);
      };

      const handleNewConversation = () => {
        setActiveSessionId(null);
        setMessages([]);
        if (!isDesktop) setIsSidebarOpen(false);
      };

      const handleDeleteRequest = (sessionId) => {
        setSessionToDelete(sessionId);
      };

      const handleConfirmDelete = async () => {
        if (!sessionToDelete) return;

        const { error } = await supabase
            .from('ai_chat_sessions')
            .delete()
            .eq('id', sessionToDelete);

        if (error) {
            toast({ title: 'Erro ao excluir conversa', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Conversa excluída com sucesso!' });
            setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
            if (activeSessionId === sessionToDelete) {
                handleNewConversation();
            }
        }
        setSessionToDelete(null);
      };

      const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading || isStreaming) return;
        
        if (!selectedLlmId) {
            toast({ title: "Nenhuma conexão de IA ativa", description: "Verifique se você tem uma conexão de IA ativa nas configurações ou selecione uma.", variant: "destructive" });
            return;
        }

        const userMessage = { role: 'user', content: input };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        const originalInput = input;
        setInput('');
        setIsLoading(true);
        setIsStreaming(false);

        abortControllerRef.current = new AbortController();
        const { signal } = abortControllerRef.current;

        const currentIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
        if (!currentIntegration) {
          toast({ title: "Erro", description: "A conexão de IA selecionada não foi encontrada.", variant: "destructive" });
          setIsLoading(false);
          setMessages(prev => prev.slice(0, -1));
          setInput(originalInput);
          return;
        }

        try {
          const { data, error: invokeError } = await supabase.functions.invoke('generic-ai-chat', {
            body: JSON.stringify({
              session_id: activeSessionId,
              messages: newMessages.map(({ role, content }) => ({ role, content })),
              llm_integration_id: selectedLlmId,
              is_user_connection: currentIntegration.is_user_connection,
              context: 'chat_ia', // Identificar que esta sessão é do Chat IA
            }),
            signal,
          });
          
          if (invokeError) {
            if (invokeError.name === 'AbortError') {
              toast({ title: 'Geração cancelada', description: 'Você interrompeu a resposta da IA.' });
              setIsLoading(false);
              return;
            }
             let errorMsg = invokeError.message || 'Ocorreu um erro desconhecido.';
             const context = invokeError.context || {};
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
          
          setIsLoading(false);
          setIsStreaming(true);
          setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);

          if (data.session_id && !activeSessionId) {
            setActiveSessionId(data.session_id);
            await fetchSessions();
          }
          
        } catch (err) {
          if (err.name === 'AbortError') {
            toast({ title: 'Geração cancelada', description: 'Você interrompeu a resposta da IA.' });
          } else {
            setMessages(prev => prev.slice(0, -1));
            setInput(originalInput);
            toast({
              title: 'Erro na comunicação com a IA',
              description: err.message,
              variant: 'destructive',
            });
          }
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

      return (
        <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] flex bg-muted/20">
          <ResizablePanelGroup direction="horizontal" className="w-full">
            {isSidebarOpen && isDesktop && (
                <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
                    <AiChatSidebar 
                        sessions={sessions}
                        activeSessionId={activeSessionId}
                        isSessionsLoading={isSessionsLoading}
                        onSelectSession={handleSelectSession}
                        onNewConversation={handleNewConversation}
                        onDeleteSession={handleDeleteRequest}
                        isDesktop={isDesktop}
                        onClose={() => setIsSidebarOpen(false)}
                        onSessionUpdate={fetchSessions}
                    />
                </ResizablePanel>
            )}
            {isSidebarOpen && isDesktop && <ResizableHandle withHandle />}

            <ResizablePanel defaultSize={75}>
                <main className="flex-1 flex flex-col bg-background h-full relative">
                    <div className="p-4 border-b flex items-center justify-between bg-background md:hidden sticky top-0 z-10">
                        <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
                            <Menu className="h-5 w-5" />
                        </Button>
                        <h1 className="text-lg font-semibold">Neuro Ápice</h1>
                        <div className="w-8"></div>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-6 space-y-6 max-w-4xl mx-auto">
                        {!activeSessionId && messages.length === 0 && (
                            <AiChatWelcome 
                                integrations={llmIntegrations}
                                selectedId={selectedLlmId}
                                onSelect={setSelectedLlmId}
                                showSelector={profile?.has_custom_ai_access}
                            />
                        )}
                        
                        {messages.map((msg, index) => (
                            <AiChatMessage 
                              key={index} 
                              message={msg} 
                              isStreaming={index === messages.length - 1 && isStreaming}
                              onStreamingFinished={() => setIsStreaming(false)}
                            />
                        ))}

                        {isLoading && !isStreaming && <AiChatMessage.Loading />}
                        <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>

                    <div className="p-4 border-t bg-card/80 backdrop-blur-sm">
                        <div className="max-w-4xl mx-auto">
                          {isLoading || isStreaming ? (
                            <div className="flex items-center justify-between w-full rounded-full border border-input bg-background px-4 py-2 min-h-[52px] shadow-lg">
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
                                        e.preventDefault();
                                        handleSendMessage(e);
                                        }
                                    }}
                                    placeholder="Envie uma mensagem..."
                                    className="pr-12 min-h-[52px] resize-none rounded-full py-3.5 px-5 shadow-lg border-2 border-transparent focus-visible:border-primary transition-colors"
                                    disabled={isLoading || isStreaming}
                                />
                                <Button type="submit" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full" disabled={!input.trim() || isLoading || isStreaming}>
                                    <Send className="w-4 h-4" />
                                </Button>
                            </form>
                          )}
                        </div>
                    </div>
                </main>
            </ResizablePanel>
          </ResizablePanelGroup>
            
            {!isDesktop && isSidebarOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsSidebarOpen(false)}
                    className="fixed inset-0 bg-black/50 z-40"
                />
            )}
            {!isDesktop && isSidebarOpen && (
                <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="fixed top-0 left-0 bottom-0 w-[85%] max-w-sm bg-background z-50"
                >
                    <AiChatSidebar 
                        sessions={sessions}
                        activeSessionId={activeSessionId}
                        isSessionsLoading={isSessionsLoading}
                        onSelectSession={handleSelectSession}
                        onNewConversation={handleNewConversation}
                        onDeleteSession={handleDeleteRequest}
                        isDesktop={isDesktop}
                        onClose={() => setIsSidebarOpen(false)}
                        onSessionUpdate={fetchSessions}
                    />
                </motion.div>
            )}

          <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação não pode ser desfeita. Isso excluirá permanentemente a conversa e
                        removerá os dados de nossos servidores.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setSessionToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    };

    export default AiChat;