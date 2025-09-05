import { ChapterOutline, ThumbnailStyle } from "../types";
import { OUTLINES_PROMPT_TEMPLATE, HOOK_PROMPT_TEMPLATE, CHAPTER_BATCH_PROMPT_TEMPLATE } from "../constants";
import { callGeminiApi } from "./apiService";
import { Modality, Type } from "@google/genai";

export const generateOutlines = async (title: string, concept: string, duration: number): Promise<string> => {
  const prompt = OUTLINES_PROMPT_TEMPLATE(title, concept, duration);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text;
};

export const generateHook = async (outlinesText: string): Promise<string> => {
  const prompt = HOOK_PROMPT_TEMPLATE(outlinesText);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text;
};

export const generateChapterBatch = async (
  fullOutlinesText: string,
  chapters: ChapterOutline[]
): Promise<string[]> => {
  if (chapters.length === 0) return [];
  
  const prompt = CHAPTER_BATCH_PROMPT_TEMPLATE(fullOutlinesText, chapters);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const content = response.text;
  const chapterContents = content.split('---CHAPTER-BREAK---').map(c => c.trim());
  
  if (chapterContents.length !== chapters.length) {
    console.error("Mismatch between requested and generated chapters.", {
      requested: chapters.length,
      received: chapterContents.length,
    });
  }
  
  return chapterContents;
};


// --- Thumbnail Generation Service Functions ---

const STYLE_ANALYSIS_PROMPT = `
You are a world-class YouTube thumbnail design expert with a deep understanding of visual storytelling, color theory, and emotional engagement. Your task is to analyze the provided sample thumbnail images and distill their shared aesthetic into a structured JSON object.

Based on the images, identify the common patterns in the following categories:
- **Lighting:** Is it dramatic, soft, high-contrast? Where are the key lights and shadows?
- **Color:** What is the overall color palette (saturated, muted)? What is the color temperature (warm, cool)? What are the dominant colors?
- **Composition:** How are subjects framed (close-up, medium shot)? Is it symmetrical, asymmetrical?
- **Subject Emotion:** How are emotions portrayed (exaggerated, subtle, intense)? What are the common facial expressions?
- **Effects & Texture:** Are there glows, film grain, specific textures, or post-processing effects?

Finally, synthesize all these observations into a single, comprehensive "Master Prompt". This master prompt should be a detailed set of instructions for an AI image generator to replicate this exact style. It should encapsulate all the analyzed characteristics into a clear, actionable directive.

Your entire response MUST be a single JSON object that conforms to the provided schema. Do not add any text before or after the JSON.
`;

export const analyzeImageStyle = async (base64Images: {mimeType: string, data: string}[]): Promise<Omit<ThumbnailStyle, 'id' | 'name'>> => {
  const imageParts = base64Images.map(image => ({
    inlineData: {
      mimeType: image.mimeType,
      data: image.data,
    },
  }));
  
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: { parts: [...imageParts, { text: STYLE_ANALYSIS_PROMPT }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          masterPrompt: { type: Type.STRING },
          analysis: {
            type: Type.OBJECT,
            properties: {
              lighting: { type: Type.OBJECT, properties: { style: { type: Type.STRING }, description: { type: Type.STRING } } },
              color: { type: Type.OBJECT, properties: { palette: { type: Type.STRING }, temperature: { type: Type.STRING }, dominantColors: { type: Type.ARRAY, items: { type: Type.STRING } }, description: { type: Type.STRING } } },
              composition: { type: Type.OBJECT, properties: { style: { type: Type.STRING }, description: { type: Type.STRING } } },
              subject: { type: Type.OBJECT, properties: { emotion: { type: Type.STRING }, description: { type: Type.STRING } } },
              effects: { type: Type.OBJECT, properties: { style: { type: Type.STRING }, description: { type: Type.STRING } } },
            }
          }
        }
      }
    }
  });

  const jsonStr = response.text.trim();
  return JSON.parse(jsonStr) as Omit<ThumbnailStyle, 'id' | 'name'>;
};

export const generateInitialThumbnail = async (prompt: string, style: ThumbnailStyle): Promise<string> => {
  const fullPrompt = `${style.masterPrompt} The specific scene to create is: ${prompt}`;
  
  const response = await callGeminiApi({
      model: 'imagen-4.0-generate-001',
      prompt: fullPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9',
      },
  });

  if (!response.generatedImages || response.generatedImages.length === 0) {
    throw new Error("Image generation failed to produce an image.");
  }
  return response.generatedImages[0].image.imageBytes;
};

export const editThumbnail = async (
  base64ImageData: string,
  mimeType: string,
  instruction: string,
  style: ThumbnailStyle
): Promise<string> => {
  const fullInstruction = `Following the overall style guide below, please perform this specific edit: "${instruction}".\n\nSTYLE GUIDE: ${style.masterPrompt}`;

  const response = await callGeminiApi({
    model: 'gemini-2.5-flash-image-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64ImageData,
            mimeType: mimeType,
          },
        },
        {
          text: fullInstruction,
        },
      ],
    },
    config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });
  
  const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (!imagePart || !imagePart.inlineData) {
    throw new Error("Image editing failed to return an image.");
  }

  return imagePart.inlineData.data;
};
