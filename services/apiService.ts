
import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse, GenerateImagesParameters, GenerateImagesResponse } from "@google/genai";

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

const getApiKeys = (): string[] => {
    const keys = localStorage.getItem('gemini_api_keys');
    return keys ? JSON.parse(keys) : [];
}

const performRateLimitWait = async () => {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallTimestamp;
    
    if (timeSinceLastCall < MIN_DELAY_BETWEEN_CALLS_MS) {
        const waitTime = MIN_DELAY_BETWEEN_CALLS_MS - timeSinceLastCall;
        console.log(`Rate limiting: waiting for ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastApiCallTimestamp = Date.now();
}

const handleApiError = async (error: Error) => {
    console.warn(`API call failed.`, error);
    let rateLimitWaitMs = 0;
    try {
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
        lastApiCallTimestamp = Date.now();
    }
}

const getFinalErrorMessage = (error: Error): string => {
    try {
        const parsedError = JSON.parse(error.message);
        return parsedError?.error?.message || error.message;
    } catch (e) {
        return error.message;
    }
}

export const callGeminiApi = async (
    params: Omit<GenerateContentParameters, 'model'> & { model: string }
): Promise<GenerateContentResponse> => {
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) throw new Error("No Gemini API keys found. Please add a key in the API Manager.");

    await performRateLimitWait();

    let keyIndex = getCurrentKeyIndex();
    if (keyIndex >= apiKeys.length) keyIndex = 0;

    let lastError: Error | null = null;

    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[keyIndex];
        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const response = await ai.models.generateContent(params);
            const _ = response.text; // Access .text to trigger early failure for safety blocks
            setCurrentKeyIndex(keyIndex);
            return response;
        } catch (error) {
            lastError = error as Error;
            await handleApiError(error as Error);
            keyIndex = (keyIndex + 1) % apiKeys.length;
        }
    }
    
    setCurrentKeyIndex(keyIndex);
    if (lastError) throw new Error(`All API keys failed. Last error: ${getFinalErrorMessage(lastError)}`);
    throw new Error("All available API keys failed. Please check your keys or add new ones.");
};

// Fix: Corrected GenerateImageParameters to GenerateImagesParameters and GenerateImageResponse to GenerateImagesResponse.
export const callGeminiImageApi = async (
    params: Omit<GenerateImagesParameters, 'model'> & { model: string }
): Promise<GenerateImagesResponse> => {
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) throw new Error("No Gemini API keys found. Please add a key in the API Manager.");

    await performRateLimitWait();

    let keyIndex = getCurrentKeyIndex();
    if (keyIndex >= apiKeys.length) keyIndex = 0;

    let lastError: Error | null = null;

    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[keyIndex];
        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const response = await ai.models.generateImages(params);
            setCurrentKeyIndex(keyIndex);
            return response;
        } catch (error) {
            lastError = error as Error;
            await handleApiError(error as Error);
            keyIndex = (keyIndex + 1) % apiKeys.length;
        }
    }
    
    setCurrentKeyIndex(keyIndex);
    if (lastError) throw new Error(`All API keys failed. Last error: ${getFinalErrorMessage(lastError)}`);
    throw new Error("All available API keys failed. Please check your keys or add new ones.");
};