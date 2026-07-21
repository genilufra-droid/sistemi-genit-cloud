import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './export.css';
import { installFetchTimeout, installGlobalExportButtons } from './exportTools.js';

installFetchTimeout(12000);

function setTextIfChanged(element, value) {
  if (element && element.textContent.trim() !== value) element.textContent = value;
}

function cleanProductionUi() {
  const groupNames = new Map([
    ['Cloud Core', 'Administrim'],
    ['Regjistra — Faza 2', 'Regjistra'],
    ['Blerje & Peshim — Faza 2', 'Blerje & Peshim'],
    ['Shitje & Magazinë — Faza 2', 'Shitje & Magazinë'],
    ['Gjurmueshmëri — Faza 3', 'Gjurmueshmëri'],
    ['Arka & Banka — Faza 3', 'Arka & Banka'],
  ]);

  document.querySelectorAll('.nav-group h4').forEach((element) => {
    const replacement = groupNames.get(element.textContent.trim());
    if (replacement) setTextIfChanged(element, replacement);
  });

  setTextIfChanged(document.querySelector('.hero-card .eyebrow'), 'SISTEMI GENIT CLOUD');
  setTextIfChanged(document.querySelector('.hero-card h2'), 'Mirë se vini në Sistemi Genit Cloud');

  const heroDescription = document.querySelector('.hero-card p:not(.eyebrow)');
  if (heroDescription) heroDescription.remove();

  document.querySelectorAll('.card .section-heading h3').forEach((heading) => {
    if (heading.textContent.trim() === 'Statusi i migrimit') heading.closest('.card')?.remove();
  });

  setTextIfChanged(document.querySelector('.sidebar-footer span'), 'Sistemi Genit Cloud');
  installGlobalExportButtons(document);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);

let scheduled = false;
const root = document.getElementById('root');
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    cleanProductionUi();
  });
});
observer.observe(root, { childList: true, subtree: true });
window.requestAnimationFrame(cleanProductionUi);
