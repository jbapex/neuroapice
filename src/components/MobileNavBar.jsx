import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Megaphone, ClipboardList, Bot, LayoutGrid, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const MobileNavBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  
  const navItems = [
    { name: 'Campanhas', icon: Megaphone, path: '/campanhas', permissionKey: null },
    { name: 'Ferramentas', icon: ClipboardList, path: '/ferramentas', permissionKey: null },
    { name: 'Chat IA', icon: Bot, path: '/chat-ia', permissionKey: 'ai_chat' },
    { name: 'Mais', icon: LayoutGrid, path: '/menu', permissionKey: null },
  ];

  const handleNavClick = (e, item) => {
      if (!hasPermission(item.permissionKey)) {
        e.preventDefault();
        toast({
            title: "Acesso Restrito",
            description: "Este recurso não está disponível no seu plano. Considere fazer um upgrade!",
            variant: "destructive",
        });
      } else {
        navigate(item.path);
      }
  };

  const isToolsActive = location.pathname.startsWith('/ferramentas');
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-20 bg-background/80 backdrop-blur-lg border-t border-border md:hidden z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-full max-w-lg grid-cols-4 mx-auto">
        {navItems.map((item) => {
          const isActive = item.path === '/ferramentas' ? isToolsActive : location.pathname === item.path;
          const isAllowed = hasPermission(item.permissionKey);
          return (
            <div
              key={item.name}
              onClick={(e) => handleNavClick(e, item)}
              className={cn(
                "inline-flex flex-col items-center justify-center px-2 py-2 min-h-[44px] min-w-[44px] group",
                isAllowed ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed opacity-60"
              )}
            >
              <motion.div
                animate={{ y: isActive && isAllowed ? -4 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className={`flex flex-col items-center justify-center transition-colors w-full`}
              >
                <div className={`relative p-2 rounded-full transition-all ${isActive && isAllowed ? 'bg-primary/10' : ''}`}>
                  <item.icon className={`w-6 h-6 transition-colors ${isActive && isAllowed ? 'text-primary' : 'text-muted-foreground'}`} />
                  {isActive && isAllowed && (
                    <motion.div 
                      layoutId="active-mobile-indicator"
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full"
                    />
                  )}
                  {!isAllowed && (
                    <Lock className="absolute -top-1 -right-1 w-3.5 h-3.5 p-0.5 bg-destructive text-destructive-foreground rounded-full" />
                  )}
                </div>
                <span className={`text-xs text-center mt-1 transition-colors ${isActive && isAllowed ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{item.name}</span>
              </motion.div>
            </div>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNavBar;