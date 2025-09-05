import React from 'react';

const InlineLoader: React.FC<{ message: string }> = ({ message }) => {
  return (
    <div className="flex items-center justify-center p-4 bg-gray-700/50 rounded-md">
      <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-indigo-400 mr-3"></div>
      <p className="text-gray-300 text-sm">{message}</p>
    </div>
  );
};

export default InlineLoader;
