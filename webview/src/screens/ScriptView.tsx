import { useState, useEffect, useRef, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Settings, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { createApiClient } from '../Api';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';
import * as mammoth from 'mammoth';

const STORAGE_KEY = 'teleprompter_script';

export default function ScriptView() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scriptText, setScriptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { getHeaders } = useAuthenticatedApi();
  const api = createApiClient(getHeaders);


  // Load saved script from localStorage on mount
  useEffect(() => {
    const savedScript = localStorage.getItem(STORAGE_KEY);
    if (savedScript) {
      setScriptText(savedScript);
    }
  }, []);

  // Save script to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, scriptText);
  }, [scriptText]);

  const handleStartTeleprompter = async () => {
    if (!scriptText.trim()) {
      toast.error('Please enter some text before starting the teleprompter');
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.startTeleprompter(scriptText);
      
      if (response.success) {
        // Navigate to the active teleprompter screen
        navigate('/active');
      } else {
        toast.error(response.message || 'Failed to start teleprompter');
      }
    } catch (error) {
      console.error('Error starting teleprompter:', error);
      toast.error('Failed to start teleprompter. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingsClick = () => {
    // Save current script before navigating
    localStorage.setItem(STORAGE_KEY, scriptText);
    navigate('/settings');
  };

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    const fileExtension = file.name.toLowerCase().split('.').pop();
    
    if (!['txt', 'docx'].includes(fileExtension || '')) {
      toast.error('Please select a .txt or .docx file');
      return;
    }

    try {
      let extractedText = '';

      if (fileExtension === 'txt') {
        // Handle .txt files
        extractedText = await file.text();
      } else if (fileExtension === 'docx') {
        // Handle .docx files using mammoth
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      }

      if (extractedText.trim()) {
        setScriptText(extractedText);
        toast.success(`Successfully loaded ${file.name}`);
      } else {
        toast.error('No text content found in the file');
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to read file. Please try again.');
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset the input value so the same file can be selected again
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(event.dataTransfer.files);
    const file = files[0];
    
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
      {/* Header */}
      <header className="p-6 pb-4 flex justify-center">
        <h1 className="text-2xl font-bold text-white">Teleprompter</h1>
      </header>

      {/* Main Content - Text Area */}
      <main className="flex-1 px-6 pb-6 flex flex-col">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.docx"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Text Area with Drag and Drop */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex-1 ${
            isDragOver
              ? 'bg-blue-900/20 border-2 border-dashed border-blue-500 rounded-lg'
              : ''
          }`}
        >
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-blue-900/10 border-2 border-dashed border-blue-500 rounded-lg z-10">
              <div className="text-center text-blue-300">
                <Upload className="w-8 h-8 mx-auto mb-2" />
                <p className="text-lg font-medium">Drop your file here</p>
                <p className="text-sm">.txt or .docx files supported</p>
              </div>
            </div>
          )}
          <Textarea
            placeholder="Enter or paste your script here... You can also drag and drop .txt or .docx files here."
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            className="h-[500px] overflow-y-auto bg-slate-800/50 border-slate-700 text-white text-lg placeholder:text-slate-400 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur"
          />
        </div>
      </main>

      {/* Action Bar (Footer) */}
      <footer className="p-6 pt-4 border-t border-slate-700/50 bg-slate-900/50 backdrop-blur">
        <div className="max-w-4xl mx-auto flex gap-4">
          <Button
            onClick={handleStartTeleprompter}
            disabled={isLoading || !scriptText.trim()}
            className="flex-1 h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Starting...' : 'Start Teleprompter'}
          </Button>
          <Button
            onClick={handleUploadClick}
            variant="outline"
            className="h-14 px-6 bg-slate-800/50 border-slate-600 text-white hover:bg-slate-700 hover:text-white"
          >
            <Upload className="w-5 h-5 mr-2" />
            Upload File
          </Button>
          <Button
            onClick={handleSettingsClick}
            variant="outline"
            className="h-14 px-6 bg-slate-800/50 border-slate-600 text-white hover:bg-slate-700 hover:text-white"
          >
            <Settings className="w-5 h-5 mr-2" />
            Settings
          </Button>
        </div>
      </footer>
    </div>
  );
}