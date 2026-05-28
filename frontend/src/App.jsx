import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Favorites from './pages/Favorites';
import Playlist from './pages/Playlist';
import './assets/css/main.css';
import Artist from './pages/Artist';
import Profile from './pages/Profile';
import Search from './pages/Search';
import HelpModal from './components/HelpModal';
import GenrePage from "./pages/GenrePage";

// App: маршрутизація React Router — Layout і сторінки
function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="favorites" element={<Favorites />} />
                    <Route path="playlist/:id" element={<Playlist />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="search" element={<Search />} />
                    <Route path="artist/:id" element={<Artist />} />
                    <Route path="/genre/:slug" element={<GenrePage />} />
                </Route>
            </Routes>
            <HelpModal />
        </BrowserRouter>
    );
}

export default App;