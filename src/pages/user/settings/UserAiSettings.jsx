import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit, KeyRound, Image as ImageIcon, Bot, ToggleLeft, ToggleRight, Construction, Zap, CheckCircle, ExternalLink } from 'lucide-react';
import UserLlmConnectionDialog from '@/pages/user/settings/UserLlmConnectionDialog';
import UserImageConnectionDialog from '@/pages/user/settings/UserImageConnectionDialog';
import UserSiteBuilderConnectionDialog from '@/pages/user/settings/UserSiteBuilderConnectionDialog';

const UserAiSettings = () => {
  const { user } = useAuth();
  const [llmConnections, setLlmConnections] = useState([]);
  const [imageConnections, setImageConnections] = useState([]);
  const [siteBuilderConnections, setSiteBuilderConnections] = useState([]);
  const [isLlmDialogOpen, setIsLlmDialogOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isSiteBuilderDialogOpen, setIsSiteBuilderDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);

  // Configurações de IA padrão
  const defaultAIs = [
    {
      id: 'openai-gpt4',
      name: 'OpenAI GPT-4',
      provider: 'OpenAI',
      description: 'Modelo mais avançado da OpenAI, ideal para conversas complexas e análise de dados',
      icon: '🤖',
      capabilities: { text_generation: true },
      features: ['Conversas avançadas', 'Análise de dados', 'Geração de conteúdo', 'Resolução de problemas'],
      pricing: 'Pago por uso',
      setupUrl: 'https://platform.openai.com/api-keys',
      isPopular: true
    },
    {
      id: 'google-gemini',
      name: 'Google Gemini Pro',
      provider: 'Google',
      description: 'Modelo multimodal do Google, excelente para análise e geração de conteúdo',
      icon: '💎',
      capabilities: { text_generation: true },
      features: ['Análise multimodal', 'Geração de texto', 'Raciocínio avançado', 'Integração Google'],
      pricing: 'Gratuito (com limites)',
      setupUrl: 'https://makersuite.google.com/app/apikey',
      isPopular: true
    },
    {
      id: 'anthropic-claude',
      name: 'Anthropic Claude',
      provider: 'Anthropic',
      description: 'Modelo focado em segurança e utilidade, ótimo para tarefas complexas',
      icon: '🧠',
      capabilities: { text_generation: true },
      features: ['Segurança avançada', 'Análise detalhada', 'Código e texto', 'Raciocínio complexo'],
      pricing: 'Pago por uso',
      setupUrl: 'https://console.anthropic.com/',
      isPopular: false
    },
    {
      id: 'openai-dalle',
      name: 'OpenAI DALL-E 3',
      provider: 'OpenAI',
      description: 'Gerador de imagens mais avançado, cria imagens de alta qualidade',
      icon: '🎨',
      capabilities: { image_generation: true },
      features: ['Geração de imagens', 'Alta qualidade', 'Estilos diversos', 'Edição de imagens'],
      pricing: 'Pago por imagem',
      setupUrl: 'https://platform.openai.com/api-keys',
      isPopular: true
    }
  ];

  const fetchConnections = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_ai_connections')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      toast.error('Erro ao carregar conexões de IA', { description: error.message });
    } else {
      setLlmConnections(data.filter(c => c.capabilities?.text_generation));
      setImageConnections(data.filter(c => c.capabilities?.image_generation));
      setSiteBuilderConnections(data.filter(c => c.capabilities?.site_builder));
    }
  }, [user]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleEdit = (connection) => {
    setEditingConnection(connection);
    if (connection.capabilities?.text_generation) {
        setIsLlmDialogOpen(true);
    } else if (connection.capabilities?.image_generation) {
        setIsImageDialogOpen(true);
    } else if (connection.capabilities?.site_builder) {
        setIsSiteBuilderDialogOpen(true);
    }
  };

  const handleDelete = async (connectionId) => {
    const { error } = await supabase.from('user_ai_connections').delete().eq('id', connectionId);
    if (error) {
      toast.error('Erro ao remover conexão', { description: error.message });
    } else {
      toast.success('Conexão removida com sucesso!');
      fetchConnections();
    }
  };

  const handleToggleActive = async (connection) => {
    // Permitir múltiplas IAs ativas ao mesmo tempo - remover lógica de desativação automática
    const { error } = await supabase
      .from('user_ai_connections')
      .update({ is_active: !connection.is_active })
      .eq('id', connection.id);
    
    if (error) {
        toast.error('Erro ao ativar/desativar conexão', { description: error.message });
    } else {
        toast.success(`Conexão ${!connection.is_active ? 'ativada' : 'desativada'}!`);
        fetchConnections();
    }
  };

  const handleQuickSetup = (ai) => {
    setEditingConnection(null);
    if (ai.capabilities?.text_generation) {
      setIsLlmDialogOpen(true);
    } else if (ai.capabilities?.image_generation) {
      setIsImageDialogOpen(true);
    }
  };

  const isAIConfigured = (ai) => {
    if (ai.capabilities?.text_generation) {
      return llmConnections.some(conn => conn.provider === ai.provider);
    } else if (ai.capabilities?.image_generation) {
      return imageConnections.some(conn => conn.provider === ai.provider);
    }
    return false;
  };
  
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.05,
      },
    }),
  };

  const getIconForType = (type) => {
    switch (type) {
      case 'llm':
        return <Bot className="w-5 h-5 text-primary" />;
      case 'image':
        return <ImageIcon className="w-5 h-5 text-primary" />;
      case 'site_builder':
        return <Construction className="w-5 h-5 text-primary" />;
      default:
        return null;
    }
  };

  const renderConnectionCard = (connection, index, type) => (
    <motion.div key={connection.id} custom={index} variants={cardVariants} initial="hidden" animate="visible">
      <Card className={`overflow-hidden border-2 ${connection.is_active ? 'border-primary shadow-lg shadow-primary/20' : 'border-border'} bg-card/50 backdrop-blur-sm`}>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                {getIconForType(type)}
                {connection.name}
              </CardTitle>
              <CardDescription>{connection.provider}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleToggleActive(connection)}>
                {connection.is_active ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <KeyRound className="w-4 h-4" />
            <span className="truncate">Chave de API configurada</span>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => handleEdit(connection)}><Edit className="w-4 h-4 mr-2" /> Editar</Button>
          <Button variant="destructive" size="sm" onClick={() => handleDelete(connection.id)}><Trash2 className="w-4 h-4 mr-2" /> Remover</Button>
        </CardFooter>
      </Card>
    </motion.div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <UserLlmConnectionDialog
        isOpen={isLlmDialogOpen}
        setIsOpen={setIsLlmDialogOpen}
        editingConnection={editingConnection}
        onFinished={() => {
          setEditingConnection(null);
          fetchConnections();
        }}
      />
      <UserImageConnectionDialog
        isOpen={isImageDialogOpen}
        setIsOpen={setIsImageDialogOpen}
        editingConnection={editingConnection}
        onFinished={() => {
          setEditingConnection(null);
          fetchConnections();
        }}
      />
      <UserSiteBuilderConnectionDialog
        isOpen={isSiteBuilderDialogOpen}
        setIsOpen={setIsSiteBuilderDialogOpen}
        editingConnection={editingConnection}
        onFinished={() => {
          setEditingConnection(null);
          fetchConnections();
        }}
      />

      {/* Seção de IA Padrão */}
      <section>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">Configuração Rápida de IA</h2>
          </div>
          <p className="text-muted-foreground">Escolha uma IA padrão para começar rapidamente. Configure com apenas alguns cliques!</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defaultAIs.map((ai, index) => (
            <motion.div
              key={ai.id}
              custom={index}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
              <Card className={`relative overflow-hidden border-2 transition-all duration-200 hover:shadow-lg ${
                isAIConfigured(ai) 
                  ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' 
                  : 'border-border hover:border-primary/50'
              }`}>
                {ai.isPopular && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="secondary" className="bg-primary text-primary-foreground">
                      Popular
                    </Badge>
                  </div>
                )}
                
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{ai.icon}</div>
                      <div>
                        <CardTitle className="text-lg">{ai.name}</CardTitle>
                        <CardDescription className="text-sm">{ai.provider}</CardDescription>
                      </div>
                    </div>
                    {isAIConfigured(ai) && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{ai.description}</p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">Recursos:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ai.features.slice(0, 3).map((feature, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {ai.features.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{ai.features.length - 3} mais
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{ai.pricing}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(ai.setupUrl, '_blank')}
                      className="h-6 px-2 text-xs"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Obter chave
                    </Button>
                  </div>
                </CardContent>
                
                <CardFooter>
                  <Button
                    onClick={() => handleQuickSetup(ai)}
                    className="w-full"
                    variant={isAIConfigured(ai) ? "outline" : "default"}
                    disabled={isAIConfigured(ai)}
                  >
                    {isAIConfigured(ai) ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Já configurado
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Configurar agora
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <div className="border-b border-border"></div>

      {/* LLM Connections */}
      <section>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Conexões de Modelos de Linguagem</h2>
            <p className="text-muted-foreground">Adicione e gerencie suas chaves de API para usar com o Chat de IA.</p>
          </div>
          <Button onClick={() => { setEditingConnection(null); setIsLlmDialogOpen(true); }} className="mt-4 sm:mt-0 glow-effect">
            <Plus className="w-4 h-4 mr-2" /> Nova Conexão de LLM
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {llmConnections.map((conn, index) => renderConnectionCard(conn, index, 'llm'))}
          </AnimatePresence>
        </div>
        {llmConnections.length === 0 && (
          <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-sm font-semibold text-foreground">Nenhuma conexão de LLM</h3>
            <p className="mt-1 text-sm text-muted-foreground">Adicione uma chave de API para começar a conversar.</p>
          </div>
        )}
      </section>

      <div className="border-b border-border"></div>

      {/* Image Connections */}
      <section>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Conexões de Geração de Imagem</h2>
            <p className="text-muted-foreground">Adicione e gerencie suas chaves de API para usar com o Gerador de Imagens.</p>
          </div>
          <Button onClick={() => { setEditingConnection(null); setIsImageDialogOpen(true); }} className="mt-4 sm:mt-0 glow-effect">
            <Plus className="w-4 h-4 mr-2" /> Nova Conexão de Imagem
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {imageConnections.map((conn, index) => renderConnectionCard(conn, index, 'image'))}
          </AnimatePresence>
        </div>
        {imageConnections.length === 0 && (
          <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
            <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-sm font-semibold text-foreground">Nenhuma conexão de imagem</h3>
            <p className="mt-1 text-sm text-muted-foreground">Adicione uma chave de API para começar a gerar imagens.</p>
          </div>
        )}
      </section>

      <div className="border-b border-border"></div>

      {/* Site Builder Connections */}
      <section>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Conexão para Criador de Site</h2>
            <p className="text-muted-foreground">Gerencie a chave de API para o assistente do Criador de Sites.</p>
          </div>
          <Button onClick={() => { setEditingConnection(null); setIsSiteBuilderDialogOpen(true); }} className="mt-4 sm:mt-0 glow-effect">
            <Plus className="w-4 h-4 mr-2" /> Nova Conexão para Criador de Site
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {siteBuilderConnections.map((conn, index) => renderConnectionCard(conn, index, 'site_builder'))}
          </AnimatePresence>
        </div>
        {siteBuilderConnections.length === 0 && (
          <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
            <Construction className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-sm font-semibold text-foreground">Nenhuma conexão para o Criador de Site</h3>
            <p className="mt-1 text-sm text-muted-foreground">Adicione uma chave de API para habilitar o assistente.</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default UserAiSettings;