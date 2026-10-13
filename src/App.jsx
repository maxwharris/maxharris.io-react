import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import OS from './os/OS';
import GitRedirect from './pages/GitRedirect';
import LinkedInRedirect from './pages/LinkedInRedirect';

// The share board and the ETF page are their own tools; load them only when visited.
const SharePage = lazy(() => import('./pages/SharePage'));
const ETFComparison = lazy(() => import('./etf'));

function App() {
  return (
    <Router>
      <Suspense fallback={null}>
        <Routes>
          <Route path="share" element={<SharePage />} />
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
