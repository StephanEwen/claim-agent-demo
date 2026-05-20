import * as restate from "@restatedev/restate-sdk";
import { generateText, ImagePart, TextPart } from "ai";
import { openai } from "@ai-sdk/openai";
import { readImage, withAIErrorHandling } from "./utils";

interface AnalyzeRequest {
  imagePath: string;
  claimDescription: string;
}

const SYSTEM_PROMPT =
`You are an insurance claim image analyst.
Given an image and the claimant's brief description of the incident, describe what the image shows that is relevant to the claim.
Focus on: visible objects and their condition, any damage present, the location/context visible, and whether the image is consistent with or contradicts the claim description.
Be factual and concise (2-4 sentences). Do not speculate beyond what is directly visible.`;

export const imageAnalyzer = restate.service({
  name: "imageAnalysis",
  handlers: {
    analyze: async (ctx: restate.Context, req: AnalyzeRequest): Promise<string> => {
      return await ctx.run(
        `Analyze ${req.imagePath}`,
        () => analyzeImage(req.imagePath, req.claimDescription)
      );
    },
  },
  options: {
    retryPolicy: {
      maxAttempts: 3,
      initialInterval: 1000,
      onMaxAttempts: "pause"
    }
  }
});

export type ImageAnalyzer = typeof imageAnalyzer;

async function analyzeImage(imagePath: string, claimDescription: string): Promise<string> {

  const { image, mimeType } = await readImage(imagePath);

  // let image: Uint8Array | undefined;
  // let mimeType: string | undefined;
  // try {
  //   const img = await readImage(imagePath);
  //   image = img.image;
  //   mimeType = img.mimeType;
  // } catch (error) {
  //   console.error(`Error reading image: ${error}`);
  //   return `Image could not be read`;
  // }

  const result = await withAIErrorHandling(() =>
    generateText({
      model: openai("gpt-5-mini"),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Claim description: "${claimDescription}"` } as TextPart,
            { type: "image", image, mediaType: mimeType } as ImagePart,
          ],
        },
      ],
      maxOutputTokens: 5000,
      maxRetries: 0,
    })
  );

  if (!result.text) {
    // Throw so ctx.run retries — empty output means the model refused or was filtered
    throw new Error(`Image analysis returned no text (finishReason: ${result.finishReason})`);
  }

  return result.text;
}
