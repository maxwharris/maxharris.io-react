import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Projects from './pages/Projects';
import SharePage from './pages/SharePage';
import GitRedirect from './pages/GitRedirect';
import LinkedInRedirect from './pages/LinkedInRedirect';
import ETFComparison from './etf';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="projects" element={<Projects />} />
        </Route>
        <Route path="share" element={<SharePage />} />
        <Route path="etf" element={<ETFComparison />} />
        <Route path="git" element={<GitRedirect />} />
        <Route path="gh" element={<GitRedirect />} />
        <Route path="github" element={<GitRedirect />} />
        <Route path="linkedin" element={<LinkedInRedirect />} />
      </Routes>
    </Router>
  );
}

export default App;
