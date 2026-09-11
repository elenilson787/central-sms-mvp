import { getSupabaseAdmin } from "@/src/db/supabase-server";

export async function logAudit(input: {
  actorType: string;
  actorId?: string | number | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("audit_logs").insert({
    actor_type: input.actorType,
    actor_id: input.actorId != null ? String(input.actorId) : null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId != null ? String(input.entityId) : null,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}
