
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
  fetchCryptoApisBalances, // Added import
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
  blockstreamClientId: z.string().optional().describe('Optional Blockstream Client ID.'),
  blockstreamClientSecret: z.string().optional().describe('Optional Blockstream Client Secret.'),
  cryptoApisApiKey: z.string().optional().describe('Optional CryptoAPIs.io API key.'), // Added
});
export type GenerateAndCheckSeedPhrasesInput = z.infer<typeof GenerateAndCheckSeedPhrasesInputSchema>;

// Output schema for the Genkit flow, an array of single seed phrase results
const GenerateAndCheckSeedPhrasesOutputSchema = z.array(SingleSeedPhraseResultSchema).nullable();
export type GenerateAndCheckSeedPhrasesOutput = z.infer<typeof GenerateAndCheckSeedPhrasesOutputSchema>;


// Helper function to generate a random seed phrase of varying lengths using CSPRNG for word count selection
function generateRandomSeedPhraseInternal(): { phrase: string; wordCount: number } {
  const validWordCounts = [12, 15, 18, 21, 24];
  const randomByteForWordCount = ethers.randomBytes(1)[0]; 
  const randomWordCountIndex = randomByteForWordCount % validWordCounts.length;
  const wordCount = validWordCounts[randomWordCountIndex];

  let entropyBytesLength: number;
  switch (wordCount) {
    case 12: entropyBytesLength = 16; break; 
    case 15: entropyBytesLength = 20; break; 
    case 18: entropyBytesLength = 24; break; 
    case 21: entropyBytesLength = 28; break; 
    case 24: entropyBytesLength = 32; break; 
    default: 
      console.warn("Flow: Unexpected word count generated, defaulting to 12 words / 16 bytes entropy.");
      entropyBytesLength = 16; 
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
  async (input): Promise<GenerateAndCheckSeedPhrasesOutput> => {
    
    const processSinglePhrase = async (): Promise<SingleSeedPhraseResult | null> => {
      const { phrase, wordCount } = generateRandomSeedPhraseInternal();
      let derivedAddress: string | null = null;
      const walletType: string | null = "EVM (Ethereum-compatible)";
      let derivationError: string | undefined = undefined;

      try {
        const wallet = ethers.Wallet.fromPhrase(phrase);
        derivedAddress = wallet.address;
      } catch (e: any) {
        derivationError = `Derivation failed: ${e.message}`;
        console.log(`Flow: Derivation failed for seed phrase "${phrase.substring(0,20)}...": ${derivationError}`);
         return {
            seedPhrase: phrase,
            wordCount,
            derivedAddress: null,
            walletType: null,
            balances: [],
            error: undefined,
            derivationError: derivationError,
        };
      }

      if (!derivedAddress) { 
        derivationError = "Address derivation unexpectedly resulted in null without an error.";
        console.log(`Flow: Derivation issue for seed phrase "${phrase.substring(0,20)}...": ${derivationError}`);
        return {
            seedPhrase: phrase,
            wordCount,
            derivedAddress: null,
            walletType: null,
            balances: [],
            error: undefined,
            derivationError: derivationError,
        };
      }
      
      const apiCallPromises: Promise<AddressBalanceResult[]>[] = [];

      if (input.etherscanApiKey) {
        apiCallPromises.push(fetchEtherscanBalance(derivedAddress, input.etherscanApiKey));
      }
      if (input.blockcypherApiKey) {
        apiCallPromises.push(fetchBlockcypherBalances(derivedAddress, input.blockcypherApiKey));
      }
      if (input.alchemyApiKey) {
        apiCallPromises.push(fetchAlchemyBalances(derivedAddress, input.alchemyApiKey));
      }
      if (input.blockstreamClientId && input.blockstreamClientSecret) {
        apiCallPromises.push(fetchBlockstreamBalance(derivedAddress, input.blockstreamClientId, input.blockstreamClientSecret));
      } else if (input.blockstreamClientId || input.blockstreamClientSecret) {
        console.warn(`Flow: Blockstream API not called for address ${derivedAddress} as both Client ID and Secret are required.`);
      }
      if (input.cryptoApisApiKey) { // Added
        apiCallPromises.push(fetchCryptoApisBalances(derivedAddress, input.cryptoApisApiKey));
      }


      const collectedApiBalancesNested = await Promise.allSettled(apiCallPromises);
      const collectedApiBalances: AddressBalanceResult[] = [];
      let hasApiError = false;

      collectedApiBalancesNested.forEach(promiseResult => {
        if (promiseResult.status === 'fulfilled') {
          collectedApiBalances.push(...promiseResult.value);
          if (promiseResult.value.some(b => b.dataSource === 'Error')) {
            hasApiError = true;
          }
        } else {
          console.error(`Flow: API call failed for address ${derivedAddress} from phrase "${phrase.substring(0,10)}...": ${promiseResult.reason}`);
          hasApiError = true;
        }
      });
      
      const positiveRealFlowBalances: FlowBalanceResult[] = collectedApiBalances
        .filter(b => b.isRealData && b.balance > 0 && b.dataSource !== 'Error' && b.dataSource !== 'N/A')
        .map(b => ({
          currency: b.currency,
          balance: b.balance,
          dataSource: b.dataSource,
          isRealData: b.isRealData,
        }));

      if (positiveRealFlowBalances.length > 0) {
        return {
          seedPhrase: phrase,
          wordCount,
          derivedAddress,
          walletType,
          balances: positiveRealFlowBalances,
          error: hasApiError ? 'Positive balance(s) found, but some API calls may have failed for other assets.' : undefined,
          derivationError: undefined,
        };
      }
      
      if (!derivationError) {
           console.log(`Flow: No positive balances found for seed phrase "${phrase.substring(0,20)}..." (Address: ${derivedAddress}). API errors: ${hasApiError}. Skipping from results.`);
      }
      return null; 
    };

    const phraseProcessingPromises: Promise<SingleSeedPhraseResult | null>[] = [];
    for (let i = 0; i < input.numSeedPhrases; i++) {
      phraseProcessingPromises.push(processSinglePhrase());
    }

    try {
      const allSettledResults = await Promise.all(phraseProcessingPromises);
      const validResults = allSettledResults.filter(
          result => result !== null && !result.derivationError && result.balances.length > 0
        ) as SingleSeedPhraseResult[];
      
      return validResults.length > 0 ? validResults : [];
    } catch (flowInternalError: any) {
      console.error("CRITICAL INTERNAL ERROR in generateAndCheckSeedPhrasesFlow's parallel execution:", flowInternalError.message, flowInternalError.stack);
      return [];
    }
  }
);

// Exported wrapper function that calls the Genkit flow
export async function generateAndCheckSeedPhrases(
  input: GenerateAndCheckSeedPhrasesInput
): Promise<GenerateAndCheckSeedPhrasesOutput> {
  try {
    const results = await generateAndCheckSeedPhrasesFlow(input);
    return results ?? []; 
  } catch (flowError: any) {
    console.error("CRITICAL ERROR in generateAndCheckSeedPhrasesFlow invocation wrapper:", flowError.message, flowError.stack);
    return []; 
  }
}

    
