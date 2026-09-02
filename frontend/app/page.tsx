import { ErpClient } from "@/app/erp-client";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return (
    <ErpClient
      user={{
        name: session.displayName,
        email: session.email,
      }}
    />
  );
}
