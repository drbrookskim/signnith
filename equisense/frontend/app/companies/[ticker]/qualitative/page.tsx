import QualitativePage from './QualitativePage'

export async function generateStaticParams() {
  return [{ ticker: '_' }]
}

export default async function Page() {
  return <QualitativePage />
}
