import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, X, LayoutList, MessageSquare, Eye } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

import ModulePanel from '@/components/site-builder/ModulePanel';
import ChatPanel from '@/components/site-builder/ChatPanel';
import PreviewPanel from '@/components/site-builder/PreviewPanel';
import ImageBankModal from '@/components/site-builder/ImageBankModal';

const SiteBuilderModal = ({ isOpen, onClose, projectId, flowId, nodeId }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [project, setProject] = useState(null);
  const [pageStructure, setPageStructure] = useState([]);
  const [activeModule, setActiveModule] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImageBankOpen, setIsImageBankOpen] = useState(false);
  const selectedElementRef = useRef(null);
  const [isModulesCollapsed, setIsModulesCollapsed] = useState(false);
  const [flowContext, setFlowContext] = useState(null);
  const [activeView, setActiveView] = useState('modules'); // For mobile
  const [isBuilding, setIsBuilding] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchFlowContext = useCallback(async () => {
    if (!flowId || !nodeId) {
      setFlowContext(null);
      return;
    }

    const { data: flowData, error: flowError } = await supabase
      .from('creative_flows')
      .select('nodes, edges')
      .eq('id', flowId)
      .single();

    if (flowError || !flowData) {
      console.warn("Could not load flow context:", flowError?.message);
      setFlowContext(null);
      return;
    }

    const { nodes, edges } = flowData;
    const thisNode = nodes.find(n => n.id === nodeId);
    const consumedNodeIds = thisNode?.data?.consumedNodeIds || [];
    
    const inputEdges = edges.filter(edge => edge.target === nodeId);
    let sourceNodeIds = inputEdges.map(edge => edge.source);

    // Add manually selected nodes if any, avoiding duplicates
    if(consumedNodeIds.length > 0) {
      const allSourceIds = new Set([...sourceNodeIds, ...consumedNodeIds]);
      sourceNodeIds = Array.from(allSourceIds);
    }
    
    if (sourceNodeIds.length === 0) {
      setFlowContext(null);
      return;
    }
    
    const context = {};
    sourceNodeIds.forEach(sourceId => {
      const sourceNode = nodes.find(n => n.id === sourceId);
      if (sourceNode && sourceNode.data.output) {
        let key = sourceNode.type;
        if(sourceNode.type === 'agent' || sourceNode.type === 'chat') {
            key = `${key}_${sourceNode.data.label || sourceNode.id.slice(0,4)}`;
        } else if (sourceNode.type === 'client' || sourceNode.type === 'campaign') {
            key = `${key}_${sourceNode.data.output.data.name.replace(/\s+/g, '_')}`;
        }
        context[key] = sourceNode.data.output;
      }
    });
    setFlowContext(context);
  }, [flowId, nodeId]);

  const fetchProject = useCallback(async () => {
    if (!user || !projectId) return;

    setIsLoading(true);
    const { data, error } = await supabase
      .from('site_projects')
      .select('id, name, page_structure, chat_history, user_id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      toast({
        title: 'Erro ao carregar projeto',
        description: error?.message || 'Projeto não encontrado ou você não tem permissão.',
        variant: 'destructive',
      });
      onClose();
    } else {
      setProject(data);
      const structure = data.page_structure || [];
      setPageStructure(structure);
      if (structure.length > 0 && !activeModule) {
        setActiveModule(structure[0]);
      }
      await fetchFlowContext();
    }
    setIsLoading(false);
  }, [projectId, user, toast, onClose, activeModule, fetchFlowContext]);

  useEffect(() => {
    if (isOpen) {
      fetchProject();
    }
  }, [isOpen, fetchProject]);

  useEffect(() => {
    selectedElementRef.current = selectedElement;
  }, [selectedElement]);

  const updateProjectInDb = useCallback(async (updates) => {
    const { error } = await supabase
      .from('site_projects')
      .update(updates)
      .eq('id', projectId);
    
    if (error) {
      toast({
        title: 'Erro ao salvar progresso',
        description: 'Não foi possível salvar as últimas alterações.',
        variant: 'destructive',
      });
    }
  }, [projectId, toast]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setPageStructure((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newStructure = arrayMove(items, oldIndex, newIndex);
        updateProjectInDb({ page_structure: newStructure });
        return newStructure;
      });
    }
  };

  const onImageSelect = (image) => {
    const currentSelectedElement = selectedElementRef.current;
    if (!currentSelectedElement || currentSelectedElement.type !== 'image') {
      toast({
        title: 'Nenhuma imagem selecionada no editor',
        description: 'Por favor, clique em uma imagem na página para substituí-la.',
        variant: 'destructive',
      });
      return;
    }

    const { signedUrl } = image;
    
    const newPageStructure = JSON.parse(JSON.stringify(pageStructure));
    let elementFoundAndUpdated = false;

    for (const module of newPageStructure) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = module.html;
      const imgToUpdate = tempDiv.querySelector(`img[data-id="${currentSelectedElement.dataId}"]`);
      
      if (imgToUpdate) {
        imgToUpdate.src = signedUrl;
        imgToUpdate.alt = image.alt_text || '';
        module.html = tempDiv.innerHTML;
        elementFoundAndUpdated = true;
        break;
      }
    }

    if (elementFoundAndUpdated) {
      setPageStructure(newPageStructure);
      updateProjectInDb({ page_structure: newPageStructure });
      toast({ title: 'Imagem atualizada com sucesso!' });
    } else {
      toast({
        title: 'Erro ao atualizar imagem',
        description: 'Não foi possível encontrar o elemento da imagem na estrutura da página.',
        variant: 'destructive',
      });
    }

    setIsImageBankOpen(false);
    setSelectedElement(null);
  };

  const renderDesktopView = () => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <ResizablePanelGroup direction="horizontal" className="flex-grow">
        <ResizablePanel 
            defaultSize={20} 
            minSize={15} 
            maxSize={30}
            collapsible={true}
            collapsedSize={4}
            onCollapse={() => setIsModulesCollapsed(true)}
            onExpand={() => setIsModulesCollapsed(false)}
            className={isModulesCollapsed ? "min-w-[50px] transition-all duration-300 ease-in-out" : ""}
        >
          <SortableContext items={pageStructure} strategy={verticalListSortingStrategy}>
            <ModulePanel
              isCollapsed={isModulesCollapsed}
              modules={pageStructure}
              setModules={setPageStructure}
              activeModule={activeModule}
              setActiveModule={setActiveModule}
              updateProjectInDb={updateProjectInDb}
            />
          </SortableContext>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={35} minSize={25}>
          <ChatPanel
            pageStructure={pageStructure}
            setPageStructure={setPageStructure}
            setIsBuilding={setIsBuilding}
            flowContext={flowContext}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={45} minSize={30}>
          <PreviewPanel
            pageStructure={pageStructure}
            setPageStructure={setPageStructure}
            selectedElement={selectedElement}
            setSelectedElement={setSelectedElement}
            onOpenImageBank={() => setIsImageBankOpen(true)}
            isBuilding={isBuilding}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </DndContext>
  );

  const renderMobileView = () => {
    const commonProps = {
      project, pageStructure, setPageStructure, activeModule, setActiveModule,
      selectedElement, setSelectedElement, updateProjectInDb,
      onOpenImageBank: () => setIsImageBankOpen(true),
    };

    const renderActiveView = () => {
      switch (activeView) {
        case 'modules':
          return (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pageStructure} strategy={verticalListSortingStrategy}>
                <ModulePanel {...commonProps} />
              </SortableContext>
            </DndContext>
          );
        case 'chat': return <ChatPanel pageStructure={pageStructure} setPageStructure={setPageStructure} setIsBuilding={setIsBuilding} flowContext={flowContext} />;
        case 'preview': return <PreviewPanel pageStructure={pageStructure} setPageStructure={setPageStructure} selectedElement={selectedElement} setSelectedElement={setSelectedElement} onOpenImageBank={() => setIsImageBankOpen(true)} isBuilding={isBuilding} />;
        default: return null;
      }
    };

    return (
      <div className="flex flex-col h-full">
        <main className="flex-grow overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {renderActiveView()}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="h-20 bg-background/80 backdrop-blur-lg border-t border-border">
          <div className="grid h-full max-w-lg grid-cols-3 mx-auto">
            {[
              { view: 'modules', icon: LayoutList, label: 'Módulos' },
              { view: 'chat', icon: MessageSquare, label: 'Chat IA' },
              { view: 'preview', icon: Eye, label: 'Preview' },
            ].map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={cn(
                  "inline-flex flex-col items-center justify-center px-5 hover:bg-muted group",
                  activeView === view ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </footer>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 gap-0 border-0">
        {isLoading || !project ? (
          <div className="flex items-center justify-center h-full bg-background">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col h-full bg-background text-foreground">
            <header className="p-2 border-b flex items-center justify-between gap-4">
              <h1 className="text-lg font-semibold pl-4">{project?.name}</h1>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </header>
            {isMobile ? renderMobileView() : renderDesktopView()}
          </div>
        )}
        <ImageBankModal
          isOpen={isImageBankOpen}
          onClose={() => {
            setIsImageBankOpen(false);
            setSelectedElement(null);
          }}
          projectId={projectId}
          onImageSelect={onImageSelect}
        />
      </DialogContent>
    </Dialog>
  );
};

export default SiteBuilderModal;