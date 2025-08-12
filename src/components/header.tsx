
import { Bot, Upload, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";

type HeaderProps = {
  onProcessRequest: (content: string) => void;
};

export default function Header({ onProcessRequest }: HeaderProps) {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === 'string') {
          onProcessRequest(text);
        }
      };
      reader.readAsText(file);
    }
    // Reset file input to allow re-uploading the same file
    event.target.value = '';
  };
  
  const handleUploadClick = () => {
    document.getElementById('csv-upload-input')?.click();
  };

  const handleUseMockData = async () => {
    try {
      const response = await fetch('/mock-data.csv');
      const text = await response.text();
      onProcessRequest(text);
    } catch (error) {
      console.error('Error fetching mock data:', error);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
        <nav className="flex w-full flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold font-headline text-primary">PinePredictions</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              id="csv-upload-input"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button onClick={handleUploadClick} variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Upload CSV
            </Button>
            <Button onClick={handleUseMockData}>
              <TestTube2 className="mr-2 h-4 w-4" />
              Use Mock Data
            </Button>
          </div>
        </nav>
      </header>
    </>
  );
}
