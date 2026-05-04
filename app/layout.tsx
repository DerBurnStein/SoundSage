import type { Metadata } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Noto_Serif_JP,
  Shippori_Mincho,
} from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Masthead } from '@/components/Masthead';
import { Providers } from './providers';
import '@/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
const notoJp = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-serif',
  display: 'swap',
});
const mincho = Shippori_Mincho({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mincho',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SoundSage',
  description: 'Your personal Spotify listening almanac.',
  icons: {
    // SVG favicon — vermilion seal with the kanji 聴 ("listen"). Same
    // character we use in the masthead hanko, so the tab icon visually
    // echoes the brand. SVG stays crisp at every size (16, 32, 192, 512)
    // without shipping raster fallbacks. Modern browsers all support
    // SVG favicons; iOS Safari falls back to no icon, which is fine.
    icon: { url: '/favicon.svg', type: 'image/svg+xml' },
    apple: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

// Viewport tag — Next.js 14's preferred export form. Without this, mobile
// browsers render the page at a synthetic 980px viewport and zoom out,
// which makes everything tiny instead of triggering responsive CSS.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#c1272d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `today` is only used as a display string in the masthead. Computing it
  // on the server keeps it stable for the request, and there's no auth call
  // here — every component below figures out its own auth needs. Keeping the
  // root layout free of dynamic data lets Next.js cache the shell and
  // navigations between pages don't tear down the masthead.
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} ${notoJp.variable} ${mincho.variable}`}
    >
      <body>
        <Providers>
          <ThemeProvider>
            <Masthead today={today} />
            <main>{children}</main>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
