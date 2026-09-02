import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ErpClient } from "@/app/erp-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <ErpClient user={{ name: user.displayName, email: user.email }} />;
}
