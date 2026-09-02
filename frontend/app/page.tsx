import { ErpClient } from "@/app/erp-client";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <ErpClient
      user={{
        name: "Owner TB Permata",
        email: "owner@tbpermatagroup.id",
      }}
    />
  );
}
