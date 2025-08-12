
'use client';

import { useState, useEffect, type FC, useMemo } from 'react';
import { AnomalyAnalyzer, type AnomalyData } from '@/services/anomaly-analyzer';
import { detectAnomalies, type AnomalyDetectionOutput } from '@/ai/flows/detect-anomalies';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Bot, AlertTriangle, CheckCircle, BarChart, TrendingDown, Hourglass, TrendingUp } from 'lucide-react';
import { Badge } from './ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AnomalyDetectionProps {
    analyzer: AnomalyAnalyzer | null;
}

const formatCurrency = (value: number) => `$${(value / 1000).toFixed(0)}K`;

const STAGE_COLORS: { [key: string]: string } = {
    'FUNDED': '#22c55e',
    'READY_FOR_FUNDING': '#3b82f6',
    'CONDITION_FULFILLMENT': '#f97316',
    'APPROVED': '#a855f7',
};

const AnomalyIcon: FC<{ type: string }> = ({ type }) => {
    switch (type) {
        case 'Sudden Change': return <BarChart className="h-4 w-4" />;
        case 'Unusual Drop': return <TrendingDown className="h-4 w-4 text-destructive" />;
        case 'Stagnation': return <Hourglass className="h-4 w-4 text-amber-600" />;
        case 'Significant Growth': return <TrendingUp className="h-4 w-4 text-emerald-600" />;
        default: return <AlertTriangle className="h-4 w-4" />;
    }
};

const SeverityBadge: FC<{ severity: 'Low' | 'Medium' | 'High' }> = ({ severity }) => {
    const variant = {
        'Low': 'secondary',
        'Medium': 'default',
        'High': 'destructive',
    }[severity] as 'secondary' | 'default' | 'destructive';
    
    return <Badge variant={variant} className="ml-auto whitespace-nowrap">{severity}</Badge>;
}

