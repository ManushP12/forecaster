
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import { useToast } from '@/hooks/use-toast';
import { NewPipelineTrajectoryAnalyzer } from '@/services/new-trajectory-analyzer';
import { BacktestAnalyzer } from '@/services/backtest-analyzer';
import { AnomalyAnalyzer } from '@/services/anomaly-analyzer';
import type { NewAnalysisResult, NewBacktestResult, NewAppendixData, NewTrajectoryPoint, NewMonthTrajectory, NewTrajectoryComparison } from '@/types/new-pipeline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Target, History, BookOpen, TrendingUp, SlidersHorizontal, ArrowRight, Download, AlertCircle, Database } from 'lucide-react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import NewPeakDeclineAnalysis from './new-peak-decline-analysis';
import NewSensitivityAnalysis from './new-sensitivity-analysis';
import AnomalyDetection from './anomaly-detection';
import RawDataAnalysis from './raw-data-analysis';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

const formatCurrency = (value: number) => `$${(value / 1000000).toFixed(2)}M`;
const formatCurrencyFull = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPercent = (value: number, decimals = 1) => `${value.toFixed(decimals)}%`;

const ForecastChart: FC<{
    result: NewAnalysisResult;
    historicalData: NewMonthTrajectory;
}> = ({ result, historicalData }) => {
    
    const chartData = useMemo(() => {
        const dataMap = new Map<number, any>();

        result.trajectory.forEach(p => {
            dataMap.set(p.daysBeforeClose, {
                days_before_closing: p.daysBeforeClose,
                actual: p.weightedAmount / 1000000
            });
        });

        if (result.forecastTrajectory) {
            result.forecastTrajectory.forEach(p => {
                const existing = dataMap.get(p.daysBeforeClose) || { days_before_closing: p.daysBeforeClose };
                dataMap.set(p.daysBeforeClose, {
                    ...existing,
                    forecast: p.weightedAmount / 1000000
                });
            });
        }
        
        result.similarMonths.forEach((month, index) => {
            const historicalTraj = historicalData[month.historical_month] || [];
            historicalTraj.forEach(p => {
                const existing = dataMap.get(p.daysBeforeClose) || { days_before_closing: p.daysBeforeClose };
                dataMap.set(p.daysBeforeClose, {
                    ...existing,
                    [`similar_${index}`]: p.weightedAmount / 1000000
                });
            });
        });

        return Array.from(dataMap.values()).sort((a, b) => b.days_before_closing - a.days_before_closing);
    }, [result, historicalData]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="p-2 bg-background border rounded-lg shadow-sm">
                    <p className="font-bold">{`Days Before: ${label}`}</p>
                    {payload.map((pld: any) => (
                         <p key={pld.name} style={{ color: pld.stroke }}>
                            {pld.name}: {formatCurrency(pld.value * 1000000)}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <Card className="mt-4">
            <CardHeader>
                <CardTitle>Detailed Analysis for {new Date(result.month).toLocaleString('default', { timeZone: 'UTC', month: 'long', year: 'numeric' })}</CardTitle>
            </CardHeader>
            <CardContent className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 30, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                            dataKey="days_before_closing" reversed={true} type="number" domain={['dataMax', 0]}
                            label={{ value: 'Days Before Closing', position: 'insideBottom', offset: -10 }}/>
                        <YAxis tickFormatter={(val) => `$${val}M`}
                               label={{ value: 'Weighted Pipeline ($M)', angle: -90, position: 'insideLeft', offset: -20, style: { textAnchor: 'middle', fontSize: '0.8rem' } }}/>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="bottom" wrapperStyle={{ paddingLeft: '60px', paddingTop: '20px' }} />
                        <Line
                            type="monotone" dataKey="actual" name="Current Trajectory" stroke="#8884d8" strokeWidth={3} dot={{ r: 4 }}
                        />
                         <Line
                            type="monotone" dataKey="forecast" name="Forecast" stroke="#b3b0e0" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 2 }}
                        />
                        {result.similarMonths.map((comp, index) => {
                            const colors = ["#ffc658", "#ff8042", "#0088FE"];
                            const monthName = new Date(comp.historical_month).toLocaleString('default', { timeZone: 'UTC', month: 'short', year: 'numeric' });
                            return (
                                <Line key={comp.historical_month}
                                      type="monotone"
                                      dataKey={`similar_${index}`} name={`${monthName} (similar)`} stroke={colors[index % colors.length]} strokeWidth={2} strokeDasharray="3 3" dot={{ r: 2 }} />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
};


const NewMathForecaster: FC<{ csvData: string | null }> = ({ csvData }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [analyzer, setAnalyzer] = useState<NewPipelineTrajectoryAnalyzer | null>(null);
    const [anomalyAnalyzer, setAnomalyAnalyzer] = useState<AnomalyAnalyzer | null>(null);
    const [analysisResults, setAnalysisResults] = useState<NewAnalysisResult[]>([]);
    const [backtestResults, setBacktestResults] = useState<NewBacktestResult[] | null>(null);
    const [appendixData, setAppendixData] = useState<NewAppendixData | null>(null);
    const [historicalData, setHistoricalData] = useState<NewMonthTrajectory>({});
    const { toast } = useToast();

    useEffect(() => {
        if (!csvData) return;

        const runAnalysis = async () => {
            try {
                setIsLoading(true);
                const newAnalyzer = new NewPipelineTrajectoryAnalyzer();
                await newAnalyzer.loadData(csvData);
                
                if (newAnalyzer.hasData()) {
                    setAnalyzer(newAnalyzer);
                    setAnalysisResults(newAnalyzer.getForecast());
                    setAppendixData(newAnalyzer.getAppendixData());
                    setHistoricalData(newAnalyzer.getHistoricalData());

                    const backtestAnalyzer = new BacktestAnalyzer(
                        newAnalyzer.getAggregatedDataByMonth(),
                        newAnalyzer.getActualClosingValues()
                    );
                    setBacktestResults(backtestAnalyzer.getBacktestResults());

                    const anomAnalyzer = new AnomalyAnalyzer();
                    await anomAnalyzer.loadData(csvData);
                    setAnomalyAnalyzer(anomAnalyzer);

                } else {
                    setAnalyzer(null);
                    setAnomalyAnalyzer(null);
                    toast({
                        variant: "destructive",
                        title: "Invalid Data",
                        description: "The uploaded CSV file could not be processed or contains no data for 2025.",
                    });
                }
            } catch (error) {
                console.error("Error running new math analysis", error);
                setAnalyzer(null);
                setAnomalyAnalyzer(null);
                toast({
                    variant: "destructive",
                    title: "Analysis Failed",
                    description: "There was an error processing the data with the new methodology.",
                });
            } finally {
                setIsLoading(false);
            }
        };

        runAnalysis();
    }, [csvData, toast]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
                <Card className="w-full max-w-md text-center p-8">
                    <CardHeader>
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4 animate-pulse">
                            <Bot className="h-8 w-8 text-primary" />
                        </div>
                        <CardTitle className="font-headline text-2xl">Running Forecast...</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Processing data with the growth rate model. Please wait.</p>
                        <Skeleton className="h-4 w-full mt-4" />
                        <Skeleton className="h-4 w-3/4 mt-2" />
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    if (!analyzer) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
                 <p className="text-muted-foreground">Upload a CSV to begin.</p>
            </div>
        );
    }
  
    return (
        <div className="p-4 md:p-8 space-y-8">
            <header>
                <h1 className="text-3xl font-bold font-headline">Pipeline Forecasting</h1>
                <p className="text-muted-foreground">Day-by-day forecast using historical median growth rates.</p>
            </header>
            
            <Tabs defaultValue="forecast" className="w-full">
                <TabsList className="grid w-full grid-cols-7">
                    <TabsTrigger value="forecast"><Target className="mr-2"/>Forecast Summary</TabsTrigger>
                    <TabsTrigger value="peak-analysis"><TrendingUp className="mr-2"/>Peak & Decline</TabsTrigger>
                    <TabsTrigger value="raw-data"><Database className="mr-2"/>Raw Data Analysis</TabsTrigger>
                    <TabsTrigger value="anomaly-detection"><AlertCircle className="mr-2"/>Anomaly Detection</TabsTrigger>
                    <TabsTrigger value="backtest"><History className="mr-2"/>Backtest Results</TabsTrigger>
                    <TabsTrigger value="sensitivity-analysis"><SlidersHorizontal className="mr-2"/>Sensitivity Analysis</TabsTrigger>
                    <TabsTrigger value="appendix"><BookOpen className="mr-2"/>Appendix</TabsTrigger>
                </TabsList>

                <TabsContent value="forecast" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Forecast Summary</CardTitle>
                            <CardDescription>Predicted end-of-month weighted pipeline values.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Month</TableHead>
                                        <TableHead>Current Raw Value</TableHead>
                                        <TableHead>Current Weighted Value</TableHead>
                                        <TableHead>Days to Close</TableHead>
                                        <TableHead>Projected Growth</TableHead>
                                        <TableHead>Final Forecast</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysisResults.map(r => (
                                        <TableRow key={r.month}>
                                            <TableCell className="font-medium">{new Date(r.month).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</TableCell>
                                            <TableCell>{formatCurrency(r.currentRawValue)}</TableCell>
                                            <TableCell>{formatCurrency(r.currentWeightedValue)}</TableCell>
                                            <TableCell>{r.daysToClose}</TableCell>
                                            <TableCell>{r.forecast ? formatPercent(r.totalProjectedGrowth * 100, 1) : 'N/A'}</TableCell>
                                            <TableCell className="font-bold text-primary">{r.forecast ? formatCurrency(r.forecast) : 'Not Recommended'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <p className="text-sm text-muted-foreground mt-4">* Forecasts are not recommended for months with more than 89 days to close due to data reliability.</p>
                        </CardContent>
                    </Card>

                    {analysisResults.filter(r => r.forecast).map(result => (
                       <ForecastChart key={result.month} result={result} historicalData={historicalData} />
                    ))}

                </TabsContent>

                <TabsContent value="peak-analysis" className="mt-6">
                    <NewPeakDeclineAnalysis analyzer={analyzer} />
                </TabsContent>

                <TabsContent value="raw-data" className="mt-6">
                    <RawDataAnalysis csvData={csvData} />
                </TabsContent>

                <TabsContent value="anomaly-detection" className="mt-6">
                    <AnomalyDetection analyzer={anomalyAnalyzer} />
                </TabsContent>
                
                <TabsContent value="backtest" className="mt-6">
                    <NewBacktestAnalysis results={backtestResults} />
                </TabsContent>

                <TabsContent value="sensitivity-analysis" className="mt-6">
                    <NewSensitivityAnalysis analyzer={analyzer} analysisResults={analysisResults} historicalData={historicalData} />
                </TabsContent>

                <TabsContent value="appendix" className="mt-6">
                    <NewAppendix data={appendixData} analysisResults={analysisResults} />
                </TabsContent>
            </Tabs>
        </div>
    );
};

const NewBacktestAnalysis: FC<{ results: NewBacktestResult[] | null }> = ({ results }) => {
    if (!results || results.length === 0) return <p>No backtest results available. This may be due to insufficient historical data for a proper train/test split.</p>;

    const overallMetrics = useMemo(() => {
        if (!results || results.length === 0) return { avgAccuracy: 0, avgAccuracyAt30Days: 0, meanAbsoluteError: 0 };

        const allErrors = results.map(r => Math.abs(r.prediction - r.actual) / r.actual);
        const meanAbsoluteError = allErrors.reduce((sum, err) => sum + err, 0) / allErrors.length * 100;

        const accuracies = results.map(r => 100 - (Math.abs(r.prediction - r.actual) / r.actual * 100));
        
        const accuraciesAt30Days = results
            .filter(r => r.daysBefore <= 30)
            .map(r => 100 - (Math.abs(r.prediction - r.actual) / r.actual * 100));
            
        const avgAccuracyAt30Days = accuraciesAt30Days.length > 0 
            ? accuraciesAt30Days.reduce((sum, acc) => sum + acc, 0) / accuraciesAt30Days.length
            : 0;
            
        const within10Percent = results.filter(r => Math.abs(r.prediction - r.actual) / r.actual <= 0.1).length / results.length * 100;

        return { meanAbsoluteError, avgAccuracyAt30Days, within10Percent };
    }, [results]);


    const chartData = useMemo(() => {
        const dataByMonth: { [key: string]: any[] } = {};
        results.forEach(r => {
            const month = new Date(r.month).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
            if (!dataByMonth[month]) dataByMonth[month] = [];
            dataByMonth[month].push({
                daysBefore: r.daysBefore,
                prediction: r.prediction / 1000000,
                actual: r.actual / 1000000,
                accuracy: 100 - (Math.abs(r.prediction - r.actual) / r.actual * 100)
            });
        });

        Object.values(dataByMonth).forEach(monthData => monthData.sort((a, b) => b.daysBefore - a.daysBefore));
        return dataByMonth;
    }, [results]);
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Model Backtesting</CardTitle>
                <CardDescription>
                    The model is dynamically trained on all available historical data prior to the test period. It is then tested on the three most recent complete months to validate its accuracy.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Alert>
                    <TrendingUp className="h-4 w-4" />
                    <AlertTitle>Overall Model Performance</AlertTitle>
                    <AlertDescription>
                        <div className="flex justify-around">
                            <div>
                                <span className="font-bold text-lg text-primary">{formatPercent(overallMetrics.meanAbsoluteError, 1)}</span>
                                <p className="text-sm text-muted-foreground">Mean Absolute Error</p>
                            </div>
                             <div>
                                <span className="font-bold text-lg text-primary">{formatPercent(overallMetrics.within10Percent, 0)}</span>
                                <p className="text-sm text-muted-foreground">Predictions within ±10%</p>
                            </div>
                            <div>
                                <span className="font-bold text-lg text-primary">{formatPercent(overallMetrics.avgAccuracyAt30Days, 1)}</span>
                                <p className="text-sm text-muted-foreground">Average Accuracy (&lt;30 days)</p>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {Object.entries(chartData).map(([month, data]) => (
                        <Card key={month}>
                            <CardHeader>
                                <CardTitle>{month}</CardTitle>
                                <CardDescription>Actual Closing: <span className="font-bold">{formatCurrency(data[0].actual * 1000000)}</span></CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data} margin={{ top: 5, right: 30, left: 30, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis 
                                            dataKey="daysBefore" type="number" reversed={true} domain={[90, 0]}
                                            label={{ value: 'Days Before Closing', position: 'insideBottom', offset: -10 }}/>
                                        <YAxis yAxisId="left" tickFormatter={(val) => `$${val}M`} label={{ value: 'Value ($M)', angle: -90, position: 'insideLeft', offset: -20, style: { textAnchor: 'middle' } }} />
                                        <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `${val.toFixed(0)}%`} label={{ value: 'Accuracy %', angle: 90, position: 'insideRight', style: { textAnchor: 'middle' } }}/>
                                        <Tooltip formatter={(value: number, name: string) => name === 'Accuracy' ? [`${value.toFixed(1)}%`, name] : [formatCurrency(value * 1000000), name]} />
                                        <Legend verticalAlign="top" />
                                        <Line yAxisId="left" type="monotone" dataKey="actual" name="Actual" stroke="green" strokeWidth={2} dot={false} />
                                        <Line yAxisId="left" type="monotone" dataKey="prediction" name="Prediction" stroke="#8884d8" strokeWidth={2} />
                                        <Line yAxisId="right" type="monotone" dataKey="accuracy" name="Accuracy" stroke="#ffc658" strokeWidth={2} strokeDasharray="3 3" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

const NewAppendix: FC<{ data: NewAppendixData | null, analysisResults: NewAnalysisResult[] }> = ({ data, analysisResults }) => {
    if (!data) return <p>Loading appendix...</p>;

    const growthRatesTableData = useMemo(() => {
        if (!data.medianGrowthRates || !data.smoothedGrowthRates) return [];
        
        const combined = data.smoothedGrowthRates.map(smoothed => {
            const raw = data.medianGrowthRates.find(r => r.daysBefore === smoothed.daysBefore);
            return {
                daysBefore: smoothed.daysBefore,
                rawRate: raw ? raw.rate : 0,
                smoothedRate: smoothed.rate,
            };
        });
        
        return combined.sort((a, b) => b.daysBefore - a.daysBefore);
    }, [data]);
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>1. Historical Daily Growth Rates</CardTitle>
                    <CardDescription>
                        Median daily growth of the weighted pipeline, calculated from all available historical data.
                        Outliers have been removed and a 5-day moving average has been applied for smoothing.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="h-[400px]">
                             <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data.smoothedGrowthRates} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="daysBefore" reversed={true} type="number" domain={[89, 0]} label={{ value: 'Days Before Closing', position: 'insideBottom', offset: -10 }}/>
                                    <YAxis tickFormatter={(val) => `${(val * 100).toFixed(1)}%`} label={{ value: 'Median Daily Growth', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}/>
                                    <Tooltip formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Smoothed Median Growth']} />
                                    <Legend verticalAlign="top" />
                                    <Line type="monotone" dataKey="rate" name="5-Day Smoothed Median Growth" stroke="#8884d8" strokeWidth={2} dot={false} />
                                    <ReferenceLine y={0} stroke="#ccc" strokeDasharray="3 3" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold mb-2">How it's calculated:</h4>
                            <p className="text-xs text-muted-foreground mb-4">The smoothed rate for any given day is the average of the median rates for that day, the 2 days before, and the 2 days after.</p>
                             <ScrollArea className="h-[350px]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>Days Before</TableHead>
                                            <TableHead>Median Growth</TableHead>
                                            <TableHead>Smoothed Growth</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {growthRatesTableData.map(d => (
                                            <TableRow key={d.daysBefore}>
                                                <TableCell>{d.daysBefore}</TableCell>
                                                <TableCell>{formatPercent(d.rawRate * 100, 4)}</TableCell>
                                                <TableCell className="font-bold">{formatPercent(d.smoothedRate * 100, 4)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {data.forecastCalculations.map(calc => {
                const analysisResult = analysisResults.find(r => r.month === calc.month);
                return (
                    <Card key={calc.month}>
                        <CardHeader>
                            <CardTitle>2. Forecast Calculation for {new Date(calc.month).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</CardTitle>
                            <CardDescription>
                                Starting with a weighted pipeline of {formatCurrencyFull(calc.startValue)} with {calc.daysToClose} days left, the model applies the historical median growth rate for each remaining day.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-96 w-full">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead>Day</TableHead>
                                            <TableHead>Days Before</TableHead>
                                            <TableHead>Starting Value</TableHead>
                                            <TableHead>Median Growth Rate</TableHead>
                                            <TableHead>Ending Value</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {calc.dailyBreakdown.map(d => (
                                            <TableRow key={d.daysBefore}>
                                                <TableCell>{new Date(d.date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</TableCell>
                                                <TableCell>{d.daysBefore}</TableCell>
                                                <TableCell>{formatCurrencyFull(d.startValue)}</TableCell>
                                                <TableCell className="font-mono">{formatPercent(d.growthRate * 100, 4)}</TableCell>
                                                <TableCell>{formatCurrencyFull(d.endValue)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                        {analysisResult && (
                             <CardFooter className="bg-muted/50 p-4 mt-6 flex-col items-start space-y-2">
                                <h3 className="font-semibold text-lg">Growth Calculation Summary</h3>
                               <div className="flex items-center justify-between w-full">
                                    <div className="text-center">
                                        <p className="text-sm text-muted-foreground">Final Forecast</p>
                                        <p className="font-bold text-xl text-primary">{formatCurrencyFull(analysisResult.forecast!)}</p>
                                    </div>
                                    <div className="text-center text-muted-foreground font-mono text-lg">/</div>
                                     <div className="text-center">
                                        <p className="text-sm text-muted-foreground">Current Value</p>
                                        <p className="font-bold text-xl">{formatCurrencyFull(analysisResult.currentWeightedValue)}</p>
                                    </div>
                                    <div className="text-center text-muted-foreground font-mono text-lg">- 1 =</div>
                                    <div className="text-center">
                                        <p className="text-sm text-muted-foreground">Total Projected Growth</p>
                                        <p className="font-bold text-xl text-primary">{formatPercent(analysisResult.totalProjectedGrowth * 100, 1)}</p>
                                    </div>
                               </div>
                                <p className="text-xs text-muted-foreground pt-2">Formula: (Final Forecast / Current Weighted Value) - 1</p>
                            </CardFooter>
                        )}
                    </Card>
                );
            })}
        </div>
    );
};

export { NewMathForecaster };
