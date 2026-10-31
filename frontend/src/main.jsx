import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import FestiveLayer from './festive/FestiveLayer.jsx';
import './index.css';

// No StrictMode: Taskflow mounts legacy listeners on real DOM; StrictMode
// double-mount was wiping #navList and leaving a blank shell.
// FestiveLayer is the seasonal (Diwali) theme; see src/festive/festive.js to switch it off.
createRoot(document.getElementById('root')).render(
  <>
    <App />
    <FestiveLayer />
  </>
);
