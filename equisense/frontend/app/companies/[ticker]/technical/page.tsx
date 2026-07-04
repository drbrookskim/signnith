import TechnicalPage from './TechnicalPage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <TechnicalPage />
}
