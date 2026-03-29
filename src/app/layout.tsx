import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { WalletProvider } from '../providers/WalletProvider'
import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nusa Harvest — AgroFi Protocol',
  description: 'Parametric crop insurance and DeFi yield pools protecting Indonesian farmers',
  openGraph: {
    title: 'Nusa Harvest — AgroFi Protocol',
    description: 'Blockchain-powered parametric insurance for 38 million Indonesian farmers',
    type: 'website'
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <WalletProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#1a2332', color: '#e2e8f0', border: '1px solid #2d4a3e' },
              success: { iconTheme: { primary: '#4ade80', secondary: '#1a2332' } },
              error: { iconTheme: { primary: '#f87171', secondary: '#1a2332' } }
            }}
          />
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}
