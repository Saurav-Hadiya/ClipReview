import Link from 'next/link';
import './globals.css';

export const metadata = { title: 'VideoReview', description: 'Frame-accurate video review and approval' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">VideoReview</Link>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
