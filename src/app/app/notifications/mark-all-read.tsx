"use client";

import { CheckCheck } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/server/actions/business";

export function MarkAllRead() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markNotificationsReadAction()))}
    >
      <CheckCheck aria-hidden /> Tout marquer comme lu
    </Button>
  );
}