const AnomalyChart: FC<{ dailySnapshots: AnomalyData['dailySnapshots'], anomalies: AnomalyDetectionOutput['anomalies'] }> = ({ dailySnapshots, anomalies }) => {
    const { chartData, stages, yDomain } = useMemo(() => {
        const dataMap = new Map<string, any>();
        const stageSet = new Set<string>();
        let maxVal = 0;

        dailySnapshots.forEach(snap => {
            const date = snap.date;
            stageSet.add(snap.stage);
            if (!dataMap.has(date)) {
                dataMap.set(date, { date });
            }
            const entry = dataMap.get(date);
            entry[snap.stage] = snap.totalAmount;
            if (snap.totalAmount > maxVal) {
                maxVal = snap.totalAmount;
            }
        });
        
        const sortedStages = Array.from(stageSet).sort((a,b) => Object.keys(STAGE_COLORS).indexOf(b) - Object.keys(STAGE_COLORS).indexOf(a));
        const yDomain = [0, Math.ceil(maxVal / 5000000) * 5000000];
        
        return { chartData: Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), stages: sortedStages, yDomain };
    }, [dailySnapshots]);

    const anomalyPoints = useMemo(() => {
        return anomalies.map(anomaly => {
            const point = chartData.find(d => d.date === anomaly.date);
            if (point) {
                return {
                    ...anomaly,
                    yValue: point[anomaly.stage]
                }
            }
            return null;
        }).filter(p => p !== null);
    }, [anomalies, chartData]);

    return (
        <div className="h-80 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} padding={{ left: 10, right: 10 }} />
                    <YAxis tickFormatter={formatCurrency} domain={yDomain} />
                    <Tooltip
                        labelFormatter={(label) => new Date(label + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name.replace(/_/g, ' ')]}
                    />
                    <Legend />
                    {stages.map((stage) => (
                        <Line key={stage} type="monotone" dataKey={stage} name={stage.replace(/_/g, ' ')} stroke={STAGE_COLORS[stage] || '#8884d8'} strokeWidth={2} dot={false} />
                    ))}
                    {anomalyPoints?.map((anomaly, index) => (
                         <ReferenceDot key={index} x={anomaly!.date} y={anomaly!.yValue} r={5} fill="red" stroke="white" ifOverflow="extendDomain" />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

const AnomalyResultDisplay: FC<{ month: string, result: AnomalyDetectionOutput, isLoading: boolean, dailySnapshots: AnomalyData['dailySnapshots'] }> = ({ month, result, isLoading, dailySnapshots }) => {
    if (isLoading) {
         return (
             <div className="space-y-3">
                <Skeleton className="h-80 w-full" />
                <Skeleton className="h-6 w-1/2 mt-4" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
         );
    }

    if (!result || !result.anomalies || result.anomalies.length === 0) {
        return (
            <>
                <AnomalyChart dailySnapshots={dailySnapshots} anomalies={[]} />
                <Alert className="mt-4">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>No Anomalies Detected</AlertTitle>
                    <AlertDescription>
                        Our analysis did not find any significant anomalies for this period. The pipeline is progressing as expected.
                    </AlertDescription>
                </Alert>
            </>
        );
    }
    
    return (
        <div className="space-y-4">
            <AnomalyChart dailySnapshots={dailySnapshots} anomalies={result.anomalies} />
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[120px]">Date</TableHead>
                        <TableHead>Anomaly</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Severity</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {result.anomalies.map((anomaly, index) => (
                        <TableRow key={index} className={anomaly.severity === 'High' ? 'bg-destructive/10' : ''}>
                             <TableCell>{new Date(anomaly.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</TableCell>
                            <TableCell><div className="flex items-center gap-2"><AnomalyIcon type={anomaly.type}/> {anomaly.type}</div></TableCell>
                            <TableCell>{anomaly.stage.replace(/_/g, ' ')}</TableCell>
                            <TableCell>{anomaly.description}</TableCell>
                            <TableCell className="text-right"><SeverityBadge severity={anomaly.severity} /></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
};

const AnomalyDetection: FC<AnomalyDetectionProps> = ({ analyzer }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [anomalyData, setAnomalyData] = useState<AnomalyData[]>([]);
    const [analysisResults, setAnalysisResults] = useState<{ [month: string]: AnomalyDetectionOutput }>({});
    const [loadingStates, setLoadingStates] = useState<{ [month: string]: boolean }>({});
    const { toast } = useToast();

    useEffect(() => {
        if (!analyzer) return;

        const runAnalysis = async () => {
            setIsLoading(true);
            const dataForAnalysis = analyzer.getAnalysisData();
            setAnomalyData(dataForAnalysis);
            setIsLoading(false);
            
            dataForAnalysis.forEach(data => {
                if(data.dailySnapshots.length > 1) {
                    runGenkitAnalysis(data);
                } else {
                    setLoadingStates(prev => ({ ...prev, [data.closingMonth]: false }));
                    setAnalysisResults(prev => ({ ...prev, [data.closingMonth]: { anomalies: [] } }));
                }
            });
        };

        runAnalysis();
    }, [analyzer]);

    const runGenkitAnalysis = async (data: AnomalyData) => {
        const { closingMonth } = data;
        setLoadingStates(prev => ({ ...prev, [closingMonth]: true }));
        try {
            const result = await detectAnomalies(data);
            if (result.anomalies) {
                result.anomalies.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            }
            setAnalysisResults(prev => ({ ...prev, [closingMonth]: result }));
        } catch (error) {
            console.error(`Error detecting anomalies for ${closingMonth}:`, error);
            toast({
                variant: 'destructive',
                title: 'AI Analysis Failed',
                description: `Could not complete anomaly detection for ${new Date(closingMonth + '-02').toLocaleString('default', { month: 'long' })}.`
            });
            setAnalysisResults(prev => ({ ...prev, [closingMonth]: { anomalies: [] } }));
        } finally {
            setLoadingStates(prev => ({ ...prev, [closingMonth]: false }));
        }
    };
    
    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!analyzer || anomalyData.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Anomaly Detection</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">No data available for anomaly detection. Please check your CSV file.</p>
                </CardContent>
            </Card>
        );
    }

    const defaultAccordionValue = anomalyData.find(d => d.dailySnapshots.length > 0)?.closingMonth;

    return (
        <Card>
            <CardHeader>
                <CardTitle>AI-Powered Anomaly Detection</CardTitle>
                <CardDescription>
                    The AI is analyzing daily pipeline snapshots to identify unusual activity such as stalls, significant drops, or sudden changes. Anomalies are marked on the chart below. All values are raw (not weighted).
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="single" collapsible defaultValue={defaultAccordionValue}>
                    {anomalyData.map(data => (
                        <AccordionItem key={data.closingMonth} value={data.closingMonth}>
                            <AccordionTrigger>
                                <h3 className="text-lg font-semibold">
                                    {new Date(data.closingMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </h3>
                            </AccordionTrigger>
                            <AccordionContent>
                                { data.dailySnapshots.length > 0 ? (
                                    <AnomalyResultDisplay 
                                        month={data.closingMonth} 
                                        result={analysisResults[data.closingMonth]}
                                        isLoading={loadingStates[data.closingMonth] ?? true}
                                        dailySnapshots={data.dailySnapshots}
                                    />
                                ) : (
                                    <p className="text-muted-foreground p-4">Not enough data to perform analysis for this month.</p>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </CardContent>
        </Card>
    );
};

export default AnomalyDetection;
