import './globals.css'

export const metadata = {
  title: 'OperWiki AI',
  description: 'AI-Powered IT Operations Knowledge Platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
