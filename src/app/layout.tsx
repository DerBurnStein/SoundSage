import '../globals.css';
import { ThemeProvider } from '../components/ThemeProvider';
import { Masthead } from '../components/Masthead';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <Masthead today={today} />
          <main style={{ padding: 24 }}>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
