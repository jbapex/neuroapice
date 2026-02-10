import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Youtube, Instagram } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';

const LibraryModal = ({ isOpen, onOpenChange, onSelect }) => {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('media_library')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLibrary(data);
    } catch (error) {
      toast({ title: 'Erro ao buscar biblioteca', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isOpen) {
      fetchLibrary();
    }
  }, [isOpen, fetchLibrary]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[60vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Selecionar da Biblioteca</DialogTitle>
          <DialogDescription>Escolha um vídeo da sua biblioteca para transcrever.</DialogDescription>
        </DialogHeader>
        <div className="flex-grow relative min-h-0">
          <ScrollArea className="h-full w-full pr-4">
            <div className="space-y-4">
              {loading ? (
                <div className="text-center p-8"><Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" /></div>
              ) : library.length > 0 ? (
                library.map((item) => (
                  <Card 
                    key={item.id} 
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50"
                    onClick={() => onSelect(item)}
                  >
                    <img 
                      src={item.thumbnail_url} 
                      alt={item.title} 
                      className="w-24 h-16 object-cover rounded-md"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <div className="flex-1">
                      <p className="font-semibold line-clamp-2">{item.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {item.platform === 'youtube' ? <Youtube className="h-4 w-4 text-red-600" /> : <Instagram className="h-4 w-4 text-pink-600" />}
                        <span>{format(new Date(item.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Sua biblioteca está vazia.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LibraryModal;