import React, { useState, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';
import '@reactflow/node-resizer/dist/style.css';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Play, Loader2, Eye, Sparkles, ChevronsUpDown, Settings } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import ContentViewModal from '@/components/flow-builder/modals/ContentViewModal';
import RefineWithAiModal from '@/components/flow-builder/modals/RefineWithAiModal';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAuth } from '@/contexts/SupabaseAuthContext';

const LlmIntegrationSelector = ({ integrations, selectedId, onSelect, disabled }) => {
    const [open, setOpen] = useState(false);
    const selectedIntegration = integrations.find(i => i.id === selectedId);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="flex-1 justify-between text-xs h-8" disabled={disabled}>
                    <span className="truncate">
                        {selectedIntegration ? selectedIntegration.name : "Selecione a IA"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Procurar conexão..." />
                    <CommandList>
                        <CommandEmpty>Nenhuma conexão encontrada.</CommandEmpty>
                        <CommandGroup>
                            {integrations.map((integration) => (
                                <CommandItem
                                    key={integration.id}
                                    value={integration.name}
                                    onSelect={() => {
                                        onSelect(integration.id);
                                        setOpen(false);
                                    }}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${integration.is_user_connection ? 'bg-green-500' : 'bg-blue-500'}`} />
                                        <span>{integration.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                            ({integration.is_user_connection ? 'Pessoal' : 'Global'})
                                        </span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};

const AgentNode = ({ id, data, isConnectable, selected }) => {
    const { onUpdateNodeData, modules, inputData, selectedModuleId, optionalText } = data;
    const { getLlmIntegrations, profile, user } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isRefineModalOpen, setIsRefineModalOpen] = useState(false);
    const [llmIntegrations, setLlmIntegrations] = useState([]);
    const [selectedLlmId, setSelectedLlmId] = useState(data.llm_integration_id || null);

    const handleModuleChange = (moduleId) => {
        const selectedModule = modules.find(m => m.id.toString() === moduleId);
        onUpdateNodeData(id, { 
            selectedModuleId: moduleId, 
            label: selectedModule ? `Agente: ${selectedModule.name}` : 'Agente de IA'
        });
    };

    const handleOptionalTextChange = (e) => {
        onUpdateNodeData(id, { optionalText: e.target.value });
    };

    // Fetch AI integrations similar to CampaignCopilot
    useEffect(() => {
        const fetchIntegrations = async () => {
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
                            source: 'personal'
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
                                source: 'global'
                            }));
                    }
                }

                // Combinar integrações (pessoais primeiro, globais depois)
                const allIntegrations = [
                    ...userConnections,
                    ...globalIntegrations
                ];

                setLlmIntegrations(allIntegrations);

                // Auto-select first available AI if none selected
                if (!selectedLlmId && allIntegrations.length > 0) {
                    const defaultIntegration = allIntegrations[0];
                    setSelectedLlmId(defaultIntegration.id);
                    onUpdateNodeData(id, { llm_integration_id: defaultIntegration.id });
                }
            } catch (error) {
                console.error('Erro ao buscar integrações de IA:', error);
                toast({
                    title: 'Erro ao carregar IAs',
                    description: 'Não foi possível carregar as conexões de IA disponíveis.',
                    variant: 'destructive',
                });
            }
        };

        fetchIntegrations();
    }, [user, profile, selectedLlmId, onUpdateNodeData, id, toast]);

    const handleSelectLlm = (llmId) => {
        setSelectedLlmId(llmId);
        onUpdateNodeData(id, { llm_integration_id: llmId });
        toast({
            title: "Conexão de IA alterada!",
            description: "O agente agora usará a nova conexão selecionada."
        });
    };

    const handleGenerateContent = async (refinePrompt = null) => {
        if (!selectedModuleId) {
            toast({
                title: 'Nenhum módulo selecionado',
                description: 'Por favor, selecione um agente de IA para gerar o conteúdo.',
                variant: 'destructive',
            });
            return;
        }

        if (!selectedLlmId) {
            toast({
                title: 'Nenhuma IA selecionada',
                description: 'Por favor, selecione uma conexão de IA antes de gerar o conteúdo.',
                variant: 'destructive',
            });
            return;
        }

        setIsLoading(true);
        if (!refinePrompt) {
            onUpdateNodeData(id, { generatedText: null });
        }

        try {
            // Find the selected AI integration
            const selectedIntegration = llmIntegrations.find(i => i.id === selectedLlmId);
            if (!selectedIntegration) {
                throw new Error('Conexão de IA selecionada não encontrada');
            }

            // Combine o texto opcional com as entradas existentes
            let userTextForFunction = data.optionalText || '';
            if (inputData?.video_transcriber?.data?.transcript_text) {
                userTextForFunction += `\n\nContexto da Transcrição:\n${inputData.video_transcriber.data.transcript_text}`;
            }

            // Get module details for context
            const selectedModule = modules.find(m => m.id.toString() === selectedModuleId);
            const modulePrompt = selectedModule?.prompt || '';

            // Construct detailed prompt with module context
            const detailedPrompt = `Módulo: ${selectedModule?.name || 'Agente de IA'}
Prompt do Módulo: ${modulePrompt}

Contexto do Cliente: ${inputData?.client?.data ? JSON.stringify(inputData.client.data, null, 2) : 'N/A'}
Contexto da Campanha: ${inputData?.campaign?.data ? JSON.stringify(inputData.campaign.data, null, 2) : 'N/A'}
Fonte de Conhecimento: ${inputData?.knowledge?.data ? JSON.stringify(inputData.knowledge.data, null, 2) : 'N/A'}

Instruções Adicionais: ${refinePrompt ? `Refine o seguinte texto:\n\n${data.generatedText}\n\nInstrução: ${refinePrompt}` : userTextForFunction}`;

            // Try generic-ai-chat first (preferred method)
            try {
                const { data: functionData, error } = await supabase.functions.invoke('generic-ai-chat', {
                    body: JSON.stringify({
                        messages: [
                            {
                                role: 'user',
                                content: detailedPrompt
                            }
                        ],
                        llm_integration_id: selectedLlmId,
                        is_user_connection: selectedIntegration.is_user_connection,
                    }),
                });

                if (error) throw new Error(error.message);

                const generatedText = functionData.response || functionData.content || 'Conteúdo gerado com sucesso!';
                
                onUpdateNodeData(id, { 
                    generatedText: generatedText,
                    output: { 
                        id: `generated_${Date.now()}`,
                        data: generatedText,
                        moduleName: selectedModule?.name || 'Agente de IA',
                    }
                });

                toast({
                    title: refinePrompt ? 'Conteúdo Refinado!' : 'Conteúdo Gerado!',
                    description: `O agente "${selectedModule?.name || 'Agente de IA'}" concluiu a tarefa usando ${selectedIntegration.name}.`,
                });

            } catch (genericError) {
                console.warn('generic-ai-chat failed, trying generate-content:', genericError);
                
                // Fallback to generate-content
                const payload = {
                    module_id: selectedModuleId,
                    campaign_id: inputData?.campaign?.id,
                    client_id: inputData?.client?.id,
                    knowledge_source_id: inputData?.knowledge?.id,
                    user_text: refinePrompt ? `Refine o seguinte texto:\n\n${data.generatedText}\n\nInstrução: ${refinePrompt}` : userTextForFunction,
                };

                const { data: functionData, error } = await supabase.functions.invoke('generate-content', {
                    body: JSON.stringify(payload),
                });

                if (error) throw new Error(error.message);

                onUpdateNodeData(id, { 
                    generatedText: functionData.generatedText,
                    output: { 
                        id: functionData.outputId,
                        data: functionData.generatedText,
                        moduleName: functionData.moduleName,
                    }
                });

                toast({
                    title: refinePrompt ? 'Conteúdo Refinado!' : 'Conteúdo Gerado!',
                    description: `O agente "${functionData.moduleName}" concluiu a tarefa.`,
                });
            }

        } catch (err) {
            toast({
                title: 'Erro ao processar conteúdo',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
            setIsRefineModalOpen(false);
        }
    };

    const isGenerationDisabled = !selectedModuleId || !selectedLlmId || isLoading;
    const hasContent = data.generatedText && !isLoading;

    return (
        <>
            <div className="react-flow__node-default h-full w-full rounded-lg border-2 border-teal-500/50 shadow-lg bg-card text-card-foreground flex flex-col">
                <NodeResizer 
                    minWidth={320} 
                    minHeight={400}
                    maxWidth={800}
                    maxHeight={700}
                    isVisible={selected} 
                    lineClassName="border-teal-500"
                    handleClassName="bg-teal-500"
                />
                <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="w-3 h-3 !bg-teal-500" />
                <CardHeader className="flex-row items-center justify-between space-x-2 p-3 bg-teal-500/10">
                    <div className="flex items-center space-x-2">
                        <Bot className="w-5 h-5 text-teal-500" />
                        <CardTitle className="text-base">{data.label || 'Agente de IA'}</CardTitle>
                    </div>
                    <Button onClick={() => handleGenerateContent()} disabled={isGenerationDisabled} size="sm">
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        <span className="ml-2">Gerar</span>
                    </Button>
                </CardHeader>
                <CardContent className="p-3 flex-grow flex flex-col min-h-0 space-y-2">
                    <Select onValueChange={handleModuleChange} value={selectedModuleId} disabled={isLoading}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione um agente..." />
                        </SelectTrigger>
                        <SelectContent>
                            {(modules || []).map((module) => (
                                <SelectItem key={module.id} value={module.id.toString()}>
                                    {module.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    
                    {/* Seletor de IA - aparece apenas quando agente estiver selecionado */}
                    {selectedModuleId && !profile?.has_custom_ai_access && (
                        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border">
                            <Settings className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-muted-foreground">IA:</span>
                            <LlmIntegrationSelector
                                integrations={llmIntegrations}
                                selectedId={selectedLlmId}
                                onSelect={handleSelectLlm}
                                disabled={isLoading}
                            />
                        </div>
                    )}
                    
                    <Textarea
                        placeholder="Instruções opcionais para a IA..."
                        value={optionalText || ''}
                        onChange={handleOptionalTextChange}
                        className="nodrag h-24 text-sm"
                        disabled={isLoading}
                    />
                    <div className="flex-grow border rounded-md min-h-0 relative">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full w-full nodrag">
                                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap p-2 text-left">
                                    {data.generatedText || "O conteúdo gerado aparecerá aqui."}
                                </div>
                            </ScrollArea>
                        )}
                         {hasContent && (
                            <div className="absolute top-2 right-2 flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-background/50 backdrop-blur-sm" onClick={() => setIsRefineModalOpen(true)}>
                                    <Sparkles className="h-4 w-4 text-primary" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-background/50 backdrop-blur-sm" onClick={() => setIsViewModalOpen(true)}>
                                    <Eye className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
                <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="w-3 h-3 !bg-teal-500" />
            </div>
            {hasContent && (
                <>
                    <ContentViewModal
                        isOpen={isViewModalOpen}
                        onClose={() => setIsViewModalOpen(false)}
                        title="Visualizar Conteúdo Gerado"
                        content={data.generatedText}
                        onRefineClick={() => setIsRefineModalOpen(true)}
                    />
                    <RefineWithAiModal
                        isOpen={isRefineModalOpen}
                        onClose={() => setIsRefineModalOpen(false)}
                        onRefine={handleGenerateContent}
                        isLoading={isLoading}
                    />
                </>
            )}
        </>
    );
};

export default AgentNode;