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
  isRealData: boolean; // True if fetched from a real API, false if simulated
  dataSource: 'Etherscan API' | 'BlockCypher API' | 'Simulated Fallback'; // To indicate source
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
 * Tries Etherscan first, then BlockCypher if respective API keys are provided.
 * Falls back to simulation if API calls fail or no keys are provided.
 *
 * @param address The Ethereum address to fetch the balance for.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @returns A Promise that resolves with the address balance and data source.
 * @throws If an error occurs during fetching that isn't handled by fallback.
 */
export async function fetchAddressBalance(
  address: string,
  etherscanApiKey?: string,
  blockcypherApiKey?: string
): Promise<AddressBalanceResult> {
  console.log(`Fetching balance for address: ${address}. Etherscan key: ${!!etherscanApiKey}, BlockCypher key: ${!!blockcypherApiKey}`);

  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid Ethereum address provided: ${address}.`);
  }

  // Try Etherscan API
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
        dataSource: 'Etherscan API',
      };
    } catch (error: any) {
      console.error(`Etherscan API error for ${address}: ${error.message}. Trying BlockCypher or falling back to simulation.`);
      // Fall through to BlockCypher or simulation
    }
  }

  // Try BlockCypher API
  if (blockcypherApiKey) {
    try {
      const response = await fetch(`https://api.blockcypher.com/v1/eth/main/addrs/${address}/balance?token=${blockcypherApiKey}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(`BlockCypher API error: ${response.status} ${response.statusText} - ${errorData.error || JSON.stringify(errorData)}`);
      }
      const data = await response.json();
      // BlockCypher returns balance in Wei as a number.
      const balanceEth = ethers.formatEther(BigInt(data.balance));
      console.log(`Real balance for ${address} from BlockCypher: ${balanceEth} ETH`);
      return {
        address,
        balance: parseFloat(balanceEth),
        currency: 'ETH',
        isRealData: true,
        dataSource: 'BlockCypher API',
      };
    } catch (error: any) {
      console.error(`BlockCypher API error for ${address}: ${error.message}. Falling back to simulation.`);
      // Fall through to simulation
    }
  }

  // Simulation fallback
  console.log(`Simulating balance for ${address} as API calls failed or keys not provided.`);
  const delay = Math.random() * 700 + 300; // 300ms to 1000ms delay
  await new Promise(resolve => setTimeout(resolve, delay));

  if (Math.random() < 0.02) { // 2% chance of simulated error if we reach here
    console.warn(`Simulated network error during balance fetch for address: ${address}.`);
    throw new Error(`Simulated network error: Failed to fetch balance for ${address}. (Address Balance Simulation)`);
  }

  const balance = parseFloat((Math.random() * 15).toFixed(4));
  const currency = 'ETH';

  console.log(`Simulated balance for ${address}: ${balance} ${currency}`);
  return {
    address,
    balance,
    currency,
    isRealData: false,
    dataSource: 'Simulated Fallback',
  };
}


/**
 * Processes a list of seed phrases: derives addresses and fetches their ETH balances.
 * Uses Etherscan or BlockCypher API if keys are provided, otherwise simulates balances.
 *
 * @param seedPhrases An array of seed phrases.
 * @param etherscanApiKey (Optional) The Etherscan API key.
 * @param blockcypherApiKey (Optional) The BlockCypher API key.
 * @returns A Promise that resolves with an array of ProcessedWalletInfo.
 */
export async function processSeedPhrasesAndFetchBalances(
  seedPhrases: string[],
  etherscanApiKey?: string,
  blockcypherApiKey?: string
): Promise<ProcessedWalletInfo[]> {
  const results: ProcessedWalletInfo[] = [];

  for (const phrase of seedPhrases) {
    let derivedAddress: string | null = null;
    let walletType: string | null = 'Ethereum Virtual Machine';
    let cryptoName: string | null = 'ETH';
    let balanceData: AddressBalanceResult | null = null;
    let error: string | null = null;
    let derivationError: string | null = null;

    try {
      const wallet = ethers.Wallet.fromPhrase(phrase);
      derivedAddress = wallet.address;
      console.log(`Derived address: ${derivedAddress} for phrase starting with ${phrase.substring(0, 5)}...`);

      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      
      balanceData = await fetchAddressBalance(derivedAddress, etherscanApiKey, blockcypherApiKey);

    } catch (e: any) {
      console.error(`Error processing seed phrase "${phrase.substring(0,5)}...": ${e.message}`);
      if (!derivedAddress) {
        derivationError = e.message?.split('(')[0]?.trim() || 'Could not derive address';
        error = `Derivation failed: ${derivationError}`;
        walletType = null;
        cryptoName = null;
      } else {
        error = `Balance fetch failed: ${e.message}`;
      }
      if (!balanceData && derivedAddress) {
        // If an error occurred and balanceData is still null, ensure a fallback entry is created.
        balanceData = {
          address: derivedAddress,
          balance: 0,
          currency: 'ETH',
          isRealData: false,
          dataSource: 'Simulated Fallback', // Mark as simulated due to error
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
