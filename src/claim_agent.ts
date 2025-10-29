import * as restate from "@restatedev/restate-sdk";
import { Context } from "@restatedev/restate-sdk";
import { serde } from "@restatedev/restate-sdk-zod";

import { generateObject, ImagePart, TextPart } from "ai";
import { openai } from "@ai-sdk/openai";

import { ClaimRequest, ClaimResponse, ClaimDescription, Evaluation, CompletenessCheck } from "./types";
import { readImages, sendRequest, withAIErrorHandling } from "./utils";
import type{ InterviewAgent } from "./interview_agent";


/**
 * Claim Agent: Processes insurance claims by extracting initial information,
 * iteratively asking for clarification, and requesting human evaluation.
 * Handles both initial intake and iterative refinement of claim descriptions.
 */
export const claimAgent = restate.service({
  name: "claims",
  handlers: {

    process: restate.createServiceHandler(
      {
        input: serde.zod(ClaimRequest),
        output: serde.zod(ClaimResponse)
      },
      async (ctx: restate.Context, request: ClaimRequest): Promise<ClaimResponse> => {
        
        // (1) Intake - extract initial claim description
        let claimDescription: ClaimDescription = await ctx.run(
          "Build initial claim description",
          () => intakeStep(request),
          { maxRetryAttempts: 3 }
        );

        let humanReviewComment: string | undefined;
        const interviewSessionId = ctx.rand.uuidv4();

        // (2) Iteratively ask for more input if needed
        //     and ask for human approval / evaluation
        while (true) {

          // (3) Determine if the claim description is complete
          const { complete, requestForInfo } = await ctx.run(
            "Check completeness of claim description",
            () => completenessCheck(claimDescription, humanReviewComment),
            { maxRetryAttempts: 3 }
          );

          // (4) If more input is needed, interview the user for more information
          if (complete === "incomplete") {
            claimDescription = await ctx
                .objectClient<InterviewAgent>({ name: "interview" }, interviewSessionId)
                .awaitInterview({ claimDescription, requestForInfo });
          }

          // (5) Ask for human approval / evaluation
          const { id, promise } = ctx.awakeable<Evaluation>();
          await ctx.run("notify human reviewer", () => notifyReviewer(claimDescription, id));

          // await approval / evaluation callback
          const { status, comment } = await promise;
          if (status === "approved" || status === "rejected") {
            return { status };
          }

          // fall through the loop to request more information
          humanReviewComment = comment;          
        }
      }
    )
  }
});


/**
 * The intake step: Extracts initial claim description from the user's brief note
 * and attached images. Uses AI to extract the information and returns a ClaimDescription object.
 */
