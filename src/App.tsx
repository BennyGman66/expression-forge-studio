import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Hub from "./pages/Hub";
import ExpressionMap from "./pages/ExpressionMap";
import AvatarRepose from "./pages/AvatarRepose";
import External from "./pages/External";
import TalentReplacement from "./pages/TalentReplacement";
import ClientReview from "./pages/ClientReview";
import FaceCreator from "./pages/FaceCreator";
import FaceApplication from "./pages/FaceApplication";
import DigitalTalent from "./pages/DigitalTalent";
import TommyHilfiger from "./pages/TommyHilfiger";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Hub />} />
          <Route path="/expression-map" element={<ExpressionMap />} />
          <Route path="/expression-map/:projectId" element={<ExpressionMap />} />
          <Route path="/avatar-repose" element={<AvatarRepose />} />
          <Route path="/external" element={<External />} />
          <Route path="/external/talent-replacement" element={<TalentReplacement />} />
          <Route path="/review/:reviewId" element={<ClientReview />} />
          <Route path="/face-creator" element={<FaceCreator />} />
          <Route path="/face-application" element={<FaceApplication />} />
          <Route path="/digital-talent" element={<DigitalTalent />} />
          <Route path="/tommy-hilfiger" element={<TommyHilfiger />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
