import React from 'react';
    import { NavLink, useNavigate } from 'react-router-dom';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Settings, Users, ClipboardList, LogOut, ChevronRight } from 'lucide-react';
    
    const MobileMenu = () => {
      const { profile, signOut } = useAuth();
      const navigate = useNavigate();
    
      const handleSignOut = async () => {
        await signOut();
        navigate('/auth');
      };
    
      const menuItems = [
        { name: 'Clientes', icon: Users, path: '/clientes' },
        { name: 'Planejamento Estratégico', icon: ClipboardList, path: '/ferramentas/planejamento' },
        { name: 'Configurações', icon: Settings, path: '/settings' },
      ];
    
      return (
        <div className="p-4 pb-24 md:pb-4 container-responsive">
          <h1 className="text-xl sm:text-2xl font-bold mb-6">Menu</h1>
          
          <div className="space-y-2">
            {menuItems.map(item => (
              <NavLink
                key={item.name}
                to={item.path}
                className="flex items-center justify-between p-4 min-h-[44px] bg-card rounded-lg shadow-sm hover:bg-muted transition-colors touch-target"
              >
                <div className="flex items-center">
                  <item.icon className="w-5 h-5 mr-4 text-muted-foreground" />
                  <span className="font-medium">{item.name}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </NavLink>
            ))}
          </div>
    
          <div className="mt-8">
            <button
              onClick={handleSignOut}
              className="flex items-center justify-between w-full p-4 bg-card rounded-lg shadow-sm hover:bg-muted transition-colors text-destructive"
            >
              <div className="flex items-center">
                <LogOut className="w-5 h-5 mr-4" />
                <span className="font-medium">Sair</span>
              </div>
               <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      );
    };
    
    export default MobileMenu;