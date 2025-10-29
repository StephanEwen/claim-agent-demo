import { TerminalError } from "@restatedev/restate-sdk";
import fs from "node:fs";
import path from "node:path";

function guessMimeType(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  throw new Error(`Unsupported image type: ${ext}`);
}

export async function readImage(imagePath: string): Promise<{ image: Uint8Array, mimeType: string }> {
  try {
    const mimeType = guessMimeType(imagePath);
    const image = await fs.promises.readFile(imagePath);
    return { image, mimeType };
  } catch (error) {
    throw new TerminalError(`Failed to read image: ${imagePath}`);
  }
}

export async function readImages(imagePaths: string[]): Promise<{ image: Uint8Array, mimeType: string }[]> {
  return Promise.all(imagePaths.map(async (imagePath) => await readImage(imagePath)));
}


export async function withAIErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {

    console.error(JSON.stringify(error , null, 2));

    // Check if this is a NoObjectGeneratedError due to token limit
    if (isTokenLimitError(error)) {
      const reasoningTokens = error.usage?.reasoningTokens || 0;
      const outputTokens = error.usage?.outputTokens || 0;
      
      throw new TerminalError(
        `AI model exceeded token limit. ` +
        `Output tokens used: ${outputTokens} (including ${reasoningTokens} reasoning tokens). ` +
        `For reasoning models, consider increasing maxOutputTokens or using a non-reasoning model.`,
        { cause: error }
      );
    }
    
    // Check for other NoObjectGeneratedError cases
    if (error.name?.includes('NoObjectGeneratedError')) {
      throw new TerminalError(
        `AI model failed to generate structured output. ` +
        `Reason: ${error.finishReason || 'unknown'}. ` +
        `This may indicate the model refused the request or encountered a content filter.`,
        { cause: error }
      );
    }
    
    // Re-throw other errors (may be retryable)
    throw error;
  }
}

function isTokenLimitError(error: any): boolean {
  return (
    error.name?.includes("NoObjectGeneratedError") &&
    error.finishReason === "length"
  );
}

export async function sendRequest(url: string, payload: any) {
  let body;
  try {
    body = JSON.stringify(payload);
  } catch (error) {
    throw new TerminalError(`Failed to stringify payload: ${error}`, { cause: error });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body
  });

  if (!response.ok) {
    const body = await response.text();
    throw new TerminalError(`Approver API returned non-200 status: ${response.status}: ${body}`);
  }
}