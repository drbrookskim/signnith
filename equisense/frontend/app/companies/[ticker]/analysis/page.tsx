import AnalysisPage from './AnalysisPage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <AnalysisPage />
}
