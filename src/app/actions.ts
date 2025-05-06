// @ts-nocheck
'use server';

import { ethers } from 'ethers';

/**
 * Represents the balance data fetched for a specific address.
 */
export interface AddressBalanceResult {
  address: string;
  balance: number;
  currency: string; // e.g., ETH
  isRealData: boolean; // True if fetched from Etherscan, false if simulated due to error or no API key
}

/**
 * Represents the processed data for a single seed phrase, including derived address and balance.
 */
export interface ProcessedWalletInfo {
  seedPhrase: string;
  derivedAddress: string | null;
  walletType: string | null; // e.g., 'Ethereum Virtual Machine'
  cryptoName: string | null; // e.g., 'ETH'
  balanceData: AddressBalanceResult | null;
  error: string | null; // General error for the row, or balance fetch error
  derivationError: string | null; // Specific error during address derivation
}


/**
 * Fetches the ETH balance for a given Ethereum address.
 * If an Etherscan API key is provided, it attempts to fetch the real balance.
 * Otherwise, or if the API call fails, it falls back to simulating the balance.
 *
 * @param address The Ethereum address to fetch the balance for.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @returns A Promise that resolves with the address balance (real or simulated) and a flag indicating data source.
 * @throws If an error occurs during fetching or simulation that isn't handled by fallback.
 */
export async function fetchAddressBalance(address: string, etherscanApiKey?: string): Promise<AddressBalanceResult> {
  console.log(`Fetching balance for address: ${address}${etherscanApiKey ? ` using Etherscan API key.` : ' (simulation mode).'}`);

  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid Ethereum address provided: ${address}.`);
  }

  if (etherscanApiKey) {
    try {
      const provider = new ethers.EtherscanProvider("mainnet", etherscanApiKey);
      const balanceBigInt = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balanceBigInt);
      console.log(`Real balance for ${address} from Etherscan: ${balanceEth} ETH`);
      return {
        address,
        balance: parseFloat(balanceEth),
        currency: 'ETH',
        isRealData: true,
      };
    } catch (error: any) {
      console.error(`Etherscan API error for ${address}: ${error.message}. Falling back to simulation.`);
      // Fall through to simulation if Etherscan API fails
    }
  }

  // Simulation fallback
  console.log(`Simulating balance for ${address} as Etherscan API key not provided or API call failed.`);
  // Simulate network delay
  const delay = Math.random() * 700 + 300; // 300ms to 1000ms delay
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate potential network errors occasionally for simulation
  if (Math.random() < 0.04) { // 4% chance of error for simulation
    console.warn(`Simulated network error during balance fetch for address: ${address}.`);
    throw new Error(`Simulated network error: Failed to fetch balance for ${address}. (Address Balance Simulation)`);
  }

  // Generate random balance data (e.g., ETH)
  const balance = parseFloat((Math.random() * 15).toFixed(4)); // Random ETH balance between 0 and 15
  const currency = 'ETH'; // Simulating ETH balance

  console.log(`Simulated balance for ${address}: ${balance} ${currency}`);

  return {
    address,
    balance,
    currency,
    isRealData: false,
  };
}


/**
 * Processes a list of seed phrases: derives addresses and fetches their ETH balances.
 * Uses Etherscan API if key is provided, otherwise simulates balances.
 *
 * @param seedPhrases An array of seed phrases.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @returns A Promise that resolves with an array of ProcessedWalletInfo.
 */
export async function processSeedPhrasesAndFetchBalances(seedPhrases: string[], etherscanApiKey?: string): Promise<ProcessedWalletInfo[]> {
  const results: ProcessedWalletInfo[] = [];

  for (const phrase of seedPhrases) {
    let derivedAddress: string | null = null;
    let walletType: string | null = 'Ethereum Virtual Machine';
    let cryptoName: string | null = 'ETH';
    let balanceData: AddressBalanceResult | null = null;
    let error: string | null = null;
    let derivationError: string | null = null;

    try {
      // Derive address
      const wallet = ethers.Wallet.fromPhrase(phrase);
      derivedAddress = wallet.address;
      console.log(`Derived address: ${derivedAddress} for phrase starting with ${phrase.substring(0, 5)}...`);

      // Simulate a small delay before fetching balance
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      
      // Fetch balance (real or simulated)
      balanceData = await fetchAddressBalance(derivedAddress, etherscanApiKey);

    } catch (e: any) {
      console.error(`Error processing seed phrase "${phrase.substring(0,5)}...": ${e.message}`);
      if (!derivedAddress) { // Error likely during derivation
        derivationError = e.message?.split('(')[0]?.trim() || 'Could not derive address';
        error = `Derivation failed: ${derivationError}`;
        walletType = null; // No wallet type if derivation fails
        cryptoName = null; // No crypto name if derivation fails
      } else { // Error likely during balance fetch, but derivation was successful
        error = `Balance fetch failed: ${e.message}`;
        // Keep derivedAddress, walletType, cryptoName as they were successfully determined
      }
       // If balanceData is still null and an error occurred, create a simulated error entry for balance
      if (!balanceData && derivedAddress) {
        balanceData = {
          address: derivedAddress,
          balance: 0,
          currency: 'ETH',
          isRealData: false, // Mark as simulated due to error
        };
      }
    }

    results.push({
      seedPhrase: phrase,
      derivedAddress,
      walletType,
      cryptoName,
      balanceData,
      error,
      derivationError,
    });
  }
  return results;
}
