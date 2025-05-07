// @ts-nocheck
'use server';

import { ethers } from 'ethers';

/**
 * Represents the balance data fetched for a specific address.
 */
export interface AddressBalanceResult {
  address: string;
  balance: number;
  currency: string; // e.g., ETH, BTC
  isRealData: boolean; // True if fetched from a real API, false if simulated
  dataSource: 'Etherscan API' | 'BlockCypher API' | 'Alchemy API' | 'Simulated Fallback' | 'N/A' | 'Unknown'; // To indicate source
}

/**
 * Represents the processed data for a single seed phrase, including derived address and balance.
 */
export interface ProcessedWalletInfo {
  seedPhrase: string;
  derivedAddress: string | null;
  walletType: string | null; // e.g., 'Ethereum Virtual Machine'
  cryptoName: string | null; // e.g., 'ETH', 'BTC' - This will come from AddressBalanceResult.currency
  balanceData: AddressBalanceResult | null;
  error: string | null; // General error for the row, or balance fetch error
  derivationError: string | null; // Specific error during address derivation
}

const BLOCKCYPHER_COINS_ACTIONS: string[] = ['eth', 'btc', 'ltc', 'doge', 'dash'];


/**
 * Fetches the balance for a given Ethereum address.
 * Tries Etherscan first (ETH), then BlockCypher (multiple cryptos), then Alchemy (ETH).
 * Falls back to simulation if API calls fail or no keys are provided.
 *
 * @param address The Ethereum address to fetch the balance for.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @param alchemyApiKey (Optional) The Alchemy API key.
 * @returns A Promise that resolves with the address balance and data source.
 * @throws If an error occurs during fetching that isn't handled by fallback.
 */
export async function fetchAddressBalance(
  address: string,
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
): Promise<AddressBalanceResult> {
  console.log(`Fetching balance for address: ${address}. Etherscan: ${!!etherscanApiKey}, BlockCypher: ${!!blockcypherApiKey}, Alchemy: ${!!alchemyApiKey}`);

  if (!ethers.isAddress(address)) { // This check is specific to Ethereum addresses
    console.warn(`Address ${address} is not a valid Ethereum checksum address. Proceeding with balance checks, but this might fail for ETH-specific APIs.`);
    // Not throwing error here to allow BlockCypher to try with non-ETH chains if the address format is compatible by chance.
  }

  // Try Etherscan API (ETH only)
  if (etherscanApiKey) {
    try {
      const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
      const balanceBigInt = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balanceBigInt);
      console.log(`Balance for ${address} from Etherscan: ${balanceEth} ETH`);
      if (parseFloat(balanceEth) > 0) {
        return {
          address,
          balance: parseFloat(balanceEth),
          currency: 'ETH',
          isRealData: true,
          dataSource: 'Etherscan API',
        };
      }
    } catch (error: any) {
      console.error(`Etherscan API error for ${address}: ${error.message}. Trying next available API.`);
    }
  }

  // Try BlockCypher API for multiple coins
  if (blockcypherApiKey) {
    for (const coin of BLOCKCYPHER_COINS_ACTIONS) {
      try {
        // Note: Using an EVM address (address) to query non-EVM chains on BlockCypher
        // might not yield meaningful results or could error.
        const response = await fetch(`https://api.blockcypher.com/v1/${coin}/main/addrs/${address}/balance?token=${blockcypherApiKey}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `Unknown error parsing BlockCypher error for ${coin.toUpperCase()}` }));
          console.warn(`BlockCypher API error for ${address} (${coin.toUpperCase()}): ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}.`);
          continue; // Try next coin
        }
        const data = await response.json();
        const balanceInSmallestUnit = BigInt(data.final_balance || data.balance || 0);
        
        let balanceCoin = 0;
        if (balanceInSmallestUnit > 0) {
           // For simplicity, assuming 18 decimals for ETH-like and 8 for BTC-like if not ETH
           // This is a simplification; real applications would need precise decimal counts per asset.
          const decimals = (coin.toLowerCase() === 'eth') ? 18 : 8; // Common decimals
          balanceCoin = parseFloat(ethers.formatUnits(balanceInSmallestUnit, decimals));
        }

        console.log(`Balance for ${address} from BlockCypher (${coin.toUpperCase()}): ${balanceCoin} ${coin.toUpperCase()}`);
        if (balanceCoin > 0) {
          return {
            address,
            balance: balanceCoin,
            currency: coin.toUpperCase(),
            isRealData: true,
            dataSource: 'BlockCypher API',
          };
        }
      } catch (error: any) {
        console.error(`BlockCypher API error for ${address} (${coin.toUpperCase()}): ${error.message}. Trying next coin.`);
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
            params: [address, "latest"],
        };
        const response = await fetch(alchemyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown Alchemy error" }));
            throw new Error(`Alchemy API error: ${response.status} ${response.statusText} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        if (data.result) {
            const balanceEth = ethers.formatEther(BigInt(data.result));
            console.log(`Balance for ${address} from Alchemy: ${balanceEth} ETH`);
             if (parseFloat(balanceEth) > 0) {
                return {
                    address,
                    balance: parseFloat(balanceEth),
                    currency: 'ETH',
                    isRealData: true,
                    dataSource: 'Alchemy API',
                };
            }
        } else if (data.error) {
            throw new Error(`Alchemy API returned error: ${data.error.message}`);
        } else {
            throw new Error(`Alchemy API returned unexpected response: ${JSON.stringify(data)}`);
        }
    } catch (error: any) {
        console.error(`Alchemy API error for ${address}: ${error.message}.`);
    }
  }

  // If here, all real API attempts failed or returned 0 balance.
  // Fallback to simulation only if specifically no API keys are available or all failed.
  // The prompt implies that if keys are provided, it should not simulate, but rather reflect failure.
  if (!etherscanApiKey && !blockcypherApiKey && !alchemyApiKey) {
    console.log(`Simulating balance for ${address} as no API keys were provided.`);
    // Fall through to simulation logic from original code if needed, or just return N/A
  } else {
    console.log(`All API attempts for ${address} failed or returned zero balance.`);
  }
  
  // Default return if no balance found through APIs
  return {
    address,
    balance: 0,
    currency: 'N/A', // Or the last attempted currency
    isRealData: false, // Since no real data was successfully fetched and > 0
    dataSource: 'N/A', // Or 'Unknown' if all API attempts failed
  };
}


