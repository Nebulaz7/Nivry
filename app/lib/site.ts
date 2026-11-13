export const SITE = {
  name: "Nivry",
  /** Single source of truth for the standard number. */
  nep: "NEP-XXXX",
  headline: "Mint an agent that holds its own money.",
  subline:
    "One NEP-171 token owns the agent's identity and its treasury. Budget what it can spend, revoke it in a single call, and sell it with the balance and history intact.",
  statement: {
    problem: [
      "An agent can hold funds and sign for itself.",
      "Today you can wrap that agent in an NFT.",
      "But the NFT moves. The wallet stays where it was.",
    ],
    solution: [
      "Nivry makes the token the title.",
      "Treasury and access move with it.",
    ],
  },
  registry: "nivry.testnet",
  treasury: "00000001.nivry.testnet",
  codeHash: "ce3b675e2b3d9ab5a11d8840f0e1cd48471438f6a418ddc3bafce21fca4d8e5e",
  agentName: "Docs Reporter",
  balance: "3.00 NEAR",
  github: "https://github.com/Nebulaz7/Nivry",
} as const;
