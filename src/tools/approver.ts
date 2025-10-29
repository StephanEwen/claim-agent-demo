import http from 'http';
import { z } from 'zod';
import { ClaimDescription } from '../types';

const ApproveClaimRequest = z.object({
    claimDescription: ClaimDescription,
    callbackId: z.string(),
});
type ApproveClaimRequest = z.infer<typeof ApproveClaimRequest>;

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 55443;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const jsonPayload = JSON.parse(body);
        
        // Validate against ApproveClaimRequest schema
        const validationResult = ApproveClaimRequest.safeParse(jsonPayload);
        
        if (!validationResult.success) {
          console.error('Invalid request schema:');
          console.error(validationResult.error.format());
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'error', 
            message: 'Invalid request schema',
            errors: validationResult.error.format()
          }));
          return;
        }

        const request = validationResult.data;
        
        // Pretty print the ClaimDescription
        console.log('\n=== CLAIM APPROVAL REQUEST ===');
        console.log('\nClaim Description:');
        console.log(`  Object:         ${request.claimDescription.objectDescription}`);
        console.log(`  Damage:         ${request.claimDescription.damageDescription}`);
        console.log(`  Location:       ${request.claimDescription.locationOfIncident}`);
        console.log(`  Involved Party: ${request.claimDescription.involvedParties}`);
        console.log('==============================\n');
        console.log('\n');
        console.log('\nTo APPROVE the claim, call:');
        console.log(`  curl localhost:8080/restate/awakeables/${request.callbackId}/resolve --json '{ "status": "approved" }'`);
        console.log('\nTo REJECT the claim, call:');
        console.log(`  curl localhost:8080/restate/awakeables/${request.callbackId}/resolve --json '{"status": "rejected", "comment": "<your reason>" }'`);
        console.log('\nTo REQUEST MORE INFORMATION, call:');
        console.log(`  curl localhost:8080/restate/awakeables/${request.callbackId}/resolve --json '{"status": "request_info", "comment": "<your question>" }'`);
        console.log('==============================\n');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', message: 'Payload received' }));
      } catch (error) {
        console.error('Error parsing JSON:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Method not allowed' }));
  }
});

server.listen(PORT, () => {
  console.log(`Approver server listening on port ${PORT}\n\n`);
});

