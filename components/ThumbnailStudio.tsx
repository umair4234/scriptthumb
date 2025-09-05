import React, { useState, useCallback, useMemo } from 'react';
import { ScriptJob, ThumbnailStyle } from '../types';
import { analyzeImageStyle, generateInitialThumbnail, editThumbnail } from '../services/geminiService';
import { useLocalStorage } from '../hooks/useLocalStorage';
import Button from './Button';
import XIcon from './XIcon';
import InlineLoader from './InlineLoader';

interface ThumbnailStudioProps {
  isOpen: boolean;
  onClose: () => void;
  scriptJob: ScriptJob;
}

type StudioStep = 'STYLE_SELECTION' | 'STYLE_CREATION' | 'GENERATION';

const fileToGenerativePart = async (file: File) => {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
  return {
    mimeType: file.type,
    data: base64,
  };
};

const ThumbnailStudio: React.FC<ThumbnailStudioProps> = ({ isOpen, onClose, scriptJob }) => {
  const [styles, setStyles] = useLocalStorage<ThumbnailStyle[]>('thumbnail_styles', []);
  const [step, setStep] = useState<StudioStep>('STYLE_SELECTION');
  const [selectedStyle, setSelectedStyle] = useState<ThumbnailStyle | null>(null);
  
  // Style creation state
  const [styleImages, setStyleImages] = useState<File[]>([]);
  const [styleName, setStyleName] = useState('');
  const [analyzedStyle, setAnalyzedStyle] = useState<Omit<ThumbnailStyle, 'id' | 'name'> | null>(null);

  // Generation state
  const [generatedImage, setGeneratedImage] = useState<{mimeType: string, data: string} | null>(null);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  
  // Global state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hookPrompt = useMemo(() => {
    if (!scriptJob.hook) return "A dramatic moment from the story.";
    // Simple extraction of the core action from the hook
    return scriptJob.hook.split('.')[0] + '.';
  }, [scriptJob.hook]);
  
  if (!isOpen) return null;

  const handleClose = () => {
    // Reset state on close
    setStep('STYLE_SELECTION');
    setSelectedStyle(null);
    setStyleImages([]);
    setStyleName('');
    setAnalyzedStyle(null);
    setGeneratedImage(null);
    setGenerationPrompt('');
    setEditInstruction('');
    setError(null);
    setIsLoading(false);
    onClose();
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).slice(0, 5);
      setStyleImages(files);
    }
  };

  const handleAnalyzeStyle = async () => {
    if (styleImages.length === 0) {
      setError("Please upload at least one sample image.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setLoadingMessage("Analyzing image styles with Gemini Vision...");
    try {
      const imageParts = await Promise.all(styleImages.map(fileToGenerativePart));
      const result = await analyzeImageStyle(imageParts);
      setAnalyzedStyle(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze style.");
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveStyle = () => {
    if (!styleName || !analyzedStyle) {
        setError("Please provide a name for the style.");
        return;
    }
    const newStyle: ThumbnailStyle = {
        id: `style_${Date.now()}`,
        name: styleName,
        ...analyzedStyle
    };
    setStyles(prev => [...prev, newStyle]);
    setStyleName('');
    setAnalyzedStyle(null);
    setStyleImages([]);
    setStep('STYLE_SELECTION');
  }

  const handleSelectStyle = (style: ThumbnailStyle) => {
    setSelectedStyle(style);
    setGenerationPrompt(hookPrompt);
    setStep('GENERATION');
  }
  
  const handleDeleteStyle = (styleId: string) => {
    if (confirm("Are you sure you want to delete this style?")) {
        setStyles(styles.filter(s => s.id !== styleId));
    }
  }
  
  const handleGenerate = async () => {
    if (!selectedStyle || !generationPrompt) return;
    setError(null);
    setIsLoading(true);
    setGeneratedImage(null);
    setLoadingMessage("Generating initial thumbnail concept...");
    try {
      const imageData = await generateInitialThumbnail(generationPrompt, selectedStyle);
      setGeneratedImage({ mimeType: 'image/jpeg', data: imageData });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate thumbnail.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleEdit = async () => {
    if (!selectedStyle || !generatedImage || !editInstruction) return;
    setError(null);
    setIsLoading(true);
    setLoadingMessage("Applying your edits with Nano Banana...");
    try {
        const editedImageData = await editThumbnail(generatedImage.data, generatedImage.mimeType, editInstruction, selectedStyle);
        setGeneratedImage({ mimeType: 'image/png', data: editedImageData }); // Nano Banana often returns PNG
        setEditInstruction('');
    } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to edit thumbnail.");
    } finally {
        setIsLoading(false);
    }
  }
  
  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = `data:${generatedImage.mimeType};base64,${generatedImage.data}`;
    link.download = `${scriptJob.refinedTitle.replace(/\s/g, '_')}_thumbnail.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="fixed inset-0 bg-gray-950 bg-opacity-90 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-indigo-400">Thumbnail Studio</h2>
          <button onClick={handleClose} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
            <XIcon />
          </button>
        </header>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-4" role="alert">
              <span className="block sm:inline">{error}</span>
              <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3 text-2xl">&times;</button>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-10">
              <InlineLoader message={loadingMessage} />
              <p className="text-sm text-gray-400 mt-4 text-center">This may take a moment, especially for image generation. Please be patient.</p>
            </div>
          ) : (
            <>
              {step === 'STYLE_SELECTION' && (
                 <div>
                    <h3 className="text-lg font-semibold mb-4">1. Select or Create a Style Profile</h3>
                    <div className="space-y-3 mb-6 max-h-60 overflow-y-auto p-1">
                        {styles.map(style => (
                            <div key={style.id} className="bg-gray-700 p-3 rounded-md flex justify-between items-center">
                                <span className="font-semibold">{style.name}</span>
                                <div className="flex gap-2">
                                    <Button onClick={() => handleSelectStyle(style)}>Select</Button>
                                    <Button onClick={() => handleDeleteStyle(style.id)} variant="secondary" className="px-3 py-1 bg-red-800 hover:bg-red-700">&times;</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {styles.length === 0 && <p className="text-center text-gray-400 py-4">No styles found. Create one to get started!</p>}
                    <Button onClick={() => setStep('STYLE_CREATION')} variant="secondary">Create New Style</Button>
                </div>
              )}

              {step === 'STYLE_CREATION' && (
                <div>
                  <Button onClick={() => setStep('STYLE_SELECTION')} variant="secondary" className="mb-4">&larr; Back to Styles</Button>
                  <h3 className="text-lg font-semibold mb-2">Create New Style Profile</h3>
                  <p className="text-sm text-gray-400 mb-4">Upload up to 5 sample thumbnails to analyze and create a new reusable style.</p>
                  
                  <div className="p-4 border-2 border-dashed border-gray-600 rounded-lg text-center mb-4">
                    <input type="file" id="style-images" multiple accept="image/*" onChange={handleFileChange} className="hidden" />
                    <label htmlFor="style-images" className="cursor-pointer text-indigo-400 hover:text-indigo-300 font-semibold">
                      {styleImages.length > 0 ? `${styleImages.length} image(s) selected` : 'Choose Images'}
                    </label>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB each</p>
                  </div>
                  
                  {styleImages.length > 0 && !analyzedStyle && (
                    <Button onClick={handleAnalyzeStyle}>Analyze Style</Button>
                  )}

                  {analyzedStyle && (
                    <div className="mt-4 animate-fade-in">
                        <h4 className="font-semibold text-green-400">Analysis Complete!</h4>
                        <div className="bg-gray-900 p-4 rounded-md my-4 max-h-60 overflow-y-auto">
                          <h5 className="font-bold mb-2">Master Prompt:</h5>
                          <p className="text-sm text-gray-300 mb-4">{analyzedStyle.masterPrompt}</p>
                          <h5 className="font-bold mb-2">Analysis Details:</h5>
                          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(analyzedStyle.analysis, null, 2)}</pre>
                        </div>
                        <div className="flex gap-2">
                           <input type="text" value={styleName} onChange={e => setStyleName(e.target.value)} placeholder="Enter a name for this style" className="flex-grow bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                           <Button onClick={handleSaveStyle}>Save Style</Button>
                        </div>
                    </div>
                  )}
                </div>
              )}

              {step === 'GENERATION' && selectedStyle && (
                <div>
                   <Button onClick={() => { setStep('STYLE_SELECTION'); setSelectedStyle(null); }} variant="secondary" className="mb-4">&larr; Change Style</Button>
                   <p className="text-sm mb-4">Using style: <span className="font-bold text-indigo-400">{selectedStyle.name}</span></p>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Panel: Controls */}
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-1">Scene Prompt</label>
                          <textarea id="prompt" rows={4} value={generationPrompt} onChange={e => setGenerationPrompt(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          <Button onClick={handleGenerate} className="mt-2 w-full">Generate</Button>
                        </div>
                        
                        {generatedImage && (
                          <div className="border-t border-gray-700 pt-4">
                             <label htmlFor="instruction" className="block text-sm font-medium text-gray-300 mb-1">Refine Image</label>
                             <textarea id="instruction" rows={3} value={editInstruction} onChange={e => setEditInstruction(e.target.value)} placeholder="e.g., 'Make his expression angrier' or 'Add rain in the background'" className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                             <Button onClick={handleEdit} className="mt-2 w-full" variant="secondary">Apply Edit</Button>
                          </div>
                        )}
                      </div>

                      {/* Right Panel: Preview */}
                      <div className="flex flex-col items-center justify-center bg-gray-900 rounded-md aspect-video">
                          {generatedImage ? (
                            <img src={`data:${generatedImage.mimeType};base64,${generatedImage.data}`} alt="Generated Thumbnail" className="object-contain w-full h-full rounded-md" />
                          ) : (
                            <p className="text-gray-500">Preview will appear here</p>
                          )}
                      </div>
                   </div>
                   {generatedImage && (
                    <div className="mt-6 text-center">
                        <Button onClick={handleDownload} className="bg-green-600 hover:bg-green-500 focus:ring-green-500">Download Thumbnail (1280x720)</Button>
                    </div>
                   )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ThumbnailStudio;
