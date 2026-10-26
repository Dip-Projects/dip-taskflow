import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// No StrictMode: Taskflow mounts legacy listeners on real DOM; StrictMode
// double-mount was wiping #navList and leaving a blank shell.
createRoot(document.getElementById('root')).render(<App />);
