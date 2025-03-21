import { NextResponse } from 'next/server';
import { createAgent, AgentDependencies, takeAction } from '../../agent/agent';
import { BrowserbaseBrowser } from '../../agent/browserbase';

export async function POST(request: Request) {
  let computer: BrowserbaseBrowser | null = null;
  let dependencies: AgentDependencies;

  try {
    const body = await request.json();
    const { sessionId, output } = body;
    console.log("output", output);

    computer = new BrowserbaseBrowser(1024, 768, "us-west-2", false, sessionId);
    dependencies = createAgent("computer-use-preview", computer);
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId in request body' },
        { status: 400 }
      );
    }

    await computer.connect();

    const result = await takeAction(dependencies, output.output);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in cua endpoint:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
