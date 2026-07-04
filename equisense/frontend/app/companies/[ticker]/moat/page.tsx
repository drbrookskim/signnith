import MoatPage from './MoatPage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <MoatPage />
}
