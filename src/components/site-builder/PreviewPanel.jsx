import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Smartphone, Tablet, Monitor, Library, Expand, HardHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import EditableTextPopover from '@/components/site-builder/EditableTextPopover';
import { useParams } from 'react-router-dom';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Progress } from '@/components/ui/progress';

const BuildingOverlay = ({ duration = 30 }) => {
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 100 / duration, 100));
    }, 1000);

    const timerInterval = setInterval(() => {
      setTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(timerInterval);
    };
  }, [duration]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/70 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-white"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
        className="text-center"
      >
        <HardHat className="w-16 h-16 mx-auto text-primary animate-bounce" />
        <h3 className="text-2xl font-bold mt-4">Construindo sua página...</h3>
        <p className="text-muted-foreground mt-2">A IA está gerando o novo código. Aguarde um momento.</p>
      </motion.div>
      <div className="w-1/2 max-w-sm mt-8">
        <Progress value={progress} className="h-2" />
        <p className="text-center text-sm text-muted-foreground mt-2">
          Tempo estimado: {timeLeft}s
        </p>
      </div>
    </motion.div>
  );
};


const PreviewPanel = ({ 
  htmlContent, setHtmlContent,           // Modo standalone
  pageStructure, setPageStructure,       // Modo modal
  selectedElement, setSelectedElement, 
  onOpenImageBank, isBuilding 
}) => {
  const [view, setView] = useState('desktop');
  const iframeRef = useRef(null);
  const { toast } = useToast();
  const { projectId } = useParams();
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Detecção automática do modo de uso
  const isModalMode = !htmlContent && pageStructure;
  const isStandaloneMode = htmlContent && !pageStructure;

  // Converte pageStructure para HTML quando estiver no modal
  const getHtmlContent = () => {
    if (isStandaloneMode) {
      return htmlContent;
    }
    if (isModalMode && pageStructure) {
      return pageStructure.map(module => module.html).join('');
    }
    return '';
  };

  const deviceViews = {
    mobile: 'w-[375px] h-[667px]',
    tablet: 'w-[768px] h-[1024px]',
    desktop: 'w-full h-full',
  };

  useEffect(() => {
    if(isMobile) {
        setView('mobile');
    }
  }, [isMobile]);

  const updateIframeContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const currentHtmlContent = getHtmlContent();
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { margin: 0; font-family: sans-serif; }
          [data-id]:hover { outline: 2px dashed #9ca3af; outline-offset: 2px; cursor: pointer; }
          .selected-element { box-shadow: 0 0 0 2px #3b82f6 !important; cursor: pointer !important; }
        </style>
      </head>
      <body>
        <div id="root">${currentHtmlContent}</div>
      </body>
      </html>
    `;

    iframe.srcdoc = fullHtml;
  }, [htmlContent, pageStructure, getHtmlContent]);

  const clearSelection = useCallback(() => {
    const iframeDoc = iframeRef.current?.contentDocument;
    if (iframeDoc) {
      iframeDoc.querySelectorAll('.selected-element').forEach(el => el.classList.remove('selected-element'));
    }
    setSelectedElement(null);
  }, [setSelectedElement]);
  
  const handleElementClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    
    clearSelection();

    const dataId = target.getAttribute('data-id');
    const dataType = target.getAttribute('data-type');
    
    if (dataId) {
      target.classList.add('selected-element');
      if (dataType === 'text' || dataType === 'heading' || dataType === 'button') {
        setSelectedElement({
          dataId,
          type: dataType,
          content: target.innerHTML,
          tagName: target.tagName,
          target: () => iframeRef.current.contentDocument.querySelector(`[data-id="${dataId}"]`),
        });
      } else if (target.tagName.toLowerCase() === 'img') {
        setSelectedElement({
          dataId,
          type: 'image',
          target: () => iframeRef.current.contentDocument.querySelector(`[data-id="${dataId}"]`),
        });
        onOpenImageBank();
      } else {
        setSelectedElement(null);
      }
    } else {
      setSelectedElement(null);
    }
  }, [clearSelection, setSelectedElement, onOpenImageBank]);

  const handlePopoverSave = (newContent) => {
    if (!selectedElement) return;

    if (isStandaloneMode && setHtmlContent) {
      setHtmlContent(prevContent => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = prevContent;
          const elToUpdate = tempDiv.querySelector(`[data-id="${selectedElement.dataId}"]`);
          if (elToUpdate) {
              elToUpdate.innerHTML = newContent;
              toast({ title: 'Texto atualizado com sucesso!' });
              return tempDiv.innerHTML;
          } else {
              toast({ title: 'Erro ao atualizar', description: 'Não foi possível encontrar o elemento para salvar.', variant: 'destructive'});
              return prevContent;
          }
      });
    } else if (isModalMode && setPageStructure) {
      setPageStructure(prevStructure => {
        return prevStructure.map(module => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = module.html;
          const elToUpdate = tempDiv.querySelector(`[data-id="${selectedElement.dataId}"]`);
          if (elToUpdate) {
              elToUpdate.innerHTML = newContent;
              toast({ title: 'Texto atualizado com sucesso!' });
              return { ...module, html: tempDiv.innerHTML };
          }
          return module;
        });
      });
    }

    clearSelection();
  };

  const handleElementRemove = () => {
    if (!selectedElement) return;
  
    if (isStandaloneMode && setHtmlContent) {
      setHtmlContent(prevContent => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = prevContent;
          const elToRemove = tempDiv.querySelector(`[data-id="${selectedElement.dataId}"]`);
          if (elToRemove) {
              elToRemove.remove();
              toast({ title: 'Elemento removido com sucesso!' });
              return tempDiv.innerHTML;
          } else {
              toast({ title: 'Erro ao remover', description: 'Não foi possível encontrar o elemento para remover.', variant: 'destructive' });
              return prevContent;
          }
      });
    } else if (isModalMode && setPageStructure) {
      setPageStructure(prevStructure => {
        return prevStructure.map(module => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = module.html;
          const elToRemove = tempDiv.querySelector(`[data-id="${selectedElement.dataId}"]`);
          if (elToRemove) {
              elToRemove.remove();
              toast({ title: 'Elemento removido com sucesso!' });
              return { ...module, html: tempDiv.innerHTML };
          }
          return module;
        });
      });
    }
  
    clearSelection();
  };
  
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
        const doc = iframe.contentDocument;
        if (doc && doc.body) {
            doc.body.addEventListener('click', handleElementClick);
        }
    };

    iframe.addEventListener('load', handleLoad);
    updateIframeContent();

    return () => {
        const doc = iframe?.contentDocument;
        if (doc && doc.body) {
            doc.body.removeEventListener('click', handleElementClick);
        }
        if (iframe) {
            iframe.removeEventListener('load', handleLoad);
        }
    };
  }, [htmlContent, pageStructure, handleElementClick, updateIframeContent]);

  const handleDownload = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    
    const blob = new Blob([iframe.srcdoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Download iniciado!", description: "Seu arquivo index.html está sendo baixado." });
  };

  const handleExpandPreview = () => {
    window.open(`/site-preview/${projectId}`, '_blank');
  };

  return (
    <div className="flex flex-col h-full bg-muted/20 relative">
      <header className="flex items-center justify-between p-2 border-b bg-background">
        {!isMobile && (
            <div className="flex items-center gap-1">
            <Button variant={view === 'mobile' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('mobile')}>
                <Smartphone className="h-5 w-5" />
            </Button>
            <Button variant={view === 'tablet' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('tablet')}>
                <Tablet className="h-5 w-5" />
            </Button>
            <Button variant={view === 'desktop' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('desktop')}>
                <Monitor className="h-5 w-5" />
            </Button>
            </div>
        )}
        <div className="flex items-center gap-2 w-full justify-end">
           <Button variant="outline" onClick={onOpenImageBank}>
              <Library className="mr-2 h-4 w-4" />
              Biblioteca
            </Button>
          <Button variant="outline" size="icon" onClick={handleExpandPreview}>
            <Expand className="h-4 w-4" />
            <span className="sr-only">Expandir Preview</span>
          </Button>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Baixar
          </Button>
        </div>
      </header>
      <main className="flex-grow p-4 flex items-center justify-center overflow-auto">
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`bg-white shadow-lg transition-all duration-300 ease-in-out ${deviceViews[view]}`}
        >
          <iframe
            ref={iframeRef}
            title="Preview do Site"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </motion.div>
        {selectedElement && ['text', 'heading', 'button'].includes(selectedElement.type) && (
            <EditableTextPopover
                target={selectedElement.target}
                initialContent={selectedElement.content}
                onSave={handlePopoverSave}
                onRemove={handleElementRemove}
                onClose={clearSelection}
             />
        )}
      </main>
      <AnimatePresence>
        {isBuilding && <BuildingOverlay />}
      </AnimatePresence>
    </div>
  );
};

export default PreviewPanel;