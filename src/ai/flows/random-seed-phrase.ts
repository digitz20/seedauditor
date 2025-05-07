'use server';
/**
 * @fileOverview A flow for generating random seed phrases of various lengths, deriving addresses, and checking their balances using Etherscan, BlockCypher, and Alchemy APIs.
 *
 * - generateAndCheckSeedPhrases - A function that handles the seed phrase generation and balance checking process.
 * - GenerateAndCheckSeedPhrasesInput - The input type for the generateAndCheckSeedPhrases function.
 * - GenerateAndCheckSeedPhrasesOutput - The return type for the generateAndCheckSeedPhrases function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { ethers } from 'ethers';

const GenerateAndCheckSeedPhrasesInputSchema = z.object({
  numSeedPhrases: z.number().describe('The number of random seed phrases to generate.'),
  etherscanApiKey: z.string().optional().describe('The Etherscan API key for checking ETH balances.'),
  blockcypherApiKey: z.string().optional().describe('The BlockCypher API key for checking various crypto balances (ETH, BTC, LTC, DOGE, DASH).'),
  alchemyApiKey: z.string().optional().describe('The Alchemy API key for checking ETH balances.'),
});
export type GenerateAndCheckSeedPhrasesInput = z.infer<typeof GenerateAndCheckSeedPhrasesInputSchema>;

const SingleSeedPhraseResultSchema = z.object({
  seedPhrase: z.string().describe('The randomly generated seed phrase.'),
  derivedAddress: z.string().describe('The derived Ethereum address.'),
  walletType: z.string().describe('The type of wallet (e.g., Ethereum Virtual Machine).'),
  cryptoName: z.string().describe('The name of the cryptocurrency (e.g., ETH, BTC).'),
  balance: z.number().describe('The balance for the derived address in its cryptocurrency.'),
  dataSource: z.string().describe('The source of the balance data (Etherscan, BlockCypher, Alchemy, or N/A).'),
  wordCount: z.number().describe('The number of words in the seed phrase.'),
});

const GenerateAndCheckSeedPhrasesOutputSchema = z.array(SingleSeedPhraseResultSchema);
export type GenerateAndCheckSeedPhrasesOutput = z.infer<typeof GenerateAndCheckSeedPhrasesOutputSchema>;

const ALLOWED_WORD_COUNTS: Array<12 | 15 | 18 | 21 | 24> = [12, 15, 18, 21, 24];
const BLOCKCYPHER_COINS: string[] = ['eth', 'btc', 'ltc', 'doge', 'dash']; // Coins BlockCypher supports

// Function to generate a random seed phrase of a given length
function generateRandomSeedPhrase(wordCount: 12 | 15 | 18 | 21 | 24): string {
  let entropyBytes: number;
  switch (wordCount) {
    case 12: entropyBytes = 16; break; // 128 bits
    case 15: entropyBytes = 20; break; // 160 bits
    case 18: entropyBytes = 24; break; // 192 bits
    case 21: entropyBytes = 28; break; // 224 bits
    case 24: entropyBytes = 32; break; // 256 bits
    default:
      console.error(`Invalid word count for seed phrase generation: ${wordCount}. Defaulting to 12 words.`);
      entropyBytes = 16;
  }
  const randomEntropy = ethers.randomBytes(entropyBytes);
  const mnemonic = ethers.Mnemonic.fromEntropy(randomEntropy);
  return mnemonic.phrase;
}

// Function to derive address and check balance for a single seed phrase
async function deriveAddressAndCheckBalance(
  seedPhrase: string,
  wordCount: number,
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string
): Promise<z.infer<typeof SingleSeedPhraseResultSchema> | null> { // Return null if error or no balance
  try {
    const wallet = ethers.Wallet.fromPhrase(seedPhrase);
    const derivedAddress = wallet.address;
    const walletType = 'Ethereum Virtual Machine'; // Standard for ethers.js derived wallets - this remains EVM specific

    // Try Etherscan API (ETH only)
    if (etherscanApiKey) {
      try {
        const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
        const balanceBigInt = await provider.getBalance(derivedAddress);
        const balanceEth = ethers.formatEther(balanceBigInt);
        const balance = parseFloat(balanceEth);
        if (balance > 0) {
          return { 
            seedPhrase, 
            derivedAddress, 
            walletType, 
            cryptoName: 'ETH', 
            balance, 
            dataSource: 'Etherscan API', 
            wordCount 
          };
        }
      } catch (etherscanError: any) {
        console.warn(`Etherscan API error for ${derivedAddress}: ${etherscanError.message}. Trying next available API or skipping.`);
      }
    }

    // Try BlockCypher API for multiple coins
    if (blockcypherApiKey) {
      for (const coin of BLOCKCYPHER_COINS) {
        try {
          // Note: Using an EVM address (derivedAddress) to query non-EVM chains on BlockCypher
          // might not yield meaningful results or could error. This is per user request.
          const response = await fetch(`https://api.blockcypher.com/v1/${coin}/main/addrs/${derivedAddress}/balance?token=${blockcypherApiKey}`);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Unknown error parsing BlockCypher error for ${coin.toUpperCase()}` }));
            console.warn(`BlockCypher API error for ${derivedAddress} (${coin.toUpperCase()}): ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}.`);
            continue; // Try next coin
          }
          const data = await response.json();
          // BlockCypher returns balance in satoshis or smallest unit.
          // For ETH it's wei. For BTC it's satoshis.
          // We need to adjust the formatting based on the coin.
          let balanceCoin = 0;
          const balanceInSmallestUnit = BigInt(data.final_balance || data.balance || 0);

          if (balanceInSmallestUnit > 0) {
             // For simplicity, assuming 18 decimals for ETH-like and 8 for BTC-like if not ETH
             // This is a simplification; real applications would need precise decimal counts per asset.
            const decimals = (coin.toLowerCase() === 'eth') ? 18 : 8;
            balanceCoin = parseFloat(ethers.formatUnits(balanceInSmallestUnit, decimals));
          }


          if (balanceCoin > 0) {
            return { 
              seedPhrase, 
              derivedAddress, 
              walletType, // Remains EVM specific
              cryptoName: coin.toUpperCase(), 
              balance: balanceCoin, 
              dataSource: 'BlockCypher API', 
              wordCount 
            };
          }
        } catch (blockcypherError: any) {
          console.warn(`BlockCypher API error for ${derivedAddress} (${coin.toUpperCase()}): ${blockcypherError.message}.`);
        }
      }
    }

    // Try Alchemy API (ETH only)
    if (alchemyApiKey) {
        try {
            const alchemyUrl = `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;
            const requestBody = {
                jsonrpc: "2.0",
                id: 1,
                method: "eth_getBalance",
                params: [derivedAddress, "latest"],
            };
            const response = await fetch(alchemyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Unknown error parsing Alchemy error" }));
                console.warn(`Alchemy API error for ${derivedAddress}: ${response.status} ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
            } else {
                const data = await response.json();
                if (data.result) {
                    const balanceEth = ethers.formatEther(BigInt(data.result));
                    const balance = parseFloat(balanceEth);
                    if (balance > 0) {
                        return { 
                            seedPhrase, 
                            derivedAddress, 
                            walletType, 
                            cryptoName: 'ETH', 
                            balance, 
                            dataSource: 'Alchemy API', 
                            wordCount 
                        };
                    }
                } else if (data.error) {
                     console.warn(`Alchemy API returned error for ${derivedAddress}: ${data.error.message}`);
                }
            }
        } catch (alchemyError: any) {
            console.warn(`Alchemy API error for ${derivedAddress}: ${alchemyError.message}.`);
        }
    }
    
    return null; // No balance found or all API attempts failed/returned zero

  } catch (error: any) {
    console.error(`Error deriving address for seed phrase "${seedPhrase.substring(0,15)}...": ${error.message}`);
    return null;
  }
}

export async function generateAndCheckSeedPhrases(input: GenerateAndCheckSeedPhrasesInput): Promise<GenerateAndCheckSeedPhrasesOutput> {
  return generateAndCheckSeedPhrasesFlow(input);
}

const generateAndCheckSeedPhrasesFlow = ai.defineFlow(
  {
    name: 'generateAndCheckSeedPhrasesFlow',
    inputSchema: GenerateAndCheckSeedPhrasesInputSchema,
    outputSchema: GenerateAndCheckSeedPhrasesOutputSchema,
  },
  async (input) => {
    const { numSeedPhrases, etherscanApiKey, blockcypherApiKey, alchemyApiKey } = input;
    const results: GenerateAndCheckSeedPhrasesOutput = [];

    if (!etherscanApiKey && !blockcypherApiKey && !alchemyApiKey) {
        console.warn("No API keys provided for generateAndCheckSeedPhrasesFlow. Balances will not be fetched realistically (except for potential BlockCypher public rate limits if any).");
    }

    let phrasesChecked = 0;
    while (phrasesChecked < numSeedPhrases) {
      const randomIndex = Math.floor(Math.random() * ALLOWED_WORD_COUNTS.length);
      const currentWordCount = ALLOWED_WORD_COUNTS[randomIndex];
      const seedPhrase = generateRandomSeedPhrase(currentWordCount);
      phrasesChecked++;
      
      // Only proceed if at least one API key is available to attempt real balance check
      if (etherscanApiKey || blockcypherApiKey || alchemyApiKey) {
        const result = await deriveAddressAndCheckBalance(seedPhrase, currentWordCount, etherscanApiKey, blockcypherApiKey, alchemyApiKey);
        if (result && result.balance > 0) { 
          results.push(result);
        }
      }
      // If no API keys, we don't add any results as per the requirement to only show non-empty real balances.
    }
    return results;
  }
);
