import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TriangleWorkspace } from './scarf/TriangleWorkspace';
import './styles.css';

const design = new URLSearchParams(window.location.search).get('design');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {design === 'atelier-paisley' || design === 'fig-camel' ? <TriangleWorkspace id={design} /> : <App />}
  </StrictMode>,
);
