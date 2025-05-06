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
  etherscanApiKey: z.string().optional().describe('The Etherscan API key for checking real ETH balances.'),
  blockcypherApiKey: z.string().optional().describe('The BlockCypher API key for checking real ETH balances.'),
  alchemyApiKey: z.string().optional().describe('The Alchemy API key for checking real ETH balances.'),
});
export type GenerateAndCheckSeedPhrasesInput = z.infer<typeof GenerateAndCheckSeedPhrasesInputSchema>;

const SingleSeedPhraseResultSchema = z.object({
  seedPhrase: z.string().describe('The randomly generated seed phrase.'),
  derivedAddress: z.string().describe('The derived Ethereum address.'),
  walletType: z.string().describe('The type of wallet (e.g., Ethereum Virtual Machine).'),
  cryptoName: z.string().describe('The name of the cryptocurrency (e.g., ETH).'),
  balance: z.number().describe('The ETH balance for the derived address.'),
  dataSource: z.string().describe('The source of the balance data (Etherscan, BlockCypher, Alchemy, or N/A).'),
  wordCount: z.number().describe('The number of words in the seed phrase.'),
});

const GenerateAndCheckSeedPhrasesOutputSchema = z.array(SingleSeedPhraseResultSchema);
export type GenerateAndCheckSeedPhrasesOutput = z.infer<typeof GenerateAndCheckSeedPhrasesOutputSchema>;

const ALLOWED_WORD_COUNTS: Array<12 | 15 | 18 | 21 | 24> = [12, 15, 18, 21, 24];

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
      // Should not happen if called with allowed word counts
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
): Promise<{
  seedPhrase: string;
  derivedAddress: string;
  walletType: string;
  cryptoName: string;
  balance: number;
  dataSource: string;
  wordCount: number;
} | null> { // Return null if error or no balance
  try {
    const wallet = ethers.Wallet.fromPhrase(seedPhrase);
    const derivedAddress = wallet.address;
    const walletType = 'Ethereum Virtual Machine'; // Standard for ethers.js derived wallets
    const cryptoName = 'ETH'; // Assuming Ethereum for now

    let balance = 0;
    let dataSource = 'N/A';

    // Try Etherscan API
    if (etherscanApiKey) {
      try {
        const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
        const balanceBigInt = await provider.getBalance(derivedAddress);
        const balanceEth = ethers.formatEther(balanceBigInt);
        balance = parseFloat(balanceEth);
        dataSource = 'Etherscan API';
        if (balance > 0) {
          return { seedPhrase, derivedAddress, walletType, cryptoName, balance, dataSource, wordCount };
        }
      } catch (etherscanError: any) {
        console.warn(`Etherscan API error for ${derivedAddress}: ${etherscanError.message}. Trying next available API or skipping.`);
        dataSource = 'N/A'; 
        balance = 0;
      }
    }

    // Try BlockCypher API if Etherscan failed/skipped or no Etherscan key and balance is still 0
    if (blockcypherApiKey && balance === 0) {
      try {
        const response = await fetch(`https://api.blockcypher.com/v1/eth/main/addrs/${derivedAddress}/balance?token=${blockcypherApiKey}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error parsing BlockCypher error" }));
          console.warn(`BlockCypher API error for ${derivedAddress}: ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}. Trying next available API or skipping.`);
        } else {
            const data = await response.json();
            const balanceEth = ethers.formatEther(BigInt(data.final_balance || data.balance)); // final_balance for confirmed
            balance = parseFloat(balanceEth);
            dataSource = 'BlockCypher API';
            if (balance > 0) {
                 return { seedPhrase, derivedAddress, walletType, cryptoName, balance, dataSource, wordCount };
            }
        }
      } catch (blockcypherError: any) {
        console.warn(`BlockCypher API error for ${derivedAddress}: ${blockcypherError.message}. Trying next available API or skipping.`);
      }
    }

    // Try Alchemy API if previous attempts failed or no other keys and balance is still 0
    if (alchemyApiKey && balance === 0) {
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
                    balance = parseFloat(balanceEth);
                    dataSource = 'Alchemy API';
                    if (balance > 0) {
                        return { seedPhrase, derivedAddress, walletType, cryptoName, balance, dataSource, wordCount };
                    }
                } else if (data.error) {
                     console.warn(`Alchemy API returned error for ${derivedAddress}: ${data.error.message}`);
                }
            }
        } catch (alchemyError: any) {
            console.warn(`Alchemy API error for ${derivedAddress}: ${alchemyError.message}.`);
        }
    }
    
    if (balance > 0) { // This check is redundant if we return inside each successful API block, but good for safety.
         return { seedPhrase, derivedAddress, walletType, cryptoName, balance, dataSource, wordCount };
    }
    return null; // No balance found or all API attempts failed

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
        console.warn("No API keys provided for generateAndCheckSeedPhrasesFlow. Balances will not be fetched realistically.");
    }

    for (let i = 0; i < numSeedPhrases; i++) {
      const randomIndex = Math.floor(Math.random() * ALLOWED_WORD_COUNTS.length);
      const currentWordCount = ALLOWED_WORD_COUNTS[randomIndex];
      const seedPhrase = generateRandomSeedPhrase(currentWordCount);
      
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

    