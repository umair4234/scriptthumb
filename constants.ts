
export const OUTLINES_PROMPT_TEMPLATE = (title: string, concept: string, duration: number) => `
I want you to act as a Master Storyteller and YouTube Script Architect. Your specialty is creating gripping, first-person revenge stories with deep emotional stakes. Your mission is to take a simple video idea and structure it into a compelling chapter-by-chapter outline for a long-form video.

IMPORTANT: The language used in the title, chapter titles, and concepts MUST be extremely simple, clear, and easy for a 5th grader to understand. No complex vocabulary or sentence structures. Your entire response must strictly follow the format below. Do not add any extra text, explanation, or greetings.

First, you must understand the "Secret Formula" of these stories:

Emotional Core is Everything: The audience doesn't care about an HOA rule; they care about a good, hardworking person protecting their family's legacy. Chapter 1's entire job is to build this deep emotional connection to the hero and what they stand to lose.
The Deeper Conspiracy: The villain isn't just a mean neighbor; they are often running a larger criminal scheme (like embezzlement). The hero accidentally stumbles into this, raising the stakes from a simple dispute to a fight for justice.

Now, follow these steps to build the outline:

1. Refine the Title: Make the user's title more exciting, following the formula: [Villain's Action] — [Hero's Secret Power/Situation]! Keep it under 100 characters.

2. Calculate and Distribute Word Count: The rule is: 1 minute of video = 150 words. For a ${duration} minute video, the total word count for the entire script should be approximately ${duration * 150} words. Distribute this total word count across all chapters following these critical rules:
- Chapter 1 MUST have a word count between 400 and 500 words to establish the emotional core.
- The Hook is separate and will be written later (assume around 150 words).
- The remaining word count should be distributed intelligently among the other chapters (Chapter 2 onwards). The word count for these chapters can and should vary to best serve the story's pacing and narrative needs. The key is that the total sum of word counts for all chapters should equal the target total for the video.

3. Create the Chapters: Build the story with 5-12 chapters, depending on what best serves the story for the given duration. For each chapter, give it a title, a word count, and a simple concept.

Your response must be in this exact format:
---
Title: [Your Refined Title Here]

Chapter 0: The Hook
(Hook to be written later, following the high-action, first-person style).

Chapter 1: [Chapter 1 Title]
(Word Count: [Number between 400-500] words)
Concept: [A simple 2-3 sentence concept for this chapter.]

Chapter 2: [Chapter 2 Title]
(Word Count: [Number] words)
Concept: [A simple 2-3 sentence concept for this chapter.]

(And so on for all chapters...)
---

(Paste your information in the brackets below)

Title:
{
${title}
}

Summary/concept:
{
${concept}
}

Video duration:
{
${duration} minutes
}
`;

export const HOOK_PROMPT_TEMPLATE = (outlinesText: string) => `
I want you to act as an expert writer for viral, first-person YouTube revenge stories. Your job is to take the provided story outline and write a powerful, high-energy hook (120-150 words).

**CRITICAL RULES FOR WRITING THE HOOK:**

1.  **EXTREMELY SIMPLE ENGLISH:** The language must be incredibly simple. Imagine you are talking to a 10-year-old. Use common words and easy-to-understand ideas. This is the most important rule.

2.  **WRITING STYLE - SENTENCE FLOW:** You MUST use a mix of short and medium-length sentences. Do not write only short, choppy sentences. The writing should feel natural and powerful.
    *   **BAD STYLE (Too choppy):** "I had a big dream. I worked very hard for it. For many years, I worked day and night. I saved all my money. I wanted to buy a perfect house. Not just any house."
    *   **GOOD STYLE (Natural flow):** "I had a big dream that I worked incredibly hard for over many years. Working day and night, I saved all my money because I wanted to buy the perfect house. It couldn't be just any house, though; it had to be a special home for my family."

3.  **STARTING THE HOOK:** The hook MUST begin by directly identifying the villain and their action. Start the story in the middle of the most dramatic moment.
    *   **Correct example:** "This HOA president burned my house to the ground..."
    *   **Correct example:** "This corrupt landlord thought she could evict a war hero..."
    *   **Incorrect example:** "One night, the flames went high..."

4.  **ENDING THE HOOK:** The hook MUST end with a specific two-part phrase: first a question to the audience, then a call to comment.
    *   **Required format:** "Before we dive into the full story, what would you do if [a similar situation happened to you]? Let us know in the comments."

5.  **HERO'S VOICE & SECRET:** Write from the hero's first-person ("I", "me") point of view. The hook must reveal the hero's secret power or job and promise huge consequences for the villain.

Now, using the story outline below for context, write the hook following all of these rules precisely.

Here is the story outline:
---
${outlinesText}
---
`;

export const CHAPTER_BATCH_PROMPT_TEMPLATE = (fullOutlinesText: string, chaptersTo_write: { id: number; title: string; wordCount: number; concept: string }[]) => `
**CRITICAL RULES FOR WRITING:**

1.  **EXTREMELY SIMPLE ENGLISH:** This is the most important rule. Write using EXTREMELY simple English, suitable for a 5th grader. Use common words. Focus on clear, direct storytelling. Do not use complex vocabulary or long paragraphs.

2.  **WRITING STYLE - SENTENCE FLOW:** You MUST use a mix of short and medium-length sentences. Do not write only short, choppy sentences. The writing should feel natural and easy to read.
    *   **BAD STYLE (Too choppy):** "I had a big dream. I worked very hard for it. For many years, I worked day and night. I saved all my money. I wanted to buy a perfect house. Not just any house."
    *   **GOOD STYLE (Natural flow):** "I had a big dream that I worked incredibly hard for over many years. Working day and night, I saved all my money because I wanted to buy the perfect house. It couldn't be just any house, though; it had to be a special home for my family."

**TASK:**

Excellent. Please write the full text for the following chapters based on the provided story outline.

**IMPORTANT FORMATTING RULE:** After you finish writing the complete text for one chapter, you MUST insert the exact delimiter "---CHAPTER-BREAK---" on a new line. Then, begin writing the next chapter. Do NOT add this delimiter after the final chapter in the list.

**WRITING INSTRUCTION:** Start writing the chapter text directly. Do NOT repeat the chapter title (e.g., "Chapter 1: The Beginning") in your response. Just write the story content itself.

Here is the full story outline for context:
---
${fullOutlinesText}
---

Now, please write the following chapters in order:
${chaptersTo_write.map(c => `
- Chapter ${c.id}: ${c.title}
  Word Count: Approximately ${c.wordCount} words
  Concept: ${c.concept}
`).join('\n')}
`;