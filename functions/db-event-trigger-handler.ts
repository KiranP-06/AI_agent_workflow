import { Request, Response } from 'express';

const HASURA_URL = process.env.NHOST_HASURA_URL || 'http://localhost:1337/v1/graphql';
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';

async function adminQuery(query: string, variables: Record<string, any> = {}) {
  const res = await fetch(HASURA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export default async (req: Request, res: Response) => {
  try {
    const { event } = req.body;
    
    if (event.op === 'INSERT') {
      const newEvent = event.data.new;
      const eventType = newEvent.event_type;

      // Find workflows that have a database_event trigger matching this event_type
      const triggerResult = await adminQuery(`
        query GetDBEventTriggers {
          workflow_triggers(where: {
            trigger_type: {_eq: "database_event"},
            is_active: {_eq: true}
          }) {
            id
            workflow_id
            config
            workflow { created_by }
          }
        }
      `);

      const triggers = triggerResult.data?.workflow_triggers || [];
      const matchingTriggers = triggers.filter((t: any) => t.config?.event_type === eventType);

      console.log(`Found ${matchingTriggers.length} workflows to trigger for event ${eventType}`);

      for (const t of matchingTriggers) {
        // Create run for each matching workflow
        await adminQuery(`
          mutation CreateWorkflowRun($object: workflow_runs_insert_input!) {
            insert_workflow_runs_one(object: $object) { id }
          }
        `, {
          object: {
            workflow_id: t.workflow_id,
            triggered_by: t.workflow.created_by,
            trigger_type: 'database_event',
            status: 'pending',
            started_at: new Date().toISOString(),
          },
        });
        // Note: For a real impl, we'd kick off the engine here too
      }

      // Mark event as processed
      await adminQuery(`
        mutation MarkProcessed($id: uuid!) {
          update_watched_events_by_pk(pk_columns: {id: $id}, _set: {processed: true}) { id }
        }
      `, { id: newEvent.id });
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[dbEventTrigger] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
