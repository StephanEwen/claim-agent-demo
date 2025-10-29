import * as restate from "@restatedev/restate-sdk";
import { TerminalError } from "@restatedev/restate-sdk";
import { serde } from "@restatedev/restate-sdk-zod";

import { z } from "zod";

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

import { ClaimDescription, InterviewRequest, CompletenessCheck } from "./types";
import { sendRequest, withAIErrorHandling } from "./utils";


// Schema for user message input
const UserMessage = z.object({
  message: z.string(),
});
type UserMessage = z.infer<typeof UserMessage>;

// Schema for the combined AI response
const InterviewResponse = z.object({
  status: z.enum(["complete", "incomplete"]),
  refinedDescription: ClaimDescription,
  message: z.string(),
});
type InterviewResponse = z.infer<typeof InterviewResponse>;


// Type for the Virtual Object state
const ChatMessage = z.union([
  z.object({ agent: z.string() }),
  z.object({ user: z.string() }),
]);
type ChatMessage = z.infer<typeof ChatMessage>;

type InterviewState = {
  status: "open" | "closed";
  claimDescription: ClaimDescription;
  requestForInfo: string;
  chatHistory: ChatMessage[];
  callback?: string;
};


export const interviewAgent = restate.object({
  name: "interview",
  handlers: {

    createInterview: async (
        ctx: restate.ObjectContext<InterviewState>,
        request: { interview: InterviewRequest, onComplete: string }): Promise<void> => {

      const { claimDescription, requestForInfo } = request.interview;
      ctx.set("status", "open");
      ctx.set("claimDescription", claimDescription);
      ctx.set("requestForInfo", requestForInfo);
 
      const chatHistory = (await ctx.get("chatHistory")) || [];

      // Append agent's message to existing or new chat history
      const agentMessage: ChatMessage = {
        agent: buildInitialMessage(claimDescription, requestForInfo),
      };
      chatHistory.push(agentMessage);
      ctx.set("chatHistory", chatHistory);
      ctx.set("callback", request.onComplete);
    },

    userMessage: restate.createObjectHandler(
      { input: serde.zod(UserMessage), output: serde.zod(z.string()) },
      
      async (ctx: restate.ObjectContext<InterviewState>, input: UserMessage): Promise<string> => {
        const status = await ctx.get("status");
        if (status !== "open") {
          throw new TerminalError("Chat session is closed.");
        }

        const claimDescription = (await ctx.get("claimDescription"))!;
        const requestForInfo = (await ctx.get("requestForInfo"))!;
        const chatHistory = (await ctx.get("chatHistory")) || [];

        // Add user message to chat history
        chatHistory.push({ user: input.message });

        // AI call: refine description and check completeness
        const response = await ctx.run(
          "Process interview response",
          () => processInterviewResponse(claimDescription, requestForInfo, chatHistory),
          { maxRetryAttempts: 3 }
        );

        // Add agent's response message
        chatHistory.push({ agent: response.message });
        ctx.set("chatHistory", chatHistory);

        if (response.status === "complete") {
          // Close the interview
          ctx.set("status", "closed");
          ctx.set("claimDescription", response.refinedDescription);
          const callback = await ctx.get("callback");
          if (callback) {
            ctx.resolveAwakeable(callback, response.refinedDescription);
          }
          ctx.clear("callback");
        }

        return `Claim information ${response.status === "complete" ? "is complete" : "is incomplete"}: ${response.message}`;
      }
    ),

    getHistory: restate.createObjectSharedHandler(
      {
        input: serde.zod(z.number().optional()),
        output: serde.zod(z.array(ChatMessage)),
        idempotencyRetention: { hours: 0 },
        journalRetention: { hours: 0 },
      },
      async (ctx: restate.ObjectSharedContext<InterviewState>, offset): Promise<ChatMessage[]> => {
        const chatHistory = (await ctx.get("chatHistory")) || [];
        return chatHistory.slice(offset ?? 0);
      }
    ),

    awaitInterview: restate.createObjectSharedHandler(
      { input: serde.zod(InterviewRequest), output: serde.zod(ClaimDescription) },
      async (ctx: restate.ObjectSharedContext<InterviewState>, interview: InterviewRequest): Promise<ClaimDescription> => {
        const { id, promise } = ctx.awakeable<ClaimDescription>();

        // call ourselves to create the interview.
        // If that fails, the exception bubbles up and propagates to our caller as well
        await ctx.objectClient(interviewAgent, ctx.key).createInterview({ interview, onComplete: id });

        await ctx.run(`ask user for input at session ${ctx.key}`, () => sendRequest("http://localhost:55442", { sessionId: ctx.key }));
        
        // wait for the interview to complete
        return await promise;
      }
    )
  },
});

export type InterviewAgent = typeof interviewAgent;


// --------------------------------------------------------
//    Helper Functions
// --------------------------------------------------------

function buildInitialMessage(claimDescription: ClaimDescription, requestForInfo: string): string {
  return `We require additional input to process your claim.

Here is what we have so far:

**Object/Scene:** ${claimDescription.objectDescription}
**Damage:** ${claimDescription.damageDescription}
**Location:** ${claimDescription.locationOfIncident}
**Involved Parties:** ${claimDescription.involvedParties}

Here is the additional information we need:
${requestForInfo}`;
}


async function processInterviewResponse(
  currentDescription: ClaimDescription,
  originalRequest: string,
  chatHistory: ChatMessage[]
): Promise<InterviewResponse> {
  
  const SYSTEM_PROMPT = `You are an insurance claim interview assistant.

Your job is to:
1. Review the entire chat history to understand what information has been provided
2. Refine the claim description based on all user responses in the conversation
3. Determine if all originally requested information has now been addressed
4. Either provide a confirmation message (if complete) or ask the next specific question (if incomplete)

Rules for refining the description:
- Incorporate all facts from user messages into the appropriate fields
- If a user provides clarification that resolves an "Unknown" or "Contradiction", update that field
- Do not speculate or infer beyond what users explicitly state
- Keep descriptions professional and concise (1-3 sentences per field)

Rules for completeness checking:
- Check if all aspects of the original request for information have been addressed
- If any fields still contain "Unknown" or "Contradiction", the claim is incomplete
- If information is still missing, ask ONE specific, targeted follow-up question
- If complete, provide a brief, friendly confirmation message

Use a professional, conversational tone.`;

  // Build the chat history for context
  const chatContext = chatHistory
    .map((msg) => {
      if ("agent" in msg) return `Agent: ${msg.agent}`;
      if ("user" in msg) return `User: ${msg.user}`;
      return "";
    })
    .join("\n\n");

  const prompt = `Original request for information:
${originalRequest}

Current claim description:
${JSON.stringify(currentDescription, null, 2)}

Chat history:
${chatContext}

Based on the entire conversation, please:
1. Update the claim description with all information provided by the user
2. Check if all originally requested information is now complete
3. Return the refined description and either a completion message or the next question

Response format:
- status: "complete" if all requested info is provided, "incomplete" otherwise
- refinedDescription: The updated ClaimDescription incorporating all user feedback
- message: A confirmation message (if complete) or the next specific question (if incomplete)`;

  const { object } = await withAIErrorHandling(() =>
    generateObject({
      model: openai("gpt-5-nano"),
      schema: InterviewResponse,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      maxOutputTokens: 5000,
      maxRetries: 0,
    })
  );

  return object;
}
