import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
// Fonts and icons are served with the app (WEB-20): no request to Google, and icons do not
// turn into words when a network blocks third-party fonts.
// The site's font is chosen by the admin (src/utils/fonts.ts loads only that one). The default,
// IBM Plex Sans Arabic, is bundled here so the first screen never flashes another font.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './assets/icons/icons.css';
import './index.css';
import { installA11yEnhancer } from './utils/a11yEnhancer';
import { applyRememberedFont } from './utils/fonts';

installA11yEnhancer();
applyRememberedFont();

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
