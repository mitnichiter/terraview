export type JobStatus = 'processing' | 'complete' | 'failed';

export interface AnimationJob {
  status: JobStatus;
  url?: string; // URL of the completed animation
  error?: string; // Error message if the job failed
}

// In-memory store for animation jobs.
// In a real production app, you would use a database like Redis or a persistent key-value store.
export const jobs = new Map<string, AnimationJob>();