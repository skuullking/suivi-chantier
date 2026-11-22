"use client";

import { useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import {
  mockCancelAction,
  mockSubscribeAction,
  openPortalAction,
  startCheckoutAction,
} from "@/server/actions/account";

export function ChoosePlanButton({ plan, label }: { plan: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => startTransition(async () => notify(await startCheckoutAction(plan)))}
    >
      {pending ? "Redirection…" : label}
    </Button>
  );
}

export function PortalButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(async () => notify(await openPortalAction()))}
    >
      Factures et moyen de paiement
    </Button>
  );
}

export function CancelMockButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() => startTransition(async () => notify(await mockCancelAction()))}
    >
      Résilier (simulation)
    </Button>
  );
}

export function ConfirmMockPayment({ plan }: { plan: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() => startTransition(async () => notify(await mockSubscribeAction(plan)))}
    >
      Confirmer le paiement (simulation)
    </Button>
  );
}
