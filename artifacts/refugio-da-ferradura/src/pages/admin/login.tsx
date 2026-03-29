import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Leaf } from "lucide-react";
import { Input, Button, Label, Card } from "@/components/ui-elements";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Usuário é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function AdminLogin() {
  const { login, isLoggingIn, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  React.useEffect(() => {
    if (isAuthenticated) {
      setLocation("/admin");
    }
  }, [isAuthenticated, setLocation]);

  const onSubmit = async (data: LoginForm) => {
    try {
      await login({ data });
      toast({ title: "Login realizado com sucesso!" });
      setLocation("/admin");
    } catch (error: any) {
      toast({ 
        title: "Erro no login", 
        description: error.message || "Credenciais inválidas", 
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
        <img src={`${import.meta.env.BASE_URL}images/texture-bg.png`} className="w-full h-full object-cover" alt="" />
      </div>
      
      <Card className="w-full max-w-md p-8 relative z-10 shadow-xl border-border/50">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white mb-4">
            <Leaf className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Acesso Restrito</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie o conteúdo do Refúgio da Ferradura</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <Label htmlFor="username">Usuário</Label>
            <Input id="username" {...register("username")} placeholder="admin" />
            {errors.username && <p className="text-xs text-destructive mt-1">{errors.username.message}</p>}
          </div>
          
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" {...register("password")} placeholder="••••••••" />
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
          </div>

          <Button type="submit" className="w-full mt-2" size="lg" isLoading={isLoggingIn}>
            Entrar no Painel
          </Button>
        </form>
      </Card>
    </div>
  );
}
