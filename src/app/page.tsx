
'use client';

import { useState } from 'react';
import Header from '@/components/header';
import { NewMathForecaster } from '@/components/new-math-forecaster';

export default function Home() {
  const [csvData, setCsvData] = useState<string | null>(null);

  const handleProcessingRequest = (content: string) => {
    setCsvData(content);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header onProcessRequest={handleProcessingRequest} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {csvData ? (
          <NewMathForecaster csvData={csvData} />
        ) : (
           <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
                <p className="text-muted-foreground">Upload a CSV file or use the mock data to begin your pipeline analysis.</p>
            </div>
        )}
      </main>
    </div>
  );
}
