import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TooltipProvider } from '@/components/ui/tooltip';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><TooltipProvider delayDuration={500} skipDelayDuration={0}><App /></TooltipProvider></StrictMode>
);
