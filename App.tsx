

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ChapterOutline, AppStep, GenerationStatus, AppView, ScriptJob, AutomationJobStatus, LibraryStatus } from './types';
import { generateOutlines, generateHook, generateChapterBatch } from './services/geminiService';
import Button from './components/Button';
import InlineLoader from './components/InlineLoader';
import GenerationControls from './components/GenerationControls';
import PasswordProtection from './components/PasswordProtection';
import ApiKeyManager from './components/ApiKeyManager';
import GearIcon from './components/GearIcon';
import ThumbnailStudio from './components/ThumbnailStudio';
import { useLocalStorage } from './hooks/useLocalStorage';


const App: React.FC = () => {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isAuthenticated') === 'true');

  // --- Global State ---
  const [view, setView] = useState<AppView>('AUTOMATION');
  const [error, setError] = useState<string | null>(null);
  
  // --- API Key Management ---
  const [apiKeys, setApiKeys] = useLocalStorage<string[]>('gemini_api_keys', []);
  const [isApiManagerOpen, setIsApiManagerOpen] = useState(false);

  // --- Automation & Library State ---
  const [jobs, setJobs] = useLocalStorage<ScriptJob[]>('automation_jobs', []);
  const [automationStatus, setAutomationStatus] = useState<'IDLE' | 'RUNNING' | 'PAUSED'>('IDLE');
  const automationStatusRef = useRef(automationStatus);
  const jobsRef = useRef(jobs);
  const [automationTitle, setAutomationTitle] = useState('');
  const [automationConcept, setAutomationConcept] = useState('');
  const [automationDuration, setAutomationDuration] = useState(40);
  const [selectedJobToView, setSelectedJobToView] = useState<ScriptJob | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // --- Thumbnail Studio State ---
  const [isThumbnailStudioOpen, setIsThumbnailStudioOpen] = useState(false);
  const [jobForThumbnail, setJobForThumbnail] = useState<ScriptJob | null>(null);

  // --- Manual Generation State ---
  const [manualStep, setManualStep] = useState<AppStep>(AppStep.INITIAL);
  const [manualTitle, setManualTitle] = useState('');
  const [manualConcept, setManualConcept] = useState('');
  const [manualDuration, setManualDuration] = useState(40);
  const [manualScriptData, setManualScriptData] = useState<Partial<ScriptJob>>({});

  // --- One-click Flow State ---
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [currentTask, setCurrentTask] = useState('');
  const [writingChapterIds, setWritingChapterIds] = useState<number[]>([]);
  const [progress, setProgress] = useState({ wordsWritten: 0, totalWords: 0 });
  const isStoppedRef = useRef(false);
  const isPausedRef = useRef(false);
  
  useEffect(() => {
    automationStatusRef.current = automationStatus;
  }, [automationStatus]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  
  const jobToDisplay = selectedJobToView || manualScriptData;

  const totalWords = useMemo(() => {
    const outlines = jobToDisplay?.outlines || [];
    const chapterWords = outlines
        .filter(o => o.id > 0)
        .reduce((sum, ch) => sum + ch.wordCount, 0);
    return chapterWords > 0 ? chapterWords + 150 : 0;
  }, [jobToDisplay]);

  useEffect(() => {
    const countWords = (str: string) => str?.split(/\s+/).filter(Boolean).length || 0;
    
    const hookWords = countWords(jobToDisplay?.hook || '');
    const chapterWords = (jobToDisplay?.chaptersContent || []).reduce((sum, content) => sum + countWords(content), 0);
    
    setProgress({
        wordsWritten: hookWords + chapterWords,
        totalWords: totalWords,
    });
  }, [jobToDisplay, totalWords]);

  const handleAuthentication = (status: boolean) => {
    if (status) {
      sessionStorage.setItem('isAuthenticated', 'true');
      setIsAuthenticated(true);
    }
  };

  const parseOutlineResponse = useCallback((text: string): { refinedTitle: string; outlines: ChapterOutline[] } => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const titleLine = lines.find(line => line.toLowerCase().startsWith('title:'));
    const parsedRefinedTitle = titleLine ? titleLine.replace(/title:/i, '').trim() : 'Untitled Story';

    const parsedOutlines: ChapterOutline[] = [];
    const chapterBlocks = text.split(/(?=^Chapter \d+:)/m);

    for (const block of chapterBlocks) {
        if (!block.trim().startsWith('Chapter')) continue;
        const idMatch = block.match(/^Chapter (\d+):/m);
        const titleMatch = block.match(/^Chapter \d+: (.*?)$/m);
        const wordCountMatch = block.match(/^\(Word Count: (\d+) words\)$/m);
        const conceptMatch = block.match(/Concept: ([\s\S]*)/m);

        if (idMatch && titleMatch) {
            const id = parseInt(idMatch[1], 10);
            const chapterTitle = titleMatch[1].trim();
            if (id === 0) {
                parsedOutlines.push({ id: 0, title: "The Hook", wordCount: 0, concept: block.replace(/^Chapter \d+: .*?\n/m, '').trim() });
            } else if (wordCountMatch && conceptMatch) {
                parsedOutlines.push({ id, title: chapterTitle, wordCount: parseInt(wordCountMatch[1], 10), concept: conceptMatch[1].trim().split('\n')[0] });
            }
        }
    }
    return { refinedTitle: parsedRefinedTitle, outlines: parsedOutlines };
  }, []);

  const resetManualState = () => {
    setManualStep(AppStep.INITIAL);
    setManualScriptData({});
    setGenerationStatus(GenerationStatus.IDLE);
    setCurrentTask('');
    setProgress({ wordsWritten: 0, totalWords: 0 });
    isStoppedRef.current = false;
    isPausedRef.current = false;
  }

  // --- CENTRALIZED SCRIPT GENERATION LOGIC ---
  const runGenerationProcess = async (
    title: string, 
    concept: string, 
    duration: number, 
    onProgress: (update: Partial<ScriptJob>) => void
  ) => {
    isStoppedRef.current = false;
    isPausedRef.current = false;
    setGenerationStatus(GenerationStatus.RUNNING);

    try {
      setCurrentTask('Generating story outline...');
      const outlineText = await generateOutlines(title, concept, duration);
      if (isStoppedRef.current) throw new Error("Stopped by user.");
      
      const { refinedTitle, outlines } = parseOutlineResponse(outlineText);
      if (outlines.length === 0) throw new Error("Failed to generate a valid outline.");
      
      const initialData = { rawOutlineText: outlineText, refinedTitle, outlines, chaptersContent: new Array(outlines.length + 1).fill('') };
      onProgress(initialData);

      setCurrentTask('Crafting the perfect hook...');
      const generatedHook = await generateHook(outlineText);
      if (isStoppedRef.current) throw new Error("Stopped by user.");
      onProgress({ hook: generatedHook });

      const chaptersToWrite = outlines.filter(o => o.id > 0);
      const batchSize = 3;

      for (let i = 0; i < chaptersToWrite.length; i += batchSize) {
        const batch = chaptersToWrite.slice(i, i + batchSize);
        while (isPausedRef.current) await new Promise(resolve => setTimeout(resolve, 500));
        if (isStoppedRef.current) throw new Error("Stopped by user.");

        const chapterIds = batch.map(c => c.id);
        setCurrentTask(`Writing Chapter${chapterIds.length > 1 ? 's' : ''} ${chapterIds.join(', ')}...`);
        setWritingChapterIds(chapterIds);
        
        const contentArray = await generateChapterBatch(outlineText, batch);
        if (isStoppedRef.current) { setWritingChapterIds([]); throw new Error("Stopped by user."); };

        // FIX: The `onProgress` handler expects `chaptersContent` to be `string[]` based on `Partial<ScriptJob>`,
        // but we are passing an updater function. Casting the function to `any` resolves the type mismatch.
        // The state update logic is designed to handle this function correctly.
        onProgress({
          chaptersContent: ((currentContent: string[] | undefined) => {
            const newContent = [...(currentContent || [])];
            batch.forEach((chapter, index) => {
                if (contentArray[index]) newContent[chapter.id] = contentArray[index];
            });
            return newContent;
          }) as any
        });

        setWritingChapterIds([]);
      }
      setGenerationStatus(GenerationStatus.DONE);
      setCurrentTask('Script generation complete!');

    } catch (e) {
      setGenerationStatus(GenerationStatus.IDLE);
      setCurrentTask('Error!');
      throw e; // Re-throw to be caught by the caller
    }
  };

  const handleGenerateFullScript = async () => {
     if (!manualTitle || !manualConcept) {
      setError("Please provide a title and concept.");
      return;
    }
    if (apiKeys.length === 0) {
      setError("No Gemini API keys found. Please add a key in the API Manager.");
      setIsApiManagerOpen(true);
      return;
    }
    setError(null);
    resetManualState();
    setSelectedJobToView(null);

    const onManualProgress = (update: Partial<ScriptJob>) => {
      setManualScriptData(prev => {
        // FIX: This expression is not callable because TypeScript infers `update.chaptersContent`
        // as `never` inside a `typeof... === 'function'` check, since its type is `string[] | undefined`.
        // Casting to `any` allows the function call to proceed, which is correct at runtime.
        const newChapters = typeof update.chaptersContent === 'function'
          ? (update.chaptersContent as any)(prev.chaptersContent)
          : update.chaptersContent;
    
        return {
          ...prev,
          ...update,
          ...(newChapters && { chaptersContent: newChapters }),
        };
      });
    };

    try {
      await runGenerationProcess(manualTitle, manualConcept, manualDuration, onManualProgress);
      
      // Post-process after success
      setManualStep(AppStep.HOOK_GENERATED); // To ensure UI shows results
      
      // Need to get the final state of manualScriptData
      setManualScriptData(finalManualData => {
        const countWords = (str: string) => str?.split(/\s+/).filter(Boolean).length || 0;
        const finalWordsWritten = countWords(finalManualData.hook || '') + (finalManualData.chaptersContent || []).reduce((sum, content) => sum + countWords(content), 0);
        const targetTotalWords = (finalManualData.outlines || []).filter(o => o.id > 0).reduce((sum, ch) => sum + ch.wordCount, 0) + 150;

        const newJob: ScriptJob = {
          id: `job_${Date.now()}`,
          source: 'MANUAL',
          title: manualTitle,
          concept: manualConcept,
          duration: manualDuration,
          status: 'DONE',
          createdAt: Date.now(),
          rawOutlineText: finalManualData.rawOutlineText || '',
          refinedTitle: finalManualData.refinedTitle || '',
          outlines: finalManualData.outlines || [],
          hook: finalManualData.hook || '',
          chaptersContent: finalManualData.chaptersContent || [],
          wordsWritten: finalWordsWritten,
          totalWords: targetTotalWords,
          currentTask: 'Completed!',
          libraryStatus: 'AVAILABLE',
        };
        setJobs(prev => [...prev, newJob]);
        setSelectedJobToView(newJob);
        return finalManualData;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unknown error occurred during script generation.");
    }
  }

  // --- Automation Flow ---
  const handleAddToQueue = () => {
    if (!automationTitle || !automationConcept) {
      setError("Please provide a title and concept for the automation job.");
      return;
    }
    setError(null);
    const newJob: ScriptJob = {
      id: `job_${Date.now()}`,
      source: 'AUTOMATION',
      title: automationTitle,
      concept: automationConcept,
      duration: automationDuration,
      status: 'PENDING',
      createdAt: Date.now(),
      rawOutlineText: '',
      refinedTitle: '',
      outlines: [],
      hook: '',
      chaptersContent: [],
      wordsWritten: 0,
      totalWords: 0,
    };
    setJobs(prev => [...prev, newJob]);
    setAutomationTitle('');
    setAutomationConcept('');
    setAutomationDuration(40);
  };

  const handleAutomationControl = (control: 'RUN' | 'PAUSE' | 'STOP') => {
    if (control === 'RUN') {
        if (apiKeys.length === 0) {
            setError("Cannot run automation. No Gemini API keys found.");
            setIsApiManagerOpen(true);
            return;
        }
        const hasPending = jobs.some(j => j.source === 'AUTOMATION' && (j.status === 'PENDING' || j.status === 'FAILED'));
        if (!hasPending) {
            alert("No pending or failed jobs in the queue to run.");
            return;
        }
        setAutomationStatus('RUNNING');
        setError(null);
    } else if (control === 'PAUSE') {
        setAutomationStatus('PAUSED');
        isPausedRef.current = true;
    } else if (control === 'STOP') {
        setAutomationStatus('IDLE');
        isStoppedRef.current = true;
        isPausedRef.current = false;
        setGenerationStatus(GenerationStatus.IDLE);
        setJobs(prev => prev.map(j => j.status === 'RUNNING' ? {...j, status: 'FAILED', error: 'Stopped by user.', currentTask: 'Stopped'} : j));
    }
  };

  const deleteJob = (jobId: string) => {
    if (confirm('Are you sure you want to delete this script? This cannot be undone.')) {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        if (selectedJobToView?.id === jobId) {
          setSelectedJobToView(null);
        }
    }
  }
  
  const handleToggleArchiveStatus = (jobId: string) => {
    setJobs(prev => prev.map(job => {
        if (job.id === jobId) {
            return { ...job, libraryStatus: job.libraryStatus === 'ARCHIVED' ? 'AVAILABLE' : 'ARCHIVED' };
        }
        return job;
    }));
  };

  const retryJob = (jobId: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? {...j, status: 'PENDING', error: undefined } : j));
  }
  
  // New Automation Controller
  useEffect(() => {
    if (automationStatus !== 'RUNNING') return;

    let isCancelled = false;

    const startAutomationQueue = async () => {
      while (!isCancelled) {
        // Find the next job that needs processing
        const nextJob = jobsRef.current.find(j => j.source === 'AUTOMATION' && (j.status === 'PENDING' || j.status === 'FAILED'));

        if (!nextJob) {
          console.log("Automation queue finished.");
          setAutomationStatus('IDLE');
          break;
        }

        // Handle pause state
        while (automationStatusRef.current === 'PAUSED') {
          setJobs(prev => prev.map(j => j.id === nextJob.id ? { ...j, currentTask: 'Automation Paused...' } : j));
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Handle stop state
        if (automationStatusRef.current === 'IDLE') {
          console.log("Automation stopped by user.");
          break;
        }
        
        const updateJobState = (jobId: string, updates: Partial<ScriptJob> | ((prevJob: ScriptJob) => Partial<ScriptJob>)) => {
            setJobs(prevJobs => prevJobs.map(j => {
                if (j.id === jobId) {
                    const finalUpdates = typeof updates === 'function' ? updates(j) : updates;
                    return { ...j, ...finalUpdates };
                }
                return j;
            }));
        };

        const onJobProgress = (update: Partial<ScriptJob>) => {
            updateJobState(nextJob.id, (prevJob) => {
                // FIX: This expression is not callable because TypeScript infers `update.chaptersContent`
                // as `never` inside a `typeof... === 'function'` check, since its type is `string[] | undefined`.
                // Casting to `any` allows the function call to proceed, which is correct at runtime.
                const newChapters = typeof update.chaptersContent === 'function'
                    ? (update.chaptersContent as any)(prevJob.chaptersContent)
                    : update.chaptersContent;

                const newPartialJob: Partial<ScriptJob> = {
                    ...update,
                    ...(newChapters && { chaptersContent: newChapters }),
                };

                const countWords = (str: string) => str?.split(/\s+/).filter(Boolean).length || 0;
                const hookWords = countWords(newPartialJob.hook || prevJob.hook || '');
                const chapterWords = (newPartialJob.chaptersContent || prevJob.chaptersContent || []).reduce((sum, content) => sum + countWords(content), 0);
                
                return { ...newPartialJob, wordsWritten: hookWords + chapterWords };
            });
        };

        try {
            updateJobState(nextJob.id, { status: 'RUNNING', error: undefined });
            setSelectedJobToView(jobsRef.current.find(j => j.id === nextJob.id) || null);

            await runGenerationProcess(nextJob.title, nextJob.concept, nextJob.duration, onJobProgress);

            const finalWords = jobsRef.current.find(j => j.id === nextJob.id)?.wordsWritten || 0;
            const outlines = jobsRef.current.find(j => j.id === nextJob.id)?.outlines || [];
            const targetTotalWords = outlines.filter(o => o.id > 0).reduce((sum, ch) => sum + ch.wordCount, 0) + 150;
            
            updateJobState(nextJob.id, { status: 'DONE', currentTask: 'Completed!', libraryStatus: 'AVAILABLE', wordsWritten: finalWords, totalWords: targetTotalWords });

            // Cooldown period
            for (let i = 300; i > 0; i--) {
                if (automationStatusRef.current !== 'RUNNING') break;
                setCurrentTask(`Cooldown: Next job in ${i}s...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (automationStatusRef.current !== 'RUNNING') break;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            updateJobState(nextJob.id, { status: 'FAILED', error: errorMessage, currentTask: 'Error!' });
            // Don't cooldown after a failure, just move to the next.
        }
      }
    };
    
    startAutomationQueue();

    return () => { isCancelled = true; };
  }, [automationStatus]);


  const getStatusBadge = (status: AutomationJobStatus) => {
    const styles: Record<AutomationJobStatus, string> = {
        PENDING: 'bg-yellow-800 text-yellow-200',
        RUNNING: 'bg-blue-800 text-blue-200 animate-pulse',
        DONE: 'bg-green-800 text-green-200',
        FAILED: 'bg-red-800 text-red-200',
    }
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>{status}</span>
  }

  const copyToClipboard = (text: string, type: string) => {
    if (!text) {
      alert(`Nothing to copy for ${type}.`);
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => alert(`${type} copied to clipboard!`))
      .catch(err => alert(`Failed to copy ${type}.`));
  }
  
  const stripChapterHeading = (text: string): string => {
    if (!text) return '';
    return text.replace(/^Chapter\s+\d+:\s+.*?\n\n?/im, '').trim();
  };

  const handleCopyFullScript = () => {
    const scriptParts = [
      jobToDisplay?.hook,
      ...(jobToDisplay?.chaptersContent || []).slice(1).filter(Boolean).map(stripChapterHeading)
    ];
    copyToClipboard(scriptParts.join('\n\n'), "Full script");
  }

  const handleCopyHookAndChapter1 = () => {
    const scriptParts = [jobToDisplay?.hook, stripChapterHeading(jobToDisplay?.chaptersContent?.[1] || '')].filter(Boolean);
    copyToClipboard(scriptParts.join('\n\n'), "Hook and Chapter 1");
  }

  const handleCopyRestOfScript = () => {
    const scriptParts = (jobToDisplay?.chaptersContent || []).slice(2).filter(Boolean).map(stripChapterHeading);
    copyToClipboard(scriptParts.join('\n\n'), "Rest of script");
  }

  const handleOpenThumbnailStudio = () => {
    if (!jobToDisplay) return;
    setJobForThumbnail(jobToDisplay as ScriptJob);
    setIsThumbnailStudioOpen(true);
  }

  const isGenerating = generationStatus === GenerationStatus.RUNNING || generationStatus === GenerationStatus.PAUSED;
  const isScriptGenerated = (manualStep >= AppStep.HOOK_GENERATED && !isGenerating) || (selectedJobToView?.status === 'DONE');
  
  if (!isAuthenticated) {
    return <PasswordProtection onAuthenticate={handleAuthentication} />;
  }

  const automationJobs = jobs.filter(j => j.source === 'AUTOMATION');
  const libraryJobs = jobs
    .filter(j => j.status === 'DONE')
    .filter(j => showArchived ? j.libraryStatus === 'ARCHIVED' : j.libraryStatus !== 'ARCHIVED')
    .sort((a, b) => b.createdAt - a.createdAt);


  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans">
      <ApiKeyManager
        isOpen={isApiManagerOpen}
        onClose={() => setIsApiManagerOpen(false)}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
      <GenerationControls status={generationStatus} onPause={() => { isPausedRef.current = true; setGenerationStatus(GenerationStatus.PAUSED); }} onResume={() => { isPausedRef.current = false; setGenerationStatus(GenerationStatus.RUNNING); }} onStop={() => { isStoppedRef.current = true; isPausedRef.current = false; setGenerationStatus(GenerationStatus.DONE); }} currentTask={currentTask} progress={progress} />
      
      {isThumbnailStudioOpen && jobForThumbnail && (
        <ThumbnailStudio
          isOpen={isThumbnailStudioOpen}
          onClose={() => setIsThumbnailStudioOpen(false)}
          scriptJob={jobForThumbnail}
        />
      )}

      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-10 relative">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
            AI YouTube Scriptwriter
          </h1>
          <p className="mt-2 text-lg text-gray-400">Automate your viral revenge story script in minutes.</p>
           <button 
             onClick={() => setIsApiManagerOpen(true)}
             className="absolute top-0 right-0 p-2 text-gray-400 hover:text-white transition-colors duration-200"
             aria-label="Open API Key Manager"
           >
             <GearIcon />
           </button>
        </header>

        {!selectedJobToView && (
            <nav className="flex justify-center items-center gap-2 mb-8 p-2 bg-gray-800 rounded-lg">
                {(['MANUAL', 'AUTOMATION', 'LIBRARY'] as AppView[]).map(v => (
                    <button 
                        key={v}
                        onClick={() => { setView(v); setSelectedJobToView(null); }}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-200 w-full ${view === v ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                        {v.charAt(0) + v.slice(1).toLowerCase()}
                    </button>
                ))}
            </nav>
        )}

        {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-6" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
                <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                    <span className="text-2xl">&times;</span>
                </button>
            </div>
        )}
        
        {!selectedJobToView ? (
          <div className="bg-gray-800/50 p-6 rounded-lg shadow-lg mb-8">
            {view === 'MANUAL' && (
              <div>
                <h2 className="text-2xl font-bold mb-4 text-indigo-400">Manual Script Generator</h2>
                <div className="space-y-4">
                    <input type="text" value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="Video Title" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                    <textarea value={manualConcept} onChange={e => setManualConcept(e.target.value)} placeholder="Story Concept / Summary" rows={4} className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
                    <div className="flex items-center gap-4">
                      <label htmlFor="duration" className="font-medium">Video Duration (mins):</label>
                      <input type="number" id="duration" value={manualDuration} onChange={e => setManualDuration(Number(e.target.value))} className="w-24 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <Button onClick={handleGenerateFullScript} disabled={isGenerating}>
                      {isGenerating ? 'Generating...' : 'Generate Full Script'}
                    </Button>
                </div>
              </div>
            )}

            {view === 'AUTOMATION' && (
              <div>
                <h2 className="text-2xl font-bold mb-4 text-indigo-400">Setup Automation</h2>
                <div className="space-y-4 p-4 border border-gray-700 rounded-lg mb-6">
                    <input type="text" value={automationTitle} onChange={e => setAutomationTitle(e.target.value)} placeholder="Video Title" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                    <textarea value={automationConcept} onChange={e => setAutomationConcept(e.target.value)} placeholder="Story Concept / Summary" rows={4} className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"></textarea>
                    <div className="flex items-center gap-4">
                      <label htmlFor="auto_duration" className="font-medium">Video Duration (mins):</label>
                      <input type="number" id="auto_duration" value={automationDuration} onChange={e => setAutomationDuration(Number(e.target.value))} className="w-24 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <Button onClick={handleAddToQueue}>Add to Queue</Button>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">Automation Queue ({automationJobs.filter(j => j.status === 'PENDING' || j.status === 'FAILED').length} pending)</h3>
                  <div className="flex gap-2">
                      {automationStatus === 'IDLE' && <Button onClick={() => handleAutomationControl('RUN')} disabled={!automationJobs.some(j => j.status === 'PENDING' || j.status === 'FAILED')}>Run Automation</Button>}
                      {automationStatus === 'RUNNING' && <Button onClick={() => handleAutomationControl('PAUSE')} variant="secondary">Pause Automation</Button>}
                      {automationStatus === 'PAUSED' && <Button onClick={() => handleAutomationControl('RUN')}>Resume Automation</Button>}
                      {automationStatus !== 'IDLE' && <Button onClick={() => handleAutomationControl('STOP')} className="bg-red-800 hover:bg-red-700 focus:ring-red-600">Stop Automation</Button>}
                  </div>
                </div>
                <ul className="space-y-3">
                  {automationJobs.map(job => {
                    const percentage = (job.totalWords && job.wordsWritten) ? Math.min(100, Math.round((job.wordsWritten / job.totalWords) * 100)) : 0;
                    return (
                      <li key={job.id} onClick={() => setSelectedJobToView(job)} className="bg-gray-700 p-3 rounded-md cursor-pointer hover:bg-gray-600 transition-colors duration-200">
                        <div className="flex justify-between items-start">
                          <div className="flex-grow">
                            <p className="font-semibold">{job.title}</p>
                            <p className="text-sm text-gray-400">{job.status !== 'RUNNING' ? job.concept.substring(0, 50)+'...' : job.currentTask}</p>
                            {job.status === 'FAILED' && <p className="text-xs text-red-400 mt-1">Error: {job.error}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                              {getStatusBadge(job.status)}
                              {job.status === 'FAILED' && <Button onClick={(e) => { e.stopPropagation(); retryJob(job.id); }} variant="secondary" className="px-3 py-1 text-xs">Retry</Button>}
                              <button onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }} className="text-gray-400 hover:text-red-400 transition-colors text-xl font-bold">&times;</button>
                          </div>
                        </div>
                        {job.status === 'RUNNING' && (
                          <div className="mt-2">
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-xs font-medium text-gray-300">{job.wordsWritten || 0} / {job.totalWords || '?'} words</span>
                            </div>
                            <div className="w-full bg-gray-600 rounded-full h-2">
                              <div className="bg-indigo-500 h-2 rounded-full transition-all duration-300" style={{ width: `${percentage}%` }}></div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {automationJobs.length === 0 && <p className="text-gray-400 text-center py-4">Queue is empty. Add a script to get started.</p>}
                </ul>
              </div>
            )}

            {view === 'LIBRARY' && (
               <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-indigo-400">Script Library</h2>
                    <Button onClick={() => setShowArchived(prev => !prev)} variant="secondary">
                        {showArchived ? 'View Available Scripts' : 'View Archived Scripts'}
                    </Button>
                </div>
                 <ul className="space-y-3">
                  {libraryJobs.map(job => (
                    <li key={job.id} onClick={() => setSelectedJobToView(job)} className="bg-gray-700 p-4 rounded-md flex justify-between items-center cursor-pointer hover:bg-gray-600 transition-colors duration-200">
                      <div>
                        <p className="font-semibold">{job.title}</p>
                        <p className="text-sm text-gray-400">Created: {new Date(job.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleToggleArchiveStatus(job.id);
                            }}
                            variant="secondary"
                            className="px-3 py-1 text-xs"
                        >
                            {job.libraryStatus === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                        </Button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteJob(job.id);
                          }}
                          className="text-gray-400 hover:text-red-400 transition-colors text-2xl font-bold leading-none"
                          aria-label={`Delete script: ${job.title}`}
                        >
                          &times;
                        </button>
                      </div>
                    </li>
                  ))}
                  {libraryJobs.length === 0 && (
                    <p className="text-gray-400 text-center py-4">
                        {showArchived ? "No archived scripts found." : "No available scripts found."}
                    </p>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {(jobToDisplay && jobToDisplay.outlines) || (view === 'MANUAL' && manualScriptData.outlines) ? (
          <div className="mt-2 animate-fade-in">
            {selectedJobToView && (
                <div className="mb-4">
                    <Button onClick={() => setSelectedJobToView(null)} variant="secondary">
                        &larr; Back to {selectedJobToView.source === 'AUTOMATION' ? 'Queue' : 'Library'}
                    </Button>
                </div>
            )}

            <h2 className="text-3xl font-bold mb-4 text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-400">{jobToDisplay.refinedTitle || 'Generating Title...'}</h2>
            
            <p className="text-center text-gray-400 -mt-2 mb-4">Total Words: {progress.wordsWritten}</p>

            <div className="sticky top-0 bg-gray-950/80 backdrop-blur-sm z-10 py-4 mb-4">
                <div className="flex flex-wrap justify-center gap-3">
                    <Button onClick={handleCopyFullScript} disabled={!isScriptGenerated}>Copy Full Script</Button>
                    <Button onClick={handleCopyHookAndChapter1} disabled={!isScriptGenerated} variant="secondary">Copy Hook & Ch. 1</Button>
                    <Button onClick={handleCopyRestOfScript} disabled={!isScriptGenerated} variant="secondary">Copy Ch. 2 Onwards</Button>
                    <Button onClick={handleOpenThumbnailStudio} disabled={!isScriptGenerated} className="bg-purple-600 hover:bg-purple-500 focus:ring-purple-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                      Generate Thumbnail
                    </Button>
                </div>
            </div>

            <div className="bg-gray-800/50 p-6 rounded-lg shadow-inner space-y-8">
              <div>
                <h3 className="text-xl font-semibold mb-3 border-b-2 border-indigo-500 pb-2">The Hook</h3>
                {jobToDisplay.hook ? <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{jobToDisplay.hook}</p> : <InlineLoader message="Generating hook..." />}
              </div>

              {jobToDisplay.outlines?.filter(o => o.id > 0).map(outline => (
                <div key={outline.id}>
                   <h3 className="text-xl font-semibold mb-3 border-b-2 border-indigo-500 pb-2">Chapter {outline.id}: {outline.title} <span className="text-sm text-gray-400 font-normal">({outline.wordCount} words)</span></h3>
                   {jobToDisplay.chaptersContent?.[outline.id] ? (
                     <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{jobToDisplay.chaptersContent[outline.id]}</p>
                   ) : (
                     <InlineLoader message={writingChapterIds.includes(outline.id) || jobToDisplay.currentTask?.includes(`Chapter ${outline.id}`) ? `Writing chapter ${outline.id}...` : 'Waiting to write...'} />
                   )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default App;