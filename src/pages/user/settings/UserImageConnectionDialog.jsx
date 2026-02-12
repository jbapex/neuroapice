import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/customSupabaseClient';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

const imageProviderOptions = ['Google', 'OpenRouter'];

const UserImageConnectionDialog = ({ isOpen, setIsOpen, editingConnection, onFinished }) => {
  const { user } = useAuth();
  const [showApiKey, setShowApiKey] = useState(false);
  const [openRouterImageModels, setOpenRouterImageModels] = useState([]);
  const [googleImageModels, setGoogleImageModels] = useState([]);
  const [isLoadingImageModels, setIsLoadingImageModels] = useState(false);
  const [isLoadingGoogleModels, setIsLoadingGoogleModels] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    provider: 'Google',
    api_key: '',
    api_url: '',
    default_model: ''
  });

  const getInitialFormData = () => ({
    name: '',
    provider: 'Google',
    api_key: '',
    api_url: 'https://generativelanguage.googleapis.com/v1beta',
    default_model: 'gemini-1.5-flash-image-preview'
  });

  const debouncedApiKey = useDebounce(formData.api_key, 500);

  const fetchOpenRouterImageModels = useCallback(async (apiKey) => {
    if (!apiKey) return;
    setIsLoadingImageModels(true);
    setOpenRouterImageModels([]);
    try {
      const { data, error } = await supabase.functions.invoke('get-openrouter-models', {
        body: { apiKey },
      });
      if (error) throw new Error(error.message);
      const list = data?.models ?? data?.data ?? (Array.isArray(data) ? data : []);
      const imageModels = Array.isArray(list)
        ? list.filter((m) => m?.architecture?.output_modalities?.includes?.('image'))
        : [];
      const sorted = imageModels.slice().sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || ''));
      setOpenRouterImageModels(sorted);
    } catch (err) {
      toast.error('Falha ao buscar modelos de imagem', { description: 'Verifique a chave da API OpenRouter e tente novamente.' });
      setOpenRouterImageModels([]);
    } finally {
      setIsLoadingImageModels(false);
    }
  }, []);

  const fetchGoogleImageModels = useCallback(async (apiKey) => {
    if (!apiKey) return;
    setIsLoadingGoogleModels(true);
    setGoogleImageModels([]);
    try {
      const { data, error } = await supabase.functions.invoke('get-google-models', {
        body: { apiKey },
      });
      if (error) throw new Error(error?.message || error);
      const list = data?.models ?? (Array.isArray(data) ? data : []);
      const raw = Array.isArray(list) ? list : [];
      const imageModels = raw.filter((m) => {
        const name = (m?.name ?? m?.baseModelId ?? '').toLowerCase();
        return name.includes('image') || name.includes('imagen');
      });
      const sorted = imageModels.slice().sort((a, b) => {
        const na = (a?.displayName || a?.name || a?.baseModelId || '').toLowerCase();
        const nb = (b?.displayName || b?.name || b?.baseModelId || '').toLowerCase();
        return na.localeCompare(nb);
      });
      setGoogleImageModels(sorted);
    } catch (err) {
      toast.error('Falha ao buscar modelos de imagem', { description: 'Verifique a chave da API Google e tente novamente.' });
      setGoogleImageModels([]);
    } finally {
      setIsLoadingGoogleModels(false);
    }
  }, []);

  useEffect(() => {
    if (formData.provider === 'OpenRouter' && debouncedApiKey) {
      fetchOpenRouterImageModels(debouncedApiKey);
    } else {
      setOpenRouterImageModels([]);
    }
  }, [formData.provider, debouncedApiKey, fetchOpenRouterImageModels]);

  useEffect(() => {
    if (formData.provider === 'Google' && debouncedApiKey) {
      fetchGoogleImageModels(debouncedApiKey);
    } else {
      setGoogleImageModels([]);
    }
  }, [formData.provider, debouncedApiKey, fetchGoogleImageModels]);

  useEffect(() => {
    if (isOpen) {
        if (editingConnection) {
            const prov = editingConnection.provider || 'Google';
            setFormData({
                name: editingConnection.name || '',
                provider: prov,
                api_key: editingConnection.api_key || '',
                api_url: editingConnection.api_url || (prov === 'OpenRouter' ? 'https://openrouter.ai/api/v1' : 'https://generativelanguage.googleapis.com/v1beta'),
                default_model: editingConnection.default_model || (prov === 'OpenRouter' ? '' : 'gemini-1.5-flash-image-preview'),
            });
        } else {
            setFormData(getInitialFormData());
        }
        setShowApiKey(false);
    }
  }, [editingConnection, isOpen]);

  const handleProviderChange = (value) => {
    const newFormData = { ...formData, provider: value };
    if (value === 'Google') {
      newFormData.api_url = 'https://generativelanguage.googleapis.com/v1beta';
      newFormData.default_model = 'gemini-1.5-flash-image-preview';
    } else if (value === 'OpenRouter') {
      // OpenRouter: geração de imagem via chat/completions com modalities ["image","text"]
      newFormData.api_url = 'https://openrouter.ai/api/v1';
      newFormData.default_model = '';
    } else {
      newFormData.api_url = '';
      newFormData.default_model = '';
    }
    setFormData(newFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.api_key) {
      toast.error("Campos obrigatórios", { description: "Por favor, preencha o nome e a chave da API." });
      return;
    }
    if (formData.provider === 'OpenRouter' && !formData.default_model) {
      toast.error("Selecione um modelo", { description: "Escolha um modelo de geração de imagem do OpenRouter." });
      return;
    }
    if (formData.provider === 'Google' && !formData.default_model) {
      toast.error("Selecione um modelo", { description: "Escolha um modelo de geração de imagem do Google." });
      return;
    }

    const dataToSave = {
      user_id: user.id,
      name: formData.name,
      provider: formData.provider,
      api_key: formData.api_key,
      api_url: formData.api_url,
      default_model: formData.default_model,
      capabilities: { "image_generation": true, "text_generation": false, "site_builder": false },
      is_active: false,
    };

    let error;
    if (editingConnection) {
      ({ error } = await supabase.from('user_ai_connections').update(dataToSave).eq('id', editingConnection.id));
    } else {
      ({ error } = await supabase.from('user_ai_connections').insert([dataToSave]));
    }

    if (error) {
      toast.error(`Erro ao ${editingConnection ? 'atualizar' : 'criar'} conexão`, { description: error.message });
    } else {
      toast.success(`Conexão ${editingConnection ? 'atualizada' : 'criada'}!`);
      onFinished();
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="glass-effect border-white/20 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>{editingConnection ? 'Editar Conexão de Imagem' : 'Nova Conexão de Imagem'}</DialogTitle>
          <DialogDescription className="text-gray-400">{editingConnection ? 'Atualize os dados da conexão' : 'Adicione sua chave de API para gerar imagens'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div>
            <Label htmlFor="conn-name">Nome da Conexão</Label>
            <Input id="conn-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Meu Gemini" className="glass-input" required />
          </div>
          <div>
            <Label htmlFor="conn-provider">Provedor</Label>
            <Select onValueChange={handleProviderChange} value={formData.provider}>
              <SelectTrigger id="conn-provider" className="w-full glass-input">
                <SelectValue placeholder="Selecione um provedor" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 text-white border-white/20">
                {imageProviderOptions.map(provider => (<SelectItem key={provider} value={provider}>{provider}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {(formData.provider === 'Google' || formData.provider === 'OpenRouter') && (
            <div>
              <Label htmlFor="conn-default_model">Modelo de geração de imagem</Label>
              {formData.provider === 'OpenRouter' ? (
                <Select
                  value={formData.default_model || ''}
                  onValueChange={(value) => setFormData({ ...formData, default_model: value })}
                  disabled={isLoadingImageModels}
                >
                  <SelectTrigger id="conn-default_model" className="w-full glass-input">
                    {isLoadingImageModels ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando modelos...
                      </span>
                    ) : openRouterImageModels.length === 0 ? (
                      <SelectValue placeholder="Informe a chave da API acima para carregar os modelos" />
                    ) : (
                      <SelectValue placeholder="Selecione um modelo de geração de imagem" />
                    )}
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 text-white border-white/20 max-h-60">
                    {openRouterImageModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name || model.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={formData.default_model || ''}
                  onValueChange={(value) => setFormData({ ...formData, default_model: value })}
                  disabled={isLoadingGoogleModels}
                >
                  <SelectTrigger id="conn-default_model" className="w-full glass-input">
                    {isLoadingGoogleModels ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando modelos...
                      </span>
                    ) : googleImageModels.length === 0 ? (
                      <SelectValue placeholder="Informe a chave da API acima para carregar os modelos" />
                    ) : (
                      <SelectValue placeholder="Selecione um modelo de geração de imagem" />
                    )}
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 text-white border-white/20 max-h-60">
                    {googleImageModels.map((model) => {
                      const name = model?.name ?? '';
                      const value = name.replace(/^models\//, '');
                      const label = model?.displayName || name || model?.baseModelId || value;
                      return (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {formData.provider === 'OpenRouter'
                  ? 'Lista apenas modelos com suporte a geração de imagem no OpenRouter.'
                  : 'Lista apenas modelos com suporte a geração de imagem no Google (Gemini/Imagen).'}
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="conn-api_key">Chave da API (API Key)</Label>
            <div className="relative">
              <Input id="conn-api_key" type={showApiKey ? 'text' : 'password'} value={formData.api_key} onChange={(e) => setFormData({ ...formData, api_key: e.target.value })} className="glass-input pr-10" required />
              <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-white" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Sua chave é armazenada de forma segura e usada apenas para se comunicar com a API do provedor.</p>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground glow-effect">{editingConnection ? 'Atualizar' : 'Salvar'} Conexão</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserImageConnectionDialog;