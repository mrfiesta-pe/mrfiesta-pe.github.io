import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'

const GuestPage = lazy(() => import('./pages/GuestPage').then((module) => ({ default: module.GuestPage })))
const DJPage = lazy(() => import('./pages/DJPage').then((module) => ({ default: module.DJPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))

export default function App() {
  const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter
  return <Router><Suspense fallback={<main className="loading-screen"><span>Abriendo MR FIESTA LIVE…</span></main>}><Routes>
    <Route path="/e/:slug" element={<GuestPage />} />
    <Route path="/cabina/:slug" element={<DJPage />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/" element={<Navigate to="/admin" replace />} />
    <Route path="*" element={<Navigate to="/admin" replace />} />
  </Routes></Suspense></Router>
}
