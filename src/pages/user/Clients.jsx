import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import ClientList from '@/components/clients/ClientList';
import ClientForm from '@/components/clients/ClientForm';
import ClientDetails from '@/components/clients/ClientDetails';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [view, setView] = useState('list'); // 'list', 'details', 'form'
  const [searchTerm, setSearchTerm] = useState('');
  
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchClients = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    let query = supabase
      .from('clients')
      .select('*, campaigns(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Erro ao buscar clientes', description: error.message, variant: 'destructive' });
    } else {
      setClients(data);
    }
    setIsLoading(false);
  }, [toast, user]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setView('details');
    setIsDrawerOpen(true);
  };
  
  const handleEditClient = (client) => {
    setSelectedClient(client);
    setView('form');
    setIsDrawerOpen(true);
  }

  const handleNewClient = () => {
    setSelectedClient(null);
    setView('form');
    setIsDrawerOpen(true);
  }

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedClient(null);
    setView('list');
  }

  const handleSave = () => {
    fetchClients();
    if(selectedClient) {
        // If we were editing, fetch the updated client and go back to details
        const fetchUpdatedClient = async () => {
            const { data, error } = await supabase.from('clients').select('*, campaigns(count)').eq('id', selectedClient.id).single();
            if(!error && data) {
                setSelectedClient(data);
                setView('details');
            } else {
                handleCloseDrawer();
            }
        }
        fetchUpdatedClient();
    } else {
        handleCloseDrawer();
    }
  };

  const handleDeleteClient = async (clientId) => {
    try {
        const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('id')
        .eq('client_id', clientId);

        if (campaignError) throw campaignError;

        if (campaignData.length > 0) {
            const campaignIds = campaignData.map(c => c.id);
            await supabase.from('ads_agent_outputs').delete().in('campaign_id', campaignIds);
            await supabase.from('agent_outputs').delete().in('campaign_id', campaignIds);
            const { error: deleteCampaignsError } = await supabase.from('campaigns').delete().in('id', campaignIds);
            if (deleteCampaignsError) throw deleteCampaignsError;
        }

        const { error: clientError } = await supabase.from('clients').delete().eq('id', clientId);
        if (clientError) throw clientError;

        toast({ title: 'Cliente excluído', description: 'O cliente e todos os seus dados associados foram removidos.' });
        handleCloseDrawer();
        fetchClients();
    } catch (error) {
        toast({ title: 'Erro ao excluir cliente', description: error.message, variant: 'destructive' });
    }
  };

  const filteredClients = useMemo(() => {
    if (!searchTerm) return clients;
    return clients.filter(client => 
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.niche && client.niche.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [clients, searchTerm]);
  
  const renderDrawerContent = () => {
    if (view === 'form') {
      return (
        <ClientForm 
            client={selectedClient} 
            onSave={handleSave} 
            onCancel={selectedClient ? () => setView('details') : handleCloseDrawer} 
        />
      );
    }
    
    if (view === 'details' && selectedClient) {
      return (
        <ClientDetails 
          client={selectedClient} 
          onEdit={() => handleEditClient(selectedClient)}
          onDelete={() => handleDeleteClient(selectedClient.id)}
          onNavigateToCampaign={(campaignId) => {
            navigate(`/campanhas/copilot/${campaignId}`);
            handleCloseDrawer();
          }}
          onGoBack={handleCloseDrawer}
        />
      );
    }
    return null;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meus Clientes</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus clientes e as campanhas associadas.</p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
            <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar por nome ou nicho..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                 {searchTerm && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setSearchTerm('')}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
            <Button onClick={handleNewClient}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
        </div>
      </div>

      <ClientList 
        clients={filteredClients}
        onEdit={handleEditClient}
        onDelete={handleDeleteClient}
        onSelect={handleSelectClient}
        isLoading={isLoading}
      />

      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen} onClose={handleCloseDrawer}>
        <DrawerContent className="!h-[90vh] !max-h-[90vh]">
            <div className="mx-auto w-full max-w-7xl h-full flex flex-col overflow-hidden min-h-0">
              {renderDrawerContent()}
            </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default Clients;