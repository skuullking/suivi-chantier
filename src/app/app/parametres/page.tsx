import { ChevronRight, History, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/server/auth/context";
import { getOrganization } from "@/server/services/settings";
import { OrganizationForm, ValidationSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const ctx = await requireOwner();
  const org = await getOrganization(ctx);
  const links = [
    {
      href: "/app/parametres/modeles",
      label: "Modèles d'étapes",
      description: "Les étapes proposées à la création d'un chantier.",
      icon: ListChecks,
    },
    {
      href: "/app/parametres/journal",
      label: "Journal d'audit",
      description: "Les actions sensibles réalisées dans votre compte.",
      icon: History,
    },
  ];
  return (
    <>
      <PageHeader title="Paramètres" description="Entreprise, validation, modèles d'étapes et sécurité." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Entreprise</CardTitle>
            </CardHeader>
            <CardContent>
              <OrganizationForm
                defaults={{
                  name: org.name,
                  trade: org.trade,
                  phone: org.phone ?? "",
                  email: org.email ?? "",
                  address: org.address ?? "",
                  timezone: org.timezone,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Validation et envois</CardTitle>
            </CardHeader>
            <CardContent>
              <ValidationSettingsForm
                defaults={{
                  photosAutoApprove: org.photosAutoApprove,
                  officeCanValidatePhotos: org.officeCanValidatePhotos,
                  summaryAutoSend: org.summaryAutoSend,
                  summaryHour: org.summaryHour,
                  reminderHour: org.reminderHour,
                }}
              />
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center gap-3 rounded-xl border bg-white p-4 transition hover:border-orange-300"
            >
              <l.icon className="size-5 text-orange-700" aria-hidden />
              <span className="flex-1">
                <span className="block font-medium">{l.label}</span>
                <span className="text-muted-foreground text-sm">{l.description}</span>
              </span>
              <ChevronRight className="size-4 text-stone-400" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
