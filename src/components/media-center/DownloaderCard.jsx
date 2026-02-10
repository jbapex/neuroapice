import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Search, DownloadCloud, Save } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { motion, AnimatePresence } from 'framer-motion';

const DownloaderCard = () => {
  const [videoUrl, setVideoUrl] = useState('');
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [metaData, setMetaData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const { toast } = useToast();
  const debouncedUrl = useDebounce(videoUrl, 500);

  // Função para normalizar URLs do YouTube (remove parâmetros extras)
  const normalizeYoutubeUrl = useCallback((url) => {
    if (!url) return url;
    
    // Se é YouTube
    if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
      try {
        const urlObj = new URL(url);
        
        // Para youtube.com/watch?v=ID
        if (urlObj.pathname === '/watch' && urlObj.searchParams.has('v')) {
          const videoId = urlObj.searchParams.get('v');
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
        
        // Para youtu.be/ID
        if (urlObj.hostname.includes('youtu.be')) {
          const videoId = urlObj.pathname.replace('/', '');
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      } catch (e) {
        console.error('Erro ao normalizar URL:', e);
        // Se falhar, retorna a URL original
        return url;
      }
    }
    
    // Para Instagram ou outras URLs, retorna como está
    return url;
  }, []);

  const handleFetchMetadata = useCallback(async (url) => {
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.includes('instagram.com'))) {
      setMetaData(null);
      setErrorMessage(null);
      return;
    }
    
    // Normaliza a URL antes de enviar
    const normalizedUrl = normalizeYoutubeUrl(url);
    console.log('URL original:', url);
    console.log('URL normalizada:', normalizedUrl);
    
    setIsFetchingMeta(true);
    setMetaData(null);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('get-video-metadata', {
        body: { video_url: normalizedUrl },
      });

      // Primeiro verifica se há erro no data (quando a função retorna 400 mas a resposta vem em data)
      if (data && data.error) {
        console.error('Erro retornado pela Edge Function no data:', data.error);
        // Se o erro vem como string JSON, tenta parsear
        let errorMsg = data.error;
        try {
          if (typeof data.error === 'string') {
            // Tenta parsear se for JSON string
            if (data.error.trim().startsWith('{')) {
              const parsed = JSON.parse(data.error);
              errorMsg = parsed.error || parsed.message || errorMsg;
            } else {
              errorMsg = data.error;
            }
          } else if (typeof data.error === 'object') {
            errorMsg = data.error.error || data.error.message || JSON.stringify(data.error);
          }
        } catch (e) {
          // Se não for JSON, usa como está
          console.log('Erro ao parsear data.error, usando como está:', errorMsg);
        }
        throw new Error(errorMsg);
      }

      if (error) {
        console.error('Erro ao invocar get-video-metadata:', error);
        console.error('Detalhes completos do erro:', {
          message: error.message,
          context: error.context,
          status: error.status,
          data: error.data,
        });
        
        // Função auxiliar para extrair mensagem de erro
        let errorMessage = 'Erro ao buscar metadados do vídeo.';
        
        try {
          // PRIORIDADE 1: Tenta pegar do contexto (Response object) - método principal
          if (error.context) {
            if (typeof error.context.json === 'function') {
              try {
                const errorBody = await error.context.json();
                console.log('✅ Erro extraído do contexto (json):', errorBody);
                if (errorBody.error) {
                  errorMessage = errorBody.error;
                } else if (errorBody.message) {
                  errorMessage = errorBody.message;
                }
              } catch (jsonError) {
                console.error('Erro ao chamar context.json():', jsonError);
                // Tenta text() como fallback
                if (typeof error.context.text === 'function') {
                  try {
                    const errorText = await error.context.text();
                    console.log('Erro extraído do contexto (text):', errorText);
                    if (errorText.trim().startsWith('{')) {
                      const parsed = JSON.parse(errorText);
                      errorMessage = parsed.error || parsed.message || errorMessage;
                    } else {
                      errorMessage = errorText || errorMessage;
                    }
                  } catch (textError) {
                    console.error('Erro ao chamar context.text():', textError);
                  }
                }
              }
            }
          }
          
          // PRIORIDADE 2: Tenta pegar do error.data
          if (errorMessage === 'Erro ao buscar metadados do vídeo.' && error.data) {
            console.log('Tentando extrair do error.data:', error.data);
            if (typeof error.data === 'string') {
              try {
                const parsed = JSON.parse(error.data);
                errorMessage = parsed.error || parsed.message || errorMessage;
              } catch (e) {
                errorMessage = error.data;
              }
            } else if (error.data.error) {
              errorMessage = error.data.error;
            } else if (error.data.message) {
              errorMessage = error.data.message;
            }
          }
          
          // PRIORIDADE 3: Fallback para error.message
          if (errorMessage === 'Erro ao buscar metadados do vídeo.' && error.message) {
            // Se a mensagem contém JSON, tenta extrair
            if (error.message.includes('{') && error.message.includes('error')) {
              try {
                const match = error.message.match(/\{[^}]+\}/);
                if (match) {
                  const parsed = JSON.parse(match[0]);
                  errorMessage = parsed.error || parsed.message || error.message;
                } else {
                  errorMessage = error.message;
                }
              } catch (e) {
                errorMessage = error.message;
              }
            } else {
              errorMessage = error.message;
            }
          }
        } catch (e) {
          console.error('Erro ao parsear contexto:', e);
          // Último fallback
          if (error.message) {
            errorMessage = error.message;
          }
        }

        console.log('✅ Mensagem de erro final extraída:', errorMessage);

        // Não modifica mensagens que já vêm da Edge Function (elas já são claras)
        // Apenas traduz erros técnicos genéricos
        if (errorMessage.includes('Function not found') || errorMessage.includes('404')) {
          errorMessage = 'A função de busca de metadados não está disponível. Entre em contato com o suporte.';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
          errorMessage = 'O vídeo demorou muito para responder. Tente novamente ou verifique se a URL está correta.';
        } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
          errorMessage = 'Erro de autorização. Faça login novamente.';
        } else if (errorMessage.includes('video') && errorMessage.includes('unavailable')) {
          errorMessage = 'Este vídeo não está disponível ou foi removido.';
        } else if (errorMessage.includes('non-2xx status code') && !errorMessage.includes('Não foi possível')) {
          // Se a mensagem genérica não foi substituída por uma específica da Edge Function
          errorMessage = 'Não foi possível obter os metadados do vídeo. Verifique a URL ou tente novamente.';
        }

        throw new Error(errorMessage);
      }

      if (!data || (!data.title && !data.thumbnail)) {
        throw new Error('Não foi possível obter os dados do vídeo. Verifique se a URL está correta.');
      }

      setMetaData(data);
      setErrorMessage(null);
    } catch (error) {
      console.error('Erro completo ao buscar metadados:', error);
      // Garante que a mensagem de erro seja exibida corretamente
      const finalErrorMessage = error.message || 'Verifique se a URL está correta e tente novamente.';
      console.log('Mensagem de erro que será exibida:', finalErrorMessage);
      setErrorMessage(finalErrorMessage);
      toast({ 
        title: 'Erro ao buscar dados do vídeo', 
        description: finalErrorMessage, 
        variant: 'destructive' 
      });
      setMetaData(null);
    } finally {
      setIsFetchingMeta(false);
    }
  }, [toast, normalizeYoutubeUrl]);

  useEffect(() => {
    handleFetchMetadata(debouncedUrl);
  }, [debouncedUrl, handleFetchMetadata]);

  const handleDownloadDirect = async () => {
    if (!metaData || !debouncedUrl) return;
    setIsDownloading(true);
    try {
      // Primeiro tenta baixar direto via URL
      const { data, error } = await supabase.functions.invoke('download-video', {
        body: { video_url: debouncedUrl },
      });

      if (error) {
        // Se não aceitar URL direto, tenta com media_id (salva temporariamente)
        const errorContext = error.context || {};
        const errorBody = typeof errorContext.json === 'function' ? await errorContext.json() : { error: 'Erro ao baixar o vídeo.' };
        
        // Se erro indica que precisa de media_id, salva primeiro
        if (errorBody.error?.includes('media_id') || errorBody.error?.includes('media')) {
          // Salva temporariamente na biblioteca
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Usuário não autenticado.');

          const { data: media, error: insertError } = await supabase
            .from('media_library')
            .insert({
              user_id: user.id,
              video_url: debouncedUrl,
              platform: debouncedUrl.includes('instagram') ? 'instagram' : 'youtube',
              title: metaData.title,
              thumbnail_url: metaData.thumbnail,
            })
            .select()
            .single();

          if (insertError) throw insertError;

          // Agora baixa usando o media_id
          const { data: downloadData, error: downloadError } = await supabase.functions.invoke('download-video', {
            body: { media_id: media.id },
          });

          if (downloadError) {
            const downloadErrorContext = downloadError.context || {};
            const downloadErrorBody = typeof downloadErrorContext.json === 'function' ? await downloadErrorContext.json() : { error: 'Erro ao baixar o vídeo.' };
            throw new Error(downloadErrorBody.error || 'Erro desconhecido ao tentar baixar.');
          }

          if (downloadData.error) throw new Error(downloadData.error);

          // Inicia o download
          const link = document.createElement('a');
          link.href = downloadData.download_url;
          link.setAttribute('download', downloadData.filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          toast({ title: 'Download iniciado!', description: `O vídeo ${downloadData.filename} está sendo baixado.` });
        } else {
          throw new Error(errorBody.error || 'Erro desconhecido ao tentar baixar.');
        }
      } else {
        if (data.error) throw new Error(data.error);

        // Download direto funcionou
        const link = document.createElement('a');
        link.href = data.download_url;
        link.setAttribute('download', data.filename || `${metaData.title}.mp4`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({ title: 'Download iniciado!', description: `O vídeo está sendo baixado.` });
      }
    } catch (error) {
      toast({ title: 'Erro no Download', description: error.message, variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!metaData || !debouncedUrl) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado.');

      const { error } = await supabase.from('media_library').insert({
        user_id: user.id,
        video_url: debouncedUrl,
        platform: debouncedUrl.includes('instagram') ? 'instagram' : 'youtube',
        title: metaData.title,
        thumbnail_url: metaData.thumbnail,
      });
      if (error) throw error;
      toast({ title: 'Vídeo salvo!', description: 'O vídeo foi adicionado à sua biblioteca.' });
      setVideoUrl('');
      setMetaData(null);
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DownloadCloud className="h-6 w-6 text-primary" /> Downloader de Vídeos</CardTitle>
        <CardDescription>Cole uma URL do YouTube ou Instagram para baixar o vídeo diretamente ou salvá-lo em sua biblioteca.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-grow">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="pl-10"
          />
        </div>
        <AnimatePresence>
          {isFetchingMeta && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-center p-4 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Buscando dados do vídeo...
            </motion.div>
          )}
          {errorMessage && !isFetchingMeta && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className="p-4 bg-destructive/10 border-destructive/20 border">
                <p className="text-sm text-destructive font-medium">Erro: {errorMessage}</p>
                <p className="text-xs text-muted-foreground mt-1">Verifique se a URL está correta e tente novamente.</p>
              </Card>
            </motion.div>
          )}
          {metaData && !isFetchingMeta && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-muted/50">
                <img 
                  src={metaData.thumbnail} 
                  alt={`Thumbnail for ${metaData.title}`} 
                  className="w-32 h-20 object-cover rounded-md"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <div className="flex-1">
                  <p className="font-semibold line-clamp-2">{metaData.title}</p>
                  <p className="text-sm text-muted-foreground">{metaData.uploader}</p>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button 
          onClick={handleDownloadDirect} 
          disabled={isDownloading || !metaData} 
          className="flex-1"
        >
          {isDownloading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Baixando...</>
          ) : (
            <><DownloadCloud className="mr-2 h-4 w-4" /> Baixar Vídeo</>
          )}
        </Button>
        <Button 
          onClick={handleSaveToLibrary} 
          disabled={isSaving || !metaData} 
          variant="outline"
          className="flex-1"
        >
          {isSaving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" /> Salvar na Biblioteca</>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DownloaderCard;