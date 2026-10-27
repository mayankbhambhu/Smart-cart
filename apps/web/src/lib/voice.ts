import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * "Where is the peanut butter?" Speech-to-text through the browser's Web
 * Speech API (Chrome, Edge, Safari). `supported` is false elsewhere.
 */
export function useVoiceInput(onText: (text: string) => void): {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
} {
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const handler = useRef(onText);
  handler.current = onText;
  const supported = typeof window !== 'undefined' && recognitionCtor() !== null;

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    recognition.current?.stop();
    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      const cleaned = transcript
        .replace(/^(where (is|are)( the)?|find( me)?( the)?|i want( to buy)?|show me( the)?|do you have)\s+/i, '')
        .replace(/[?.!]+$/, '')
        .trim();
      if (cleaned) handler.current(cleaned);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }, []);

  useEffect(() => () => recognition.current?.stop(), []);
  return { supported, listening, start, stop };
}
