// ──────────────────────────────────────────────
// Module 1: 펀더멘털
// ──────────────────────────────────────────────

export type Market = 'KR' | 'US'

export type TrendDirection = 'improving' | 'deteriorating' | 'stable'

export interface FundamentalMetrics {
  fiscal_year: number
  roe: number | null
  roa: number | null
  debt_ratio: number | null
  operating_margin: number | null
  fcf: number | null
  per: number | null
  pbr: number | null
  icr: number | null           // 이자보상배율 = 영업이익 / 이자비용
  peg_ratio: number | null     // PEG = PER / EPS성장률 (US만, KR null)
  week52_high: number | null   // 52주 고가 (최신 연도만, 나머지 null)
  week52_low: number | null    // 52주 저가 (최신 연도만, 나머지 null)
  current_price: number | null // 현재가 (최신 연도만, 나머지 null)
}

export interface MetricTrend {
  metric_name: string
  values: [number, number][]
  cagr: number | null
  direction: TrendDirection
  yoy_changes: [number, number | null][]
}

export interface CompanyProfile {
  name: string | null
  description: string | null
  ceo: string | null
  sector: string | null
  industry: string | null
  website: string | null
}

export interface FundamentalAnalysis {
  ticker: string
  name: string | null
  market: Market
  metrics_by_year: FundamentalMetrics[]
  trends: Record<string, MetricTrend>
  profile?: CompanyProfile | null
}

// ──────────────────────────────────────────────
// Module 2: 해자
// ──────────────────────────────────────────────

export type MoatDimension =
  | 'cost_advantage'
  | 'intangible_assets'
  | 'switching_costs'
  | 'network_effects'
  | 'efficient_scale'

export type MoatGrade = 'wide' | 'narrow' | 'none'

export type CompoundMoatType = 'lock_in_ring' | 'value_flywheel' | 'scale_fortress'

export interface CompoundMoat {
  type: CompoundMoatType
  name: string
  description: string
  dimensions: [MoatDimension, MoatDimension]
}

export interface DimensionScore {
  dimension: MoatDimension
  score: number
  rationale: string | null
}

export interface MoatAnalysis {
  ticker: string
  market: Market
  fiscal_year: number
  dimension_scores: DimensionScore[]
  compound_moats: CompoundMoat[]
  composite_score: number
  grade: MoatGrade
  analyst_note: string | null
  scored_at: string
}

// ──────────────────────────────────────────────
// Module 4: 기술적 분석
// ──────────────────────────────────────────────

export type TechnicalPeriod = '1m' | '3m' | '6m' | '1y' | '3y'

export interface TechnicalDataPoint {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  change_pct: number | null
}

export interface TechnicalSummary {
  start_price: number | null
  end_price: number | null
  period_return_pct: number | null
  high_period: number | null
  low_period: number | null
  avg_volume: number | null
}

export interface TechnicalAnalysis {
  ticker: string
  market: Market
  period: TechnicalPeriod
  data_points: TechnicalDataPoint[]
  summary: TechnicalSummary
}

// ──────────────────────────────────────────────
// Module 3: 정성적 분석
// ──────────────────────────────────────────────

