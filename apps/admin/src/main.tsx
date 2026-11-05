import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminShell } from './shell';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<StrictMode><AdminShell /></StrictMode>);
