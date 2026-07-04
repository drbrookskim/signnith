import SwingPage from './SwingPage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <SwingPage />
}
