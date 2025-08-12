
'use client';

import { useState, useEffect, type FC, useMemo } from 'react';
import { RawDataAnalyzer, type RawDataSummary, type MonthlyAnalysis } from '@/services/raw-data-analyzer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RawDataAnalysisProps {
    csvData: string | null;
}

const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1_000_000_000) {
        return `$${(value / 1_000_000_000).toFixed(2)}B`;
    }
    if (Math.abs(value) >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1_000) {
        return `$${(value / 1_000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
};

const formatMonth = (monthStr: string) => {
    return new Date(monthStr + '-02').toLocaleString('default', { month: 'long', year: 'numeric' });
};

const OverallSnapshotView: FC<{ summary: RawDataSummary }> = ({ summary }) => {
    const { latestSnapshot, pipelineHistory, overallStageBreakdown, upcomingMonthTotals } = summary;
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Latest Snapshot Summary</CardTitle>
                    <CardDescription>
                        A high-level overview of the entire pipeline as of {new Date(latestSnapshot.date + 'T12:00:00Z').toLocaleString()}.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-6 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Total Raw Value</CardDescription>
                                <CardTitle className="text-4xl">{formatCurrency(latestSnapshot.totalValue)}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Number of Closing Months</CardDescription>
                                <CardTitle className="text-4xl">{upcomingMonthTotals.length}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Total Data Points</CardDescription>
                                <CardTitle className="text-4xl">{latestSnapshot.dataPoints.toLocaleString()}</CardTitle>
                            </CardHeader>
                        </Card>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Total Pipeline Value Over Time</CardTitle>
                    <CardDescription>Total raw value of the entire pipeline based on daily snapshots.</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={pipelineHistory}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tickFormatter={(date) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                            <YAxis tickFormatter={formatCurrency} />
                            <Tooltip labelFormatter={(label) => new Date(label + 'T12:00:00Z').toLocaleDateString()} formatter={(value: number) => [formatCurrency(value), "Total Value"]} />
                            <Legend />
                            <Line type="monotone" dataKey="totalValue" name="Total Raw Value" stroke="#8884d8" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Overall Stage Breakdown</CardTitle>
                        <CardDescription>Raw pipeline value distribution by stage for the latest snapshot.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={overallStageBreakdown} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" tickFormatter={formatCurrency} />
                                <YAxis type="category" dataKey="stage" width={120} />
                                <Tooltip formatter={(value: number) => [formatCurrency(value), "Value"]} />
                                <Bar dataKey="totalValue" name="Raw Value" fill="#82ca9d" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Value by Closing Month</CardTitle>
                        <CardDescription>Total raw value for each upcoming closing month in the latest snapshot.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Closing Month</TableHead>
                                    <TableHead className="text-right">Total Raw Value</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {upcomingMonthTotals.map(item => (
                                    <TableRow key={item.closingMonth}>
                                        <TableCell className="font-medium">{formatMonth(item.closingMonth)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(item.totalValue)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

const MonthlyDeepDiveView: FC<{ summary: RawDataSummary }> = ({ summary }) => {
    const allMonths = useMemo(() => [...summary.historicalMonths, ...summary.upcomingMonths], [summary]);
    const defaultTab = summary.upcomingMonths[0]?.month || summary.historicalMonths[0]?.month;

    const [selectedMonth, setSelectedMonth] = useState<string | undefined>(defaultTab);

    useEffect(() => {
        if (!selectedMonth && defaultTab) {
            setSelectedMonth(defaultTab);
        }
    }, [defaultTab, selectedMonth]);

    if (allMonths.length === 0) {
        return <p className="text-muted-foreground p-4">No monthly data available for a deep-dive analysis.</p>;
    }
    
    const monthData = allMonths.find(m => m.month === selectedMonth);

    return (
        <div className="space-y-4">
            <div className="flex items-center space-x-4">
                <h2 className="text-lg font-semibold">Select a month to analyze:</h2>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-[280px]">
                        <SelectValue placeholder="Select a month..." />
                    </SelectTrigger>
                    <SelectContent>
                        {allMonths.map(month => (
                            <SelectItem key={month.month} value={month.month}>
                                {formatMonth(month.month)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            
            {monthData ? (
                 <Card>
                    <CardHeader>
                        <CardTitle>Analysis for {formatMonth(monthData.month)}</CardTitle>
                        <CardDescription>
                            Latest Value: <span className="font-bold text-primary">{formatCurrency(monthData.totalValue)}</span> from {monthData.dataPoints.toLocaleString()} data points.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2">Value Over Time</h3>
                                <p className="text-sm text-muted-foreground mb-4">How the pipeline for this specific closing month has evolved.</p>
                                <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={monthData.history}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="date" tickFormatter={(date) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                                            <YAxis tickFormatter={formatCurrency} />
                                            <Tooltip labelFormatter={(label) => new Date(label + 'T12:00:00Z').toLocaleDateString()} formatter={(value: number) => [formatCurrency(value), "Total Value"]} />
                                            <Line type="monotone" dataKey="totalValue" name="Raw Value" stroke="#8884d8" strokeWidth={2} dot={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2">Latest Stage Breakdown</h3>
                                <p className="text-sm text-muted-foreground mb-4">The composition of the pipeline for this month in the latest snapshot.</p>
                                <div className="h-80">
                                     <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthData.stageBreakdown} layout="vertical" margin={{ left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis type="number" tickFormatter={formatCurrency} />
                                            <YAxis type="category" dataKey="stage" width={120} />
                                            <Tooltip formatter={(value: number) => [formatCurrency(value), "Value"]} />
                                            <Bar dataKey="totalValue" name="Raw Value" fill="#82ca9d" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                         </div>
                    </CardContent>
                </Card>
            ) : (
                <p className="text-muted-foreground p-4">Select a month to see the detailed analysis.</p>
            )}
        </div>
    );
};


const RawDataAnalysis: FC<RawDataAnalysisProps> = ({ csvData }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [analysisData, setAnalysisData] = useState<RawDataSummary | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        if (!csvData) {
            setIsLoading(false);
            return;
        }

        const processData = async () => {
            setIsLoading(true);
            try {
                const analyzer = new RawDataAnalyzer();
                await analyzer.loadData(csvData);
                setAnalysisData(analyzer.getAnalysisSummary());
            } catch (error) {
                console.error("Error analyzing raw data:", error);
                toast({
                    variant: "destructive",
                    title: "Raw Data Analysis Failed",
                    description: "There was an error processing the CSV for raw data analysis.",
                });
                setAnalysisData(null);
            } finally {
                setIsLoading(false);
            }
        };

        processData();
    }, [csvData, toast]);

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-1/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-1/3" />
                    <Skeleton className="h-64 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (!analysisData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Raw Data Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">No data available to display. Please upload a valid CSV file.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Tabs defaultValue="snapshot" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="snapshot">Overall Snapshot</TabsTrigger>
                <TabsTrigger value="deepdive">Monthly Deep Dive</TabsTrigger>
            </TabsList>
            <TabsContent value="snapshot" className="mt-4">
                <OverallSnapshotView summary={analysisData} />
            </TabsContent>
            <TabsContent value="deepdive" className="mt-4">
                <MonthlyDeepDiveView summary={analysisData} />
            </TabsContent>
        </Tabs>
    );
};

export default RawDataAnalysis;

    