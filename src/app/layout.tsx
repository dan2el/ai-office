import './globals.css';
import { AppPreferencesProvider } from '@/components/AppPreferencesProvider';
import { LocalWorldProvider } from '@/components/LocalWorldProvider';

export const metadata = {
  title: 'AI Office',
  description: 'A clean workspace for monitoring local AI agents.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta content="text/html; charset=UTF-8" name="Content-Type" />
        <meta content="AI Office" property="og:title" />
        <meta
          content="A clean workspace for monitoring local AI agents."
          property="og:description"
        />
        <meta content="https://ai-office.fly.dev/assets/thumbnail.jpg" property="og:image" />
        <meta content="AI Office" property="twitter:title" />
        <meta
          content="A clean workspace for monitoring local AI agents."
          property="twitter:description"
        />
        <meta content="https://ai-office.fly.dev/assets/thumbnail.jpg" property="twitter:image" />
        <meta property="og:type" content="website" />
        <meta content="summary_large_image" name="twitter:card" />
      </head>
      <body>
        <AppPreferencesProvider>
          <LocalWorldProvider>{children}</LocalWorldProvider>
        </AppPreferencesProvider>
      </body>
    </html>
  );
}
