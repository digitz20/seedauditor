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
  etherscanApiKey: z.string().describe('The Etherscan API key for checking real ETH balances.'),
  blockcypherApiKey: z.string().describe('The BlockCypher API key for checking real ETH balances.'),
});
export type GenerateAndCheckSeedPhrasesInput = z.infer<typeof GenerateAndCheckSeedPhrasesInputSchema>;

const GenerateAndCheckSeedPhrasesOutputSchema = z.array(
  z.object({
    seedPhrase: z.string().describe('The randomly generated seed phrase.'),
    derivedAddress: z.string().describe('The derived Ethereum address.'),
    walletType: z.string().describe('The type of wallet (e.g., Ethereum Virtual Machine).'),
    cryptoName: z.string().describe('The name of the cryptocurrency (e.g., ETH).'),
    balance: z.number().describe('The ETH balance for the derived address.'),
    dataSource: z.string().describe('The source of the balance data (Etherscan, BlockCypher).'),
  })
);
export type GenerateAndCheckSeedPhrasesOutput = z.infer<typeof GenerateAndCheckSeedPhrasesOutputSchema>;

// Function to generate a random seed phrase
function generateRandomSeedPhrase(): string {
  const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(16).toString('hex'));
  return mnemonic;
}

// Function to derive address and check balance for a single seed phrase
async function deriveAddressAndCheckBalance(
  seedPhrase: string,
  etherscanApiKey: string,
  blockcypherApiKey: string
): Promise<{
  seedPhrase: string;
  derivedAddress: string;
  walletType: string;
  cryptoName: string;
  balance: number;
  dataSource: string;
}> {
  try {
    const wallet = ethers.Wallet.fromPhrase(seedPhrase);
    const derivedAddress = wallet.address;
    const walletType = 'Ethereum Virtual Machine';
    const cryptoName = 'ETH';

    let balanceData = { balance: 0, dataSource: 'Unknown' };

    // Try Etherscan API
    if (etherscanApiKey) {
      try {
        const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
        const balanceBigInt = await provider.getBalance(derivedAddress);
        const balanceEth = ethers.formatEther(balanceBigInt);
        balanceData = { balance: parseFloat(balanceEth), dataSource: 'Etherscan API' };
      } catch (etherscanError: any) {
        console.error(`Etherscan API error for ${derivedAddress}: ${etherscanError.message}. Trying BlockCypher.`);
        // Fall through to BlockCypher
      }
    }

    // Try BlockCypher API if Etherscan failed or no Etherscan key
    if (balanceData.dataSource === 'Unknown' && blockcypherApiKey) {
      try {
        const response = await fetch(`https://api.blockcypher.com/v1/eth/main/addrs/${derivedAddress}/balance?token=${blockcypherApiKey}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(`BlockCypher API error: ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        // BlockCypher returns balance in Wei as a number.
        const balanceEth = ethers.formatEther(BigInt(data.balance));
        balanceData = { balance: parseFloat(balanceEth), dataSource: 'BlockCypher API' };
      } catch (blockcypherError: any) {
        console.error(`BlockCypher API error for ${derivedAddress}: ${blockcypherError.message}.`);
      }
    }

    return {
      seedPhrase,
      derivedAddress,
      walletType,
      cryptoName,
      balance: balanceData.balance,
      dataSource: balanceData.dataSource,
    };
  } catch (error: any) {
    console.error(`Error processing seed phrase: ${error.message}`);
    return {
      seedPhrase,
      derivedAddress: 'N/A',
      walletType: 'N/A',
      cryptoName: 'ETH',
      balance: 0,
      dataSource: 'N/A',
    };
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
  async input => {
    const { numSeedPhrases, etherscanApiKey, blockcypherApiKey } = input;
    const results: GenerateAndCheckSeedPhrasesOutput = [];

    for (let i = 0; i < numSeedPhrases; i++) {
      const seedPhrase = generateRandomSeedPhrase();
      const result = await deriveAddressAndCheckBalance(seedPhrase, etherscanApiKey, blockcypherApiKey);
      if (result.balance > 0) {
        results.push(result); // Only include wallets with non-empty balances
      }
    }

    return results;
  }
);
