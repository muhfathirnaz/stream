import type { Metadata } from 'next'
import Sidebar from '@/components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Command Center',
  description: 'Lofi Jazz Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">
            <div className="app-content">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
