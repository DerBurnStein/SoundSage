import type { Metadata } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Noto_Serif_JP,
  Shippori_Mincho,
} from 'next/font/google';
import { auth } from '@/lib/auth';
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
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

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
