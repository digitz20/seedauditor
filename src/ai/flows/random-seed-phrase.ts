'use server';
/**
 * @fileOverview A flow for generating random seed phrases of various lengths, deriving addresses, and checking their balances using Etherscan, BlockCypher, Alchemy, and Blockstream APIs.
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
  alchemyApiKey: z.string().optional().describe('The Alchemy API key for checking various EVM-compatible chain balances (ETH, MATIC, etc.).'),
  blockstreamApiKey: z.string().optional().describe('The Blockstream API key for checking BTC balances (Note: public API, key usually not needed).'),
});
export type GenerateAndCheckSeedPhrasesInput = z.infer<typeof GenerateAndCheckSeedPhrasesInputSchema>;

const BalanceDetailSchema = z.object({
  cryptoName: z.string().describe('The name/symbol of the cryptocurrency and network if applicable (e.g., ETH, MATIC, ETH (Arbitrum), BTC).'),
  balance: z.number().describe('The balance for the derived address in its cryptocurrency.'),
  dataSource: z.string().describe('The source of the balance data (Etherscan API, BlockCypher API, Alchemy API, Blockstream API, or N/A).'),
});

const SingleSeedPhraseResultSchema = z.object({
  seedPhrase: z.string().describe('The randomly generated seed phrase.'),
  derivedAddress: z.string().describe('The derived Ethereum Virtual Machine compatible address. Note: For BTC checks, this EVM address is used, which may not correspond to a standard BTC derivation path from the seed phrase.'),
  walletType: z.string().describe('The type of wallet (e.g., Ethereum Virtual Machine).'),
  balances: z.array(BalanceDetailSchema).describe('An array of balances found for different cryptocurrencies.'),
  wordCount: z.number().describe('The number of words in the seed phrase.'),
});

const GenerateAndCheckSeedPhrasesOutputSchema = z.array(SingleSeedPhraseResultSchema);
export type GenerateAndCheckSeedPhrasesOutput = z.infer<typeof GenerateAndCheckSeedPhrasesOutputSchema>;

const ALLOWED_WORD_COUNTS: Array<12 | 15 | 18 | 21 | 24> = [12, 15, 18, 21, 24];
const BLOCKCYPHER_COINS: string[] = ['eth', 'btc', 'ltc', 'doge', 'dash']; // Removed bch as ethers.js formatUnits might not directly support its decimals and BlockCypher usage with EVM address for BCH is less common.

interface AlchemyChainInfo {
  id: string;
  name: string;
  symbol: string;
  endpointFragment: string;
  displayName: string;
}
const ALCHEMY_EVM_CHAINS_FLOW: AlchemyChainInfo[] = [
  { id: 'eth', name: 'Ethereum', symbol: 'ETH', endpointFragment: 'eth-mainnet', displayName: 'ETH' },
  { id: 'polygon', name: 'Polygon', symbol: 'MATIC', endpointFragment: 'polygon-mainnet', displayName: 'MATIC' },
  { id: 'arbitrum', name: 'Arbitrum One', symbol: 'ETH', endpointFragment: 'arb-mainnet', displayName: 'ETH (Arbitrum)' },
  { id: 'optimism', name: 'Optimism', symbol: 'ETH', endpointFragment: 'opt-mainnet', displayName: 'ETH (Optimism)' },
  { id: 'base', name: 'Base', symbol: 'ETH', endpointFragment: 'base-mainnet', displayName: 'ETH (Base)' },
];

function generateRandomSeedPhrase(wordCount: 12 | 15 | 18 | 21 | 24): string {
  let entropyBytes: number;
  switch (wordCount) {
    case 12: entropyBytes = 16; break;
    case 15: entropyBytes = 20; break;
    case 18: entropyBytes = 24; break;
    case 21: entropyBytes = 28; break;
    case 24: entropyBytes = 32; break;
    default:
      console.error(`Invalid word count for seed phrase generation: ${wordCount}. Defaulting to 12 words.`);
      entropyBytes = 16;
  }
  const randomEntropy = ethers.randomBytes(entropyBytes);
  const mnemonic = ethers.Mnemonic.fromEntropy(randomEntropy);
  return mnemonic.phrase;
}

async function deriveAddressAndCheckBalance(
  seedPhrase: string,
  wordCount: number,
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
  blockstreamApiKey?: string
): Promise<z.infer<typeof SingleSeedPhraseResultSchema> | null> {
  try {
    const wallet = ethers.Wallet.fromPhrase(seedPhrase);
    const derivedAddress = wallet.address;
    const walletType = 'Ethereum Virtual Machine';
    const foundBalances: Array<z.infer<typeof BalanceDetailSchema>> = [];

    // Try Etherscan API (ETH mainnet only)
    if (etherscanApiKey) {
      try {
        const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
        const balanceBigInt = await provider.getBalance(derivedAddress);
        const balanceEth = ethers.formatEther(balanceBigInt);
        const balance = parseFloat(balanceEth);
        if (balance > 0) {
          foundBalances.push({
            cryptoName: 'ETH',
            balance,
            dataSource: 'Etherscan API',
          });
        }
      } catch (etherscanError: any) {
        console.warn(`Etherscan API error for ${derivedAddress}: ${etherscanError.message}.`);
      }
    }

    // Try BlockCypher API for multiple coins
    if (blockcypherApiKey) {
      for (const coin of BLOCKCYPHER_COINS) {
        try {
          // Note: BlockCypher for BTC using an EVM address might not be accurate for typical BTC wallets.
          const response = await fetch(`https://api.blockcypher.com/v1/${coin}/main/addrs/${derivedAddress}/balance?token=${blockcypherApiKey}`);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Unknown error parsing BlockCypher error for ${coin.toUpperCase()}` }));
            console.warn(`BlockCypher API error for ${derivedAddress} (${coin.toUpperCase()}): ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}.`);
            continue;
          }
          const data = await response.json();
          const balanceInSmallestUnit = BigInt(data.final_balance || data.balance || 0);
          let balanceCoin = 0;
          if (balanceInSmallestUnit > 0) {
            const decimals = (coin.toLowerCase() === 'eth') ? 18 : 8; // Common decimals for BTC, LTC, DOGE, DASH
            balanceCoin = parseFloat(ethers.formatUnits(balanceInSmallestUnit, decimals));
          }
          if (balanceCoin > 0) {
            foundBalances.push({
              cryptoName: coin.toUpperCase(),
              balance: balanceCoin,
              dataSource: 'BlockCypher API',
            });
          }
        } catch (blockcypherError: any) {
          console.warn(`BlockCypher API error for ${derivedAddress} (${coin.toUpperCase()}): ${blockcypherError.message}.`);
        }
      }
    }

    // Try Alchemy API for multiple EVM chains
    if (alchemyApiKey) {
      for (const chain of ALCHEMY_EVM_CHAINS_FLOW) {
        try {
            const alchemyUrl = `https://${chain.endpointFragment}.g.alchemy.com/v2/${alchemyApiKey}`;
            const requestBody = {
                jsonrpc: "2.0",
                id: Date.now() + Math.random(),
                method: "eth_getBalance",
                params: [derivedAddress, "latest"],
            };
            const response = await fetch(alchemyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Unknown Alchemy error on ${chain.name}` }));
                console.warn(`Alchemy API error for ${derivedAddress} on ${chain.name}: ${response.status} ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
                continue;
            }
            
            const data = await response.json();
            if (data.result) {
                const balanceNative = ethers.formatUnits(BigInt(data.result), 18);
                const balance = parseFloat(balanceNative);
                if (balance > 0) {
                    foundBalances.push({
                        cryptoName: chain.displayName,
                        balance,
                        dataSource: 'Alchemy API',
                    });
                }
            } else if (data.error) {
                 console.warn(`Alchemy API returned error for ${derivedAddress} on ${chain.name}: ${data.error.message}`);
            }
        } catch (alchemyError: any) {
            console.warn(`Alchemy API error for ${derivedAddress} on ${chain.name}: ${alchemyError.message}.`);
        }
      }
    }

    // Try Blockstream API (BTC mainnet only)
    // Note: Blockstream public API usually doesn't require a key.
    // Using an EVM-derived address for BTC check has limitations.
    if (blockstreamApiKey !== undefined) { // Check if the param was intended to be used, even if key not functional
      try {
        const response = await fetch(`https://blockstream.info/api/address/${derivedAddress}`);
        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown Blockstream error");
          if (response.status === 400 && errorText.toLowerCase().includes("invalid bitcoin address")) {
             console.warn(`Blockstream API: Address ${derivedAddress} is not a valid Bitcoin address.`);
          } else {
             console.warn(`Blockstream API error for ${derivedAddress}: ${response.status} ${response.statusText} - ${errorText}`);
          }
        } else {
          const data = await response.json();
          const fundedSatoshis = BigInt(data.chain_stats?.funded_txo_sum || 0);
          const spentSatoshis = BigInt(data.chain_stats?.spent_txo_sum || 0);
          const balanceSatoshis = fundedSatoshis - spentSatoshis;
          let balanceBtc = 0;
          if (balanceSatoshis > 0) {
            balanceBtc = parseFloat(ethers.formatUnits(balanceSatoshis, 8)); // BTC has 8 decimal places
          }
          if (balanceBtc > 0) {
            foundBalances.push({
              cryptoName: 'BTC',
              balance: balanceBtc,
              dataSource: 'Blockstream API',
            });
          }
        }
      } catch (blockstreamError: any) {
        console.warn(`Blockstream API error for ${derivedAddress}: ${blockstreamError.message}.`);
      }
    }
    
    if (foundBalances.length > 0) {
      return {
        seedPhrase,
        derivedAddress,
        walletType,
        balances: foundBalances,
        wordCount,
      };
    }
    return null;

  } catch (error: any) {
    if (error.message?.toLowerCase().includes('invalid mnemonic')) {
      console.warn(`Invalid seed phrase format encountered: "${seedPhrase.substring(0,15)}..."`);
    } else {
      console.error(`Error deriving address for seed phrase "${seedPhrase.substring(0,15)}...": ${error.message}`);
    }
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
    const { numSeedPhrases, etherscanApiKey, blockcypherApiKey, alchemyApiKey, blockstreamApiKey } = input;
    const results: GenerateAndCheckSeedPhrasesOutput = [];

    if (!etherscanApiKey && !blockcypherApiKey && !alchemyApiKey && blockstreamApiKey === undefined) {
        console.warn("No API keys/indicators provided for generateAndCheckSeedPhrasesFlow. Balances will not be fetched realistically.");
    }

    let phrasesGeneratedAndChecked = 0;
    
    while (phrasesGeneratedAndChecked < numSeedPhrases) {
      const randomWordCountIndex = Math.floor(Math.random() * ALLOWED_WORD_COUNTS.length);
      const currentWordCount = ALLOWED_WORD_COUNTS[randomWordCountIndex];
      const seedPhrase = generateRandomSeedPhrase(currentWordCount);
      phrasesGeneratedAndChecked++;
      
      if (etherscanApiKey || blockcypherApiKey || alchemyApiKey || blockstreamApiKey !== undefined) {
        const result = await deriveAddressAndCheckBalance(
            seedPhrase,
            currentWordCount,
            etherscanApiKey,
            blockcypherApiKey,
            alchemyApiKey,
            blockstreamApiKey
        );
        if (result && result.balances.length > 0 && result.balances.some(b => b.balance > 0)) {
          results.push(result);
        }
      }
    }
    console.log(`Flow: Generated and checked ${phrasesGeneratedAndChecked} phrases. Found ${results.length} with at least one positive balance.`);
    return results;
  }
);

    