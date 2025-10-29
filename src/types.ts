import { z } from "zod";

export const User = z.object({
    name: z.string(),
    email: z.string()
});
export type User = z.infer<typeof User>;


export const ClaimRequest = z.object({
    user: User,
    description: z.string(),
    images: z.array(z.string()),
    amount: z.number().positive(),
});
export type ClaimRequest = z.infer<typeof ClaimRequest>;


export const ClaimResponse = z.object({
    status: z.enum(["approved", "rejected"])
});
export type ClaimResponse = z.infer<typeof ClaimResponse>;


export const ClaimDescription = z.object({
    objectDescription: z.string(),
    damageDescription: z.string(),
    locationOfIncident: z.string(),
    involvedParties: z.string(),
});
export type ClaimDescription = z.infer<typeof ClaimDescription>;


export const CompletenessCheck = z.object({
    complete: z.enum(["complete", "incomplete"]),
    requestForInfo: z.string(),
});
export type CompletenessCheck = z.infer<typeof CompletenessCheck>;


export const InterviewRequest = z.object({
    claimDescription: ClaimDescription,
    requestForInfo: z.string(),
});
export type InterviewRequest = z.infer<typeof InterviewRequest>;


export type Evaluation = {
    status: "approved" | "rejected" | "request_info",
    comment?: string
}
