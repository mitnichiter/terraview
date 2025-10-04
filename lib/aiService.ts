import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI client with the API key from environment variables
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

if (!process.env.GOOGLE_GEMINI_API_KEY) {
  console.error("GOOGLE_GEMINI_API_KEY is not set in the environment variables.");
}

/**
 * Generates a list of significant environmental events for a given location using the Gemini AI.
 * @param locationName The name of the location (e.g., "California", "Brazil").
 * @returns A promise that resolves to a string containing a JSON array of events.
 */
export async function getAiGeneratedEvents(locationName: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const prompt = `
    You are a geoscientist data analyst. Based on the location "${locationName}", list up to 5 of the most significant environmental or geographical events that have occurred there since 1999.
    Events should be things visible from space, like wildfires, floods, volcanic eruptions, droughts, or major urban growth.
    For each event, provide a short, compelling narrative (2-3 sentences).
    You MUST respond in a valid JSON format as an array of objects. Do not include any text, markdown, or backticks outside of the JSON array.
    Each object must have the following keys: "eventName", "narrative", "eventType", "startDate" (YYYY-MM-DD), "endDate" (YYYY-MM-DD).

    Example response for 'California':
    [
      {
        "eventName": "The 2018 Camp Fire",
        "narrative": "One of California's deadliest and most destructive wildfires. The fire caused immense devastation, and its massive smoke plume was visible from space, impacting air quality across the state.",
        "eventType": "Wildfire",
        "startDate": "2018-11-08",
        "endDate": "2018-11-25"
      }
    ]
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate events from AI service.");
  }
}