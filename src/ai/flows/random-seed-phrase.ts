'use server';
/**
 * @fileOverview Flow for generating random seed phrases, deriving addresses, and checking balances.
 *
 * - generateAndCheckSeedPhrases - A function that handles the generation and checking process.
 * - GenerateAndCheckSeedPhrasesInput - The input type for the function.
 * - GenerateAndCheckSeedPhrasesOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { ethers } from 'ethers';
import {
  fetchEtherscanBalance,
  fetchBlockcypherBalances,
  fetchAlchemyBalances,
  fetchBlockstreamBalance,
  type AddressBalanceResult,
} from '@/app/actions';

// Schema for a single balance entry returned by the flow
const FlowBalanceResultSchema = z.object({
  currency: z.string().describe('The cryptocurrency symbol or name.'),
  balance: z.number().describe('The amount of the cryptocurrency.'),
  dataSource: z.string().describe('The API source from which the balance was fetched (e.g., "Etherscan API").'),
  isRealData: z.boolean().describe('Indicates if the balance data is from a real API call or simulated.'),
});
export type FlowBalanceResult = z.infer<typeof FlowBalanceResultSchema>;

// Schema for the result of a single seed phrase check by the flow
const SingleSeedPhraseResultSchema = z.object({
  seedPhrase: z.string().describe('The generated seed phrase.'),
  wordCount: z.number().int().describe('Number of words in the seed phrase (12, 15, 18, 21, or 24).'),
  derivedAddress: z.string().nullable().describe('The EVM-compatible address derived from the seed phrase.'),
  walletType: z.string().nullable().describe('Type of wallet, typically "EVM (Ethereum-compatible)".'),
  balances: z.array(FlowBalanceResultSchema).describe('Array of balances found for the derived address with non-zero amounts from real APIs.'),
  error: z.string().optional().describe('General error message if processing for this seed phrase failed (e.g. partial API failure).'),
  derivationError: z.string().optional().describe('Error message if address derivation from the seed phrase failed.'),
});
export type SingleSeedPhraseResult = z.infer<typeof SingleSeedPhraseResultSchema>;

// Input schema for the Genkit flow
const GenerateAndCheckSeedPhrasesInputSchema = z.object({
  numSeedPhrases: z.number().int().min(1).max(100).describe('Number of seed phrases to generate and check (1-100).'),
  etherscanApiKey: z.string().optional().describe('Optional Etherscan API key.'),
  blockcypherApiKey: z.string().optional().describe('Optional BlockCypher API key.'),
  alchemyApiKey: z.string().optional().describe('Optional Alchemy API key.'),
  blockstreamApiKey: z.string().optional().describe('Optional Blockstream API key (Note: public Blockstream API may not strictly require a key for balance checks).'),
});
export type GenerateAndCheckSeedPhrasesInput = z.infer<typeof GenerateAndCheckSeedPhrasesInputSchema>;

// Output schema for the Genkit flow, an array of single seed phrase results
const GenerateAndCheckSeedPhrasesOutputSchema = z.array(SingleSeedPhraseResultSchema).nullable(); // Allow null for critical flow errors
export type GenerateAndCheckSeedPhrasesOutput = z.infer<typeof GenerateAndCheckSeedPhrasesOutputSchema>;


// Helper function to generate a random seed phrase of varying lengths
function generateRandomSeedPhraseInternal(): { phrase: string; wordCount: number } {
  const validWordCounts = [12, 15, 18, 21, 24];
  const randomWordCountIndex = Math.floor(Math.random() * validWordCounts.length);
  const wordCount = validWordCounts[randomWordCountIndex];

  let entropyBytesLength: number;
  switch (wordCount) {
    case 12: entropyBytesLength = 16; break; // 128 bits
    case 15: entropyBytesLength = 20; break; // 160 bits
    case 18: entropyBytesLength = 24; break; // 192 bits
    case 21: entropyBytesLength = 28; break; // 224 bits
    case 24: entropyBytesLength = 32; break; // 256 bits
    default: entropyBytesLength = 16; // Default to 12 words / 128 bits
  }
  const entropy = ethers.randomBytes(entropyBytesLength);
  const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
  return { phrase: mnemonic.phrase, wordCount };
}

// The Genkit flow definition
const generateAndCheckSeedPhrasesFlow = ai.defineFlow(
  {
    name: 'generateAndCheckSeedPhrasesFlow',
    inputSchema: GenerateAndCheckSeedPhrasesInputSchema,
    outputSchema: GenerateAndCheckSeedPhrasesOutputSchema,
  },
  async (input) => {
    const flowResults: SingleSeedPhraseResult[] = [];

    for (let i = 0; i < input.numSeedPhrases; i++) {
      const { phrase, wordCount } = generateRandomSeedPhraseInternal();
      let derivedAddress: string | null = null;
      const walletType: string | null = "EVM (Ethereum-compatible)";
      // let derivationErrorMsg: string | undefined = undefined; // Keep for internal logging if needed
      const collectedApiBalances: AddressBalanceResult[] = [];
      let hasApiError = false;

      try {
        const wallet = ethers.Wallet.fromPhrase(phrase);
        derivedAddress = wallet.address;
      } catch (e: any) {
        console.error(`Flow: Error deriving wallet from seed phrase "${phrase.substring(0,20)}...": ${e.message}`);
        // derivationErrorMsg = e.message || 'Unknown derivation error';
        // If derivation fails, log it and skip to the next seed phrase.
        continue;
      }

      if (derivedAddress) {
        try {
            if (input.etherscanApiKey) {
              const balances = await fetchEtherscanBalance(derivedAddress, input.etherscanApiKey);
              collectedApiBalances.push(...balances);
              if (balances.some(b => b.dataSource === 'Error')) hasApiError = true;
            }
            if (input.blockcypherApiKey) {
              const balances = await fetchBlockcypherBalances(derivedAddress, input.blockcypherApiKey);
              collectedApiBalances.push(...balances);
              if (balances.some(b => b.dataSource === 'Error')) hasApiError = true;
            }
            if (input.alchemyApiKey) {
              const balances = await fetchAlchemyBalances(derivedAddress, input.alchemyApiKey);
              collectedApiBalances.push(...balances);
              if (balances.some(b => b.dataSource === 'Error')) hasApiError = true;
            }
            const balances = await fetchBlockstreamBalance(derivedAddress, input.blockstreamApiKey);
            collectedApiBalances.push(...balances);
            if (balances.some(b => b.dataSource === 'Error')) hasApiError = true;
        } catch (apiError: any) {
            console.error(`Flow: Critical error during API calls for address ${derivedAddress} from seed "${phrase.substring(0,20)}...": ${apiError.message}`, apiError.stack);
            hasApiError = true; // Mark that an API error occurred
        }
      }

      const positiveRealFlowBalances: FlowBalanceResult[] = collectedApiBalances
        .filter(b => b.isRealData && b.balance > 0 && b.dataSource !== 'Error' && b.dataSource !== 'N/A')
        .map(b => ({
          currency: b.currency,
          balance: b.balance,
          dataSource: b.dataSource,
          isRealData: b.isRealData,
        }));

      // Only add to flowResults if there are positive balances.
      if (positiveRealFlowBalances.length > 0) {
        flowResults.push({
          seedPhrase: phrase,
          wordCount,
          derivedAddress,
          walletType,
          balances: positiveRealFlowBalances,
          // derivationError: derivationErrorMsg, // No longer explicitly needed in output if we only return success
          error: hasApiError ? 'Positive balance(s) found, but some API calls may have failed for other assets.' : undefined,
        });
      } else {
         // Log if no positive balances, even if API errors occurred.
         console.log(`Flow: No positive balances found for seed phrase "${phrase.substring(0,20)}..." (Address: ${derivedAddress}). API errors: ${hasApiError}. Skipping.`);
      }
    }
    return flowResults.length > 0 ? flowResults : []; // Return empty array if no results with positive balances
  }
);

// Exported wrapper function that calls the Genkit flow
export async function generateAndCheckSeedPhrases(
  input: GenerateAndCheckSeedPhrasesInput
): Promise<GenerateAndCheckSeedPhrasesOutput> {
  try {
    const results = await generateAndCheckSeedPhrasesFlow(input);
    // If results is an empty array (no positive balances found), it's still a valid successful flow execution.
    return results;
  } catch (flowError: any) {
    console.error("CRITICAL ERROR in generateAndCheckSeedPhrasesFlow execution:", flowError.message, flowError.stack);
    // Return null to indicate a critical flow failure, this will be filtered out by the frontend
    return null;
  }
}
