import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, MapPin, Instagram, Facebook } from "lucide-react";
import { cn } from "./ui-elements";

const logoImg = `${import.meta.env.BASE_URL}images/logo-refugio.png`;
const logoIcon = `${import.meta.env.BASE_URL}images/logo-icon.png`;

const navLinks = [
  { name: "Início", href: "/" },
  { name: "Lugares", href: "/lugares" },
  { name: "Experiências", href: "/experiencias" },
  { name: "Gastronomia", href: "/gastronomia" },
  { name: "Hospedagem", href: "/hospedagem" },
  { name: "Buscar", href: "/buscar" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      {/* Fixed header — transparent with dark gradient for readability */}
      <header
        className="fixed top-0 inset-x-0 z-50"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/">
            <img
              src={logoIcon}
              alt="Refúgio da Ferradura"
              className="h-[64px] w-auto object-contain drop-shadow-lg"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  "text-sm font-semibold tracking-wide text-white drop-shadow-md transition-opacity hover:opacity-100",
                  location === link.href
                    ? "opacity-100 border-b border-white/70 pb-0.5"
                    : "opacity-80"
                )}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 text-white drop-shadow-md"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav Overlay */}
        <div
          className={cn(
            "fixed inset-0 bg-background z-40 flex flex-col pt-24 px-6 transition-transform duration-300 ease-in-out md:hidden",
            mobileMenuOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <nav className="flex flex-col gap-6 text-2xl font-serif">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  "border-b border-border pb-4 transition-colors",
                  location === link.href ? "text-primary" : "text-foreground"
                )}
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col">{children}</main>

      {/* Footer */}
      <footer className="bg-foreground text-muted pt-16 pb-8 border-t border-primary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img src={logoImg} alt="Refúgio da Ferradura" className="h-14 w-14 rounded-full object-cover" />
                <span className="font-serif font-semibold text-xl text-white">Refúgio da Ferradura</span>
              </div>
              <p className="text-muted-foreground max-w-xs leading-relaxed">
                Descubra a magia e tranquilidade da Rota da Ferradura em Guarapari, ES. Natureza, gastronomia e paz.
              </p>
            </div>

            <div>
              <h4 className="font-serif font-medium text-white mb-4">Navegação</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/" className="hover:text-primary transition-colors">Início</Link></li>
                <li><Link href="/lugares" className="hover:text-primary transition-colors">Lugares</Link></li>
                <li><Link href="/experiencias" className="hover:text-primary transition-colors">Experiências</Link></li>
                <li><Link href="/gastronomia" className="hover:text-primary transition-colors">Gastronomia</Link></li>
                <li><Link href="/hospedagem" className="hover:text-primary transition-colors">Hospedagem</Link></li>
                <li><Link href="/admin/login" className="hover:text-primary transition-colors">Área Restrita</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-serif font-medium text-white mb-4">Contato</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Rota da Ferradura, Buenos Aires<br />Guarapari - ES</span>
                </li>
                <li className="flex items-center gap-4 pt-4">
                  <a href="#" className="p-2 bg-white/5 rounded-full hover:bg-primary hover:text-white transition-colors">
                    <Instagram className="w-4 h-4" />
                  </a>
                  <a href="#" className="p-2 bg-white/5 rounded-full hover:bg-primary hover:text-white transition-colors">
                    <Facebook className="w-4 h-4" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} Refúgio da Ferradura. Todos os direitos reservados.</p>
            <p>Feito com amor pela natureza.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
