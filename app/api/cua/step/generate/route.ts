  import { NextResponse } from "next/server";
import { createAgent, AgentDependencies, getAction, takeAction } from "../../agent/agent";
import { BrowserbaseBrowser } from "../../agent/browserbase";
import { ComputerToolCall } from "../../agent/types";

export async function POST(request: Request) {
  let computer: BrowserbaseBrowser | null = null;
  let dependencies: AgentDependencies;

  try {
    const body = await request.json();
    const { sessionId, responseId, input } = body;
    console.log("input", input);

    computer = new BrowserbaseBrowser(1024, 768, "us-west-2", false, sessionId);
    dependencies = createAgent("computer-use-preview", computer);
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId in request body" },
        { status: 400 }
      );
    }

    let result = await getAction(dependencies, input, responseId);

    // If there's a screenshot returned, just handle it right here so we don't have to make a round trip.
    if (result.output.find((item) => item.type === "computer_call")) {
      const computerCall = result.output.find(
        (item) => item.type === "computer_call"
      ) as ComputerToolCall;
      if (computerCall.action.type === "screenshot") {
        await computer.connect();

        const screenshotAction = await takeAction(dependencies, result.output);
        result = await getAction(dependencies,
          screenshotAction.filter((item) => item.type != "message"),
          result.responseId
        );
      }
    }

    // If the generated action is only reasoning, let's request a real action.
    if (
      result.output.length == 1 &&
      result.output.find((item) => item.type === "reasoning")
    ) {
      do {
        result = await getAction(dependencies,
          [
            {
            role: "user",
            content: "Please continue with the task.",
          },
        ],
          result.responseId
        );
      } while (result.output.length == 1 && result.output.find((item) => item.type === "reasoning"));
    }

    return NextResponse.json([result]);
  } catch (error) {
    console.error("Error in cua endpoint:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process request" },
      { status: 500 }
    );
  }
}
