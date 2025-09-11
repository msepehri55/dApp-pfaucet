export const faucetAbi = [
  { "type":"event","name":"Donated","inputs":[{"name":"from","type":"address","indexed":true},{"name":"amount","type":"uint256","indexed":false}] },
  { "type":"event","name":"Claimed","inputs":[{"name":"to","type":"address","indexed":true},{"name":"amount","type":"uint256","indexed":false}] },
  { "type":"function","stateMutability":"nonpayable","name":"claimFor","inputs":[{"name":"recipient","type":"address"}],"outputs":[] },
  { "type":"function","stateMutability":"view","name":"lastClaim","inputs":[{"name":"","type":"address"}],"outputs":[{"type":"uint256"}] },
  { "type":"function","stateMutability":"view","name":"payoutAmount","inputs":[],"outputs":[{"type":"uint256"}] },
  { "type":"function","stateMutability":"view","name":"minEligibleBalance","inputs":[],"outputs":[{"type":"uint256"}] },
  { "type":"function","stateMutability":"view","name":"cooldown","inputs":[],"outputs":[{"type":"uint256"}] }
] as const;