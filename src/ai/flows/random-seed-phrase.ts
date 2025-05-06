'use server';
/**
 * @fileOverview A flow for generating random seed phrases, deriving addresses, and checking their balances using Etherscan and BlockCypher APIs.
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
});
export type GenerateAndCheckSeedPhrasesInput = z.infer<typeof GenerateAndCheckSeedPhrasesInputSchema>;

const SingleSeedPhraseResultSchema = z.object({
  seedPhrase: z.string().describe('The randomly generated seed phrase.'),
  derivedAddress: z.string().describe('The derived Ethereum address.'),
  walletType: z.string().describe('The type of wallet (e.g., Ethereum Virtual Machine).'),
  cryptoName: z.string().describe('The name of the cryptocurrency (e.g., ETH).'),
  balance: z.number().describe('The ETH balance for the derived address.'),
  dataSource: z.string().describe('The source of the balance data (Etherscan, BlockCypher, or N/A).'),
});

const GenerateAndCheckSeedPhrasesOutputSchema = z.array(SingleSeedPhraseResultSchema);
export type GenerateAndCheckSeedPhrasesOutput = z.infer<typeof GenerateAndCheckSeedPhrasesOutputSchema>;

// Function to generate a random seed phrase
function generateRandomSeedPhrase(): string {
  // Generate 16 bytes of entropy for a 12-word mnemonic
  const randomEntropy = ethers.randomBytes(16);
  const mnemonic = ethers.Mnemonic.fromEntropy(randomEntropy);
  return mnemonic.phrase;
}

// Function to derive address and check balance for a single seed phrase
async function deriveAddressAndCheckBalance(
  seedPhrase: string,
  etherscanApiKey?: string,
  blockcypherApiKey?: string
): Promise<{
  seedPhrase: string;
  derivedAddress: string;
  walletType: string;
  cryptoName: string;
  balance: number;
  dataSource: string;
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
          return { seedPhrase, derivedAddress, walletType, cryptoName, balance, dataSource };
        }
      } catch (etherscanError: any) {
        console.warn(`Etherscan API error for ${derivedAddress}: ${etherscanError.message}. Trying BlockCypher or skipping.`);
        // Fall through to BlockCypher
        dataSource = 'N/A'; // Reset datasource if Etherscan failed
        balance = 0;
      }
    }

    // Try BlockCypher API if Etherscan failed/skipped or no Etherscan key and balance is still 0
    if (blockcypherApiKey && balance === 0) {
      try {
        const response = await fetch(`https://api.blockcypher.com/v1/eth/main/addrs/${derivedAddress}/balance?token=${blockcypherApiKey}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error parsing BlockCypher error" }));
          console.warn(`BlockCypher API error for ${derivedAddress}: ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}`);
          // If BlockCypher fails, we don't want to return this as a success
        } else {
            const data = await response.json();
            const balanceEth = ethers.formatEther(BigInt(data.balance)); // BlockCypher returns balance in Wei as a number
            balance = parseFloat(balanceEth);
            dataSource = 'BlockCypher API';
            if (balance > 0) {
                 return { seedPhrase, derivedAddress, walletType, cryptoName, balance, dataSource };
            }
        }
      } catch (blockcypherError: any) {
        console.warn(`BlockCypher API error for ${derivedAddress}: ${blockcypherError.message}.`);
      }
    }
    
    // If balance is still 0 after trying available APIs, or if no APIs were tried/successful.
    if (balance > 0) {
         return { seedPhrase, derivedAddress, walletType, cryptoName, balance, dataSource };
    }
    // If balance is 0, don't return it.
    return null;

  } catch (error: any) {
    // This catch is mainly for derivation errors. API errors are handled above.
    console.error(`Error deriving address for seed phrase: ${error.message}`);
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
    const { numSeedPhrases, etherscanApiKey, blockcypherApiKey } = input;
    const results: GenerateAndCheckSeedPhrasesOutput = [];

    if (!etherscanApiKey && !blockcypherApiKey) {
        console.warn("No API keys provided for generateAndCheckSeedPhrasesFlow. Balances will not be fetched.");
        // Depending on requirements, you might want to throw an error or return empty
    }

    for (let i = 0; i < numSeedPhrases; i++) {
      const seedPhrase = generateRandomSeedPhrase();
      // Only proceed if at least one API key is available
      if (etherscanApiKey || blockcypherApiKey) {
        const result = await deriveAddressAndCheckBalance(seedPhrase, etherscanApiKey, blockcypherApiKey);
        if (result && result.balance > 0) { // Only include wallets with non-empty balances
          results.push(result);
        }
      }
    }
    return results;
  }
);
