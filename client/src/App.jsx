import { Link, Route, Routes } from 'react-router-dom';
import Library from './pages/Library.jsx';
import AssetPage from './pages/AssetPage.jsx';
import SharePage from './pages/SharePage.jsx';

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">VideoReview</Link>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/asset/:id" element={<AssetPage />} />
          <Route path="/s/:token" element={<SharePage />} />
        </Routes>
      </main>
    </>
  );
}