async function intakeStep(request: ClaimRequest): Promise<ClaimDescription> {

  const images = await readImages(request.images);

  // let images: { image: Uint8Array, mimeType: string }[] = [];
  // try {
  //   images = await readImages(request.images);
  // } catch (error) {
  //   console.error(`Error reading images: ${error}`);
  //   images = []
  // }

  const prompt = buildIntakePrompt(request.description, images);

  const { object: claimDescription } = await withAIErrorHandling(() =>
    generateObject({
      model: openai("gpt-5-mini"),
      schema: ClaimDescription,
      system: INTAKE_SYSTEM_PROMPT,	
      messages: [
        { role: "system", content: INTAKE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      maxOutputTokens: 5000,
      maxRetries: 0,
    })
  );

  return claimDescription;
}


async function completenessCheck(
    claim: ClaimDescription,
    humanReview?: string): Promise<CompletenessCheck> {

  const { object } = await withAIErrorHandling(() =>
    generateObject({
      model: openai("gpt-5-mini"),
      schema: CompletenessCheck,
      messages: [
        { role: "system", content: COMPLETENESS_CHECK_SYSTEM_PROMPT },
        { role: "user", content: buildCompletenessCheckPrompt(claim, humanReview) }
      ],
      maxOutputTokens: 5000,
      maxRetries: 0
    })
  );

  return object;
}


// --------------------------------------------------------
//    Intake Step
// --------------------------------------------------------

const INTAKE_SYSTEM_PROMPT =
`You are an insurance claim *pre-intake summarizer*.
This step is the *initial* evidence extraction before an interactive follow-up where the user will answer clarification questions.
Your job now is to extract only clear, directly supported facts from the user's brief note and the attached image.
Do not infer or speculate. If something is missing, ambiguous, or contradictory between note and image, you must state that explicitly so it can be clarified later.
Every field must consider both sources (note and image) where applicable.
Keep each field concise (1-3 sentences). No PII. No liability assignments.
If unknown or unclear, write: "Unknown — needs clarification: <short reason>".
If contradictory, write: "Contradiction — <brief description of conflict>".`;


function buildIntakePrompt(note: string, images: { image: Uint8Array, mimeType: string }[]) {
  
  const userPrompt = `
Produce the following fields from the user note and attached image:

* objectDescription — What the image and note clearly show about the object(s)/scene.
* damageDescription — Only damage clearly visible in the image or unambiguously stated in the note.
* locationOfIncident — Best supported description (street/intersection/parking lot/indoor area etc.).
* involvedParties — Entities/vehicles/people clearly present or explicitly stated.

Requirements:
* Use only facts directly supported by the user note and/or the image.
* If a field lacks sufficient evidence, mark it as Unknown — needs clarification and state why.
* If the note and image conflict, mark the field as Contradiction and describe the conflict briefly.
* Each field should reflect consideration of BOTH inputs (note and image).
* Keep phrasing concise and professional.

User note: ${note}
`;

  return [
      { type: "text", text: userPrompt } as TextPart,
      ...(images.map((image) => ({ type: "image", image: image.image, mediaType: image.mimeType } as ImagePart))),
    ]
}

// --------------------------------------------------------
//    Completeness Check
// --------------------------------------------------------


const COMPLETENESS_CHECK_SYSTEM_PROMPT = `
You are an insurance claim clarification assistant.

Goal: Review the provided ClaimDescription together with the original user description (and, if present, a brief human review comment) to determine whether the claim description is complete. If information is missing or fields contradict each other, produce a concise, user-friendly request for the minimum additional information needed to complete the claim description.

Rules:
- Only ask about fields that are missing, unclear, or contradictory.
- If a field is marked “Unknown — needs clarification”, ask a targeted question for that field.
- If a field is marked “Contradiction — ...”, briefly point out the conflict and ask one question to resolve it.
- Group questions logically and keep them as short as possible while being specific.
- Prefer concrete, answerable questions (who/what/when/where/how much). Avoid vague yes/no where specifics are needed.
- No PII requests unless necessary for claim resolution; never collect sensitive data unrelated to the loss.
- Neutral, professional tone; one compact message suitable for a chat UI.

Output object:
- complete: "complete" if no follow-up is needed; otherwise "incomplete".
- requestForInfo: A single string for direct display in chat. If complete, return a short confirmation (e.g., “Thanks! I have everything needed for now.”).
`;

function buildCompletenessCheckPrompt(
    claimDescription: ClaimDescription,
    humanReviewComment?: string) {

  const claimDescriptionJSON = JSON.stringify(claimDescription, null, 2);
  const reviewSection = humanReviewComment 
    ? `* Comment by human reviewer: ${humanReviewComment}`
    : "";

  return `Inputs:
* ClaimDescription (JSON):
${claimDescriptionJSON}

${reviewSection}

Your tasks:
1) Check the ClaimDescription for any fields that are unknown/unclear or contain contradictions (considering both the description and prior extraction rules).
2) If everything is clear and consistent, set complete = "complete" and provide a brief confirmation in requestForInfo.
3) Otherwise, set complete = "incomplete" and write a concise, user-facing request that asks only for what's missing or contradictory, grouping related questions. Keep it brief but specific.

Return only the object with:
{
  "complete": "complete" | "incomplete",
  "requestForInfo": "..."
}
`;
}

async function notifyReviewer(claim: ClaimDescription, callbackId: string) {
  const payload = {
    claimDescription: claim,
    callbackId: callbackId
  };

  await sendRequest("http://localhost:55443", payload);
}