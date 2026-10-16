import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import OS from './os/OS';
import GitRedirect from './pages/GitRedirect';
import LinkedInRedirect from './pages/LinkedInRedirect';

// The share board and the ETF page are their own tools; load them only when visited.
const SharePage = lazy(() => import('./pages/SharePage'));
// /share is switched off for now (Max, 2026-10-16) and sends visitors to the desktop. Set this to
// true, together with SHARE_ON in server/index.js, to bring the board back.
const SHARE_ON = false;
const ETFComparison = lazy(() => import('./etf'));

function App() {
  return (
    <Router>
      <Suspense fallback={null}>
        <Routes>
          <Route path="share" element={SHARE_ON ? <SharePage /> : <Navigate to="/" replace />} />
          <Route path="etf" element={<ETFComparison />} />
          <Route path="git" element={<GitRedirect />} />
          <Route path="gh" element={<GitRedirect />} />
          <Route path="github" element={<GitRedirect />} />
          <Route path="linkedin" element={<LinkedInRedirect />} />
          {/* everything else is the desktop; it reads deep links like /work/manager itself */}
          <Route path="*" element={<OS />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
