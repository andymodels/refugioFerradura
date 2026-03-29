import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, User } from "lucide-react";
import { Input, Button, Label } from "@/components/ui-elements";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Usuário é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
});

type LoginForm = z.infer<typeof loginSchema>;

const logoImg = `${import.meta.env.BASE_URL}images/logo-refugio.png`;

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
        title: "Credenciais inválidas",
        description: "Verifique seu usuário e senha e tente novamente.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1504700610630-ac6aba3536d3?w=1200&q=85&auto=format&fit=crop"
          alt="Rota da Ferradura"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/50 to-black/60" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Refúgio da Ferradura" className="h-16 w-16 rounded-full object-cover shadow-lg" />
            <div>
              <h2 className="font-serif font-bold text-xl leading-tight">Refúgio da Ferradura</h2>
              <p className="text-white/70 text-sm">Guarapari - ES</p>
            </div>
          </div>

          <div>
            <blockquote className="font-serif text-2xl font-light leading-relaxed text-white/95 mb-6">
              "Onde a serra encontra o mar, a natureza revela seus maiores segredos."
            </blockquote>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Lock className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Área Administrativa</p>
                <p className="text-white/60 text-xs">Acesso restrito a usuários autorizados</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <img src={logoImg} alt="Refúgio da Ferradura" className="h-20 w-20 rounded-full object-cover shadow-lg" />
          </div>

          <div className="mb-10">
            <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Acesso Restrito</h1>
            <p className="text-muted-foreground">
              Gerencie o conteúdo do Refúgio da Ferradura.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <Label htmlFor="username" className="text-sm font-medium mb-2 block">
                Usuário
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="username"
                  {...register("username")}
                  placeholder="Digite seu usuário"
                  className="pl-10"
                  autoComplete="username"
                />
              </div>
              {errors.username && (
                <p className="text-xs text-destructive mt-1.5">{errors.username.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-medium mb-2 block">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  {...register("password")}
                  placeholder="••••••••"
                  className="pl-10"
                  autoComplete="current-password"
                />
              </div>
              {errors.password && (
                <p className="text-xs text-destructive mt-1.5">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full mt-4"
              size="lg"
              isLoading={isLoggingIn}
            >
              {isLoggingIn ? "Entrando..." : "Entrar no Painel"}
            </Button>
          </form>

          <div className="mt-10 pt-6 border-t border-border">
            <p className="text-xs text-center text-muted-foreground">
              © {new Date().getFullYear()} Refúgio da Ferradura • Rota da Ferradura, Guarapari - ES
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
