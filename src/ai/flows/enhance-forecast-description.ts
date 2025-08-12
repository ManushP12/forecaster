'use server';

/**
 * @fileOverview Generates a description of the forecast using GenAI.
 *
 * - enhanceForecastDescription - A function that generates a forecast description.
 * - EnhanceForecastDescriptionInput - The input type for the enhanceForecastDescription function.
 * - EnhanceForecastDescriptionOutput - The return type for the enhanceForecastDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EnhanceForecastDescriptionInputSchema = z.object({
  dataSummary: z.string().describe('Summary of the original data.'),
  forecastSummary: z.string().describe('Summary of the forecast data.'),
  keyMetrics: z.string().describe('Key metrics from the forecast.'),
  modelType: z.string().describe('The model used to generate the forecast.'),
});
export type EnhanceForecastDescriptionInput = z.infer<
  typeof EnhanceForecastDescriptionInputSchema
>;

const EnhanceForecastDescriptionOutputSchema = z.object({
  forecastDescription: z.string().describe('A detailed description of the forecast.'),
});
export type EnhanceForecastDescriptionOutput = z.infer<
  typeof EnhanceForecastDescriptionOutputSchema
>;

export async function enhanceForecastDescription(
  input: EnhanceForecastDescriptionInput
): Promise<EnhanceForecastDescriptionOutput> {
  return enhanceForecastDescriptionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enhanceForecastDescriptionPrompt',
  input: {schema: EnhanceForecastDescriptionInputSchema},
  output: {schema: EnhanceForecastDescriptionOutputSchema},
  prompt: `You are an expert business analyst specializing in pipeline forecasting.

You will use the information provided to generate a description of the forecast, highlighting key trends and potential outcomes.

Data Summary: {{{dataSummary}}}
Forecast Summary: {{{forecastSummary}}}
Key Metrics: {{{keyMetrics}}}
Model Type: {{{modelType}}}

Based on this information, generate a detailed description of the forecast. Focus on the implications of the forecast for the business.`,
});

const enhanceForecastDescriptionFlow = ai.defineFlow(
  {
    name: 'enhanceForecastDescriptionFlow',
    inputSchema: EnhanceForecastDescriptionInputSchema,
    outputSchema: EnhanceForecastDescriptionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
