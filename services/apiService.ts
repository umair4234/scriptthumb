
import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from "@google/genai";

const SESSION_KEY_INDEX = 'current_gemini_api_key_index';
// The free tier for gemini-2.5-flash is 10 RPM. 60s / 10 = 6s per request.
// We'll increase the delay to be safe and avoid hitting the limit.
const MIN_DELAY_BETWEEN_CALLS_MS = 10000;
let lastApiCallTimestamp = 0;


const getCurrentKeyIndex = (): number => {
    const indexStr = sessionStorage.getItem(SESSION_KEY_INDEX);
    return indexStr ? parseInt(indexStr, 10) : 0;
};

const setCurrentKeyIndex = (index: number) => {
    sessionStorage.setItem(SESSION_KEY_INDEX, index.toString());
};

export const callGeminiApi = async (
    params: Omit<GenerateContentParameters, 'model'> & { model: string }
): Promise<GenerateContentResponse> => {
    const apiKeys: string[] = JSON.parse(localStorage.getItem('gemini_api_keys') || '[]');
    
    if (apiKeys.length === 0) {
        throw new Error("No Gemini API keys found. Please add a key in the API Manager.");
    }

    // --- Proactive Rate Limiting Logic ---
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallTimestamp;
    
    if (timeSinceLastCall < MIN_DELAY_BETWEEN_CALLS_MS) {
        const waitTime = MIN_DELAY_BETWEEN_CALLS_MS - timeSinceLastCall;
        console.log(`Rate limiting: waiting for ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastApiCallTimestamp = Date.now();
    // --- End Proactive Rate Limiting Logic ---

    let keyIndex = getCurrentKeyIndex();
    if (keyIndex >= apiKeys.length) {
        keyIndex = 0;
    }

    let lastError: Error | null = null;

    // Try each key once, starting from the last known good index
    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[keyIndex];
        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const response = await ai.models.generateContent(params);
            
            // CRITICAL: Access the .text property to trigger potential errors
            // (like safety blocks) within this try/catch block.
            const textContent = response.text;

            // If we get here without an error, the call was successful.
            setCurrentKeyIndex(keyIndex);
            return response;

        } catch (error) {
            console.warn(`API key at index ${keyIndex} failed.`, error);
            lastError = error as Error;

            // --- Intelligent Reactive Backoff for Rate Limiting ---
            // If we get a 429 error, the API may tell us how long to wait.
            // We should honor that before trying the next key.
            let rateLimitWaitMs = 0;
            try {
                // The error message from the SDK might be a JSON string.
                const errorObj = JSON.parse((error as Error).message);
                if (errorObj?.error?.code === 429 && errorObj?.error?.details) {
                    const retryInfo = errorObj.error.details.find(
                        (d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
                    );
                    if (retryInfo?.retryDelay) {
                        const delayStr = retryInfo.retryDelay; // e.g., "31s"
                        const seconds = parseInt(delayStr.replace('s', ''), 10);
                        if (!isNaN(seconds) && seconds > 0) {
                            rateLimitWaitMs = seconds * 1000;
                        }
                    }
                }
            } catch (e) {
                // Not a structured JSON error, or parsing failed. Proceed without extra wait.
            }
            
            if (rateLimitWaitMs > 0) {
                console.log(`Rate limit exceeded. API suggested waiting for ${rateLimitWaitMs / 1000}s. Pausing...`);
                await new Promise(resolve => setTimeout(resolve, rateLimitWaitMs));
                // After waiting, update the timestamp so the proactive limiter is also aware.
                lastApiCallTimestamp = Date.now();
            }
            // --- End Intelligent Reactive Backoff ---
            
            // Rotate to the next key for the next attempt in this loop
            keyIndex = (keyIndex + 1) % apiKeys.length;
        }
    }
    
    // *** FIX ***: After the loop, save the next key index to try.
    // This prevents the next call from starting with the same failing key.
    setCurrentKeyIndex(keyIndex);

    // If the loop completes, all keys failed. Throw the last captured error.
    if (lastError) {
        let finalMessage = lastError.message;
        try {
            // Attempt to parse the error message as JSON to get a cleaner message.
            const parsedError = JSON.parse(lastError.message);
            if (parsedError?.error?.message) {
                finalMessage = parsedError.error.message;
            }
        } catch (e) {
            // Not a JSON error message, use it as is.
        }
        throw new Error(`All API keys failed. Last error: ${finalMessage}`);
    }

    // Fallback error, should be rare
    throw new Error("All available API keys failed. Please check your keys in the API Manager or add new ones.");
};
