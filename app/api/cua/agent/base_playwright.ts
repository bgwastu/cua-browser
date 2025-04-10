import { Browser, Page } from 'playwright';

// Key mapping for CUA style keys to Playwright keys
const CUA_KEY_TO_PLAYWRIGHT_KEY: Record<string, string> = {
  "/": "Divide",
  "\\": "Backslash",
  "alt": "Alt",
  "arrowdown": "ArrowDown",
  "arrowleft": "ArrowLeft",
  "arrowright": "ArrowRight",
  "arrowup": "ArrowUp",
  "up": "ArrowUp",
  "down": "ArrowDown",
  "left": "ArrowLeft",
  "right": "ArrowRight",
  "backspace": "Backspace",
  "capslock": "CapsLock",
  "cmd": "Meta",
  "command": "Meta",
  "ctrl": "Control",
  "control": "Control",
  "delete": "Delete",
  "end": "End",
  "enter": "Enter",
  "esc": "Escape",
  "home": "Home",
  "insert": "Insert",
  "option": "Alt",
  "pagedown": "PageDown",
  "pageup": "PageUp",
  "shift": "Shift",
  "space": " ",
  "super": "Meta",
  "tab": "Tab",
  "win": "Meta",
};

// Hotkeys mapping
const HOTKEYS: Record<string, string> = {
  "alt": "Alt",
  "ctrl": "Control",
  "control": "Control",
  "shift": "Shift",
  "meta": "Meta",
  "command": "Meta",
  "win": "Meta",
}

export type Environment = "browser";

/**
 * Abstract base for Playwright-based computers:
 * 
 * - Subclasses override `_getBrowserAndPage()` to do local or remote connection,
 *   returning [Browser, Page].
 * - This base class handles context creation (`connect`/`disconnect`),
 *   plus standard "Computer" actions like click, scroll, etc.
 * - We also have extra browser actions: `goto(url)` and `back()`.
 */
export abstract class BasePlaywrightComputer {
  environment: Environment = "browser";
  dimensions: [number, number] = [1024, 768];
  
  protected _browser: Browser | null = null;
  protected _page: Page | null = null;
  
  constructor() {
    this._browser = null;
    this._page = null;
  }
  
  async connect(): Promise<this> {
    // Start Playwright and call the subclass hook for getting browser/page
    const [browser, page] = await this._getBrowserAndPage();
    this._browser = browser;
    this._page = page;
    return this;
  }
  
  async disconnect(): Promise<void> {
    if (this._browser) {
      await this._browser.close();
    }
  }
  
  // Screenshot action
  async screenshot(): Promise<string> {
    if (!this._page) throw new Error("Page not initialized");
    const buffer = await this._page.screenshot({ fullPage: false });
    return buffer.toString('base64');
  }
  
  // Click action
  async click(button: string = "left", x: number | string, y: number | string): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    const parsedX = typeof x === 'string' ? parseInt(x, 10) : x;
    const parsedY = typeof y === 'string' ? parseInt(y, 10) : y;
    if (isNaN(parsedX) || isNaN(parsedY)) {
      throw new Error(`Invalid x or y coordinate: x=${x}, y=${y}`);
    }
    if (button == "wheel") {
      await this._page.mouse.wheel(parsedX, parsedY);
    } else {
      await this._page.mouse.click(parsedX, parsedY, { button: button as "left" | "right" | "middle" });
    }
  }
  
  // Double click action
  async double_click(x: number, y: number): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    await this._page.mouse.dblclick(x, y);
  }
  
  // Scroll action
  async scroll(x: number, y: number, scrollX: number, scrollY: number): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    await this._page.mouse.wheel(scrollX, scrollY);
    await this._page.mouse.move(x, y);
  }
  
  // Type action
  async type(text: string): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    await this._page.keyboard.type(text);
  }
  
  // Wait action
  async wait(ms: number = 250): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Move action
  async move(x: number, y: number): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    await this._page.mouse.move(x, y);
  }
  
  // Keypress action
  async keypress(keys: string[]): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");

    // Support for hotkeys
    if (HOTKEYS[keys[0].toLowerCase()]) {
      await this._page.keyboard.down(HOTKEYS[keys[0].toLowerCase()]);
      for (let i = 1; i < keys.length; i++) {
        await this._page.keyboard.press(keys[i]);
      }
      await this._page.keyboard.up(HOTKEYS[keys[0].toLowerCase()]);
    } else {
      for (const key of keys) {
        const mappedKey = CUA_KEY_TO_PLAYWRIGHT_KEY[key.toLowerCase()] || key;
        await this._page.keyboard.press(mappedKey);
      }
    }
  }
  
  // Drag action
  async drag(path: {x: number, y: number}[]): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    if (!path.length) return;
    
    await this._page.mouse.move(path[0].x, path[0].y);
    await this._page.mouse.down();
    
    for (let i = 1; i < path.length; i++) {
      await this._page.mouse.move(path[i].x, path[i].y);
    }
    
    await this._page.mouse.up();
  }
  
  // Go to URL action
  async goto(url: string): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    await this._page.goto(url, { waitUntil: "domcontentloaded" });
  }
  
  // Go back action
  async back(): Promise<void> {
    if (!this._page) throw new Error("Page not initialized");
    await this._page.goBack();
  }
  
  // Subclass hook to be implemented by concrete implementations
  protected abstract _getBrowserAndPage(): Promise<[Browser, Page]>;
} 