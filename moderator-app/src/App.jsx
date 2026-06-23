import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Setup from './pages/Setup';
import Night from './pages/Night';
import Morning from './pages/Morning';
import Day from './pages/Day';
import EndGame from './pages/EndGame';
import HunterRevenge from './pages/HunterRevenge';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby/:roomId" element={<Lobby />} />
        <Route path="/setup/:roomId" element={<Setup />} />
        <Route path="/night/:roomId" element={<Night />} />
        <Route path="/morning/:roomId" element={<Morning />} />
        <Route path="/day/:roomId" element={<Day />} />
        <Route path="/end/:roomId" element={<EndGame />} />
        <Route path="/hunter/:roomId" element={<HunterRevenge />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
