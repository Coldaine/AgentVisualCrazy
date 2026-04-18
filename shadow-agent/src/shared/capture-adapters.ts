import type { CaptureAdapter } from './capture-adapter';
import { claudeTranscriptCaptureAdapter } from './transcript-adapter';

export function getTranscriptCaptureAdapter(): CaptureAdapter<string> {
  return claudeTranscriptCaptureAdapter;
}
