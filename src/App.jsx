import React from 'react';
    import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
    import { Helmet } from 'react-helmet';
    import { Toaster as ShadcnToaster } from '@/components/ui/toaster';
    import { Toaster as SonnerToaster } from '@/components/ui/sonner';
    
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    
    import AuthPage from '@/pages/AuthPage';
    import SuperAdminLayout from '@/components/SuperAdminLayout';
    import SuperAdminDashboard from '@/pages/superadmin/Dashboard';
    import PlansManagement from '@/pages/superadmin/PlansManagement';
    import UsersManagement from '@/pages/superadmin/UsersManagement';
    import ModulesManagement from '@/pages/superadmin/ModulesManagement';
    import AiSettings from '@/pages/superadmin/AiSettings';
    import NicheTemplatesManagement from '@/pages/superadmin/NicheTemplatesManagement';
    import SuperAdminSiteProjectsList from '@/pages/superadmin/SiteProjectsList';
    import SuperAdminSiteBuilder from '@/pages/superadmin/SiteBuilder';
    import AdsManagement from '@/pages/superadmin/AdsManagement';
    import CampaignAnalyzer from '@/pages/superadmin/CampaignAnalyzer';
    import SystemVariables from '@/pages/superadmin/SystemVariables';
    import StrategicPlannerPage from '@/pages/superadmin/StrategicPlannerPage';
    import WhisperTranscriber from '@/pages/user/WhisperTranscriber';
    
    import UserLayout from '@/components/UserLayout';
    import Campaigns from '@/pages/user/Campaigns';
    import AiAgents from '@/pages/user/AiAgents';
    import ModuleChat from '@/pages/user/ModuleChat';
    import UserSiteProjectsList from '@/pages/user/SiteProjectsList';
    import UserSiteBuilder from '@/pages/user/SiteBuilder';
    import AdsInteligente from '@/pages/user/AdsInteligente';
    import AdsAgentChat from '@/pages/user/AdsAgentChat';
    import ProtectedRoute from '@/components/ProtectedRoute';
    import CampaignBuilder from '@/pages/user/CampaignBuilder';
    import SettingsPage from '@/pages/user/SettingsPage';
    import PrivacyPolicy from '@/pages/public/PrivacyPolicy';
    import DataDeletion from '@/pages/public/DataDeletion';
    import MetaAdsCallback from '@/pages/user/settings/MetaAdsCallback';
    import Clients from '@/pages/user/Clients';
    import ToolsPage from '@/pages/user/ToolsPage';
    import CampaignCopilot from '@/pages/user/CampaignCopilot';
    import SitePreview from '@/pages/user/SitePreview';
    import ImageGenerator from '@/pages/user/ImageGenerator';
    import NeuroDesignPage from '@/pages/user/NeuroDesignPage';
    import MobileMenu from '@/pages/user/MobileMenu';
    import AiChatPage from '@/pages/user/AiChat';
    import PerformanceDashboard from '@/pages/user/PerformanceDashboard';
    import MobileSiteEditor from '@/pages/user/MobileSiteEditor';
    import PwaUpdateNotification from '@/components/PwaUpdateNotification';
    import TrendingTopics from '@/pages/user/TrendingTopics';
    import KeywordPlanner from '@/pages/user/KeywordPlanner';
    import PublicationCalendar from '@/pages/user/PublicationCalendar';
    import FlowBuilderPage from '@/pages/user/FlowBuilderPage';
    import FlowLayout from '@/components/FlowLayout';
    import FlowsListPage from '@/pages/user/FlowsListPage';
    import UserAiSettings from '@/pages/user/settings/UserAiSettings';
    
    const App = () => {
      const { user, profile, loading, profileLoading } = useAuth();
      const location = useLocation();
    
      const isAuthRoute = location.pathname === '/auth';
      const isPublicRoute = location.pathname.startsWith('/politica') || location.pathname.startsWith('/exclusao') || location.pathname.startsWith('/integrations') || location.pathname.startsWith('/site-preview');
    
      if (loading && !isAuthRoute && !isPublicRoute) {
        return (
          <div className="flex items-center justify-center h-screen bg-background">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        );
      }
    
      const getHomeRedirect = () => {
        if (!user || !profile) return "/auth";
        if (profile.user_type === 'super_admin') return "/superadmin/dashboard";
        return "/campanhas";
      };
      
      const homeRedirectPath = getHomeRedirect();
    
      if (user && profile && isAuthRoute) {
        return <Navigate to={homeRedirectPath} replace />;
      }
    
      if (!user && !isAuthRoute && !isPublicRoute) {
        return <Navigate to="/auth" state={{ from: location }} replace />;
      }
    
      if (user && !profile && profileLoading) {
        return (
          <div className="min-h-screen bg-background flex flex-col">
            <header className="h-14 border-b flex items-center px-4 shrink-0" />
            <main className="flex-1 flex items-center justify-center p-4">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Carregando seu perfil...</p>
              </div>
            </main>
          </div>
        );
      }
    
      return (
          <>
            <Helmet>
                <title>Neuro Ápice - Sistema de Gestão Inteligente</title>
                <meta name="description" content="Sistema avançado de gestão com módulos de agentes inteligentes, planos personalizados e administração completa." />
            </Helmet>
            <div className="min-h-screen bg-background text-foreground">
                <PwaUpdateNotification />
                <Routes>
                    <Route path="/" element={<Navigate to={homeRedirectPath} />} />
                    <Route path="/auth" element={<AuthPage />} />
                    
                    <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
                    <Route path="/exclusao-de-dados" element={<DataDeletion />} />
                    <Route path="/integrations/meta-ads/callback" element={<MetaAdsCallback />} />
                    <Route path="/site-preview/:projectId" element={<SitePreview />} />
    
                    <Route 
                        path="/ferramentas/criador-de-site/:projectId"
                        element={
                        <ProtectedRoute allowedRoles={['user', 'admin', 'super_admin']} permissionKey="site_builder">
                            <UserSiteBuilder />
                        </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/ferramentas/criador-de-site/:projectId/mobile"
                        element={
                        <ProtectedRoute allowedRoles={['user', 'admin', 'super_admin']} permissionKey="site_builder">
                            <MobileSiteEditor />
                        </ProtectedRoute>
                        }
                    />
                    <Route 
                        path="/superadmin/criar-site/:projectId"
                        element={
                        <ProtectedRoute allowedRoles={['super_admin']}>
                            <SuperAdminSiteBuilder />
                        </ProtectedRoute>
                        }
                    />
                    <Route 
                        path="/superadmin/criar-site/:projectId/mobile"
                        element={
                        <ProtectedRoute allowedRoles={['super_admin']}>
                            <MobileSiteEditor />
                        </ProtectedRoute>
                        }
                    />
    
                    <Route 
                        path="/fluxo-criativo/:flowId?" 
                        element={
                        <ProtectedRoute allowedRoles={['user', 'admin', 'super_admin']}>
                            <FlowLayout>
                            <FlowBuilderPage />
                            </FlowLayout>
                        </ProtectedRoute>
                        }
                    />
    
                    <Route 
                        path="/superadmin" 
                        element={
                        <ProtectedRoute allowedRoles={['super_admin']}>
                            <SuperAdminLayout />
                        </ProtectedRoute>
                        }
                    >
                        <Route index path="dashboard" element={<SuperAdminDashboard />} />
                        <Route path="planos" element={<PlansManagement />} />
                        <Route path="usuarios" element={<UsersManagement />} />
                        <Route path="modulos" element={<ModulesManagement />} />
                        <Route path="ads-inteligente" element={<AdsManagement />} />
                        <Route path="planejamento" element={<StrategicPlannerPage />} />
                        <Route path="templates-nicho" element={<NicheTemplatesManagement />} />
                        <Route path="ai-settings" element={<AiSettings />} />
                        <Route path="variaveis" element={<SystemVariables />} />
                        <Route path="criar-site" element={<SuperAdminSiteProjectsList />} />
                        <Route path="transcritor" element={<WhisperTranscriber />} />
                    </Route>
    
                    <Route 
                        path="/"
                        element={
                        <ProtectedRoute allowedRoles={['user', 'admin']}>
                            <UserLayout />
                        </ProtectedRoute>
                        }
                    >
                        <Route index element={<Navigate to={homeRedirectPath} replace />} />
                        <Route path="campanhas" element={<Campaigns />} />
                        <Route path="campanhas/criar" element={<CampaignBuilder />} />
                        <Route path="campanhas/editar/:campaignId" element={<CampaignBuilder />} />
                        <Route path="campanhas/copilot/:campaignId" element={<CampaignCopilot />} />
                        <Route path="ferramentas" element={<ToolsPage />} />
                        <Route path="ferramentas/gerador-de-conteudo" element={<AiAgents />} />
                        <Route path="ferramentas/gerador-de-conteudo/:moduleId" element={<ModuleChat />} />
                        <Route path="ferramentas/criador-de-anuncios" element={<ProtectedRoute permissionKey="ads"><AdsInteligente /></ProtectedRoute>} />
                        <Route path="ferramentas/criador-de-anuncios/chat/:agentId" element={<ProtectedRoute permissionKey="ads"><AdsAgentChat /></ProtectedRoute>} />
                        <Route path="ferramentas/criador-de-site" element={<ProtectedRoute permissionKey="site_builder"><UserSiteProjectsList /></ProtectedRoute>} />
                        <Route path="ferramentas/planejamento" element={<ProtectedRoute permissionKey="strategic_planner"><StrategicPlannerPage /></ProtectedRoute>} />
                        <Route path="ferramentas/analisador-campanha" element={<ProtectedRoute permissionKey="campaign_analyzer"><CampaignAnalyzer /></ProtectedRoute>} />
                        <Route path="ferramentas/gerador-de-imagens" element={<ProtectedRoute permissionKey="image_generator"><ImageGenerator /></ProtectedRoute>} />
                        <Route path="ferramentas/neurodesign" element={<ProtectedRoute><NeuroDesignPage /></ProtectedRoute>} />
                        <Route path="ferramentas/assuntos-em-alta" element={<TrendingTopics />} />
                        <Route path="ferramentas/planejador-de-palavras-chave" element={<KeywordPlanner />} />
                        <Route path="ferramentas/calendario-de-publicacao" element={<PublicationCalendar />} />
                        <Route path="ferramentas/calendario-de-publicacao/:clientId" element={<PublicationCalendar />} />
                        <Route path="ferramentas/transcritor-de-video" element={<WhisperTranscriber />} />
                        <Route path="meus-fluxos" element={<FlowsListPage />} />
                        <Route path="clientes" element={<Clients />} />
                        <Route path="settings/:tab" element={<SettingsPage />} />
                        <Route path="settings" element={<Navigate to="/settings/profile" />} />
                        <Route path="settings/ai" element={<ProtectedRoute permissionKey="custom_ai"><UserAiSettings /></ProtectedRoute>} />
                        <Route path="chat-ia" element={<ProtectedRoute permissionKey="ai_chat"><AiChatPage /></ProtectedRoute>} />
                        <Route path="performance" element={<PerformanceDashboard />} />
                        <Route path="menu" element={<MobileMenu />} />
                    </Route>
                    
                    <Route path="*" element={<Navigate to={homeRedirectPath} />} />
    
                </Routes>
                <ShadcnToaster />
                <SonnerToaster />
            </div>
          </>
      );
    };
    
    export default App;