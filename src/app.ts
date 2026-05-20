import * as restate from "@restatedev/restate-sdk";
import { interviewAgent } from "./interview_agent";
import { imageAnalyzer } from "./image_analyzer";

import { claimAgent } from "./claim_agent";

const port = parseInt(process.argv[2] ?? "9080");

restate.serve({
  services: [claimAgent, interviewAgent, imageAnalyzer],
  port,
});
