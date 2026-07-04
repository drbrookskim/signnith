import FundamentalsPage from './FundamentalsPage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <FundamentalsPage />
}
