
'use server';
/**
 * @fileOverview An AI flow to detect anomalies in pipeline data.
 * 
 * - detectAnomalies - A function that analyzes pipeline data for unusual patterns.
 * - AnomalyDetectionInput - The input type for the anomaly detection function.
 * - AnomalyDetectionOutput - The return type for the anomaly detection function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DataPointSchema = z.object({
    date: z.string().describe('The date of the data snapshot.'),
    stage: z.string().describe('The pipeline stage (e.g., APPROVED, FUNDED).'),
    totalAmount: z.number().describe('The total raw (unweighted) amount in this stage on this date.'),
});

const AnomalyDetectionInputSchema = z.object({
  analysisPeriod: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
  dailySnapshots: z.array(DataPointSchema).describe('An array of daily pipeline snapshots for a specific closing month.'),
  closingMonth: z.string().describe('The closing month being analyzed (e.g., YYYY-MM).'),
});
export type AnomalyDetectionInput = z.infer<typeof AnomalyDetectionInputSchema>;

const AnomalySchema = z.object({
    date: z.string().describe('The specific date (YYYY-MM-DD) on which the anomaly occurred or began.'),
    type: z.enum(['Sudden Change', 'Stagnation', 'Significant Growth', 'Unusual Drop']).describe('The type of anomaly detected.'),
    stage: z.string().describe('The pipeline stage where the anomaly occurred.'),
    description: z.string().describe('A concise, human-readable explanation of the anomaly, including specific dates and amounts.'),
    severity: z.enum(['Low', 'Medium', 'High']).describe('The assessed severity of the anomaly.'),
});

const AnomalyDetectionOutputSchema = z.object({
  anomalies: z.array(AnomalySchema).describe('A list of detected anomalies in the pipeline data.'),
});
export type AnomalyDetectionOutput = z.infer<typeof AnomalyDetectionOutputSchema>;

export async function detectAnomalies(input: AnomalyDetectionInput): Promise<AnomalyDetectionOutput> {
  return anomalyDetectionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'anomalyDetectionPrompt',
  input: { schema: AnomalyDetectionInputSchema },
  output: { schema: AnomalyDetectionOutputSchema },
  prompt: `You are a meticulous business analyst tasked with identifying anomalies in a sales pipeline dataset for a specific closing month.
Analyze the provided daily snapshots of raw (unweighted) pipeline values for the closing month of {{{closingMonth}}}. The data covers the period from {{{analysisPeriod.startDate}}} to {{{analysisPeriod.endDate}}}.

Your task is to identify and report on the following types of anomalies for each pipeline stage:
1.  **Sudden Change:** A significant increase or decrease in total amount from one day to the next that is unusual compared to the typical daily fluctuation.
2.  **Stagnation:** A period where a stage's total amount remains unchanged for an unusually long time, suggesting a lack of activity.
3.  **Significant Growth:** A period of sustained, rapid growth that may be noteworthy.
4.  **Unusual Drop:** A substantial decrease in value, especially near the end of the analysis period.

For each anomaly you identify, provide its specific date (in YYYY-MM-DD format), a clear description, its type, the stage it occurred in, and a severity rating (Low, Medium, High). Be specific in your descriptions, mentioning dates and amounts to support your findings. If no significant anomalies are found, return an empty array.

Focus on providing actionable and clear insights.

Daily Snapshots:
{{{json dailySnapshots}}}
`,
});

const anomalyDetectionFlow = ai.defineFlow(
  {
    name: 'anomalyDetectionFlow',
    inputSchema: AnomalyDetectionInputSchema,
    outputSchema: AnomalyDetectionOutputSchema,
  },
  async (input) => {
    if (input.dailySnapshots.length < 2) {
      return { anomalies: [] };
    }
    const { output } = await prompt(input);
    if (output?.anomalies) {
        // Sort anomalies by date, most recent first
        output.anomalies.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return output || { anomalies: [] };
  }
);
