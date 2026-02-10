import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Youtube, Instagram, Clipboard, Check, AlertCircle, DownloadCloud, FileText, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const LibraryList = ({ library, loading, transcribingId, onTranscribe, onDelete }) => {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const handleDownload = async (mediaId) => {
    setDownloadingId(mediaId);
    try {
      const { data, error } = await supabase.functions.invoke('download-video', {
        body: { media_id: mediaId },
      });
      if (error) {
        const errorContext = error.context || {};
        const errorBody = typeof errorContext.json === 'function' ? await errorContext.json() : { error: 'Erro ao baixar o vídeo.' };
        throw new Error(errorBody.error || 'Erro desconhecido ao tentar baixar.');
      }
      if (data.error) throw new Error(data.error);

      const link = document.createElement('a');
      link.href = data.download_url;
      link.setAttribute('download', data.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({ title: 'Download iniciado!', description: `O vídeo ${data.filename} está sendo baixado.` });
    } catch (error) {
      toast({ title: 'Erro no Download', description: error.message, variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: 'Copiado!', description: 'Transcrição copiada.' });
    setTimeout(() => setCopiedId(null), 2000);
  };
  
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed': return <Badge variant="success">Concluído</Badge>;
      case 'processing': return <Badge variant="secondary" className="animate-pulse">Processando</Badge>;
      case 'failed': return <Badge variant="destructive">Falhou</Badge>;
      default: return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <TooltipProvider>
        <Card>
          <CardHeader>
            <CardTitle>Sua Biblioteca de Mídia</CardTitle>
            <CardDescription>Gerencie, baixe e transcreva os vídeos que você salvou.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <div className="text-center p-8"><Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : library.length > 0 ? (
                library.map((item) => (
                  <Card key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4">
                    <img 
                      src={item.thumbnail_url} 
                      alt={item.title} 
                      className="w-full sm:w-32 h-auto sm:h-20 object-cover rounded-md"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <div className="flex-1 space-y-1">
                      <p className="font-semibold line-clamp-2">{item.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {item.platform === 'youtube' ? <Youtube className="h-4 w-4 text-red-600" /> : <Instagram className="h-4 w-4 text-pink-600" />}
                        <span>{format(new Date(item.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                        {getStatusBadge(item.status)}
                      </div>
                      {item.status === 'completed' && (
                        <div className="flex items-center gap-2 pt-1">
                          <p className="text-sm text-muted-foreground truncate max-w-xs">{item.transcript_text}</p>
                          <Button variant="ghost" size="icon" onClick={() => handleCopy(item.transcript_text, item.id)}>
                            {copiedId === item.id ? <Check className="h-4 w-4 text-green-500" /> : <Clipboard className="h-4 w-4" />}
                          </Button>
                        </div>
                      )}
                      {item.status === 'failed' && (
                        <div className="flex items-center gap-2 pt-1 text-destructive">
                          <span className="text-sm max-w-xs truncate">{item.error_message || "Falha desconhecida"}</span>
                          <Tooltip>
                            <TooltipTrigger><AlertCircle className="h-4 w-4 cursor-pointer" /></TooltipTrigger>
                            <TooltipContent><p className="max-w-sm">{item.error_message}</p></TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 self-start sm:self-center flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(item.id)}
                        disabled={downloadingId === item.id}
                      >
                        {downloadingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                        Baixar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onTranscribe(item.id)}
                        disabled={transcribingId === item.id || item.status === 'processing' || item.status === 'completed'}
                      >
                        {transcribingId === item.id || item.status === 'processing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        Transcrever
                      </Button>
                      <Button size="icon" variant="destructive" onClick={() => onDelete(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Sua biblioteca está vazia.</p>
                  <p className="text-sm">Adicione vídeos usando o campo acima para começar.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
    </TooltipProvider>
  );
};

export default LibraryList;