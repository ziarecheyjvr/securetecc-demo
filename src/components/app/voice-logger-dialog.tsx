"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VoiceLoggerApp } from "@/components/app/voice-logger-app";
import type { ClientOption, ServiceTypeOption } from "@/components/app/voice-logger-app";

/**
 * The Voice Logger in a dialog, alongside the full-page route.
 *
 * Logging time is something you do in the middle of looking at the time
 * entries list, and sending someone to a separate page for it loses that
 * context and their scroll position. /voice-logger stays -- it's the better
 * target on a phone, where a dialog fights the on-screen keyboard.
 *
 * Mounted only while open (via the `key`), so each session starts with a
 * clean recorder and no transcript left over from last time.
 */
export function VoiceLoggerDialog({
  clients,
  serviceTypes,
}: {
  clients: ClientOption[];
  serviceTypes: ServiceTypeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSession((n) => n + 1);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Mic className="mr-1 h-4 w-4" /> Voice Logger
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Voice Logger</DialogTitle>
          <DialogDescription>
            Dictate the work and the entry is drafted for you to check before saving.
          </DialogDescription>
        </DialogHeader>
        <VoiceLoggerApp key={session} clients={clients} serviceTypes={serviceTypes} />
      </DialogContent>
    </Dialog>
  );
}
