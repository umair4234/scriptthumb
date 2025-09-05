
import React, { useState } from 'react';
import Button from './Button';

interface PasswordProtectionProps {
  onAuthenticate: (isAuthenticated: boolean) => void;
}

// The correct password in plaintext.
const CORRECT_PASSWORD = 'UmairGpt';

const PasswordProtection: React.FC<PasswordProtectionProps> = ({ onAuthenticate }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Simple string comparison for the password.
    if (password.trim() === CORRECT_PASSWORD) {
      onAuthenticate(true);
    } else {
      setError('Incorrect password. Please try again.');
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center z-50">
      <div className="w-full max-w-sm p-8 bg-gray-800 rounded-lg shadow-2xl text-center">
        <h1 className="text-2xl font-bold text-indigo-400 mb-2">Access Required</h1>
        <p className="text-gray-400 mb-6">Please enter the password to continue.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 text-center text-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            placeholder="Password"
            autoFocus
            aria-label="Password"
          />
          <Button type="submit" disabled={!password} className="w-full">
            Unlock
          </Button>
        </form>
        {error && <p className="mt-4 text-red-400">{error}</p>}
      </div>
    </div>
  );
};

export default PasswordProtection;
