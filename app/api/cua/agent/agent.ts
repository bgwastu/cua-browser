import { BrowserbaseBrowser } from "./browserbase";
import { createOpenAI } from '@ai-sdk/openai';
import {
  InputItem,
  Item,
  Message,
  FunctionToolCall,
  ComputerToolCall,
  ComputerCallOutput,
  FunctionOutput,
  Tool,
  RequestOptions,
} from "./types";

type AcknowledgeSafetyCheckCallback = (message: string) => boolean;

export type AgentDependencies = {
  client: any;
  model: string;
  computer: BrowserbaseBrowser;
  tools: Tool[];
  printSteps: boolean;
  acknowledgeSafetyCheckCallback: AcknowledgeSafetyCheckCallback;
  lastResponseId?: string;
};

export function createAgent(
  model: string = "computer-use-preview",
  computer: BrowserbaseBrowser,
  acknowledgeSafetyCheckCallback: AcknowledgeSafetyCheckCallback = () => true,
  printSteps: boolean = true
): Omit<AgentDependencies, "lastResponseId"> {
  const client = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORG,
  });

  const tools: Tool[] = [
    {
      type: "computer-preview",
      display_width: computer.dimensions[0],
      display_height: computer.dimensions[1],
      environment: computer.environment,
    },
    {
      type: "function",
      name: "back",
      description: "Go back to the previous page.",
      parameters: {},
      strict: false,
    },
    {
      type: "function",
      name: "goto",
      description: "Go to a specific URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Fully qualified URL to navigate to.",
          },
        },
        additionalProperties: false,
        required: ["url"],
      },
      strict: false,
    },
  ];

  return {
    client,
    model,
    computer,
    tools,
    printSteps,
    acknowledgeSafetyCheckCallback,
  };
}

export async function createResponse(
  options: RequestOptions,
  client: any
): Promise<any> {
  const url = "https://api.openai.com/v1/responses";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "Openai-beta": "responses=v1",
  };

  const openaiOrg = process.env.OPENAI_ORG;
  if (openaiOrg) {
    headers["Openai-Organization"] = openaiOrg;
  }

  // Manual retry logic
  let retries = 3;
  let response;
  while (retries > 0) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(options),
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status < 500) {
        const errorData = await response.json();
        console.error(
          `Error: ${response.status} ${JSON.stringify(errorData)}`
        );
        throw new Error(`Request failed with status ${response.status}`);
      }
    } catch (error) {
      console.error(`Fetch error: ${error}`);
      if (retries === 1) {
        throw error; // Re-throw the error on the last retry
      }
    }

    // Exponential backoff (simplified)
    await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)));
    retries--;
  }
  if (response) {
    const errorData = await response.json();
    console.error(`Error: ${response.status} ${JSON.stringify(errorData)}`);
  }
  throw new Error("Max retries exceeded");
}

export async function getAction(
  dependencies: AgentDependencies,
  inputItems: InputItem[],
  previousResponseId: string | undefined = dependencies.lastResponseId
): Promise<{
  output: Item[];
  responseId: string;
}> {
  dependencies.lastResponseId = previousResponseId;
  const response = await createResponse(
    {
      model: dependencies.model,
      input: inputItems,
      tools: dependencies.tools,
      truncation: "auto",
      ...(previousResponseId
        ? { previous_response_id: previousResponseId }
        : {}),
    },
    dependencies.client
  );

  console.log("response", response);

  return {
    output: response.output as Item[],
    responseId: response.id as string,
  };
}

export async function takeAction(
  dependencies: AgentDependencies,
  output: Item[]
): Promise<(Message | ComputerCallOutput | FunctionOutput)[]> {
  const actions: Promise<Message | ComputerCallOutput | FunctionOutput>[] = [];
  for (const item of output) {
    if (item.type === "message") {
      // Do nothing
    }
    if (item.type === "computer_call") {
      actions.push(
        takeComputerAction(dependencies, item as ComputerToolCall)
      );
    }
    if (item.type === "function_call") {
      actions.push(
        takeFunctionAction(dependencies, item as FunctionToolCall)
      );
    }
  }

  const results = await Promise.all(actions);
  return results;
}

export async function   takeMessageAction(
  dependencies: AgentDependencies,
  messageItem: Message
): Promise<Message> {
  if (dependencies.printSteps && messageItem.content?.[0]) {
    console.log(messageItem.content[0]);
  }
  return messageItem;
}

export async function takeComputerAction(
  dependencies: AgentDependencies,
  computerItem: ComputerToolCall
): Promise<ComputerCallOutput> {
  const action = computerItem.action;
  const actionType = action.type;
  const actionArgs = Object.fromEntries(
    Object.entries(action).filter(([key]) => key !== "type")
  );

  if (dependencies.printSteps) {
    console.log(`${actionType}(${JSON.stringify(actionArgs)})`);
  }

  if (!dependencies.computer) {
    throw new Error("Computer not initialized");
  }

  const method = (dependencies.computer as unknown as Record<string, unknown>)[
    actionType
  ] as (...args: unknown[]) => unknown;
  await method.apply(dependencies.computer, Object.values(actionArgs));

  const screenshot = await dependencies.computer.screenshot();

  // Handle safety checks
  const pendingChecks = computerItem.pending_safety_checks || [];
  for (const check of pendingChecks) {
    const message = check.message;
    if (!dependencies.acknowledgeSafetyCheckCallback(message)) {
      throw new Error(
        `Safety check failed: ${message}. Cannot continue with unacknowledged safety checks.`
      );
    }
  }

  return {
    type: "computer_call_output",
    call_id: computerItem.call_id,
    acknowledged_safety_checks: pendingChecks,
    output: {
      type: "input_image",
      image_url: `data:image/png;base64,${screenshot}`,
    },
  };
}

export async function takeFunctionAction(
  dependencies: AgentDependencies,
  functionItem: FunctionToolCall
): Promise<FunctionOutput> {
  const { name } = functionItem;
  const args = JSON.parse(functionItem.arguments);
  if (dependencies.printSteps) {
    console.log(`${name}(${JSON.stringify(args)})`);
  }

  if (
    dependencies.computer &&
    typeof (dependencies.computer as unknown as Record<string, unknown>)[name] ===
      "function"
  ) {
    const method = (dependencies.computer as unknown as Record<string, unknown>)[
      name
    ] as (...args: unknown[]) => unknown;
    await method.apply(dependencies.computer, Object.values(args));
  }

  return {
    type: "function_call_output",
    call_id: functionItem.call_id,
    output: "success", // hard-coded output for demo
  };
}
