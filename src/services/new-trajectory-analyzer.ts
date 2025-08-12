
import Papa from 'papaparse';
import type { 
    RawCSVRow, 
    ProcessedRow,
    AggregatedSnapshot,
    MonthData,
    DailyGrowthRate,
    NewAnalysisResult,
    NewAppendixData,
    ForecastCalculation,
    NewTrajectoryPoint,
    NewMonthTrajectory,
    NewTrajectoryComparison,
    SimilarityPoint,
    NewPeakAnalysis
} from '../types/new-pipeline';

const STAGE_WEIGHTS: { [key: string]: number } = {
  'FUNDED': 1.0,
  'READY_FOR_FUNDING': 0.95,
  'CONDITION_FULFILLMENT': 0.75,
  'APPROVED': 0.60,
};

export class NewPipelineTrajectoryAnalyzer {
    private allData: ProcessedRow[] = [];
    private aggregatedDataByMonth: MonthData = {};
    private allHistoricalMonths: string[] = [];
    private currentMonths: string[] = [];
    private actualClosingValues: { [month: string]: { raw: number, weighted: number } } = {};
    private forecastGrowthRates: DailyGrowthRate[] = [];
    private medianGrowthRates: DailyGrowthRate[] = [];
    private peakData: NewPeakAnalysis[] = [];

    async loadData(csvText: string): Promise<void> {
        const rawData = await this.parseCSV(csvText);
        this.processRawData(rawData);
        if (this.allData.length === 0) return;
        
        this.aggregateDataByMonth();
        this.calculateActualClosingValues();
        this.categorizeMonths();

        this.forecastGrowthRates = this.calculateGrowthRates(this.allHistoricalMonths);
        this.peakData = this.analyzePeakAndDecline();
    }

    public hasData(): boolean {
        return this.allData.length > 0;
    }

