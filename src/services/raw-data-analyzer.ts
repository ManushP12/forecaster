
import Papa from 'papaparse';
import type { RawCSVRow } from '../types/new-pipeline';

interface ProcessedRow {
    snapshotDate: Date;
    closingMonthDate: Date;
    amount: number;
    stage: string;
}

interface ValueByDate {
    date: string; // YYYY-MM-DD format
    totalValue: number;
}

interface ValueByStage {
    stage: string;
    totalValue: number;
}

interface ValueByMonth {
    closingMonth: string; // YYYY-MM format
    totalValue: number;
}

export interface MonthlyAnalysis {
    month: string; // YYYY-MM
    history: ValueByDate[];
    stageBreakdown: ValueByStage[];
    totalValue: number;
    dataPoints: number;
}

export interface RawDataSummary {
    latestSnapshot: {
        date: string; // YYYY-MM-DD
        totalValue: number;
        dataPoints: number;
    };
    pipelineHistory: ValueByDate[];
    overallStageBreakdown: ValueByStage[];
    upcomingMonthTotals: ValueByMonth[];
    historicalMonths: MonthlyAnalysis[];
    upcomingMonths: MonthlyAnalysis[];
}

export class RawDataAnalyzer {
    private allData: ProcessedRow[] = [];

    async loadData(csvText: string): Promise<void> {
        const rawData = await this.parseCSV(csvText);
        this.processRawData(rawData);
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
                    ? new Date(Date.UTC(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, 1))
                    : new Date(dateStr);
                
                if (isNaN(closingMonthDate.getTime())) return null;
                
                const amount = parseFloat(row.totalAmount.replace(/[,\$]/g, ''));
                if (isNaN(amount)) return null;
    
                const stage = row.stage.trim();
    
                return { snapshotDate, closingMonthDate, amount, stage };
            } catch (e) {
                return null;
            }
        }).filter((row): row is ProcessedRow => row !== null);
    }

    public getAnalysisSummary(): RawDataSummary | null {
        if (this.allData.length === 0) return null;

        // --- Overall Snapshot Analysis ---
        const historyMap = new Map<string, number>();
        this.allData.forEach(row => {
            const dateKey = row.snapshotDate.toISOString().split('T')[0];
            historyMap.set(dateKey, (historyMap.get(dateKey) || 0) + row.amount);
        });
        const pipelineHistory: ValueByDate[] = Array.from(historyMap.entries())
            .map(([date, totalValue]) => ({ date, totalValue }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (pipelineHistory.length === 0) return null;

        const latestSnapshotDateStr = pipelineHistory[pipelineHistory.length - 1].date;
        const latestSnapshotData = this.allData.filter(d => d.snapshotDate.toISOString().startsWith(latestSnapshotDateStr));
        
        const overallStageMap = new Map<string, number>();
        latestSnapshotData.forEach(row => {
            overallStageMap.set(row.stage, (overallStageMap.get(row.stage) || 0) + row.amount);
        });
        const overallStageBreakdown: ValueByStage[] = Array.from(overallStageMap.entries())
            .map(([stage, totalValue]) => ({ stage, totalValue }))
            .sort((a, b) => b.totalValue - a.totalValue);

        const upcomingMonthMap = new Map<string, number>();
        latestSnapshotData.forEach(row => {
            const monthKey = row.closingMonthDate.toISOString().substring(0, 7);
            upcomingMonthMap.set(monthKey, (upcomingMonthMap.get(monthKey) || 0) + row.amount);
        });
        const upcomingMonthTotals: ValueByMonth[] = Array.from(upcomingMonthMap.entries())
            .map(([closingMonth, totalValue]) => ({ closingMonth, totalValue }))
            .sort((a, b) => a.closingMonth.localeCompare(b.closingMonth));

        // --- Monthly Deep-Dive Analysis ---
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const allClosingMonths = Array.from(new Set(this.allData.map(d => d.closingMonthDate.toISOString().substring(0, 7)))).sort();
        
        const historicalMonthKeys: string[] = [];
        const upcomingMonthKeys: string[] = [];
        
        allClosingMonths.forEach(monthKey => {
            const closingDate = new Date(monthKey + '-01T12:00:00Z');
            const lastDayOfClosingMonth = new Date(Date.UTC(closingDate.getUTCFullYear(), closingDate.getUTCMonth() + 1, 0));
            if (lastDayOfClosingMonth < today) {
                historicalMonthKeys.push(monthKey);
            } else {
                upcomingMonthKeys.push(monthKey);
            }
        });

        const recentHistoricalKeys = historicalMonthKeys.slice(-3);
        
        const analyzeMonth = (monthKey: string): MonthlyAnalysis => {
            const monthData = this.allData.filter(d => d.closingMonthDate.toISOString().substring(0, 7) === monthKey);
            
            const monthHistoryMap = new Map<string, number>();
            monthData.forEach(row => {
                const dateKey = row.snapshotDate.toISOString().split('T')[0];
                monthHistoryMap.set(dateKey, (monthHistoryMap.get(dateKey) || 0) + row.amount);
            });
            const history = Array.from(monthHistoryMap.entries())
                .map(([date, totalValue]) => ({ date, totalValue }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const latestMonthSnapshotDateStr = history.length > 0 ? history[history.length - 1].date : '';
            const latestMonthData = monthData.filter(d => d.snapshotDate.toISOString().startsWith(latestMonthSnapshotDateStr));

            const stageMap = new Map<string, number>();
            latestMonthData.forEach(row => {
                stageMap.set(row.stage, (stageMap.get(row.stage) || 0) + row.amount);
            });
            const stageBreakdown = Array.from(stageMap.entries())
                .map(([stage, totalValue]) => ({ stage, totalValue }))
                .sort((a, b) => b.totalValue - a.totalValue);

            return {
                month: monthKey,
                history,
                stageBreakdown,
                totalValue: history.length > 0 ? history[history.length - 1].totalValue : 0,
                dataPoints: latestMonthData.length,
            };
        };

        const historicalMonths = recentHistoricalKeys.map(analyzeMonth);
        const upcomingMonths = upcomingMonthKeys.map(analyzeMonth);

        return {
            latestSnapshot: {
                date: latestSnapshotDateStr,
                totalValue: pipelineHistory[pipelineHistory.length - 1].totalValue,
                dataPoints: latestSnapshotData.length,
            },
            pipelineHistory,
            overallStageBreakdown,
            upcomingMonthTotals,
            historicalMonths,
            upcomingMonths,
        };
    }
}
