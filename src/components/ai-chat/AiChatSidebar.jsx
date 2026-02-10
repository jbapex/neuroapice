import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Search, MessageSquare, X, Trash2, Edit2, Check, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AiChatSidebar = ({ sessions, activeSessionId, isSessionsLoading, onSelectSession, onNewConversation, onDeleteSession, isDesktop, onClose, onSessionUpdate }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const { toast } = useToast();

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartEdit = (sessionId, currentTitle) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const handleCancelEdit = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleSaveEdit = async (sessionId) => {
    if (!editingTitle.trim()) {
      toast({ title: "Título inválido", description: "O título não pode estar vazio.", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from('ai_chat_sessions')
        .update({ title: editingTitle.trim() })
        .eq('id', sessionId);

      if (error) throw error;

      toast({ title: "Título atualizado!", description: "O título da conversa foi atualizado com sucesso." });
      setEditingSessionId(null);
      setEditingTitle("");
      
      // Notificar componente pai para atualizar a lista
      if (onSessionUpdate) {
        onSessionUpdate();
      }
    } catch (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className={cn("h-full bg-background flex flex-col transition-all duration-300", isDesktop ? 'w-full' : 'w-full')}>
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Conversas</h2>
        {!isDesktop && (
            <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
            </Button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <Button onClick={onNewConversation} className="w-full bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 text-white font-bold transition-opacity">
          <Plus className="mr-2 h-4 w-4" />
          Nova Conversa
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar conversa..." 
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
            {isSessionsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-2 p-2.5">
                        <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
                        <div className="h-4 w-4/5 rounded-md bg-muted animate-pulse" />
                    </div>
                ))
            ) : (
            filteredSessions.map(session => (
                <div key={session.id} className="group relative">
                  {editingSessionId === session.id ? (
                    // Modo de edição
                    <div className="flex items-center gap-2 p-2.5 px-3 mb-1">
                      <MessageSquare className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <Input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(session.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        className="flex-1 h-8 text-sm"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveEdit(session.id);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    // Modo normal
                    <>
                      <Button
                        variant="ghost"
                        className={cn(
                            "w-full justify-start h-auto py-2.5 px-3 mb-1 text-left",
                            activeSessionId === session.id && "bg-primary/10 text-primary font-semibold"
                        )}
                        onClick={() => onSelectSession(session.id)}
                        >
                        <MessageSquare className="mr-3 h-4 w-4 flex-shrink-0" />
                        <div className="flex flex-col w-full truncate">
                            <span className="truncate font-medium">{session.title}</span>
                            <span className="text-xs text-muted-foreground">
                                {new Date(session.updated_at).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                      </Button>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(session.id, session.title);
                            }}
                        >
                            <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSession(session.id);
                            }}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
            ))
            )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AiChatSidebar;