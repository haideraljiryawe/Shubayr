export const actorSelect = {
  id: true,
  name: true,
  username: true,
  phone: true,
} as const;

export type ActorNameSource = {
  id: string;
  name: string | null;
  username: string | null;
  phone: string | null;
};

export function actorDisplayName(actor: ActorNameSource): string;
export function actorDisplayName(actor: ActorNameSource | null): string | null;
export function actorDisplayName(actor: ActorNameSource | null): string | null {
  return actor
    ? actor.name?.trim() || actor.username || actor.phone || actor.id
    : null;
}
