import * as restate from "@restatedev/restate-sdk";
import { claimAgent } from "./claim_agent";
import { interviewAgent } from "./interview_agent";


restate.serve({
  services: [claimAgent, interviewAgent],
  port: 9080,
});
