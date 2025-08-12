import type { 
    AggregatedSnapshot,
    MonthData,
    DailyGrowthRate,
    NewBacktestResult
} from '../types/new-pipeline';


export class BacktestAnalyzer {
    private aggregatedDataByMonth: MonthData;
    private actualClosingValues: { [month: string]: { raw: number, weighted: number } };
    private allHistoricalMonths: string[] = [];
    private startMonth: string = '2025-04'; // Start backtesting from April 2025

    constructor(
        aggregatedDataByMonth: MonthData, 
        actualClosingValues: { [month: string]: { raw: number, weighted: number } }
    ) {
        this.aggregatedDataByMonth = aggregatedDataByMonth;
        this.actualClosingValues = actualClosingValues;
        this.categorizeMonths();
    }

    private categorizeMonths(): void {
        const today = new Date();
        this.allHistoricalMonths = Object.keys(this.aggregatedDataByMonth)
            .filter(monthKey => {
                const closingDate = new Date(Date.UTC(parseInt(monthKey.substring(0, 4)), parseInt(monthKey.substring(5, 7)), 0));
                return closingDate < today && this.actualClosingValues[monthKey] && this.actualClosingValues[monthKey].weighted > 0;
            })
            .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
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

        const smoothedRates: DailyGrowthRate[] = [];
        const windowRadius = 2;
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

    private getTrajectoryAtDaysBefore(monthData: AggregatedSnapshot[], targetDays: number, tolerance = 3): AggregatedSnapshot | null {
        if (!monthData || !monthData.length) return null;
    
        const closest = monthData.reduce((best, point) => 
          Math.abs(point.daysBeforeClose - targetDays) < Math.abs(best.daysBeforeClose - targetDays)
            ? point : best
        );
    
        return Math.abs(closest.daysBeforeClose - targetDays) <= tolerance ? closest : null;
    }

    public getBacktestResults(): NewBacktestResult[] {
        const results: NewBacktestResult[] = [];
        const testPoints = [60, 45, 30, 15, 7, 1];
        
        // Find the index where we start backtesting (April 2025 or later)
        const startIndex = this.allHistoricalMonths.findIndex(month => month >= this.startMonth);
        if (startIndex === -1 || startIndex < 3) {
            // Not enough data to start backtesting
            return [];
        }

        // For each month from April onwards, use the previous 3 months as training
        for (let i = startIndex; i < this.allHistoricalMonths.length; i++) {
            const testMonth = this.allHistoricalMonths[i];
            
            // Get the 3 months before this test month
            const trainingStartIndex = i - 3;
            const trainingMonths = this.allHistoricalMonths.slice(trainingStartIndex, i);
            
            // Skip if we don't have exactly 3 training months
            if (trainingMonths.length !== 3) continue;
            
            // Calculate growth rates based on these 3 training months
            const backtestGrowthRates = this.calculateGrowthRates(trainingMonths);
            
            // Get test month data
            const monthData = this.aggregatedDataByMonth[testMonth];
            const actual = this.actualClosingValues[testMonth]?.weighted;
            if (!actual) continue;

            // Make predictions at each test point
            testPoints.forEach(day => {
                const startPoint = this.getTrajectoryAtDaysBefore(monthData, day);

                if (startPoint) { 
                    let prediction = startPoint.weightedPipeline;
                    for (let d = startPoint.daysBeforeClose - 1; d >= 0; d--) {
                        const growthRate = backtestGrowthRates.find(r => r.daysBefore === d)?.rate ?? 0;
                        prediction *= (1 + growthRate);
                    }
                    results.push({ 
                        month: testMonth, 
                        daysBefore: startPoint.daysBeforeClose, 
                        prediction, 
                        actual,
                        // Optional: Include training months info for debugging
                        // trainingMonths: trainingMonths.join(', ')
                    });
                }
            });
        }
        
        return results;
    }

    // Optional: Method to get detailed results showing which months were used for training
    public getDetailedBacktestResults(): Array<{
        testMonth: string,
        trainingMonths: string[],
        results: NewBacktestResult[]
    }> {
        const detailedResults: Array<{
            testMonth: string,
            trainingMonths: string[],
            results: NewBacktestResult[]
        }> = [];
        
        const testPoints = [60, 45, 30, 15, 7, 1];
        const startIndex = this.allHistoricalMonths.findIndex(month => month >= this.startMonth);
        
        if (startIndex === -1 || startIndex < 3) {
            return [];
        }

        for (let i = startIndex; i < this.allHistoricalMonths.length; i++) {
            const testMonth = this.allHistoricalMonths[i];
            const trainingStartIndex = i - 3;
            const trainingMonths = this.allHistoricalMonths.slice(trainingStartIndex, i);
            
            if (trainingMonths.length !== 3) continue;
            
            const backtestGrowthRates = this.calculateGrowthRates(trainingMonths);
            const monthData = this.aggregatedDataByMonth[testMonth];
            const actual = this.actualClosingValues[testMonth]?.weighted;
            
            if (!actual) continue;

            const monthResults: NewBacktestResult[] = [];
            
            testPoints.forEach(day => {
                const startPoint = this.getTrajectoryAtDaysBefore(monthData, day);
                if (startPoint) { 
                    let prediction = startPoint.weightedPipeline;
                    for (let d = startPoint.daysBeforeClose - 1; d >= 0; d--) {
                        const growthRate = backtestGrowthRates.find(r => r.daysBefore === d)?.rate ?? 0;
                        prediction *= (1 + growthRate);
                    }
                    monthResults.push({ 
                        month: testMonth, 
                        daysBefore: startPoint.daysBeforeClose, 
                        prediction, 
                        actual 
                    });
                }
            });

            detailedResults.push({
                testMonth,
                trainingMonths,
                results: monthResults
            });
        }
        
        return detailedResults;
    }
}