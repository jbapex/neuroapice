import React, { useState } from 'react';
import { LayoutGrid, FolderOpen, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const NeuroDesignSidebar = ({
  view,
  setView,
  projects,
  selectedProject,
  setSelectedProject,
  onRefreshProjects,
  onCloseDrawer,
  wrapperClassName,
}) => {
  const handleSetView = (v) => {
    setView(v);
    onCloseDrawer?.();
  };
  const handleSelectProject = (p) => {
    setSelectedProject(p);
    setView('create');
    onCloseDrawer?.();
  };
  const { user } = useAuth();
  const { toast } = useToast();
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteProject = async () => {
    if (!projectToDelete || !user) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('neurodesign_projects')
        .delete()
        .eq('id', projectToDelete.id)
        .eq('owner_user_id', user.id);
      if (error) throw error;
      if (selectedProject?.id === projectToDelete.id) setSelectedProject(null);
      onRefreshProjects();
      setProjectToDelete(null);
      toast({ title: 'Projeto apagado.' });
    } catch (e) {
      toast({ title: 'Erro ao apagar projeto', description: e?.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || !user) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('neurodesign_projects')
        .insert({ name, owner_user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      setNewProjectName('');
      onRefreshProjects();
      setSelectedProject(data);
      setView('create');
      onCloseDrawer?.();
      toast({ title: 'Projeto criado!' });
    } catch (e) {
      toast({ title: 'Erro ao criar projeto', description: e.message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const asideClass = wrapperClassName ?? 'w-64 shrink-0 border-r border-white/10 bg-black/20 flex flex-col';
  return (
    <aside className={asideClass}>
      <div className="p-4 border-b border-white/10">
        <h2 className="font-semibold text-lg text-white">NeuroDesign</h2>
        <p className="text-xs text-muted-foreground mt-1">Design Builder</p>
      </div>
      <nav className="p-2 space-y-1">
        <button
          type="button"
          onClick={() => handleSetView('explore')}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            view === 'explore' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/5'
          )}
        >
          <FolderOpen className="h-4 w-4" />
          Explorar
        </button>
        <button
          type="button"
          onClick={() => handleSetView('create')}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            view === 'create' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/5'
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          Criar
        </button>
        <button
          type="button"
          onClick={() => handleSetView('gallery')}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            view === 'gallery' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/5'
          )}
        >
          <ImageIcon className="h-4 w-4" />
          Minha Galeria
        </button>
      </nav>
      <div className="p-3 border-t border-white/10 flex gap-2">
        <Input
          placeholder="Novo projeto"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
          className="bg-white/5 border-white/20 text-white placeholder:text-gray-500 h-9"
        />
        <Button
          size="icon"
          onClick={handleCreateProject}
          disabled={!newProjectName.trim() || isCreating}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 min-w-0">
        <p className="text-xs text-muted-foreground px-2 mb-2">Projetos</p>
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2">Nenhum projeto ainda.</p>
        ) : (
          <ul className="space-y-1 min-w-0">
            {projects.map((p) => (
              <li key={p.id} className="group flex items-center gap-1 rounded-lg overflow-hidden min-w-0">
                <button
                  type="button"
                  onClick={() => handleSelectProject(p)}
                  title={p.name}
                  className={cn(
                    'flex-1 min-w-0 text-left rounded-lg px-3 py-2 text-sm truncate transition-colors',
                    selectedProject?.id === p.id ? 'bg-primary/20 text-primary' : 'hover:bg-white/5 text-muted-foreground'
                  )}
                >
                  {p.name}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectToDelete(p);
                  }}
                  title="Apagar projeto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              O projeto &quot;{projectToDelete?.name}&quot; e todas as imagens e configurações serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteProject(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Apagando...' : 'Apagar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
};

export default NeuroDesignSidebar;
