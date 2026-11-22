import { Mail } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { db } from "@/server/db";

export const metadata = { title: "Boîte mail de développement" };

/** Renders plain-text bodies with clickable links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className="text-ink-700 text-sm whitespace-pre-wrap">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} className="text-signal-700 break-all underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export default async function DevMailsPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const { a } = await searchParams;
  const mails = await db.messageLog.findMany({
    where: {
      channel: "EMAIL",
      direction: "OUTBOUND",
      ...(a ? { toAddress: { contains: a.toLowerCase() } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Boîte mail de développement</h1>
          <p className="text-muted-foreground text-sm">
            Avec <code>MAIL_DRIVER=dev</code>, les e-mails envoyés par l&apos;application arrivent ici (50
            derniers).
          </p>
        </div>
        <form className="flex gap-2">
          <input
            name="a"
            defaultValue={a}
            placeholder="Filtrer par destinataire"
            aria-label="Filtrer par destinataire"
            className="h-9 rounded-lg border bg-white px-3 text-sm"
          />
          <button className="h-9 rounded-lg border bg-white px-3 text-sm" type="submit">
            Filtrer
          </button>
          {a ? (
            <Link href="/dev/mails" className="flex h-9 items-center px-2 text-sm underline">
              Tout
            </Link>
          ) : null}
        </form>
      </div>
      {mails.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Aucun e-mail"
          description="Invitez un membre ou demandez un nouveau mot de passe."
        />
      ) : (
        mails.map((m) => (
          <Card key={m.id} data-testid="dev-mail">
            <CardHeader>
              <CardTitle>{m.subject}</CardTitle>
              <p className="text-muted-foreground text-xs">
                À : {m.toAddress} · {formatDateTime(m.createdAt)}
              </p>
            </CardHeader>
            <CardContent>
              <Linkified text={m.body ?? ""} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
