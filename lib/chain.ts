import { defineChain } from "viem";

export const zenchainTestnet = defineChain({
  id: 8408,
  name: "Zenchain Testnet",
  nativeCurrency: { name: "Zenchain", symbol: "ZTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://zenchain-testnet.api.onfinality.io/public"] },
    public: { http: ["https://zenchain-testnet.api.onfinality.io/public"] }
  },
  blockExplorers: {
    default: { name: "Zentrace", url: "https://zentrace.io" }
  }
});