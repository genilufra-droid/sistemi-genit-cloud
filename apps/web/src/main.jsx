import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './export.css';
import './safeEnhancements.css';
import { installSafeEnhancements } from './safeEnhancements.js';
import { installLogicalActions } from './logicalActions.js';
import { installDomSafety } from './domSafety.js';

const rootElement = document.getElementById('root');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode><App /></React.StrictMode>,
);

window.requestAnimationFrame(() => {
  installSafeEnhancements();
  installLogicalActions();
  installDomSafety();
});
