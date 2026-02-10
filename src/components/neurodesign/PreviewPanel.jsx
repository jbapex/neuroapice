import React, { useState, useRef, useCallback } from 'react';
import { Loader2, Download, Sparkles, Upload, X, Crop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { uploadNeuroDesignFile } from '@/lib/neurodesignStorage';

const isDemoPlaceholder = (url) => url && typeof url === 'string' && url.includes('placehold.co');

const PreviewPanel = ({ project, user, selectedImage, images, isGenerating, isRefining, onRefine, onDownload }) => {
  const { toast } = useToast();
  const [refineInstruction, setRefineInstruction] = useState('');
  const [referenceArtFile, setReferenceArtFile] = useState(null);
  const [referenceArtPreviewUrl, setReferenceArtPreviewUrl] = useState('');
  const [replacementFile, setReplacementFile] = useState(null);
  const [replacementPreviewUrl, setReplacementPreviewUrl] = useState('');
  const [selectionRegion, setSelectionRegion] = useState(null);
  const [isUploadingRefine, setIsUploadingRefine] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawCurrent, setDrawCurrent] = useState(null);
  const previewContainerRef = useRef(null);
  const previewImgRef = useRef(null);

  const imageUrl = selectedImage?.url || selectedImage?.thumbnail_url;
  const isLoading = isGenerating || isRefining;
  const showDemoNotice = !isLoading && imageUrl && isDemoPlaceholder(imageUrl);

  const clearReferenceArt = () => {
    setReferenceArtFile(null);
    if (referenceArtPreviewUrl) URL.revokeObjectURL(referenceArtPreviewUrl);
    setReferenceArtPreviewUrl('');
  };

  const clearReplacement = () => {
    setReplacementFile(null);
    if (replacementPreviewUrl) URL.revokeObjectURL(replacementPreviewUrl);
    setReplacementPreviewUrl('');
  };

  const handleReferenceArtChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)/i.test(file.type)) {
      toast({ title: 'Use uma imagem (JPEG, PNG, WebP ou GIF)', variant: 'destructive' });
      return;
    }
    clearReferenceArt();
    setReferenceArtFile(file);
    setReferenceArtPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleReplacementChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)/i.test(file.type)) {
      toast({ title: 'Use uma imagem (JPEG, PNG, WebP ou GIF)', variant: 'destructive' });
      return;
    }
    clearReplacement();
    setReplacementFile(file);
    setReplacementPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const getNormalizedRegion = useCallback(() => {
    const container = previewContainerRef.current;
    const img = previewImgRef.current;
    if (!container || !img || !drawStart || !drawCurrent) return null;
    const cRect = container.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    const imgLeft = iRect.left - cRect.left;
    const imgTop = iRect.top - cRect.top;
    const px1 = Math.max(imgLeft, Math.min(drawStart.x, drawCurrent.x));
    const px2 = Math.min(imgLeft + iRect.width, Math.max(drawStart.x, drawCurrent.x));
    const py1 = Math.max(imgTop, Math.min(drawStart.y, drawCurrent.y));
    const py2 = Math.min(imgTop + iRect.height, Math.max(drawStart.y, drawCurrent.y));
    const w = px2 - px1;
    const h = py2 - py1;
    if (w < 5 || h < 5) return null;
    return {
      x: (px1 - imgLeft) / iRect.width,
      y: (py1 - imgTop) / iRect.height,
      width: w / iRect.width,
      height: h / iRect.height,
    };
  }, [drawStart, drawCurrent]);

  const generateCropBlob = useCallback(async () => {
    const img = previewImgRef.current;
    const region = selectionRegion;
    if (!img || !region || !imageUrl) return null;
    return new Promise((resolve) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        const natW = im.naturalWidth;
        const natH = im.naturalHeight;
        const x = Math.floor(region.x * natW);
        const y = Math.floor(region.y * natH);
        const w = Math.max(1, Math.floor(region.width * natW));
        const h = Math.max(1, Math.floor(region.height * natH));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(im, x, y, w, h, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95);
      };
      im.onerror = () => resolve(null);
      im.src = imageUrl;
    });
  }, [imageUrl, selectionRegion]);

  const handleMouseDown = (e) => {
    if (!imageUrl || !previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawCurrent({ x, y });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    setDrawCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const region = getNormalizedRegion();
    setDrawStart(null);
    setDrawCurrent(null);
    if (region) setSelectionRegion(region);
  };

  const clearSelection = () => {
    setSelectionRegion(null);
  };

  const handleRefineClick = async () => {
    const instruction = refineInstruction.trim();
    if (!instruction) return;
    if (!project?.id || !user?.id) {
      toast({ title: 'Selecione um projeto para refinar', variant: 'destructive' });
      return;
    }

    setIsUploadingRefine(true);
    let referenceImageUrl = '';
    let replacementImageUrl = '';
    let regionCropImageUrl = '';
    let region = selectionRegion || undefined;

    try {
      if (referenceArtFile) {
        referenceImageUrl = await uploadNeuroDesignFile(user.id, project.id, 'refine_ref', referenceArtFile);
      }
      if (replacementFile) {
        replacementImageUrl = await uploadNeuroDesignFile(user.id, project.id, 'refine_replacement', replacementFile);
      }
      if (selectionRegion && imageUrl) {
        const cropBlob = await generateCropBlob();
        if (cropBlob) {
          const cropFile = new File([cropBlob], 'crop.png', { type: 'image/png' });
          regionCropImageUrl = await uploadNeuroDesignFile(user.id, project.id, 'refine_crop', cropFile);
        }
      }

      const payload = {
        instruction,
        ...(referenceImageUrl && { referenceImageUrl }),
        ...(replacementImageUrl && { replacementImageUrl }),
        ...(region && { region }),
        ...(regionCropImageUrl && { regionCropImageUrl }),
      };
      onRefine?.(payload);
      setRefineInstruction('');
      clearReferenceArt();
      clearReplacement();
      clearSelection();
    } catch (e) {
      toast({ title: 'Erro ao enviar imagens', description: e?.message, variant: 'destructive' });
    } finally {
      setIsUploadingRefine(false);
    }
  };

  const drawBox = () => {
    if (!drawStart || !drawCurrent || !previewContainerRef.current) return null;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const w = Math.abs(drawCurrent.x - drawStart.x);
    const h = Math.abs(drawCurrent.y - drawStart.y);
    return (
      <div
        className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
        style={{ left: x, top: y, width: w, height: h }}
      />
    );
  };

  const selectionBox = () => {
    if (!selectionRegion || !previewContainerRef.current || !previewImgRef.current) return null;
    const cRect = previewContainerRef.current.getBoundingClientRect();
    const iRect = previewImgRef.current.getBoundingClientRect();
    const imgLeft = iRect.left - cRect.left;
    const imgTop = iRect.top - cRect.top;
    return (
      <div
        className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
        style={{
          left: imgLeft + selectionRegion.x * iRect.width,
          top: imgTop + selectionRegion.y * iRect.height,
          width: selectionRegion.width * iRect.width,
          height: selectionRegion.height * iRect.height,
        }}
      />
    );
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex-1 min-h-0 rounded-lg border border-white/10 bg-black/20 flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p>{isRefining ? 'Refinando...' : 'Gerando...'}</p>
          </div>
        )}
        {!isLoading && !imageUrl && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground text-center px-6">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
              <Sparkles className="h-10 w-10 text-primary/60" />
            </div>
            <p className="font-medium">Aguardando criação</p>
            <p className="text-sm">Configure o builder à esquerda e clique em &quot;Gerar Imagem&quot;.</p>
          </div>
        )}
        {!isLoading && imageUrl && (
          <div
            ref={previewContainerRef}
            className="relative w-full h-full flex flex-col items-center justify-center p-4"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={isDrawing ? handleMouseUp : undefined}
          >
            <img
              ref={previewImgRef}
              src={imageUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg select-none pointer-events-none"
              draggable={false}
              style={{ touchAction: 'none' }}
            />
            {isDrawing && drawBox()}
            {!isDrawing && selectionBox()}
            {showDemoNotice && (
              <div className="mt-3 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-sm text-center max-w-md">
                Modo demonstração: imagem de exemplo. Selecione uma conexão de imagem (ex.: OpenRouter) no builder para gerar imagens reais.
              </div>
            )}
            <div className="absolute top-4 right-4 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onDownload?.(imageUrl)}>
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
              {selectionRegion && (
                <Button size="sm" variant="outline" onClick={clearSelection} className="border-white/30">
                  <Crop className="h-4 w-4 mr-1" /> Limpar seleção
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Arraste na imagem para selecionar uma região (opcional).</p>
          </div>
        )}
      </div>

      {!isLoading && imageUrl && (
        <>
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground font-medium">Opções avançadas (opcional)</p>
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Referência de arte</label>
                <div className="flex items-center gap-2">
                  {referenceArtPreviewUrl ? (
                    <div className="relative">
                      <img src={referenceArtPreviewUrl} alt="Ref arte" className="w-14 h-14 rounded object-cover border border-white/20" />
                      <button type="button" onClick={clearReferenceArt} className="absolute -top-1 -right-1 bg-black/70 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-14 h-14 rounded border border-dashed border-white/30 flex items-center justify-center cursor-pointer hover:bg-white/5 shrink-0">
                      <Upload className="h-4 w-4" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleReferenceArtChange} />
                    </label>
                  )}
                  <span className="text-xs text-muted-foreground">Crie semelhante a essa arte</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Imagem para substituir</label>
                <div className="flex items-center gap-2">
                  {replacementPreviewUrl ? (
                    <div className="relative">
                      <img src={replacementPreviewUrl} alt="Substituir" className="w-14 h-14 rounded object-cover border border-white/20" />
                      <button type="button" onClick={clearReplacement} className="absolute -top-1 -right-1 bg-black/70 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-14 h-14 rounded border border-dashed border-white/30 flex items-center justify-center cursor-pointer hover:bg-white/5 shrink-0">
                      <Upload className="h-4 w-4" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleReplacementChange} />
                    </label>
                  )}
                  <span className="text-xs text-muted-foreground">Substitua elemento (use seleção ou instrução)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Textarea
              placeholder="Instrução de ajuste (ex: deixe o fundo mais escuro, substitua a camiseta pela imagem anexa)"
              value={refineInstruction}
              onChange={(e) => setRefineInstruction(e.target.value)}
              className="flex-1 min-h-[60px] bg-white/5 border-white/20 text-white resize-none"
            />
            <Button
              onClick={handleRefineClick}
              disabled={!refineInstruction.trim() || isUploadingRefine}
            >
              {isUploadingRefine ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Refinar
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default PreviewPanel;
