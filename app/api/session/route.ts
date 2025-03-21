import { NextResponse } from "next/server";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

async function createSession() {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });

  const browserSettings = {
    viewport: {
      width: 1024,
      height: 768,
    },
    blockAds: true,
  };
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    browserSettings,
    keepAlive: true,
    region: "ap-southeast-1",
  });
  return {
    session
  };
}

async function endSession(sessionId: string) {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  await bb.sessions.update(sessionId, {
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    status: "REQUEST_RELEASE",
  });
}

async function getDebugUrl(sessionId: string) {
  const bb = new Browserbase({
    apiKey: process.env.BROWSERBASE_API_KEY!,
  });
  const session = await bb.sessions.debug(sessionId);
  return session.debuggerFullscreenUrl;
}

export async function POST(request: Request) {
  try {
    const { session } = await createSession();
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const defaultContext = browser.contexts()[0];
    const page = defaultContext.pages()[0];
    await page.goto("https://www.google.com", { waitUntil: "domcontentloaded" });
    const liveUrl = await getDebugUrl(session.id);
    return NextResponse.json({
      success: true,
      sessionId: session.id,
      sessionUrl: liveUrl,
      connectUrl: session.connectUrl
    });
  } catch (error) {
    console.error("Error creating session:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create session" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const sessionId = body.sessionId as string;
  await endSession(sessionId);
  return NextResponse.json({ success: true });
}
