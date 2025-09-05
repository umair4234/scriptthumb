
import React from 'react';
import Button from './Button';
import { GenerationStatus } from '../types';

interface GenerationControlsProps {
  status: GenerationStatus;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  currentTask: string;
  progress: {
    wordsWritten: number;
    totalWords: number;
  };
}

const GenerationControls: React.FC<GenerationControlsProps> = ({ status, onPause, onResume, onStop, currentTask, progress }) => {
  if (status === GenerationStatus.IDLE || status === GenerationStatus.DONE) return null;

  const { wordsWritten, totalWords } = progress;
  const percentage = totalWords > 0 ? Math.min(100, Math.round((wordsWritten / totalWords) * 100)) : 0;

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-4 w-full max-w-sm z-50">
      <p className="text-lg font-semibold text-indigo-400 mb-2">Script Generation In Progress</p>
      
      <div className="my-3">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm font-medium text-gray-300">{currentTask}</span>
          <span className="text-sm font-medium text-gray-400">{wordsWritten} / {totalWords} words</span>
        </div>
        <div className="w-full bg-gray-600 rounded-full h-2.5">
          <div 
            className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${percentage}%` }}
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Script generation progress"
          ></div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        {status === GenerationStatus.RUNNING && (
          <Button onClick={onPause} variant="secondary" className="w-full">Pause</Button>
        )}
        {status === GenerationStatus.PAUSED && (
          <Button onClick={onResume} variant="primary" className="w-full">Resume</Button>
        )}
        <Button onClick={onStop} variant="secondary" className="w-full bg-red-800 hover:bg-red-700 focus:ring-red-600">Stop</Button>
      </div>
    </div>
  );
};

export default GenerationControls;