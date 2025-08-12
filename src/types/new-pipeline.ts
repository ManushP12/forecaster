

export interface RawCSVRow {
    snapShotTime: string;
    date: string; // Closing month
    totalAmount: string;
    stage: string;
}

export interface ProcessedRow {
    snapshotDate: Date;
    closingMonth: Date;
    daysBeforeClose: number;
    amount: number;
    stage: string;
    weightedAmount: number;
}

export interface AggregatedSnapshot {
    snapshotDate: Date;
    daysBeforeClose: number;
    rawPipeline: number;
    weightedPipeline: number;
}

export interface MonthData {
    [month: string]: AggregatedSnapshot[];
}

export interface DailyGrowthRate {
    daysBefore: number;
    rate: number;
}

export interface NewTrajectoryPoint {
    snapshotDate: Date;
    daysBeforeClose: number;
    weightedAmount: number;
    rawAmount: number;
}

export interface NewMonthTrajectory {
    [month: string]: NewTrajectoryPoint[];
}

export interface SimilarityPoint {
    days_before: number;
    current_value: number;
    historical_value: number;
    pct_difference: number;
}
  
export interface NewTrajectoryComparison {
    historical_month: string;
    avg_pct_diff: number;
    variance: number;
    similarities: SimilarityPoint[];
    historical_closing: number;
}

export interface NewAnalysisResult {
    month: string;
    currentRawValue: number;
    currentWeightedValue: number;
    daysToClose: number;
    totalProjectedGrowth: number;
    forecast: number | null;
    trajectory: NewTrajectoryPoint[];
    forecastTrajectory: NewTrajectoryPoint[];
    similarMonths: NewTrajectoryComparison[];
}

export interface NewBacktestResult {
    month: string;
    daysBefore: number;
    prediction: number;
    actual: number;
}

export interface ForecastCalculation {
    month: string;
    startValue: number;
    endValue: number;
    daysToClose: number;
    dailyBreakdown: {
        date: string;
        daysBefore: number;
        startValue: number;
        growthRate: number;
        endValue: number;
    }[];
}

export interface NewAppendixData {
    smoothedGrowthRates: DailyGrowthRate[];
    medianGrowthRates: DailyGrowthRate[];
    forecastCalculations: ForecastCalculation[];
}

export interface NewPeakAnalysis {
    month: string;
    peakDate: Date;
    peakRawValue: number;
    peakWeightedValue: number;
    daysBeforeClosing: number;
    actualClosingRawValue: number;
    actualClosingWeightedValue: number;
    declinePercentageRaw: number;
    declinePercentageWeighted: number;
}
