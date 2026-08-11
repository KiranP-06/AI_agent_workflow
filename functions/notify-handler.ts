import { Request, Response } from 'express';

export default async (req: Request, res: Response) => {
  try {
    // This is called by the Hasura Event Trigger on step_runs inserts
    const { event } = req.body;
    
    if (event.op === 'INSERT') {
      const stepRun = event.data.new;
      
      // We only care about notify steps if they fail or succeed, but this trigger 
      // might just log it. The actual notify logic is in the engine.
      console.log(`[Event Trigger] New step run created: ${stepRun.id} for step ${stepRun.step_id}`);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[notifyHandler] Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
