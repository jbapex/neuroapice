import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Home, Settings, Users, Layers, Zap, MessageSquare as BotMessageSquare, PenSquare, Palette, ClipboardList, LogOut, Brain, BookCopy, Mic, Menu } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const SuperAdminLayout = () => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navLinks = [
    { to: '/superadmin/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/superadmin/planos', icon: Layers, label: 'Planos' },
    { to: '/superadmin/usuarios', icon: Users, label: 'Usuários' },
    { to: '/superadmin/modulos', icon: Zap, label: 'Módulos de Conteúdo' },
    { to: '/superadmin/ads-inteligente', icon: BotMessageSquare, label: 'Módulos de Anúncios' },
    { to: '/superadmin/planejamento', icon: ClipboardList, label: 'Planejamento Estratégico' },
    { to: '/superadmin/templates-nicho', icon: Palette, label: 'Templates de Nicho' },
    { to: '/superadmin/criar-site', icon: PenSquare, label: 'Criador de Sites' },
    { to: '/superadmin/transcritor', icon: Mic, label: 'Transcritor de Vídeo' },
    { to: '/superadmin/ai-settings', icon: Settings, label: 'Configurações de IA' },
    { to: '/superadmin/variaveis', icon: BookCopy, label: 'Variáveis do Sistema' },
  ];

  const getInitials = (name) => {
    if (!name) return 'SA';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
  };

  const textVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.3, delay: 0.1 } },
  };
  
  const pageVariants = {
    initial: { opacity: 0, y: 5 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -5 },
    transition: { duration: 0.4 }
  };

  const SidebarContent = () => (
    <>
      <div className="flex items-center p-4 h-16 border-b bg-card text-foreground justify-start">
        <Brain className="w-6 h-6 text-primary flex-shrink-0" />
        <div className="ml-3">
          <h1 className="text-xl font-bold whitespace-nowrap">Neuro Ápice</h1>
          <p className="text-xs text-muted-foreground whitespace-nowrap">Painel Super Admin</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={() => !isDesktop && setIsMobileMenuOpen(false)}
            className={({ isActive }) =>
              `flex items-center p-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <link.icon className="h-5 w-5 flex-shrink-0" />
            <span className="ml-4 whitespace-nowrap">{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t mt-auto">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground font-bold">
              {getInitials(user?.user_metadata?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden min-w-0">
            <p className="font-semibold text-sm truncate">{user?.user_metadata?.name || user?.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.user_metadata?.user_type}</p>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground min-h-[44px] touch-target" onClick={() => { handleSignOut(); !isDesktop && setIsMobileMenuOpen(false); }}>
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <motion.aside
        initial={false}
        animate={{ width: isSidebarCollapsed ? '5rem' : '16rem' }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        onMouseEnter={() => setIsSidebarCollapsed(false)}
        onMouseLeave={() => setIsSidebarCollapsed(true)}
        className="hidden md:flex flex-col bg-card border-r overflow-hidden"
      >
        <div className={`flex items-center p-4 h-16 border-b bg-card text-foreground ${isSidebarCollapsed ? 'justify-center' : 'justify-start'}`}>
          {!isSidebarCollapsed ? (
            <motion.div key="full-title" variants={textVariants} initial="hidden" animate="visible" exit="hidden">
              <h1 className="text-xl font-bold whitespace-nowrap">Neuro Ápice</h1>
              <p className="text-xs text-muted-foreground whitespace-nowrap">Painel Super Admin</p>
            </motion.div>
          ) : (
            <motion.div key="icon-title" className="w-8 h-8 flex items-center justify-center">
              <Brain className="w-6 h-6 text-primary" />
            </motion.div>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center p-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${isSidebarCollapsed ? 'justify-center' : ''} ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <link.icon className="h-5 w-5 flex-shrink-0" />
              {!isSidebarCollapsed && (
                <motion.span variants={textVariants} className="ml-4 whitespace-nowrap">
                  {link.label}
                </motion.span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3 mb-4">
            <Avatar className={`h-10 w-10 flex-shrink-0 ${isSidebarCollapsed ? 'mx-auto' : ''}`}>
              <AvatarFallback className="bg-primary text-primary-foreground font-bold">
                {getInitials(user?.user_metadata?.name)}
              </AvatarFallback>
            </Avatar>
            {!isSidebarCollapsed && (
              <motion.div variants={textVariants} className="flex-1 overflow-hidden">
                <p className="font-semibold text-sm truncate">{user?.user_metadata?.name || user?.email}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.user_metadata?.user_type}</p>
              </motion.div>
            )}
          </div>
          {!isSidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </motion.div>
          )}
        </div>
      </motion.aside>

      {!isDesktop && (
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-40"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-hidden="true"
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className="fixed top-0 left-0 h-full w-72 max-w-[85vw] bg-card border-r z-50 flex flex-col overflow-hidden"
              >
                <SidebarContent />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex h-14 md:h-16 items-center justify-between border-b bg-card px-3 sm:px-4 md:px-6 shrink-0">
          {!isDesktop && (
            <Button variant="ghost" size="icon" className="touch-target" onClick={() => setIsMobileMenuOpen(true)} aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0" />
          <ThemeToggle />
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/40">
           <AnimatePresence mode="wait">
             <motion.div
                key={location.pathname}
                initial="initial"
                animate="animate"
                exit="exit"
                variants={pageVariants}
                className="p-4 sm:p-6 lg:p-8 h-full w-full max-w-full"
              >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminLayout;