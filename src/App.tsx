import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
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
import Auth from "./pages/Auth";
import SetupAdmin from "./pages/SetupAdmin";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";
import JobBoard from "./pages/JobBoard";
import UserManagement from "./pages/UserManagement";
import FreelancerDashboard from "./pages/FreelancerDashboard";
import FreelancerJobList from "./pages/FreelancerJobList";
import FreelancerJobDetail from "./pages/FreelancerJobDetail";
import BrandPoseLibrary from "./pages/BrandPoseLibrary";
import ReposeProduction from "./pages/ReposeProduction";
import PublicJobWorkspace from "./pages/PublicJobWorkspace";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/setup-admin" element={<SetupAdmin />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            
            {/* Client review - has its own password protection */}
            <Route path="/review/:reviewId" element={<ClientReview />} />
            
            {/* Public freelancer workspace - link-based access */}
            <Route path="/work/:accessToken" element={<PublicJobWorkspace />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <Hub />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/expression-map" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <ExpressionMap />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/expression-map/:projectId" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <ExpressionMap />
                </ProtectedRoute>
              } 
            />
            {/* Legacy redirect - keep for backwards compatibility */}
            <Route 
              path="/avatar-repose" 
              element={<Navigate to="/brand-pose-library" replace />} 
            />
            {/* New separated surfaces */}
            <Route 
              path="/brand-pose-library" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <BrandPoseLibrary />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/repose-production" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <ReposeProduction />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/repose-production/batch/:batchId" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <ReposeProduction />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/external" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <External />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/external/talent-replacement" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <TalentReplacement />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/face-creator" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <FaceCreator />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/face-application" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <FaceApplication />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/face-application/:projectId" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <FaceApplication />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/digital-talent" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <DigitalTalent />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/tommy-hilfiger" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <TommyHilfiger />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/jobs" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal']}>
                  <JobBoard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/users" 
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <UserManagement />
                </ProtectedRoute>
              } 
            />
            
            {/* Freelancer routes */}
            <Route 
              path="/freelancer" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal', 'freelancer']}>
                  <FreelancerDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/freelancer/jobs" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal', 'freelancer']}>
                  <FreelancerJobList />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/freelancer/jobs/:jobId" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'internal', 'freelancer']}>
                  <FreelancerJobDetail />
                </ProtectedRoute>
              } 
            />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
