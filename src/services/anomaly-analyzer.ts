
import Papa from 'papaparse';
import type { RawCSVRow, ProcessedRow } from '../types/new-pipeline';

const STAGE_WEIGHTS: { [key: string]: number } = {
  'FUNDED': 1.0,
  'READY_FOR_FUNDING': 0.95,
  'CONDITION_FULFILLMENT': 0.75,
  'APPROVED': 0.60,
};

export interface AnomalyData {
    closingMonth: string;
    analysisPeriod: {
        startDate: string;
        endDate: string;
    };
    dailySnapshots: {
        date: string;
        stage: string;
        totalAmount: number;
    }[];
}

export class AnomalyAnalyzer {
    private allData: ProcessedRow[] = [];
    private currentMonths: string[] = [];

    async loadData(csvText: string): Promise<void> {
        const rawData = await this.parseCSV(csvText);
        this.processRawData(rawData);
        if (this.allData.length === 0) return;
        
        this.categorizeMonths();
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
    
    private categorizeMonths(): void {
        const today = new Date();
        const monthKeys = new Set(this.allData.map(row => row.closingMonth.toISOString().substring(0, 7)));
        const allMonths = Array.from(monthKeys).sort();
    
        this.currentMonths = allMonths.filter(monthKey => {
            const closingDate = new Date(monthKey + '-01T12:00:00.000Z');
            const lastDayOfClosingMonth = new Date(Date.UTC(closingDate.getUTCFullYear(), closingDate.getUTCMonth() + 1, 0));
            return lastDayOfClosingMonth >= today;
        });
        this.currentMonths.sort((a,b) => new Date(a).getTime() - new Date(b).getTime());
    }

    public getAnalysisData(): AnomalyData[] {
        return this.currentMonths.map(monthKey => {
            const monthData = this.allData.filter(row => row.closingMonth.toISOString().substring(0, 7) === monthKey);
            
            // Group by snapshot date and stage
            const snapshots: { [date: string]: { [stage: string]: number } } = {};
            monthData.forEach(row => {
                const dateKey = row.snapshotDate.toISOString().split('T')[0];
                if (!snapshots[dateKey]) {
                    snapshots[dateKey] = {};
                }
                if (!snapshots[dateKey][row.stage]) {
                    snapshots[dateKey][row.stage] = 0;
                }
                snapshots[dateKey][row.stage] += row.amount; // Use raw amount
            });
            
            const dailySnapshots: AnomalyData['dailySnapshots'] = [];
            Object.entries(snapshots).forEach(([date, stages]) => {
                Object.entries(stages).forEach(([stage, totalAmount]) => {
                    dailySnapshots.push({ date, stage, totalAmount });
                });
            });
            
            dailySnapshots.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const analysisPeriod = {
                startDate: dailySnapshots[0]?.date || '',
                endDate: dailySnapshots[dailySnapshots.length - 1]?.date || '',
            };

            return {
                closingMonth: monthKey,
                analysisPeriod,
                dailySnapshots,
            };
        });
    }
}