/**
 * Processes a list of seed phrases: derives addresses and fetches their balances.
 * Uses Etherscan, BlockCypher, or Alchemy API if keys are provided.
 *
 * @param seedPhrases An array of seed phrases.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @param alchemyApiKey (Optional) The Alchemy API key.
 * @returns A Promise that resolves with an array of ProcessedWalletInfo.
 */
export async function processSeedPhrasesAndFetchBalances(
  seedPhrases: string[],
  etherscanApiKey?: string,
  blockcypherApiKey?: string,
  alchemyApiKey?: string,
): Promise<ProcessedWalletInfo[]> {
  const results: ProcessedWalletInfo[] = [];

  for (const phrase of seedPhrases) {
    let derivedAddress: string | null = null;
    let walletType: string | null = 'Ethereum Virtual Machine'; // This is EVM specific from ethers.js
    let cryptoName: string | null = null; 
    let balanceData: AddressBalanceResult | null = null;
    let error: string | null = null;
    let derivationError: string | null = null;

    try {
      const wallet = ethers.Wallet.fromPhrase(phrase);
      derivedAddress = wallet.address;
      console.log(`Derived address: ${derivedAddress} for phrase starting with ${phrase.substring(0, 5)}...`);

      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); // Small delay
      
      balanceData = await fetchAddressBalance(derivedAddress, etherscanApiKey, blockcypherApiKey, alchemyApiKey);

      if (balanceData && balanceData.balance > 0) {
        cryptoName = balanceData.currency; // Set cryptoName from the successful balance check
      } else {
        // If balance is 0 or fetch failed, cryptoName remains null or we can default it
        cryptoName = balanceData?.currency !== 'N/A' ? balanceData.currency : 'ETH'; // Default to ETH if no specific currency found
        // Ensure balanceData is not null if fetchAddressBalance returned a zero-balance record
        if (!balanceData && derivedAddress) {
            balanceData = { address: derivedAddress, balance: 0, currency: cryptoName, isRealData: false, dataSource: 'N/A' };
        } else if (balanceData && balanceData.balance === 0) {
            // It's already set, just ensure cryptoName is consistent
             cryptoName = balanceData.currency;
        }
      }

    } catch (e: any) {
      console.error(`Error processing seed phrase "${phrase.substring(0,5)}...": ${e.message}`);
      if (!derivedAddress) {
        derivationError = e.message?.split('(')[0]?.trim() || 'Could not derive address';
        error = `Derivation failed: ${derivationError}`;
        walletType = null;
        cryptoName = null;
      } else {
        error = `Balance fetch failed: ${e.message}`;
         if (!balanceData) { // Ensure balanceData is at least an error object
            balanceData = { address: derivedAddress, balance: 0, currency: 'N/A', isRealData: false, dataSource: 'N/A' };
        }
      }
    }

    results.push({
      seedPhrase: phrase,
      derivedAddress,
      walletType,
      cryptoName: balanceData?.balance > 0 ? balanceData.currency : (cryptoName || 'N/A'), // Reflect actual crypto if balance found
      balanceData,
      error,
      derivationError,
    });
  }
  // Filter out results that don't have a positive balance from real data sources
  // Or if no keys provided, it means no real check was done, so filter all (as per original flow logic)
  if (etherscanApiKey || blockcypherApiKey || alchemyApiKey) {
    return results.filter(r => r.balanceData && r.balanceData.balance > 0 && r.balanceData.isRealData);
  }
  return []; // If no API keys, return empty as no real check was possible
}
