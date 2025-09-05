import React, { useState } from 'react';
import Button from './Button';

interface ApiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: string[];
  setApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
}

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ isOpen, onClose, apiKeys, setApiKeys }) => {
  const [newApiKey, setNewApiKey] = useState('');

  if (!isOpen) return null;

  const handleAddKey = () => {
    const trimmedKey = newApiKey.trim();
    if (trimmedKey && !apiKeys.includes(trimmedKey)) {
      setApiKeys([...apiKeys, trimmedKey]);
      setNewApiKey('');
    }
  };

  const handleDeleteKey = (keyToDelete: string) => {
    setApiKeys(apiKeys.filter(key => key !== keyToDelete));
  };
  
  const maskApiKey = (key: string): string => {
      if (key.length < 8) return '...';
      return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  }

  return (
    <div 
      className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apiKeyManagerTitle"
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-lg relative text-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="apiKeyManagerTitle" className="text-2xl font-bold text-indigo-400 mb-4">API Key Manager</h2>
        <p className="text-gray-400 mb-6">Add one or more Gemini API keys. The app will automatically rotate between them if one reaches its rate limit.</p>
        
        <div className="flex gap-2 mb-6">
          <input
            type="password"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            className="flex-grow bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="Enter new Gemini API key"
            aria-label="New API Key"
          />
          <Button onClick={handleAddKey} disabled={!newApiKey.trim()}>Add Key</Button>
        </div>

        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
          {apiKeys.length > 0 ? apiKeys.map((key, index) => (
            <div key={index} className="flex items-center justify-between bg-gray-700 p-3 rounded-md">
              <span className="font-mono text-gray-300">{maskApiKey(key)}</span>
              <button 
                onClick={() => handleDeleteKey(key)}
                className="text-red-400 hover:text-red-300 font-semibold"
                aria-label={`Delete key ending in ${key.substring(key.length - 4)}`}
              >
                Delete
              </button>
            </div>
          )) : (
            <p className="text-gray-500 text-center py-4">No API keys added yet.</p>
          )}
        </div>

        <div className="mt-6 text-right">
            <Button onClick={onClose} variant="secondary">Close</Button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyManager;