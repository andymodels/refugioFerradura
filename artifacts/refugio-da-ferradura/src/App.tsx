import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Public Pages
import Home from "./pages/home";
import Blog from "./pages/blog";
import TagPage from "./pages/tag-page";
import BlogPost from "./pages/blog-post";
import Search from "./pages/search";
import PartnerUpload from "./pages/partner-upload";

// Admin Pages
import AdminLogin from "./pages/admin/login";
import AdminDashboard from "./pages/admin/dashboard";
import AdminPosts from "./pages/admin/posts";
import AdminPostEditor from "./pages/admin/posts/editor";
import AdminMedia from "./pages/admin/media";
import AdminSettings from "./pages/admin/settings";
import AdminFontes from "./pages/admin/fontes";
import AdminPartners from "./pages/admin/parceiros";
import AdminStories from "./pages/admin/stories";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={Home} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/lugares">{() => <TagPage tag="lugares" />}</Route>
      <Route path="/experiencias">{() => <TagPage tag="experiencias" />}</Route>
      <Route path="/gastronomia">{() => <TagPage tag="gastronomia" />}</Route>
      <Route path="/hospedagem">{() => <TagPage tag="hospedagem" />}</Route>
      <Route path="/eventos">{() => <TagPage tag="eventos" />}</Route>
      <Route path="/buscar" component={Search} />
      <Route path="/parceiro/:token" component={PartnerUpload} />

      {/* Admin Routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />

      {/* Admin Posts */}
      <Route path="/admin/posts" component={AdminPosts} />
      <Route path="/admin/posts/novo" component={AdminPostEditor} />
      <Route path="/admin/posts/:id/editar" component={AdminPostEditor} />

      {/* Admin Media */}
      <Route path="/admin/media" component={AdminMedia} />

      {/* Admin Settings */}
      <Route path="/admin/settings" component={AdminSettings} />

      {/* Admin Fontes */}
      <Route path="/admin/fontes" component={AdminFontes} />

      {/* Admin Parceiros */}
      <Route path="/admin/parceiros" component={AdminPartners} />

      {/* Admin Stories */}
      <Route path="/admin/stories" component={AdminStories} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