export type DocType = 'annual_report' | 'earnings_call'
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface RiskFactor {
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

export interface GrowthDriver {
  title: string
  description: string
}

export interface NoiseFilterItem {
  claim: string
  is_substantiated: boolean
  evidence: string
}

export interface QualitativeResult {
  id: string
  job_id: string
  ticker: string
  fiscal_period: string
  integrity_score: number | null
  summary_ko: string | null
  risk_factors: RiskFactor[] | null
  growth_drivers: GrowthDriver[] | null
  noise_filter: NoiseFilterItem[] | null
  created_at: string
}

export interface AnalysisJob {
  job_id: string
  status: JobStatus
  result: QualitativeResult | null
  error: string | null
}

export interface DualQualitativeResult {
  annual: QualitativeResult
  earnings: QualitativeResult
}

export interface TriggerQualitativeRequest {
  market: Market
  fiscal_year: number
  doc_type: DocType
}

export interface TriggerQualitativeResponse {
  job_id: string
  status: 'PENDING'
  estimated_seconds: number
}

// ──────────────────────────────────────────────
// 분기별 인사이트
// ──────────────────────────────────────────────

export interface QuarterlyPoint {
  label: string       // "2024 Q3"
  value: number | null
}

export interface QuarterlyInsight {
  quarters: QuarterlyPoint[]    // 최대 3개, 오름차순
  trend_line: string            // "Q2 14.8% → Q3 16.1% → Q4 17.3%"
  momentum_label: string        // "↑ 3분기 연속 상승 · 모멘텀 가속"
  direction: 'up' | 'down' | 'mixed' | 'flat'
  insufficient?: boolean        // true = 유효 데이터 포인트 < 2 (연간 fallback 트리거)
}

export type QuarterlyInsightMap = Partial<Record<string, QuarterlyInsight>>

// ──────────────────────────────────────────────
// Module 6: 센티멘트 데이터
// ──────────────────────────────────────────────

export interface AnalystConsensus {
  strong_buy: number
  buy: number
  hold: number
  sell: number
  strong_sell: number
  total: number
  target_mean: number | null
  target_high: number | null
  target_low: number | null
  current_price: number | null
}

export interface EarningsSurprise {
  quarter: string           // e.g. "2024 Q3"
  eps_estimate: number | null
  eps_actual: number | null
  surprise_pct: number | null   // 5.24 = +5.24%
}

export type DisclosureImportance = 'high' | 'medium' | 'low'

export interface DartDisclosure {
  rcept_no: string
  report_nm: string
  rcept_dt: string        // "20241015"
  flr_nm: string
  importance: DisclosureImportance
}

export interface InsiderTransaction {
  name: string
  relation: string
  transaction: 'buy' | 'sell' | 'other'
  shares: number | null
  date: string
}

export interface InstitutionHolder {
  name: string
  pct_held: number | null   // 8.12 = 8.12%
  shares: number | null
  report_date: string
}

export interface RecTrendPoint {
  period: string          // "0m" | "-1m" | "-2m" | "-3m"
  strong_buy: number
  buy: number
  hold: number
  sell: number
  strong_sell: number
}

export interface UpgradeDowngrade {
  date: string
  firm: string
  to_grade: string
  from_grade: string
  action: 'up' | 'down' | 'main'
}

export interface ShortData {
  short_pct_of_float: number | null   // 0.023 = 2.3%
  short_ratio: number | null          // days to cover
  shares_short: number | null
}

export interface FiftyTwoWeek {
  low: number | null
  high: number | null
  current: number | null
  position_pct: number | null         // 0-100
}

export interface SentimentData {
  consensus: AnalystConsensus | null
  earnings_surprises: EarningsSurprise[]
  disclosures: DartDisclosure[]           // KR only
  insider_transactions: InsiderTransaction[]
  institution_holders: InstitutionHolder[]
  rec_trend: RecTrendPoint[]
  upgrade_downgrade: UpgradeDowngrade[]
  short_data: ShortData
  fifty_two_week: FiftyTwoWeek
}

// ──────────────────────────────────────────────
// 공통 에러
// ──────────────────────────────────────────────

export interface ApiError {
  code: string
  message: string
  request_id: string
}

export interface ApiErrorResponse {
  error: ApiError
}

// ──────────────────────────────────────────────
// Module 5: 스윙 판정
// ──────────────────────────────────────────────

export type GateStatus = 'GO' | 'WARN' | 'STOP'
export type GateVerdict = 'PASS' | 'BLOCK'
export type FinalVerdict = 'PASS' | 'CONDITIONAL' | 'BLOCK'
export type StockType = 'high_beta' | 'value' | 'small_cap'

export interface GateAData {
  vix: number | null
  kospi_price: number | null
  kospi_ma200: number | null
  usdkrw: number | null
  rate_bp: number
  pmi: number
  pmi_direction: 'up' | 'down'
}

export interface GateAResult {
  data: GateAData
  axes: Record<string, GateStatus>
  verdict: GateVerdict
}

export interface GateBInput {
  market_foreign_days: number
  market_institution: 'buy' | 'neutral' | 'sell'
  sector_etf_days: number
  stock_foreign_days: number
  stock_institution_weeks: number
  short_ratio: number
  short_trend: 'decrease' | 'stable' | 'increase'
}

export interface GateBResult {
  input: GateBInput
  layer1: GateStatus
  layer2: GateStatus
  layer3: GateStatus
  matrix: 'STRONG_BUY' | 'FIND_ALTERNATIVE' | 'HEADWIND_SHORT_ONLY' | 'NO_ENTRY'
  verdict: GateVerdict
}

export interface RRInput {
  entry: number
  stop: number
  target: number
}

export interface RRResult {
  rr: number
  loss_pct: number
  gain_pct: number
  breakeven_winrate: number
  verdict: 'PASS' | 'CAUTION' | 'BLOCK'
}

export interface TimeStopResult {
  entry_date: string
  deadline: string
  total_days: number
  elapsed: number
  remaining: number
  status: 'HOLDING' | 'PREPARE_EXIT' | 'TIME_STOP'
  action: string
}

export interface SwingFinalResult {
  verdict: FinalVerdict
  gate_a: GateVerdict
  gate_b: GateVerdict
  step1_pass: boolean
  rr: RRResult
  time_stop: TimeStopResult
  summary_line: string
}
