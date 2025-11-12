import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { StopCircle, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { createApiClient } from '../Api';
import { useAuthenticatedApi } from '../hooks/useAuthenticatedApi';
import { useState } from 'react';

export default function TeleprompterActive() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const { getHeaders } = useAuthenticatedApi();
  const api = createApiClient(getHeaders);

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await api.stopTeleprompter();
      navigate('/');
    } catch (error) {
      console.error('Error stopping teleprompter:', error);
      toast.error('Failed to stop teleprompter');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
      {/* Header */}
      <header className="p-6 pb-4 flex justify-center">
        <h1 className="text-2xl font-bold text-white">Teleprompter</h1>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full text-center space-y-8">
          {/* Status Indicator */}
          <div className="space-y-6">
            <div className="relative inline-flex">
              <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center animate-pulse">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                  <div className="w-8 h-8 bg-white rounded-full"></div>
                </div>
              </div>
            </div>
            
            <h2 className="text-3xl font-bold text-white">
              Teleprompting in Progress
            </h2>
            
            <p className="text-lg text-slate-300">
              Your script is being displayed on the smart glasses
            </p>
          </div>

          {/* Info Text */}
          <div className="pt-4 text-sm text-slate-400 space-y-2">
            <p>• Stop: Ends the current teleprompting session</p>
          </div>
        </div>
      </main>

      {/* Action Bar (Footer) */}
      <footer className="p-6 pt-4 border-t border-slate-700/50 bg-slate-900/50 backdrop-blur">
        <div className="max-w-4xl mx-auto flex gap-4">
          <Button
            onClick={handleStop}
            disabled={isLoading}
            className="flex-1 h-14 text-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <StopCircle className="w-5 h-5 mr-2" />
            {isLoading ? 'Stopping...' : 'Stop'}
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