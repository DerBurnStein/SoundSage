// SoundSage — ThemeProvider
// Sets data-theme and data-tab on <html> based on:
//   - user prefs (theme: paper | midnight, density)
//   - current route (tab subtheme)
//
// Mount once inside app/layout.tsx.
// Reads prefs from the session via a server action, OR from localStorage as fallback.

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { TabId, ThemeId, DensityId } from '../types';

const TAB_FROM_PATH: Record<string, TabId> = {
  '/':          'overview',
  '/history':   'history',
  '/patterns':  'patterns',
  '/tracks':    'tracks',
  '/artists':   'artists',
};

interface ThemeProviderProps {
  theme?:   ThemeId;
  density?: DensityId;
  children: React.ReactNode;
}

export function ThemeProvider({
  theme   = 'paper',
  density = 'regular',
  children,
}: ThemeProviderProps) {
  const pathname = usePathname();
  const tab      = TAB_FROM_PATH[pathname] ?? 'overview';

  useEffect(() => {
    const root = document.documentElement;
    // Suppress CSS transitions for one frame while we apply the theme/tab
    // datasets on first mount. Otherwise every page nav animates the whole
    // palette swap, which reads as a flash. After the next paint we let
    // transitions resume.
    root.classList.add('no-transitions');
    root.dataset.theme   = theme;
    root.dataset.density = density;
    root.dataset.tab     = tab;
    requestAnimationFrame(() => {
      root.classList.remove('no-transitions');
    });
  }, [theme, density, tab]);

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────
// Usage in app/layout.tsx:
//
//   import { ThemeProvider } from '@/components/ThemeProvider';
//   import { auth } from '@/lib/auth';
//
//   export default async function RootLayout({ children }) {
//     const session = await auth();
//     const prefs   = session?.user?.prefs ?? {};
//     return (
//       <html lang="en">
//         <body>
//           <ThemeProvider theme={prefs.theme} density={prefs.density}>
//             {children}
//           </ThemeProvider>
//         </body>
//       </html>
//     );
//   }
// ─────────────────────────────────────────────────────
