import type { SignInPrompt, SignInProgress } from "./contract.js";

// Tracks one sign-in attempt: its output, a pending prompt, and the answer that resolves it.
export class SignInSession {
  private output: string[] = [];
  private running = true;
  private prompt?: SignInPrompt;
  private error?: string;
  private pending?: (answer: string) => void;

  log(line: string): void {
    const text = line.trim();
    if (text) this.output.push(text);
  }

  // Ask the user for input and wait for answer(). Resolves with the text they typed.
  ask(prompt: SignInPrompt): Promise<string> {
    this.prompt = prompt;
    return new Promise<string>((resolve) => {
      this.pending = (answer) => {
        this.prompt = undefined;
        this.pending = undefined;
        resolve(answer);
      };
    });
  }

  answer(value: string): boolean {
    if (!this.pending) return false;
    this.pending(value);
    return true;
  }

  finish(error?: string): void {
    this.running = false;
    this.prompt = undefined;
    this.pending = undefined;
    this.error = error;
  }

  progress(): SignInProgress {
    return {
      running: this.running,
      output: [...this.output],
      prompt: this.prompt,
      error: this.error,
    };
  }
}