    private parseCSV(csvText: string): Promise<RawCSVRow[]> {
        return new Promise((resolve, reject) => {
            Papa.parse<RawCSVRow>(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => resolve(results.data),
                error: (error: any) => reject(error),
            });
        });
    }

    private processRawData(rawData: RawCSVRow[]): void {
        this.allData = rawData.map(row => {
            try {
                if (!row.snapShotTime || !row.date || !row.totalAmount || !row.stage) {
                    return null;
                }
    
                const snapshotDate = new Date(row.snapShotTime.trim());
                if (isNaN(snapshotDate.getTime())) return null;

                const dateStr = row.date.trim();
                const dateParts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
                const closingMonthDate = dateParts.length === 3 
                    ? new Date(Date.UTC(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1])))
                    : new Date(dateStr);

                 if (isNaN(closingMonthDate.getTime())) return null;

                const closingYear = closingMonthDate.getUTCFullYear();
                if (closingYear !== 2025) return null;
    
                const lastDayOfMonth = new Date(Date.UTC(closingYear, closingMonthDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
                const daysBeforeClose = Math.ceil((lastDayOfMonth.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysBeforeClose > 89 || daysBeforeClose < -5) return null;
    
                const amount = parseFloat(row.totalAmount.replace(/[,\$]/g, ''));
                if (isNaN(amount)) return null;
    
                const stage = row.stage.trim();
                const weight = STAGE_WEIGHTS[stage] ?? 0;
    
                return {
                    snapshotDate,
                    closingMonth: closingMonthDate,
                    daysBeforeClose,
                    amount,
                    stage,
                    weightedAmount: amount * weight
                };
            } catch (e) {
                return null;
            }
        }).filter((row): row is ProcessedRow => row !== null);
    }
    
    private aggregateDataByMonth(): void {
        const dataBySnapshotAndMonth: { [key: string]: { raw: number, weighted: number } } = {};

        this.allData.forEach(row => {
            const snapshotKey = row.snapshotDate.toISOString();
            const monthKey = row.closingMonth.toISOString().substring(0, 7);
            const key = `${snapshotKey}|${monthKey}`;
            
            if (!dataBySnapshotAndMonth[key]) {
                dataBySnapshotAndMonth[key] = { raw: 0, weighted: 0 };
            }
            dataBySnapshotAndMonth[key].raw += row.amount;
            dataBySnapshotAndMonth[key].weighted += row.weightedAmount;
        });
        
        const dailyAggregates: { [key: string]: { raw: number, weighted: number, snapshotDate: Date, closingMonth: Date } } = {};

        Object.entries(dataBySnapshotAndMonth).forEach(([key, values]) => {
            const [snapshotTimestamp, monthKey] = key.split('|');
            const snapshotDate = new Date(snapshotTimestamp);
            const snapshotDayKey = snapshotDate.toISOString().split('T')[0];
            const dailyKey = `${snapshotDayKey}|${monthKey}`;
            
            if (!dailyAggregates[dailyKey] || snapshotDate.getTime() > dailyAggregates[dailyKey].snapshotDate.getTime()) {
                dailyAggregates[dailyKey] = {
                    ...values,
                    snapshotDate: snapshotDate,
                    closingMonth: new Date(monthKey + '-01T00:00:00.000Z')
                };
            }
        });

        Object.values(dailyAggregates).forEach(aggregate => {
            const monthKey = aggregate.closingMonth.toISOString().substring(0, 7);
            const lastDayOfMonth = new Date(Date.UTC(aggregate.closingMonth.getUTCFullYear(), aggregate.closingMonth.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            const daysBeforeClose = Math.ceil((lastDayOfMonth.getTime() - aggregate.snapshotDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (!this.aggregatedDataByMonth[monthKey]) {
                this.aggregatedDataByMonth[monthKey] = [];
            }

            this.aggregatedDataByMonth[monthKey].push({
                snapshotDate: aggregate.snapshotDate,
                daysBeforeClose,
                rawPipeline: aggregate.raw,
                weightedPipeline: aggregate.weighted
            });
        });
        
        for (const month in this.aggregatedDataByMonth) {
            this.aggregatedDataByMonth[month].sort((a, b) => b.daysBeforeClose - a.daysBeforeClose);
        }
    }

    private categorizeMonths(): void {
        const today = new Date();
        const allMonths = Object.keys(this.aggregatedDataByMonth).sort();
    
        this.allHistoricalMonths = allMonths.filter(monthKey => {
            const closingDate = new Date(Date.UTC(parseInt(monthKey.substring(0, 4)), parseInt(monthKey.substring(5, 7)), 0));
            return closingDate < today && this.actualClosingValues[monthKey] && this.actualClosingValues[monthKey].weighted > 0;
        });
    
        this.currentMonths = allMonths.filter(monthKey => !this.allHistoricalMonths.includes(monthKey));
        this.currentMonths.sort((a,b) => new Date(a).getTime() - new Date(b).getTime());
    }
    
    private calculateGrowthRates(months: string[]): DailyGrowthRate[] {
        const dailyRates: { [day: number]: number[] } = {};
        
        months.forEach(monthKey => {
            const monthData = this.aggregatedDataByMonth[monthKey];
            if (!monthData) return;

            for (let i = 0; i < monthData.length - 1; i++) {
                const previous = monthData[i];
                const current = monthData[i + 1];
                
                const daysDiff = previous.daysBeforeClose - current.daysBeforeClose;
                
                if (daysDiff > 0 && daysDiff <= 3) { 
                    if (previous.weightedPipeline > 0) {
                        const growth = Math.pow(current.weightedPipeline / previous.weightedPipeline, 1 / daysDiff) - 1;
                        if (growth > -0.5 && growth < 0.5) {
                            for (let d = 0; d < daysDiff; d++) {
                                const day = current.daysBeforeClose + d;
                                if(day >=0 && day <= 89) {
                                    if (!dailyRates[day]) dailyRates[day] = [];
                                    dailyRates[day].push(growth);
                                }
                            }
                        }
                    }
                }
            }
        });
        
        const medianRates: DailyGrowthRate[] = [];
        for (let day = 0; day <= 89; day++) {
            if (dailyRates[day] && dailyRates[day].length > 0) {
                const sortedRates = [...dailyRates[day]].sort((a, b) => a - b);
                const mid = Math.floor(sortedRates.length / 2);
                const median = sortedRates.length % 2 !== 0 ? sortedRates[mid] : (sortedRates[mid - 1] + sortedRates[mid]) / 2;
                medianRates.push({ daysBefore: day, rate: median });
            } else {
                 medianRates.push({ daysBefore: day, rate: 0 }); 
            }
        }
        medianRates.sort((a, b) => a.daysBefore - b.daysBefore);
        this.medianGrowthRates = medianRates;

        const smoothedRates: DailyGrowthRate[] = [];
        const windowRadius = 2; // This means a 5-day window (day-2, day-1, day, day+1, day+2)
        for (let i = 0; i < medianRates.length; i++) {
            const start = Math.max(0, i - windowRadius);
            const end = Math.min(medianRates.length - 1, i + windowRadius);
            let sum = 0;
            for (let j = start; j <= end; j++) {
                sum += medianRates[j].rate;
            }
            smoothedRates.push({ daysBefore: medianRates[i].daysBefore, rate: sum / (end - start + 1) });
        }
        return smoothedRates;
    }
    
    private calculateActualClosingValues(): void {
        const allPossibleMonths = Object.keys(this.aggregatedDataByMonth);
    
        allPossibleMonths.forEach(monthKey => {
            const monthData = this.aggregatedDataByMonth[monthKey];
            if (monthData && monthData.length > 0) {
                const closingValuePoint = monthData.reduce((closest, point) => 
                    Math.abs(point.daysBeforeClose) < Math.abs(closest.daysBeforeClose) 
                    ? point : closest
                );

                if (closingValuePoint && Math.abs(closingValuePoint.daysBeforeClose) <= 5) {
                    this.actualClosingValues[monthKey] = {
                        raw: closingValuePoint.rawPipeline,
                        weighted: closingValuePoint.weightedPipeline
                    };
                }
            }
        });
    }

    public getForecast(): NewAnalysisResult[] {
        return this.currentMonths.map(monthKey => {
            const monthData = this.aggregatedDataByMonth[monthKey];
            if (!monthData || monthData.length === 0) return { month: monthKey, currentRawValue: 0, currentWeightedValue: 0, daysToClose: 0, totalProjectedGrowth: 0, forecast: null, trajectory: [], forecastTrajectory: [], similarMonths: [] };
            
            const latestSnapshot = monthData.reduce((latest, current) => current.snapshotDate > latest.snapshotDate ? current : latest);
            const daysToClose = latestSnapshot.daysBeforeClose;
            const trajectory = monthData.map(d => ({ snapshotDate: d.snapshotDate, daysBeforeClose: d.daysBeforeClose, weightedAmount: d.weightedPipeline, rawAmount: d.rawPipeline }));

            if (daysToClose > 89) {
                return { month: monthKey, currentRawValue: latestSnapshot.rawPipeline, currentWeightedValue: latestSnapshot.weightedPipeline, daysToClose, totalProjectedGrowth: 0, forecast: null, trajectory, forecastTrajectory: [], similarMonths: [] };
            }

            const forecastTrajectory: NewTrajectoryPoint[] = [];
            let currentValue = latestSnapshot.weightedPipeline;
            let currentDate = latestSnapshot.snapshotDate;

            for (let d = daysToClose - 1; d >= 0; d--) {
                const growthRate = this.forecastGrowthRates.find(r => r.daysBefore === d)?.rate ?? 0;
                currentValue *= (1 + growthRate);
                currentDate = new Date(currentDate.getTime() + (1000 * 60 * 60 * 24));
                forecastTrajectory.push({ snapshotDate: currentDate, daysBeforeClose: d, weightedAmount: currentValue, rawAmount: 0 });
            }
            
            const finalForecast = currentValue;
            const totalProjectedGrowth = (finalForecast / latestSnapshot.weightedPipeline) - 1;
            const similarMonths = this.findSimilarHistoricalMonths(monthKey, finalForecast);

            return {
                month: monthKey,
                currentRawValue: latestSnapshot.rawPipeline,
                currentWeightedValue: latestSnapshot.weightedPipeline,
                daysToClose,
                totalProjectedGrowth,
                forecast: finalForecast,
                trajectory,
                forecastTrajectory,
                similarMonths
            };
        });
    }

    private getTrajectoryAtDaysBefore(monthData: AggregatedSnapshot[], targetDays: number, tolerance = 3): AggregatedSnapshot | null {
        if (!monthData || !monthData.length) return null;
    
        const closest = monthData.reduce((best, point) => 
          Math.abs(point.daysBeforeClose - targetDays) < Math.abs(best.daysBeforeClose - targetDays)
            ? point : best
        );
    
        return Math.abs(closest.daysBeforeClose - targetDays) <= tolerance ? closest : null;
      }
    
    private calculateTrajectorySimilarity(currentTrajectory: AggregatedSnapshot[], historicalTrajectory: AggregatedSnapshot[], comparisonDays: number[]): SimilarityPoint[] {
        const similarities: SimilarityPoint[] = [];
    
        for (const daysBefore of comparisonDays) {
          const currentPoint = this.getTrajectoryAtDaysBefore(currentTrajectory, daysBefore);
          const historicalPoint = this.getTrajectoryAtDaysBefore(historicalTrajectory, daysBefore);
    
          if (currentPoint && historicalPoint) {
            const currentValue = currentPoint.weightedPipeline;
            const historicalValue = historicalPoint.weightedPipeline;
            if (historicalValue === 0) continue;
    
            const pctDiff = ((currentValue - historicalValue) / historicalValue) * 100;
            
            similarities.push({
              days_before: daysBefore,
              current_value: currentValue,
              historical_value: historicalValue,
              pct_difference: pctDiff
            });
          }
        }
    
        return similarities;
    }

    private findSimilarHistoricalMonths(currentMonth: string, forecastValue: number): NewTrajectoryComparison[] {
        const currentTrajectory = this.aggregatedDataByMonth[currentMonth];
        if (!currentTrajectory?.length) return [];
        
        const comparisonDays = [85, 75, 60, 45, 30, 15];
        const historicalMonthsForComparison = this.allHistoricalMonths.filter(month => new Date(month) >= new Date('2025-01-01T00:00:00.000Z'));
        const comparisons: (NewTrajectoryComparison & { score: number })[] = [];
    
        for (const historicalMonth of historicalMonthsForComparison) {
            const historicalTrajectory = this.aggregatedDataByMonth[historicalMonth];
            if (!historicalTrajectory?.length) continue;
    
            const similarities = this.calculateTrajectorySimilarity(
                currentTrajectory, 
                historicalTrajectory, 
                comparisonDays
            );
    
            if (similarities.length > 0) {
                const avgPctDiff = similarities.reduce((sum, s) => sum + s.pct_difference, 0) / similarities.length;
                const variance = Math.sqrt(
                    similarities.reduce((sum, s) => sum + Math.pow(s.pct_difference - avgPctDiff, 2), 0) / similarities.length
                );
    
                const trajectoryScore = Math.abs(avgPctDiff) + variance;
    
                const historicalClosing = this.actualClosingValues[historicalMonth]?.weighted ?? 0;
                const forecastDiff = forecastValue > 0 ? Math.abs(historicalClosing - forecastValue) / forecastValue : 1;
                
                const score = (trajectoryScore * 0.7) + (forecastDiff * 0.3);
    
                comparisons.push({
                    historical_month: historicalMonth,
                    avg_pct_diff: avgPctDiff,
                    variance,
                    similarities,
                    historical_closing: historicalClosing,
                    score: score
                });
            }
        }
        
        comparisons.sort((a, b) => a.score - b.score);
        
        return comparisons.slice(0, 3);
    }
    
    public analyzePeakAndDecline(): NewPeakAnalysis[] {
        const results: NewPeakAnalysis[] = [];
    
        this.allHistoricalMonths.forEach(monthKey => {
            const closingMonthDate = new Date(monthKey + '-01T00:00:00.000Z');
            
            // Define search window: current month + previous month
            const windowEndDate = new Date(Date.UTC(closingMonthDate.getUTCFullYear(), closingMonthDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            const windowStartDate = new Date(Date.UTC(closingMonthDate.getUTCFullYear(), closingMonthDate.getUTCMonth() - 1, 1));

            // 1. Get all unique snapshot dates within the two-month window
            const uniqueSnapshotsInWindow = new Set<string>();
            this.allData.forEach(row => {
                if (row.snapshotDate >= windowStartDate && row.snapshotDate <= windowEndDate) {
                    uniqueSnapshotsInWindow.add(row.snapshotDate.toISOString());
                }
            });

            if (uniqueSnapshotsInWindow.size === 0) return;

            let peakSnapshot = { date: new Date(0), raw: 0, weighted: 0 };
    
            // 2. For each snapshot, sum the values for the target closing month
            uniqueSnapshotsInWindow.forEach(snapshotISO => {
                const snapshotDate = new Date(snapshotISO);
                const dealsForThisSnapshot = this.allData.filter(d => 
                    d.snapshotDate.toISOString() === snapshotISO && 
                    d.closingMonth.toISOString().substring(0, 7) === monthKey
                );
                
                const totalRaw = dealsForThisSnapshot.reduce((sum, d) => sum + d.amount, 0);
                const totalWeighted = dealsForThisSnapshot.reduce((sum, d) => sum + d.weightedAmount, 0);

                if (totalRaw > peakSnapshot.raw) {
                    peakSnapshot = { date: snapshotDate, raw: totalRaw, weighted: totalWeighted };
                }
            });

            const actuals = this.actualClosingValues[monthKey];
            if (!actuals || peakSnapshot.raw === 0) return;
    
            const lastDayOfMonth = new Date(Date.UTC(closingMonthDate.getUTCFullYear(), closingMonthDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            const daysBeforeClosing = Math.ceil((lastDayOfMonth.getTime() - peakSnapshot.date.getTime()) / (1000 * 60 * 60 * 24));
    
            results.push({
                month: monthKey,
                peakDate: peakSnapshot.date,
                peakRawValue: peakSnapshot.raw,
                peakWeightedValue: peakSnapshot.weighted,
                daysBeforeClosing,
                actualClosingRawValue: actuals.raw,
                actualClosingWeightedValue: actuals.weighted,
                declinePercentageRaw: ((peakSnapshot.raw - actuals.raw) / peakSnapshot.raw) * 100,
                declinePercentageWeighted: ((peakSnapshot.weighted - actuals.weighted) / peakSnapshot.weighted) * 100,
            });
        });
        
        results.sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
        return results;
    }
    
    public getAppendixData(): NewAppendixData {
        const forecastCalculations: ForecastCalculation[] = this.getForecast().map(forecastResult => {
             if (!forecastResult.forecast) return null;

             const dailyBreakdown: ForecastCalculation['dailyBreakdown'] = [];
             let currentValue = forecastResult.currentWeightedValue;
             let currentDate = forecastResult.trajectory[0]?.snapshotDate ?? new Date(); 

             for (let d = forecastResult.daysToClose - 1; d >= 0; d--) {
                 const growthRate = this.forecastGrowthRates.find(r => r.daysBefore === d)?.rate ?? 0;
                 const startValue = currentValue;
                 const endValue = startValue * (1 + growthRate);
                 currentDate = new Date(currentDate.getTime() + (1000 * 60 * 60 * 24));
                 
                 dailyBreakdown.push({
                     date: currentDate.toISOString().split('T')[0],
                     daysBefore: d,
                     startValue,
                     growthRate,
                     endValue
                 });
                 currentValue = endValue;
             }
             
             return {
                 month: forecastResult.month,
                 startValue: forecastResult.currentWeightedValue,
                 endValue: forecastResult.forecast,
                 daysToClose: forecastResult.daysToClose,
                 dailyBreakdown: dailyBreakdown.reverse()
             };
        }).filter((f): f is ForecastCalculation => f !== null);
        
        return {
            smoothedGrowthRates: this.forecastGrowthRates,
            medianGrowthRates: this.medianGrowthRates,
            forecastCalculations: forecastCalculations.filter(f => f.dailyBreakdown.length > 0)
        };
    }

    public getHistoricalData(): NewMonthTrajectory {
        const historicalTrajectory: NewMonthTrajectory = {};
        this.allHistoricalMonths.forEach(monthKey => {
            if (this.aggregatedDataByMonth[monthKey]) {
                historicalTrajectory[monthKey] = this.aggregatedDataByMonth[monthKey].map(d => ({
                    snapshotDate: d.snapshotDate,
                    daysBeforeClose: d.daysBeforeClose,
                    weightedAmount: d.weightedPipeline,
                    rawAmount: d.rawPipeline
                }));
            }
        });
        return historicalTrajectory;
    }

    public getPeakDeclineData(): NewPeakAnalysis[] {
        return this.peakData;
    }

    public generateGoalSeekTrajectory(
        originalTrajectory: NewTrajectoryPoint[],
        goalValue: number
    ): NewTrajectoryPoint[] {
        if (!originalTrajectory || originalTrajectory.length === 0) return [];
    
        const latestPoint = originalTrajectory.reduce((latest, p) => p.snapshotDate > latest.snapshotDate ? p : latest);
        const startingValue = latestPoint.weightedAmount;
        const daysToClose = latestPoint.daysBeforeClose;
    
        if (startingValue <= 0 || daysToClose <= 0) return originalTrajectory;
    
        const baseForecast = this.forecastGrowthRates
            .filter(r => r.daysBefore < daysToClose)
            .reduce((acc, r) => acc * (1 + r.rate), startingValue);
    
        if (baseForecast <= 0) return originalTrajectory;
    
        const requiredTotalGrowth = goalValue / baseForecast;
        const requiredDailyLift = Math.pow(requiredTotalGrowth, 1 / daysToClose) - 1;
    
        const projectedTrajectory: NewTrajectoryPoint[] = [latestPoint];
        let currentValue = startingValue;
        let currentDate = latestPoint.snapshotDate;
    
        for (let d = daysToClose - 1; d >= 0; d--) {
            const baseRate = this.forecastGrowthRates.find(r => r.daysBefore === d)?.rate ?? 0;
            const adjustedRate = baseRate + requiredDailyLift;
            currentValue *= (1 + adjustedRate);
            currentDate = new Date(currentDate.getTime() + (1000 * 60 * 60 * 24));
            projectedTrajectory.push({ snapshotDate: currentDate, daysBeforeClose: d, weightedAmount: currentValue, rawAmount: 0 });
        }
        
        return [...originalTrajectory, ...projectedTrajectory.filter(p => p.daysBeforeClose < latestPoint.daysBeforeClose)];
    }

    public findSimilarHistoricalMonthsForGoalSeek(goalValue: number, peakValue: number, daysAtPeak: number): NewTrajectoryComparison[] {
        const historicalMonthsForComparison = this.allHistoricalMonths.filter(month => new Date(month) >= new Date('2025-01-01T00:00:00.000Z'));
        const comparisonsWithScores: (NewTrajectoryComparison & { score: number })[] = [];
    
        for (const historicalMonth of historicalMonthsForComparison) {
            const peakData = this.peakData.find(p => p.month === historicalMonth);
            if (!peakData || !peakData.actualClosingWeightedValue) continue;
            
            const histClosing = peakData.actualClosingWeightedValue;
            if (!histClosing) continue;
    
            const closingDiff = Math.abs((histClosing - goalValue) / goalValue);
            const peakDiff = Math.abs((peakData.peakWeightedValue - peakValue) / peakValue);
            const timingDiff = Math.abs((peakData.daysBeforeClosing - daysAtPeak) / daysAtPeak);
    
            const closingWeight = 0.6;
            const peakWeight = 0.3;
            const timingWeight = 0.1;
    
            const score = (closingDiff * closingWeight) + (peakDiff * peakWeight) + (timingDiff * timingWeight);
    
            comparisonsWithScores.push({
                historical_month: historicalMonth,
                avg_pct_diff: 0, 
                variance: 0,
                similarities: [],
                historical_closing: histClosing,
                score: score,
            });
        }
    
        comparisonsWithScores.sort((a, b) => a.score - b.score);
    
        return comparisonsWithScores.slice(0, 2); 
    }

    // Public getters for the backtest analyzer
    public getAggregatedDataByMonth(): MonthData {
        return this.aggregatedDataByMonth;
    }

    public getActualClosingValues(): { [month: string]: { raw: number, weighted: number } } {
        return this.actualClosingValues;
    }
}
