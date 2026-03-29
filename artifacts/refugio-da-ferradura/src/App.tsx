import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Public Pages
import Home from "./pages/home";
import Blog from "./pages/blog";
import BlogPost from "./pages/blog-post";
import Places from "./pages/places";
import PlaceDetail from "./pages/place-detail";
import Search from "./pages/search";

// Admin Pages
import AdminLogin from "./pages/admin/login";
import AdminDashboard from "./pages/admin/dashboard";
import AdminPosts from "./pages/admin/posts";
import AdminPostEditor from "./pages/admin/posts/editor";
import AdminPlaces from "./pages/admin/places";
import AdminPlaceEditor from "./pages/admin/places/editor";
import AdminMedia from "./pages/admin/media";

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
      <Route path="/lugares" component={Places} />
      <Route path="/lugares/:slug" component={PlaceDetail} />
      <Route path="/buscar" component={Search} />

      {/* Admin Routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminDashboard} />
      
      {/* Admin Posts */}
      <Route path="/admin/posts" component={AdminPosts} />
      <Route path="/admin/posts/novo" component={AdminPostEditor} />
      <Route path="/admin/posts/:id/editar" component={AdminPostEditor} />
      
      {/* Admin Places */}
      <Route path="/admin/places" component={AdminPlaces} />
      <Route path="/admin/places/novo" component={AdminPlaceEditor} />
      <Route path="/admin/places/:id/editar" component={AdminPlaceEditor} />
      
      {/* Admin Media */}
      <Route path="/admin/media" component={AdminMedia} />

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
