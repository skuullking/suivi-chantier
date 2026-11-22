"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dismissOnboardingAction } from "@/server/actions/account";

export function OnboardingActions({ canDismiss }: { canDismiss: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <Button asChild size="sm" variant="outline">
        <Link href="/app/bienvenue">Guide de démarrage</Link>
      </Button>
      {canDismiss ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Masquer la prise en main"
          disabled={pending}
          onClick={() => startTransition(async () => void (await dismissOnboardingAction()))}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
