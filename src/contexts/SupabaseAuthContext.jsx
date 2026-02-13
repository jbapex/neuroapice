import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase.rpc('get_or_create_profile');

    if (error) {
      console.error('Error fetching profile:', error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar perfil",
        description: "Não foi possível carregar os dados do seu perfil.",
      });
      setProfile(null);
      return;
    }

    let profileData = data?.profile ?? null;
    if (!profileData) {
      setProfile(null);
      return;
    }

    // Se a RPC não retorna os campos do plano, enriquece o perfil buscando o plano pelo plan_id
    let planId = profileData.plan_id ?? profileData.plan?.id;
    if (!planId) {
      const { data: profileRow } = await supabase.from('profiles').select('plan_id').eq('id', userId).single();
      planId = profileRow?.plan_id ?? null;
    }
    if (planId) {
      const { data: planRow } = await supabase
        .from('plans')
        .select('has_site_builder_access, has_ads_access, has_strategic_planner_access, has_campaign_analyzer_access, has_image_generator_access, has_ai_chat_access, has_creative_flow_access, has_transcriber_access, has_trending_topics_access, has_keyword_planner_access, has_publication_calendar_access, has_neurodesign_access')
        .eq('id', planId)
        .single();

      if (planRow) {
        profileData = {
          ...profileData,
          plans: { ...profileData.plans, ...planRow },
          ...planRow,
        };
      }
    }

    setProfile(profileData);
  }, [toast]);

  const handleSession = useCallback((session) => {
    setSession(session);
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    setLoading(false);
    if (!currentUser) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    fetchProfile(currentUser.id)
      .then(() => setProfileLoading(false))
      .catch(() => setProfileLoading(false));
  }, [fetchProfile]);

  useEffect(() => {
    const SESSION_TIMEOUT_MS = 4000;
    const timeoutId = setTimeout(() => setLoading(false), SESSION_TIMEOUT_MS);

    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        clearTimeout(timeoutId);
        handleSession(session);
      } catch (e) {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setProfile(null);
          setProfileLoading(false);
        }
        handleSession(session);
      }
    );

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [handleSession]);

  const signUp = useCallback(async (email, password, options) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign up Failed",
        description: error.message || "Something went wrong",
      });
    }

    return { error };
  }, [toast]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Sign in Failed",
        description: error.message || "Something went wrong",
      });
    }

    return { error };
  }, [toast]);

  const signOut = useCallback(async () => {
    let { error } = await supabase.auth.signOut();

    // Se o servidor diz que a sessão não existe, limpa só no cliente para permitir novo login
    const sessionInvalid = error?.message?.toLowerCase().includes('session') && error?.message?.toLowerCase().includes('does not exist');
    if (error && sessionInvalid) {
      await supabase.auth.signOut({ scope: 'local' });
      error = null;
      toast({
        title: "Sessão encerrada",
        description: "Você já pode fazer login novamente.",
      });
    } else if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao sair",
        description: error.message || "Algo deu errado ao encerrar a sessão.",
      });
    }

    setSession(null);
    setUser(null);
    setProfile(null);
    return { error };
  }, [toast]);

  const hasPermission = useCallback((permissionKey, entityId = null) => {
    if (!profile) return false;
    if (profile.user_type === 'super_admin') return true;
    if (!permissionKey) return true; // Allows access if no specific permission is required

    // Handle module access check
    if (permissionKey === 'module_access' && entityId) {
      // Check if module is in user's plan modules
      const planHasModule = profile.plan_modules?.includes(entityId);
      // Check if module is directly assigned to user
      const userHasModule = profile.user_modules?.includes(entityId);
      
      return planHasModule || userHasModule;
    }

    // Handle general feature access checks (e.g., 'site_builder', 'ads', 'neurodesign')
    // Considera tanto o campo no perfil (flat) quanto no plano (profile.plans)
    const profileKey = `has_${permissionKey}_access`;
    return !!profile[profileKey] || !!profile.plans?.[profileKey];
  }, [profile]);


  const value = useMemo(() => ({
    user,
    session,
    profile,
    loading,
    profileLoading,
    signUp,
    signIn,
    signOut,
    hasPermission,
  }), [user, session, profile, loading, profileLoading, signUp, signIn, signOut, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};