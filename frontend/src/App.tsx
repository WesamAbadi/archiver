import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { UploadProvider } from './contexts/UploadContext';
import HomePage from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WatchPage } from './pages/WatchPage';
import { SettingsPage } from './pages/SettingsPage';
import { SearchPage } from './pages/SearchPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import Navbar from './components/Navbar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <UploadProvider>
            <div className="min-h-screen bg-gray-900">
              <Navbar />
              <div className="pb-20 md:pb-0 md:pt-14">
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={<HomePage />} />
                  <Route path="/watch/:id" element={<WatchPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </div>
            </div>
          </UploadProvider>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App; 