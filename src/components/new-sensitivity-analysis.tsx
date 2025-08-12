
'use client';

import type { FC } from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { NewAnalysisResult, NewTrajectoryPoint, NewMonthTrajectory, NewTrajectoryComparison } from '@/types/new-pipeline';
import { NewPipelineTrajectoryAnalyzer } from '@/services/new-trajectory-analyzer';

interface NewSensitivityAnalysisProps {
    analysisResults: NewAnalysisResult[];
    analyzer: NewPipelineTrajectoryAnalyzer | null;
    historicalData: NewMonthTrajectory;
}

const formatCurrency = (value: number) => `$${(value / 1000000).toFixed(1)}M`;

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="p-2 bg-background border rounded-lg shadow-sm">
                <p className="font-bold">{`Days Before: ${label}`}</p>
                {payload.map((pld: any, index: number) => (
                    <p key={`${pld.name}-${index}`} style={{ color: pld.stroke }}>
                        {pld.name}: {formatCurrency(pld.value * 1000000)}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

const GoalSeekScenario: FC<{ 
    result: NewAnalysisResult, 
    analyzer: NewPipelineTrajectoryAnalyzer, 
    historicalData: NewMonthTrajectory
}> = ({ result, analyzer, historicalData }) => {
    const [goal, setGoal] = useState<string>('');
    const [peakValue, setPeakValue] = useState<number>(0);
    const [daysBeforeClosing, setDaysBeforeClosing] = useState<number>(22);
    const [projectedTrajectory, setProjectedTrajectory] = useState<NewTrajectoryPoint[] | null>(null);
    const [sliderRange, setSliderRange] = useState({ min: 0, max: 0 });
    const [similarMonths, setSimilarMonths] = useState<NewTrajectoryComparison[]>([]);
    const [baseForecast, setBaseForecast] = useState<NewTrajectoryPoint[] | undefined>(result.forecastTrajectory);

    const originalTrajectory = useMemo(() => result.trajectory, [result.trajectory]);

    const findAndSetSimilarMonths = useCallback(() => {
        if (goal && peakValue > 0 && analyzer) {
            const goalValue = parseFloat(goal.replace(/[^0-9.-]+/g, ""));
            const matches = analyzer.findSimilarHistoricalMonthsForGoalSeek(goalValue, peakValue, daysBeforeClosing);
            setSimilarMonths(matches);
        }
    }, [goal, peakValue, daysBeforeClosing, analyzer]);

    useEffect(() => {
        if (goal) {
            const goalValue = parseFloat(goal.replace(/[^0-9.-]+/g, "")) || 0;
            const initialPeak = goalValue * 1.15; // Default to 15% over goal
            setPeakValue(initialPeak);
            setSliderRange({ min: goalValue, max: initialPeak * 1.5 });
            setDaysBeforeClosing(22);
        } else {
            setPeakValue(0);
            setProjectedTrajectory(null);
            setSimilarMonths([]);
        }
    }, [goal]);

    useEffect(() => {
        if (goal && analyzer) {
            const goalValue = parseFloat(goal.replace(/[^0-9.-]+/g, "")) || 0;
            const trajectory = analyzer.generateGoalSeekTrajectory(
                originalTrajectory,
                goalValue,
            );
            setProjectedTrajectory(trajectory);
        }
        if (goal && peakValue > 0) {
           findAndSetSimilarMonths();
        }
    }, [goal, peakValue, daysBeforeClosing, analyzer, originalTrajectory, findAndSetSimilarMonths]);

    const chartData = useMemo(() => {
        const dataMap = new Map<number, any>();

        originalTrajectory.forEach(p => {
            dataMap.set(p.daysBeforeClose, {
                days_before_closing: p.daysBeforeClose,
                actual: p.weightedAmount / 1000000
            });
        });

        if (baseForecast) {
            baseForecast.forEach(p => {
                const existing = dataMap.get(p.daysBeforeClose) || { days_before_closing: p.daysBeforeClose };
                dataMap.set(p.daysBeforeClose, {
                    ...existing,
                    base_forecast: p.weightedAmount / 1000000
                });
            });
        }

        if (projectedTrajectory) {
            projectedTrajectory.forEach(p => {
                const existing = dataMap.get(p.daysBeforeClose) || { days_before_closing: p.daysBeforeClose };
                dataMap.set(p.daysBeforeClose, {
                    ...existing,
                    projected: p.weightedAmount / 1000000
                });
            });
        }
        
        similarMonths.forEach((month, index) => {
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
    }, [originalTrajectory, projectedTrajectory, similarMonths, historicalData, baseForecast]);
    
    const yAxisLabel = `Weighted Pipeline ($M)`;

    return (
        <div className="border-b pb-6 last:border-b-0 last:pb-0">
            <h3 className="text-xl font-semibold mb-4">{new Date(result.month).toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                <div className="space-y-2">
                    <Label htmlFor={`goal-${result.month}`}>Target Closing Value ($)</Label>
                    <Input
                        id={`goal-${result.month}`}
                        type="text"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        placeholder="e.g., 95,000,000"
                    />
                </div>
            </div>

            {goal && (
                <div className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                         <div className="space-y-4">
                            <Label htmlFor={`peakValueSlider-${result.month}`}>Hypothetical Peak Value: {formatCurrency(peakValue)}</Label>
                            <Slider
                                id={`peakValueSlider-${result.month}`}
                                min={sliderRange.min}
                                max={sliderRange.max}
                                step={(sliderRange.max - sliderRange.min) / 100}
                                value={[peakValue]}
                                onValueChange={(val) => setPeakValue(val[0])}
                            />
                        </div>
                        <div className="space-y-4">
                            <Label htmlFor={`daysSlider-${result.month}`}>Hypothetical Peak Timing (Days Before Close): {daysBeforeClosing}</Label>
                            <Slider
                                id={`daysSlider-${result.month}`}
                                min={1}
                                max={90}
                                step={1}
                                value={[daysBeforeClosing]}
                                onValueChange={(val) => setDaysBeforeClosing(val[0])}
                            />
                        </div>
                    </div>

                    <div className="h-[400px]">
                        <h4 className="font-semibold mb-2 text-lg">Projected Path to Goal for {result.month}</h4>
                         <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 30, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="days_before_closing" 
                                    type="number" 
                                    reversed={true} 
                                    domain={['dataMax', 0]}
                                    label={{ value: 'Days Before Closing', position: 'insideBottom', offset: -10 }}/>
                                <YAxis 
                                    tickFormatter={(val) => `$${val}M`}
                                    label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -20, style: { textAnchor: 'middle', fontSize: '0.8rem' } }}/>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend verticalAlign="bottom" wrapperStyle={{ paddingLeft: '60px', paddingTop: '20px' }}/>
                                
                                <Line
                                    type="monotone"
                                    dataKey="actual"
                                    name="Actual Data"
                                    stroke="#8884d8"
                                    strokeWidth={3}
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="base_forecast"
                                    name="Original Forecast"
                                    stroke="#b3b0e0"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="projected"
                                    name="Projected Path to Goal"
                                    stroke="#ff7300"
                                    strokeWidth={3}
                                    strokeDasharray="3 3"
                                    dot={false}
                                />
                                {similarMonths.map((month, index) => (
                                    <Line
                                        key={month.historical_month}
                                        type="monotone"
                                        dataKey={`similar_${index}`}
                                        name={`${new Date(month.historical_month).toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' })} (similar)`}
                                        stroke={index === 0 ? "#82ca9d" : "#ffc658"}
                                        strokeWidth={1.5}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                ))}

                                <ReferenceLine y={peakValue / 1000000} label={{ value: "Hypothetical Peak", position: 'insideTopLeft' }} stroke="red" strokeDasharray="3 3" />
                                <ReferenceLine x={daysBeforeClosing} label="Peak Day" stroke="red" strokeDasharray="3 3" />

                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
};


const NewSensitivityAnalysis: FC<NewSensitivityAnalysisProps> = ({ analysisResults, analyzer, historicalData }) => {

    if (!analyzer || !analysisResults || analysisResults.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Goal-Seeking Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">No ongoing months available for analysis. Please upload data with future months.</p>
                </CardContent>
            </Card>
        );
    }
    
    const upcomingMonths = analysisResults.slice(0, 3).filter(r => r.forecast);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Goal-Seeking Analysis</CardTitle>
                <CardDescription>
                    Input your desired closing value for an upcoming month. The chart will show the required growth path to reach your target.
                    You can also use the sliders to visualize a hypothetical peak and find historical months that followed a similar peak trajectory.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {upcomingMonths.map(result => (
                        <GoalSeekScenario 
                            key={result.month}
                            result={result}
                            analyzer={analyzer}
                            historicalData={historicalData}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default NewSensitivityAnalysis;
