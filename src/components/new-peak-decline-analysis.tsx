
'use client';

import { useState, useEffect, FC } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { NewPipelineTrajectoryAnalyzer } from '@/services/new-trajectory-analyzer';
import type { NewPeakAnalysis } from '@/types/new-pipeline';
import { Skeleton } from './ui/skeleton';

interface NewPeakDeclineAnalysisProps {
    analyzer: NewPipelineTrajectoryAnalyzer | null;
}

const formatCurrency = (value: number) => `$${(value / 1000000).toFixed(2)}M`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const NewPeakDeclineAnalysis: FC<NewPeakDeclineAnalysisProps> = ({ analyzer }) => {
    const [peakAnalysis, setPeakAnalysis] = useState<NewPeakAnalysis[]>([]);
    const [valueType, setValueType] = useState<'raw' | 'weighted'>('weighted');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (analyzer) {
            setIsLoading(true);
            const results = analyzer.analyzePeakAndDecline();
            setPeakAnalysis(results);
            setIsLoading(false);
        }
    }, [analyzer]);

    if (!analyzer || isLoading) {
        return (
            <Card>
                <CardHeader>
                     <Skeleton className="h-8 w-3/4 mb-2" />
                     <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Peak vs. Closing Analysis</CardTitle>
                        <CardDescription>
                            Analysis of pipeline peak values compared to final closing values for historical months.
                        </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="value-type-switch">Raw</Label>
                        <Switch
                            id="value-type-switch"
                            checked={valueType === 'weighted'}
                            onCheckedChange={(checked) => setValueType(checked ? 'weighted' : 'raw')}
                        />
                        <Label htmlFor="value-type-switch">Weighted</Label>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead>Peak Date</TableHead>
                            <TableHead>Peak Value</TableHead>
                            <TableHead>Days Before</TableHead>
                            <TableHead>Closing Value</TableHead>
                            <TableHead>Decline %</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {peakAnalysis.map(item => {
                            const peakValue = valueType === 'raw' ? item.peakRawValue : item.peakWeightedValue;
                            const closingValue = valueType === 'raw' ? item.actualClosingRawValue : item.actualClosingWeightedValue;
                            const declinePercentage = valueType === 'raw' ? item.declinePercentageRaw : item.declinePercentageWeighted;

                            return (
                                <TableRow key={item.month}>
                                    <TableCell className="font-medium">{new Date(item.month).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</TableCell>
                                    <TableCell>{item.peakDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</TableCell>
                                    <TableCell>{formatCurrency(peakValue)}</TableCell>
                                    <TableCell>{item.daysBeforeClosing}</TableCell>
                                    <TableCell>{formatCurrency(closingValue)}</TableCell>
                                    <TableCell>
                                        <span className={declinePercentage > 20 ? 'text-destructive font-bold' : ''}>
                                            {formatPercent(declinePercentage)}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

export default NewPeakDeclineAnalysis;
