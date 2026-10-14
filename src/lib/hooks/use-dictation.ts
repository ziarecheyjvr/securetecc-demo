"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech-to-text, extracted from the Voice Logger so the task
 * dictation and the time-entry dictation cannot drift apart.
 *
 * Everything subtle in here was learned from the time-entry logger and is
 * kept verbatim -- see the comments on `continuous` and on the auto-restart,
 * which are the two things that make dictation with natural pauses work.
 */

type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const LISTENING_PLACEHOLDER = "Listening...";

export type Dictation = {
  isRecording: boolean;
  /** Live text, including the interim guess while someone is still talking. */
  transcript: string;
  setTranscript: (value: string) => void;
  /** True once there is real dictated text, not just the listening placeholder. */
  hasSpeech: boolean;
  toggle: () => void;
  reset: () => void;
  /** Null until mounted; false means this browser has no speech recognition. */
  supported: boolean | null;
};

export function useDictation(options?: { onUnsupported?: () => void }): Dictation {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const userStoppedRef = useRef(true);
  const onUnsupportedRef = useRef(options?.onUnsupported);
  onUnsupportedRef.current = options?.onUnsupported;

  // Feature detection has to wait for mount: the server has no window, and
  // rendering "not supported" on the server then flipping it on the client is
  // a hydration mismatch.
  useEffect(() => setSupported(getSpeechRecognitionCtor() !== null), []);

  const startSession = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      onUnsupportedRef.current?.();
      return;
    }
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    // continuous stays false -- setting it true causes transcript doubling on
    // Android Chrome. Instead a fresh session is started on natural
    // pause-triggered "end" events below, so speaking with pauses doesn't cut
    // the speaker off mid-thought.
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
      if (!finalTranscriptRef.current) setTranscript(LISTENING_PLACEHOLDER);
    };

    recognition.onresult = (e) => {
      let sessionFinal = "";
      let sessionInterim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) sessionFinal += r[0].transcript;
        else sessionInterim += r[0].transcript;
      }
      const liveText =
        (finalTranscriptRef.current ? finalTranscriptRef.current + " " : "") +
        (sessionFinal || sessionInterim);
      setTranscript(liveText.trim());
      if (sessionFinal) {
        finalTranscriptRef.current =
          (finalTranscriptRef.current ? finalTranscriptRef.current + " " : "") +
          sessionFinal.trim();
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (!userStoppedRef.current) {
        try {
          startSession();
          recognitionRef.current?.start();
        } catch {
          finish();
        }
        return;
      }
      finish();
    };

    recognition.onerror = (e) => {
      // A pause is reported as "no-speech". While the user hasn't stopped, it
      // is expected and the restart above handles it.
      if (e.error === "no-speech" && !userStoppedRef.current) return;
      setIsRecording(false);
      if (!finalTranscriptRef.current) setTranscript(`Error: ${e.error}. Please try again.`);
    };

    recognition.start();

    function finish() {
      const text = finalTranscriptRef.current.trim();
      if (text) setTranscript(text);
    }
  }, []);

  const toggle = useCallback(() => {
    if (isRecording) {
      userStoppedRef.current = true;
      recognitionRef.current?.stop();
      return;
    }
    finalTranscriptRef.current = "";
    setTranscript("");
    userStoppedRef.current = false;
    startSession();
  }, [isRecording, startSession]);

  const reset = useCallback(() => {
    setTranscript("");
    finalTranscriptRef.current = "";
  }, []);

  // Stopping on unmount matters: the recogniser keeps the microphone open,
  // and a dialog closed mid-sentence would otherwise leave it listening.
  useEffect(() => {
    return () => {
      userStoppedRef.current = true;
      recognitionRef.current?.stop();
    };
  }, []);

  const trimmed = transcript.trim();
  return {
    isRecording,
    transcript,
    setTranscript,
    hasSpeech: trimmed.length > 0 && trimmed !== LISTENING_PLACEHOLDER,
    toggle,
    reset,
    supported,
  };
}
