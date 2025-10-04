import { NextResponse } from 'next/server';
import { getAiGeneratedEvents } from '@/lib/aiService';

export async function POST(request: Request) {
  try {
    const { locationName } = await request.json();

    if (!locationName) {
      return NextResponse.json({ error: 'locationName is required' }, { status: 400 });
    }

    const aiResponse = await getAiGeneratedEvents(locationName);

    // The AI is prompted to return a raw JSON string, so we parse it here.
    const events = JSON.parse(aiResponse);

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error in /api/events:', error);
    // This could be a JSON parsing error or an error from the AI service itself.
    return NextResponse.json({ error: 'Failed to fetch AI-generated events.' }, { status: 500 });
  }
}