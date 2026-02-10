import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Bot } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import ClientOnboardingAssistant from './ClientOnboardingAssistant';
import { cn } from '@/lib/utils';

const clientSchema = z.object({
  name: z.string().min(2, { message: "O nome do cliente deve ter pelo menos 2 caracteres." }),
  creator_name: z.string().max(50, "Máximo de 50 caracteres").optional().nullable(),
  niche: z.string().max(50, "Máximo de 50 caracteres").optional().nullable(),
  style_in_3_words: z.string().max(100, "Máximo de 100 caracteres").optional().nullable(),
  product_to_promote: z.string().max(140, "Máximo de 140 caracteres").optional().nullable(),
  target_audience: z.string().max(100, "Máximo de 100 caracteres").optional().nullable(),
  success_cases: z.string().max(200, "Máximo de 200 caracteres").optional().nullable(),
  profile_views: z.string().max(100, "Máximo de 100 caracteres").optional().nullable(),
  followers: z.string().max(100, "Máximo de 100 caracteres").optional().nullable(),
  appearance_format: z.string().max(100, "Máximo de 100 caracteres").optional().nullable(),
  catchphrases: z.string().max(100, "Máximo de 100 caracteres").optional().nullable(),
  phone: z.string().optional().nullable(),
  about: z.string().optional().nullable(),
});

const ClientForm = ({ client, onSave, onCancel }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiFilledFields, setAiFilledFields] = useState(new Set());

  const { register, handleSubmit, formState: { errors }, reset, setValue, getValues, watch } = useForm({
    resolver: zodResolver(clientSchema),
    defaultValues: client || {},
  });

  const formValues = watch();

  useEffect(() => {
    const defaultValues = {
      name: '',
      creator_name: '',
      niche: '',
      style_in_3_words: '',
      product_to_promote: '',
      target_audience: '',
      success_cases: '',
      profile_views: '',
      followers: '',
      appearance_format: '',
      catchphrases: '',
      phone: '',
      about: '',
    };
    reset(client ? { ...defaultValues, ...client } : defaultValues);
  }, [client, reset]);

  // Wrapper para setValue que marca campo como preenchido pela IA
  const handleSetValue = (field, value, options = {}) => {
    setValue(field, value, options);
    setAiFilledFields(prev => new Set([...prev, field]));
  };

  const onSubmit = async (data) => {
    if (!user) return;
    setIsSubmitting(true);

    const dataToSave = {
      ...data,
      user_id: user.id,
    };

    let error;
    if (client && client.id) {
      ({ error } = await supabase.from('clients').update(dataToSave).eq('id', client.id));
    } else {
      ({ error } = await supabase.from('clients').insert(dataToSave));
    }

    setIsSubmitting(false);

    if (error) {
      toast({ title: 'Erro ao salvar cliente', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Cliente ${client && client.id ? 'atualizado' : 'criado'}!`, description: 'Operação realizada com sucesso.' });
      setAiFilledFields(new Set());
      onSave();
    }
  };

  // Função helper para renderizar campo com badge IA
  const renderField = (fieldName, label, inputType = 'input', placeholder = '', rows = undefined) => {
    const isAiFilled = aiFilledFields.has(fieldName);
    const hasValue = formValues[fieldName];
    
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={fieldName} className={fieldName === 'name' ? 'font-bold text-lg' : ''}>
            {label}
          </Label>
          {isAiFilled && hasValue && (
            <Badge variant="secondary" className="text-xs">
              <Bot className="w-3 h-3 mr-1" />
              IA
            </Badge>
          )}
        </div>
        {inputType === 'input' ? (
          <Input 
            id={fieldName} 
            {...register(fieldName)} 
            placeholder={placeholder}
            className={cn(isAiFilled && hasValue && 'border-primary/50')}
          />
        ) : (
          <Textarea 
            id={fieldName} 
            {...register(fieldName)} 
            placeholder={placeholder}
            rows={rows}
            className={cn(isAiFilled && hasValue && 'border-primary/50')}
          />
        )}
        {errors[fieldName] && <p className="text-sm text-destructive">{errors[fieldName].message}</p>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
        <DrawerHeader className="flex-shrink-0 px-6 pt-4">
            <DrawerTitle>{client ? 'Editar Cliente' : 'Adicionar Novo Cliente'}</DrawerTitle>
            <DrawerDescription>
                {client ? 'Atualize as informações do cliente.' : 'Preencha as informações manualmente ou use o assistente de IA ao lado.'}
            </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-1 overflow-hidden min-h-0 px-6 pb-4">
          {/* Formulário à esquerda */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden pr-4 border-r w-[60%] min-h-0">
            <ScrollArea className="flex-1 min-h-0 pr-4 -mr-4">
                <div className="space-y-6 pb-6">
                    {renderField('name', 'Nome do Cliente', 'input', 'Ex: Empresa do Josias')}
                    {renderField('creator_name', 'Seu nome ou nome do criador', 'input', 'Ex: Josias Bonfim')}
                    {renderField('niche', 'Seu nicho', 'input', 'Ex: Marketing Digital')}
                    {renderField('style_in_3_words', 'Defina seu estilo em 3 palavras', 'input', 'Ex: Divertido, direto, inspirador')}
                    {renderField('product_to_promote', 'Você tem algum produto/serviço específico para promover? Qual?', 'input', 'Ex: Consultoria de Marketing')}
                    {renderField('target_audience', 'Público-alvo principal', 'textarea', 'Ex: Mulheres de 18-35 anos interessadas em maquiagem acessível...')}
                    {renderField('success_cases', 'Casos de sucesso', 'textarea', 'Quais são grandes feitos que você possui para o seu mercado, comente sobre sua experiência no nicho')}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderField('profile_views', 'Total de visualizações do perfil', 'input', 'Ex: 100 Mil de views')}
                        {renderField('followers', 'Total de seguidores', 'input', 'Ex: 10k de seguidores')}
                    </div>
                    {renderField('appearance_format', 'Formato de aparição', 'input', 'Ex: Apareço falando / voz em off / só texto e imagens')}
                    {renderField('catchphrases', 'Bordões ou frases-chave que usa sempre', 'input', 'Ex: "Anota essa!"')}
                    {renderField('phone', 'Telefone (Opcional)', 'input', '(11) 99999-9999')}
                    {renderField('about', 'Sobre o Cliente (Opcional)', 'textarea', 'Descreva o que o cliente vende, um pouco sobre a empresa, etc.', 3)}
                </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 flex-shrink-0 border-t">
                <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
                </Button>
            </div>
          </form>

          {/* Chat com IA à direita */}
          <div className="w-[40%] flex-shrink-0 min-h-0 overflow-hidden">
            <ClientOnboardingAssistant
              formState={formValues}
              setValue={handleSetValue}
              getValues={getValues}
              watch={watch}
              mode={client ? 'edit' : 'create'}
              clientName={client?.name || null}
            />
          </div>
        </div>
    </div>
  );
};

export default ClientForm;