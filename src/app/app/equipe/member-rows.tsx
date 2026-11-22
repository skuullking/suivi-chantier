"use client";

import { MessageCircle, Trash2, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { ROLE_LABELS } from "@/lib/labels";
import { changeRoleAction, removeMemberAction, revokeInvitationAction } from "@/server/actions/team";

type Role = "OWNER" | "OFFICE" | "WORKER";

export function notify(result: ActionState) {
  if (result.error) toast.error(result.error);
  else if (result.message) toast.success(result.message);
}

export function MemberRow(props: {
  membershipId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  whatsapp: string | null;
  lastLogin: string | null;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center" data-testid="member-row">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {props.name} {props.isSelf ? <Badge variant="outline">Vous</Badge> : null}
        </p>
        <p className="text-muted-foreground truncate text-sm">
          {props.email}
          {props.phone ? ` · ${props.phone}` : ""}
        </p>
        <p className="text-muted-foreground text-xs">
          {props.whatsapp ? (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3" /> WhatsApp {props.whatsapp}
            </span>
          ) : (
            "WhatsApp non associé"
          )}
          {props.lastLogin ? ` · dernière connexion le ${props.lastLogin}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`role-${props.membershipId}`}>
          Rôle de {props.name}
        </label>
        <select
          id={`role-${props.membershipId}`}
          className="h-9 rounded-lg border bg-white px-2 text-sm"
          defaultValue={props.role}
          disabled={pending || props.isSelf}
          onChange={(e) => {
            const role = e.target.value;
            startTransition(async () => notify(await changeRoleAction(props.membershipId, role)));
          }}
        >
          {(["OWNER", "OFFICE", "WORKER"] as const).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {!props.isSelf ? (
          <ConfirmButton
            title={`Retirer ${props.name} de l'équipe ?`}
            description="La personne ne pourra plus accéder aux chantiers. Ses photos et documents restent conservés."
            confirmLabel="Retirer"
            onConfirm={async () => notify(await removeMemberAction(props.membershipId))}
          >
            <Button variant="ghost" size="icon" aria-label={`Retirer ${props.name}`}>
              <Trash2 />
            </Button>
          </ConfirmButton>
        ) : null}
      </div>
    </div>
  );
}

export function PendingInvitationRow(props: {
  invitationId: string;
  email: string;
  roleLabel: string;
  expires: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{props.email}</p>
        <p className="text-muted-foreground text-xs">
          {props.roleLabel} · expire le {props.expires}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => notify(await revokeInvitationAction(props.invitationId)))}
      >
        <X /> Annuler
      </Button>
    </div>
  );
}
