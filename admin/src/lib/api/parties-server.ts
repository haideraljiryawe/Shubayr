import "server-only";

import type { PartyChoice } from "@/components/parties/party-search";
import { UUID } from "@/lib/inventory";
import { load, type serverApi } from "./server";

type Api = Awaited<ReturnType<typeof serverApi>>;

/** The party a URL filter names, so the search filter can show it by name. */
export async function loadPartyChoice(api: Api, id: string | undefined): Promise<PartyChoice | null> {
  if (!id || !UUID.test(id)) return null;
  const party = await load(api.GET("/admin/delivery-parties/{id}", { params: { path: { id } } }));
  return party.ok ? { id: party.data.id, name: party.data.name, phone: party.data.phone } : null;
}
