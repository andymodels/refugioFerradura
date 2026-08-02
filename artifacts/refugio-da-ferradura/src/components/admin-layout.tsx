import React from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, FileText, Image as ImageIcon, Settings, LogOut, ArrowLeft, Rss, Users, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "./ui-elements";

const logoImg = `${import.meta.env.BASE_URL}images/logo-refugio.png`;

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-muted/30">Carregando...</div>;
  }

  if (!user && location !== "/admin/login") {
    window.location.href = `${import.meta.env.BASE_URL}admin/login`;
    return null;
  }

  const navItems = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { name: "Publicações", href: "/admin/posts", icon: FileText },
    { name: "Mídia", href: "/admin/media", icon: ImageIcon },
    { name: "Canais Oficiais", href: "/admin/fontes", icon: Rss },
    { name: "Parceiros", href: "/admin/parceiros", icon: Users },
    { name: "Stories", href: "/admin/stories", icon: Sparkles },
    { name: "Visual", href: "/admin/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col fixed inset-y-0 z-10">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3 mb-4">
            <img src={logoImg} alt="Refúgio da Ferradura" className="h-11 w-11 rounded-full object-cover shadow-sm" />
            <div>
              <p className="font-serif font-semibold text-sm text-foreground leading-tight">Refúgio da Ferradura</p>
              <p className="text-xs text-muted-foreground">Painel Admin</p>
            </div>
          </div>
          <Link href="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao site
          </Link>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/admin");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="overflow-hidden text-sm">
              <p className="font-medium text-foreground truncate">{user?.username}</p>
              <p className="text-muted-foreground text-xs">Administrador</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
