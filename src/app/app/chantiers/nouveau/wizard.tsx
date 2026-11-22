"use client";

import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { createSiteAction } from "@/server/actions/business";

type ClientOption = { id: string; name: string; address: string };
type TemplateOption = { id: string; name: string; items: string[] };
type MemberOption = { id: string; name: string; role: "OWNER" | "OFFICE" | "WORKER" };

const STEPS = ["Client", "Chantier", "Étapes et équipe"];

type Info = {
  title: string;
  address: string;
  postalCode: string;
  city: string;
  plannedStart: string;
  plannedEnd: string;
  description: string;
  instructions: string;
};

export function NewSiteWizard(props: {
  clients: ClientOption[];
  templates: TemplateOption[];
  members: MemberOption[];
  defaultClientId?: string;
  defaultTemplateId?: string;
}) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"existing" | "new">(props.clients.length ? "existing" : "new");
  const [clientId, setClientId] = useState(props.defaultClientId ?? "");
  const [clientFilter, setClientFilter] = useState("");
  const [newClient, setNewClient] = useState({
    name: "",
    phones: "",
    emails: "",
    addresses: "",
    type: "INDIVIDUAL",
  });
  const [info, setInfo] = useState<Info>({
    title: "",
    address: "",
    postalCode: "",
    city: "",
    plannedStart: "",
    plannedEnd: "",
    description: "",
    instructions: "",
  });
  const [templateId, setTemplateId] = useState(props.defaultTemplateId ?? "");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  const selectedClient = props.clients.find((c) => c.id === clientId);
  const filteredClients = props.clients.filter((c) =>
    c.name.toLowerCase().includes(clientFilter.trim().toLowerCase()),
  );

  function next() {
    setError(undefined);
    if (step === 0) {
      if (mode === "existing" && !clientId) return setError("Choisissez un client.");
      if (mode === "new" && newClient.name.trim().length < 2)
        return setError("Indiquez le nom du nouveau client.");
      // Pre-fill the site from the client.
      if (!info.title) {
        const name = mode === "existing" ? selectedClient?.name : newClient.name;
        const address = mode === "existing" ? selectedClient?.address : newClient.addresses.split("\n")[0];
        // "5 impasse des Pins, 31500 Toulouse" → street / postal code / city.
        const match = /^(.*?)[,\s]+(\d{5})\s+(.+)$/.exec(address?.trim() ?? "");
        setInfo((i) => ({
          ...i,
          title: name ? `Chantier ${name}` : i.title,
          address: i.address || (match ? match[1]! : (address ?? "")),
          postalCode: i.postalCode || (match ? match[2]! : ""),
          city: i.city || (match ? match[3]! : ""),
        }));
      }
    }
    if (step === 1) {
      if (info.title.trim().length < 2) return setError("Donnez un titre au chantier.");
      if (info.address.trim().length < 3) return setError("Indiquez l'adresse du chantier.");
      if (info.plannedStart && info.plannedEnd && info.plannedEnd < info.plannedStart) {
        return setError("La date de fin doit être après la date de début.");
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await createSiteAction({
        clientId: mode === "existing" ? clientId : undefined,
        newClient:
          mode === "new"
            ? {
                type: newClient.type === "PROFESSIONAL" ? "PROFESSIONAL" : "INDIVIDUAL",
                name: newClient.name,
                phones: newClient.phones,
                emails: newClient.emails,
                addresses: newClient.addresses,
              }
            : undefined,
        info,
        templateId: templateId || undefined,
        memberIds,
      });
      // On success the action redirects to the new site.
      if (result && !result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  const set = (key: keyof Info) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setInfo((i) => ({ ...i, [key]: e.target.value }));
  const err = (key: string) => fieldErrors[`info.${key}`]?.[0] ?? fieldErrors[`newClient.${key}`]?.[0];

  return (
    <div className="grid max-w-3xl gap-4">
      <ol className="flex items-center gap-2" aria-label="Étapes de création">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                i < step
                  ? "bg-emerald-600 text-white"
                  : i === step
                    ? "bg-orange-600 text-white"
                    : "bg-stone-200",
              )}
            >
              {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-sm", i === step ? "font-semibold" : "text-muted-foreground")}>
              {label}
            </span>
            {i < STEPS.length - 1 ? <ChevronRight className="size-4 text-stone-300" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <FormAlert error={error} />

          {step === 0 ? (
            <fieldset className="grid gap-4">
              <legend className="sr-only">Client</legend>
              <div className="flex gap-2" role="radiogroup" aria-label="Client existant ou nouveau">
                <Button
                  type="button"
                  role="radio"
                  aria-checked={mode === "existing"}
                  variant={mode === "existing" ? "default" : "outline"}
                  disabled={props.clients.length === 0}
                  onClick={() => setMode("existing")}
                >
                  Client existant
                </Button>
                <Button
                  type="button"
                  role="radio"
                  aria-checked={mode === "new"}
                  variant={mode === "new" ? "default" : "outline"}
                  onClick={() => setMode("new")}
                >
                  Nouveau client
                </Button>
              </div>
              {mode === "existing" ? (
                <div className="grid gap-2">
                  <Input
                    placeholder="Rechercher un client…"
                    aria-label="Rechercher un client"
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                  />
                  <div className="grid max-h-72 gap-1 overflow-y-auto" role="listbox" aria-label="Clients">
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={clientId === c.id}
                        onClick={() => setClientId(c.id)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left text-sm",
                          clientId === c.id ? "border-orange-500 bg-orange-50" : "hover:bg-stone-50",
                        )}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.address ? (
                          <span className="text-muted-foreground block text-xs">{c.address}</span>
                        ) : null}
                      </button>
                    ))}
                    {filteredClients.length === 0 ? (
                      <p className="text-muted-foreground text-sm">Aucun client trouvé.</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="nc-name">Nom du client</Label>
                    <Input
                      id="nc-name"
                      value={newClient.name}
                      placeholder="M. et Mme Dupont"
                      onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))}
                    />
                    {err("name") ? <p className="text-destructive text-sm">{err("name")}</p> : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nc-phone">Téléphone</Label>
                    <Input
                      id="nc-phone"
                      inputMode="tel"
                      value={newClient.phones}
                      onChange={(e) => setNewClient((c) => ({ ...c, phones: e.target.value }))}
                    />
                    {err("phones") ? <p className="text-destructive text-sm">{err("phones")}</p> : null}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nc-email">E-mail</Label>
                    <Input
                      id="nc-email"
                      inputMode="email"
                      value={newClient.emails}
                      onChange={(e) => setNewClient((c) => ({ ...c, emails: e.target.value }))}
                    />
                    {err("emails") ? <p className="text-destructive text-sm">{err("emails")}</p> : null}
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="nc-address">Adresse</Label>
                    <Input
                      id="nc-address"
                      value={newClient.addresses}
                      onChange={(e) => setNewClient((c) => ({ ...c, addresses: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </fieldset>
          ) : null}

          {step === 1 ? (
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Informations du chantier</legend>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="site-title">Titre du chantier</Label>
                <Input id="site-title" value={info.title} onChange={set("title")} />
                {err("title") ? <p className="text-destructive text-sm">{err("title")}</p> : null}
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="site-address">Adresse du chantier</Label>
                <Input id="site-address" value={info.address} onChange={set("address")} />
                {err("address") ? <p className="text-destructive text-sm">{err("address")}</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="site-postal">Code postal</Label>
                <Input
                  id="site-postal"
                  value={info.postalCode}
                  onChange={set("postalCode")}
                  inputMode="numeric"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="site-city">Ville</Label>
                <Input id="site-city" value={info.city} onChange={set("city")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="site-start">Début prévu</Label>
                <Input id="site-start" type="date" value={info.plannedStart} onChange={set("plannedStart")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="site-end">Fin prévue</Label>
                <Input id="site-end" type="date" value={info.plannedEnd} onChange={set("plannedEnd")} />
                {err("plannedEnd") ? <p className="text-destructive text-sm">{err("plannedEnd")}</p> : null}
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="site-description">Description</Label>
                <Textarea
                  id="site-description"
                  rows={2}
                  value={info.description}
                  onChange={set("description")}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="site-instructions">Consignes pour l&apos;équipe</Label>
                <Textarea
                  id="site-instructions"
                  rows={2}
                  placeholder="Code du portail, accès, horaires…"
                  value={info.instructions}
                  onChange={set("instructions")}
                />
              </div>
            </fieldset>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-6">
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-medium">Modèle d&apos;étapes</legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modèle d'étapes">
                  {[...props.templates, { id: "", name: "Sans modèle", items: [] }].map((t) => (
                    <button
                      key={t.id || "none"}
                      type="button"
                      role="radio"
                      aria-checked={templateId === t.id}
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left",
                        templateId === t.id ? "border-orange-500 bg-orange-50" : "hover:bg-stone-50",
                      )}
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {t.items.length ? t.items.join(" → ") : "Vous ajouterez les étapes vous-même."}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-medium">Équipe du chantier</legend>
                <p className="text-muted-foreground text-sm">
                  Les ouvriers de l&apos;équipe verront ce chantier dans leur application.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {props.members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                      <Checkbox
                        checked={memberIds.includes(m.id)}
                        onCheckedChange={(c) =>
                          setMemberIds((ids) => (c === true ? [...ids, m.id] : ids.filter((x) => x !== m.id)))
                        }
                        aria-label={m.name}
                      />
                      <span className="flex-1">{m.name}</span>
                      <span className="text-muted-foreground text-xs">{ROLE_LABELS[m.role]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          <div className="flex justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || pending}
            >
              <ChevronLeft aria-hidden /> Retour
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                Continuer <ChevronRight aria-hidden />
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                Créer le chantier
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
