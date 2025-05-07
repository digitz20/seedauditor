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
  error: z.string().optional().describe('General error message if processing for this seed phrase failed.'),
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
const GenerateAndCheckSeedPhrasesOutputSchema = z.array(SingleSeedPhraseResultSchema);
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
      let derivationError: string | undefined = undefined;
      const collectedApiBalances: AddressBalanceResult[] = [];
      let hasApiError = false;

      try {
        const wallet = ethers.Wallet.fromPhrase(phrase);
        derivedAddress = wallet.address;
      } catch (e: any) {
        console.error(`Flow: Error deriving wallet from seed phrase "${phrase.substring(0,20)}...": ${e.message}`);
        derivationError = e.message || 'Unknown derivation error';
        // Push result with derivation error if no positive balances are found later
        // For now, we collect all errors and decide to push later
        // flowResults.push({ seedPhrase: phrase, wordCount, derivedAddress: null, walletType: null, balances: [], derivationError, error: 'Failed to derive wallet.' });
        // continue; // If we must have an address, we'd continue. Otherwise, we might still want to report this.
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
            // Blockstream API for BTC.
            const balances = await fetchBlockstreamBalance(derivedAddress, input.blockstreamApiKey);
            collectedApiBalances.push(...balances);
            if (balances.some(b => b.dataSource === 'Error')) hasApiError = true;
        } catch (apiError: any) {
            console.error(`Flow: Critical error during API calls for address ${derivedAddress} from seed "${phrase.substring(0,20)}...": ${apiError.message}`, apiError.stack);
            hasApiError = true;
            // This general catch might indicate a problem with one of the fetch functions themselves or an unhandled promise rejection.
            // We will rely on hasApiError to potentially push this result even if no positive balances.
        }
      }

      // Filter for positive balances from real API data sources and map to FlowBalanceResult
      const positiveRealFlowBalances: FlowBalanceResult[] = collectedApiBalances
        .filter(b => b.isRealData && b.balance > 0 && b.dataSource !== 'Error' && b.dataSource !== 'N/A')
        .map(b => ({
          currency: b.currency,
          balance: b.balance,
          dataSource: b.dataSource,
          isRealData: b.isRealData,
        }));

      let overallError: string | undefined = undefined;
      if (derivationError && positiveRealFlowBalances.length === 0) {
          overallError = 'Failed to derive wallet.';
      } else if (hasApiError && positiveRealFlowBalances.length === 0 && !derivationError) {
          overallError = 'API error(s) occurred during balance check.';
      }


      // Add to flowResults if there are positive balances, or if there was a derivation/API error and no positive balances.
      if (positiveRealFlowBalances.length > 0 || overallError) {
        flowResults.push({
          seedPhrase: phrase,
          wordCount,
          derivedAddress,
          walletType,
          balances: positiveRealFlowBalances,
          derivationError: derivationError, 
          error: overallError,
        });
      }
    }
    return flowResults;
  }
);

// Exported wrapper function that calls the Genkit flow
export async function generateAndCheckSeedPhrases(
  input: GenerateAndCheckSeedPhrasesInput
): Promise<GenerateAndCheckSeedPhrasesOutput> {
  try {
    return await generateAndCheckSeedPhrasesFlow(input);
  } catch (flowError: any) {
    console.error("CRITICAL ERROR in generateAndCheckSeedPhrasesFlow execution:", flowError.message, flowError.stack);
    // Return an empty array or a specific error structure if the flow itself crashes
    // This helps prevent the "unexpected response" from Next.js if the entire flow fails
    return [{
        seedPhrase: "FLOW_EXECUTION_ERROR",
        wordCount: 0,
        derivedAddress: null,
        walletType: null,
        balances: [],
        error: `Genkit flow failed: ${flowError.message}`,
        derivationError: undefined,
    }];
  }
}
