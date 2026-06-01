import { falProxy } from '@/lib/fal';

// Whisper returns transcription text (no media asset), so the re-host walk is a
// no-op here — routed through falProxy purely for a uniform fal entry point.
export const POST = falProxy('fal-ai/whisper');
