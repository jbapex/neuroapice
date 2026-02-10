import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Lock, Mail, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
        
        toast({ title: "Login realizado com sucesso!", description: "Bem-vindo de volta!" });

      } else {
        const { data, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              user_type: 'user',
            },
          },
        });
        if (error) throw error;
        if (data.user) {
            toast({ title: "Cadastro realizado!", description: "Verifique seu e-mail para confirmação." });
            setIsLogin(true);
        }
      }
    } catch (error) {
      toast({
        title: "Erro de Autenticação",
        description: error.message || 'Ocorreu um erro. Verifique suas credenciais e tente novamente.',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 py-6 bg-gradient-to-br from-blue-100 to-purple-200 dark:from-gray-900 dark:to-black overflow-x-hidden">
       <div className="absolute inset-0 overflow-hidden">
        <motion.div animate={{ x: [0, 100, 0], y: [0, -100, 0], rotate: [0, 180, 360] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute top-1/4 left-1/4 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
        <motion.div animate={{ x: [0, -100, 0], y: [0, 100, 0], rotate: [360, 180, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-secondary/10 rounded-full blur-2xl" />
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="relative z-10 w-full max-w-md px-0">
        <Card className="bg-card/80 backdrop-blur-sm border-border shadow-2xl dark:border-white/10">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-4 rounded-full inline-block">
                <Brain className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold text-foreground mt-4">Neuro Ápice</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">{isLogin ? 'Faça login para continuar' : 'Crie sua conta para começar'}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                 <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="name" type="text" value={formData.name} onChange={handleInputChange} placeholder="Seu nome" className="pl-10 bg-input border-input text-foreground placeholder:text-muted-foreground" required />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" value={formData.email} onChange={handleInputChange} placeholder="seu@email.com" className="pl-10 bg-input border-input text-foreground placeholder:text-muted-foreground" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" value={formData.password} onChange={handleInputChange} placeholder="Sua senha" className="pl-10 bg-input border-input text-foreground placeholder:text-muted-foreground" required />
                </div>
              </div>
              <Button type="submit" className="w-full min-h-[44px] touch-target" disabled={loading}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Entrar' : 'Cadastrar')}
              </Button>
            </form>
            <div className="mt-6 text-center">
              <Button variant="link" onClick={() => setIsLogin(!isLogin)} className="text-muted-foreground hover:text-primary">
                {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça login'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default AuthPage;