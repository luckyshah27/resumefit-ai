import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from './components/ui';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { Layout } from './components/Layout';
import { useAuth } from './context/AuthContext';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then((module) => ({ default: module.AnalysisPage })));
const ResultsPage = lazy(() => import('./pages/ResultsPage').then((module) => ({ default: module.ResultsPage })));
const InterviewPage = lazy(() => import('./pages/InterviewPage').then((module) => ({ default: module.InterviewPage })));
const ResumesPage = lazy(() => import('./pages/ResumesPage').then((module) => ({ default: module.ResumesPage })));
const CompareVersionsPage = lazy(() => import('./pages/CompareVersionsPage').then((module) => ({ default: module.CompareVersionsPage })));
const EditVersionPage = lazy(() => import('./pages/EditVersionPage').then((module) => ({ default: module.EditVersionPage })));
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage').then((module) => ({ default: module.ApplicationsPage })));
const ResearchPage = lazy(() => import('./pages/ResearchPage').then((module) => ({ default: module.ResearchPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Restoring your session" />;
  return user ? <Suspense fallback={<Spinner />}>{children}</Suspense> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
};

const protectedRoutes: Array<[string, JSX.Element]> = [
  ['/dashboard', <DashboardPage />],
  ['/analyze', <AnalysisPage />],
  ['/results/:id', <ResultsPage />],
  ['/results/:id/interview', <InterviewPage />],
  ['/resumes', <ResumesPage />],
  ['/resumes/:resumeId/edit', <EditVersionPage />],
  ['/resumes/compare/:a/:b', <CompareVersionsPage />],
  ['/applications', <ApplicationsPage />],
  ['/research', <ResearchPage />],
  ['/profile', <ProfilePage />],
];

export default function App() {
  const { user, status } = useAuth();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={user && status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/analysis" element={<Navigate to="/analyze" replace />} />
        {protectedRoutes.map(([path, element]) => (
          <Route key={path} path={path} element={<ProtectedRoute>{element}</ProtectedRoute>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
