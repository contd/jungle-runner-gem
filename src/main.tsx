/**
 * Browser/WebView entry point mounting the React shell into index.html's root.
 * Imports the Tailwind/global stylesheet as a side effect; no native API is required.
 * The host document must provide the root element before this module executes.
 * @module main
 */
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
